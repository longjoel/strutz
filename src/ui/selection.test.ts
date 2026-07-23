import { describe, expect, it } from "vitest";
import { toggleSelectionId } from "./selection";

describe("selection gestures", () => {
  it("adds and removes an id without mutating the current selection", () => {
    const current = new Set(["node-a"]);
    const added = toggleSelectionId(current, "strut-b");
    const removed = toggleSelectionId(added, "node-a");

    expect([...current]).toEqual(["node-a"]);
    expect([...added]).toEqual(["node-a", "strut-b"]);
    expect([...removed]).toEqual(["strut-b"]);
  });
});
