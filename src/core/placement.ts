import { GRID_SIZE, nodeSize, oppositeFace, VALID_STRUT_LENGTHS } from "./constants";
import {
  approximatelyEqual,
  centerSpacingForStrutLength,
  faceAxis,
  faceNormal,
  isCornerStrutKind,
  isValidPlanarCornerFootprint,
  isValidStrutLength,
  length,
  sub,
} from "./rules";
import type { FaceName, NodeData, SceneData, StrutKind, Vec3, WidgetData } from "./types";

export type PlacementResult<TReason extends string> =
  | { valid: true }
  | { valid: false; reason: TReason };

export type NodePlacementIssue = "off-grid" | "node-contact";

export type StrutPlacementIssue =
  | "same-node"
  | "missing-node"
  | "occupied-face"
  | "faces-not-opposite"
  | "not-axis-aligned"
  | "invalid-length"
  | "node-intersection"
  | "strut-intersection"
  | "invalid-corner-footprint";

export type WidgetPlacementIssue = "missing-node" | "occupied-face";

export interface StrutConnection {
  nodeA: string;
  faceA: FaceName;
  nodeB: string;
  faceB: FaceName;
  kind?: StrutKind;
}

export interface PlannedStraightRunNode {
  position: Vec3;
  existingNodeId?: string;
}

export interface PlannedStraightRunSegment {
  fromIndex: number;
  toIndex: number;
  length: number;
}

export interface StraightRunPlan {
  nodes: PlannedStraightRunNode[];
  segments: PlannedStraightRunSegment[];
}

export interface StraightStrutConflict {
  strutId: string;
  kind: "crossing" | "overlap";
  position?: Vec3;
}

/** Validate one node center against the grid and all other node volumes. */
export function validateNodePlacement(
  scene: SceneData,
  position: Vec3,
  ignoredNodeIds: ReadonlySet<string> = new Set(),
): PlacementResult<NodePlacementIssue> {
  if (![position.x, position.y, position.z].every((value) => isOnGrid(value))) {
    return { valid: false, reason: "off-grid" };
  }

  const contactsAnotherNode = Object.values(scene.nodes).some((node) =>
    !ignoredNodeIds.has(node.id) && nodesContact(position, node.position));
  return contactsAnotherNode
    ? { valid: false, reason: "node-contact" }
    : { valid: true };
}

/** Validate all current node positions, including imported or batch-edited scenes. */
export function validateSceneNodePlacement(scene: SceneData): PlacementResult<NodePlacementIssue> {
  const nodes = Object.values(scene.nodes);
  if (nodes.some((node) => ![node.position.x, node.position.y, node.position.z].every(isOnGrid))) {
    return { valid: false, reason: "off-grid" };
  }

  for (let index = 0; index < nodes.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      if (nodesContact(nodes[index].position, nodes[otherIndex].position)) {
        return { valid: false, reason: "node-contact" };
      }
    }
  }
  return { valid: true };
}

/** Validate endpoint faces and geometry without mutating the scene. */
export function validateStrutPlacement(
  scene: SceneData,
  connection: StrutConnection,
): PlacementResult<StrutPlacementIssue> {
  const { nodeA, faceA, nodeB, faceB, kind = "straight" } = connection;
  if (nodeA === nodeB) return { valid: false, reason: "same-node" };

  const endpointA = scene.nodes[nodeA];
  const endpointB = scene.nodes[nodeB];
  if (!endpointA || !endpointB) return { valid: false, reason: "missing-node" };
  if (endpointA.attachments[faceA]?.occupied || endpointB.attachments[faceB]?.occupied) {
    return { valid: false, reason: "occupied-face" };
  }

  const centerDelta = sub(endpointB.position, endpointA.position);
  if (isCornerStrutKind(kind)) {
    return isValidPlanarCornerFootprint(centerDelta, faceA, faceB)
      ? { valid: true }
      : { valid: false, reason: "invalid-corner-footprint" };
  }

  if (oppositeFace(faceA) !== faceB) return { valid: false, reason: "faces-not-opposite" };
  const attachmentDelta = sub(
    addFaceOffset(endpointB, faceB),
    addFaceOffset(endpointA, faceA),
  );
  if (!isAlongFaceAxis(attachmentDelta, faceA)) {
    return { valid: false, reason: "not-axis-aligned" };
  }
  if (!isValidStrutLength(length(attachmentDelta))) {
    return { valid: false, reason: "invalid-length" };
  }
  if (getInteriorNodesOnAxis(scene, endpointA, endpointB.position, faceA).length > 0) {
    return { valid: false, reason: "node-intersection" };
  }
  return findStraightStrutConflicts(scene, endpointA.position, endpointB.position, faceA).length > 0
    ? { valid: false, reason: "strut-intersection" }
    : { valid: true };
}

