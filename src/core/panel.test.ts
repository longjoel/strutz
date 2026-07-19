import { describe, expect, it } from "vitest";
import {
  addPanelToScene,
  createPanelFromStruts,
  flipPanelInScene,
  getPanelLoopThroughStrut,
  getPanelBrushGeometry,
  getPanelPoints,
  validatePanelPlacement,
} from "./scene";
import type { Attachments, NodeData, SceneData, StrutData } from "./types";

describe("panel rules", () => {
  it("finds the closed loop containing a selected strut", () => {
    const scene = createPanelScene({});

    expect(new Set(getPanelLoopThroughStrut(scene, "ab"))).toEqual(new Set(["ab", "bc", "cd", "da"]));
    expect(getPanelLoopThroughStrut({
      ...scene,
      struts: { ab: scene.struts.ab, bc: scene.struts.bc, cd: scene.struts.cd },
    }, "ab")).toBeNull();
  });

  it("creates panels from selected struts when all endpoint nodes are coplanar", () => {
    const scene = createPanelScene({});

    expect(getPanelPoints(scene, ["ab", "bc", "cd", "da"])).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 4, z: 0 },
      { x: 0, y: 4, z: 0 },
    ]);
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd", "da"])).toMatchObject({
      strutIds: ["ab", "bc", "cd", "da"],
      side: "top",
    });
    const top = getPanelBrushGeometry(scene, ["ab", "bc", "cd", "da"], "top");
    const bottom = getPanelBrushGeometry(scene, ["ab", "bc", "cd", "da"], "bottom");
    expect(top?.faceCount).toBe(1);
    expect(top?.points.every((point) => point.z === 0.5)).toBe(true);
    expect(bottom?.points.every((point) => point.z === -0.5)).toBe(true);
  });

  it("uses brush intersections instead of a warped polygon fallback", () => {
    const scene = createPanelScene({ d: { x: 0, y: 4, z: 1 } });

    expect(getPanelPoints(scene, ["ab", "bc", "cd", "da"])).not.toBeNull();
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd", "da"])).not.toBeNull();
    const brush = getPanelBrushGeometry(scene, ["ab", "bc", "cd", "da"]);
    expect(brush).not.toBeNull();
    expect(brush!.indices.length % 3).toBe(0);
  });

  it("rejects open strut chains instead of spanning their missing boundary", () => {
    const scene = createPanelScene({});

    expect(getPanelPoints(scene, ["ab", "bc", "cd"])).toBeNull();
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd"])).toBeNull();
    expect(validatePanelPlacement(scene, ["ab", "bc", "cd"])).toEqual({
      valid: false,
      reason: "invalid-loop",
    });
  });

  it("flips a panel between the top and bottom faces", () => {
    const scene = createPanelScene({});
    const panel = createPanelFromStruts(scene, ["ab", "bc", "cd", "da"]);
    if (!panel) throw new Error("Expected a panel");

    const withPanel = { ...scene, panels: { [panel.id]: panel } };
    expect(flipPanelInScene(withPanel, panel.id).panels[panel.id].side).toBe("bottom");
    expect(flipPanelInScene(
      flipPanelInScene(withPanel, panel.id),
      panel.id,
    ).panels[panel.id].side).toBe("top");
  });

  it("allows one panel on each face of the same closed strut loop", () => {
    const scene = createPanelScene({});
    const topPanel = createPanelFromStruts(scene, ["ab", "bc", "cd", "da"]);
    if (!topPanel) throw new Error("Expected a top panel");

    const withTopPanel = { ...scene, panels: { [topPanel.id]: topPanel } };
    const bottomPanel = createPanelFromStruts(withTopPanel, ["ab", "bc", "cd", "da"]);

    expect(topPanel.side).toBe("top");
    expect(bottomPanel?.side).toBe("bottom");
    expect(validatePanelPlacement(withTopPanel, ["ab", "bc", "cd", "da"], "top")).toEqual({
      valid: false,
      reason: "side-occupied",
    });
    expect(validatePanelPlacement(withTopPanel, ["ab", "bc", "cd", "da"], "bottom")).toEqual({
      valid: true,
    });
    expect(createPanelFromStruts(
      { ...withTopPanel, panels: { ...withTopPanel.panels, [bottomPanel!.id]: bottomPanel! } },
      ["ab", "bc", "cd", "da"],
    )).toBeNull();
    expect(validatePanelPlacement(
      { ...withTopPanel, panels: { ...withTopPanel.panels, [bottomPanel!.id]: bottomPanel! } },
      ["ab", "bc", "cd", "da"],
    )).toEqual({ valid: false, reason: "side-occupied" });
  });

  it("creates an explicitly requested panel side", () => {
    const scene = createPanelScene({});
    const strutIds = ["ab", "bc", "cd", "da"];
    const bottom = createPanelFromStruts(scene, strutIds, "bottom");

    expect(bottom?.side).toBe("bottom");
    const withBottom = addPanelToScene(scene, bottom!);
    expect(createPanelFromStruts(withBottom, strutIds, "bottom")).toBeNull();
    expect(createPanelFromStruts(withBottom, strutIds, "top")?.side).toBe("top");
  });

  it("skins paired 45-degree ribs using brush face intersections", () => {
    const scene = createRibbedHullScene();
    const hull = getPanelBrushGeometry(scene, ["rail-a", "rib-b", "rail-c", "rib-d"]);

    expect(hull).not.toBeNull();
    expect(hull!.faceCount).toBeGreaterThan(0);
  });

  it("builds intentional planar panes for a convex odd-corner brush", () => {
    const scene = createOddCornerBrushScene();
    const brush = getPanelBrushGeometry(scene, ["ab", "bc", "cd", "da"]);

    expect(brush).not.toBeNull();
    expect(brush!.faceCount).toBeGreaterThan(0);
    expect(brush!.indices.length % 3).toBe(0);
  });

  it("allows a triangular panel bounded by two converging struts and a 45-degree corner", () => {
    const scene = createConvergingCornerScene();
    const strutIds = ["origin-x", "x-y", "y-origin"];

    expect(validatePanelPlacement(scene, strutIds, "top")).toEqual({ valid: true });
    expect(createPanelFromStruts(scene, strutIds)).not.toBeNull();
    const brush = getPanelBrushGeometry(scene, strutIds, "top");
    expect(brush).not.toBeNull();
    expect(brush!.indices.length).toBeGreaterThanOrEqual(3);
  });

  it("allows the outer triangular loop of three 45-degree struts around converging spokes", () => {
    const scene = createThreeAxisCornerScene();
    const strutIds = ["x-y", "y-z", "z-x"];

    expect(validatePanelPlacement(scene, strutIds, "top")).toEqual({ valid: true });
    expect(createPanelFromStruts(scene, strutIds)).not.toBeNull();
    expect(getPanelBrushGeometry(scene, strutIds, "top")).not.toBeNull();
  });

  it("allows both sides of the three-corner loop from bad-state.json", () => {
    const scene = createBadStateCornerScene();
    const strutIds = ["y-x", "y-z", "x-z"];

    expect(validatePanelPlacement(scene, strutIds, "top")).toEqual({ valid: true });
    expect(validatePanelPlacement(scene, strutIds, "bottom")).toEqual({ valid: true });
    const outer = getPanelBrushGeometry(scene, strutIds, "top");
    const inner = getPanelBrushGeometry(scene, strutIds, "bottom");
    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(outer!.faceCount).toBe(1);
    expect(inner!.faceCount).toBe(1);
    expect(outer!.points.length).toBeGreaterThan(3);
    expect(inner!.points).toHaveLength(outer!.points.length);

    const outwardNormal = { x: -1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
    const planePosition = (point: NodeData["position"]) =>
      point.x * outwardNormal.x + point.y * outwardNormal.y + point.z * outwardNormal.z;
    expect(outer!.points.every((point) =>
      Math.abs(planePosition(point) - (Math.sqrt(3) + 0.5)) < 0.0001)).toBe(true);
    expect(inner!.points.every((point) =>
      Math.abs(planePosition(point) - (Math.sqrt(3) - 0.5)) < 0.0001)).toBe(true);
    expect(polygonArea(outer!.points)).toBeCloseTo(polygonArea(inner!.points), 8);

    const outerPanel = createPanelFromStruts(scene, strutIds)!;
    const withOuter = addPanelToScene(scene, outerPanel);
    const innerPanel = createPanelFromStruts(withOuter, strutIds)!;
    const withBoth = addPanelToScene(withOuter, innerPanel);
    expect(outerPanel.side).toBe("top");
    expect(innerPanel.side).toBe("bottom");
    expect(Object.keys(withBoth.panels)).toHaveLength(2);
    expect(createPanelFromStruts(withBoth, strutIds)).toBeNull();
  });
});

