import type { FaceName, Vec3 } from "./types";
import { add, cross, dot, length, normalize, scale, sub } from "./rules";

export type Quad = [number, number, number, number];

export interface QuadSurface {
  vertices: Vec3[];
  quads: Quad[];
}

export interface TriangleSurface {
  vertices: Vec3[];
  indices: number[];
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

/** Close both endpoint rings for standalone solid/export geometry. */
export function capStrutSurface(surface: QuadSurface): QuadSurface {
  if (surface.vertices.length < 8 || surface.vertices.length % 4 !== 0) return surface;
  const end = surface.vertices.length - 4;
  return {
    vertices: surface.vertices,
    quads: [
      ...surface.quads,
      [0, 1, 2, 3],
      [end + 3, end + 2, end + 1, end],
    ],
  };
}

export function triangulateQuadSurface(surface: QuadSurface): number[] {
  return surface.quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
}

/** Revolve an ordered radius/axis profile into one closed oriented solid. */
export function createRadialProfileSurface(
  origin: Vec3,
  xAxis: Vec3,
  yAxis: Vec3,
  zAxis: Vec3,
  profile: ReadonlyArray<{ offset: number; radius: number }>,
  segments = 24,
): TriangleSurface {
  if (profile.length < 2 || segments < 3 || profile.some((point) => point.radius <= 0)) {
    return { vertices: [], indices: [] };
  }
  const vertices: Vec3[] = [];
  for (const point of profile) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      vertices.push(add(
        add(origin, scale(yAxis, point.offset)),
        add(scale(xAxis, Math.cos(angle) * point.radius), scale(zAxis, Math.sin(angle) * point.radius)),
      ));
    }
  }
  const bottomCenter = vertices.length;
  vertices.push(add(origin, scale(yAxis, profile[0].offset)));
  const topCenter = vertices.length;
  vertices.push(add(origin, scale(yAxis, profile[profile.length - 1].offset)));

  const indices: number[] = [];
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    const from = ring * segments;
    const to = (ring + 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(
        from + segment, to + next, from + next,
        from + segment, to + segment, to + next,
      );
    }
  }
  const top = (profile.length - 1) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(
      bottomCenter, segment, next,
      topCenter, top + next, top + segment,
    );
  }

  // Widget frames can be mirrored depending on attachment face; preserve outward winding.
  if (dot(cross(xAxis, yAxis), zAxis) < 0) {
    for (let index = 0; index < indices.length; index += 3) {
      [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
    }
  }
  return { vertices, indices };
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