export function validateWidgetPlacement(
  scene: SceneData,
  widget: Pick<WidgetData, "nodeId" | "face">,
): PlacementResult<WidgetPlacementIssue> {
  const node = scene.nodes[widget.nodeId];
  if (!node) return { valid: false, reason: "missing-node" };
  return node.attachments[widget.face]?.occupied
    ? { valid: false, reason: "occupied-face" }
    : { valid: true };
}

/** Return the grid position for a new straight-strut endpoint. */
export function getStraightStrutTarget(
  sourceNode: NodeData,
  fromFace: FaceName,
  strutLength: number,
): Vec3 {
  const normal = faceNormal(fromFace);
  const spacing = centerSpacingForStrutLength(strutLength);
  return snapPoint({
    x: sourceNode.position.x + normal.x * spacing,
    y: sourceNode.position.y + normal.y * spacing,
    z: sourceNode.position.z + normal.z * spacing,
  });
}

/**
 * Plan a straight run before mutation. Existing nodes inside the requested span
 * become chain joints, and any remaining gaps are decomposed into catalog sizes.
 */
export function planStraightStrutRun(
  scene: SceneData,
  sourceNodeId: string,
  fromFace: FaceName,
  strutLength: number,
): StraightRunPlan | null {
  const source = scene.nodes[sourceNodeId];
  if (!source || source.attachments[fromFace]?.occupied) return null;

  const normal = faceNormal(fromFace);
  const targetPosition = getStraightStrutTarget(source, fromFace, strutLength);
  const targetDistance = centerSpacingForStrutLength(strutLength);
  const existingAnchors = getInteriorNodesOnAxis(scene, source, targetPosition, fromFace)
    .map((node) => ({
      distance: distanceAlong(node.position, source.position, normal),
      position: node.position,
      existingNodeId: node.id,
    }))
    .sort((a, b) => a.distance - b.distance);
  const existingTarget = Object.values(scene.nodes).find((node) =>
    samePosition(node.position, targetPosition));
  const anchors = [
    ...existingAnchors,
    {
      distance: targetDistance,
      position: targetPosition,
      existingNodeId: existingTarget?.id,
    },
  ];

  const nodes: PlannedStraightRunNode[] = [
    { position: source.position, existingNodeId: source.id },
  ];
  const segments: PlannedStraightRunSegment[] = [];
  let previousDistance = 0;
  let previousIndex = 0;

  for (const anchor of anchors) {
    const clearRun = Math.round((anchor.distance - previousDistance - nodeSize) * 1000) / 1000;
    const parts = decomposeStrutRun(clearRun);
    if (!parts || parts.length === 0) return null;

    let cursor = previousDistance;
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      cursor += part + nodeSize;
      const isAnchor = partIndex === parts.length - 1;
      const position = isAnchor
        ? anchor.position
        : {
            x: source.position.x + normal.x * cursor,
            y: source.position.y + normal.y * cursor,
            z: source.position.z + normal.z * cursor,
          };
      const nodeIndex = nodes.length;
      nodes.push({
        position,
        existingNodeId: isAnchor ? anchor.existingNodeId : undefined,
      });
      segments.push({ fromIndex: previousIndex, toIndex: nodeIndex, length: part });
      previousIndex = nodeIndex;
    }
    previousDistance = anchor.distance;
  }

  return segments.length > 0 ? { nodes, segments } : null;
}

