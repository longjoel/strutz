import { DEFAULT_LAYER_ID } from "./constants";
import { normalizeSceneAttachments } from "./scene";
import { validateNodePlacement, validateStrutPlacement, validateWidgetPlacement } from "./placement";
import { faceNormal } from "./rules";
import type {
  Attachments,
  FaceName,
  NodeData,
  PanelData,
  SceneData,
  SceneSelection,
  StrutData,
  Vec3,
  WidgetData,
} from "./types";
import { getWidgetAxes } from "./widgetGeometry";

export const ASSEMBLY_CLIPBOARD_TYPE = "strutz/assembly";
export const ASSEMBLY_CLIPBOARD_VERSION = 1;

export interface AssemblyClipboard {
  type: typeof ASSEMBLY_CLIPBOARD_TYPE;
  version: typeof ASSEMBLY_CLIPBOARD_VERSION;
  nodes: Record<string, NodeData>;
  struts: Record<string, StrutData>;
  panels: Record<string, PanelData>;
  widgets: Record<string, WidgetData>;
}

export type RotationAxis = "x" | "y" | "z";
export type RotationMatrix = readonly [Vec3, Vec3, Vec3];

export const IDENTITY_ROTATION: RotationMatrix = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];

export function createAssemblyClipboard(
  scene: SceneData,
  selection: SceneSelection,
): AssemblyClipboard | null {
  const nodeIds = new Set(selection.nodeIds);
  const strutIds = new Set(selection.strutIds);
  const panelIds = new Set(selection.panelIds);
  const widgetIds = new Set(selection.widgetIds);

  for (const panelId of panelIds) {
    const panel = scene.panels?.[panelId];
    for (const strutId of panel?.strutIds ?? []) strutIds.add(strutId);
  }
  for (const strutId of strutIds) {
    const strut = scene.struts[strutId];
    if (!strut) continue;
    nodeIds.add(strut.nodeA);
    nodeIds.add(strut.nodeB);
  }
  for (const widgetId of widgetIds) {
    const widget = scene.widgets?.[widgetId];
    if (widget) nodeIds.add(widget.nodeId);
  }
  if (nodeIds.size + strutIds.size + panelIds.size + widgetIds.size === 0) return null;

  return {
    type: ASSEMBLY_CLIPBOARD_TYPE,
    version: ASSEMBLY_CLIPBOARD_VERSION,
    nodes: pickParts(scene.nodes, nodeIds, (node) => ({ ...node, attachments: emptyAttachments() })),
    struts: pickParts(scene.struts, strutIds),
    panels: pickParts(scene.panels ?? {}, panelIds),
    widgets: pickParts(scene.widgets ?? {}, widgetIds),
  };
}

export function serializeAssemblyClipboard(clipboard: AssemblyClipboard): string {
  return JSON.stringify(clipboard);
}

export function parseAssemblyClipboard(text: string): AssemblyClipboard | null {
  try {
    const value = JSON.parse(text) as Partial<AssemblyClipboard>;
    if (value.type !== ASSEMBLY_CLIPBOARD_TYPE || value.version !== ASSEMBLY_CLIPBOARD_VERSION ||
      !isRecord(value.nodes) || !isRecord(value.struts) || !isRecord(value.panels) || !isRecord(value.widgets)) {
      return null;
    }
    const clipboard = value as AssemblyClipboard;
    if (Object.entries(clipboard.nodes).some(([id, node]) =>
      !isEntity(node, id) || !isVec3(node.position)) ||
      Object.entries(clipboard.struts).some(([id, strut]) =>
        !isEntity(strut, id) || typeof strut.nodeA !== "string" || typeof strut.nodeB !== "string" ||
        typeof strut.faceA !== "string" || typeof strut.faceB !== "string") ||
      Object.entries(clipboard.panels).some(([id, panel]) =>
        !isEntity(panel, id) || !Array.isArray(panel.strutIds)) ||
      Object.entries(clipboard.widgets).some(([id, widget]) =>
        !isEntity(widget, id) || typeof widget.nodeId !== "string" || typeof widget.face !== "string") ||
      Object.values(clipboard.struts).some((strut) =>
      !clipboard.nodes[strut.nodeA] || !clipboard.nodes[strut.nodeB]) ||
      Object.values(clipboard.panels).some((panel) =>
        panel.strutIds.some((id) => !clipboard.struts[id])) ||
      Object.values(clipboard.widgets).some((widget) => !clipboard.nodes[widget.nodeId])) {
      return null;
    }
    return clipboard;
  } catch {
    return null;
  }
}