function polygonArea(points: NodeData["position"][]): number {
  const origin = points[0];
  let area = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const b = points[index];
    const c = points[index + 1];
    const ab = { x: b.x - origin.x, y: b.y - origin.y, z: b.z - origin.z };
    const ac = { x: c.x - origin.x, y: c.y - origin.y, z: c.z - origin.z };
    const cross = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    area += Math.hypot(cross.x, cross.y, cross.z) / 2;
  }
  return area;
}

function createPanelScene(overrides: Partial<Record<"a" | "b" | "c" | "d", NodeData["position"]>>): SceneData {
  const nodes: Record<string, NodeData> = {
    a: node("a", overrides.a ?? { x: 0, y: 0, z: 0 }),
    b: node("b", overrides.b ?? { x: 4, y: 0, z: 0 }),
    c: node("c", overrides.c ?? { x: 4, y: 4, z: 0 }),
    d: node("d", overrides.d ?? { x: 0, y: 4, z: 0 }),
  };
  const struts: Record<string, StrutData> = {
    ab: { ...strut("ab", "a", "b"), faceA: "right", faceB: "left" },
    bc: { ...strut("bc", "b", "c"), faceA: "top", faceB: "bottom" },
    cd: { ...strut("cd", "c", "d"), faceA: "left", faceB: "right" },
    da: { ...strut("da", "d", "a"), faceA: "bottom", faceB: "top" },
  };

  return { nodes, struts, panels: {}, widgets: {} };
}

function createOddCornerBrushScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    a: node("a", { x: 0, y: 0, z: 0 }),
    b: node("b", { x: 4, y: 0, z: 0 }),
    c: node("c", { x: 4, y: 4, z: 0 }),
    d: node("d", { x: 0, y: 4, z: 4 }),
  };
  const struts: Record<string, StrutData> = {
    ab: { ...strut("ab", "a", "b"), faceA: "right", faceB: "left" },
    bc: { ...strut("bc", "b", "c"), faceA: "top", faceB: "bottom" },
    cd: { ...strut("cd", "c", "d"), kind: "corner", faceA: "left", faceB: "back" },
    da: { ...strut("da", "d", "a"), kind: "corner", faceA: "bottom", faceB: "front" },
  };
  return { nodes, struts, panels: {}, widgets: {} };
}

function createConvergingCornerScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    origin: node("origin", { x: 0, y: 0, z: 0 }),
    x: node("x", { x: 4, y: 0, z: 0 }),
    y: node("y", { x: 0, y: 4, z: 0 }),
  };
  const struts: Record<string, StrutData> = {
    "origin-x": { ...strut("origin-x", "origin", "x"), faceA: "right", faceB: "left" },
    "x-y": { ...strut("x-y", "x", "y"), kind: "corner45", faceA: "top", faceB: "right" },
    "y-origin": { ...strut("y-origin", "y", "origin"), faceA: "bottom", faceB: "top" },
  };
  return { nodes, struts, panels: {}, widgets: {} };
}

function createThreeAxisCornerScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    origin: node("origin", { x: 0, y: 0, z: 0 }),
    x: node("x", { x: 4, y: 0, z: 0 }),
    y: node("y", { x: 0, y: 4, z: 0 }),
    z: node("z", { x: 0, y: 0, z: 4 }),
  };
  const struts: Record<string, StrutData> = {
    "origin-x": { ...strut("origin-x", "origin", "x"), faceA: "right", faceB: "left" },
    "origin-y": { ...strut("origin-y", "origin", "y"), faceA: "top", faceB: "bottom" },
    "origin-z": { ...strut("origin-z", "origin", "z"), faceA: "front", faceB: "back" },
    "x-y": { ...strut("x-y", "x", "y"), kind: "corner45", faceA: "top", faceB: "right" },
    "y-z": { ...strut("y-z", "y", "z"), kind: "corner45", faceA: "front", faceB: "top" },
    "z-x": { ...strut("z-x", "z", "x"), kind: "corner45", faceA: "right", faceB: "front" },
  };
  return { nodes, struts, panels: {}, widgets: {} };
}

function createBadStateCornerScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    origin: node("origin", { x: 0, y: 0, z: 0 }),
    x: node("x", { x: -2, y: 0, z: 0 }),
    y: node("y", { x: 0, y: 2, z: 0 }),
    z: node("z", { x: 0, y: 0, z: 2 }),
  };
  const struts: Record<string, StrutData> = {
    "origin-x": { ...strut("origin-x", "origin", "x"), faceA: "left", faceB: "right", length: 1 },
    "origin-y": { ...strut("origin-y", "origin", "y"), faceA: "top", faceB: "bottom", length: 1 },
    "origin-z": { ...strut("origin-z", "origin", "z"), faceA: "front", faceB: "back", length: 1 },
    "y-x": { ...strut("y-x", "y", "x"), kind: "corner", faceA: "left", faceB: "top", length: 1 },
    "y-z": { ...strut("y-z", "y", "z"), kind: "corner", faceA: "front", faceB: "top", length: 1 },
    "x-z": { ...strut("x-z", "x", "z"), kind: "corner", faceA: "front", faceB: "left", length: 1 },
  };
  return { nodes, struts, panels: {}, widgets: {} };
}

function node(id: string, position: NodeData["position"]): NodeData {
  return {
    id,
    position,
    attachments: emptyAttachments(),
  };
}

function strut(id: string, nodeA: string, nodeB: string): StrutData {
  return {
    id,
    nodeA,
    faceA: "right",
    nodeB,
    faceB: "left",
    length: 3,
  };
}

function emptyAttachments(): Attachments {
  return {
    top: { occupied: false },
    bottom: { occupied: false },
    front: { occupied: false },
    back: { occupied: false },
    left: { occupied: false },
    right: { occupied: false },
  };
}

function createRibbedHullScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    a: node("a", { x: 0, y: 0, z: 0 }),
    b: node("b", { x: 4, y: 0, z: 0 }),
    c: node("c", { x: 7, y: 3, z: 0 }),
    d: node("d", { x: 3, y: 3, z: 0 }),
  };
  const struts: Record<string, StrutData> = {
    "rail-a": { ...strut("rail-a", "a", "b"), faceA: "right", faceB: "left" },
    "rib-b": { ...strut("rib-b", "b", "c"), kind: "corner", faceA: "right", faceB: "bottom" },
    "rail-c": { ...strut("rail-c", "c", "d"), faceA: "left", faceB: "right" },
    "rib-d": { ...strut("rib-d", "d", "a"), kind: "corner", faceA: "left", faceB: "top" },
  };

  return { nodes, struts, panels: {}, widgets: {} };
}