/** Find existing straight struts whose volumes cross or overlap a proposed run. */
export function findStraightStrutConflicts(
  scene: SceneData,
  sourcePosition: Vec3,
  targetPosition: Vec3,
  fromFace: FaceName,
): StraightStrutConflict[] {
  const proposedAxis = faceAxis(fromFace);
  const conflicts: StraightStrutConflict[] = [];

  for (const strut of Object.values(scene.struts)) {
    if (isCornerStrutKind(strut.kind)) continue;
    const nodeA = scene.nodes[strut.nodeA];
    const nodeB = scene.nodes[strut.nodeB];
    if (!nodeA || !nodeB) continue;

    const existingAxis = faceAxis(strut.faceA);
    if (existingAxis === proposedAxis) {
      if (
        sameAxisLine(sourcePosition, nodeA.position, proposedAxis) &&
        axisIntervalsOverlap(sourcePosition, targetPosition, nodeA.position, nodeB.position, proposedAxis)
      ) {
        conflicts.push({ strutId: strut.id, kind: "overlap" });
      }
      continue;
    }

    const thirdAxis = (["x", "y", "z"] as const).find((axis) =>
      axis !== proposedAxis && axis !== existingAxis);
    if (!thirdAxis || !approximatelyEqual(sourcePosition[thirdAxis], nodeA.position[thirdAxis])) {
      continue;
    }

    const position = { ...sourcePosition };
    position[proposedAxis] = nodeA.position[proposedAxis];
    position[existingAxis] = sourcePosition[existingAxis];
    if (
      isOnAxisSegment(position, sourcePosition, targetPosition, proposedAxis, true) &&
      isOnAxisSegment(position, nodeA.position, nodeB.position, existingAxis, false)
    ) {
      conflicts.push({ strutId: strut.id, kind: "crossing", position });
    }
  }

  return conflicts;
}

export function getNearestStrutLength(
  sourceNode: NodeData,
  fromFace: FaceName,
  point: Vec3,
): number {
  const snappedPoint = snapPoint(point);
  return [...VALID_STRUT_LENGTHS]
    .sort((a, b) => distanceSquared(getStraightStrutTarget(sourceNode, fromFace, a), snappedPoint) -
      distanceSquared(getStraightStrutTarget(sourceNode, fromFace, b), snappedPoint))[0] ?? 0;
}

export function getStraightConnectionFaces(
  fromNode: NodeData,
  toNode: NodeData,
): { fromFace: FaceName; toFace: FaceName } | null {
  const fromFace = faceFromDelta(sub(toNode.position, fromNode.position));
  return fromFace ? { fromFace, toFace: oppositeFace(fromFace) } : null;
}

export function getCorner45ConnectionFaces(
  fromFace: FaceName,
  fromNode: NodeData,
  toNode: NodeData,
): { fromFace: FaceName; toFace: FaceName } | null {
  const delta = sub(toNode.position, fromNode.position);
  const movingAxes = (["x", "y", "z"] as const).filter((axis) => Math.abs(delta[axis]) > 0.01);
  if (movingAxes.length !== 2) return null;

  const sourceAxis = faceAxis(fromFace);
  if (!movingAxes.includes(sourceAxis) || Math.sign(delta[sourceAxis]) !== Math.sign(faceNormal(fromFace)[sourceAxis])) {
    return null;
  }

  const destinationAxis = movingAxes.find((axis) => axis !== sourceAxis);
  if (!destinationAxis) return null;
  const positiveFace: Record<typeof destinationAxis, FaceName> = { x: "left", y: "bottom", z: "back" };
  const negativeFace: Record<typeof destinationAxis, FaceName> = { x: "right", y: "top", z: "front" };
  return {
    fromFace,
    toFace: delta[destinationAxis] > 0 ? positiveFace[destinationAxis] : negativeFace[destinationAxis],
  };
}

/** Split a clear span into catalog struts separated by unit nodes, preferring fewer struts. */
export function decomposeStrutRun(runLength: number): number[] | null {
  if (runLength === 0) return [];
  if (!Number.isInteger(runLength) || runLength < 0) return null;

  const best = new Map<number, number[] | null>([[0, []]]);
  for (let currentLength = 1; currentLength <= runLength; currentLength += 1) {
    let bestParts: number[] | null = null;
    for (const strutLength of VALID_STRUT_LENGTHS) {
      if (strutLength === currentLength) {
        bestParts = [strutLength];
        continue;
      }

      const remaining = currentLength - strutLength - nodeSize;
      const tail = best.get(remaining);
      if (remaining <= 0 || !tail) continue;
      const parts = [strutLength, ...tail];
      if (!bestParts || parts.length < bestParts.length) bestParts = parts;
    }
    best.set(currentLength, bestParts);
  }
  return best.get(runLength) ?? null;
}

