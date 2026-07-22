import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import * as THREE from "three";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html } from "@react-three/drei";
import type { StrutDrawMode, Tool } from "./types";
import type {
  SceneData,
  NodeData,
  StrutData,
  PanelData,
  WidgetData,
  WidgetKind,
  FaceName,
  StrutKind,
  Vec3,
} from "../core/types";
import {
  createNode,
  addNodeToScene,
  addStraightStrutRunsToScene,
  removeNodeFromScene,
  canConnectStrut,
  addStrutToScene,
  removeStrutFromScene,
  createPanelFromStruts,
  validatePanelPlacement,
  addPanelToScene,
  removePanelFromScene,
  flipPanelInScene,
  getPanelBrushGeometry,
  addWidgetToScene,
  removeWidgetFromScene,
  rotateWidgetInScene,
  getAttachmentWorldPosition,
  hasNodeContact,
} from "../core/scene";
import {
  COCKPIT_GEOMETRY,
  ENGINE_GEOMETRY,
  nodeSize,
  REPULSOR_GEOMETRY,
  strutWidth,
  THRUSTER_GEOMETRY,
  VALID_STRUT_LENGTHS,
  WHEEL_GEOMETRY,
} from "../core/constants";
import {
  FACE_NORMALS as RULE_FACE_NORMALS,
  centerSpacingForStrutLength,
  corner45LengthFromAxisDelta,
  faceAxis,
  getCorner45PlaneNormal as getRuleCorner45PlaneNormal,
  getStrutRoutePoints as getRuleStrutRoutePoints,
  isCornerStrutKind,
} from "../core/rules";
import {
  decomposeStrutRun as decomposeRunLength,
  getCorner45ConnectionFaces,
  getNearestStrutLength,
  getStraightConnectionFaces as getConnectionFacesBetweenNodes,
  getStraightStrutTarget,
} from "../core/placement";
import { SCENE_COLORS } from "./sceneColors";
import { getPartLayerId, getVisibleLayerIds } from "../core/layers";
import {
  IDENTITY_ROTATION,
  placeAssembly,
  quarterTurn,
  validateAssemblyPaste,
  type AssemblyClipboard,
  type RotationMatrix,
} from "../core/composition";
import {
  getBuildSurfaceCenter,
  GROUND_PLANE_SIZE,
  GROUND_PLANE_Y,
} from "./viewportConfig";
import {
  getFaceForAxisLock,
  getNearestStructuralDrawCandidate,
  getStructuralDirectionLabel,
  getStructuralDrawShortcut,
  type StructuralDrawAxis,
} from "./structuralDraw";
import { createStrutSurface, triangulateQuadSurface } from "../core/geometry";

const FACE_COLORS: Record<string, string> = {
  top: "#4ecca3",
  bottom: "#e94560",
  front: "#3498db",
  back: "#f39c12",
  right: "#9b59b6",
  left: "#1abc9c",
};

const HOVER_EDGE_COLOR = "#fff176";

const FACE_NORMALS: Record<FaceName, [number, number, number]> = {
  top: [RULE_FACE_NORMALS.top.x, RULE_FACE_NORMALS.top.y, RULE_FACE_NORMALS.top.z],
  bottom: [RULE_FACE_NORMALS.bottom.x, RULE_FACE_NORMALS.bottom.y, RULE_FACE_NORMALS.bottom.z],
  front: [RULE_FACE_NORMALS.front.x, RULE_FACE_NORMALS.front.y, RULE_FACE_NORMALS.front.z],
  back: [RULE_FACE_NORMALS.back.x, RULE_FACE_NORMALS.back.y, RULE_FACE_NORMALS.back.z],
  right: [RULE_FACE_NORMALS.right.x, RULE_FACE_NORMALS.right.y, RULE_FACE_NORMALS.right.z],
  left: [RULE_FACE_NORMALS.left.x, RULE_FACE_NORMALS.left.y, RULE_FACE_NORMALS.left.z],
};

