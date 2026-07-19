import { describe, expect, it } from "vitest";
import { createRootScene, exportSceneObj } from "./document";
import type { NodeData, SceneData, Vec3 } from "./types";

describe("document geometry export", () => {
  it("writes axis-aligned node faces with outward winding", () => {
    const obj = exportSceneObj(createRootScene());
    const vertices = obj.split("\n")
      .filter((line) => line.startsWith("v "))
      .map((line) => {
        const [x, y, z] = line.slice(2).split(" ").map(Number);
        return { x, y, z };
      });
    const faces = obj.split("\n")
      .filter((line) => line.startsWith("f "))
      .map((line) => line.slice(2).split(" ").map((value) => Number(value) - 1));

    expect(vertices).toHaveLength(8);
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      const a = vertices[face[0]];
      const b = vertices[face[1]];
      const c = vertices[face[2]];
      const normal = cross(subtract(b, a), subtract(c, a));
      const center = face.reduce(
        (sum, index) => ({
          x: sum.x + vertices[index].x / face.length,
          y: sum.y + vertices[index].y / face.length,
          z: sum.z + vertices[index].z / face.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      expect(dot(normal, center)).toBeGreaterThan(0);
    }
  });

  it("removes internal node caps from a straight node-strut-node assembly", () => {
    const scene: SceneData = {
      nodes: {
        a: node("a", { x: 0, y: 0, z: 0 }),
        b: node("b", { x: 4, y: 0, z: 0 }),
      },
      struts: {
        s: {
          id: "s",
          kind: "straight",
          nodeA: "a",
          faceA: "right",
          nodeB: "b",
          faceB: "left",
          length: 3,
        },
      },
      panels: {},
      widgets: {},
    };

    const faces = exportSceneObj(scene).split("\n").filter((line) => line.startsWith("f "));

    // Five exposed faces per node plus four uncapped sides on the strut.
    expect(faces).toHaveLength(14);
  });
});

function node(id: string, position: Vec3): NodeData {
  return {
    id,
    position,
    attachments: {
      top: { occupied: false },
      bottom: { occupied: false },
      front: { occupied: false },
      back: { occupied: false },
      left: { occupied: false },
      right: { occupied: false },
    },
  };
}

interface Point {
  x: number;
  y: number;
  z: number;
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Point, b: Point): Point {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
