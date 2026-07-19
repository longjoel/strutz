import { describe, expect, it } from "vitest";
import { createBoxSurface, createStrutSurface, triangulateQuadSurface } from "./geometry";

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
});
