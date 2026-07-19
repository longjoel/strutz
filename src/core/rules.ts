import { nodeSize, VALID_STRUT_LENGTHS } from "./constants";
import type { FaceName, StrutKind, Vec3 } from "./types";

export const RULE_EPSILON = 0.01;
export const AXES = ["x", "y", "z"] as const;

export type AxisName = (typeof AXES)[number];

export const FACE_NORMALS: Record<FaceName, Vec3> = {
  top: { x: 0, y: 1, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
  back: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  left: { x: -1, y: 0, z: 0 },
};

export const FACE_AXES: Record<FaceName, AxisName> = {
  top: "y",
  bottom: "y",
  front: "z",
  back: "z",
  right: "x",
  left: "x",
};

export interface StrutEndpoints {
  nodeA: Vec3;
  faceA: FaceName;
  nodeB: Vec3;
  faceB: FaceName;
  kind?: StrutKind;
}

export function faceNormal(face: FaceName): Vec3 {
  return FACE_NORMALS[face];
}

export function faceAxis(face: FaceName): AxisName {
  return FACE_AXES[face];
}

export function centerSpacingForStrutLength(length: number): number {
  return length + nodeSize;
}

export function getAttachmentPosition(nodePosition: Vec3, face: FaceName): Vec3 {
  return add(nodePosition, scale(faceNormal(face), nodeSize / 2));
}

export function isValidStrutLength(length: number): boolean {
  return VALID_STRUT_LENGTHS.some((validLength) => approximatelyEqual(length, validLength));
}

export function isAxisAlignedVector(v: Vec3): boolean {
  return approximatelyEqual(manhattanLength(v), length(v));
}

export function corner45LengthFromAxisDelta(axisDelta: number): number {
  const rawLength = Math.abs(axisDelta);
  const rawMatch = VALID_STRUT_LENGTHS.find((validLength) => approximatelyEqual(rawLength, validLength));
  if (rawMatch !== undefined) return rawMatch;

  const faceLength = rawLength - nodeSize;
  const faceMatch = VALID_STRUT_LENGTHS.find((validLength) => approximatelyEqual(faceLength, validLength));
  return faceMatch ?? rawLength;
}

export function isCornerStrutKind(kind?: StrutKind): boolean {
  return kind === "corner" || kind === "corner45";
}

export function isValidPlanarCornerFootprint(delta: Vec3, faceA: FaceName, faceB: FaceName): boolean {
  const normalA = faceNormal(faceA);
  const normalB = faceNormal(faceB);
  if (!approximatelyEqual(dot(normalA, normalB), 0)) return false;

  const movingAxes = AXES.filter((axis) => Math.abs(delta[axis]) > RULE_EPSILON);
  if (movingAxes.length !== 2) return false;

  const axisA = faceAxis(faceA);
  const axisB = faceAxis(faceB);
  if (axisA === axisB || !movingAxes.includes(axisA) || !movingAxes.includes(axisB)) return false;
  if (Math.sign(delta[axisA]) !== Math.sign(normalA[axisA])) return false;
  if (Math.sign(delta[axisB]) !== -Math.sign(normalB[axisB])) return false;

  const absA = Math.abs(delta[axisA]);
  const absB = Math.abs(delta[axisB]);
  return bothValidFootprints(absA, absB) ||
    bothValidFootprints(absA - nodeSize, absB - nodeSize);
}

/** Legacy square-footprint rule retained for compatibility and focused tests. */
export function isValidCorner45Footprint(delta: Vec3, faceA: FaceName, faceB: FaceName): boolean {
  if (!isValidPlanarCornerFootprint(delta, faceA, faceB)) return false;
  const axisA = faceAxis(faceA);
  const axisB = faceAxis(faceB);
  const absA = Math.abs(delta[axisA]);
  const absB = Math.abs(delta[axisB]);
  return equalValidFootprint(absA, absB) ||
    equalValidFootprint(absA - nodeSize, absB - nodeSize);
}

export function getStrutRoutePoints(endpoints: StrutEndpoints): Vec3[] {
  const from = getAttachmentPosition(endpoints.nodeA, endpoints.faceA);
  const to = getAttachmentPosition(endpoints.nodeB, endpoints.faceB);

  if (!isCornerStrutKind(endpoints.kind)) return [from, to];

  const stub = nodeSize / 2;
  return [
    from,
    add(from, scale(faceNormal(endpoints.faceA), stub)),
    add(to, scale(faceNormal(endpoints.faceB), stub)),
    to,
  ];
}

export function getCorner45PlaneNormal(faceA: FaceName, faceB: FaceName): Vec3 {
  const planeNormal = normalize(cross(faceNormal(faceA), faceNormal(faceB)));
  return length(planeNormal) < 0.0001 ? { x: 0, y: 1, z: 0 } : planeNormal;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < 0.0001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function approximatelyEqual(a: number, b: number, epsilon = RULE_EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

function manhattanLength(v: Vec3): number {
  return Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
}

function equalValidFootprint(a: number, b: number): boolean {
  return approximatelyEqual(a, b) && isValidStrutLength(a);
}

function bothValidFootprints(a: number, b: number): boolean {
  return isValidStrutLength(a) && isValidStrutLength(b);
}
