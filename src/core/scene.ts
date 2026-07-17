import type {
  SceneData,
  NodeData,
  StrutData,
  AccessoryData,
  Vec3,
  FaceName,
  StrutKind,
  Attachments,
} from "./types";
import { nodeSize, oppositeFace, VALID_STRUT_LENGTHS } from "./constants";
export const SNAP_GRID = 1;

export function createNode(position: Vec3): NodeData {
  return {
    id: crypto.randomUUID(),
    position: { ...position },
    attachments: createEmptyAttachments(),
  };
}

function createEmptyAttachments(): Attachments {
  return {
    top: { occupied: false },
    bottom: { occupied: false },
    front: { occupied: false },
    back: { occupied: false },
    left: { occupied: false },
    right: { occupied: false },
  };
}

export function normalizeSceneAttachments(scene: SceneData): SceneData {
  const nodes: Record<string, NodeData> = {};

  for (const [id, node] of Object.entries(scene.nodes)) {
    nodes[id] = {
      ...node,
      attachments: createEmptyAttachments(),
    };
  }

  for (const acc of Object.values(scene.accessories)) {
    const node = nodes[acc.nodeId];
    if (!node) continue;

    node.attachments = {
      ...node.attachments,
      [acc.face]: {
        occupied: true,
        occupantId: acc.id,
        occupantType: "accessory",
      },
    };
  }

  for (const strut of Object.values(scene.struts)) {
    const nodeA = nodes[strut.nodeA];
    const nodeB = nodes[strut.nodeB];

    if (nodeA) {
      nodeA.attachments = {
        ...nodeA.attachments,
        [strut.faceA]: {
          occupied: true,
          occupantId: strut.id,
          occupantType: "strut",
        },
      };
    }

    if (nodeB) {
      nodeB.attachments = {
        ...nodeB.attachments,
        [strut.faceB]: {
          occupied: true,
          occupantId: strut.id,
          occupantType: "strut",
        },
      };
    }
  }

  return {
    ...scene,
    nodes,
  };
}

export function addNodeToScene(scene: SceneData, node: NodeData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    nodes: { ...scene.nodes, [node.id]: node },
  });
}

export function hasNodeContact(scene: SceneData): boolean {
  const nodes = Object.values(scene.nodes);

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = Math.abs(a.position.x - b.position.x);
      const dy = Math.abs(a.position.y - b.position.y);
      const dz = Math.abs(a.position.z - b.position.z);

      if (
        dx < nodeSize + 0.01 &&
        dy < nodeSize + 0.01 &&
        dz < nodeSize + 0.01
      ) {
        return true;
      }
    }
  }

  return false;
}

export function removeNodeFromScene(scene: SceneData, nodeId: string): SceneData {
  const newNodes = { ...scene.nodes };
  delete newNodes[nodeId];

  const newStruts = { ...scene.struts };
  const newAccessories = { ...scene.accessories };

  for (const [id, strut] of Object.entries(newStruts)) {
    if (strut.nodeA === nodeId || strut.nodeB === nodeId) {
      delete newStruts[id];
    }
  }

  for (const [id, acc] of Object.entries(newAccessories)) {
    if (acc.nodeId === nodeId) {
      delete newAccessories[id];
    }
  }

  return normalizeSceneAttachments({
    nodes: newNodes,
    struts: newStruts,
    accessories: newAccessories,
  });
}

export function canConnectStrut(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
  kind: StrutKind = "straight",
): boolean {
  if (kind === "corner45") {
    return canConnectCorner45Strut(scene, nodeA, faceA, nodeB, faceB);
  }

  if (nodeA === nodeB) return false;

  const nA = scene.nodes[nodeA];
  const nB = scene.nodes[nodeB];
  if (!nA || !nB) return false;

  if (oppositeFace(faceA) !== faceB) return false;

  const occA = nA.attachments[faceA]?.occupied;
  const occB = nB.attachments[faceB]?.occupied;
  if (occA || occB) return false;

  const posA = getAttachmentWorldPosition(scene, nodeA, faceA);
  const posB = getAttachmentWorldPosition(scene, nodeB, faceB);

  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dz = posB.z - posA.z;
  const manhattan = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  const euclidean = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (Math.abs(manhattan - euclidean) > 0.01) return false;
  if (!VALID_STRUT_LENGTHS.some((len) => Math.abs(euclidean - len) < 0.01)) return false;

  return true;
}

