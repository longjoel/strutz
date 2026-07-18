import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { matchCameraView, moveOrbitFocus, worldUnitsPerNdc } from "./camera";
import { CONSTRUCTION_GRID_Y, GROUND_PLANE_Y } from "./viewportConfig";

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

  it("keeps the construction grid one unit above the ground plane", () => {
    expect(CONSTRUCTION_GRID_Y - GROUND_PLANE_Y).toBe(1);
  });
});
