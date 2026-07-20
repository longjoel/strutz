import {
  COCKPIT_GEOMETRY,
  CURRENT_SCENE_VERSION,
  DEFAULT_LAYER_ID,
  DEFAULT_PHYSICS_SETTINGS,
  ENGINE_GEOMETRY,
  nodeSize,
  REPULSOR_GEOMETRY,
  strutWidth,
  THRUSTER_GEOMETRY,
  WHEEL_GEOMETRY,
} from "./constants";
import { createNode, getPanelBrushGeometry } from "./scene";
import {
  getAttachmentPosition,
  getCorner45PlaneNormal,
  getStrutRoutePoints,
  isCornerStrutKind,
  scale,
} from "./rules";
import type { FaceName, SceneData, Vec3, WidgetData } from "./types";
import { createBoxSurface, createRadialProfileSurface, createStrutSurface, type QuadSurface } from "./geometry";
import { getCockpitProfile, getCockpitViewportFrame, getWidgetAxes } from "./widgetGeometry";

export function createRootScene(): SceneData {
  const root = createNode({ x: 0, y: 0, z: 0 });
  return {
    schemaVersion: CURRENT_SCENE_VERSION,
    layers: [{ id: DEFAULT_LAYER_ID, name: "Default", visible: true }],
    nodes: { [root.id]: { ...root, layerId: DEFAULT_LAYER_ID } },
    struts: {},
    panels: {},
    widgets: {},
    physics: { ...DEFAULT_PHYSICS_SETTINGS },
  };
}

export function exportSceneJson(scene: SceneData): string {
  return JSON.stringify(scene, null, 2);
}

export function exportSceneObj(scene: SceneData): string {
  const builder = new ObjBuilder();
  builder.comment("Strutz OBJ export");

  const connectedFaces = getConnectedStrutFaces(scene);

  for (const node of Object.values(scene.nodes)) {
    builder.object(`node_${node.id}`);
    builder.addAxisAlignedBox(
      node.position,
      nodeSize,
      nodeSize,
      nodeSize,
      connectedFaces.get(node.id),
    );
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
    const flatNormal = isCornerStrutKind(strut.kind)
      ? getCorner45PlaneNormal(strut.faceA, strut.faceB)
      : undefined;
    builder.addQuadSurface(createStrutSurface(route, strutWidth, flatNormal));
  }

  for (const panel of Object.values(scene.panels ?? {})) {
    const brush = getPanelBrushGeometry(scene, panel.strutIds, panel.side ?? "top");
    if (!brush) continue;
    builder.object(`panel_${panel.id}`);
    builder.addTriangleMesh(brush.points, brush.indices);
  }

  for (const widget of Object.values(scene.widgets ?? {})) {
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;

    builder.object(`widget_${widget.kind}_${widget.id}`);
    addWidgetToObj(builder, widget, node.position);
  }

  return builder.toString();
}

function getConnectedStrutFaces(scene: SceneData): Map<string, Set<FaceName>> {
  const facesByNode = new Map<string, Set<FaceName>>();
  for (const strut of Object.values(scene.struts)) {
    if (!scene.nodes[strut.nodeA] || !scene.nodes[strut.nodeB]) continue;
    addConnectedFace(facesByNode, strut.nodeA, strut.faceA);
    addConnectedFace(facesByNode, strut.nodeB, strut.faceB);
  }
  return facesByNode;
}

