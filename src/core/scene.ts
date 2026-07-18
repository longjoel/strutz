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
import { nodeSize, oppositeFace } from "./constants";
import {
  add,
  cross,
  dot,
  faceNormal,
  getAttachmentPosition,
  getStrutRoutePoints,
  RULE_EPSILON,
  isAxisAlignedVector,
  isValidCorner45Footprint,
  isValidStrutLength,
  length,
  normalize,
  scale,
  sub,
} from "./rules";
export const SNAP_GRID = 1;

export function createNode(position: Vec3): NodeData {
  return {
    id: crypto.randomUUID(),
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
  const nodes: Record<string, NodeData> = {};

  for (const [id, node] of Object.entries(scene.nodes)) {
    nodes[id] = {
      ...node,
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
    nodes,
    panels: scene.panels ?? {},
    widgets,
  };
}

export function addNodeToScene(scene: SceneData, node: NodeData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    nodes: { ...scene.nodes, [node.id]: node },
  });
}

export function hasNodeContact(scene: SceneData): boolean {
  const nodes = Object.values(scene.nodes);

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = Math.abs(a.position.x - b.position.x);
      const dy = Math.abs(a.position.y - b.position.y);
      const dz = Math.abs(a.position.z - b.position.z);

      if (
        dx < nodeSize + 0.01 &&
        dy < nodeSize + 0.01 &&
        dz < nodeSize + 0.01
      ) {
        return true;
      }
    }
  }

  return false;
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
  if (kind === "corner45") {
    return canConnectCorner45Strut(scene, nodeA, faceA, nodeB, faceB);
  }

  if (nodeA === nodeB) return false;

  const nA = scene.nodes[nodeA];
  const nB = scene.nodes[nodeB];
  if (!nA || !nB) return false;

  if (oppositeFace(faceA) !== faceB) return false;

  const occA = nA.attachments[faceA]?.occupied;
  const occB = nB.attachments[faceB]?.occupied;
  if (occA || occB) return false;

  const posA = getAttachmentWorldPosition(scene, nodeA, faceA);
  const posB = getAttachmentWorldPosition(scene, nodeB, faceB);

  const delta = sub(posB, posA);
  const distance = Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
  if (!isAxisAlignedVector(delta)) return false;
  if (!isValidStrutLength(distance)) return false;

  return true;
}

export function canConnectCorner45Strut(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
): boolean {
  if (nodeA === nodeB) return false;

  const nA = scene.nodes[nodeA];
  const nB = scene.nodes[nodeB];
  if (!nA || !nB) return false;

  const occA = nA.attachments[faceA]?.occupied;
  const occB = nB.attachments[faceB]?.occupied;
  if (occA || occB) return false;

  return isValidCorner45Footprint(sub(nB.position, nA.position), faceA, faceB);
}

export function addStrutToScene(scene: SceneData, strut: StrutData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    struts: { ...scene.struts, [strut.id]: strut },
  });
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
  return getPanelPoints(scene, strutIds) !== null;
}

export function createPanelFromStruts(scene: SceneData, strutIds: string[]): PanelData | null {
  const points = getPanelPoints(scene, strutIds);
  if (!points) return null;

  const sortedStrutIds = [...new Set(strutIds)].sort();
  const existingSides = new Set(Object.values(scene.panels ?? {}).flatMap((panel) => {
    const panelStruts = [...panel.strutIds].sort();
    const sameLoop = panelStruts.length === sortedStrutIds.length &&
      panelStruts.every((id, index) => id === sortedStrutIds[index]);
    return sameLoop ? [panel.side ?? "top"] : [];
  }));
  const side = existingSides.has("top") ? (existingSides.has("bottom") ? null : "bottom") : "top";
  if (!side) return null;

  return {
    id: crypto.randomUUID(),
    strutIds: sortedStrutIds,
    side,
  };
}

export function addPanelToScene(scene: SceneData, panel: PanelData): SceneData {
  if (!canCreatePanel(scene, panel.strutIds)) return scene;
  const panelSide = panel.side ?? "top";
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

export function getPanelBoundaryPoints(scene: SceneData, strutIds: string[]): Vec3[] | null {
  const loop = getPanelLoop(scene, strutIds);
  if (!loop) return null;

  const points = loop.traversedStruts.flatMap((traversedStrut) => getTraversedStrutRoute(scene, traversedStrut));

  return points.length >= 3 ? points : null;
}

export interface HullStripGeometry {
  points: Vec3[];
  indices: number[];
}

export function getPanelHullStrip(
  scene: SceneData,
  strutIds: string[],
  side: "top" | "bottom" = "top",
): HullStripGeometry | null {
  const loop = getPanelLoop(scene, strutIds);
  if (!loop) return null;

  const cornerRibs = loop.traversedStruts.filter(({ strut }) => strut.kind === "corner45");
  if (cornerRibs.length !== 2 || loop.traversedStruts.length !== 4) return null;

  const firstRib = getTraversedStrutRoute(scene, cornerRibs[0]);
  const secondRib = [...getTraversedStrutRoute(scene, cornerRibs[1])].reverse();
  if (firstRib.length !== secondRib.length || firstRib.length < 2) return null;

  const segmentNormals: Vec3[] = [];
  for (let index = 0; index < firstRib.length - 1; index += 1) {
    const along = sub(firstRib[index + 1], firstRib[index]);
    const across = sub(secondRib[index], firstRib[index]);
    let normal = normalize(cross(along, across));
    if (length(normal) < RULE_EPSILON) return null;
    const previous = segmentNormals[index - 1];
    if (previous && dot(normal, previous) < 0) normal = scale(normal, -1);
    segmentNormals.push(normal);
  }

  const offset = side === "bottom" ? -nodeSize / 2 : nodeSize / 2;
  const points: Vec3[] = [];
  for (let index = 0; index < firstRib.length; index += 1) {
    const previous = segmentNormals[Math.max(0, index - 1)];
    const next = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    const normal = normalize(add(previous, next));
    const shift = scale(normal, offset);
    points.push(add(firstRib[index], shift), add(secondRib[index], shift));
  }

  const indices: number[] = [];
  for (let index = 0; index < firstRib.length - 1; index += 1) {
    const a = index * 2;
    const b = a + 1;
    const nextA = a + 2;
    const nextB = a + 3;
    if (side === "bottom") {
      indices.push(a, b, nextB, a, nextB, nextA);
    } else {
      indices.push(a, nextB, b, a, nextA, nextB);
    }
  }

  return { points, indices };
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
  const node = scene.nodes[widget.nodeId];
  if (!node) return scene;

  const existing = node.attachments[widget.face];
  if (existing?.occupied) return scene;

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

  return normalizeSceneAttachments({
    ...scene,
    widgets: {
      ...scene.widgets,
      [widgetId]: { ...widget, rotation: (widget.rotation + 1) % 4 },
    },
  });
}

function legacyWidgetKind(definitionId: string): WidgetKind | null {
  switch (definitionId) {
    case "antenna":
    case "rocket-engine":
    case "cockpit":
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
