import type {
  SceneData,
  NodeData,
  StrutData,
  PanelData,
  WidgetData,
  WidgetKind,
  Vec3,
  FaceName,
  StrutKind,
  Attachments,
} from "./types";
import { CURRENT_SCENE_VERSION, DEFAULT_LAYER_ID, oppositeFace, strutWidth } from "./constants";
import {
  faceNormal,
  getAttachmentPosition,
  getCorner45PlaneNormal,
  getStrutRoutePoints,
  isCornerStrutKind,
  RULE_EPSILON,
  cross,
  dot,
  length,
  normalize,
  sub,
} from "./rules";
import {
  validateSceneNodePlacement,
  validateStrutPlacement,
  validateWidgetPlacement,
  planStraightStrutRun,
  findStraightStrutConflicts,
  getStraightStrutTarget,
  validateNodePlacement,
  type PlacementResult,
} from "./placement";
import {
  createPanelBrushGeometry as solvePanelBrushGeometry,
  type PanelBrushGeometry,
  type PanelBrushSegment,
} from "./brush";

export function createNode(position: Vec3, layerId?: string): NodeData {
  return {
    id: crypto.randomUUID(),
    layerId,
    position: { ...position },
    attachments: createEmptyAttachments(),
  };
}

function createEmptyAttachments(): Attachments {
  return {
    top: { occupied: false },
    bottom: { occupied: false },
    front: { occupied: false },
    back: { occupied: false },
    left: { occupied: false },
    right: { occupied: false },
  };
}

function samePosition(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < RULE_EPSILON &&
    Math.abs(a.y - b.y) < RULE_EPSILON &&
    Math.abs(a.z - b.z) < RULE_EPSILON;
}

export function normalizeSceneAttachments(scene: SceneData): SceneData {
  const { accessories: legacyAccessories, ...currentScene } = scene;
  const widgets = { ...(scene.widgets ?? {}) };
  for (const accessory of Object.values(legacyAccessories ?? {})) {
    const kind = legacyWidgetKind(accessory.definitionId);
    if (!kind || widgets[accessory.id]) continue;
    widgets[accessory.id] = {
      id: accessory.id,
      kind,
      nodeId: accessory.nodeId,
      face: accessory.face,
      rotation: accessory.rotation,
    };
  }
  const layers = normalizeLayers(scene.layers);
  const validLayerIds = new Set(layers.map((layer) => layer.id));
  const layerId = (candidate?: string) => validLayerIds.has(candidate ?? "")
    ? candidate
    : DEFAULT_LAYER_ID;
  const nodes: Record<string, NodeData> = {};

  for (const [id, node] of Object.entries(scene.nodes)) {
    nodes[id] = {
      ...node,
      layerId: layerId(node.layerId),
      attachments: createEmptyAttachments(),
    };
  }

  for (const widget of Object.values(widgets)) {
    const node = nodes[widget.nodeId];
    if (!node) continue;
    if (node.attachments[widget.face].occupied) continue;

    node.attachments = {
      ...node.attachments,
      [widget.face]: {
        occupied: true,
        occupantId: widget.id,
        occupantType: "widget",
      },
    };
  }

  for (const strut of Object.values(scene.struts)) {
    const nodeA = nodes[strut.nodeA];
    const nodeB = nodes[strut.nodeB];

    if (nodeA) {
      nodeA.attachments = {
        ...nodeA.attachments,
        [strut.faceA]: {
          occupied: true,
          occupantId: strut.id,
          occupantType: "strut",
        },
      };
    }

    if (nodeB) {
      nodeB.attachments = {
        ...nodeB.attachments,
        [strut.faceB]: {
          occupied: true,
          occupantId: strut.id,
          occupantType: "strut",
        },
      };
    }
  }

  return {
    ...currentScene,
    schemaVersion: CURRENT_SCENE_VERSION,
    layers,
    nodes,
    struts: Object.fromEntries(Object.entries(scene.struts).map(([id, strut]) => [
      id,
      { ...strut, layerId: layerId(strut.layerId) },
    ])),
    panels: Object.fromEntries(Object.entries(scene.panels ?? {}).map(([id, panel]) => [
      id,
      { ...panel, layerId: layerId(panel.layerId) },
    ])),
    widgets: Object.fromEntries(Object.entries(widgets).map(([id, widget]) => [
      id,
      { ...widget, layerId: layerId(widget.layerId) },
    ])),
  };
}

