import { describe, expect, it } from "vitest";
import { PHYSICAL_SCALE } from "./constants";
import { calculateMassProperties } from "./physics";
import { createNode } from "./scene";
import type { SceneData } from "./types";

describe("mass properties", () => {
  it("uses individual node masses to find center of mass", () => {
    const scene = emptyScene();
    scene.nodes.a = { ...createNode({ x: 0, y: 0, z: 0 }), id: "a", massKg: 10 };
    scene.nodes.b = { ...createNode({ x: 4, y: 0, z: 0 }), id: "b", massKg: 30 };

    const result = calculateMassProperties(scene);

    expect(result.totalMassKg).toBe(40);
    expect(result.centerOfMassUnits).toEqual({ x: 3, y: 0, z: 0 });
    expect(result.centerOfMassMeters.x).toBe(3 * PHYSICAL_SCALE.metersPerConstructionUnit);
  });

  it("adds density-derived strut mass symmetrically", () => {
    const scene = emptyScene();
    scene.nodes.a = { ...createNode({ x: 0, y: 0, z: 0 }), id: "a", massKg: 0 };
    scene.nodes.b = { ...createNode({ x: 4, y: 0, z: 0 }), id: "b", massKg: 0 };
    scene.struts.s = {
      id: "s", nodeA: "a", faceA: "right", nodeB: "b", faceB: "left", length: 3,
    };

    const result = calculateMassProperties(scene, { materialDensityKgPerM3: 1 });

    expect(result.totalMassKg).toBeCloseTo(3 * PHYSICAL_SCALE.metersPerConstructionUnit ** 3);
    expect(result.centerOfMassUnits).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("rejects non-physical density", () => {
    expect(() => calculateMassProperties(emptyScene(), { materialDensityKgPerM3: 0 }))
      .toThrow("Material density");
  });
});

function emptyScene(): SceneData {
  return { nodes: {}, struts: {}, panels: {}, widgets: {} };
}
