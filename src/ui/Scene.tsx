import { useRef, useCallback, useState, useEffect } from "react";
import * as THREE from "three";
import { ThreeEvent, useThree } from "@react-three/fiber";
import type { Tool } from "./types";
import type { SceneData, NodeData, StrutData, FaceName, StrutKind } from "../core/types";
import {
  createNode,
  addNodeToScene,
  removeNodeFromScene,
  canConnectStrut,
  addStrutToScene,
  removeStrutFromScene,
  getAttachmentWorldPosition,
  hasNodeContact,
} from "../core/scene";
import { snapToGrid } from "../core/snap";
import { nodeSize, strutWidth, VALID_STRUT_LENGTHS, oppositeFace } from "../core/constants";

const FACE_COLORS: Record<string, string> = {
  top: "#4ecca3",
  bottom: "#e94560",
  front: "#3498db",
  back: "#f39c12",
  right: "#9b59b6",
  left: "#1abc9c",
};

const FACE_NORMALS: Record<string, [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

const FACE_ENTRIES = Object.entries(FACE_NORMALS) as [
  string,
  [number, number, number],
][];

const NORMAL_TO_FACE: Record<string, FaceName> = {
  "0,1,0": "top",
  "0,-1,0": "bottom",
  "0,0,1": "front",
  "0,0,-1": "back",
  "1,0,0": "right",
  "-1,0,0": "left",
};

function vec3ToThree(v: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function faceNormalToThree(face: FaceName): THREE.Vector3 {
  const normal = FACE_NORMALS[face];
  return new THREE.Vector3(normal[0], normal[1], normal[2]);
}

function centerSpacingForStrutLength(length: number): number {
  return length + nodeSize;
}

function getDrawCandidatePosition(
  sourceNode: NodeData,
  fromFace: FaceName,
  length: number,
): THREE.Vector3 {
  const faceNorm = FACE_NORMALS[fromFace];
  const centerSpacing = centerSpacingForStrutLength(length);
  const pos = new THREE.Vector3(
    sourceNode.position.x + faceNorm[0] * centerSpacing,
    sourceNode.position.y + faceNorm[1] * centerSpacing,
    sourceNode.position.z + faceNorm[2] * centerSpacing,
  );

  return new THREE.Vector3(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z));
}

function getNearestDrawLength(
  sourceNode: NodeData,
  fromFace: FaceName,
  point: THREE.Vector3,
): number {
  const snapped = snapToGrid(point, 1);
  const candidates = VALID_STRUT_LENGTHS.map((length) => ({
    length,
    pos: getDrawCandidatePosition(sourceNode, fromFace, length),
  }));

  candidates.sort((a, b) => a.pos.distanceTo(snapped) - b.pos.distanceTo(snapped));
  return candidates[0]?.length ?? VALID_STRUT_LENGTHS[0];
}

function faceFromDelta(delta: THREE.Vector3): FaceName | null {
  const ax = Math.abs(delta.x);
  const ay = Math.abs(delta.y);
  const az = Math.abs(delta.z);

  if (ax > 0 && ay === 0 && az === 0) return delta.x > 0 ? "right" : "left";
  if (ay > 0 && ax === 0 && az === 0) return delta.y > 0 ? "top" : "bottom";
  if (az > 0 && ax === 0 && ay === 0) return delta.z > 0 ? "front" : "back";
  return null;
}

function faceAxis(face: FaceName): "x" | "y" | "z" {
  if (face === "left" || face === "right") return "x";
  if (face === "top" || face === "bottom") return "y";
  return "z";
}

function corner45LengthFromAxisDelta(axisDelta: number): number {
  const rawLength = Math.abs(axisDelta);
  const rawMatch = VALID_STRUT_LENGTHS.find((length) => Math.abs(rawLength - length) < 0.01);
  if (rawMatch !== undefined) return rawMatch;

  const faceLength = rawLength - nodeSize;
  const faceMatch = VALID_STRUT_LENGTHS.find((length) => Math.abs(faceLength - length) < 0.01);
  return faceMatch ?? rawLength;
}

function getConnectionFacesBetweenNodes(
  fromNode: NodeData,
  toNode: NodeData,
): { fromFace: FaceName; toFace: FaceName } | null {
  const delta = new THREE.Vector3(
    toNode.position.x - fromNode.position.x,
    toNode.position.y - fromNode.position.y,
    toNode.position.z - fromNode.position.z,
  );
  const fromFace = faceFromDelta(delta);
  if (!fromFace) return null;

  return {
    fromFace,
    toFace: oppositeFace(fromFace),
  };
}

function getCorner45ConnectionFaces(
  fromFace: FaceName,
  fromNode: NodeData,
  toNode: NodeData,
): { fromFace: FaceName; toFace: FaceName } | null {
  const delta = new THREE.Vector3(
    toNode.position.x - fromNode.position.x,
    toNode.position.y - fromNode.position.y,
    toNode.position.z - fromNode.position.z,
  );
  const movingAxes = [
    { axis: "x" as const, value: delta.x },
    { axis: "y" as const, value: delta.y },
    { axis: "z" as const, value: delta.z },
  ].filter(({ value }) => Math.abs(value) > 0.01);

  if (movingAxes.length !== 2) return null;

  const sourceAxis = faceAxis(fromFace);
  const sourceMove = movingAxes.find(({ axis }) => axis === sourceAxis);
  if (!sourceMove) return null;

  const sourceNormal = FACE_NORMALS[fromFace];
  const sourceNormalValue = sourceAxis === "x"
    ? sourceNormal[0]
    : sourceAxis === "y"
      ? sourceNormal[1]
      : sourceNormal[2];
  if (Math.sign(sourceMove.value) !== Math.sign(sourceNormalValue)) return null;

  const destMove = movingAxes.find(({ axis }) => axis !== sourceAxis);
  if (!destMove) return null;

  let toFace: FaceName;
  if (destMove.axis === "x") {
    toFace = destMove.value > 0 ? "left" : "right";
  } else if (destMove.axis === "y") {
    toFace = destMove.value > 0 ? "bottom" : "top";
  } else {
    toFace = destMove.value > 0 ? "back" : "front";
  }

  return { fromFace, toFace };
}

interface Corner45PreviewCandidate {
  key: string;
  nodeId: string;
  position: THREE.Vector3;
  fromFace: FaceName;
  toFace: FaceName;
  length: number;
}

function getCorner45PreviewCandidates(
  sceneData: SceneData,
  drawState: { fromNodeId: string; fromFace: FaceName },
): Corner45PreviewCandidate[] {
  const sourceNode = sceneData.nodes[drawState.fromNodeId];
  if (!sourceNode) return [];

  const candidates: Corner45PreviewCandidate[] = [];
  for (const node of Object.values(sceneData.nodes)) {
    if (node.id === drawState.fromNodeId) continue;

    const faces = getCorner45ConnectionFaces(drawState.fromFace, sourceNode, node);
    if (!faces) continue;
    if (
      !canConnectStrut(
        sceneData,
        drawState.fromNodeId,
        faces.fromFace,
        node.id,
        faces.toFace,
        "corner45",
      )
    ) {
      continue;
    }

    const axis = faceAxis(faces.fromFace);
    const delta = axis === "x"
      ? node.position.x - sourceNode.position.x
      : axis === "y"
        ? node.position.y - sourceNode.position.y
        : node.position.z - sourceNode.position.z;

    candidates.push({
      key: `existing-${node.id}`,
      nodeId: node.id,
      position: vec3ToThree(node.position),
      fromFace: faces.fromFace,
      toFace: faces.toFace,
      length: corner45LengthFromAxisDelta(delta),
    });
  }

  return candidates;
}

function decomposeRunLength(runLength: number): number[] | null {
  if (runLength === 0) return [];
  if (VALID_STRUT_LENGTHS.includes(runLength)) return [runLength];

  const best = new Map<number, number[] | null>([[0, []]]);
  for (let length = 1; length <= runLength; length += 1) {
    let bestParts: number[] | null = null;

    for (const strutLength of VALID_STRUT_LENGTHS) {
      if (strutLength > length) continue;
      if (strutLength === length) {
        bestParts = [strutLength];
        continue;
      }

      const remaining = length - strutLength - nodeSize;
      if (!Number.isInteger(remaining) || remaining <= 0) continue;

      const tail = best.get(remaining);
      if (!tail) continue;

      const parts = [strutLength, ...tail];
      if (!bestParts || parts.length < bestParts.length) {
        bestParts = parts;
      }
    }

    best.set(length, bestParts);
  }

  return best.get(runLength) ?? null;
}

function createRootScene(): SceneData {
  const root = createNode({ x: 0, y: 0, z: 0 });
  return { nodes: { [root.id]: root }, struts: {}, accessories: {} };
}

interface SceneProps {
  activeTool: Tool;
}

export function Scene({ activeTool }: SceneProps) {
  const [sceneData, setSceneData] = useState<SceneData>(createRootScene);
  const [drawState, setDrawState] = useState<{
    fromNodeId: string;
    fromFace: FaceName;
  } | null>(null);
  const [hoverDrawLength, setHoverDrawLength] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const nodeRefs = useRef<Map<string, THREE.Group>>(new Map());
  const sceneDataRef = useRef(sceneData);
  sceneDataRef.current = sceneData;

  const faceDragRef = useRef<{
    faceNormal: THREE.Vector3;
    selectedIds: string[];
    initialPositions: Map<string, THREE.Vector3>;
    connectingStruts: Array<{
      strutId: string;
      selNodeId: string;
      unselNodeId: string;
      selFace: FaceName;
      unselFace: FaceName;
      initialDist: number;
    }>;
    pointerLastNDC: THREE.Vector2;
    accumDelta: number;
  } | null>(null);

  const { camera, gl } = useThree();

  const commitStrut = useCallback(
    (
      fromNodeId: string,
      fromFace: FaceName,
      nodeId: string,
      face: FaceName,
      kind: StrutKind = "straight",
    ) => {
      const fromNode = sceneDataRef.current.nodes[fromNodeId];
      const toNode = sceneDataRef.current.nodes[nodeId];
      let len = 0;
      if (fromNode && toNode) {
        if (kind === "corner45") {
          const delta = new THREE.Vector3(
            toNode.position.x - fromNode.position.x,
            toNode.position.y - fromNode.position.y,
            toNode.position.z - fromNode.position.z,
          );
          const axis = faceAxis(fromFace);
          const axisDelta = axis === "x" ? delta.x : axis === "y" ? delta.y : delta.z;
          len = corner45LengthFromAxisDelta(axisDelta);
        } else {
          len = vec3ToThree(getAttachmentWorldPosition(sceneDataRef.current, fromNodeId, fromFace))
            .distanceTo(vec3ToThree(getAttachmentWorldPosition(sceneDataRef.current, nodeId, face)));
        }
      }

      const strut: StrutData = {
        id: crypto.randomUUID(),
        kind,
        nodeA: fromNodeId,
        faceA: fromFace,
        nodeB: nodeId,
        faceB: face,
        length: Math.round(len * 100) / 100,
      };
      setSceneData((prev) => addStrutToScene(prev, strut));
    },
    [],
  );

  const placeDrawStrutAtLength = useCallback(
    (length: number) => {
      if (!drawState) return;

      const sourceNode = sceneDataRef.current.nodes[drawState.fromNodeId];
      if (!sourceNode) {
        setDrawState(null);
        return;
      }

      const position = getDrawCandidatePosition(sourceNode, drawState.fromFace, length);
      const existingAtSpot = Object.values(sceneDataRef.current.nodes).find(
        (n) =>
          n.position.x === position.x &&
          n.position.y === position.y &&
          n.position.z === position.z,
      );

      if (existingAtSpot) {
        const destFace = oppositeFace(drawState.fromFace);
        if (
          canConnectStrut(
            sceneDataRef.current,
            drawState.fromNodeId,
            drawState.fromFace,
            existingAtSpot.id,
            destFace,
          )
        ) {
          commitStrut(drawState.fromNodeId, drawState.fromFace, existingAtSpot.id, destFace);
        }
        setDrawState(null);
        return;
      }

      const currentNode = sceneDataRef.current.nodes[drawState.fromNodeId];
      if (currentNode?.attachments[drawState.fromFace]?.occupied) {
        setDrawState(null);
        return;
      }

      const newNode = createNode({ x: position.x, y: position.y, z: position.z });
      const destFace = oppositeFace(drawState.fromFace);

      const strut: StrutData = {
        id: crypto.randomUUID(),
        nodeA: drawState.fromNodeId,
        faceA: drawState.fromFace,
        nodeB: newNode.id,
        faceB: destFace,
        length,
      };

      setSceneData((prev) => {
        const withNode = addNodeToScene(prev, newNode);
        const withStrut = addStrutToScene(withNode, strut);
        if (hasNodeContact(withStrut)) {
          return prev;
        }

        return withStrut;
      });
      setDrawState(null);
    },
    [drawState, commitStrut],
  );

  const updateHoverDrawLength = useCallback(
    (point: THREE.Vector3) => {
      if (activeTool !== "draw-strut" || !drawState) return;

      const sourceNode = sceneDataRef.current.nodes[drawState.fromNodeId];
      if (!sourceNode) return;

      setHoverDrawLength(getNearestDrawLength(sourceNode, drawState.fromFace, point));
    },
    [activeTool, drawState],
  );

  const placeCorner45Strut = useCallback(
    (candidate: Corner45PreviewCandidate) => {
      if (!drawState) return;

      if (
        canConnectStrut(
          sceneDataRef.current,
          drawState.fromNodeId,
          candidate.fromFace,
          candidate.nodeId,
          candidate.toFace,
          "corner45",
        )
      ) {
        commitStrut(
          drawState.fromNodeId,
          candidate.fromFace,
          candidate.nodeId,
          candidate.toFace,
          "corner45",
        );
      }
      setDrawState(null);
    },
    [drawState, commitStrut],
  );

  const handleGroundClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (activeTool === "select") {
        setSelectedIds(new Set());
        return;
      }

      if (activeTool === "draw-strut" && drawState) {
        event.stopPropagation();
        const sourceNode = sceneDataRef.current.nodes[drawState.fromNodeId];
        if (!sourceNode) {
          setDrawState(null);
          return;
        }
        const length = getNearestDrawLength(
          sourceNode,
          drawState.fromFace,
          event.point.clone(),
        );
        setHoverDrawLength(length);
        placeDrawStrutAtLength(length);
        return;
      }

      setDrawState(null);
    },
    [activeTool, drawState, placeDrawStrutAtLength],
  );

  const handleGroundPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      updateHoverDrawLength(event.point.clone());
    },
    [updateHoverDrawLength],
  );

  const handleNodeClick = useCallback(
    (nodeId: string, face: FaceName | null, event: ThreeEvent<MouseEvent>) => {
      if (activeTool === "select") {
        event.stopPropagation();

        if (selectedIds.has(nodeId) && face) {
          startFaceDragRef.current(face, event.nativeEvent as unknown as PointerEvent);
          return;
        }

        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (event.nativeEvent.shiftKey) {
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
          } else {
            next.clear();
            next.add(nodeId);
          }
          return next;
        });
        return;
      }

      if (activeTool === "draw-strut") {
        event.stopPropagation();

        if (!drawState) {
          if (face) {
            setDrawState({ fromNodeId: nodeId, fromFace: face });
          }
          return;
        }

        if (drawState.fromNodeId === nodeId && drawState.fromFace === face) {
          setDrawState(null);
          return;
        }

        if (drawState.fromNodeId === nodeId) {
          if (face) {
            setDrawState({ fromNodeId: nodeId, fromFace: face });
          }
          return;
        }

        const fromNode = sceneDataRef.current.nodes[drawState.fromNodeId];
        const toNode = sceneDataRef.current.nodes[nodeId];
        if (!fromNode || !toNode) return;

        const matchingCornerCandidate = getCorner45PreviewCandidates(
          sceneDataRef.current,
          drawState,
        ).find((candidate) => candidate.nodeId === nodeId);
        if (matchingCornerCandidate) {
          commitStrut(
            drawState.fromNodeId,
            matchingCornerCandidate.fromFace,
            nodeId,
            matchingCornerCandidate.toFace,
            "corner45",
          );
          setDrawState(null);
          return;
        }

        const inferredFaces = getConnectionFacesBetweenNodes(fromNode, toNode);

        if (
          inferredFaces &&
          canConnectStrut(
            sceneDataRef.current,
            drawState.fromNodeId,
            inferredFaces.fromFace,
            nodeId,
            inferredFaces.toFace,
          )
        ) {
          commitStrut(
            drawState.fromNodeId,
            inferredFaces.fromFace,
            nodeId,
            inferredFaces.toFace,
          );
          setDrawState(null);
          return;
        }

        const inferredCornerFaces = getCorner45ConnectionFaces(drawState.fromFace, fromNode, toNode);
        const cornerCandidates = [
          ...(face ? [{ fromFace: drawState.fromFace, toFace: face }] : []),
          ...(inferredCornerFaces ? [inferredCornerFaces] : []),
        ];

        for (const cornerFaces of cornerCandidates) {
          if (
            canConnectStrut(
              sceneDataRef.current,
              drawState.fromNodeId,
              cornerFaces.fromFace,
              nodeId,
              cornerFaces.toFace,
              "corner45",
            )
          ) {
            commitStrut(
              drawState.fromNodeId,
              cornerFaces.fromFace,
              nodeId,
              cornerFaces.toFace,
              "corner45",
            );
            setDrawState(null);
            return;
          }
        }
      }
    },
    [activeTool, drawState, commitStrut],
  );

  const handleNodeContextMenu = useCallback(
    (nodeId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      setSceneData((prev) => removeNodeFromScene(prev, nodeId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });

      if (drawState?.fromNodeId === nodeId) {
        setDrawState(null);
      }
    },
    [drawState],
  );

  const handleStrutContextMenu = useCallback(
    (strutId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      setSceneData((prev) => removeStrutFromScene(prev, strutId));
      setDrawState(null);
    },
    [],
  );

  const handleStrutClick = useCallback(
    (strutId: string, point: THREE.Vector3, event: ThreeEvent<MouseEvent>) => {
      if (activeTool !== "draw-strut") return;
      event.stopPropagation();

      const strut = sceneDataRef.current.struts[strutId];
      if (!strut || strut.kind === "corner45" || strut.length < 3) {
        setDrawState(null);
        return;
      }

      const nodeA = sceneDataRef.current.nodes[strut.nodeA];
      const nodeB = sceneDataRef.current.nodes[strut.nodeB];
      if (!nodeA || !nodeB) {
        setDrawState(null);
        return;
      }

      const fromAttach = vec3ToThree(
        getAttachmentWorldPosition(sceneDataRef.current, strut.nodeA, strut.faceA),
      );
      const toAttach = vec3ToThree(
        getAttachmentWorldPosition(sceneDataRef.current, strut.nodeB, strut.faceB),
      );
      const direction = new THREE.Vector3().subVectors(toAttach, fromAttach);
      const totalLength = Math.round(direction.length());
      if (totalLength < 3) {
        setDrawState(null);
        return;
      }
      direction.normalize();

      const clickedDistance = new THREE.Vector3()
        .subVectors(point, fromAttach)
        .dot(direction);
      const insertCell = THREE.MathUtils.clamp(
        Math.round(clickedDistance - nodeSize / 2),
        1,
        totalLength - 2,
      );

      const leftRun = insertCell;
      const rightRun = totalLength - insertCell - nodeSize;
      if (!Number.isInteger(rightRun) || rightRun < 1) {
        setDrawState(null);
        return;
      }

      const leftParts = decomposeRunLength(leftRun);
      const rightParts = decomposeRunLength(rightRun);
      if (!leftParts || !rightParts) {
        setDrawState(null);
        return;
      }

      type ChainNode = { data: NodeData; existing: boolean };
      type ChainSegment = { fromIndex: number; toIndex: number; length: number };

      const chainNodes: ChainNode[] = [
        { data: nodeA, existing: true },
      ];
      const segments: ChainSegment[] = [];

      let cursor = 0;
      let previousIndex = 0;
      for (const part of leftParts) {
        cursor += part;
        const node = createNode({
          x: Math.round(fromAttach.x + direction.x * (cursor + nodeSize / 2)),
          y: Math.round(fromAttach.y + direction.y * (cursor + nodeSize / 2)),
          z: Math.round(fromAttach.z + direction.z * (cursor + nodeSize / 2)),
        });
        const nodeIndex = chainNodes.length;
        chainNodes.push({ data: node, existing: false });
        segments.push({ fromIndex: previousIndex, toIndex: nodeIndex, length: part });
        previousIndex = nodeIndex;
        cursor += nodeSize;
      }

      cursor = insertCell + nodeSize;
      for (const part of rightParts) {
        cursor += part;
        const isEndpoint = Math.abs(cursor - totalLength) < 0.01;
        const nodeIndex = isEndpoint ? chainNodes.length : chainNodes.length;
        if (isEndpoint) {
          chainNodes.push({ data: nodeB, existing: true });
          segments.push({ fromIndex: previousIndex, toIndex: nodeIndex, length: part });
          previousIndex = nodeIndex;
        } else {
          const node = createNode({
            x: Math.round(fromAttach.x + direction.x * (cursor + nodeSize / 2)),
            y: Math.round(fromAttach.y + direction.y * (cursor + nodeSize / 2)),
            z: Math.round(fromAttach.z + direction.z * (cursor + nodeSize / 2)),
          });
          chainNodes.push({ data: node, existing: false });
          segments.push({ fromIndex: previousIndex, toIndex: nodeIndex, length: part });
          previousIndex = nodeIndex;
          cursor += nodeSize;
        }
      }

      setSceneData((prev) => {
        let result = removeStrutFromScene(prev, strutId);

        for (const node of chainNodes) {
          if (node.existing) continue;
          result = addNodeToScene(result, node.data);
        }

        for (const segment of segments) {
          const from = chainNodes[segment.fromIndex];
          const to = chainNodes[segment.toIndex];

          const newStrut: StrutData = {
            id: crypto.randomUUID(),
            nodeA: from.data.id,
            faceA: strut.faceA,
            nodeB: to.data.id,
            faceB: strut.faceB,
            length: segment.length,
          };

          if (canConnectStrut(result, newStrut.nodeA, newStrut.faceA, newStrut.nodeB, newStrut.faceB)) {
            result = addStrutToScene(result, newStrut);
          }
        }

        if (hasNodeContact(result)) {
          return prev;
        }

        return result;
      });

      setDrawState(null);
    },
    [activeTool],
  );

  const startFaceDragRef = useRef<(face: FaceName, e: PointerEvent) => void>(() => {});

  const startFaceDrag = useCallback(
    (face: FaceName, nativeEvent: PointerEvent) => {
      const current = sceneDataRef.current;
      const selIds = [...selectedIds];
      if (selIds.length === 0) {
        return;
      }

      const normal = FACE_NORMALS[face];
      const faceNormal = new THREE.Vector3(normal[0], normal[1], normal[2]);

      const initialPositions = new Map<string, THREE.Vector3>();
      for (const id of selIds) {
        const n = current.nodes[id];
        if (n) initialPositions.set(id, vec3ToThree(n.position));
      }

      const connectingStruts: Array<{
        strutId: string;
        selNodeId: string;
        unselNodeId: string;
        selFace: FaceName;
        unselFace: FaceName;
        initialDist: number;
      }> = [];
      for (const strut of Object.values(current.struts)) {
        if (strut.kind === "corner45") continue;

        const aSel = selectedIds.has(strut.nodeA);
        const bSel = selectedIds.has(strut.nodeB);
        if (aSel !== bSel) {
          const selNodeId = aSel ? strut.nodeA : strut.nodeB;
          const unselNodeId = aSel ? strut.nodeB : strut.nodeA;
          const selFace = aSel ? strut.faceA : strut.faceB;
          const unselFace = aSel ? strut.faceB : strut.faceA;
          const selNode = current.nodes[selNodeId];
          const unselNode = current.nodes[unselNodeId];
          if (!selNode || !unselNode) continue;

          const dx = selNode.position.x - unselNode.position.x;
          const dy = selNode.position.y - unselNode.position.y;
          const dz = selNode.position.z - unselNode.position.z;
          const alongAxis =
            (faceNormal.x !== 0 ? dx : 0) +
            (faceNormal.y !== 0 ? dy : 0) +
            (faceNormal.z !== 0 ? dz : 0);
          const dist = Math.abs(alongAxis);
          if (dist < 0.01) continue;

          connectingStruts.push({
            strutId: strut.id,
            selNodeId,
            unselNodeId,
            selFace,
            unselFace,
            initialDist: dist,
          });
        }
      }

      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );

      faceDragRef.current = {
        faceNormal,
        selectedIds: selIds,
        initialPositions,
        connectingStruts,
        pointerLastNDC: ndc.clone(),
        accumDelta: 0,
      };


      gl.domElement.style.cursor = "ew-resize";
    },
    [gl, selectedIds],
  );

  startFaceDragRef.current = startFaceDrag;

  const handleFaceKnobClick = useCallback(
    (nodeId: string, face: FaceName, event: ThreeEvent<MouseEvent>) => {
      if (activeTool !== "select") return;
      if (!selectedIds.has(nodeId)) return;
      event.stopPropagation();
      startFaceDrag(face, event.nativeEvent as unknown as PointerEvent);
    },
    [activeTool, selectedIds, startFaceDrag],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (faceDragRef.current) {
        doFaceDrag(e);
      }
    };
    const onUp = () => {
      if (faceDragRef.current) {
        endFaceDrag();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  const doFaceDrag = useCallback(
    (nativeEvent: PointerEvent) => {
      if (!faceDragRef.current) return;
      const fd = faceDragRef.current;

      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const dragOrigin = fd.initialPositions.values().next().value;
      if (!dragOrigin) return;

      const ndcDelta = ndc.clone().sub(fd.pointerLastNDC);
      fd.pointerLastNDC.copy(ndc);

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const camRight = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
      const camUp = new THREE.Vector3().crossVectors(camRight, camDir).normalize();

      const perspCam = camera as THREE.PerspectiveCamera;
      const camDist = camera.position.distanceTo(dragOrigin);
      const scale = camDist * Math.tan((perspCam.fov * Math.PI) / 360);

      const worldDX = ndcDelta.x * scale * camRight.dot(fd.faceNormal);
      const worldDY = ndcDelta.y * scale * camUp.dot(fd.faceNormal);
      fd.accumDelta += worldDX + worldDY;

      let snappedDelta = fd.accumDelta;

      if (fd.connectingStruts.length > 0) {
        const validDeltas: number[] = [];
        for (const strutInfo of fd.connectingStruts) {
          const strutValid: number[] = [];
          for (const validLen of VALID_STRUT_LENGTHS) {
            strutValid.push(validLen - strutInfo.initialDist);
          }
          if (validDeltas.length === 0) {
            validDeltas.push(...strutValid);
          } else {
            const intersect = validDeltas.filter((d) => strutValid.includes(d));
            validDeltas.length = 0;
            validDeltas.push(...intersect);
          }
        }

        if (validDeltas.length > 0) {
          validDeltas.sort(
            (a, b) =>
              Math.abs(a - snappedDelta) - Math.abs(b - snappedDelta),
          );
          snappedDelta = validDeltas[0];
        } else {
          snappedDelta = Math.round(fd.accumDelta);
        }
      } else {
        snappedDelta = Math.round(fd.accumDelta);
      }

      const deltaVec = fd.faceNormal.clone().multiplyScalar(snappedDelta);

      const newPositions = new Map<string, THREE.Vector3>();
      for (const id of fd.selectedIds) {
        const initial = fd.initialPositions.get(id);
        if (initial) {
          newPositions.set(id, initial.clone().add(deltaVec));
        }
      }

      const previewNodes = { ...sceneDataRef.current.nodes };
      for (const [id, pos] of newPositions) {
        previewNodes[id] = {
          ...previewNodes[id],
          position: {
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            z: Math.round(pos.z),
          },
        };
      }
      if (hasNodeContact({ ...sceneDataRef.current, nodes: previewNodes })) {
        return;
      }

      for (const id of fd.selectedIds) {
        const ref = nodeRefs.current.get(id);
        const pos = newPositions.get(id);
        if (ref && pos) {
          ref.position.copy(pos);
        }
      }

      setSceneData((prev) => {
        const newNodes = { ...prev.nodes };
        for (const id of fd.selectedIds) {
          const ref = nodeRefs.current.get(id);
          if (ref) {
            newNodes[id] = {
              ...newNodes[id],
              position: {
                x: ref.position.x,
                y: ref.position.y,
                z: ref.position.z,
              },
            };
          }
        }
        return { ...prev, nodes: newNodes };
      });
    },
    [camera, gl],
  );

  const endFaceDrag = useCallback(() => {
    if (!faceDragRef.current) return;
    const fd = faceDragRef.current;

    setSceneData((prev) => {
      let result = { ...prev, nodes: { ...prev.nodes } };

      for (const id of fd.selectedIds) {
        const ref = nodeRefs.current.get(id);
        if (ref) {
          const snapped = {
            x: Math.round(ref.position.x),
            y: Math.round(ref.position.y),
            z: Math.round(ref.position.z),
          };
          ref.position.set(snapped.x, snapped.y, snapped.z);
          result.nodes[id] = {
            ...result.nodes[id],
            position: snapped,
          };
        }
      }

      if (hasNodeContact(result)) {
        for (const id of fd.selectedIds) {
          const initial = fd.initialPositions.get(id);
          const ref = nodeRefs.current.get(id);
          if (initial && ref) {
            ref.position.copy(initial);
          }
        }
        return prev;
      }

      for (const info of fd.connectingStruts) {
        const selNode = result.nodes[info.selNodeId];
        const unselNode = result.nodes[info.unselNodeId];
        if (!selNode || !unselNode) continue;

        const dx = selNode.position.x - unselNode.position.x;
        const dy = selNode.position.y - unselNode.position.y;
        const dz = selNode.position.z - unselNode.position.z;
        const newDist =
          Math.abs(fd.faceNormal.x * dx) +
          Math.abs(fd.faceNormal.y * dy) +
          Math.abs(fd.faceNormal.z * dz);

        if (!VALID_STRUT_LENGTHS.includes(newDist)) continue;

        const newStrut: StrutData = {
          id: crypto.randomUUID(),
          nodeA: info.selNodeId,
          faceA: info.selFace,
          nodeB: info.unselNodeId,
          faceB: info.unselFace,
          length: newDist,
        };

        result = removeStrutFromScene(result, info.strutId);
        if (
          canConnectStrut(
            result,
            newStrut.nodeA,
            newStrut.faceA,
            newStrut.nodeB,
            newStrut.faceB,
          )
        ) {
          result = addStrutToScene(result, newStrut);
        }
      }

      return result;
    });

    faceDragRef.current = null;
    gl.domElement.style.cursor = "";
  }, [gl]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        setSceneData((prev) => {
          let result = prev;
          for (const id of selectedIds) {
            result = removeNodeFromScene(result, id);
          }
          return result;
        });
        setSelectedIds(new Set());
      }

      if (e.key === "Escape") {
        setDrawState(null);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds]);

  const anySelected = selectedIds.size > 0;

  useEffect(() => {
    if (!drawState) {
      setHoverDrawLength(null);
      return;
    }

    setHoverDrawLength((current) => current ?? VALID_STRUT_LENGTHS[0]);
  }, [drawState]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__strutz = {
      log: () => {
        const s = sceneDataRef.current;
        return s;
      },
      occupied: () => {
        const s = sceneDataRef.current;
        return Object.fromEntries(
          Object.entries(s.nodes).map(([id, node]) => [
            id,
            Object.fromEntries(
              Object.entries(node.attachments)
                .filter(([, attachment]) => attachment.occupied)
                .map(([face, attachment]) => [face, attachment]),
            ),
          ]),
        );
      },
    };
  }, [selectedIds, drawState]);

  return (
    <group>
      <GroundPlane onClick={handleGroundClick} onPointerMove={handleGroundPointerMove} />

      {drawState && (
        <DrawPreview
          sceneData={sceneData}
          drawState={drawState}
          highlightedLength={hoverDrawLength ?? VALID_STRUT_LENGTHS[0]}
          onHoverLength={setHoverDrawLength}
          onPickLength={placeDrawStrutAtLength}
          onPickCorner45={placeCorner45Strut}
        />
      )}

      {Object.values(sceneData.nodes).map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          sceneData={sceneData}
          selected={selectedIds.has(node.id)}
          activeTool={activeTool}
          drawFromId={drawState?.fromNodeId ?? null}
          drawFromFace={drawState?.fromFace ?? null}
          isDragging={faceDragRef.current !== null && faceDragRef.current.selectedIds.includes(node.id)}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onFaceKnobClick={handleFaceKnobClick}
          refTracker={(ref) => {
            if (ref) nodeRefs.current.set(node.id, ref);
            else nodeRefs.current.delete(node.id);
          }}
        />
      ))}

      {Object.values(sceneData.struts).map((strut) => (
        <StrutMesh
          key={strut.id}
          strut={strut}
          sceneData={sceneData}
          onClick={handleStrutClick}
          onContextMenu={handleStrutContextMenu}
        />
      ))}

      {anySelected && activeTool === "select" && !faceDragRef.current && (
        <SelectionBox sceneData={sceneData} selectedIds={selectedIds} />
      )}
    </group>
  );
}

