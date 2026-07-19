import { describe, expect, it } from "vitest";
import {
  centerSpacingForStrutLength,
  getStrutRoutePoints,
  isValidCorner45Footprint,
  isValidPlanarCornerFootprint,
  isValidStrutLength,
} from "./rules";

describe("node and strut rules", () => {
  it("accepts only catalog strut lengths", () => {
    expect(isValidStrutLength(1)).toBe(true);
    expect(isValidStrutLength(3)).toBe(true);
    expect(isValidStrutLength(7)).toBe(true);
    expect(isValidStrutLength(2)).toBe(false);
  });

  it("spaces node centers by strut length plus node size", () => {
    expect(centerSpacingForStrutLength(1)).toBe(2);
    expect(centerSpacingForStrutLength(3)).toBe(4);
    expect(centerSpacingForStrutLength(7)).toBe(8);
  });

  it("routes straight struts between opposing attachment faces", () => {
    expect(getStrutRoutePoints({
      nodeA: { x: 0, y: 0, z: 0 },
      faceA: "right",
      nodeB: { x: 4, y: 0, z: 0 },
      faceB: "left",
      kind: "straight",
    })).toEqual([
      { x: 0.5, y: 0, z: 0 },
      { x: 3.5, y: 0, z: 0 },
    ]);
  });

  it("routes 45-degree corner struts through short face stubs", () => {
    expect(getStrutRoutePoints({
      nodeA: { x: 0, y: 0, z: 0 },
      faceA: "right",
      nodeB: { x: 3, y: 3, z: 0 },
      faceB: "bottom",
      kind: "corner45",
    })).toEqual([
      { x: 0.5, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 3, y: 2.5, z: 0 },
    ]);
  });

  it("routes unequal planar corners through the same face stubs", () => {
    expect(getStrutRoutePoints({
      nodeA: { x: 0, y: 0, z: 0 },
      faceA: "right",
      nodeB: { x: 3, y: 7, z: 0 },
      faceB: "bottom",
      kind: "corner",
    })).toEqual([
      { x: 0.5, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 3, y: 6, z: 0 },
      { x: 3, y: 6.5, z: 0 },
    ]);
  });

  it("requires 45-degree corner struts to move across exactly two perpendicular face axes", () => {
    expect(isValidCorner45Footprint(
      { x: 3, y: 3, z: 0 },
      "right",
      "bottom",
    )).toBe(true);

    expect(isValidCorner45Footprint(
      { x: 3, y: 0, z: 0 },
      "right",
      "left",
    )).toBe(false);

    expect(isValidCorner45Footprint(
      { x: 3, y: 4, z: 0 },
      "right",
      "bottom",
    )).toBe(false);
  });

  it("allows planar corners with unequal catalog runs", () => {
    expect(isValidPlanarCornerFootprint(
      { x: 3, y: 7, z: 0 },
      "right",
      "bottom",
    )).toBe(true);
    expect(isValidPlanarCornerFootprint(
      { x: 4, y: 8, z: 0 },
      "right",
      "bottom",
    )).toBe(true);
    expect(isValidPlanarCornerFootprint(
      { x: 3, y: 8, z: 0 },
      "right",
      "bottom",
    )).toBe(false);
  });

});
