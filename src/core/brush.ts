import type { Vec3 } from "./types";
import { add, cross, dot, length, normalize, scale, sub } from "./rules";

const EPSILON = 1e-5;

export interface PanelBrushSegment {
  from: Vec3;
  to: Vec3;
  /** One actual cross-section axis for routed corner struts. */
  flatNormal?: Vec3;
}

export interface PanelBrushGeometry {
  points: Vec3[];
  indices: number[];
  faceCount: number;
}

export interface PanelSurfacePlane {
  normal: Vec3;
  constant: number;
}

type PanelSide = "top" | "bottom";

interface BrushPlane {
  normal: Vec3;
  constant: number;
  sides: Set<PanelSide>;
}

interface SegmentFrame {
  midpoint: Vec3;
  inward: Vec3;
  surfaceNormal: Vec3;
  inwardExtent: number;
  crossSectionAxes: [Vec3, Vec3];
}

/**
 * Construct a convex pane set using Quake-style oriented brush planes.
 * The returned triangles are grouped into coplanar convex faces.
 */
export function createPanelBrushGeometry(
  segments: PanelBrushSegment[],
  width: number,
  side: PanelSide,
  outwardHint?: Vec3,
  surfacePlane?: PanelSurfacePlane,
): PanelBrushGeometry | null {
  const validSegments = segments.filter(({ from, to }) => length(sub(to, from)) > EPSILON);
  if (validSegments.length < 3) return null;

  const center = average(validSegments.flatMap(({ from, to }) => [from, to]));
  const frames = getSegmentFrames(validSegments, center, surfacePlane?.normal);
  if (!frames) return null;

  orientSurfaceNormals(frames, outwardHint);
  const halfWidth = width / 2;
  const planes: BrushPlane[] = [];
  const orientedSurface = surfacePlane ? getOrientedSurface(surfacePlane, frames[0].surfaceNormal) : null;
  const inwardOffsets: number[] = [];
  for (const frame of frames) {
    const inwardOffset = orientedSurface
      ? getInwardOffsetAcrossSkins(frame, orientedSurface, halfWidth)
      : halfWidth * frame.inwardExtent;
    if (inwardOffset === null) return null;
    inwardOffsets.push(inwardOffset);
    // The opening lies beyond the strut's inward face.
    addPlane(
      planes,
      scale(frame.inward, -1),
      add(frame.midpoint, scale(frame.inward, inwardOffset)),
    );
    // Solve one skin at a time. The opposite skin must not clip a folded pane
    // envelope merely because the local strut normals are non-parallel.
    if (!surfacePlane) {
      const skinNormal = side === "top" ? frame.surfaceNormal : scale(frame.surfaceNormal, -1);
      addPlane(
        planes,
        skinNormal,
        add(frame.midpoint, scale(skinNormal, halfWidth)),
        side,
      );
    }
  }
  if (orientedSurface) {
    addCornerBevelPlanes(
      planes,
      validSegments,
      frames,
      inwardOffsets,
      orientedSurface.normal,
      center,
    );
  }
  if (orientedSurface) {
    const skinNormal = side === "top"
      ? orientedSurface.normal
      : scale(orientedSurface.normal, -1);
    const skinConstant = side === "top"
      ? orientedSurface.constant + halfWidth
      : -orientedSurface.constant + halfWidth;
    addPlane(planes, skinNormal, scale(skinNormal, skinConstant), side);
  }

  const vertices = getBrushVertices(planes);
  if (vertices.length < 3) {
    return null;
  }
  const points: Vec3[] = [];
  const indices: number[] = [];
  let faceCount = 0;
  for (const plane of planes) {
    if (!plane.sides.has(side)) continue;
    const face = sortFaceVertices(
      vertices.filter((vertex) => Math.abs(dot(plane.normal, vertex) - plane.constant) < EPSILON * 8),
      plane.normal,
    );
    if (face.length < 3) continue;

    const start = points.length;
    points.push(...face);
    for (let index = 1; index < face.length - 1; index += 1) {
      indices.push(start, start + index, start + index + 1);
    }
    faceCount += 1;
  }

  return faceCount > 0 ? { points, indices, faceCount } : null;
}

function addCornerBevelPlanes(
  planes: BrushPlane[],
  segments: PanelBrushSegment[],
  frames: SegmentFrame[],
  inwardOffsets: number[],
  surfaceNormal: Vec3,
  center: Vec3,
): void {
  for (let index = 0; index < segments.length; index += 1) {
    const nextIndex = (index + 1) % segments.length;
    if (length(sub(segments[index].to, segments[nextIndex].from)) < EPSILON) continue;

    const first = add(segments[index].to, scale(frames[index].inward, inwardOffsets[index]));
    const second = add(
      segments[nextIndex].from,
      scale(frames[nextIndex].inward, inwardOffsets[nextIndex]),
    );
    const rawEdge = sub(second, first);
    const edge = sub(rawEdge, scale(surfaceNormal, dot(rawEdge, surfaceNormal)));
    if (length(edge) < EPSILON) continue;

    const edgeCenter = scale(add(first, second), 0.5);
    let inward = normalize(cross(edge, surfaceNormal));
    const towardCenter = sub(center, edgeCenter);
    if (dot(inward, towardCenter) < 0) inward = scale(inward, -1);
    addPlane(planes, scale(inward, -1), first);
  }
}

