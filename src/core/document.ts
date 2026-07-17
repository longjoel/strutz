import { nodeSize, strutWidth } from "./constants";
import { createNode, getAttachmentWorldPosition } from "./scene";
import type { FaceName, SceneData, Vec3 } from "./types";

export function createRootScene(): SceneData {
  const root = createNode({ x: 0, y: 0, z: 0 });
  return { nodes: { [root.id]: root }, struts: {}, accessories: {} };
}

export function exportSceneJson(scene: SceneData): string {
  return JSON.stringify(scene, null, 2);
}

export function exportSceneObj(scene: SceneData): string {
  const builder = new ObjBuilder();
  builder.comment("Strutz OBJ export");

  for (const node of Object.values(scene.nodes)) {
    builder.object(`node_${node.id}`);
    builder.addAxisAlignedBox(node.position, nodeSize, nodeSize, nodeSize);
  }

  for (const strut of Object.values(scene.struts)) {
    builder.object(`strut_${strut.id}`);
    const route = getStrutRoute(scene, strut.nodeA, strut.faceA, strut.nodeB, strut.faceB, strut.kind);
    for (let i = 0; i < route.length - 1; i += 1) {
      builder.addSegmentBox(route[i], route[i + 1], strutWidth);
    }
  }

  return builder.toString();
}

function getStrutRoute(
  scene: SceneData,
  nodeA: string,
  faceA: FaceName,
  nodeB: string,
  faceB: FaceName,
  kind = "straight",
): Vec3[] {
  const from = getAttachmentWorldPosition(scene, nodeA, faceA);
  const to = getAttachmentWorldPosition(scene, nodeB, faceB);
  if (kind !== "corner45") return [from, to];

  const stub = nodeSize / 2;
  return [
    from,
    add(from, scale(faceNormal(faceA), stub)),
    add(to, scale(faceNormal(faceB), stub)),
    to,
  ];
}

class ObjBuilder {
  private lines: string[] = [];
  private vertexOffset = 1;

  comment(text: string) {
    this.lines.push(`# ${text}`);
  }

  object(name: string) {
    this.lines.push(`o ${sanitizeObjName(name)}`);
  }

  addAxisAlignedBox(center: Vec3, sx: number, sy: number, sz: number) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    this.addBoxVertices([
      { x: center.x - hx, y: center.y - hy, z: center.z - hz },
      { x: center.x + hx, y: center.y - hy, z: center.z - hz },
      { x: center.x + hx, y: center.y + hy, z: center.z - hz },
      { x: center.x - hx, y: center.y + hy, z: center.z - hz },
      { x: center.x - hx, y: center.y - hy, z: center.z + hz },
      { x: center.x + hx, y: center.y - hy, z: center.z + hz },
      { x: center.x + hx, y: center.y + hy, z: center.z + hz },
      { x: center.x - hx, y: center.y + hy, z: center.z + hz },
    ]);
  }

  addSegmentBox(from: Vec3, to: Vec3, width: number) {
    const dir = normalize(sub(to, from));
    if (length(dir) < 0.01) return;

    const reference = Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const right = normalize(cross(dir, reference));
    const up = normalize(cross(right, dir));
    const half = width / 2;
    const r = scale(right, half);
    const u = scale(up, half);

    this.addBoxVertices([
      add(add(from, scale(r, -1)), scale(u, -1)),
      add(add(from, r), scale(u, -1)),
      add(add(from, r), u),
      add(add(from, scale(r, -1)), u),
      add(add(to, scale(r, -1)), scale(u, -1)),
      add(add(to, r), scale(u, -1)),
      add(add(to, r), u),
      add(add(to, scale(r, -1)), u),
    ]);
  }

  private addBoxVertices(vertices: Vec3[]) {
    for (const v of vertices) {
      this.lines.push(`v ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(v.z)}`);
    }

    const o = this.vertexOffset;
    this.lines.push(`f ${o} ${o + 1} ${o + 2} ${o + 3}`);
    this.lines.push(`f ${o + 4} ${o + 7} ${o + 6} ${o + 5}`);
    this.lines.push(`f ${o} ${o + 4} ${o + 5} ${o + 1}`);
    this.lines.push(`f ${o + 1} ${o + 5} ${o + 6} ${o + 2}`);
    this.lines.push(`f ${o + 2} ${o + 6} ${o + 7} ${o + 3}`);
    this.lines.push(`f ${o + 3} ${o + 7} ${o + 4} ${o}`);
    this.vertexOffset += vertices.length;
  }

  toString(): string {
    return `${this.lines.join("\n")}\n`;
  }
}

function faceNormal(face: FaceName): Vec3 {
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

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < 0.0001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function sanitizeObjName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
