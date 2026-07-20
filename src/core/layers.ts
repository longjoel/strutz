import { DEFAULT_LAYER_ID } from "./constants";
import { normalizeSceneAttachments } from "./scene";
import type { LayerData, SceneData, SceneSelection } from "./types";

export function getSceneLayers(scene: SceneData): LayerData[] {
  return normalizeSceneAttachments(scene).layers ?? [];
}

export function getPartLayerId(part: { layerId?: string }): string {
  return part.layerId ?? DEFAULT_LAYER_ID;
}

export function createLayerInScene(
  scene: SceneData,
  name?: string,
  requestedId?: string,
): { scene: SceneData; layerId: string } {
  const normalized = normalizeSceneAttachments(scene);
  const layers = normalized.layers ?? [];
  const id = requestedId ?? crypto.randomUUID();
  const usedNames = new Set(layers.map((layer) => layer.name));
  let index = layers.length;
  let resolvedName = name?.trim() || `Layer ${index}`;
  while (usedNames.has(resolvedName)) resolvedName = `Layer ${++index}`;
  return {
    layerId: id,
    scene: { ...normalized, layers: [...layers, { id, name: resolvedName, visible: true }] },
  };
}

export function renameLayerInScene(scene: SceneData, layerId: string, name: string): SceneData {
  const trimmed = name.trim();
  if (!trimmed) return scene;
  const layers = getSceneLayers(scene);
  if (!layers.some((layer) => layer.id === layerId)) return scene;
  return { ...normalizeSceneAttachments(scene), layers: layers.map((layer) =>
    layer.id === layerId ? { ...layer, name: trimmed } : layer) };
}

export function setLayerVisibilityInScene(
  scene: SceneData,
  layerId: string,
  visible: boolean,
): SceneData {
  const layers = getSceneLayers(scene);
  if (!layers.some((layer) => layer.id === layerId)) return scene;
  return { ...normalizeSceneAttachments(scene), layers: layers.map((layer) =>
    layer.id === layerId ? { ...layer, visible } : layer) };
}

export function deleteLayerFromScene(scene: SceneData, layerId: string): SceneData {
  if (layerId === DEFAULT_LAYER_ID) return scene;
  const normalized = normalizeSceneAttachments(scene);
  if (!normalized.layers?.some((layer) => layer.id === layerId)) return scene;
  const reassign = <T extends { layerId?: string }>(parts: Record<string, T>) =>
    Object.fromEntries(Object.entries(parts).map(([id, part]) => [
      id,
      part.layerId === layerId ? { ...part, layerId: DEFAULT_LAYER_ID } : part,
    ]));
  return normalizeSceneAttachments({
    ...normalized,
    layers: normalized.layers.filter((layer) => layer.id !== layerId),
    nodes: reassign(normalized.nodes),
    struts: reassign(normalized.struts),
    panels: reassign(normalized.panels),
    widgets: reassign(normalized.widgets),
  });
}

export function assignSelectionToLayer(
  scene: SceneData,
  selection: SceneSelection,
  layerId: string,
): SceneData {
  const normalized = normalizeSceneAttachments(scene);
  if (!normalized.layers?.some((layer) => layer.id === layerId)) return scene;
  const assign = <T extends { layerId?: string }>(parts: Record<string, T>, ids: Set<string>) =>
    Object.fromEntries(Object.entries(parts).map(([id, part]) => [
      id,
      ids.has(id) ? { ...part, layerId } : part,
    ]));
  return normalizeSceneAttachments({
    ...normalized,
    nodes: assign(normalized.nodes, selection.nodeIds),
    struts: assign(normalized.struts, selection.strutIds),
    panels: assign(normalized.panels, selection.panelIds),
    widgets: assign(normalized.widgets, selection.widgetIds),
  });
}

export function selectLayerContents(scene: SceneData, layerId: string): SceneSelection {
  const collect = <T extends { layerId?: string }>(parts: Record<string, T>) => new Set(
    Object.entries(parts).filter(([, part]) => getPartLayerId(part) === layerId).map(([id]) => id),
  );
  return {
    nodeIds: collect(scene.nodes),
    strutIds: collect(scene.struts),
    panelIds: collect(scene.panels ?? {}),
    widgetIds: collect(scene.widgets ?? {}),
  };
}

export function getVisibleLayerIds(scene: SceneData): Set<string> {
  return new Set(getSceneLayers(scene).filter((layer) => layer.visible).map((layer) => layer.id));
}