function nodesContact(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < nodeSize + 0.01 &&
    Math.abs(a.y - b.y) < nodeSize + 0.01 &&
    Math.abs(a.z - b.z) < nodeSize + 0.01;
}

function getInteriorNodesOnAxis(
  scene: SceneData,
  source: NodeData,
  targetPosition: Vec3,
  fromFace: FaceName,
): NodeData[] {
  const normal = faceNormal(fromFace);
  const targetDistance = distanceAlong(targetPosition, source.position, normal);
  const axis = faceAxis(fromFace);
  return Object.values(scene.nodes).filter((node) => {
    if (node.id === source.id || samePosition(node.position, targetPosition)) return false;
    const distance = distanceAlong(node.position, source.position, normal);
    if (distance <= 0 || distance >= targetDistance) return false;
    return (["x", "y", "z"] as const).every((candidate) =>
      candidate === axis || Math.abs(node.position[candidate] - source.position[candidate]) < nodeSize - 0.01);
  });
}

function distanceAlong(position: Vec3, origin: Vec3, normal: Vec3): number {
  return (position.x - origin.x) * normal.x +
    (position.y - origin.y) * normal.y +
    (position.z - origin.z) * normal.z;
}

function samePosition(a: Vec3, b: Vec3): boolean {
  return approximatelyEqual(a.x, b.x) &&
    approximatelyEqual(a.y, b.y) &&
    approximatelyEqual(a.z, b.z);
}

function sameAxisLine(a: Vec3, b: Vec3, axis: "x" | "y" | "z"): boolean {
  return (["x", "y", "z"] as const).every((candidate) =>
    candidate === axis || approximatelyEqual(a[candidate], b[candidate]));
}

function axisIntervalsOverlap(
  aStart: Vec3,
  aEnd: Vec3,
  bStart: Vec3,
  bEnd: Vec3,
  axis: "x" | "y" | "z",
): boolean {
  const start = Math.max(Math.min(aStart[axis], aEnd[axis]), Math.min(bStart[axis], bEnd[axis]));
  const end = Math.min(Math.max(aStart[axis], aEnd[axis]), Math.max(bStart[axis], bEnd[axis]));
  return end - start > 0.01;
}

function isOnAxisSegment(
  point: Vec3,
  start: Vec3,
  end: Vec3,
  axis: "x" | "y" | "z",
  includeEnds: boolean,
): boolean {
  if (!sameAxisLine(point, start, axis)) return false;
  const low = Math.min(start[axis], end[axis]);
  const high = Math.max(start[axis], end[axis]);
  return includeEnds
    ? point[axis] >= low - 0.01 && point[axis] <= high + 0.01
    : point[axis] > low + 0.01 && point[axis] < high - 0.01;
}

function isOnGrid(value: number): boolean {
  return approximatelyEqual(value / GRID_SIZE, Math.round(value / GRID_SIZE));
}

function snapPoint(point: Vec3): Vec3 {
  return {
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
    z: Math.round(point.z / GRID_SIZE) * GRID_SIZE,
  };
}

function addFaceOffset(node: NodeData, face: FaceName): Vec3 {
  const normal = faceNormal(face);
  return {
    x: node.position.x + normal.x * nodeSize / 2,
    y: node.position.y + normal.y * nodeSize / 2,
    z: node.position.z + normal.z * nodeSize / 2,
  };
}

function isAlongFaceAxis(delta: Vec3, face: FaceName): boolean {
  const axis = faceAxis(face);
  return (["x", "y", "z"] as const).every((candidate) =>
    candidate === axis ? Math.abs(delta[candidate]) > 0.01 : approximatelyEqual(delta[candidate], 0));
}

function faceFromDelta(delta: Vec3): FaceName | null {
  const movingAxes = (["x", "y", "z"] as const).filter((axis) => Math.abs(delta[axis]) > 0.01);
  if (movingAxes.length !== 1) return null;
  const axis = movingAxes[0];
  if (axis === "x") return delta.x > 0 ? "right" : "left";
  if (axis === "y") return delta.y > 0 ? "top" : "bottom";
  return delta.z > 0 ? "front" : "back";
}

function distanceSquared(a: Vec3, b: Vec3): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}
