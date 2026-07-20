import { describe, expect, it } from "vitest";
import {
  decomposeStrutRun,
  getCorner45ConnectionFaces,
  getNearestStrutLength,
  planStraightStrutRun,
  getStraightConnectionFaces,
  getStraightStrutTarget,
  validateNodePlacement,
  validateStrutPlacement,
  validateWidgetPlacement,
} from "./placement";
import type { Attachments, NodeData, SceneData } from "./types";
import { addStraightStrutRunsToScene, addStrutToScene } from "./scene";

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

  it("splits a length-7 run around an existing intersecting node", () => {
    const scene = makeScene(
      node("source", { x: 0, y: 0, z: 0 }),
      node("middle", { x: 4, y: 0, z: 0 }),
      node("target", { x: 8, y: 0, z: 0 }),
    );

    expect(validateStrutPlacement(scene, {
      nodeA: "source",
      faceA: "right",
      nodeB: "target",
      faceB: "left",
    })).toEqual({ valid: false, reason: "node-intersection" });

    expect(planStraightStrutRun(scene, "source", "right", 7)).toEqual({
      nodes: [
        { position: { x: 0, y: 0, z: 0 }, existingNodeId: "source" },
        { position: { x: 4, y: 0, z: 0 }, existingNodeId: "middle" },
        { position: { x: 8, y: 0, z: 0 }, existingNodeId: "target" },
      ],
      segments: [
        { fromIndex: 0, toIndex: 1, length: 3 },
        { fromIndex: 1, toIndex: 2, length: 3 },
      ],
    });
  });

  it("atomically places the split run instead of overlapping the middle node", () => {
    const original = makeScene(
      node("source", { x: 0, y: 0, z: 0 }),
      node("middle", { x: 4, y: 0, z: 0 }),
    );

    const result = addStraightStrutRunsToScene(original, ["source"], "right", 7);

    expect(Object.values(result.nodes).map((value) => value.position)).toContainEqual({ x: 8, y: 0, z: 0 });
    expect(Object.values(result.struts).map((strut) => strut.length).sort()).toEqual([3, 3]);
    expect(result.nodes.middle.attachments.left.occupied).toBe(true);
    expect(result.nodes.middle.attachments.right.occupied).toBe(true);
  });

  it("inserts a shared node and subdivides both perpendicular length-7 runs", () => {
    const base = makeScene(
      node("north", { x: 0, y: 0, z: 4 }),
      node("south", { x: 0, y: 0, z: -4 }),
      node("east", { x: 4, y: 0, z: 0 }),
      node("west", { x: -4, y: 0, z: 0 }),
    );
    const withExistingRun = addStrutToScene(base, {
      id: "north-south",
      nodeA: "north",
      faceA: "back",
      nodeB: "south",
      faceB: "front",
      length: 7,
    });

    expect(validateStrutPlacement(withExistingRun, {
      nodeA: "east",
      faceA: "left",
      nodeB: "west",
      faceB: "right",
    })).toEqual({ valid: false, reason: "strut-intersection" });

    const result = addStraightStrutRunsToScene(withExistingRun, ["east"], "left", 7);
    const crossingNode = Object.values(result.nodes).find((value) =>
      value.position.x === 0 && value.position.y === 0 && value.position.z === 0);

    expect(crossingNode).toBeDefined();
    expect(Object.values(result.struts).map((strut) => strut.length).sort()).toEqual([3, 3, 3, 3]);
    expect(crossingNode?.attachments.front.occupied).toBe(true);
    expect(crossingNode?.attachments.back.occupied).toBe(true);
    expect(crossingNode?.attachments.left.occupied).toBe(true);
    expect(crossingNode?.attachments.right.occupied).toBe(true);
  });

  it("rejects collinear strut overlap atomically", () => {
    const base = makeScene(
      node("existing-start", { x: 0, y: 0, z: 0 }),
      node("existing-end", { x: 8, y: 0, z: 0 }),
      node("new-start", { x: -4, y: 0, z: 0 }),
    );
    const withExistingRun = addStrutToScene(base, {
      id: "existing",
      nodeA: "existing-start",
      faceA: "right",
      nodeB: "existing-end",
      faceB: "left",
      length: 7,
    });

    expect(addStraightStrutRunsToScene(withExistingRun, ["new-start"], "right", 7))
      .toBe(withExistingRun);
  });

  it("rejects a crossing when either resulting clear span is not decomposable", () => {
    const base = makeScene(
      node("north", { x: 1, y: 0, z: 4 }),
      node("south", { x: 1, y: 0, z: -4 }),
      node("east", { x: 4, y: 0, z: 0 }),
    );
    const withExistingRun = addStrutToScene(base, {
      id: "offset-crossing",
      nodeA: "north",
      faceA: "back",
      nodeB: "south",
      faceB: "front",
      length: 7,
    });

    expect(addStraightStrutRunsToScene(withExistingRun, ["east"], "left", 7))
      .toBe(withExistingRun);
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
    expect(validateWidgetPlacement(makeScene(occupied), {
      kind: "antenna", nodeId: "a", face: "top", rotation: 0,
    })).toEqual({
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
