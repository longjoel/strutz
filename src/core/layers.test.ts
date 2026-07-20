import { describe, expect, it } from "vitest";
import { CURRENT_SCENE_VERSION, DEFAULT_LAYER_ID } from "./constants";
import { createRootScene } from "./document";
import {
  assignSelectionToLayer,
  createLayerInScene,
  deleteLayerFromScene,
  setLayerVisibilityInScene,
} from "./layers";
import { normalizeSceneAttachments } from "./scene";

describe("scene layers", () => {
  it("migrates legacy parts into a visible Default layer", () => {
    const root = createRootScene();
    const legacy = { ...root, schemaVersion: 1, layers: undefined };
    const migrated = normalizeSceneAttachments(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCENE_VERSION);
    expect(migrated.layers).toEqual([{ id: DEFAULT_LAYER_ID, name: "Default", visible: true }]);
    expect(Object.values(migrated.nodes)[0].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it("assigns selected parts and moves them to Default when their layer is deleted", () => {
    const root = createRootScene();
    const nodeId = Object.keys(root.nodes)[0];
    const created = createLayerInScene(root, "Hull", "hull").scene;
    const assigned = assignSelectionToLayer(created, {
      nodeIds: new Set([nodeId]), strutIds: new Set(), panelIds: new Set(), widgetIds: new Set(),
    }, "hull");

    expect(assigned.nodes[nodeId].layerId).toBe("hull");
    expect(deleteLayerFromScene(assigned, "hull").nodes[nodeId].layerId).toBe(DEFAULT_LAYER_ID);
  });

  it("persists visibility without removing structural content", () => {
    const root = createRootScene();
    const hidden = setLayerVisibilityInScene(root, DEFAULT_LAYER_ID, false);

    expect(hidden.layers?.[0].visible).toBe(false);
    expect(Object.keys(hidden.nodes)).toHaveLength(1);
  });
});