const FACE_ENTRIES = Object.entries(FACE_NORMALS) as [
  FaceName,
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

function getNearestDrawLength(
  sourceNode: NodeData,
  fromFace: FaceName,
  point: THREE.Vector3,
): number {
  return getNearestStrutLength(sourceNode, fromFace, point);
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
        "corner",
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

interface SceneProps {
  activeTool: Tool;
  selectedWidgetKind: WidgetKind;
  strutDrawMode: StrutDrawMode;
  sceneData: SceneData;
  setSceneData: Dispatch<SetStateAction<SceneData>>;
  onFocusPoint: (point: { x: number; y: number; z: number }) => void;
  selectedStrutIds: Set<string>;
  setSelectedStrutIds: Dispatch<SetStateAction<Set<string>>>;
  selectedPanelIds: Set<string>;
  setSelectedPanelIds: Dispatch<SetStateAction<Set<string>>>;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedWidgetIds: Set<string>;
  setSelectedWidgetIds: Dispatch<SetStateAction<Set<string>>>;
  activeLayerId: string;
  pasteAssembly: AssemblyClipboard | null;
  onCancelPaste: () => void;
  onCommitPaste: (assembly: SceneData) => void;
  panelPreviewSide: "top" | "bottom" | null;
}

export function Scene({
  activeTool,
  selectedWidgetKind,
  strutDrawMode,
  sceneData,
  setSceneData,
  onFocusPoint,
  selectedStrutIds,
  setSelectedStrutIds,
  selectedPanelIds,
  setSelectedPanelIds,
  selectedNodeIds,
  setSelectedNodeIds,
  selectedWidgetIds,
  setSelectedWidgetIds,
  activeLayerId,
  pasteAssembly,
  onCancelPaste,
  onCommitPaste,
  panelPreviewSide,
}: SceneProps) {
  const [drawState, setDrawState] = useState<{
    fromNodeId: string;
    fromFace: FaceName;
    sourceNodeIds: string[];
  } | null>(null);
  const [hoverDrawLength, setHoverDrawLength] = useState<number | null>(null);
  const [hoverCornerKey, setHoverCornerKey] = useState<string | null>(null);
  const [drawAxisLock, setDrawAxisLock] = useState<StructuralDrawAxis | null>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [pasteTarget, setPasteTarget] = useState<Vec3 | null>(null);
  const [pasteRotation, setPasteRotation] = useState<RotationMatrix>(IDENTITY_ROTATION);
  const sceneDataRef = useRef(sceneData);
  sceneDataRef.current = sceneData;
  const visibleLayerIds = useMemo(() => getVisibleLayerIds(sceneData), [sceneData.layers]);
  const visible = useCallback(
    (part: { layerId?: string }) => visibleLayerIds.has(getPartLayerId(part)),
    [visibleLayerIds],
  );

  const updateHoveredPart = useCallback((key: string, hovered: boolean) => {
    setHoveredPart((current) => hovered ? key : current === key ? null : current);
  }, []);

  const { camera } = useThree();
  const pasteCandidate = useMemo(() => pasteAssembly && pasteTarget
    ? placeAssembly(pasteAssembly, pasteRotation, pasteTarget)
    : null, [pasteAssembly, pasteRotation, pasteTarget]);
  const pasteValid = useMemo(() => pasteCandidate
    ? validateAssemblyPaste(sceneData, pasteCandidate)
    : false, [pasteCandidate, sceneData]);

  useEffect(() => {
    if (!pasteAssembly) {
      setPasteTarget(null);
      setPasteRotation(IDENTITY_ROTATION);
      return;
    }
    setDrawState(null);
    setPasteTarget({ x: 0, y: 0, z: 0 });
    setPasteRotation(IDENTITY_ROTATION);
  }, [pasteAssembly]);

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
        if (isCornerStrutKind(kind)) {
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
        layerId: activeLayerId,
        kind,
        nodeA: fromNodeId,
        faceA: fromFace,
        nodeB: nodeId,
        faceB: face,
        length: Math.round(len * 100) / 100,
      };
      setSceneData((prev) => addStrutToScene(prev, strut));
    },
    [activeLayerId, setSceneData],
  );

  const placeDrawStrutAtLength = useCallback(
    (length: number, inferredFace?: FaceName) => {
      if (!drawState) return;
      const fromFace = inferredFace ?? drawState.fromFace;
      const primarySource = sceneDataRef.current.nodes[drawState.fromNodeId];
      const nextFocus = primarySource
        ? getStraightStrutTarget(primarySource, fromFace, length)
        : null;
      setSceneData((prev) => addStraightStrutRunsToScene(
        prev,
        drawState.sourceNodeIds,
        fromFace,
        length,
        activeLayerId,
      ));
      if (nextFocus) onFocusPoint(nextFocus);
      setDrawState(null);
    },
    [activeLayerId, drawState, onFocusPoint, setSceneData],
  );

  const updateStructuralDrawCandidate = useCallback(
    (pointerNdc: THREE.Vector2) => {
      if (activeTool !== "draw-strut" || strutDrawMode !== "straight" || !drawState) return;

      const sourceNode = sceneDataRef.current.nodes[drawState.fromNodeId];
      if (!sourceNode) return;
      const availableFaces = FACE_ENTRIES
        .map(([face]) => face)
        .filter((face) => !drawAxisLock || faceAxis(face) === drawAxisLock)
        .filter((face) => drawState.sourceNodeIds.every((nodeId) =>
          !sceneDataRef.current.nodes[nodeId]?.attachments[face]?.occupied));
      const candidate = getNearestStructuralDrawCandidate(sourceNode, camera, pointerNdc, availableFaces);
      if (!candidate) return;

      setDrawState((current) => current ? { ...current, fromFace: candidate.face } : current);
      setHoverDrawLength(candidate.length);
      setHoverCornerKey(null);
    },
    [activeTool, camera, drawAxisLock, drawState, strutDrawMode],
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
          "corner",
        )
      ) {
        commitStrut(
          drawState.fromNodeId,
          candidate.fromFace,
          candidate.nodeId,
          candidate.toFace,
          "corner",
        );
        onFocusPoint(candidate.position);
      }
      setDrawState(null);
    },
    [drawState, commitStrut, onFocusPoint],
  );

  const handleGroundClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (pasteAssembly) {
        event.stopPropagation();
        if (event.delta < 3 && pasteCandidate && pasteValid) onCommitPaste(pasteCandidate);
        return;
      }
      if (activeTool === "draw-strut" && strutDrawMode === "straight" && drawState) {
        event.stopPropagation();
        const sourceNode = sceneDataRef.current.nodes[drawState.fromNodeId];
        if (!sourceNode) return setDrawState(null);
        const availableFaces = FACE_ENTRIES
          .map(([face]) => face)
          .filter((face) => !drawAxisLock || faceAxis(face) === drawAxisLock)
          .filter((face) => drawState.sourceNodeIds.every((nodeId) =>
            !sceneDataRef.current.nodes[nodeId]?.attachments[face]?.occupied));
        const candidate = getNearestStructuralDrawCandidate(
          sourceNode,
          camera,
          event.pointer,
          availableFaces,
        );
        if (!candidate) return;
        setDrawState((current) => current ? { ...current, fromFace: candidate.face } : current);
        setHoverDrawLength(candidate.length);
        placeDrawStrutAtLength(candidate.length, candidate.face);
        return;
      }

      setDrawState(null);
    },
    [activeTool, camera, drawAxisLock, drawState, onCommitPaste, pasteAssembly, pasteCandidate, pasteValid, placeDrawStrutAtLength, strutDrawMode],
  );

  const handleGroundPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (pasteAssembly) {
        setPasteTarget({ x: Math.round(event.point.x), y: 0, z: Math.round(event.point.z) });
        return;
      }
      updateStructuralDrawCandidate(event.pointer);
    },
    [pasteAssembly, updateStructuralDrawCandidate],
  );

  const handleNodeClick = useCallback(
    (nodeId: string, face: FaceName | null, event: ThreeEvent<MouseEvent>) => {
      const clickedNode = sceneDataRef.current.nodes[nodeId];
      if (clickedNode) onFocusPoint(clickedNode.position);

      if (event.nativeEvent.shiftKey) {
        event.stopPropagation();
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
        return;
      }

      if (activeTool === "draw-strut") {
        event.stopPropagation();

        if (!drawState) {
          const sourceNodeIds = strutDrawMode === "straight" && selectedNodeIds.has(nodeId) && selectedNodeIds.size > 1
            ? [...selectedNodeIds]
            : [nodeId];
          if (strutDrawMode === "straight" && clickedNode) {
            const availableFaces = FACE_ENTRIES
              .map(([candidateFace]) => candidateFace)
              .filter((candidateFace) => sourceNodeIds.every((sourceNodeId) =>
                !sceneDataRef.current.nodes[sourceNodeId]?.attachments[candidateFace]?.occupied));
            const candidate = getNearestStructuralDrawCandidate(
              clickedNode,
              camera,
              event.pointer,
              availableFaces,
            );
            if (candidate) {
              setDrawState({ fromNodeId: nodeId, fromFace: candidate.face, sourceNodeIds });
              setHoverDrawLength(candidate.length);
            }
          } else if (face) {
            setDrawState({ fromNodeId: nodeId, fromFace: face, sourceNodeIds });
          }
          return;
        }

        if (drawState.fromNodeId === nodeId &&
          (strutDrawMode === "straight" || drawState.fromFace === face)) {
          setDrawState(null);
          return;
        }

        if (drawState.fromNodeId === nodeId) {
          if (face) {
            const sourceNodeIds = strutDrawMode === "straight" && selectedNodeIds.has(nodeId) && selectedNodeIds.size > 1
              ? [...selectedNodeIds]
              : [nodeId];
            setDrawState({ fromNodeId: nodeId, fromFace: face, sourceNodeIds });
          }
          return;
        }

        const fromNode = sceneDataRef.current.nodes[drawState.fromNodeId];
        const toNode = sceneDataRef.current.nodes[nodeId];
        if (!fromNode || !toNode) return;

        if (strutDrawMode === "corner") {
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
              "corner",
            );
            setDrawState(null);
          }
          return;
        }

        if (drawState.sourceNodeIds.length > 1) {
          const inferredFaces = getConnectionFacesBetweenNodes(fromNode, toNode);
          if (!inferredFaces) return;
          const length = getNearestDrawLength(fromNode, inferredFaces.fromFace, vec3ToThree(toNode.position));
          placeDrawStrutAtLength(length, inferredFaces.fromFace);
          return;
        }

        const inferredFaces = getConnectionFacesBetweenNodes(fromNode, toNode);
        if (inferredFaces) {
          const fromAttachment = getAttachmentWorldPosition(
            sceneDataRef.current,
            drawState.fromNodeId,
            inferredFaces.fromFace,
          );
          const toAttachment = getAttachmentWorldPosition(
            sceneDataRef.current,
            nodeId,
            inferredFaces.toFace,
          );
          const exactLength = vec3ToThree(fromAttachment).distanceTo(vec3ToThree(toAttachment));
          const catalogLength = VALID_STRUT_LENGTHS.find((value) =>
            Math.abs(value - exactLength) < 0.01);
          if (catalogLength !== undefined) {
            placeDrawStrutAtLength(catalogLength, inferredFaces.fromFace);
            return;
          }
        }

      }

      if (activeTool === "place-widget" && face) {
        event.stopPropagation();
        const widget: WidgetData = {
          id: crypto.randomUUID(),
          layerId: activeLayerId,
          kind: selectedWidgetKind,
          nodeId,
          face,
          rotation: 0,
        };
        setSceneData((prev) => addWidgetToScene(prev, widget));
      }
    },
    [activeLayerId, activeTool, camera, drawState, commitStrut, onFocusPoint, placeDrawStrutAtLength, selectedWidgetKind, strutDrawMode],
  );

  const handleNodeContextMenu = useCallback(
    (nodeId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      setSelectedNodeIds(new Set([nodeId]));
      setSelectedStrutIds(new Set());
      setSelectedPanelIds(new Set());
      setSelectedWidgetIds(new Set());
      const node = sceneDataRef.current.nodes[nodeId];
      if (node) onFocusPoint(node.position);
    },
    [onFocusPoint],
  );

  const handleStrutContextMenu = useCallback(
    (strutId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      setSelectedNodeIds(new Set());
      setSelectedStrutIds(new Set([strutId]));
      setSelectedPanelIds(new Set());
      setSelectedWidgetIds(new Set());
      setDrawState(null);
      onFocusPoint(event.point);
    },
    [onFocusPoint],
  );

  const handleStrutClick = useCallback(
    (strutId: string, point: THREE.Vector3, event: ThreeEvent<MouseEvent>) => {
      if (event.nativeEvent.shiftKey) {
        event.stopPropagation();
        onFocusPoint(point);
        setSelectedStrutIds((prev) => {
          const next = new Set(prev);
          if (next.has(strutId)) next.delete(strutId);
          else next.add(strutId);
          return next;
        });
        return;
      }

      if (activeTool !== "draw-strut") return;
      event.stopPropagation();

      const strut = sceneDataRef.current.struts[strutId];
      if (!strut || isCornerStrutKind(strut.kind) || strut.length < 3) {
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
        }, strut.layerId);
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
          }, strut.layerId);
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
            layerId: strut.layerId,
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
    [activeTool, onFocusPoint],
  );

  const handlePanelClick = useCallback(
    (panelId: string, event: ThreeEvent<MouseEvent>) => {
      if (!event.nativeEvent.shiftKey) return;

      event.stopPropagation();
      onFocusPoint(event.point);
      setSelectedPanelIds((prev) => {
        const next = new Set(prev);
        if (next.has(panelId)) next.delete(panelId);
        else next.add(panelId);
        return next;
      });
    },
    [onFocusPoint],
  );

  const handlePanelContextMenu = useCallback(
    (panelId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      setSelectedNodeIds(new Set());
      setSelectedStrutIds(new Set());
      setSelectedPanelIds(new Set([panelId]));
      setSelectedWidgetIds(new Set());
      onFocusPoint(event.point);
    },
    [onFocusPoint],
  );

  const handleWidgetClick = useCallback(
    (widgetId: string, event: ThreeEvent<MouseEvent>) => {
      if (!event.nativeEvent.shiftKey) return;
      event.stopPropagation();
      onFocusPoint(event.point);
      setSelectedWidgetIds((prev) => {
        const next = new Set(prev);
        if (next.has(widgetId)) next.delete(widgetId);
        else next.add(widgetId);
        return next;
      });
    },
    [onFocusPoint],
  );

  const handleWidgetContextMenu = useCallback(
    (widgetId: string, event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      setSelectedNodeIds(new Set());
      setSelectedStrutIds(new Set());
      setSelectedPanelIds(new Set());
      setSelectedWidgetIds(new Set([widgetId]));
      onFocusPoint(event.point);
    },
    [onFocusPoint],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (pasteAssembly) {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancelPaste();
          return;
        }
        const axis = e.key.toLowerCase();
        if (axis === "x" || axis === "y" || axis === "z") {
          e.preventDefault();
          setPasteRotation((rotation) => quarterTurn(rotation, axis, e.shiftKey ? -1 : 1));
        }
        return;
      }

      const drawShortcut = drawState && strutDrawMode === "straight"
        ? getStructuralDrawShortcut(e.key)
        : null;
      if (drawShortcut?.kind === "length") {
        e.preventDefault();
        placeDrawStrutAtLength(drawShortcut.length);
        return;
      }
      if (drawShortcut?.kind === "axis") {
        e.preventDefault();
        const nextLock = drawAxisLock === drawShortcut.axis ? null : drawShortcut.axis;
        setDrawAxisLock(nextLock);
        if (nextLock) {
          const availableFaces = FACE_ENTRIES
            .map(([face]) => face)
            .filter((face) => drawState!.sourceNodeIds.every((nodeId) =>
              !sceneDataRef.current.nodes[nodeId]?.attachments[face]?.occupied));
          const lockedFace = getFaceForAxisLock(nextLock, drawState!.fromFace, availableFaces);
          if (lockedFace) {
            setDrawState((current) => current ? { ...current, fromFace: lockedFace } : current);
          }
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          selectedNodeIds.size === 0 && selectedStrutIds.size === 0 &&
          selectedPanelIds.size === 0 && selectedWidgetIds.size === 0
        ) return;
        e.preventDefault();
        setSceneData((prev) => {
          let result = prev;
          for (const id of selectedNodeIds) {
            result = removeNodeFromScene(result, id);
          }
          for (const id of selectedStrutIds) {
            result = removeStrutFromScene(result, id);
          }
          for (const id of selectedPanelIds) {
            result = removePanelFromScene(result, id);
          }
          for (const id of selectedWidgetIds) {
            result = removeWidgetFromScene(result, id);
          }
          return result;
        });
        setSelectedNodeIds(new Set());
        setSelectedStrutIds(new Set());
        setSelectedPanelIds(new Set());
        setSelectedWidgetIds(new Set());
      }

      if (e.key === "Escape") {
        setDrawState(null);
        setSelectedNodeIds(new Set());
        setSelectedStrutIds(new Set());
        setSelectedPanelIds(new Set());
        setSelectedWidgetIds(new Set());
      }

      if (e.key.toLowerCase() === "f" && selectedPanelIds.size > 0) {
        e.preventDefault();
        setSceneData((prev) => {
          let result = prev;
          for (const id of selectedPanelIds) {
            result = flipPanelInScene(result, id);
          }
          return result;
        });
      }

      if (e.key.toLowerCase() === "r" && selectedWidgetIds.size > 0) {
        e.preventDefault();
        setSceneData((prev) => {
          let result = prev;
          for (const id of selectedWidgetIds) {
            result = rotateWidgetInScene(result, id);
          }
          return result;
        });
      }

      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (selectedStrutIds.size < 3) {
          window.alert("Panels require at least three selected struts forming one closed loop.");
          return;
        }
        setSceneData((prev) => {
          const strutIds = [...selectedStrutIds];
          const validation = validatePanelPlacement(prev, strutIds);
          if (!validation.valid) {
            window.alert(validation.reason === "invalid-loop"
              ? "The selected struts must form exactly one closed, unbranched loop."
              : validation.reason === "invalid-brush"
                ? "That closed loop does not form a valid panel surface."
                : "Both sides of that panel loop already contain panels.");
            return prev;
          }

          const panel = createPanelFromStruts(prev, strutIds);
          if (!panel) {
            window.alert("The panel could not be created from that loop.");
            return prev;
          }

          return addPanelToScene(prev, { ...panel, layerId: activeLayerId });
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeTool,
    activeLayerId,
    drawAxisLock,
    drawState,
    placeDrawStrutAtLength,
    onCancelPaste,
    pasteAssembly,
    selectedNodeIds,
    selectedPanelIds,
    selectedStrutIds,
    selectedWidgetIds,
    strutDrawMode,
  ]);

  useEffect(() => {
    if (!drawState) {
      setHoverDrawLength(null);
      setDrawAxisLock(null);
      return;
    }

    setHoverDrawLength((current) => current ?? VALID_STRUT_LENGTHS[0]);
  }, [drawState]);

  useEffect(() => {
    setDrawState(null);
    setHoverDrawLength(null);
    setHoverCornerKey(null);
    setDrawAxisLock(null);
  }, [strutDrawMode]);

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
  }, [selectedNodeIds, selectedStrutIds, selectedPanelIds, selectedWidgetIds, drawState]);

  return (
    <group>
      <GroundPlane
          interactive
        onClick={handleGroundClick}
        onPointerMove={handleGroundPointerMove}
      />

      {drawState && (
        <DrawPreview
          sceneData={sceneData}
          drawState={drawState}
          highlightedLength={hoverDrawLength ?? VALID_STRUT_LENGTHS[0]}
          highlightedCornerKey={hoverCornerKey}
          strutDrawMode={strutDrawMode}
          axisLock={drawAxisLock}
          onHoverLength={(length) => {
            setHoverDrawLength(length);
            setHoverCornerKey(null);
          }}
          onHoverCorner={setHoverCornerKey}
          onPickLength={placeDrawStrutAtLength}
          onPickCorner45={placeCorner45Strut}
        />
      )}

      {pasteCandidate && (
        <AssemblyPastePreview sceneData={pasteCandidate} valid={pasteValid} target={pasteTarget} />
      )}

      {Object.values(sceneData.panels ?? {}).filter(visible).map((panel) => (
        <PanelMesh
          key={panel.id}
          panel={panel}
          sceneData={sceneData}
          selected={selectedPanelIds.has(panel.id)}
          hovered={hoveredPart === `panel:${panel.id}`}
          onHoverChange={(hovered) => updateHoveredPart(`panel:${panel.id}`, hovered)}
          onClick={handlePanelClick}
          onContextMenu={handlePanelContextMenu}
        />
      ))}

      {panelPreviewSide && selectedStrutIds.size >= 3 && (
        <PanelPreviewMesh
          sceneData={sceneData}
          strutIds={[...selectedStrutIds]}
          side={panelPreviewSide}
        />
      )}

      {Object.values(sceneData.widgets ?? {}).filter(visible).map((widget) => (
        <WidgetMesh
          key={widget.id}
          widget={widget}
          sceneData={sceneData}
          selected={selectedWidgetIds.has(widget.id)}
          hovered={hoveredPart === `widget:${widget.id}`}
          onHoverChange={(hovered) => updateHoveredPart(`widget:${widget.id}`, hovered)}
          onClick={handleWidgetClick}
          onContextMenu={handleWidgetContextMenu}
        />
      ))}

      {Object.values(sceneData.nodes).filter(visible).map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          sceneData={sceneData}
          selected={selectedNodeIds.has(node.id)}
          hovered={hoveredPart === `node:${node.id}`}
          onHoverChange={(hovered) => updateHoveredPart(`node:${node.id}`, hovered)}
          activeTool={activeTool}
          drawFromId={drawState?.fromNodeId ?? null}
          drawFromFace={drawState?.fromFace ?? null}
          faceSelectionRequired={strutDrawMode === "corner"}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
        />
      ))}

      {Object.values(sceneData.struts).filter(visible).map((strut) => (
        <StrutMesh
          key={strut.id}
          strut={strut}
          sceneData={sceneData}
          selected={selectedStrutIds.has(strut.id)}
          hovered={hoveredPart === `strut:${strut.id}`}
          onHoverChange={(hovered) => updateHoveredPart(`strut:${strut.id}`, hovered)}
          onClick={handleStrutClick}
          onContextMenu={handleStrutContextMenu}
        />
      ))}

    </group>
  );
}

