import { describe, expect, it } from "vitest";
import { collisionBoxesOverlap, getWidgetAxes, type OrientedCollisionBox } from "./widgetGeometry";

describe("widget collision geometry", () => {
  it("matches viewport attachment axes for every node face", () => {
    expect(getWidgetAxes("top", 0)).toEqual({
      x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 },
    });
    expect(getWidgetAxes("front", 0)).toEqual({
      x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 0, z: 1 }, z: { x: 0, y: -1, z: 0 },
    });
    const rotated = getWidgetAxes("right", 1).x;
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(-1);
  });

  it("allows touching boxes and rejects positive overlap", () => {
    const a = box(0);
    expect(collisionBoxesOverlap(a, box(2))).toBe(false);
    expect(collisionBoxesOverlap(a, box(1.99))).toBe(true);
  });
});

function box(x: number): OrientedCollisionBox {
  return {
    center: { x, y: 0, z: 0 },
    axes: [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
    halfSize: { x: 1, y: 1, z: 1 },
  };
}
