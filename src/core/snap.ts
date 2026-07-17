import type { Vec3 } from "./types";
import { VALID_STRUT_LENGTHS, nodeSize } from "./constants";

export function snapToGrid(point: Vec3, gridSize: number): Vec3 {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
    z: Math.round(point.z / gridSize) * gridSize,
  };
}

export const SNAP_GRID = 1;

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isValidStrutLength(d: number): boolean {
  const epsilon = 0.01;
  return VALID_STRUT_LENGTHS.some((len) => Math.abs(d - len) < epsilon);
}

export function faceNormal(face: string): Vec3 {
  switch (face) {
    case "top":
      return { x: 0, y: 1, z: 0 };
    case "bottom":
      return { x: 0, y: -1, z: 0 };
    case "front":
      return { x: 0, y: 0, z: 1 };
    case "back":
      return { x: 0, y: 0, z: -1 };
    case "right":
      return { x: 1, y: 0, z: 0 };
    case "left":
      return { x: -1, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

export function vec3toTuple(v: Vec3): [number, number, number] {
  return [v.x, v.y, v.z];
}

export function getAttachmentWorldPosition(
  nodePosition: Vec3,
  face: string,
): Vec3 {
  const n = faceNormal(face);
  const half = nodeSize / 2;
  return {
    x: nodePosition.x + n.x * half,
    y: nodePosition.y + n.y * half,
    z: nodePosition.z + n.z * half,
  };
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
