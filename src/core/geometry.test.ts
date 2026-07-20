import { describe, expect, it } from "vitest";
import {
  capStrutSurface,
  createBoxSurface,
  createRadialProfileSurface,
  createStrutSurface,
  triangulateQuadSurface,
} from "./geometry";

describe("simplified construction geometry", () => {
  it("omits node faces that are fully covered by connected struts", () => {
    const surface = createBoxSurface(
      { x: 0, y: 0, z: 0 },
      1,
      1,
      1,
      new Set(["right", "top"]),
    );

    expect(surface.vertices).toHaveLength(8);
    expect(surface.quads).toHaveLength(4);
    expect(triangulateQuadSurface(surface)).toHaveLength(24);
  });

  it("exports a straight strut as four uncapped sides", () => {
    const surface = createStrutSurface([
      { x: 0.5, y: 0, z: 0 },
      { x: 3.5, y: 0, z: 0 },
    ], 1);

    expect(surface.vertices).toHaveLength(8);
    expect(surface.quads).toHaveLength(4);
    expect(triangulateQuadSurface(surface)).toHaveLength(24);
  });

  it("caps standalone strut geometry into a closed shell", () => {
    const surface = capStrutSurface(createStrutSurface([
      { x: 0.5, y: 0, z: 0 },
      { x: 3.5, y: 0, z: 0 },
    ], 1));
    const indices = triangulateQuadSurface(surface);
    const edgeCounts = new Map<string, number>();
    for (let index = 0; index < indices.length; index += 3) {
      for (const [a, b] of [[indices[index], indices[index + 1]], [indices[index + 1], indices[index + 2]], [indices[index + 2], indices[index]]]) {
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
      }
    }

    expect(surface.quads).toHaveLength(6);
    expect([...edgeCounts.values()].every((count) => count === 2)).toBe(true);
  });

  it("uses shared mitered rings instead of overlapping boxes at corners", () => {
    const surface = createStrutSurface([
      { x: 0.5, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 4, y: 3, z: 0 },
      { x: 4, y: 3.5, z: 0 },
    ], 1, { x: 0, y: 0, z: 1 });

    expect(surface.vertices).toHaveLength(16);
    expect(surface.quads).toHaveLength(12);
    expect(triangulateQuadSurface(surface)).toHaveLength(72);

    const uniqueVertices = new Set(surface.vertices.map((point) =>
      `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`
    ));
    expect(uniqueVertices).toHaveLength(16);
  });

  it("revolves a stepped axle and wheel profile into a closed solid", () => {
    const surface = createRadialProfileSurface(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      [
        { offset: 0, radius: 0.25 },
        { offset: 0.5, radius: 0.25 },
        { offset: 0.5, radius: 2 },
        { offset: 2.5, radius: 2 },
      ],
      16,
    );
    const edges = new Map<string, number>();
    for (let index = 0; index < surface.indices.length; index += 3) {
      const triangle = surface.indices.slice(index, index + 3);
      for (let edge = 0; edge < 3; edge += 1) {
        const a = triangle[edge];
        const b = triangle[(edge + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }

    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(Math.max(...surface.vertices.map((point) => point.x))).toBeCloseTo(2);
    expect(Math.min(...surface.vertices.map((point) => point.x))).toBeCloseTo(-2);
    expect(Math.max(...surface.vertices.map((point) => point.y))).toBeCloseTo(2.5);
  });
});