function normalizeLayers(layers?: SceneData["layers"]): NonNullable<SceneData["layers"]> {
  const seen = new Set<string>();
  const normalized = (layers ?? []).filter((layer) => {
    if (!layer?.id || seen.has(layer.id)) return false;
    seen.add(layer.id);
    return true;
  }).map((layer) => ({
    id: layer.id,
    name: layer.name.trim() || "Layer",
    visible: layer.visible !== false,
  }));
  const defaultLayer = normalized.find((layer) => layer.id === DEFAULT_LAYER_ID);
  return [
    defaultLayer ?? { id: DEFAULT_LAYER_ID, name: "Default", visible: true },
    ...normalized.filter((layer) => layer.id !== DEFAULT_LAYER_ID),
  ];
}

export function addNodeToScene(scene: SceneData, node: NodeData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    nodes: { ...scene.nodes, [node.id]: node },
  });
}

export function hasNodeContact(scene: SceneData): boolean {
  const result = validateSceneNodePlacement(scene);
  return !result.valid && result.reason === "node-contact";
}

export function removeNodeFromScene(scene: SceneData, nodeId: string): SceneData {
  const newNodes = { ...scene.nodes };
  delete newNodes[nodeId];

  const newStruts = { ...scene.struts };
  const newPanels = { ...(scene.panels ?? {}) };
  const newWidgets = { ...(scene.widgets ?? {}) };

  for (const [id, strut] of Object.entries(newStruts)) {
    if (strut.nodeA === nodeId || strut.nodeB === nodeId) {
      delete newStruts[id];
      for (const [panelId, panel] of Object.entries(newPanels)) {
        if (panel.strutIds.includes(id)) delete newPanels[panelId];
      }
    }
  }

  for (const [id, widget] of Object.entries(newWidgets)) {
    if (widget.nodeId === nodeId) {
      delete newWidgets[id];
    }
  }

  return normalizeSceneAttachments({
    ...scene,
    nodes: newNodes,
    struts: newStruts,
    panels: newPanels,
    widgets: newWidgets,
  });
}

export function canConnectStrut(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
  kind: StrutKind = "straight",
): boolean {
  return validateStrutPlacement(scene, { nodeA, faceA, nodeB, faceB, kind }).valid;
}

export function canConnectCorner45Strut(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
): boolean {
  return validateStrutPlacement(scene, {
    nodeA,
    faceA,
    nodeB,
    faceB,
    kind: "corner45",
  }).valid;
}

export function addStrutToScene(scene: SceneData, strut: StrutData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    struts: { ...scene.struts, [strut.id]: strut },
  });
}

/** Place one or more intersection-aware straight runs as one atomic mutation. */
export function addStraightStrutRunsToScene(
  scene: SceneData,
  sourceNodeIds: string[],
  fromFace: FaceName,
  strutLength: number,
  layerId?: string,
): SceneData {
  let result = scene;
  for (const sourceNodeId of sourceNodeIds) {
    const source = result.nodes[sourceNodeId];
    if (!source) return scene;
    const targetPosition = getStraightStrutTarget(source, fromFace, strutLength);
    const conflicts = findStraightStrutConflicts(result, source.position, targetPosition, fromFace);
    if (conflicts.some((conflict) => conflict.kind === "overlap")) return scene;

    const crossedStruts = [...new Set(conflicts.map((conflict) => conflict.strutId))]
      .map((strutId) => result.struts[strutId])
      .filter((strut): strut is StrutData => Boolean(strut));
    for (const strut of crossedStruts) {
      result = removeStrutFromScene(result, strut.id);
    }

    const crossingPositions = conflicts
      .filter((conflict): conflict is typeof conflict & { position: Vec3 } => Boolean(conflict.position))
      .map((conflict) => conflict.position);
    for (const position of crossingPositions) {
      const existingNode = Object.values(result.nodes).find((node) =>
        samePosition(node.position, position));
      if (existingNode) continue;
      if (!validateNodePlacement(result, position).valid) return scene;
      result = addNodeToScene(result, createNode(position, layerId));
    }

    for (const crossedStrut of crossedStruts) {
      const rebuilt = materializeStraightRun(
        result,
        crossedStrut.nodeA,
        crossedStrut.faceA,
        crossedStrut.length,
        crossedStrut.layerId,
      );
      if (!rebuilt) return scene;
      result = rebuilt;
    }

    const placed = materializeStraightRun(result, sourceNodeId, fromFace, strutLength, layerId);
    if (!placed) return scene;
    result = placed;
  }

  return hasNodeContact(result) ? scene : result;
}

