import { describe, expect, it } from "vitest";
import {
  decomposeStrutRun,
  getCorner45ConnectionFaces,
  getNearestStrutLength,
  getStraightConnectionFaces,
  getStraightStrutTarget,
  validateNodePlacement,
  validateStrutPlacement,
  validateWidgetPlacement,
} from "./placement";
import type { Attachments, NodeData, SceneData } from "./types";

describe("placement rules", () => {
  it("requires node centers on the unit grid with no touching node volumes", () => {
    const scene = makeScene(node("a", { x: 0, y: 0, z: 0 }));
    expect(validateNodePlacement(scene, { x: 0.5, y: 0, z: 0 })).toEqual({
      valid: false,
      reason: "off-grid",
    });
    expect(validateNodePlacement(scene, { x: 1, y: 0, z: 0 })).toEqual({
      valid: false,
      reason: "node-contact",
    });
    expect(validateNodePlacement(scene, { x: 2, y: 0, z: 0 })).toEqual({ valid: true });
  });

  it("calculates straight targets and chooses the nearest catalog length", () => {
    const source = node("a", { x: 0, y: 0, z: 0 });
    expect(getStraightStrutTarget(source, "right", 3)).toEqual({ x: 4, y: 0, z: 0 });
    expect(getNearestStrutLength(source, "right", { x: 7, y: 0, z: 0 })).toBe(7);
  });

  it("infers straight and corner endpoint faces without Three.js", () => {
    const source = node("a", { x: 0, y: 0, z: 0 });
    expect(getStraightConnectionFaces(source, node("b", { x: 4, y: 0, z: 0 }))).toEqual({
      fromFace: "right",
      toFace: "left",
    });
    expect(getCorner45ConnectionFaces("right", source, node("b", { x: 3, y: 3, z: 0 }))).toEqual({
      fromFace: "right",
      toFace: "bottom",
    });
  });

  it("reports why a straight strut is rejected", () => {
    const scene = makeScene(
      node("a", { x: 0, y: 0, z: 0 }),
      node("b", { x: 4, y: 0, z: 0 }),
      node("diagonal", { x: 4, y: 4, z: 0 }),
    );
    expect(validateStrutPlacement(scene, {
      nodeA: "a", faceA: "right", nodeB: "b", faceB: "left",
    })).toEqual({ valid: true });
    expect(validateStrutPlacement(scene, {
      nodeA: "a", faceA: "right", nodeB: "diagonal", faceB: "left",
    })).toEqual({ valid: false, reason: "not-axis-aligned" });
    expect(validateStrutPlacement(scene, {
      nodeA: "a", faceA: "top", nodeB: "b", faceB: "bottom",
    })).toEqual({ valid: false, reason: "not-axis-aligned" });
  });

  it("accepts a planar corner whose two runs use different catalog lengths", () => {
    const scene = makeScene(
      node("a", { x: 0, y: 0, z: 0 }),
      node("b", { x: 3, y: 7, z: 0 }),
    );
    expect(validateStrutPlacement(scene, {
      nodeA: "a",
      faceA: "right",
      nodeB: "b",
      faceB: "bottom",
      kind: "corner",
    })).toEqual({ valid: true });
  });

  it("reserves a node face for exactly one strut or widget", () => {
    const occupied = node("a", { x: 0, y: 0, z: 0 });
    occupied.attachments.top = { occupied: true, occupantId: "existing", occupantType: "strut" };
    expect(validateWidgetPlacement(makeScene(occupied), { nodeId: "a", face: "top" })).toEqual({
      valid: false,
      reason: "occupied-face",
    });
  });

  it("decomposes clear runs using catalog struts and unit nodes", () => {
    expect(decomposeStrutRun(3)).toEqual([3]);
    expect(decomposeStrutRun(5)).toEqual([1, 3]);
    expect(decomposeStrutRun(2)).toBeNull();
  });
});

function makeScene(...nodes: NodeData[]): SceneData {
  return {
    nodes: Object.fromEntries(nodes.map((value) => [value.id, value])),
    struts: {},
    panels: {},
    widgets: {},
  };
}

function node(id: string, position: NodeData["position"]): NodeData {
  return { id, position, attachments: emptyAttachments() };
}

function emptyAttachments(): Attachments {
  return {
    top: { occupied: false }, bottom: { occupied: false },
    front: { occupied: false }, back: { occupied: false },
    left: { occupied: false }, right: { occupied: false },
  };
}
