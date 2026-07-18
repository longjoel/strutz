import * as THREE from "three";
import { VALID_STRUT_LENGTHS } from "../core/constants";
import { getStraightStrutTarget } from "../core/placement";
import type { FaceName, NodeData } from "../core/types";

const ALL_FACES: readonly FaceName[] = ["top", "bottom", "front", "back", "left", "right"];

export interface StructuralDrawCandidate {
  face: FaceName;
  length: number;
}

/** Pick the axis, sign, and catalog length whose endpoint is nearest the mouse on screen. */
export function getNearestStructuralDrawCandidate(
  sourceNode: NodeData,
  camera: THREE.Camera,
  pointerNdc: THREE.Vector2,
  availableFaces: readonly FaceName[] = ALL_FACES,
): StructuralDrawCandidate | null {
  let nearest: (StructuralDrawCandidate & { distanceSquared: number }) | null = null;

  for (const face of availableFaces) {
    for (const length of VALID_STRUT_LENGTHS) {
      const target = getStraightStrutTarget(sourceNode, face, length);
      const projected = new THREE.Vector3(target.x, target.y, target.z).project(camera);
      const distanceSquared = (projected.x - pointerNdc.x) ** 2 + (projected.y - pointerNdc.y) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared) {
        nearest = { face, length, distanceSquared };
      }
    }
  }

  return nearest ? { face: nearest.face, length: nearest.length } : null;
}