function materializeStraightRun(
  scene: SceneData,
  sourceNodeId: string,
  fromFace: FaceName,
  strutLength: number,
  layerId?: string,
): SceneData | null {
  const plan = planStraightStrutRun(scene, sourceNodeId, fromFace, strutLength);
  if (!plan) return null;

  let result = scene;
  const runNodes = plan.nodes.map((plannedNode) => {
    if (plannedNode.existingNodeId) {
      return result.nodes[plannedNode.existingNodeId];
    }
    const newNode = createNode(plannedNode.position, layerId);
    result = addNodeToScene(result, newNode);
    return newNode;
  });
  if (runNodes.some((node) => !node)) return null;

  const destinationFace = oppositeFace(fromFace);
  for (const segment of plan.segments) {
    const fromNode = runNodes[segment.fromIndex];
    const toNode = runNodes[segment.toIndex];
    if (!fromNode || !toNode) return null;
    const strut: StrutData = {
      id: crypto.randomUUID(),
      layerId,
      nodeA: fromNode.id,
      faceA: fromFace,
      nodeB: toNode.id,
      faceB: destinationFace,
      length: segment.length,
    };
    if (!canConnectStrut(result, strut.nodeA, strut.faceA, strut.nodeB, strut.faceB)) {
      return null;
    }
    result = addStrutToScene(result, strut);
  }
  return result;
}

export function removeStrutFromScene(scene: SceneData, strutId: string): SceneData {
  const strut = scene.struts[strutId];
  if (!strut) return scene;

  const newStruts = { ...scene.struts };
  delete newStruts[strutId];
  const newPanels = { ...(scene.panels ?? {}) };
  for (const [panelId, panel] of Object.entries(newPanels)) {
    if (panel.strutIds.includes(strutId)) delete newPanels[panelId];
  }

  return normalizeSceneAttachments({
    ...scene,
    struts: newStruts,
    panels: newPanels,
  });
}

export function canCreatePanel(scene: SceneData, strutIds: string[]): boolean {
  return validatePanelPlacement(scene, strutIds).valid;
}

/** Find the shortest deterministic closed strut loop containing one strut. */
export function getPanelLoopThroughStrut(scene: SceneData, strutId: string): string[] | null {
  const target = scene.struts[strutId];
  if (!target || target.nodeA === target.nodeB) return null;

  const adjacency = new Map<string, Array<{ nodeId: string; strutId: string }>>();
  for (const strut of Object.values(scene.struts)) {
    if (strut.id === strutId || strut.nodeA === strut.nodeB) continue;
    adjacency.set(strut.nodeA, [
      ...(adjacency.get(strut.nodeA) ?? []),
      { nodeId: strut.nodeB, strutId: strut.id },
    ]);
    adjacency.set(strut.nodeB, [
      ...(adjacency.get(strut.nodeB) ?? []),
      { nodeId: strut.nodeA, strutId: strut.id },
    ]);
  }
  for (const connections of adjacency.values()) {
    connections.sort((a, b) => a.strutId.localeCompare(b.strutId));
  }

  const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: target.nodeA, path: [] }];
  const visited = new Set([target.nodeA]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const connection of adjacency.get(current.nodeId) ?? []) {
      const path = [...current.path, connection.strutId];
      if (connection.nodeId === target.nodeB) {
        return path.length >= 2 ? [strutId, ...path] : null;
      }
      if (visited.has(connection.nodeId)) continue;
      visited.add(connection.nodeId);
      queue.push({ nodeId: connection.nodeId, path });
    }
  }
  return null;
}

