import { describe, expect, it } from "vitest";
import { createRootScene, exportSceneObj } from "./document";

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
});

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
