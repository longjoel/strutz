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

/** Main propulsion unit: wheel-sized body followed by a flared exhaust funnel. */
export const ENGINE_GEOMETRY = {
  bodyRadius: 2,
  bodyLength: 2,
  throatRadius: 1.35,
  nozzleRadius: 2.35,
  nozzleLength: 1.25,
  radialSegments: 32,
} as const;

export const COCKPIT_GEOMETRY = {
  length: 3,
  baseRadius: 0.9,
  noseRadius: 0.12,
  radialSegments: 32,
  viewportCenterY: 1.3,
  viewportCenterZ: 0.62,
  viewportWidth: 0.9,
  viewportLength: 0.65,
  viewportThickness: 0.12,
  viewportTilt: -0.255,
  cameraRadius: 0.14,
  cameraLength: 0.18,
  cameraCenterY: 1.3,
  cameraCenterZ: 0.76,
} as const;

export const THRUSTER_GEOMETRY = {
  bodyRadius: 0.28,
  bodyLength: 0.55,
  nozzleRadius: 0.38,
  nozzleLength: 0.4,
  radialSegments: 20,
} as const;

export const REPULSOR_GEOMETRY = {
  mountRadius: 0.28,
  mountLength: 0.18,
  padRadius: 0.62,
  padThickness: 0.18,
  radialSegments: 24,
} as const;

export const DEFAULT_PHYSICS_SETTINGS = {
  materialDensityKgPerM3: 100,
  defaultNodeMassKg: 10,
  panelThicknessUnits: 0.08,
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