export type PanelPlacementIssue = "invalid-loop" | "invalid-brush" | "side-occupied";

/** Validate the closed-loop constraint and optional side occupancy for a panel. */
export function validatePanelPlacement(
  scene: SceneData,
  strutIds: string[],
  side?: "top" | "bottom",
): PlacementResult<PanelPlacementIssue> {
  if (!getPanelLoop(scene, strutIds)) return { valid: false, reason: "invalid-loop" };
  if (side) {
    if (!getPanelBrushGeometry(scene, strutIds, side)) {
      return { valid: false, reason: "invalid-brush" };
    }
  } else if (
    !getPanelBrushGeometry(scene, strutIds, "top") &&
    !getPanelBrushGeometry(scene, strutIds, "bottom")
  ) {
    return { valid: false, reason: "invalid-brush" };
  }

  const targetIds = [...new Set(strutIds)].sort();
  const occupiedSides = new Set(Object.values(scene.panels ?? {}).flatMap((panel) => {
    const existingIds = [...new Set(panel.strutIds)].sort();
    const sameLoop = existingIds.length === targetIds.length &&
      existingIds.every((id, index) => id === targetIds[index]);
    return sameLoop ? [panel.side ?? "top"] : [];
  }));
  const occupied = side ? occupiedSides.has(side) : occupiedSides.size >= 2;
  return occupied ? { valid: false, reason: "side-occupied" } : { valid: true };
}

export function createPanelFromStruts(
  scene: SceneData,
  strutIds: string[],
  requestedSide?: "top" | "bottom",
): PanelData | null {
  const points = getPanelPoints(scene, strutIds);
  if (!points) return null;

  const sortedStrutIds = [...new Set(strutIds)].sort();
  const existingSides = new Set(Object.values(scene.panels ?? {}).flatMap((panel) => {
    const panelStruts = [...panel.strutIds].sort();
    const sameLoop = panelStruts.length === sortedStrutIds.length &&
      panelStruts.every((id, index) => id === sortedStrutIds[index]);
    return sameLoop ? [panel.side ?? "top"] : [];
  }));
  const side = requestedSide ??
    (existingSides.has("top") ? (existingSides.has("bottom") ? null : "bottom") : "top");
  if (!side) return null;
  if (!validatePanelPlacement(scene, sortedStrutIds, side).valid) return null;

  return {
    id: crypto.randomUUID(),
    strutIds: sortedStrutIds,
    side,
  };
}

export function addPanelToScene(scene: SceneData, panel: PanelData): SceneData {
  const panelSide = panel.side ?? "top";
  if (!validatePanelPlacement(scene, panel.strutIds, panelSide).valid) return scene;
  const panelStruts = [...new Set(panel.strutIds)].sort();
  const sideOccupied = Object.values(scene.panels ?? {}).some((existingPanel) => {
    const existingStruts = [...new Set(existingPanel.strutIds)].sort();
    return (existingPanel.side ?? "top") === panelSide &&
      existingStruts.length === panelStruts.length &&
      existingStruts.every((id, index) => id === panelStruts[index]);
  });
  if (sideOccupied) return scene;

  return normalizeSceneAttachments({
    ...scene,
    panels: { ...(scene.panels ?? {}), [panel.id]: panel },
  });
}

export function removePanelFromScene(scene: SceneData, panelId: string): SceneData {
  if (!scene.panels?.[panelId]) return scene;

  const panels = { ...scene.panels };
  delete panels[panelId];

  return normalizeSceneAttachments({ ...scene, panels });
}

export function flipPanelInScene(scene: SceneData, panelId: string): SceneData {
  const panel = scene.panels?.[panelId];
  if (!panel) return scene;

  const nextSide = panel.side === "bottom" ? "top" : "bottom";
  const panelStruts = [...new Set(panel.strutIds)].sort();
  const targetOccupied = Object.values(scene.panels).some((existingPanel) => {
    if (existingPanel.id === panelId || (existingPanel.side ?? "top") !== nextSide) return false;
    const existingStruts = [...new Set(existingPanel.strutIds)].sort();
    return existingStruts.length === panelStruts.length &&
      existingStruts.every((id, index) => id === panelStruts[index]);
  });
  if (targetOccupied) return scene;

  return normalizeSceneAttachments({
    ...scene,
    panels: {
      ...scene.panels,
      [panelId]: { ...panel, side: nextSide },
    },
  });
}

