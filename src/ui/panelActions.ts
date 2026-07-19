import type { SceneData } from "../core/types";
import { getPanelLoopThroughStrut, validatePanelPlacement } from "../core/scene";

export interface PanelActionState {
  status: string | null;
  canAddOuter: boolean;
  canAddInner: boolean;
  canSelectLoop: boolean;
}

export function getPanelActionState(scene: SceneData, strutIds: string[]): PanelActionState {
  if (strutIds.length === 0) {
    return { status: null, canAddOuter: false, canAddInner: false, canSelectLoop: false };
  }

  const loopAvailable = strutIds.length === 1 && getPanelLoopThroughStrut(scene, strutIds[0]) !== null;
  if (loopAvailable) {
    return {
      status: "1 strut · loop available",
      canAddOuter: false,
      canAddInner: false,
      canSelectLoop: true,
    };
  }

  const outer = validatePanelPlacement(scene, strutIds, "top");
  const inner = validatePanelPlacement(scene, strutIds, "bottom");
  const prefix = `${new Set(strutIds).size} struts`;
  if (outer.valid || inner.valid) {
    return {
      status: `${prefix} · closed loop`,
      canAddOuter: outer.valid,
      canAddInner: inner.valid,
      canSelectLoop: false,
    };
  }

  const reason = outer.reason ?? inner.reason;
  const detail = reason === "invalid-brush"
    ? "invalid surface"
    : reason === "side-occupied"
      ? "both sides filled"
      : "open or branched";
  return {
    status: `${prefix} · ${detail}`,
    canAddOuter: false,
    canAddInner: false,
    canSelectLoop: false,
  };
}
