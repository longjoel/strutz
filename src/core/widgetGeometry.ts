import { WHEEL_GEOMETRY } from "./constants";
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
    { center: { x: 0, y: 0.32, z: 0 }, size: { x: 0.66, y: 0.64, z: 0.66 } },
    { center: { x: 0, y: 0.82, z: 0 }, size: { x: 0.76, y: 0.48, z: 0.76 } },
  ],
  cockpit: [
    { center: { x: 0, y: 0.32, z: 0 }, size: { x: 0.8, y: 0.64, z: 0.72 } },
    { center: { x: 0, y: 0.67, z: 0.08 }, size: { x: 0.86, y: 0.34, z: 0.86 } },
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