function AssemblyPastePreview({
  sceneData,
  valid,
  target,
}: {
  sceneData: SceneData;
  valid: boolean;
  target: Vec3 | null;
}) {
  const color = valid ? "#4ecca3" : "#e94560";
  return (
    <group>
      {Object.values(sceneData.panels).map((panel) => (
        <PanelPreviewMesh
          key={panel.id}
          sceneData={sceneData}
          strutIds={panel.strutIds}
          side={panel.side ?? "top"}
          color={color}
        />
      ))}
      {Object.values(sceneData.struts).map((strut) => (
        <StrutMesh
          key={strut.id}
          strut={strut}
          sceneData={sceneData}
          selected={false}
          hovered={false}
          previewColor={color}
          onHoverChange={() => undefined}
          onClick={() => undefined}
          onContextMenu={() => undefined}
        />
      ))}
      {Object.values(sceneData.nodes).map((node) => (
        <mesh key={node.id} position={[node.position.x, node.position.y, node.position.z]} raycast={() => null}>
          <boxGeometry args={[nodeSize, nodeSize, nodeSize]} />
          <meshStandardMaterial color={color} transparent opacity={0.55} depthWrite={false} />
          <Edges color={color} />
        </mesh>
      ))}
      {Object.values(sceneData.widgets).map((widget) => {
        const position = getAttachmentWorldPosition(sceneData, widget.nodeId, widget.face);
        return (
          <mesh key={widget.id} position={[position.x, position.y, position.z]} raycast={() => null}>
            <sphereGeometry args={[0.34, 10, 8]} />
            <meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false} />
          </mesh>
        );
      })}
      {target && (
        <Html position={[target.x, target.y + 1.2, target.z]} center style={{ pointerEvents: "none" }}>
          <div style={{
            whiteSpace: "nowrap",
            padding: "5px 8px",
            borderRadius: 4,
            background: "rgba(11, 29, 53, 0.9)",
            border: `1px solid ${color}`,
            color: valid ? "#d7fff4" : "#ffd5dc",
            fontSize: 11,
          }}>
            {valid ? "Click to place" : "Placement blocked"} · X/Y/Z rotate · Esc cancel
          </div>
        </Html>
      )}
    </group>
  );
}

