import { nodeSize, strutWidth } from "./constants";
import { createNode, getPanelBoundaryPoints, getPanelHullStrip } from "./scene";
import {
  cross,
  dot,
  faceNormal,
  getAttachmentPosition,
  getCorner45PlaneNormal,
  getCoplanarPlane,
  getPolygonNormal,
  getStrutRoutePoints,
  insetCoplanarPolygon,
  insetHullPolygon,
  length,
  normalize,
  offsetPlanePoints,
  scale,
  sub,
  triangulatePolygon,
} from "./rules";
import type { FaceName, SceneData, Vec3, WidgetData } from "./types";

export function createRootScene(): SceneData {
  const root = createNode({ x: 0, y: 0, z: 0 });
  return { nodes: { [root.id]: root }, struts: {}, panels: {}, widgets: {} };
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
    const nodeA = scene.nodes[strut.nodeA];
    const nodeB = scene.nodes[strut.nodeB];
    if (!nodeA || !nodeB) continue;

    builder.object(`strut_${strut.id}`);
    const route = getStrutRoutePoints({
      nodeA: nodeA.position,
      faceA: strut.faceA,
      nodeB: nodeB.position,
      faceB: strut.faceB,
      kind: strut.kind,
    });
    const flatNormal = strut.kind === "corner45"
      ? getCorner45PlaneNormal(strut.faceA, strut.faceB)
      : undefined;
    for (let i = 0; i < route.length - 1; i += 1) {
      builder.addSegmentBox(route[i], route[i + 1], strutWidth, flatNormal);
    }

    if (strut.kind === "corner45") {
      for (let i = 1; i < route.length - 1; i += 1) {
        builder.addAxisAlignedBox(route[i], strutWidth, strutWidth, strutWidth);
      }
    }
  }

  for (const panel of Object.values(scene.panels ?? {})) {
    const hullStrip = getPanelHullStrip(scene, panel.strutIds, panel.side ?? "top");
    if (hullStrip) {
      builder.object(`panel_${panel.id}`);
      builder.addTriangleMesh(hullStrip.points, hullStrip.indices);
      continue;
    }

    const points = getPanelBoundaryPoints(scene, panel.strutIds);
    if (!points) continue;
    const plane = getCoplanarPlane(points);

    builder.object(`panel_${panel.id}`);
    const hullNormal = plane ? null : getPolygonNormal(points);
    if (plane || hullNormal) {
      const panelNormal = plane?.normal ?? hullNormal!;
      const panelPoints = offsetPlanePoints(
        plane
          ? insetCoplanarPolygon(points, panelNormal, strutWidth / 2)
          : insetHullPolygon(points, panelNormal, strutWidth / 2),
        panelNormal,
        panel.side === "bottom" ? -strutWidth / 2 : strutWidth / 2,
      );
      if (panelPoints.length < 3) continue;
      const indices = triangulatePolygon(panelPoints, panelNormal);
      if (!indices) continue;
      builder.addTriangleMesh(
        panelPoints,
        panel.side === "bottom" ? reverseTriangleWinding(indices) : indices,
      );
    } else {
      builder.addHullFace(points, panel.side === "bottom");
    }
  }

  for (const widget of Object.values(scene.widgets ?? {})) {
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;

    builder.object(`widget_${widget.kind}_${widget.id}`);
    addWidgetToObj(builder, widget, node.position);
  }

  return builder.toString();
}

