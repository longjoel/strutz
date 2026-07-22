import { describe, expect, it } from "vitest";
import { clampInspectorWidth } from "./InspectorDock";

describe("inspector dock", () => {
  it("keeps drag resizing within usable bounds", () => {
    expect(clampInspectorWidth(120)).toBe(220);
    expect(clampInspectorWidth(337.6)).toBe(338);
    expect(clampInspectorWidth(900)).toBe(520);
  });
});