function getSegmentFrames(
  segments: PanelBrushSegment[],
  center: Vec3,
  surfaceNormalHint?: Vec3,
): SegmentFrame[] | null {
  const frames: SegmentFrame[] = [];
  for (const segment of segments) {
    const tangent = normalize(sub(segment.to, segment.from));
    const midpoint = scale(add(segment.from, segment.to), 0.5);
    const towardCenter = sub(center, midpoint);
    if (surfaceNormalHint) {
      const surfaceNormal = normalize(surfaceNormalHint);
      const inwardAxis = normalize(cross(tangent, surfaceNormal));
      if (length(inwardAxis) < EPSILON || Math.abs(dot(inwardAxis, towardCenter)) < EPSILON) return null;
      const inward = dot(inwardAxis, towardCenter) >= 0 ? inwardAxis : scale(inwardAxis, -1);
      const crossSectionAxes = segment.flatNormal && length(segment.flatNormal) > EPSILON
        ? [normalize(segment.flatNormal), normalize(cross(tangent, normalize(segment.flatNormal)))] as [Vec3, Vec3]
        : getCrossSectionAxes(tangent);
      frames.push({ midpoint, inward, surfaceNormal, inwardExtent: 1, crossSectionAxes });
      continue;
    }
    if (segment.flatNormal && length(segment.flatNormal) > EPSILON) {
      const surfaceNormal = normalize(segment.flatNormal);
      const sideAxis = normalize(cross(tangent, surfaceNormal));
      if (Math.abs(dot(sideAxis, towardCenter)) < EPSILON) return null;
      const inward = dot(sideAxis, towardCenter) >= 0 ? sideAxis : scale(sideAxis, -1);
      frames.push({
        midpoint,
        inward,
        surfaceNormal,
        inwardExtent: 1,
        crossSectionAxes: [surfaceNormal, sideAxis],
      });
      continue;
    }

    const [axisA, axisB] = getCrossSectionAxes(tangent);
    const frame = chooseSegmentFrame(midpoint, towardCenter, axisA, axisB);
    if (!frame) return null;
    frames.push({ ...frame, crossSectionAxes: [axisA, axisB] });
  }
  return frames;
}

function chooseSegmentFrame(
  midpoint: Vec3,
  towardCenter: Vec3,
  axisA: Vec3,
  axisB: Vec3,
): SegmentFrame | null {
  const alignmentA = Math.abs(dot(axisA, towardCenter));
  const alignmentB = Math.abs(dot(axisB, towardCenter));
  if (Math.max(alignmentA, alignmentB) < EPSILON) return null;

  const inwardAxis = alignmentA >= alignmentB ? axisA : axisB;
  const surfaceNormal = alignmentA >= alignmentB ? axisB : axisA;
  const inward = dot(inwardAxis, towardCenter) >= 0 ? inwardAxis : scale(inwardAxis, -1);
  return {
    midpoint,
    inward,
    surfaceNormal,
    inwardExtent: 1,
    crossSectionAxes: [axisA, axisB],
  };
}

function getOrientedSurface(
  surface: PanelSurfacePlane,
  orientedNormal: Vec3,
): PanelSurfacePlane {
  return dot(orientedNormal, surface.normal) >= 0
    ? { normal: orientedNormal, constant: surface.constant }
    : { normal: orientedNormal, constant: -surface.constant };
}

function getInwardOffsetAcrossSkins(
  frame: SegmentFrame,
  surface: PanelSurfacePlane,
  halfWidth: number,
): number | null {
  const centerConstant = dot(surface.normal, frame.midpoint);
  const outer = getInwardOffsetForSurfaceOffset(
    frame,
    surface.normal,
    surface.constant + halfWidth - centerConstant,
    halfWidth,
  );
  const inner = getInwardOffsetForSurfaceOffset(
    frame,
    surface.normal,
    surface.constant - halfWidth - centerConstant,
    halfWidth,
  );
  return outer === null || inner === null ? null : Math.max(outer, inner);
}

