import { nodeSize, strutWidth, WHEEL_GEOMETRY } from "./constants";
import { createBoxSurface, createRadialProfileSurface, createStrutSurface, triangulateQuadSurface } from "./geometry";
import { getPanelBrushGeometry } from "./scene";
import {
  cross,
  getAttachmentPosition,
  getCorner45PlaneNormal,
  getStrutRoutePoints,
  isCornerStrutKind,
  length,
  normalize,
  scale,
  sub,
} from "./rules";
import type { FaceName, SceneData, Vec3, WidgetData } from "./types";
import { getWidgetAxes } from "./widgetGeometry";

/** Export one weldable structural skin in millimeters for slicers. */
export function exportSceneStl(scene: SceneData, millimetersPerUnit = 2): string {
  if (!Number.isFinite(millimetersPerUnit) || millimetersPerUnit <= 0) {
    throw new Error("Print scale must be greater than zero.");
  }
  const builder = new StlBuilder(millimetersPerUnit);

  // Connection faces and caps are both omitted so their identical boundary
  // loops weld into one two-manifold skin in the single STL mesh.
  const connectedFaces = getConnectedStrutFaces(scene);
  for (const node of Object.values(scene.nodes)) {
    builder.addQuadSurface(createBoxSurface(
      node.position,
      nodeSize,
      nodeSize,
      nodeSize,
      connectedFaces.get(node.id),
    ));
  }
  for (const strut of Object.values(scene.struts)) {
    const nodeA = scene.nodes[strut.nodeA];
    const nodeB = scene.nodes[strut.nodeB];
    if (!nodeA || !nodeB) continue;
    const route = getStrutRoutePoints({
      nodeA: nodeA.position,
      faceA: strut.faceA,
      nodeB: nodeB.position,
      faceB: strut.faceB,
      kind: strut.kind,
    });
    const flatNormal = isCornerStrutKind(strut.kind)
      ? getCorner45PlaneNormal(strut.faceA, strut.faceB)
      : undefined;
    builder.addQuadSurface(createStrutSurface(route, strutWidth, flatNormal));
  }
  for (const panel of Object.values(scene.panels ?? {})) {
    const brush = getPanelBrushGeometry(scene, panel.strutIds, panel.side ?? "top");
    if (brush) builder.addTriangleMesh(brush.points, brush.indices);
  }
  for (const widget of Object.values(scene.widgets ?? {})) {
    const node = scene.nodes[widget.nodeId];
    if (node) addWidget(builder, widget, node.position);
  }

  return builder.toString();
}

function getConnectedStrutFaces(scene: SceneData): Map<string, Set<FaceName>> {
  const result = new Map<string, Set<FaceName>>();
  for (const strut of Object.values(scene.struts)) {
    if (!scene.nodes[strut.nodeA] || !scene.nodes[strut.nodeB]) continue;
    for (const [nodeId, face] of [[strut.nodeA, strut.faceA], [strut.nodeB, strut.faceB]] as const) {
      const faces = result.get(nodeId) ?? new Set<FaceName>();
      faces.add(face);
      result.set(nodeId, faces);
    }
  }
  return result;
}

export function getScenePrintSize(scene: SceneData, millimetersPerUnit = 2): Vec3 {
  const positions = Object.values(scene.nodes).map((node) => node.position);
  if (positions.length === 0) return { x: 0, y: 0, z: 0 };
  const min = { ...positions[0] };
  const max = { ...positions[0] };
  for (const point of positions.slice(1)) {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  }
  return {
    x: (max.x - min.x + nodeSize) * millimetersPerUnit,
    y: (max.y - min.y + nodeSize) * millimetersPerUnit,
    z: (max.z - min.z + nodeSize) * millimetersPerUnit,
  };
}

class StlBuilder {
  private facets: string[] = [];

  constructor(private readonly scaleFactor: number) {}

  addQuadSurface(surface: ReturnType<typeof createBoxSurface>) {
    this.addTriangleMesh(surface.vertices, triangulateQuadSurface(surface));
  }

  addTriangleMesh(points: Vec3[], indices: number[]) {
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const a = points[indices[index]];
      const b = points[indices[index + 1]];
      const c = points[indices[index + 2]];
      if (!a || !b || !c) continue;
      const rawNormal = cross(sub(b, a), sub(c, a));
      if (length(rawNormal) < 1e-8) continue;
      const normal = normalize(rawNormal);
      this.facets.push(
        `  facet normal ${number(normal.x)} ${number(normal.y)} ${number(normal.z)}\n` +
        "    outer loop\n" +
        `      vertex ${vertex(a, this.scaleFactor)}\n` +
        `      vertex ${vertex(b, this.scaleFactor)}\n` +
        `      vertex ${vertex(c, this.scaleFactor)}\n` +
        "    endloop\n" +
        "  endfacet",
      );
    }
  }

  addOrientedBox(center: Vec3, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3, sx: number, sy: number, sz: number) {
    const hx = scale(xAxis, sx / 2);
    const hy = scale(yAxis, sy / 2);
    const hz = scale(zAxis, sz / 2);
    const point = (x: number, y: number, z: number) => add(add(add(center, scale(hx, x)), scale(hy, y)), scale(hz, z));
    const vertices = [
      point(-1, -1, -1), point(1, -1, -1), point(1, 1, -1), point(-1, 1, -1),
      point(-1, -1, 1), point(1, -1, 1), point(1, 1, 1), point(-1, 1, 1),
    ];
    this.addTriangleMesh(vertices, triangulateQuadSurface({
      vertices,
      quads: [
        [3, 2, 1, 0], [5, 6, 7, 4], [1, 5, 4, 0],
        [2, 6, 5, 1], [3, 7, 6, 2], [0, 4, 7, 3],
      ],
    }));
  }

  toString(): string {
    return `solid strutz\n${this.facets.join("\n")}\nendsolid strutz\n`;
  }
}

function addWidget(builder: StlBuilder, widget: WidgetData, nodePosition: Vec3) {
  const axes = getWidgetAxes(widget.face, widget.rotation);
  const anchor = getAttachmentPosition(nodePosition, widget.face);
  const center = (x: number, y: number, z: number) => add(add(add(anchor, scale(axes.x, x)), scale(axes.y, y)), scale(axes.z, z));
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
    case "wheel": {
      const wheelStart = WHEEL_GEOMETRY.axleExtension;
      const surface = createRadialProfileSurface(
        anchor,
        axes.x,
        axes.y,
        axes.z,
        [
          { offset: 0, radius: WHEEL_GEOMETRY.axleRadius },
          { offset: wheelStart, radius: WHEEL_GEOMETRY.axleRadius },
          { offset: wheelStart, radius: WHEEL_GEOMETRY.radius },
          { offset: wheelStart + WHEEL_GEOMETRY.width, radius: WHEEL_GEOMETRY.radius },
        ],
        WHEEL_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(surface.vertices, surface.indices);
      break;
    }
  }
}

function vertex(point: Vec3, factor: number): string {
  return `${number(point.x * factor)} ${number(point.y * factor)} ${number(point.z * factor)}`;
}

function number(value: number): string {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
