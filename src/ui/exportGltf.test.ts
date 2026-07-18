import { describe, expect, it } from "vitest";
import { DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial } from "three";
import { applyPhysicalScale, applySceneMaterials } from "./exportGltf";
import { SCENE_COLORS } from "./sceneColors";
import type { SceneData } from "../core/types";
import { PHYSICAL_SCALE } from "../core/constants";

describe("glTF export materials", () => {
  it("applies editor colors and keeps panels double-sided", () => {
    const object = new Group();
    const node = new Mesh();
    node.name = "node_node-id";
    const strut = new Mesh();
    strut.name = "strut_strut-id";
    const panel = new Mesh();
    panel.name = "panel_panel-id";
    const widget = new Mesh();
    widget.name = "widget_antenna_widget-id";
    object.add(node, strut, panel, widget);

    applySceneMaterials(object, scene());

    expect(material(node).color.getHexString()).toBe(SCENE_COLORS.node.slice(1));
    expect(material(strut).color.getHexString()).toBe(SCENE_COLORS.planarCornerStrut.slice(1));
    expect(material(panel).color.getHexString()).toBe(SCENE_COLORS.panel.slice(1));
    expect(material(widget).color.getHexString()).toBe(SCENE_COLORS.widget.slice(1));
    expect(material(node).side).toBe(FrontSide);
    expect(material(panel).side).toBe(DoubleSide);
  });

  it("exports three construction units as two meters", () => {
    const object = new Group();
    applyPhysicalScale(object);

    expect(object.scale.toArray()).toEqual([
      PHYSICAL_SCALE.metersPerConstructionUnit,
      PHYSICAL_SCALE.metersPerConstructionUnit,
      PHYSICAL_SCALE.metersPerConstructionUnit,
    ]);
    expect(3 * object.scale.x).toBeCloseTo(2);
  });
});

function material(mesh: Mesh): MeshStandardMaterial {
  return mesh.material as MeshStandardMaterial;
}

function scene(): SceneData {
  return {
    nodes: {
      "node-id": {
        id: "node-id",
        position: { x: 0, y: 0, z: 0 },
        attachments: {
          top: { occupied: false }, bottom: { occupied: false },
          front: { occupied: false }, back: { occupied: false },
          left: { occupied: false }, right: { occupied: false },
        },
      },
    },
    struts: {
      "strut-id": {
        id: "strut-id",
        kind: "corner45",
        nodeA: "node-id",
        faceA: "right",
        nodeB: "node-id",
        faceB: "bottom",
        length: 3,
      },
    },
    panels: {
      "panel-id": { id: "panel-id", strutIds: ["strut-id"], side: "top" },
    },
    widgets: {
      "widget-id": {
        id: "widget-id",
        kind: "antenna",
        nodeId: "node-id",
        face: "top",
        rotation: 0,
      },
    },
  };
}