function getInwardOffsetForSurfaceOffset(
  frame: SegmentFrame,
  surfaceNormal: Vec3,
  surfaceOffset: number,
  halfWidth: number,
): number | null {
  let minimum = Number.NEGATIVE_INFINITY;
  let maximum = Number.POSITIVE_INFINITY;

  for (const axis of frame.crossSectionAxes) {
    const inwardComponent = dot(frame.inward, axis);
    const fixedComponent = dot(surfaceNormal, axis) * surfaceOffset;
    if (Math.abs(inwardComponent) < EPSILON) {
      if (Math.abs(fixedComponent) > halfWidth + EPSILON) return null;
      continue;
    }

    const first = (-halfWidth - fixedComponent) / inwardComponent;
    const second = (halfWidth - fixedComponent) / inwardComponent;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
  }

  return minimum <= maximum + EPSILON && Number.isFinite(maximum) ? maximum : null;
}

function getCrossSectionAxes(tangent: Vec3): [Vec3, Vec3] {
  const reference = Math.abs(tangent.y) > 0.95
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 1, z: 0 };
  const axisA = normalize(cross(tangent, reference));
  return [axisA, normalize(cross(axisA, tangent))];
}

function orientSurfaceNormals(frames: SegmentFrame[], outwardHint?: Vec3): void {
  for (let index = 1; index < frames.length; index += 1) {
    if (dot(frames[index - 1].surfaceNormal, frames[index].surfaceNormal) < 0) {
      frames[index].surfaceNormal = scale(frames[index].surfaceNormal, -1);
    }
  }

  const averageNormal = normalize(frames.reduce(
    (sum, frame) => add(sum, frame.surfaceNormal),
    { x: 0, y: 0, z: 0 },
  ));
  const desiredNormal = outwardHint && length(outwardHint) > EPSILON &&
      Math.abs(dot(averageNormal, normalize(outwardHint))) > EPSILON
    ? normalize(outwardHint)
    : canonicalizeNormal(averageNormal);
  if (dot(averageNormal, desiredNormal) < 0) {
    for (const frame of frames) frame.surfaceNormal = scale(frame.surfaceNormal, -1);
  }
}

function addPlane(
  planes: BrushPlane[],
  rawNormal: Vec3,
  point: Vec3,
  side?: PanelSide,
): void {
  const normal = normalize(rawNormal);
  const constant = dot(normal, point);
  const existing = planes.find((plane) =>
    dot(plane.normal, normal) > 1 - EPSILON && Math.abs(plane.constant - constant) < EPSILON);
  if (existing) {
    if (side) existing.sides.add(side);
    return;
  }
  planes.push({ normal, constant, sides: new Set(side ? [side] : []) });
}

function getBrushVertices(planes: BrushPlane[]): Vec3[] {
  const vertices: Vec3[] = [];
  for (let first = 0; first < planes.length - 2; first += 1) {
    for (let second = first + 1; second < planes.length - 1; second += 1) {
      for (let third = second + 1; third < planes.length; third += 1) {
        const point = intersectThreePlanes(planes[first], planes[second], planes[third]);
        if (!point || planes.some((plane) => dot(plane.normal, point) > plane.constant + EPSILON * 8)) {
          continue;
        }
        if (!vertices.some((vertex) => length(sub(vertex, point)) < EPSILON * 8)) {
          vertices.push(point);
        }
      }
    }
  }
  return vertices;
}

function intersectThreePlanes(a: BrushPlane, b: BrushPlane, c: BrushPlane): Vec3 | null {
  const bCrossC = cross(b.normal, c.normal);
  const determinant = dot(a.normal, bCrossC);
  if (Math.abs(determinant) < EPSILON) return null;
  return scale(add(
    add(scale(bCrossC, a.constant), scale(cross(c.normal, a.normal), b.constant)),
    scale(cross(a.normal, b.normal), c.constant),
  ), 1 / determinant);
}

function sortFaceVertices(vertices: Vec3[], normal: Vec3): Vec3[] {
  const unique = vertices.filter((vertex, index) =>
    vertices.findIndex((candidate) => length(sub(candidate, vertex)) < EPSILON * 8) === index);
  if (unique.length < 3) return [];
  const center = average(unique);
  const basisU = normalize(sub(unique[0], center));
  const basisV = normalize(cross(normal, basisU));
  const sorted = [...unique].sort((a, b) => {
    const relativeA = sub(a, center);
    const relativeB = sub(b, center);
    return Math.atan2(dot(relativeA, basisV), dot(relativeA, basisU)) -
      Math.atan2(dot(relativeB, basisV), dot(relativeB, basisU));
  });
  return removeCollinearVertices(sorted);
}

function removeCollinearVertices(vertices: Vec3[]): Vec3[] {
  if (vertices.length <= 3) return vertices;
  return vertices.filter((point, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    return length(cross(sub(point, previous), sub(next, point))) > EPSILON;
  });
}

function average(points: Vec3[]): Vec3 {
  return scale(points.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }), 1 / points.length);
}

function canonicalizeNormal(normal: Vec3): Vec3 {
  const component = Math.abs(normal.x) > EPSILON
    ? normal.x
    : Math.abs(normal.y) > EPSILON
      ? normal.y
      : normal.z;
  return component < 0 ? scale(normal, -1) : normal;
}