function DrawPreview({
  sceneData,
  drawState,
  highlightedLength,
  onHoverLength,
  onPickLength,
  onPickCorner45,
}: {
  sceneData: SceneData;
  drawState: { fromNodeId: string; fromFace: FaceName };
  highlightedLength: number;
  onHoverLength: (length: number) => void;
  onPickLength: (length: number) => void;
  onPickCorner45: (candidate: Corner45PreviewCandidate) => void;
}) {
  const sourceNode = sceneData.nodes[drawState.fromNodeId];
  if (!sourceNode) return null;

  const srcCenter = vec3ToThree(sourceNode.position);
  const faceNorm = FACE_NORMALS[drawState.fromFace];
  const half = nodeSize / 2;
  const srcAttach = new THREE.Vector3(
    srcCenter.x + faceNorm[0] * half,
    srcCenter.y + faceNorm[1] * half,
    srcCenter.z + faceNorm[2] * half,
  );
  const halfWidth = strutWidth / 2;
  const corner45Candidates = getCorner45PreviewCandidates(sceneData, drawState);

  return (
    <group>
      {VALID_STRUT_LENGTHS.map((len) => {
        const highlighted = len === highlightedLength;
        const centerSpacing = centerSpacingForStrutLength(len);
        const dstCenter = new THREE.Vector3(
          srcCenter.x + faceNorm[0] * centerSpacing,
          srcCenter.y + faceNorm[1] * centerSpacing,
          srcCenter.z + faceNorm[2] * centerSpacing,
        );
        const dstAttach = new THREE.Vector3(
          dstCenter.x - faceNorm[0] * half,
          dstCenter.y - faceNorm[1] * half,
          dstCenter.z - faceNorm[2] * half,
        );
        const dir = new THREE.Vector3().subVectors(dstAttach, srcAttach);
        const bodyLen = Math.max(dir.length(), 0.2);
        const mid = new THREE.Vector3().addVectors(srcAttach, dstAttach).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );

        return (
          <group
            key={len}
            renderOrder={highlighted ? 3 : 1}
            onPointerMove={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHoverLength(len);
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHoverLength(len);
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onPickLength(len);
            }}
          >
            <mesh position={mid} quaternion={quat}>
              <boxGeometry
                args={[
                  halfWidth * (highlighted ? 2.05 : 1.8),
                  bodyLen,
                  halfWidth * (highlighted ? 2.05 : 1.8),
                ]}
              />
              <meshBasicMaterial
                color={highlighted ? "#4ecca3" : "#ffaa00"}
                transparent
                opacity={highlighted ? 0.72 : 0.22}
                depthWrite={false}
              />
            </mesh>
            <mesh position={dstCenter}>
              <boxGeometry args={[nodeSize, nodeSize, nodeSize]} />
              <meshBasicMaterial
                color={highlighted ? "#4ecca3" : "#ffaa00"}
                transparent
                opacity={highlighted ? 0.48 : 0.16}
                depthWrite={false}
              />
            </mesh>
            <lineSegments position={dstCenter}>
              <edgesGeometry args={[new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize)]} />
              <lineBasicMaterial
                color={highlighted ? "#d7fff4" : "#ffaa00"}
                transparent
                opacity={highlighted ? 1 : 0.32}
                depthWrite={false}
              />
            </lineSegments>
          </group>
        );
      })}
      {corner45Candidates.map((candidate) => {
        const strut: StrutData = {
          id: `preview-${candidate.key}`,
          kind: "corner45",
          nodeA: drawState.fromNodeId,
          faceA: candidate.fromFace,
          nodeB: candidate.nodeId ?? `preview-node-${candidate.key}`,
          faceB: candidate.toFace,
          length: candidate.length,
        };
        const fromPos = vec3ToThree(getAttachmentWorldPosition(sceneData, strut.nodeA, strut.faceA));
        const toFaceNormal = faceNormalToThree(candidate.toFace);
        const toPos = candidate.position.clone().add(toFaceNormal.multiplyScalar(nodeSize / 2));
        const routePoints = getStrutRoutePoints(strut, fromPos, toPos);

        return (
          <group
            key={candidate.key}
            renderOrder={4}
            onPointerMove={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onPickCorner45(candidate);
            }}
          >
            {routePoints.slice(0, -1).map((point, index) => (
              <PreviewRouteSegment
                key={index}
                from={point}
                to={routePoints[index + 1]}
                halfWidth={halfWidth}
                onClick={(event: ThreeEvent<MouseEvent>) => {
                  event.stopPropagation();
                  onPickCorner45(candidate);
                }}
              />
            ))}
            {routePoints.map((point, index) => (
              <mesh key={`joint-${index}`} position={point}>
                <sphereGeometry args={[halfWidth * 0.9, 8, 8]} />
                <meshBasicMaterial
                  color="#38d9c7"
                  transparent
                  opacity={0.75}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function PreviewRouteSegment({
  from,
  to,
  halfWidth,
  onClick,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  halfWidth: number;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const rawLength = direction.length();
  if (rawLength < 0.01) return null;

  const midPoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );

  return (
    <>
      <mesh position={midPoint} quaternion={quaternion}>
        <boxGeometry args={[halfWidth * 1.95, rawLength, halfWidth * 1.95]} />
        <meshBasicMaterial
          color="#38d9c7"
          transparent
          opacity={0.62}
          depthWrite={false}
        />
      </mesh>
      <mesh position={midPoint} quaternion={quaternion} onClick={onClick}>
        <boxGeometry args={[halfWidth * 3.2, Math.max(rawLength, nodeSize), halfWidth * 3.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

function SelectionBox({
  sceneData,
  selectedIds,
}: {
  sceneData: SceneData;
  selectedIds: Set<string>;
}) {
  const allNodes = [...selectedIds]
    .map((id) => sceneData.nodes[id])
    .filter(Boolean) as NodeData[];

  if (allNodes.length === 0) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const n of allNodes) {
    minX = Math.min(minX, n.position.x - nodeSize / 2);
    minY = Math.min(minY, n.position.y - nodeSize / 2);
    minZ = Math.min(minZ, n.position.z - nodeSize / 2);
    maxX = Math.max(maxX, n.position.x + nodeSize / 2);
    maxY = Math.max(maxY, n.position.y + nodeSize / 2);
    maxZ = Math.max(maxZ, n.position.z + nodeSize / 2);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const sizeX = maxX - minX + 0.1;
  const sizeY = maxY - minY + 0.1;
  const sizeZ = maxZ - minZ + 0.1;

  return (
    <lineSegments position={[centerX, centerY, centerZ]}>
      <edgesGeometry args={[new THREE.BoxGeometry(sizeX, sizeY, sizeZ)]} />
      <lineBasicMaterial color="#e94560" transparent opacity={0.6} />
    </lineSegments>
  );
}

function GroundPlane({
  onClick,
  onPointerMove,
}: {
  onClick: (event: ThreeEvent<MouseEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      onClick={onClick}
      onPointerMove={onPointerMove}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial
        color="#223344"
        transparent
        opacity={0.0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

interface NodeMeshProps {
  node: NodeData;
  sceneData: SceneData;
  selected: boolean;
  activeTool: Tool;
  drawFromId: string | null;
  drawFromFace: FaceName | null;
  isDragging: boolean;
  onNodeClick: (nodeId: string, face: FaceName | null, event: ThreeEvent<MouseEvent>) => void;
  onNodeContextMenu: (nodeId: string, event: ThreeEvent<MouseEvent>) => void;
  onFaceKnobClick: (nodeId: string, face: FaceName, event: ThreeEvent<MouseEvent>) => void;
  refTracker: (ref: THREE.Group | null) => void;
}

function NodeMesh({
  node,
  sceneData,
  selected,
  activeTool,
  drawFromId,
  drawFromFace,
  isDragging,
  onNodeClick,
  onNodeContextMenu,
  onFaceKnobClick,
  refTracker,
}: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const halfSize = nodeSize / 2;

  useEffect(() => {
    refTracker(groupRef.current);
    return () => refTracker(null);
  }, [refTracker]);

  const isOccupied = (face: string) => {
    const attachments = sceneData.nodes[node.id]?.attachments;
    if (!attachments) return false;
    return attachments[face as FaceName]?.occupied ?? false;
  };

  const isDrawSource = drawFromId === node.id;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();

      let face: FaceName | null = null;

      const faceNormal = e.face?.normal;
      if (faceNormal) {
        const approx = faceNormal.clone().round();
        const key = `${approx.x},${approx.y},${approx.z}`;
        face = NORMAL_TO_FACE[key] ?? null;
      }

      if (!face && groupRef.current) {
        const local = groupRef.current.worldToLocal(e.point.clone());
        const ax = Math.abs(local.x);
        const ay = Math.abs(local.y);
        const az = Math.abs(local.z);
        if (ax > ay && ax > az) {
          face = local.x > 0 ? "right" : "left";
        } else if (ay > ax && ay > az) {
          face = local.y > 0 ? "top" : "bottom";
        } else {
          face = local.z > 0 ? "front" : "back";
        }
      }

      onNodeClick(node.id, face, e);
    },
    [node.id, onNodeClick],
  );

  const handleFaceKnobClick = useCallback(
    (face: FaceName, e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onFaceKnobClick(node.id, face, e);
    },
    [node.id, onFaceKnobClick],
  );

  const handleContextMenu = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      onNodeContextMenu(node.id, e);
    },
    [node.id, onNodeContextMenu],
  );

  return (
    <group
      ref={groupRef}
      position={[node.position.x, node.position.y, node.position.z]}
    >
      <mesh castShadow onClick={handleClick} onContextMenu={handleContextMenu}>
        <boxGeometry args={[nodeSize, nodeSize, nodeSize]} />
        <meshStandardMaterial
          color={isDragging ? "#e9a040" : selected ? "#e94560" : "#334466"}
          flatShading={true}
          transparent
          opacity={0.9}
        />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize)]} />
        <lineBasicMaterial color="#5588cc" transparent opacity={0.4} />
      </lineSegments>

      {FACE_ENTRIES.map(([name, normal]) => (
        <FaceIndicator
          key={name}
          face={name}
          normal={normal}
          halfSize={halfSize}
          occupied={isOccupied(name)}
          highlighted={isDrawSource && drawFromFace === name}
          activeTool={activeTool}
          draggable={selected && activeTool === "select"}
          drawable={activeTool === "draw-strut"}
          onFaceKnobClick={(e) => handleFaceKnobClick(name as FaceName, e)}
          onFaceDrawClick={(e) => onNodeClick(node.id, name as FaceName, e)}
        />
      ))}
    </group>
  );
}

interface FaceIndicatorProps {
  face: string;
  normal: [number, number, number];
  halfSize: number;
  occupied: boolean;
  highlighted: boolean;
  activeTool: Tool;
  draggable: boolean;
  drawable: boolean;
  onFaceKnobClick: (e: ThreeEvent<MouseEvent>) => void;
  onFaceDrawClick: (e: ThreeEvent<MouseEvent>) => void;
}

function FaceIndicator({
  face,
  normal,
  halfSize,
  occupied,
  highlighted,
  activeTool,
  draggable,
  drawable,
  onFaceKnobClick,
  onFaceDrawClick,
}: FaceIndicatorProps) {
  const pos: [number, number, number] = [
    normal[0] * (halfSize + 0.08),
    normal[1] * (halfSize + 0.08),
    normal[2] * (halfSize + 0.08),
  ];

  const color = highlighted
    ? "#ffaa00"
    : occupied
      ? "#555555"
      : (FACE_COLORS[face] ?? "#ffffff");

  const opacity = highlighted
    ? 1
    : occupied
      ? 0.3
      : activeTool === "draw-strut"
        ? 0.8
        : draggable
          ? 0.7
          : 0.3;

  const size = draggable ? 0.28 : 0.22;

  return (
    <mesh
      position={pos}
      renderOrder={1}
      onClick={
        draggable
          ? (e: ThreeEvent<MouseEvent>) => {
              onFaceKnobClick(e);
            }
          : drawable
            ? (e: ThreeEvent<MouseEvent>) => {
                onFaceDrawClick(e);
              }
            : undefined
      }
    >
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={true} />
    </mesh>
  );
}

interface StrutMeshProps {
  strut: StrutData;
  sceneData: SceneData;
  onClick: (strutId: string, point: THREE.Vector3, event: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (strutId: string, event: ThreeEvent<MouseEvent>) => void;
}

function StrutMesh({ strut, sceneData, onClick, onContextMenu }: StrutMeshProps) {
  const nodeA = sceneData.nodes[strut.nodeA];
  const nodeB = sceneData.nodes[strut.nodeB];
  if (!nodeA || !nodeB) return null;

  const fromPos = vec3ToThree(
    getAttachmentWorldPosition(sceneData, strut.nodeA, strut.faceA),
  );
  const toPos = vec3ToThree(
    getAttachmentWorldPosition(sceneData, strut.nodeB, strut.faceB),
  );
  const halfWidth = strutWidth / 2;
  const routePoints = getStrutRoutePoints(strut, fromPos, toPos);

  return (
    <group>
      {routePoints.slice(0, -1).map((point, index) => (
        <StrutSegmentMesh
          key={index}
          from={point}
          to={routePoints[index + 1]}
          halfWidth={halfWidth}
          color={strut.kind === "corner45" ? "#718f7d" : "#667799"}
          onClick={(event) => onClick(strut.id, event.point.clone(), event)}
          onContextMenu={(event) => onContextMenu(strut.id, event)}
        />
      ))}
      {routePoints.map((point, index) => (
        <mesh key={`joint-${index}`} position={point}>
          <sphereGeometry args={[halfWidth, 8, 8]} />
          <meshStandardMaterial color="#556677" flatShading={true} />
        </mesh>
      ))}
    </group>
  );
}

function getStrutRoutePoints(
  strut: StrutData,
  fromPos: THREE.Vector3,
  toPos: THREE.Vector3,
): THREE.Vector3[] {
  if (strut.kind !== "corner45") {
    return [fromPos, toPos];
  }

  const stubLength = nodeSize / 2;
  return [
    fromPos,
    fromPos.clone().add(faceNormalToThree(strut.faceA).multiplyScalar(stubLength)),
    toPos.clone().add(faceNormalToThree(strut.faceB).multiplyScalar(stubLength)),
    toPos,
  ];
}

function StrutSegmentMesh({
  from,
  to,
  halfWidth,
  color,
  onClick,
  onContextMenu,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  halfWidth: number;
  color: string;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const rawLength = direction.length();
  if (rawLength < 0.01) return null;

  const midPoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const length = Math.max(rawLength, 0.1);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );

  return (
    <>
      <mesh
        position={midPoint}
        quaternion={quaternion}
        castShadow
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <boxGeometry args={[halfWidth * 2, length, halfWidth * 2]} />
        <meshStandardMaterial color={color} flatShading={true} />
      </mesh>
      <mesh
        position={midPoint}
        quaternion={quaternion}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <boxGeometry args={[halfWidth * 2, length, halfWidth * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
