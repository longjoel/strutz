import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createNode } from "../core/scene";
import { getStraightStrutTarget } from "../core/placement";
import {
  getFaceForAxisLock,
  getNearestStructuralDrawCandidate,
  getStructuralDirectionLabel,
  getStructuralDrawShortcut,
} from "./structuralDraw";

describe("structural strut pointer inference", () => {
  it("infers axis, direction, and length from a projected mouse position", () => {
    const source = createNode({ x: 0, y: 0, z: 0 });
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(10, 8, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const target = getStraightStrutTarget(source, "top", 7);
    const pointer = new THREE.Vector3(target.x, target.y, target.z).project(camera);

    expect(getNearestStructuralDrawCandidate(
      source,
      camera,
      new THREE.Vector2(pointer.x, pointer.y),
    )).toEqual({ face: "top", length: 7 });
  });

  it("only considers faces available to the whole operation", () => {
    const source = createNode({ x: 0, y: 0, z: 0 });
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const pointer = new THREE.Vector2(0.4, 0);
    expect(getNearestStructuralDrawCandidate(source, camera, pointer, ["left", "right"])?.face).toBe("right");
    expect(getNearestStructuralDrawCandidate(source, camera, pointer, [])).toBeNull();
  });

  it("resolves active-draw axis and catalog-length shortcuts", () => {
    expect(getStructuralDrawShortcut("x")).toEqual({ kind: "axis", axis: "x" });
    expect(getStructuralDrawShortcut("Z")).toEqual({ kind: "axis", axis: "z" });
    expect(getStructuralDrawShortcut("3")).toEqual({ kind: "length", length: 3 });
    expect(getStructuralDrawShortcut("2")).toBeNull();
  });

  it("keeps the current direction when locking its axis and falls back to a free direction", () => {
    expect(getFaceForAxisLock("x", "left", ["left", "right"])).toBe("left");
    expect(getFaceForAxisLock("y", "left", ["bottom"])).toBe("bottom");
    expect(getFaceForAxisLock("z", "front", [])).toBeNull();
    expect(getStructuralDirectionLabel("back")).toBe("Z−");
  });
});
