import * as THREE from "three";

export type CameraMode = "perspective" | "orthographic";

interface OrbitTarget {
  object: THREE.Camera;
  target: THREE.Vector3;
  update: () => void;
}

/** Re-center an orbit without changing the current view offset. */
export function moveOrbitFocus(controls: OrbitTarget, target: THREE.Vector3): void {
  const translation = target.clone().sub(controls.target);
  controls.object.position.add(translation);
  controls.target.copy(target);
  controls.update();
}

/** Match framing when changing between perspective and orthographic projection. */
export function matchCameraView(
  source: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  destination: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  viewportHeight: number,
): void {
  destination.position.copy(source.position);
  destination.quaternion.copy(source.quaternion);
  destination.up.copy(source.up);

  if (isPerspectiveCamera(source) && isOrthographicCamera(destination)) {
    const distance = Math.max(source.position.distanceTo(target), 0.001);
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(source.fov) / 2);
    destination.zoom = viewportHeight / visibleHeight;
  } else if (isOrthographicCamera(source) && isPerspectiveCamera(destination)) {
    const visibleHeight = viewportHeight / Math.max(source.zoom, 0.001);
    const distance = visibleHeight /
      (2 * Math.tan(THREE.MathUtils.degToRad(destination.fov) / 2));
    const offset = source.position.clone().sub(target).normalize().multiplyScalar(distance);
    destination.position.copy(target).add(offset);
  }
  destination.updateProjectionMatrix();
}

/** Half of the visible world-space height, matching an NDC delta whose full range is two. */
export function worldUnitsPerNdc(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  focusPoint: THREE.Vector3,
  viewportHeight: number,
): number {
  if (isOrthographicCamera(camera)) {
    return viewportHeight / (2 * Math.max(camera.zoom, 0.001));
  }
  const distance = camera.position.distanceTo(focusPoint);
  return distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}

function isPerspectiveCamera(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
): camera is THREE.PerspectiveCamera {
  return camera instanceof THREE.PerspectiveCamera;
}

function isOrthographicCamera(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
): camera is THREE.OrthographicCamera {
  return camera instanceof THREE.OrthographicCamera;
}