/** Remap IDs once when paste mode begins so preview meshes remain stable. */
export function prepareAssemblyPaste(
  clipboard: AssemblyClipboard,
  layerId: string,
): AssemblyClipboard {
  const nodeIds = remapIds(clipboard.nodes);
  const strutIds = remapIds(clipboard.struts);
  const panelIds = remapIds(clipboard.panels);
  const widgetIds = remapIds(clipboard.widgets);
  return {
    ...clipboard,
    nodes: Object.fromEntries(Object.values(clipboard.nodes).map((node) => {
      const id = nodeIds.get(node.id)!;
      return [id, { ...node, id, layerId, attachments: emptyAttachments() }];
    })),
    struts: Object.fromEntries(Object.values(clipboard.struts).map((strut) => {
      const id = strutIds.get(strut.id)!;
      return [id, {
        ...strut,
        id,
        layerId,
        nodeA: nodeIds.get(strut.nodeA)!,
        nodeB: nodeIds.get(strut.nodeB)!,
      }];
    })),
    panels: Object.fromEntries(Object.values(clipboard.panels).map((panel) => {
      const id = panelIds.get(panel.id)!;
      return [id, { ...panel, id, layerId, strutIds: panel.strutIds.map((strutId) => strutIds.get(strutId)!) }];
    })),
    widgets: Object.fromEntries(Object.values(clipboard.widgets).map((widget) => {
      const id = widgetIds.get(widget.id)!;
      return [id, { ...widget, id, layerId, nodeId: nodeIds.get(widget.nodeId)! }];
    })),
  };
}

export function quarterTurn(
  rotation: RotationMatrix,
  axis: RotationAxis,
  direction: 1 | -1,
): RotationMatrix {
  const turn = turnMatrix(axis, direction);
  return rotation.map((column) => applyMatrix(turn, column)) as unknown as RotationMatrix;
}

export function placeAssembly(
  assembly: AssemblyClipboard,
  rotation: RotationMatrix,
  target: Vec3,
  layerName = "Paste",
): SceneData {
  const nodes = Object.values(assembly.nodes);
  const transformed = nodes.map((node) => applyMatrix(rotation, node.position));
  const bounds = getBounds(transformed);
  const offset = {
    x: Math.round(target.x - (bounds.min.x + bounds.max.x) / 2),
    y: Math.round(target.y - bounds.min.y),
    z: Math.round(target.z - (bounds.min.z + bounds.max.z) / 2),
  };
  const layerId = nodes[0]?.layerId ?? DEFAULT_LAYER_ID;
  const placedNodes = Object.fromEntries(nodes.map((node, index) => [node.id, {
    ...node,
    position: add(transformed[index], offset),
    attachments: emptyAttachments(),
  }]));
  const placedStruts = Object.fromEntries(Object.values(assembly.struts).map((strut) => [strut.id, {
    ...strut,
    faceA: transformFace(strut.faceA, rotation),
    faceB: transformFace(strut.faceB, rotation),
  }]));
  const placedWidgets = Object.fromEntries(Object.values(assembly.widgets).map((widget) => [widget.id,
    transformWidget(widget, rotation)]));
  return normalizeSceneAttachments({
    schemaVersion: 2,
    layers: [{ id: layerId, name: layerName, visible: true }],
    nodes: placedNodes,
    struts: placedStruts,
    panels: assembly.panels,
    widgets: placedWidgets,
  });
}

export function validateAssemblyPaste(scene: SceneData, assembly: SceneData): boolean {
  for (const node of Object.values(assembly.nodes)) {
    if (!validateNodePlacement(scene, node.position).valid) return false;
  }
  const validationScene: SceneData = {
    ...scene,
    nodes: {
      ...scene.nodes,
      ...Object.fromEntries(Object.values(assembly.nodes).map((node) => [node.id, {
        ...node,
        attachments: emptyAttachments(),
      }])),
    },
  };
  for (const strut of Object.values(assembly.struts)) {
    if (!validateStrutPlacement(validationScene, strut).valid) return false;
  }
  for (const widget of Object.values(assembly.widgets)) {
    if (!validateWidgetPlacement(validationScene, widget).valid) return false;
    validationScene.widgets = { ...validationScene.widgets, [widget.id]: widget };
  }
  return true;
}

