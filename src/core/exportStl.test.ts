import { describe, expect, it } from "vitest";
import { exportSceneStl, getScenePrintSize } from "./exportStl";
import type { Attachments, SceneData } from "./types";

describe("printable STL export", () => {
  it("writes a unified, weldable node-and-strut skin in millimeters", () => {
    const stl = exportSceneStl(scene(), 2);

    expect(stl.startsWith("solid strutz\n")).toBe(true);
    expect(stl.endsWith("endsolid strutz\n")).toBe(true);
    expect(stl.match(/facet normal/g)).toHaveLength(28);
    expect(stl).toContain("vertex -1 -1 -1");
    expect(stl).toContain("vertex 9 1 1");
  });

  it("reports scaled node bounds and rejects invalid scales", () => {
    expect(getScenePrintSize(scene(), 2)).toEqual({ x: 10, y: 2, z: 2 });
    expect(() => exportSceneStl(scene(), 0)).toThrow("Print scale");
  });

  it("exports a wheel and axle as closed printable geometry", () => {
    const input = scene();
    input.widgets.wheel = {
      id: "wheel",
      kind: "wheel",
      nodeId: "a",
      face: "top",
      rotation: 0,
    };
    const stl = exportSceneStl(input, 1);

    // The 32-sided, four-ring stepped profile contributes 256 triangles.
    expect(stl.match(/facet normal/g)).toHaveLength(28 + 256);
    expect(stl).toContain("vertex 2 1 0");
    expect(stl).toContain("vertex 2 3 0");
  });
});

function scene(): SceneData {
  return {
    nodes: {
      a: { id: "a", position: { x: 0, y: 0, z: 0 }, attachments: attachments() },
      b: { id: "b", position: { x: 4, y: 0, z: 0 }, attachments: attachments() },
    },
    struts: {
      s: { id: "s", nodeA: "a", faceA: "right", nodeB: "b", faceB: "left", length: 3 },
    },
    panels: {},
    widgets: {},
  };
}

function attachments(): Attachments {
  return {
    top: { occupied: false }, bottom: { occupied: false },
    front: { occupied: false }, back: { occupied: false },
    left: { occupied: false }, right: { occupied: false },
  };
}