function addConnectedFace(
  facesByNode: Map<string, Set<FaceName>>,
  nodeId: string,
  face: FaceName,
): void {
  const faces = facesByNode.get(nodeId) ?? new Set<FaceName>();
  faces.add(face);
  facesByNode.set(nodeId, faces);
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

  addAxisAlignedBox(
    center: Vec3,
    sx: number,
    sy: number,
    sz: number,
    omittedFaces: ReadonlySet<FaceName> = new Set(),
  ) {
    this.addQuadSurface(createBoxSurface(center, sx, sy, sz, omittedFaces));
  }

  addQuadSurface(surface: QuadSurface) {
    const start = this.vertexOffset;
    for (const vertex of surface.vertices) {
      this.lines.push(`v ${formatNumber(vertex.x)} ${formatNumber(vertex.y)} ${formatNumber(vertex.z)}`);
    }
    for (const quad of surface.quads) {
      this.lines.push(`f ${quad.map((index) => start + index).join(" ")}`);
    }
    this.vertexOffset += surface.vertices.length;
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

  private addBoxVertices(vertices: Vec3[], reverseWinding = false) {
    for (const v of vertices) {
      this.lines.push(`v ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(v.z)}`);
    }

    const o = this.vertexOffset;
    const faces = [
      [o, o + 1, o + 2, o + 3],
      [o + 4, o + 7, o + 6, o + 5],
      [o, o + 4, o + 5, o + 1],
      [o + 1, o + 5, o + 6, o + 2],
      [o + 2, o + 6, o + 7, o + 3],
      [o + 3, o + 7, o + 4, o],
    ];
    for (const face of faces) {
      this.lines.push(`f ${(reverseWinding ? [...face].reverse() : face).join(" ")}`);
    }
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
    case "rocket-engine": {
      const bodyEnd = ENGINE_GEOMETRY.bodyLength;
      const surface = createRadialProfileSurface(
        anchor, axes.x, axes.y, axes.z,
        [
          { offset: 0, radius: ENGINE_GEOMETRY.bodyRadius },
          { offset: bodyEnd, radius: ENGINE_GEOMETRY.bodyRadius },
          { offset: bodyEnd, radius: ENGINE_GEOMETRY.throatRadius },
          { offset: bodyEnd + ENGINE_GEOMETRY.nozzleLength, radius: ENGINE_GEOMETRY.nozzleRadius },
        ],
        ENGINE_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(surface.vertices, surface.indices);
      break;
    }
    case "thruster": {
      const bodyEnd = THRUSTER_GEOMETRY.bodyLength;
      const surface = createRadialProfileSurface(
        anchor, axes.x, axes.y, axes.z,
        [
          { offset: 0, radius: THRUSTER_GEOMETRY.bodyRadius },
          { offset: bodyEnd, radius: THRUSTER_GEOMETRY.bodyRadius },
          { offset: bodyEnd, radius: THRUSTER_GEOMETRY.nozzleRadius },
          { offset: bodyEnd + THRUSTER_GEOMETRY.nozzleLength, radius: THRUSTER_GEOMETRY.nozzleRadius * 0.72 },
        ],
        THRUSTER_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(surface.vertices, surface.indices);
      break;
    }
    case "repulsor-pad": {
      const padStart = REPULSOR_GEOMETRY.mountLength;
      const surface = createRadialProfileSurface(
        anchor, axes.x, axes.y, axes.z,
        [
          { offset: 0, radius: REPULSOR_GEOMETRY.mountRadius },
          { offset: padStart, radius: REPULSOR_GEOMETRY.mountRadius },
          { offset: padStart, radius: REPULSOR_GEOMETRY.padRadius },
          { offset: padStart + REPULSOR_GEOMETRY.padThickness, radius: REPULSOR_GEOMETRY.padRadius },
        ],
        REPULSOR_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(surface.vertices, surface.indices);
      break;
    }
    case "cockpit": {
      const body = createRadialProfileSurface(
        anchor,
        axes.x,
        axes.y,
        axes.z,
        getCockpitProfile(),
        COCKPIT_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(body.vertices, body.indices);
      const viewport = getCockpitViewportFrame(anchor, axes);
      builder.object(`widget_cockpit-viewport_${widget.id}`);
      builder.addOrientedBox(
        viewport.center,
        viewport.xAxis,
        viewport.yAxis,
        viewport.zAxis,
        COCKPIT_GEOMETRY.viewportWidth,
        COCKPIT_GEOMETRY.viewportLength,
        COCKPIT_GEOMETRY.viewportThickness,
      );
      builder.object(`widget_cockpit-camera_${widget.id}`);
      const camera = createRadialProfileSurface(
        center(0, COCKPIT_GEOMETRY.cameraCenterY - COCKPIT_GEOMETRY.cameraLength / 2, COCKPIT_GEOMETRY.cameraCenterZ),
        axes.x,
        axes.y,
        axes.z,
        [
          { offset: 0, radius: COCKPIT_GEOMETRY.cameraRadius },
          { offset: COCKPIT_GEOMETRY.cameraLength, radius: COCKPIT_GEOMETRY.cameraRadius },
        ],
        16,
      );
      builder.addTriangleMesh(camera.vertices, camera.indices);
      break;
    }
    case "wheel": {
      const surface = createRadialProfileSurface(
        anchor,
        axes.x,
        axes.y,
        axes.z,
        wheelProfile(),
        WHEEL_GEOMETRY.radialSegments,
      );
      builder.addTriangleMesh(surface.vertices, surface.indices);
      break;
    }
  }
}

function wheelProfile(): Array<{ offset: number; radius: number }> {
  const wheelStart = WHEEL_GEOMETRY.axleExtension;
  const wheelEnd = wheelStart + WHEEL_GEOMETRY.width;
  return [
    { offset: 0, radius: WHEEL_GEOMETRY.axleRadius },
    { offset: wheelStart, radius: WHEEL_GEOMETRY.axleRadius },
    { offset: wheelStart, radius: WHEEL_GEOMETRY.radius },
    { offset: wheelEnd, radius: WHEEL_GEOMETRY.radius },
  ];
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
