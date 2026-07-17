import { describe, expect, it } from "vitest";
import { exportSceneObj } from "./document";
import {
  addWidgetToScene,
  createNode,
  normalizeSceneAttachments,
  removeNodeFromScene,
  rotateWidgetInScene,
} from "./scene";
import type { SceneData, WidgetData } from "./types";

describe("widget rules", () => {
  it("snaps a widget to a free node face and prevents a second attachment", () => {
    const scene = widgetScene();
    const antenna: WidgetData = {
      id: "antenna",
      kind: "antenna",
      nodeId: "node",
      face: "top",
      rotation: 0,
    };
    const withAntenna = addWidgetToScene(scene, antenna);
    const engine = { ...antenna, id: "engine", kind: "rocket-engine" as const };

    expect(withAntenna.nodes.node.attachments.top).toMatchObject({
      occupied: true,
      occupantId: "antenna",
      occupantType: "widget",
    });
    expect(addWidgetToScene(withAntenna, engine).widgets).toEqual(withAntenna.widgets);
  });

  it("removes widgets attached to a removed node", () => {
    const scene = addWidgetToScene(widgetScene(), {
      id: "cockpit",
      kind: "cockpit",
      nodeId: "node",
      face: "front",
      rotation: 0,
    });

    expect(removeNodeFromScene(scene, "node").widgets).toEqual({});
  });

  it("rotates widgets in quarter turns", () => {
    const scene = addWidgetToScene(widgetScene(), {
      id: "engine",
      kind: "rocket-engine",
      nodeId: "node",
      face: "back",
      rotation: 3,
    });

    expect(rotateWidgetInScene(scene, "engine").widgets.engine.rotation).toBe(0);
  });

  it("migrates recognized legacy accessories into widgets", () => {
    const scene = widgetScene();
    const migrated = normalizeSceneAttachments({
      ...scene,
      accessories: {
        legacy: {
          id: "legacy",
          definitionId: "cockpit",
          nodeId: "node",
          face: "right",
          rotation: 2,
        },
      },
    });

    expect(migrated.widgets.legacy).toMatchObject({ kind: "cockpit", rotation: 2 });
    expect(migrated.accessories).toBeUndefined();
  });

  it("exports widget geometry as named OBJ objects", () => {
    let scene = widgetScene();
    for (const [id, kind, face] of [
      ["antenna", "antenna", "top"],
      ["engine", "rocket-engine", "front"],
      ["cockpit", "cockpit", "right"],
    ] as const) {
      scene = addWidgetToScene(scene, { id, kind, nodeId: "node", face, rotation: 0 });
    }

    const obj = exportSceneObj(scene);
    expect(obj).toContain("o widget_antenna_antenna");
    expect(obj).toContain("o widget_rocket-engine_engine");
    expect(obj).toContain("o widget_cockpit_cockpit");
  });
});

function widgetScene(): SceneData {
  const node = createNode({ x: 0, y: 0, z: 0 });
  return {
    nodes: { node: { ...node, id: "node" } },
    struts: {},
    panels: {},
    widgets: {},
  };
}
