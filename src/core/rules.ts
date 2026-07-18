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

export interface PlaneData {
  normal: Vec3;
  constant: number;
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

export function isValidCorner45Footprint(delta: Vec3, faceA: FaceName, faceB: FaceName): boolean {
  const normalA = faceNormal(faceA);
  const normalB = faceNormal(faceB);
  if (!approximatelyEqual(dot(normalA, normalB), 0)) return false;

  const movingAxes = AXES.filter((axis) => Math.abs(delta[axis]) > RULE_EPSILON);
  if (movingAxes.length !== 2) return false;

  const axisA = faceAxis(faceA);
  const axisB = faceAxis(faceB);
  if (axisA === axisB) return false;
  if (!movingAxes.includes(axisA) || !movingAxes.includes(axisB)) return false;

  if (Math.sign(delta[axisA]) !== Math.sign(normalA[axisA])) return false;
  if (Math.sign(delta[axisB]) !== -Math.sign(normalB[axisB])) return false;

  const absA = Math.abs(delta[axisA]);
  const absB = Math.abs(delta[axisB]);
  return equalValidFootprint(absA, absB) ||
    equalValidFootprint(absA - nodeSize, absB - nodeSize);
}

export function getStrutRoutePoints(endpoints: StrutEndpoints): Vec3[] {
  const from = getAttachmentPosition(endpoints.nodeA, endpoints.faceA);
  const to = getAttachmentPosition(endpoints.nodeB, endpoints.faceB);

  if (endpoints.kind !== "corner45") return [from, to];

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

export function getCoplanarPlane(points: Vec3[]): PlaneData | null {
  const uniquePoints = uniqueVec3(points);
  if (uniquePoints.length < 3) return null;

  for (let i = 0; i < uniquePoints.length - 2; i += 1) {
    for (let j = i + 1; j < uniquePoints.length - 1; j += 1) {
      for (let k = j + 1; k < uniquePoints.length; k += 1) {
        const normal = normalize(cross(
          sub(uniquePoints[j], uniquePoints[i]),
          sub(uniquePoints[k], uniquePoints[i]),
        ));
        if (length(normal) < 0.0001) continue;

        const constant = dot(normal, uniquePoints[i]);
        if (uniquePoints.every((point) => Math.abs(dot(normal, point) - constant) < RULE_EPSILON)) {
          const canonicalNormal = canonicalizeNormal(normal);
          return { normal: canonicalNormal, constant: dot(canonicalNormal, uniquePoints[i]) };
        }
      }
    }
  }

  return null;
}

export function orderCoplanarPoints(points: Vec3[], normal: Vec3): Vec3[] {
  const uniquePoints = uniqueVec3(points);
  if (uniquePoints.length < 3) return uniquePoints;

  const center = scale(
    uniquePoints.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }),
    1 / uniquePoints.length,
  );
  const basisU = normalize(sub(uniquePoints[0], center));
  if (length(basisU) < 0.0001) return uniquePoints;
  const basisV = normalize(cross(normal, basisU));

  return [...uniquePoints].sort((a, b) => {
    const da = sub(a, center);
    const db = sub(b, center);
    const angleA = Math.atan2(dot(da, basisV), dot(da, basisU));
    const angleB = Math.atan2(dot(db, basisV), dot(db, basisU));
    return angleA - angleB;
  });
}

export function insetCoplanarPolygon(points: Vec3[], normal: Vec3, distance: number): Vec3[] {
  if (points.length < 3 || distance === 0) return points;

  const orientedPoints = orientPolygonToNormal(points, normal);
  return orientedPoints.map((point, index) => {
    const previous = orientedPoints[(index - 1 + orientedPoints.length) % orientedPoints.length];
    const next = orientedPoints[(index + 1) % orientedPoints.length];

    const incomingDirection = normalize(sub(point, previous));
    const outgoingDirection = normalize(sub(next, point));
    const incomingOffset = scale(normalize(cross(normal, incomingDirection)), distance);
    const outgoingOffset = scale(normalize(cross(normal, outgoingDirection)), distance);

    return intersectCoplanarLines(
      add(previous, incomingOffset),
      incomingDirection,
      add(point, outgoingOffset),
      outgoingDirection,
      normal,
    ) ?? add(point, scale(normalize(add(incomingOffset, outgoingOffset)), distance));
  });
}

export function getPolygonNormal(points: Vec3[]): Vec3 | null {
  if (points.length < 3) return null;
  const areaNormal = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return add(sum, cross(point, next));
  }, { x: 0, y: 0, z: 0 });
  const normal = normalize(areaNormal);
  return length(normal) < 0.0001 ? null : normal;
}

