import {
  DEFAULT_PHYSICS_SETTINGS,
  PHYSICAL_SCALE,
  strutWidth,
} from "./constants";
import { getPanelPoints } from "./scene";
import { cross, getAttachmentPosition, getStrutRoutePoints, length, scale, sub } from "./rules";
import type { PhysicsSettings, SceneData, Vec3 } from "./types";
import { getWidgetCollisionBoxes } from "./widgetGeometry";

export interface MassProperties {
  totalMassKg: number;
  centerOfMassUnits: Vec3;
  centerOfMassMeters: Vec3;
}

interface MassSample {
  massKg: number;
  center: Vec3;
}

/**
 * Calculates a density-derived mass and center of mass. Nodes are concentrated
 * masses; struts, panels, and widgets use their modeled volumes. Widget volume
 * uses the same conservative compound boxes as collision placement.
 */
export function calculateMassProperties(
  scene: SceneData,
  overrides: Partial<PhysicsSettings> = {},
): MassProperties {
  const settings: PhysicsSettings = {
    ...DEFAULT_PHYSICS_SETTINGS,
    ...scene.physics,
    ...overrides,
  };
  validateSettings(settings);

  const metersPerUnit = PHYSICAL_SCALE.metersPerConstructionUnit;
  const kilogramsPerUnitVolume = settings.materialDensityKgPerM3 * metersPerUnit ** 3;
  const samples: MassSample[] = [];

  for (const node of Object.values(scene.nodes)) {
    const massKg = node.massKg ?? settings.defaultNodeMassKg;
    if (Number.isFinite(massKg) && massKg > 0) samples.push({ massKg, center: node.position });
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
    for (let index = 0; index + 1 < route.length; index += 1) {
      const from = route[index];
      const to = route[index + 1];
      const volume = length(sub(to, from)) * strutWidth ** 2;
      addVolumeSample(samples, volume, midpoint(from, to), kilogramsPerUnitVolume);
    }
  }

  for (const panel of Object.values(scene.panels ?? {})) {
    const points = getPanelPoints(scene, panel.strutIds);
    if (!points) continue;
    const surface = polygonMassProperties(points);
    addVolumeSample(
      samples,
      surface.area * settings.panelThicknessUnits,
      surface.center,
      kilogramsPerUnitVolume,
    );
  }

  for (const widget of Object.values(scene.widgets ?? {})) {
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;
    const anchor = getAttachmentPosition(node.position, widget.face);
    const boxes = getWidgetCollisionBoxes(widget, anchor);
    const volume = boxes.reduce((sum, box) =>
      sum + 8 * box.halfSize.x * box.halfSize.y * box.halfSize.z, 0);
    const center = weightedCenter(boxes.map((box) => ({
      massKg: 8 * box.halfSize.x * box.halfSize.y * box.halfSize.z,
      center: box.center,
    })));
    const massKg = widget.massKg ?? volume * kilogramsPerUnitVolume;
    if (massKg > 0) samples.push({ massKg, center });
  }

  const totalMassKg = samples.reduce((sum, sample) => sum + sample.massKg, 0);
  const centerOfMassUnits = weightedCenter(samples);
  return {
    totalMassKg,
    centerOfMassUnits,
    centerOfMassMeters: scale(centerOfMassUnits, metersPerUnit),
  };
}

function validateSettings(settings: PhysicsSettings): void {
  if (!Number.isFinite(settings.materialDensityKgPerM3) || settings.materialDensityKgPerM3 <= 0) {
    throw new Error("Material density must be greater than zero.");
  }
  if (!Number.isFinite(settings.defaultNodeMassKg) || settings.defaultNodeMassKg < 0) {
    throw new Error("Default node mass cannot be negative.");
  }
  if (!Number.isFinite(settings.panelThicknessUnits) || settings.panelThicknessUnits <= 0) {
    throw new Error("Panel thickness must be greater than zero.");
  }
}

function addVolumeSample(samples: MassSample[], volume: number, center: Vec3, density: number): void {
  if (volume > 0) samples.push({ massKg: volume * density, center });
}

function weightedCenter(samples: MassSample[]): Vec3 {
  const mass = samples.reduce((sum, sample) => sum + sample.massKg, 0);
  if (mass <= 0) return { x: 0, y: 0, z: 0 };
  return samples.reduce((sum, sample) => ({
    x: sum.x + sample.center.x * sample.massKg / mass,
    y: sum.y + sample.center.y * sample.massKg / mass,
    z: sum.z + sample.center.z * sample.massKg / mass,
  }), { x: 0, y: 0, z: 0 });
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function polygonMassProperties(points: Vec3[]): { area: number; center: Vec3 } {
  const origin = points[0];
  const triangles: MassSample[] = [];
  for (let index = 1; index + 1 < points.length; index += 1) {
    const b = points[index];
    const c = points[index + 1];
    const area = length(cross(sub(b, origin), sub(c, origin))) / 2;
    triangles.push({
      massKg: area,
      center: {
        x: (origin.x + b.x + c.x) / 3,
        y: (origin.y + b.y + c.y) / 3,
        z: (origin.z + b.z + c.z) / 3,
      },
    });
  }
  return {
    area: triangles.reduce((sum, triangle) => sum + triangle.massKg, 0),
    center: weightedCenter(triangles),
  };
}