export function getPanelPoints(scene: SceneData, strutIds: string[]): Vec3[] | null {
  const loop = getPanelLoop(scene, strutIds);
  if (!loop) return null;

  return loop.nodePoints;
}

export function getPanelBrushGeometry(
  scene: SceneData,
  strutIds: string[],
  side: "top" | "bottom" = "top",
): PanelBrushGeometry | null {
  const loop = getPanelLoop(scene, strutIds);
  if (!loop) return null;

  const segments: PanelBrushSegment[] = loop.traversedStruts.flatMap((traversed) => {
    const route = getTraversedStrutRoute(scene, traversed);
    if (isCornerStrutKind(traversed.strut.kind)) {
      if (route.length < 4) return [];
      return [{
        from: route[1],
        to: route[route.length - 2],
        flatNormal: getCorner45PlaneNormal(traversed.strut.faceA, traversed.strut.faceB),
      }];
    }
    return route.slice(0, -1).map((from, index) => ({
      from,
      to: route[index + 1],
    }));
  });

  const panelPoints = segments.flatMap((segment) => [segment.from, segment.to]);
  const panelCenter = averagePositions(panelPoints);
  const assemblyCenter = averagePositions(Object.values(scene.nodes).map((node) => node.position));
  const outwardHint = {
    x: panelCenter.x - assemblyCenter.x,
    y: panelCenter.y - assemblyCenter.y,
    z: panelCenter.z - assemblyCenter.z,
  };
  const outwardDistance = Math.hypot(outwardHint.x, outwardHint.y, outwardHint.z);
  return solvePanelBrushGeometry(
    segments,
    strutWidth,
    side,
    outwardDistance > RULE_EPSILON ? outwardHint : undefined,
    getCoplanarSurfacePlane(loop.nodePoints, segments),
  );
}

function getCoplanarSurfacePlane(
  points: Vec3[],
  segments: PanelBrushSegment[],
): { normal: Vec3; constant: number } | undefined {
  if (points.length < 3) return undefined;
  const normal = normalize(cross(sub(points[1], points[0]), sub(points[2], points[0])));
  if (length(normal) < RULE_EPSILON) return undefined;
  const nodeConstant = dot(normal, points[0]);
  if (!points.every((point) => Math.abs(dot(normal, point) - nodeConstant) < RULE_EPSILON)) {
    return undefined;
  }

  // Node centers establish orientation, while the panel's mid-surface follows
  // the actual boundary runs. Corner-strut routes can be parallel to, but
  // offset from, the plane through their endpoint node centers.
  const constant = segments.reduce((sum, segment) => {
    const midpoint = {
      x: (segment.from.x + segment.to.x) / 2,
      y: (segment.from.y + segment.to.y) / 2,
      z: (segment.from.z + segment.to.z) / 2,
    };
    return sum + dot(normal, midpoint);
  }, 0) / segments.length;
  return { normal, constant };
}

