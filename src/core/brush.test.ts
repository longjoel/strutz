import { describe, expect, it } from "vitest";
import { createPanelBrushGeometry, type PanelBrushSegment } from "./brush";

describe("panel brush geometry", () => {
  const square: PanelBrushSegment[] = [
    { from: { x: 0, y: 0, z: 0 }, to: { x: 4, y: 0, z: 0 } },
    { from: { x: 4, y: 0, z: 0 }, to: { x: 4, y: 4, z: 0 } },
    { from: { x: 4, y: 4, z: 0 }, to: { x: 0, y: 4, z: 0 } },
    { from: { x: 0, y: 4, z: 0 }, to: { x: 0, y: 0, z: 0 } },
  ];

  it("clips a flat pane to the inward strut faces", () => {
    const geometry = createPanelBrushGeometry(square, 1, "top");

    expect(geometry?.faceCount).toBe(1);
    expect(geometry?.points).toHaveLength(4);
    expect(geometry?.indices).toHaveLength(6);
    expect(geometry?.points.every((point) => point.z === 0.5)).toBe(true);
    expect(new Set(geometry?.points.map((point) => point.x))).toEqual(new Set([0.5, 3.5]));
    expect(new Set(geometry?.points.map((point) => point.y))).toEqual(new Set([0.5, 3.5]));
  });

  it("keeps canonical inner and outer sides stable when traversal reverses", () => {
    const reversed = [...square].reverse().map((segment) => ({
      from: segment.to,
      to: segment.from,
    }));

    const top = createPanelBrushGeometry(reversed, 1, "top");
    const bottom = createPanelBrushGeometry(reversed, 1, "bottom");

    expect(top?.points.every((point) => point.z === 0.5)).toBe(true);
    expect(bottom?.points.every((point) => point.z === -0.5)).toBe(true);
  });

  it("uses the assembly-relative hint to choose the outer skin", () => {
    const outer = createPanelBrushGeometry(square, 1, "top", { x: 0, y: 0, z: -10 });
    const inner = createPanelBrushGeometry(square, 1, "bottom", { x: 0, y: 0, z: -10 });

    expect(outer?.points.every((point) => point.z === -0.5)).toBe(true);
    expect(inner?.points.every((point) => point.z === 0.5)).toBe(true);
  });

  it("rejects a plane set that cannot bound a pane", () => {
    const collinear: PanelBrushSegment[] = [
      { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } },
      { from: { x: 1, y: 0, z: 0 }, to: { x: 2, y: 0, z: 0 } },
      { from: { x: 2, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 } },
    ];

    expect(createPanelBrushGeometry(collinear, 1, "top")).toBeNull();
  });
});