export function insetHullPolygon(points: Vec3[], normal: Vec3, distance: number): Vec3[] {
  if (points.length < 3 || distance === 0) return points;

  const orientedPoints = orientPolygonToNormal(points, normal);
  return orientedPoints.map((point, index) => {
    const previous = orientedPoints[(index - 1 + orientedPoints.length) % orientedPoints.length];
    const next = orientedPoints[(index + 1) % orientedPoints.length];
    const incoming = normalize(sub(point, previous));
    const outgoing = normalize(sub(next, point));
    const incomingInset = normalize(cross(normal, incoming));
    const outgoingInset = normalize(cross(normal, outgoing));
    const insetDirection = normalize(add(incomingInset, outgoingInset));

    // Keep corners beveled so separated tube joints remain visible rather than being bridged.
    return add(point, scale(insetDirection, distance));
  });
}

export function triangulatePolygon(points: Vec3[], normal: Vec3): number[] | null {
  if (points.length < 3) return null;
  const basisU = getPolygonBasisU(points);
  if (!basisU) return null;
  const basisV = normalize(cross(normal, basisU));
  if (length(basisV) < 0.0001) return null;

  const projected = points.map((point) => ({ x: dot(point, basisU), y: dot(point, basisV) }));
  const area = polygonArea(projected);
  if (Math.abs(area) < RULE_EPSILON) return null;

  const remaining = points.map((_, index) => index);
  const triangles: number[] = [];
  const winding = area > 0 ? 1 : -1;
  let safety = points.length * points.length;

  while (remaining.length > 3 && safety > 0) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length];
      const current = remaining[index];
      const next = remaining[(index + 1) % remaining.length];
      if (winding * triangleArea(projected[previous], projected[current], projected[next]) <= RULE_EPSILON) {
        continue;
      }
      if (remaining.some((candidate) => candidate !== previous && candidate !== current && candidate !== next &&
        pointInTriangle(projected[candidate], projected[previous], projected[current], projected[next]))) {
        continue;
      }

      triangles.push(previous, current, next);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
    safety -= 1;
  }

  if (remaining.length === 3) triangles.push(remaining[0], remaining[1], remaining[2]);
  return triangles;
}

export function offsetPlanePoints(points: Vec3[], normal: Vec3, distance: number): Vec3[] {
  const offset = scale(normalize(normal), distance);
  return points.map((point) => add(point, offset));
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

function orientPolygonToNormal(points: Vec3[], normal: Vec3): Vec3[] {
  const areaNormal = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return add(sum, cross(point, next));
  }, { x: 0, y: 0, z: 0 });

  return dot(areaNormal, normal) >= 0 ? points : [...points].reverse();
}

function intersectCoplanarLines(
  pointA: Vec3,
  directionA: Vec3,
  pointB: Vec3,
  directionB: Vec3,
  normal: Vec3,
): Vec3 | null {
  const denominator = dot(cross(directionA, directionB), normal);
  if (Math.abs(denominator) < 0.0001) return null;

  const t = dot(cross(sub(pointB, pointA), directionB), normal) / denominator;
  return add(pointA, scale(directionA, t));
}

function getPolygonBasisU(points: Vec3[]): Vec3 | null {
  for (let index = 1; index < points.length; index += 1) {
    const basis = normalize(sub(points[index], points[0]));
    if (length(basis) >= 0.0001) return basis;
  }
  return null;
}

function polygonArea(points: Array<{ x: number; y: number }>): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function triangleArea(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTriangle(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const areaA = triangleArea(point, a, b);
  const areaB = triangleArea(point, b, c);
  const areaC = triangleArea(point, c, a);
  const hasNegative = areaA < -RULE_EPSILON || areaB < -RULE_EPSILON || areaC < -RULE_EPSILON;
  const hasPositive = areaA > RULE_EPSILON || areaB > RULE_EPSILON || areaC > RULE_EPSILON;
  return !(hasNegative && hasPositive);
}

function uniqueVec3(points: Vec3[]): Vec3[] {
  const unique: Vec3[] = [];
  for (const point of points) {
    if (!unique.some((existing) => length(sub(existing, point)) < RULE_EPSILON)) {
      unique.push(point);
    }
  }
  return unique;
}

function canonicalizeNormal(normal: Vec3): Vec3 {
  for (const axis of AXES) {
    if (Math.abs(normal[axis]) < RULE_EPSILON) continue;
    const directed = normal[axis] > 0 ? normal : scale(normal, -1);
    return {
      x: Math.abs(directed.x) < RULE_EPSILON ? 0 : directed.x,
      y: Math.abs(directed.y) < RULE_EPSILON ? 0 : directed.y,
      z: Math.abs(directed.z) < RULE_EPSILON ? 0 : directed.z,
    };
  }
  return normal;
}