function averagePositions(points: Vec3[]): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = points.reduce((result, point) => ({
    x: result.x + point.x,
    y: result.y + point.y,
    z: result.z + point.z,
  }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function getPanelLoop(
  scene: SceneData,
  strutIds: string[],
): { nodePoints: Vec3[]; traversedStruts: Array<{ strut: StrutData; fromNodeId: string }> } | null {
  const uniqueStrutIds = [...new Set(strutIds)];
  if (uniqueStrutIds.length < 3) return null;

  const struts: StrutData[] = [];
  const connectedStruts = new Map<string, string[]>();

  for (const strutId of uniqueStrutIds) {
    const strut = scene.struts[strutId];
    if (!strut) return null;

    const nodeA = scene.nodes[strut.nodeA];
    const nodeB = scene.nodes[strut.nodeB];
    if (!nodeA || !nodeB || strut.nodeA === strut.nodeB) return null;

    struts.push(strut);
    connectedStruts.set(strut.nodeA, [...(connectedStruts.get(strut.nodeA) ?? []), strut.id]);
    connectedStruts.set(strut.nodeB, [...(connectedStruts.get(strut.nodeB) ?? []), strut.id]);
  }

  // A panel is bounded by tubes, so its selected struts must make one closed loop.
  if ([...connectedStruts.values()].some((strutIdsAtNode) => strutIdsAtNode.length !== 2)) {
    return null;
  }

  const strutsById = new Map(struts.map((strut) => [strut.id, strut]));
  const startNodeId = struts[0].nodeA;
  const nodePoints: Vec3[] = [];
  const traversedStruts: Array<{ strut: StrutData; fromNodeId: string }> = [];
  const visitedStrutIds = new Set<string>();
  let currentNodeId = startNodeId;
  let previousStrutId: string | null = null;

  while (true) {
    const node = scene.nodes[currentNodeId];
    if (!node) return null;
    nodePoints.push(node.position);

    const candidates = connectedStruts.get(currentNodeId);
    const nextStrutId = candidates?.find((id) => id !== previousStrutId);
    if (!nextStrutId || visitedStrutIds.has(nextStrutId)) break;

    const nextStrut = strutsById.get(nextStrutId);
    if (!nextStrut) return null;
    visitedStrutIds.add(nextStrutId);
    traversedStruts.push({ strut: nextStrut, fromNodeId: currentNodeId });
    previousStrutId = nextStrutId;
    currentNodeId = nextStrut.nodeA === currentNodeId ? nextStrut.nodeB : nextStrut.nodeA;
    if (currentNodeId === startNodeId) break;
  }

  if (currentNodeId !== startNodeId || visitedStrutIds.size !== struts.length || nodePoints.length < 3) {
    return null;
  }
  return { nodePoints, traversedStruts };
}

function getTraversedStrutRoute(
  scene: SceneData,
  { strut, fromNodeId }: { strut: StrutData; fromNodeId: string },
): Vec3[] {
  const nodeA = scene.nodes[strut.nodeA];
  const nodeB = scene.nodes[strut.nodeB];
  if (!nodeA || !nodeB) return [];

  const route = getStrutRoutePoints({
    nodeA: nodeA.position,
    faceA: strut.faceA,
    nodeB: nodeB.position,
    faceB: strut.faceB,
    kind: strut.kind,
  });
  return strut.nodeA === fromNodeId ? route : [...route].reverse();
}

export function addWidgetToScene(scene: SceneData, widget: WidgetData): SceneData {
  if (!validateWidgetPlacement(scene, widget).valid) return scene;

  return normalizeSceneAttachments({
    ...scene,
    widgets: { ...(scene.widgets ?? {}), [widget.id]: widget },
  });
}

export function removeWidgetFromScene(
  scene: SceneData,
  widgetId: string,
): SceneData {
  const widget = scene.widgets?.[widgetId];
  if (!widget) return scene;

  const node = scene.nodes[widget.nodeId];
  if (node) {
    const widgets = { ...scene.widgets };
    delete widgets[widgetId];

    return normalizeSceneAttachments({ ...scene, widgets });
  }

  return scene;
}

export function rotateWidgetInScene(scene: SceneData, widgetId: string): SceneData {
  const widget = scene.widgets?.[widgetId];
  if (!widget) return scene;

  const rotated = { ...widget, rotation: (widget.rotation + 1) % 4 };
  if (!validateWidgetPlacement(scene, rotated).valid) return scene;

  return normalizeSceneAttachments({
    ...scene,
    widgets: {
      ...scene.widgets,
      [widgetId]: rotated,
    },
  });
}

function legacyWidgetKind(definitionId: string): WidgetKind | null {
  switch (definitionId) {
    case "antenna":
    case "rocket-engine":
    case "cockpit":
    case "wheel":
      return definitionId;
    default:
      return null;
  }
}

export function getAttachmentWorldPosition(
  scene: SceneData,
  nodeId: string,
  face: FaceName,
): Vec3 {
  const node = scene.nodes[nodeId];
  if (!node) return { x: 0, y: 0, z: 0 };

  return getAttachmentPosition(node.position, face);
}

export function nodeFaceToWorldNormal(face: string): Vec3 {
  return faceNormal(face as FaceName);
}
