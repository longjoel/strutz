import type { FaceName } from "./types";

export const nodeSize = 1;
export const strutWidth = nodeSize;
export const connectorOffset = 0.15;
export const VALID_STRUT_LENGTHS = [1, 3, 7];

export const OPPOSITE_FACE: Record<FaceName, FaceName> = {
  top: "bottom",
  bottom: "top",
  front: "back",
  back: "front",
  right: "left",
  left: "right",
};

export function oppositeFace(face: FaceName): FaceName {
  return OPPOSITE_FACE[face];
}
