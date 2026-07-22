import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { matchCameraView, moveOrbitFocus, worldUnitsPerNdc } from "./camera";
import {
  BUILD_SURFACE_Y,
  CONSTRUCTION_GRID_Y,
  getBuildSurfaceCenter,
  GROUND_PLANE_SIZE,
  GROUND_PLANE_Y,
  VIEWPORT_FAR_DISTANCE,
} from "./viewportConfig";

describe("viewport camera behavior", () => {
  it("moves the camera and orbit target together", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(10, 8, 10);
    const controls = { object: camera, target: new THREE.Vector3(), update: () => undefined };

    moveOrbitFocus(controls, new THREE.Vector3(4, 0, 0));

    expect(camera.position.toArray()).toEqual([14, 8, 10]);
    expect(controls.target.toArray()).toEqual([4, 0, 0]);
  });

  it("preserves visible height across projection changes", () => {
    const target = new THREE.Vector3();
    const perspective = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    perspective.position.set(0, 0, 10);
    const orthographic = new THREE.OrthographicCamera(-500, 500, 500, -500, 0.1, 1000);

    matchCameraView(perspective, orthographic, target, 1000);
    expect(worldUnitsPerNdc(orthographic, target, 1000)).toBeCloseTo(
      worldUnitsPerNdc(perspective, target, 1000),
    );

    const restored = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    matchCameraView(orthographic, restored, target, 1000);
    expect(restored.position.distanceTo(target)).toBeCloseTo(10);
  });

  it("keeps the construction grid and ground on one build surface", () => {
    expect(GROUND_PLANE_Y).toBe(BUILD_SURFACE_Y);
    expect(CONSTRUCTION_GRID_Y - GROUND_PLANE_Y).toBeCloseTo(0.002);
    expect(BUILD_SURFACE_Y).toBe(-0.5);
  });

  it("keeps the ground footprint centered under the camera through the far clip", () => {
    expect(getBuildSurfaceCenter({ x: 240, z: -180 })).toEqual({
      x: 240, y: BUILD_SURFACE_Y, z: -180,
    });
    expect(GROUND_PLANE_SIZE / 2).toBe(VIEWPORT_FAR_DISTANCE);
  });
});
