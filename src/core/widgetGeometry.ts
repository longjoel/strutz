import {
  COCKPIT_GEOMETRY,
  ENGINE_GEOMETRY,
  REPULSOR_GEOMETRY,
  THRUSTER_GEOMETRY,
  WHEEL_GEOMETRY,
} from "./constants";
import { add, cross, dot, faceNormal, length, normalize, scale, sub } from "./rules";
import type { FaceName, Vec3, WidgetData, WidgetKind } from "./types";

export interface WidgetAxes {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export interface OrientedCollisionBox {
  center: Vec3;
  axes: [Vec3, Vec3, Vec3];
  halfSize: Vec3;
}

interface LocalCollisionBox {
  center: Vec3;
  size: Vec3;
}

const COLLISION_BOXES: Record<WidgetKind, LocalCollisionBox[]> = {
  antenna: [
    { center: { x: 0, y: 0.5, z: 0 }, size: { x: 0.18, y: 1, z: 0.18 } },
    { center: { x: 0, y: 1.08, z: 0 }, size: { x: 0.36, y: 0.3, z: 0.36 } },
  ],
  "rocket-engine": [
    {
      center: { x: 0, y: ENGINE_GEOMETRY.bodyLength / 2, z: 0 },
      size: {
        x: ENGINE_GEOMETRY.bodyRadius * 2,
        y: ENGINE_GEOMETRY.bodyLength,
        z: ENGINE_GEOMETRY.bodyRadius * 2,
      },
    },
    {
      center: { x: 0, y: ENGINE_GEOMETRY.bodyLength + ENGINE_GEOMETRY.nozzleLength / 2, z: 0 },
      size: {
        x: ENGINE_GEOMETRY.nozzleRadius * 2,
        y: ENGINE_GEOMETRY.nozzleLength,
        z: ENGINE_GEOMETRY.nozzleRadius * 2,
      },
    },
  ],
  thruster: [
    {
      center: { x: 0, y: (THRUSTER_GEOMETRY.bodyLength + THRUSTER_GEOMETRY.nozzleLength) / 2, z: 0 },
      size: {
        x: THRUSTER_GEOMETRY.nozzleRadius * 2,
        y: THRUSTER_GEOMETRY.bodyLength + THRUSTER_GEOMETRY.nozzleLength,
        z: THRUSTER_GEOMETRY.nozzleRadius * 2,
      },
    },
  ],
  "repulsor-pad": [
    {
      center: { x: 0, y: (REPULSOR_GEOMETRY.mountLength + REPULSOR_GEOMETRY.padThickness) / 2, z: 0 },
      size: {
        x: REPULSOR_GEOMETRY.padRadius * 2,
        y: REPULSOR_GEOMETRY.mountLength + REPULSOR_GEOMETRY.padThickness,
        z: REPULSOR_GEOMETRY.padRadius * 2,
      },
    },
  ],
  cockpit: [
    {
      center: { x: 0, y: COCKPIT_GEOMETRY.length / 2, z: 0 },
      size: {
        x: COCKPIT_GEOMETRY.baseRadius * 2,
        y: COCKPIT_GEOMETRY.length,
        z: COCKPIT_GEOMETRY.baseRadius * 2,
      },
    },
  ],
  wheel: [
    {
      center: { x: 0, y: WHEEL_GEOMETRY.axleExtension / 2, z: 0 },
      size: {
        x: WHEEL_GEOMETRY.axleRadius * 2,
        y: WHEEL_GEOMETRY.axleExtension,
        z: WHEEL_GEOMETRY.axleRadius * 2,
      },
    },
    {
      center: {
        x: 0,
        y: WHEEL_GEOMETRY.axleExtension + WHEEL_GEOMETRY.width / 2,
        z: 0,
      },
      size: {
        x: WHEEL_GEOMETRY.radius * 2,
        y: WHEEL_GEOMETRY.width,
        z: WHEEL_GEOMETRY.radius * 2,
      },
    },
  ],
};

export function getCockpitProfile(): Array<{ offset: number; radius: number }> {
  return [
    { offset: 0, radius: COCKPIT_GEOMETRY.baseRadius },
    { offset: COCKPIT_GEOMETRY.length, radius: COCKPIT_GEOMETRY.noseRadius },
  ];
}

export function getCockpitViewportFrame(anchor: Vec3, axes: WidgetAxes): {
  center: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  zAxis: Vec3;
} {
  const cosine = Math.cos(COCKPIT_GEOMETRY.viewportTilt);
  const sine = Math.sin(COCKPIT_GEOMETRY.viewportTilt);
  return {
    center: add(
      add(anchor, scale(axes.y, COCKPIT_GEOMETRY.viewportCenterY)),
      scale(axes.z, COCKPIT_GEOMETRY.viewportCenterZ),
    ),
    xAxis: axes.x,
    yAxis: add(scale(axes.y, cosine), scale(axes.z, sine)),
    zAxis: add(scale(axes.y, -sine), scale(axes.z, cosine)),
  };
}

/** Direction in which a powered widget applies force to the craft/world. */
export function getWidgetForceVector(
  widget: Pick<WidgetData, "kind" | "face" | "rotation">,
): Vec3 | null {
  const outward = getWidgetAxes(widget.face, widget.rotation).y;
  if (widget.kind === "thruster" || widget.kind === "rocket-engine") {
    const force = scale(outward, -1);
    return { x: force.x || 0, y: force.y || 0, z: force.z || 0 };
  }
  if (widget.kind === "repulsor-pad") return outward;
  return null;
}

/** Match Three.js setFromUnitVectors(+Y, face normal), then apply local roll. */
export function getWidgetAxes(face: FaceName, rotation: number): WidgetAxes {
  const y = faceNormal(face);
  let x: Vec3;
  let z: Vec3;
  switch (face) {
    case "top": x = { x: 1, y: 0, z: 0 }; z = { x: 0, y: 0, z: 1 }; break;
    case "bottom": x = { x: -1, y: 0, z: 0 }; z = { x: 0, y: 0, z: 1 }; break;
    case "front": x = { x: 1, y: 0, z: 0 }; z = { x: 0, y: -1, z: 0 }; break;
    case "back": x = { x: 1, y: 0, z: 0 }; z = { x: 0, y: 1, z: 0 }; break;
    case "right": x = { x: 0, y: -1, z: 0 }; z = { x: 0, y: 0, z: 1 }; break;
    case "left": x = { x: 0, y: 1, z: 0 }; z = { x: 0, y: 0, z: 1 }; break;
  }
  const angle = (rotation % 4) * Math.PI / 2;
  return {
    x: rotateAroundAxis(x, y, angle),
    y,
    z: rotateAroundAxis(z, y, angle),
  };
}

export function getWidgetCollisionBoxes(
  widget: Pick<WidgetData, "kind" | "face" | "rotation">,
  anchor: Vec3,
): OrientedCollisionBox[] {
  const axes = getWidgetAxes(widget.face, widget.rotation);
  return COLLISION_BOXES[widget.kind].map((box) => ({
    center: add(
      add(add(anchor, scale(axes.x, box.center.x)), scale(axes.y, box.center.y)),
      scale(axes.z, box.center.z),
    ),
    axes: [axes.x, axes.y, axes.z],
    halfSize: scale(box.size, 0.5),
  }));
}

export function collisionBoxesOverlap(a: OrientedCollisionBox, b: OrientedCollisionBox): boolean {
  const delta = sub(b.center, a.center);
  const candidates = [
    ...a.axes,
    ...b.axes,
    ...a.axes.flatMap((axisA) => b.axes.map((axisB) => cross(axisA, axisB))),
  ];
  for (const candidate of candidates) {
    if (length(candidate) < 1e-7) continue;
    const axis = normalize(candidate);
    const distance = Math.abs(dot(delta, axis));
    const radiusA = projectedRadius(a, axis);
    const radiusB = projectedRadius(b, axis);
    // Merely touching is allowed; only a positive-volume overlap collides.
    if (distance >= radiusA + radiusB - 1e-6) return false;
  }
  return true;
}

function projectedRadius(box: OrientedCollisionBox, axis: Vec3): number {
  return Math.abs(dot(box.axes[0], axis)) * box.halfSize.x +
    Math.abs(dot(box.axes[1], axis)) * box.halfSize.y +
    Math.abs(dot(box.axes[2], axis)) * box.halfSize.z;
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(scale(vector, cosine), scale(cross(axis, vector), sine)),
    scale(axis, dot(axis, vector) * (1 - cosine)),
  );
}
