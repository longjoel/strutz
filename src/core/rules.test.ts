import { describe, expect, it } from "vitest";
import {
  centerSpacingForStrutLength,
  getCoplanarPlane,
  getPolygonNormal,
  getStrutRoutePoints,
  insetCoplanarPolygon,
  insetHullPolygon,
  isValidCorner45Footprint,
  isValidStrutLength,
  offsetPlanePoints,
  triangulatePolygon,
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

  it("offsets panel points along the coplanar plane normal", () => {
    expect(offsetPlanePoints(
      [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      { x: 0, y: 0, z: 1 },
      0.5,
    )).toEqual([
      { x: 0, y: 0, z: 0.5 },
      { x: 3, y: 0, z: 0.5 },
    ]);
  });

  it("uses a stable positive plane normal regardless of point traversal", () => {
    const clockwise = getCoplanarPlane([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 3, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 3, y: 0, z: 0 },
    ]);
    const counterClockwise = getCoplanarPlane([
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 0, y: 3, z: 0 },
    ]);

    expect(clockwise?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(counterClockwise?.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("insets panel boundaries to the opening inside struts", () => {
    expect(insetCoplanarPolygon(
      [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 3, y: 3, z: 0 },
        { x: 0, y: 3, z: 0 },
      ],
      { x: 0, y: 0, z: 1 },
      0.5,
    )).toEqual([
      { x: 0.5, y: 0.5, z: 0 },
      { x: 2.5, y: 0.5, z: 0 },
      { x: 2.5, y: 2.5, z: 0 },
      { x: 0.5, y: 2.5, z: 0 },
    ]);
  });

  it("insets non-planar hull boundaries while keeping tube joints beveled", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 3, z: 1 },
      { x: 0, y: 3, z: 0 },
    ];
    const normal = getPolygonNormal(points);
    expect(normal).not.toBeNull();

    const inset = insetHullPolygon(points, normal!, 0.5);
    expect(inset).toHaveLength(4);
    expect(inset[0]).not.toEqual(points[0]);
  });

  it("triangulates concave panel boundaries without crossing the interior", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 1.5, y: 1.5, z: 0 },
      { x: 0, y: 3, z: 0 },
    ];
    expect(triangulatePolygon(points, { x: 0, y: 0, z: 1 })).toHaveLength(9);
  });
});