function DrawPreview({
  sceneData,
  drawState,
  highlightedLength,
  highlightedCornerKey,
  strutDrawMode,
  axisLock,
  onHoverLength,
  onHoverCorner,
  onPickLength,
  onPickCorner45,
}: {
  sceneData: SceneData;
  drawState: { fromNodeId: string; fromFace: FaceName; sourceNodeIds: string[] };
  highlightedLength: number;
  highlightedCornerKey: string | null;
  strutDrawMode: StrutDrawMode;
  axisLock: StructuralDrawAxis | null;
  onHoverLength: (length: number) => void;
  onHoverCorner: (key: string) => void;
  onPickLength: (length: number) => void;
  onPickCorner45: (candidate: Corner45PreviewCandidate) => void;
}) {
  const sourceNode = sceneData.nodes[drawState.fromNodeId];
  if (!sourceNode) return null;

  const faceNorm = FACE_NORMALS[drawState.fromFace];
  const half = nodeSize / 2;
  const halfWidth = strutWidth / 2;
  const corner45Candidates = getCorner45PreviewCandidates(sceneData, drawState);
  const straightSourceNodes = drawState.sourceNodeIds
    .map((nodeId) => sceneData.nodes[nodeId])
    .filter((node): node is NodeData => Boolean(node));
  const feedbackTarget = strutDrawMode === "straight" && straightSourceNodes[0]
    ? getStraightStrutTarget(straightSourceNodes[0], drawState.fromFace, highlightedLength)
    : null;
  const physicalLength = highlightedLength * (2 / 3);

  return (
    <group>
      {feedbackTarget && (
        <Html
          position={[feedbackTarget.x, feedbackTarget.y + 0.85, feedbackTarget.z]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              padding: "5px 8px",
              border: "1px solid #4ecca3",
              borderRadius: 4,
              background: "rgba(10, 25, 45, 0.9)",
              color: "#d7fff4",
              fontSize: 11,
              fontFamily: "system-ui, sans-serif",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
          >
            {getStructuralDirectionLabel(drawState.fromFace)}
            {axisLock ? " locked" : ""} · {highlightedLength} units · {physicalLength.toFixed(2)} m
            {straightSourceNodes.length > 1 ? ` · ${straightSourceNodes.length} struts` : ""}
          </div>
        </Html>
      )}
      {strutDrawMode === "straight" && straightSourceNodes.flatMap((straightSourceNode) =>
        VALID_STRUT_LENGTHS.map((len) => {
          const highlighted = len === highlightedLength;
          const srcCenter = vec3ToThree(straightSourceNode.position);
          const srcAttach = new THREE.Vector3(
            srcCenter.x + faceNorm[0] * half,
            srcCenter.y + faceNorm[1] * half,
            srcCenter.z + faceNorm[2] * half,
          );
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
            key={`${straightSourceNode.id}-${len}`}
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
                  halfWidth * 2,
                  bodyLen,
                  halfWidth * 2,
                ]}
              />
              <meshBasicMaterial
                color="#4ecca3"
                transparent
                opacity={highlighted ? 0.06 : 0.015}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
            <lineSegments position={mid} quaternion={quat}>
              <edgesGeometry args={[new THREE.BoxGeometry(halfWidth * 2, bodyLen, halfWidth * 2)]} />
              <lineBasicMaterial
                color={highlighted ? "#d7fff4" : "#4ecca3"}
                transparent
                opacity={highlighted ? 1 : 0.28}
                depthWrite={false}
                depthTest={false}
              />
            </lineSegments>
            <mesh position={dstCenter}>
              <boxGeometry args={[nodeSize, nodeSize, nodeSize]} />
              <meshBasicMaterial
                color="#4ecca3"
                transparent
                opacity={highlighted ? 0.05 : 0.012}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
            <lineSegments position={dstCenter}>
              <edgesGeometry args={[new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize)]} />
              <lineBasicMaterial
                color={highlighted ? "#d7fff4" : "#4ecca3"}
                transparent
                opacity={highlighted ? 1 : 0.28}
                depthWrite={false}
                depthTest={false}
              />
            </lineSegments>
            </group>
          );
        }),
      )}
      {strutDrawMode === "corner" && corner45Candidates.map((candidate) => {
        const highlighted = candidate.key === highlightedCornerKey;
        const strut: StrutData = {
          id: `preview-${candidate.key}`,
          kind: "corner",
          nodeA: drawState.fromNodeId,
          faceA: candidate.fromFace,
          nodeB: candidate.nodeId ?? `preview-node-${candidate.key}`,
          faceB: candidate.toFace,
          length: candidate.length,
        };
        const routePoints = getRuleStrutRoutePoints({
          nodeA: sourceNode.position,
          faceA: strut.faceA,
          nodeB: candidate.position,
          faceB: strut.faceB,
          kind: strut.kind,
        }).map(vec3ToThree);
        const flatNormal = vec3ToThree(getRuleCorner45PlaneNormal(strut.faceA, strut.faceB));

        return (
          <group
            key={candidate.key}
            renderOrder={highlighted ? 4 : 1}
            onPointerMove={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHoverCorner(candidate.key);
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHoverCorner(candidate.key);
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
                flatNormal={flatNormal}
                highlighted={highlighted}
                onClick={(event: ThreeEvent<MouseEvent>) => {
                  event.stopPropagation();
                  onPickCorner45(candidate);
                }}
              />
            ))}
            {routePoints.slice(1, -1).map((point, index) => (
              <CornerJointFill
                key={`fill-${index}`}
                position={point}
                halfWidth={halfWidth}
                flatNormal={flatNormal}
                color={highlighted ? "#d7fff4" : "#4ecca3"}
                transparent
                opacity={highlighted ? 0.12 : 0.025}
              />
            ))}
            {routePoints.map((point, index) => (
              <mesh key={`joint-${index}`} position={point}>
                <sphereGeometry args={[halfWidth * 0.9, 8, 8]} />
                <meshBasicMaterial
                  color={highlighted ? "#d7fff4" : "#4ecca3"}
                  transparent
                  opacity={highlighted ? 0.8 : 0.2}
                  depthWrite={false}
                  depthTest={false}
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
  flatNormal,
  highlighted,
  onClick,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  halfWidth: number;
  flatNormal?: THREE.Vector3;
  highlighted: boolean;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const rawLength = direction.length();
  if (rawLength < 0.01) return null;

  const unitDirection = direction.normalize();
  const midPoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quaternion = getSegmentQuaternion(unitDirection, flatNormal);

  return (
    <>
      <mesh position={midPoint} quaternion={quaternion}>
        <boxGeometry args={[halfWidth * 1.95, rawLength, halfWidth * 1.95]} />
        <meshBasicMaterial
          color="#4ecca3"
          transparent
          opacity={highlighted ? 0.06 : 0.015}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <lineSegments position={midPoint} quaternion={quaternion}>
        <edgesGeometry args={[new THREE.BoxGeometry(halfWidth * 1.95, rawLength, halfWidth * 1.95)]} />
        <lineBasicMaterial
          color={highlighted ? "#d7fff4" : "#4ecca3"}
          transparent
          opacity={highlighted ? 1 : 0.28}
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>
      <mesh position={midPoint} quaternion={quaternion} onClick={onClick}>
        <boxGeometry args={[halfWidth * 3.2, Math.max(rawLength, nodeSize), halfWidth * 3.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

function GroundPlane({
  interactive,
  onClick,
  onPointerMove,
}: {
  interactive: boolean;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    const center = getBuildSurfaceCenter(camera.position);
    meshRef.current.position.set(center.x, center.y, center.z);
  });
  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, GROUND_PLANE_Y, 0]}
      onClick={interactive ? onClick : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
    >
      <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
      <meshBasicMaterial
        color="#f7f9fc"
        transparent
        opacity={0.2}
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
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  activeTool: Tool;
  drawFromId: string | null;
  drawFromFace: FaceName | null;
  faceSelectionRequired: boolean;
  onNodeClick: (nodeId: string, face: FaceName | null, event: ThreeEvent<MouseEvent>) => void;
  onNodeContextMenu: (nodeId: string, event: ThreeEvent<MouseEvent>) => void;
}

function NodeMesh({
  node,
  sceneData,
  selected,
  hovered,
  onHoverChange,
  activeTool,
  drawFromId,
  drawFromFace,
  faceSelectionRequired,
  onNodeClick,
  onNodeContextMenu,
}: NodeMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const halfSize = nodeSize / 2;

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
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={() => onHoverChange(false)}
    >
      <mesh castShadow onClick={handleClick} onContextMenu={handleContextMenu}>
        <boxGeometry args={[nodeSize, nodeSize, nodeSize]} />
        <meshStandardMaterial
          color={selected ? "#e94560" : SCENE_COLORS.node}
          flatShading={true}
          transparent
          opacity={0.9}
        />
        <HoverEdges visible={hovered} />
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
          drawable={activeTool === "draw-strut" && faceSelectionRequired}
          widgetable={activeTool === "place-widget" && !isOccupied(name)}
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
  drawable: boolean;
  widgetable: boolean;
  onFaceDrawClick: (e: ThreeEvent<MouseEvent>) => void;
}

function FaceIndicator({
  face,
  normal,
  halfSize,
  occupied,
  highlighted,
  activeTool,
  drawable,
  widgetable,
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
        : activeTool === "place-widget"
          ? 0.8
        : 0.3;

  const size = 0.22;

  return (
    <mesh
      position={pos}
      renderOrder={1}
      onClick={
        drawable || widgetable
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
  selected: boolean;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  onClick: (strutId: string, point: THREE.Vector3, event: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (strutId: string, event: ThreeEvent<MouseEvent>) => void;
  previewColor?: string;
}

function PanelMesh({
  panel,
  sceneData,
  selected,
  hovered,
  onHoverChange,
  onClick,
  onContextMenu,
}: {
  panel: PanelData;
  sceneData: SceneData;
  selected: boolean;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  onClick: (panelId: string, event: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (panelId: string, event: ThreeEvent<MouseEvent>) => void;
}) {
  const geometry = useMemo(
    () => createPanelBufferGeometry(sceneData, panel.strutIds, panel.side ?? "top"),
    [panel.side, panel.strutIds, sceneData],
  );

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      renderOrder={-1}
      onClick={(event) => onClick(panel.id, event)}
      onContextMenu={(event) => onContextMenu(panel.id, event)}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={() => onHoverChange(false)}
    >
      <meshStandardMaterial
        color={selected ? "#e9a040" : SCENE_COLORS.panel}
        side={THREE.DoubleSide}
      />
      <HoverEdges visible={hovered} />
    </mesh>
  );
}

function PanelPreviewMesh({
  sceneData,
  strutIds,
  side,
  color = "#7de2c4",
}: {
  sceneData: SceneData;
  strutIds: string[];
  side: "top" | "bottom";
  color?: string;
}) {
  const geometry = useMemo(
    () => createPanelBufferGeometry(sceneData, strutIds, side),
    [sceneData, side, strutIds],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={2} raycast={() => null}>
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.42}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
      <Edges color="#f4e285" threshold={10} />
    </mesh>
  );
}

function createPanelBufferGeometry(
  sceneData: SceneData,
  strutIds: string[],
  side: "top" | "bottom",
): THREE.BufferGeometry | null {
  const brush = getPanelBrushGeometry(sceneData, strutIds, side);
  if (!brush) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      brush.points.flatMap((point) => [point.x, point.y, point.z]),
      3,
    ),
  );
  geometry.setIndex(brush.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function WidgetMesh({
  widget,
  sceneData,
  selected,
  hovered,
  onHoverChange,
  onClick,
  onContextMenu,
}: {
  widget: WidgetData;
  sceneData: SceneData;
  selected: boolean;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  onClick: (widgetId: string, event: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (widgetId: string, event: ThreeEvent<MouseEvent>) => void;
}) {
  const node = sceneData.nodes[widget.nodeId];
  if (!node) return null;

  const normal = FACE_NORMALS[widget.face];
  const outward = new THREE.Vector3(...normal);
  const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
  const roll = new THREE.Quaternion().setFromAxisAngle(outward, widget.rotation * Math.PI / 2);
  const quaternion = roll.multiply(align);
  const position = getAttachmentWorldPosition(sceneData, widget.nodeId, widget.face);
  const color = selected ? "#e9a040" : SCENE_COLORS.widget;

  return (
    <group
      position={[position.x, position.y, position.z]}
      quaternion={quaternion}
      onClick={(event) => onClick(widget.id, event)}
      onContextMenu={(event) => onContextMenu(widget.id, event)}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={() => onHoverChange(false)}
    >
      {widget.kind === "antenna" && <AntennaWidget color={color} hovered={hovered} />}
      {widget.kind === "rocket-engine" && <RocketEngineWidget color={color} hovered={hovered} />}
      {widget.kind === "thruster" && <ThrusterWidget color={color} hovered={hovered} />}
      {widget.kind === "repulsor-pad" && <RepulsorPadWidget color={color} hovered={hovered} />}
      {widget.kind === "cockpit" && <CockpitWidget color={color} hovered={hovered} />}
      {widget.kind === "wheel" && <WheelWidget color={color} hovered={hovered} />}
    </group>
  );
}

function AntennaWidget({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 1]} />
        <meshStandardMaterial color={color} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <coneGeometry args={[0.18, 0.3, 12]} />
        <meshStandardMaterial color="#d7e7f0" />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function RocketEngineWidget({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, ENGINE_GEOMETRY.bodyLength / 2, 0]} castShadow>
        <cylinderGeometry args={[
          ENGINE_GEOMETRY.bodyRadius,
          ENGINE_GEOMETRY.bodyRadius,
          ENGINE_GEOMETRY.bodyLength,
          ENGINE_GEOMETRY.radialSegments,
        ]} />
        <meshStandardMaterial color={color} metalness={0.32} roughness={0.42} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, ENGINE_GEOMETRY.bodyLength + ENGINE_GEOMETRY.nozzleLength / 2, 0]} castShadow>
        <cylinderGeometry args={[
          ENGINE_GEOMETRY.nozzleRadius,
          ENGINE_GEOMETRY.throatRadius,
          ENGINE_GEOMETRY.nozzleLength,
          ENGINE_GEOMETRY.radialSegments,
          1,
          true,
        ]} />
        <meshStandardMaterial color="#697b88" metalness={0.48} roughness={0.36} side={THREE.DoubleSide} />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function ThrusterWidget({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, THRUSTER_GEOMETRY.bodyLength / 2, 0]} castShadow>
        <cylinderGeometry args={[THRUSTER_GEOMETRY.bodyRadius, THRUSTER_GEOMETRY.bodyRadius, THRUSTER_GEOMETRY.bodyLength, THRUSTER_GEOMETRY.radialSegments]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, THRUSTER_GEOMETRY.bodyLength + THRUSTER_GEOMETRY.nozzleLength / 2, 0]} castShadow>
        <cylinderGeometry args={[THRUSTER_GEOMETRY.nozzleRadius * 0.72, THRUSTER_GEOMETRY.nozzleRadius, THRUSTER_GEOMETRY.nozzleLength, THRUSTER_GEOMETRY.radialSegments]} />
        <meshStandardMaterial color="#697b88" metalness={0.45} roughness={0.34} />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function RepulsorPadWidget({ color, hovered }: { color: string; hovered: boolean }) {
  const center = REPULSOR_GEOMETRY.mountLength + REPULSOR_GEOMETRY.padThickness / 2;
  return (
    <group>
      <mesh position={[0, REPULSOR_GEOMETRY.mountLength / 2, 0]} castShadow>
        <cylinderGeometry args={[REPULSOR_GEOMETRY.mountRadius, REPULSOR_GEOMETRY.mountRadius, REPULSOR_GEOMETRY.mountLength, REPULSOR_GEOMETRY.radialSegments]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.42} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, center, 0]} castShadow>
        <cylinderGeometry args={[REPULSOR_GEOMETRY.padRadius, REPULSOR_GEOMETRY.padRadius, REPULSOR_GEOMETRY.padThickness, REPULSOR_GEOMETRY.radialSegments]} />
        <meshStandardMaterial color="#65d9ff" emissive="#174b66" emissiveIntensity={0.65} />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function CockpitWidget({ color, hovered }: { color: string; hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, COCKPIT_GEOMETRY.length / 2, 0]} castShadow>
        <cylinderGeometry args={[
          COCKPIT_GEOMETRY.noseRadius,
          COCKPIT_GEOMETRY.baseRadius,
          COCKPIT_GEOMETRY.length,
          COCKPIT_GEOMETRY.radialSegments,
        ]} />
        <meshStandardMaterial color={color} metalness={0.08} roughness={0.58} flatShading />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh
        position={[0, COCKPIT_GEOMETRY.viewportCenterY, COCKPIT_GEOMETRY.viewportCenterZ]}
        rotation={[COCKPIT_GEOMETRY.viewportTilt, 0, 0]}
        castShadow
      >
        <boxGeometry args={[
          COCKPIT_GEOMETRY.viewportWidth,
          COCKPIT_GEOMETRY.viewportLength,
          COCKPIT_GEOMETRY.viewportThickness,
        ]} />
        <meshStandardMaterial
          color={SCENE_COLORS.cockpitViewport}
          metalness={0.3}
          roughness={0.18}
        />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh
        position={[0, COCKPIT_GEOMETRY.cameraCenterY, COCKPIT_GEOMETRY.cameraCenterZ]}
        castShadow
      >
        <cylinderGeometry args={[COCKPIT_GEOMETRY.cameraRadius, COCKPIT_GEOMETRY.cameraRadius, COCKPIT_GEOMETRY.cameraLength, 16]} />
        <meshStandardMaterial color="#6ed8ff" emissive="#173d55" emissiveIntensity={0.55} metalness={0.3} roughness={0.2} />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function WheelWidget({ color, hovered }: { color: string; hovered: boolean }) {
  const wheelCenter = WHEEL_GEOMETRY.axleExtension + WHEEL_GEOMETRY.width / 2;
  return (
    <group>
      <mesh position={[0, WHEEL_GEOMETRY.axleExtension / 2, 0]} castShadow>
        <cylinderGeometry args={[
          WHEEL_GEOMETRY.axleRadius,
          WHEEL_GEOMETRY.axleRadius,
          WHEEL_GEOMETRY.axleExtension,
          WHEEL_GEOMETRY.radialSegments,
        ]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.4} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, wheelCenter, 0]} castShadow>
        <cylinderGeometry args={[
          WHEEL_GEOMETRY.radius,
          WHEEL_GEOMETRY.radius,
          WHEEL_GEOMETRY.width,
          WHEEL_GEOMETRY.radialSegments,
        ]} />
        <meshStandardMaterial color="#26343d" roughness={0.82} />
        <HoverEdges visible={hovered} />
      </mesh>
      <mesh position={[0, wheelCenter, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.62, WHEEL_GEOMETRY.width + 0.04, 20]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.38} />
        <HoverEdges visible={hovered} />
      </mesh>
    </group>
  );
}

function StrutMesh({
  strut,
  sceneData,
  selected,
  hovered,
  onHoverChange,
  onClick,
  onContextMenu,
  previewColor,
}: StrutMeshProps) {
  const nodeA = sceneData.nodes[strut.nodeA];
  const nodeB = sceneData.nodes[strut.nodeB];

  const geometry = useMemo(() => {
    if (!nodeA || !nodeB) return null;
    const route = getRuleStrutRoutePoints({
      nodeA: nodeA.position,
      faceA: strut.faceA,
      nodeB: nodeB.position,
      faceB: strut.faceB,
      kind: strut.kind,
    });
    const flatNormal = isCornerStrutKind(strut.kind)
      ? getRuleCorner45PlaneNormal(strut.faceA, strut.faceB)
      : undefined;
    const surface = createStrutSurface(route, strutWidth, flatNormal);
    if (surface.vertices.length === 0) return null;

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        surface.vertices.flatMap((point) => [point.x, point.y, point.z]),
        3,
      ),
    );
    nextGeometry.setIndex(triangulateQuadSurface(surface));
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [nodeA, nodeB, strut.faceA, strut.faceB, strut.kind]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!nodeA || !nodeB || !geometry) return null;

  const color = selected
    ? "#e9a040"
    : isCornerStrutKind(strut.kind)
      ? SCENE_COLORS.planarCornerStrut
      : SCENE_COLORS.straightStrut;

  return (
    <mesh
      geometry={geometry}
      castShadow
      raycast={previewColor ? () => null : undefined}
      onClick={(event) => onClick(strut.id, event.point.clone(), event)}
      onContextMenu={(event) => onContextMenu(strut.id, event)}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHoverChange(true);
      }}
      onPointerOut={() => onHoverChange(false)}
    >
      <meshStandardMaterial
        color={previewColor ?? color}
        flatShading={true}
        transparent={Boolean(previewColor)}
        opacity={previewColor ? 0.55 : 1}
        depthWrite={!previewColor}
      />
      <HoverEdges visible={hovered} />
    </mesh>
  );
}

function CornerJointFill({
  position,
  halfWidth,
  flatNormal,
  color,
  hovered = false,
  transparent = false,
  opacity = 1,
}: {
  position: THREE.Vector3;
  halfWidth: number;
  flatNormal?: THREE.Vector3;
  color: string;
  hovered?: boolean;
  transparent?: boolean;
  opacity?: number;
}) {
  const quaternion = getJointFillQuaternion(flatNormal);

  return (
    <mesh position={position} quaternion={quaternion} renderOrder={-1}>
      <boxGeometry args={[halfWidth * 2, halfWidth * 2, halfWidth * 2]} />
      <meshStandardMaterial
        color={color}
        flatShading={true}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!transparent}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
      <HoverEdges visible={hovered} />
    </mesh>
  );
}

function getSegmentQuaternion(
  direction: THREE.Vector3,
  flatNormal?: THREE.Vector3,
): THREE.Quaternion {
  const yAxis = direction.clone().normalize();
  if (flatNormal && flatNormal.lengthSq() > 0.0001) {
    let zAxis = flatNormal.clone().normalize();

    if (Math.abs(zAxis.dot(yAxis)) > 0.999) {
      zAxis = Math.abs(yAxis.y) > 0.95
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    }

    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
    );
  }

  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    yAxis,
  );
}

function getJointFillQuaternion(flatNormal?: THREE.Vector3): THREE.Quaternion {
  if (!flatNormal || flatNormal.lengthSq() < 0.0001) {
    return new THREE.Quaternion();
  }

  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    flatNormal.clone().normalize(),
  );
}

function HoverEdges({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Edges
      color={HOVER_EDGE_COLOR}
      lineWidth={1.5}
      threshold={10}
      depthTest={false}
      renderOrder={20}
    />
  );
}
