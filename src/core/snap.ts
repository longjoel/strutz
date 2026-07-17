import type { FaceName, Vec3 } from "./types";
import { VALID_STRUT_LENGTHS } from "./constants";
import {
  faceNormal as ruleFaceNormal,
  getAttachmentPosition,
  isValidStrutLength as isValidRuleStrutLength,
  length,
  sub,
} from "./rules";

export function snapToGrid(point: Vec3, gridSize: number): Vec3 {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
    z: Math.round(point.z / gridSize) * gridSize,
  };
}

export const SNAP_GRID = 1;

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function isValidStrutLength(d: number): boolean {
  return isValidRuleStrutLength(d);
}

export function faceNormal(face: string): Vec3 {
  return isFaceName(face) ? ruleFaceNormal(face) : { x: 0, y: 0, z: 0 };
}

export function vec3toTuple(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z];
}

export function getAttachmentWorldPosition(
  nodePosition: Vec3,
  face: string,
): Vec3 {
  return isFaceName(face) ? getAttachmentPosition(nodePosition, face) : nodePosition;
}

export function findNearestSnapPositions(
  origin: Vec3,
  existingNodes: Vec3[],
): Vec3[] {
  const candidates: Vec3[] = [];

  for (const existing of existingNodes) {
    for (const length of VALID_STRUT_LENGTHS) {
      if (Math.abs(origin.x - existing.x) === length) {
        const cand = { x: existing.x, y: origin.y, z: origin.z };
        if (distance(origin, cand) > 0.01) candidates.push(cand);
      }
      if (Math.abs(origin.y - existing.y) === length) {
        const cand = { x: origin.x, y: existing.y, z: origin.z };
        if (distance(origin, cand) > 0.01) candidates.push(cand);
      }
      if (Math.abs(origin.z - existing.z) === length) {
        const cand = { x: origin.x, y: origin.y, z: existing.z };
        if (distance(origin, cand) > 0.01) candidates.push(cand);
      }
    }
  }

  return candidates;
}

function isFaceName(value: string): value is FaceName {
  return value === "top" ||
    value === "bottom" ||
    value === "front" ||
    value === "back" ||
    value === "left" ||
    value === "right";
}
