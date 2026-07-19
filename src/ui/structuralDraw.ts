import * as THREE from "three";
import { VALID_STRUT_LENGTHS } from "../core/constants";
import { getStraightStrutTarget } from "../core/placement";
import type { FaceName, NodeData } from "../core/types";

const ALL_FACES: readonly FaceName[] = ["top", "bottom", "front", "back", "left", "right"];

export interface StructuralDrawCandidate {
  face: FaceName;
  length: number;
}

export type StructuralDrawAxis = "x" | "y" | "z";

export type StructuralDrawShortcut =
  | { kind: "length"; length: number }
  | { kind: "axis"; axis: StructuralDrawAxis };

export function getStructuralDrawShortcut(key: string): StructuralDrawShortcut | null {
  const normalized = key.toLowerCase();
  if (normalized === "x" || normalized === "y" || normalized === "z") {
    return { kind: "axis", axis: normalized };
  }
  const length = Number(normalized);
  return VALID_STRUT_LENGTHS.includes(length) ? { kind: "length", length } : null;
}

export function getFaceForAxisLock(
  axis: StructuralDrawAxis,
  currentFace: FaceName,
  availableFaces: readonly FaceName[],
): FaceName | null {
  const facesByAxis: Record<StructuralDrawAxis, [FaceName, FaceName]> = {
    x: ["right", "left"],
    y: ["top", "bottom"],
    z: ["front", "back"],
  };
  const candidates = facesByAxis[axis];
  if (candidates.includes(currentFace) && availableFaces.includes(currentFace)) return currentFace;
  return candidates.find((face) => availableFaces.includes(face)) ?? null;
}

export function getStructuralDirectionLabel(face: FaceName): string {
  const labels: Record<FaceName, string> = {
    right: "X+",
    left: "X−",
    top: "Y+",
    bottom: "Y−",
    front: "Z+",
    back: "Z−",
  };
  return labels[face];
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
