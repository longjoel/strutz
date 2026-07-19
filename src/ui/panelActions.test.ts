import { describe, expect, it } from "vitest";
import { addPanelToScene, createPanelFromStruts } from "../core/scene";
import type { Attachments, NodeData, SceneData, StrutData } from "../core/types";
import { getPanelActionState } from "./panelActions";

describe("panel toolbar actions", () => {
  const loopIds = ["ab", "bc", "cd", "da"];

  it("reports selection topology and explicit side availability", () => {
    const scene = createSquareScene();
    expect(getPanelActionState(scene, [])).toEqual({
      status: null,
      canAddOuter: false,
      canAddInner: false,
      canSelectLoop: false,
    });
    expect(getPanelActionState(scene, ["ab"])).toEqual({
      status: "1 strut · loop available",
      canAddOuter: false,
      canAddInner: false,
      canSelectLoop: true,
    });
    expect(getPanelActionState(scene, loopIds.slice(0, 3))).toEqual({
      status: "3 struts · open or branched",
      canAddOuter: false,
      canAddInner: false,
      canSelectLoop: false,
    });
    expect(getPanelActionState(scene, loopIds)).toEqual({
      status: "4 struts · closed loop",
      canAddOuter: true,
      canAddInner: true,
      canSelectLoop: false,
    });

    const outer = createPanelFromStruts(scene, loopIds, "top")!;
    const withOuter = addPanelToScene(scene, outer);
    expect(getPanelActionState(withOuter, loopIds)).toEqual({
      status: "4 struts · closed loop",
      canAddOuter: false,
      canAddInner: true,
      canSelectLoop: false,
    });

    const inner = createPanelFromStruts(withOuter, loopIds, "bottom")!;
    const withBoth = addPanelToScene(withOuter, inner);
    expect(getPanelActionState(withBoth, loopIds)).toEqual({
      status: "4 struts · both sides filled",
      canAddOuter: false,
      canAddInner: false,
      canSelectLoop: false,
    });
  });
});

function createSquareScene(): SceneData {
  const nodes: Record<string, NodeData> = {
    a: node("a", 0, 0),
    b: node("b", 4, 0),
    c: node("c", 4, 4),
    d: node("d", 0, 4),
  };
  const struts: Record<string, StrutData> = {
    ab: strut("ab", "a", "right", "b", "left"),
    bc: strut("bc", "b", "top", "c", "bottom"),
    cd: strut("cd", "c", "left", "d", "right"),
    da: strut("da", "d", "bottom", "a", "top"),
  };
  return { nodes, struts, panels: {}, widgets: {} };
}

function node(id: string, x: number, y: number): NodeData {
  return { id, position: { x, y, z: 0 }, attachments: emptyAttachments() };
}

function strut(
  id: string,
  nodeA: string,
  faceA: StrutData["faceA"],
  nodeB: string,
  faceB: StrutData["faceB"],
): StrutData {
  return { id, nodeA, faceA, nodeB, faceB, length: 3 };
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
