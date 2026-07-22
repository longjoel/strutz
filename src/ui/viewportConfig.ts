import { nodeSize } from "../core/constants";

/** Shared build surface: a node centered at Y=0 rests directly on this plane. */
export const BUILD_SURFACE_Y = -nodeSize / 2;

/** A tiny visual offset prevents grid/plane z-fighting without a visible gap. */
export const GROUND_PLANE_Y = BUILD_SURFACE_Y;
export const CONSTRUCTION_GRID_Y = BUILD_SURFACE_Y + 0.002;
export const GRID_FADE_DISTANCE = 100;
export const VIEWPORT_FAR_DISTANCE = 5000;
/** Centered on the camera, so its boundary remains at the far clipping plane. */
export const GROUND_PLANE_SIZE = VIEWPORT_FAR_DISTANCE * 2;

export function getBuildSurfaceCenter(cameraPosition: { x: number; z: number }) {
  return { x: cameraPosition.x, y: GROUND_PLANE_Y, z: cameraPosition.z };
}
