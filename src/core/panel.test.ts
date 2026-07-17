import { describe, expect, it } from "vitest";
import { createPanelFromStruts, flipPanelInScene, getPanelPoints } from "./scene";
import type { Attachments, NodeData, SceneData, StrutData } from "./types";

describe("panel rules", () => {
  it("creates panels from selected struts when all endpoint nodes are coplanar", () => {
    const scene = createPanelScene({ d: { x: 0, y: 3, z: 0 } });

    expect(getPanelPoints(scene, ["ab", "bc", "cd", "da"])).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 0, y: 3, z: 0 },
    ]);
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd", "da"])).toMatchObject({
      strutIds: ["ab", "bc", "cd", "da"],
      side: "top",
    });
  });

  it("rejects panels when selected strut endpoint nodes are not coplanar", () => {
    const scene = createPanelScene({ d: { x: 0, y: 3, z: 1 } });

    expect(getPanelPoints(scene, ["ab", "bc", "cd", "da"])).toBeNull();
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd", "da"])).toBeNull();
  });

  it("rejects open strut chains instead of spanning their missing boundary", () => {
    const scene = createPanelScene({});

    expect(getPanelPoints(scene, ["ab", "bc", "cd"])).toBeNull();
    expect(createPanelFromStruts(scene, ["ab", "bc", "cd"])).toBeNull();
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
    expect(createPanelFromStruts(
      { ...withTopPanel, panels: { ...withTopPanel.panels, [bottomPanel!.id]: bottomPanel! } },
      ["ab", "bc", "cd", "da"],
    )).toBeNull();
  });
});

function createPanelScene(overrides: Partial<Record<"a" | "b" | "c" | "d", NodeData["position"]>>): SceneData {
  const nodes: Record<string, NodeData> = {
    a: node("a", overrides.a ?? { x: 0, y: 0, z: 0 }),
    b: node("b", overrides.b ?? { x: 3, y: 0, z: 0 }),
    c: node("c", overrides.c ?? { x: 3, y: 3, z: 0 }),
    d: node("d", overrides.d ?? { x: 0, y: 3, z: 0 }),
  };
  const struts: Record<string, StrutData> = {
    ab: strut("ab", "a", "b"),
    bc: strut("bc", "b", "c"),
    cd: strut("cd", "c", "d"),
    da: strut("da", "d", "a"),
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
