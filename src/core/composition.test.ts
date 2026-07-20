import { describe, expect, it } from "vitest";
import {
  createAssemblyClipboard,
  IDENTITY_ROTATION,
  placeAssembly,
  prepareAssemblyPaste,
  quarterTurn,
  validateAssemblyPaste,
} from "./composition";
import { normalizeSceneAttachments } from "./scene";
import type { Attachments, SceneData } from "./types";

describe("assembly composition", () => {
  it("copies selected parts plus their dependency closure", () => {
    const source = assemblyScene();
    const clipboard = createAssemblyClipboard(source, {
      nodeIds: new Set(), strutIds: new Set(), panelIds: new Set(["panel"]), widgetIds: new Set(["widget"]),
    });

    expect(Object.keys(clipboard?.panels ?? {})).toEqual(["panel"]);
    expect(Object.keys(clipboard?.struts ?? {})).toEqual(["strut"]);
    expect(new Set(Object.keys(clipboard?.nodes ?? {}))).toEqual(new Set(["a", "b"]));
    expect(Object.keys(clipboard?.widgets ?? {})).toEqual(["widget"]);
    expect(clipboard?.nodes.a.attachments.right.occupied).toBe(false);
  });

  it("remaps references, assigns the target layer, and rotates faces on the grid", () => {
    const clipboard = createAssemblyClipboard(assemblyScene(), {
      nodeIds: new Set(), strutIds: new Set(["strut"]), panelIds: new Set(), widgetIds: new Set(["widget"]),
    })!;
    const prepared = prepareAssemblyPaste(clipboard, "target");
    const rotation = quarterTurn(IDENTITY_ROTATION, "y", 1);
    const placed = placeAssembly(prepared, rotation, { x: 8, y: 0, z: 8 });
    const strut = Object.values(placed.struts)[0];
    const widget = Object.values(placed.widgets)[0];

    expect(new Set(Object.keys(placed.nodes))).not.toEqual(new Set(["a", "b"]));
    expect(Object.values(placed.nodes).every((node) => node.layerId === "target")).toBe(true);
    expect(strut.faceA).toBe("back");
    expect(strut.faceB).toBe("front");
    expect(widget.face).toBe("top");
    expect(Object.values(placed.nodes).every((node) =>
      Number.isInteger(node.position.x) && Number.isInteger(node.position.y) && Number.isInteger(node.position.z))).toBe(true);
  });

  it("blocks a paste whose nodes contact existing construction", () => {
    const source = assemblyScene();
    const clipboard = createAssemblyClipboard(source, {
      nodeIds: new Set(["a"]), strutIds: new Set(), panelIds: new Set(), widgetIds: new Set(),
    })!;
    const candidate = placeAssembly(prepareAssemblyPaste(clipboard, "target"), IDENTITY_ROTATION, { x: 0, y: 0, z: 0 });

    expect(validateAssemblyPaste(source, candidate)).toBe(false);
  });
});

function assemblyScene(): SceneData {
  return normalizeSceneAttachments({
    schemaVersion: 2,
    layers: [{ id: "source", name: "Source", visible: true }],
    nodes: {
      a: { id: "a", layerId: "source", position: { x: 0, y: 0, z: 0 }, attachments: attachments() },
      b: { id: "b", layerId: "source", position: { x: 4, y: 0, z: 0 }, attachments: attachments() },
    },
    struts: {
      strut: { id: "strut", layerId: "source", nodeA: "a", faceA: "right", nodeB: "b", faceB: "left", length: 3 },
    },
    panels: {
      panel: { id: "panel", layerId: "source", strutIds: ["strut"], side: "top" },
    },
    widgets: {
      widget: { id: "widget", layerId: "source", kind: "antenna", nodeId: "a", face: "top", rotation: 0 },
    },
  });
}

function attachments(): Attachments {
  return {
    top: { occupied: false }, bottom: { occupied: false },
    front: { occupied: false }, back: { occupied: false },
    left: { occupied: false }, right: { occupied: false },
  };
}