export function canConnectCorner45Strut(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
): boolean {
  if (nodeA === nodeB) return false;

  const nA = scene.nodes[nodeA];
  const nB = scene.nodes[nodeB];
  if (!nA || !nB) return false;

  const normalA = faceNormalVec(faceA);
  const normalB = faceNormalVec(faceB);
  const dot = normalA.x * normalB.x + normalA.y * normalB.y + normalA.z * normalB.z;
  if (dot !== 0) return false;

  const occA = nA.attachments[faceA]?.occupied;
  const occB = nB.attachments[faceB]?.occupied;
  if (occA || occB) return false;

  const delta = {
    x: nB.position.x - nA.position.x,
    y: nB.position.y - nA.position.y,
    z: nB.position.z - nA.position.z,
  };
  const abs = {
    x: Math.abs(delta.x),
    y: Math.abs(delta.y),
    z: Math.abs(delta.z),
  };
  const movingAxes = (["x", "y", "z"] as const).filter((axis) => abs[axis] > 0.01);
  if (movingAxes.length !== 2) return false;

  const axisA = faceAxis(faceA);
  const axisB = faceAxis(faceB);
  if (axisA === axisB) return false;
  if (!movingAxes.includes(axisA) || !movingAxes.includes(axisB)) return false;

  if (Math.sign(delta[axisA]) !== Math.sign(normalA[axisA])) return false;
  if (Math.sign(delta[axisB]) !== -Math.sign(normalB[axisB])) return false;

  const rawFootprintA = abs[axisA];
  const rawFootprintB = abs[axisB];
  const faceFootprintA = abs[axisA] - nodeSize;
  const faceFootprintB = abs[axisB] - nodeSize;
  const rawValid =
    Math.abs(rawFootprintA - rawFootprintB) < 0.01 &&
    VALID_STRUT_LENGTHS.some((len) => Math.abs(rawFootprintA - len) < 0.01);
  const faceValid =
    Math.abs(faceFootprintA - faceFootprintB) < 0.01 &&
    VALID_STRUT_LENGTHS.some((len) => Math.abs(faceFootprintA - len) < 0.01);
  if (!rawValid && !faceValid) return false;

  return true;
}

export function addStrutToScene(scene: SceneData, strut: StrutData): SceneData {
  return normalizeSceneAttachments({
    ...scene,
    struts: { ...scene.struts, [strut.id]: strut },
  });
}

export function removeStrutFromScene(scene: SceneData, strutId: string): SceneData {
  const strut = scene.struts[strutId];
  if (!strut) return scene;

  const newStruts = { ...scene.struts };
  delete newStruts[strutId];

  return normalizeSceneAttachments({
    ...scene,
    struts: newStruts,
  });
}

export function addAccessoryToScene(scene: SceneData, acc: AccessoryData): SceneData {
  const node = scene.nodes[acc.nodeId];
  if (!node) return scene;

  const existing = node.attachments[acc.face];
  if (existing?.occupied) return scene;

  return normalizeSceneAttachments({
    ...scene,
    accessories: { ...scene.accessories, [acc.id]: acc },
  });
}

export function removeAccessoryFromScene(
  scene: SceneData,
  accesssoryId: string,
): SceneData {
  const acc = scene.accessories[accesssoryId];
  if (!acc) return scene;

  const node = scene.nodes[acc.nodeId];
  if (node) {
    const newAccessories = { ...scene.accessories };
    delete newAccessories[accesssoryId];

    return normalizeSceneAttachments({ ...scene, accessories: newAccessories });
  }

  return scene;
}

export function getAttachmentWorldPosition(
  scene: SceneData,
  nodeId: string,
  face: FaceName,
): Vec3 {
  const node = scene.nodes[nodeId];
  if (!node) return { x: 0, y: 0, z: 0 };

  const n = faceNormalVec(face);
  const half = nodeSize / 2;

  return {
    x: node.position.x + n.x * half,
    y: node.position.y + n.y * half,
    z: node.position.z + n.z * half,
  };
}

function faceNormalVec(face: FaceName): Vec3 {
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
  }
}

function faceAxis(face: FaceName): keyof Vec3 {
  switch (face) {
    case "left":
    case "right":
      return "x";
    case "top":
    case "bottom":
      return "y";
    case "front":
    case "back":
      return "z";
  }
}

export function nodeFaceToWorldNormal(face: string): Vec3 {
  return faceNormalVec(face as FaceName);
}
