import type { FaceName } from "./types";

export const CURRENT_SCENE_VERSION = 2;
export const DEFAULT_LAYER_ID = "default";

/** The construction catalog. Add future size families here, not in UI code. */
export const CONSTRUCTION_RULES = {
  gridSize: 1,
  nodeSize: 1,
  strutWidth: 1,
  connectorOffset: 0.15,
  validStrutLengths: [1, 3, 7] as readonly number[],
} as const;

/** glTF defines one coordinate unit as one meter. */
export const PHYSICAL_SCALE = {
  referenceStrutLength: 3,
  referenceMeters: 2,
  metersPerConstructionUnit: 2 / 3,
} as const;

export const WHEEL_GEOMETRY = {
  radius: 2,
  width: 2,
  axleExtension: 0.5,
  axleRadius: 0.25,
  radialSegments: 32,
} as const;

export const GRID_SIZE = CONSTRUCTION_RULES.gridSize;
export const nodeSize = CONSTRUCTION_RULES.nodeSize;
export const strutWidth = CONSTRUCTION_RULES.strutWidth;
export const connectorOffset = CONSTRUCTION_RULES.connectorOffset;
export const VALID_STRUT_LENGTHS = CONSTRUCTION_RULES.validStrutLengths;

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