export function mergeAssemblyIntoScene(scene: SceneData, assembly: SceneData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    nodes: { ...scene.nodes, ...assembly.nodes },
    struts: { ...scene.struts, ...assembly.struts },
    panels: { ...scene.panels, ...assembly.panels },
    widgets: { ...scene.widgets, ...assembly.widgets },
  });
}

export function selectionForAssembly(assembly: SceneData): SceneSelection {
  return {
    nodeIds: new Set(Object.keys(assembly.nodes)),
    strutIds: new Set(Object.keys(assembly.struts)),
    panelIds: new Set(Object.keys(assembly.panels)),
    widgetIds: new Set(Object.keys(assembly.widgets)),
  };
}

function transformWidget(widget: WidgetData, rotation: RotationMatrix): WidgetData {
  const oldAxes = getWidgetAxes(widget.face, widget.rotation);
  const face = transformFace(widget.face, rotation);
  const transformedX = applyMatrix(rotation, oldAxes.x);
  let quarterRotation = 0;
  for (let candidate = 0; candidate < 4; candidate += 1) {
    if (sameVector(getWidgetAxes(face, candidate).x, transformedX)) {
      quarterRotation = candidate;
      break;
    }
  }
  return { ...widget, face, rotation: quarterRotation };
}

function transformFace(face: FaceName, rotation: RotationMatrix): FaceName {
  const transformed = applyMatrix(rotation, faceNormal(face));
  const entries = Object.entries({
    top: { x: 0, y: 1, z: 0 }, bottom: { x: 0, y: -1, z: 0 },
    front: { x: 0, y: 0, z: 1 }, back: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 },
  }) as Array<[FaceName, Vec3]>;
  return entries.find(([, normal]) => sameVector(normal, transformed))?.[0] ?? face;
}

function turnMatrix(axis: RotationAxis, direction: 1 | -1): RotationMatrix {
  if (axis === "x") return direction === 1
    ? [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: -1, z: 0 }]
    : [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }];
  if (axis === "y") return direction === 1
    ? [{ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }]
    : [{ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }];
  return direction === 1
    ? [{ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]
    : [{ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }];
}

function applyMatrix(matrix: RotationMatrix, point: Vec3): Vec3 {
  return {
    x: matrix[0].x * point.x + matrix[1].x * point.y + matrix[2].x * point.z,
    y: matrix[0].y * point.x + matrix[1].y * point.y + matrix[2].y * point.z,
    z: matrix[0].z * point.x + matrix[1].z * point.y + matrix[2].z * point.z,
  };
}

function getBounds(points: Vec3[]): { min: Vec3; max: Vec3 } {
  return points.reduce((bounds, point) => ({
    min: { x: Math.min(bounds.min.x, point.x), y: Math.min(bounds.min.y, point.y), z: Math.min(bounds.min.z, point.z) },
    max: { x: Math.max(bounds.max.x, point.x), y: Math.max(bounds.max.y, point.y), z: Math.max(bounds.max.z, point.z) },
  }), {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  });
}

function pickParts<T>(parts: Record<string, T>, ids: Set<string>, map: (part: T) => T = (part) => ({ ...part })) {
  return Object.fromEntries([...ids].flatMap((id) => parts[id] ? [[id, map(parts[id])]] : []));
}

function remapIds(parts: Record<string, { id: string }>): Map<string, string> {
  return new Map(Object.values(parts).map((part) => [part.id, crypto.randomUUID()]));
}

function emptyAttachments(): Attachments {
  return {
    top: { occupied: false }, bottom: { occupied: false },
    front: { occupied: false }, back: { occupied: false },
    left: { occupied: false }, right: { occupied: false },
  };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sameVector(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001 && Math.abs(a.z - b.z) < 0.001;
}

function isRecord(value: unknown): value is Record<string, never> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEntity(value: unknown, id: string): value is { id: string } & Record<string, unknown> {
  return isRecord(value) && value.id === id;
}

function isVec3(value: unknown): value is Vec3 {
  return isRecord(value) && [value.x, value.y, value.z].every((coordinate) =>
    typeof coordinate === "number" && Number.isFinite(coordinate));
}