function reverseTriangleWinding(indices: number[]): number[] {
  const reversed: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    reversed.push(indices[index], indices[index + 2], indices[index + 1]);
  }
  return reversed;
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

  addSegmentBox(
    from: Vec3,
    to: Vec3,
    width: number,
    flatNormal?: Vec3,
  ) {
    const dir = normalize(sub(to, from));
    if (length(dir) < 0.01) return;

    const reference = getSegmentReference(dir, flatNormal);
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

  addOrientedBox(center: Vec3, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3, sx: number, sy: number, sz: number) {
    const hx = scale(xAxis, sx / 2);
    const hy = scale(yAxis, sy / 2);
    const hz = scale(zAxis, sz / 2);
    const point = (x: number, y: number, z: number) => add(add(add(center, scale(hx, x)), scale(hy, y)), scale(hz, z));
    this.addBoxVertices([
      point(-1, -1, -1), point(1, -1, -1), point(1, 1, -1), point(-1, 1, -1),
      point(-1, -1, 1), point(1, -1, 1), point(1, 1, 1), point(-1, 1, 1),
    ]);
  }

  addPanelFace(vertices: Vec3[]) {
    const start = this.vertexOffset;
    for (const vertex of vertices) {
      this.lines.push(`v ${formatNumber(vertex.x)} ${formatNumber(vertex.y)} ${formatNumber(vertex.z)}`);
    }

    this.lines.push(`f ${vertices.map((_, index) => start + index).join(" ")}`);
    this.vertexOffset += vertices.length;
  }

  addHullFace(boundary: Vec3[], reverse = false) {
    if (boundary.length < 3) return;
    const center = scale(
      boundary.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 }),
      1 / boundary.length,
    );
    const start = this.vertexOffset;
    this.lines.push(`v ${formatNumber(center.x)} ${formatNumber(center.y)} ${formatNumber(center.z)}`);
    for (const point of boundary) {
      this.lines.push(`v ${formatNumber(point.x)} ${formatNumber(point.y)} ${formatNumber(point.z)}`);
    }
    for (let index = 0; index < boundary.length; index += 1) {
      const current = start + 1 + index;
      const next = start + 1 + ((index + 1) % boundary.length);
      this.lines.push(reverse ? `f ${start} ${next} ${current}` : `f ${start} ${current} ${next}`);
    }
    this.vertexOffset += boundary.length + 1;
  }

  addTriangleMesh(vertices: Vec3[], indices: number[]) {
    if (vertices.length < 3 || indices.length < 3) return;
    const start = this.vertexOffset;
    for (const vertex of vertices) {
      this.lines.push(`v ${formatNumber(vertex.x)} ${formatNumber(vertex.y)} ${formatNumber(vertex.z)}`);
    }
    for (let index = 0; index < indices.length; index += 3) {
      this.lines.push(`f ${start + indices[index]} ${start + indices[index + 1]} ${start + indices[index + 2]}`);
    }
    this.vertexOffset += vertices.length;
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

function addWidgetToObj(builder: ObjBuilder, widget: WidgetData, nodePosition: Vec3) {
  const axes = getWidgetAxes(widget.face, widget.rotation);
  const anchor = getAttachmentPosition(nodePosition, widget.face);
  const center = (x: number, y: number, z: number) => add(
    add(add(anchor, scale(axes.x, x)), scale(axes.y, y)),
    scale(axes.z, z),
  );

  switch (widget.kind) {
    case "antenna":
      builder.addOrientedBox(center(0, 0.5, 0), axes.x, axes.y, axes.z, 0.18, 1, 0.18);
      builder.addOrientedBox(center(0, 1.08, 0), axes.x, axes.y, axes.z, 0.3, 0.3, 0.3);
      break;
    case "rocket-engine":
      builder.addOrientedBox(center(0, 0.32, 0), axes.x, axes.y, axes.z, 0.6, 0.64, 0.6);
      builder.addOrientedBox(center(0, 0.82, 0), axes.x, axes.y, axes.z, 0.76, 0.48, 0.76);
      break;
    case "cockpit":
      builder.addOrientedBox(center(0, 0.32, 0), axes.x, axes.y, axes.z, 0.8, 0.64, 0.72);
      builder.addOrientedBox(center(0, 0.67, 0.08), axes.x, axes.y, axes.z, 0.62, 0.34, 0.5);
      break;
  }
}

function getWidgetAxes(face: FaceName, rotation: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const y = faceNormal(face);
  const reference = Math.abs(y.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const baseX = normalize(cross(reference, y));
  const baseZ = normalize(cross(y, baseX));
  const angle = (rotation % 4) * Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: add(scale(baseX, cos), scale(baseZ, sin)),
    y,
    z: add(scale(baseZ, cos), scale(baseX, -sin)),
  };
}

function getSegmentReference(dir: Vec3, flatNormal?: Vec3): Vec3 {
  if (flatNormal && length(flatNormal) > 0.0001 && Math.abs(dot(dir, flatNormal)) < 0.999) {
    return flatNormal;
  }

  return Math.abs(dir.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function sanitizeObjName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
