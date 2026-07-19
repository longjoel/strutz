import type { FaceName, Vec3 } from "./types";
import { add, cross, dot, length, normalize, scale, sub } from "./rules";

export type Quad = [number, number, number, number];

export interface QuadSurface {
  vertices: Vec3[];
  quads: Quad[];
}

const BOX_FACES: Array<{ face: FaceName; quad: Quad }> = [
  { face: "back", quad: [3, 2, 1, 0] },
  { face: "front", quad: [5, 6, 7, 4] },
  { face: "bottom", quad: [1, 5, 4, 0] },
  { face: "right", quad: [2, 6, 5, 1] },
  { face: "top", quad: [3, 7, 6, 2] },
  { face: "left", quad: [0, 4, 7, 3] },
];

export function createBoxSurface(
  center: Vec3,
  sx: number,
  sy: number,
  sz: number,
  omittedFaces: ReadonlySet<FaceName> = new Set(),
): QuadSurface {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  return {
    vertices: [
      { x: center.x - hx, y: center.y - hy, z: center.z - hz },
      { x: center.x + hx, y: center.y - hy, z: center.z - hz },
      { x: center.x + hx, y: center.y + hy, z: center.z - hz },
      { x: center.x - hx, y: center.y + hy, z: center.z - hz },
      { x: center.x - hx, y: center.y - hy, z: center.z + hz },
      { x: center.x + hx, y: center.y - hy, z: center.z + hz },
      { x: center.x + hx, y: center.y + hy, z: center.z + hz },
      { x: center.x - hx, y: center.y + hy, z: center.z + hz },
    ],
    quads: BOX_FACES
      .filter(({ face }) => !omittedFaces.has(face))
      .map(({ quad }) => quad),
  };
}

/**
 * Builds one continuous rectangular tube around a route. Interior route points
 * share mitered vertex rings, so bends do not contain intersecting boxes or caps.
 * Endpoint caps are intentionally omitted because struts terminate on node faces.
 */
export function createStrutSurface(
  route: Vec3[],
  width: number,
  flatNormal?: Vec3,
): QuadSurface {
  if (route.length < 2) return { vertices: [], quads: [] };

  const directions = route.slice(0, -1).map((point, index) =>
    normalize(sub(route[index + 1], point))
  );
  if (directions.some((direction) => length(direction) < 0.0001)) {
    return { vertices: [], quads: [] };
  }

  const normal = getSweepNormal(directions[0], flatNormal);
  const rights = directions.map((direction) => normalize(cross(direction, normal)));
  const half = width / 2;
  const vertices: Vec3[] = [];

  for (let index = 0; index < route.length; index += 1) {
    const right = getRingRight(index, rights, half);
    const point = route[index];
    const across = right.vector;
    const up = scale(normal, half);
    vertices.push(
      add(add(point, scale(across, -right.scale)), scale(up, -1)),
      add(add(point, scale(across, right.scale)), scale(up, -1)),
      add(add(point, scale(across, right.scale)), up),
      add(add(point, scale(across, -right.scale)), up),
    );
  }

  const quads: Quad[] = [];
  for (let ring = 0; ring < route.length - 1; ring += 1) {
    const from = ring * 4;
    const to = (ring + 1) * 4;
    quads.push(
      [from, to, to + 1, from + 1],
      [from + 1, to + 1, to + 2, from + 2],
      [from + 2, to + 2, to + 3, from + 3],
      [from + 3, to + 3, to, from],
    );
  }

  return { vertices, quads };
}

export function triangulateQuadSurface(surface: QuadSurface): number[] {
  return surface.quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
}

function getSweepNormal(direction: Vec3, flatNormal?: Vec3): Vec3 {
  if (flatNormal && length(flatNormal) > 0.0001 && Math.abs(dot(direction, flatNormal)) < 0.999) {
    return normalize(flatNormal);
  }
  const reference = Math.abs(direction.y) > 0.95
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(direction, reference));
  return normalize(cross(right, direction));
}

function getRingRight(
  index: number,
  rights: Vec3[],
  halfWidth: number,
): { vector: Vec3; scale: number } {
  if (index === 0) return { vector: rights[0], scale: halfWidth };
  if (index === rights.length) return { vector: rights[rights.length - 1], scale: halfWidth };

  const previous = rights[index - 1];
  const next = rights[index];
  const miter = normalize(add(previous, next));
  if (length(miter) < 0.0001) return { vector: next, scale: halfWidth };

  const projection = dot(miter, previous);
  if (Math.abs(projection) < 0.0001) return { vector: next, scale: halfWidth };
  return { vector: miter, scale: halfWidth / projection };
}
