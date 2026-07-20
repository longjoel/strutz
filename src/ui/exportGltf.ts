import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { DoubleSide, FrontSide, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { exportSceneObj } from "../core/document";
import type { SceneData } from "../core/types";
import { SCENE_COLORS } from "./sceneColors";
import { PHYSICAL_SCALE } from "../core/constants";
import { isCornerStrutKind } from "../core/rules";

export function exportSceneGltf(scene: SceneData): Promise<string> {
  const object = new OBJLoader().parse(exportSceneObj(scene));
  applyPhysicalScale(object);
  applySceneMaterials(object, scene);
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          reject(new Error("Expected JSON glTF output."));
          return;
        }
        resolve(JSON.stringify(result, null, 2));
      },
      (error) => reject(error),
      { binary: false, onlyVisible: true, truncateDrawRange: true },
    );
  });
}

/** glTF coordinates are meters; editor coordinates are construction units. */
export function applyPhysicalScale(object: Object3D): void {
  object.scale.setScalar(PHYSICAL_SCALE.metersPerConstructionUnit);
}

/** Restore scene semantics that cannot survive the intermediate geometry-only OBJ. */
export function applySceneMaterials(object: Object3D, scene: SceneData): void {
  const materialByObjectName = new Map<string, MeshStandardMaterial>();

  for (const node of Object.values(scene.nodes)) {
    materialByObjectName.set(`node_${node.id}`, createMaterial(SCENE_COLORS.node));
  }
  for (const strut of Object.values(scene.struts)) {
    materialByObjectName.set(
      `strut_${strut.id}`,
      createMaterial(isCornerStrutKind(strut.kind) ? SCENE_COLORS.planarCornerStrut : SCENE_COLORS.straightStrut),
    );
  }
  for (const panel of Object.values(scene.panels ?? {})) {
    materialByObjectName.set(`panel_${panel.id}`, createMaterial(SCENE_COLORS.panel, true));
  }
  for (const widget of Object.values(scene.widgets ?? {})) {
    materialByObjectName.set(`widget_${widget.kind}_${widget.id}`, createMaterial(SCENE_COLORS.widget));
    if (widget.kind === "cockpit") {
      materialByObjectName.set(
        `widget_cockpit-viewport_${widget.id}`,
        createMaterial(SCENE_COLORS.cockpitViewport),
      );
      materialByObjectName.set(
        `widget_cockpit-camera_${widget.id}`,
        createMaterial(SCENE_COLORS.cockpitCamera),
      );
    }
    if (widget.kind === "repulsor-pad") {
      materialByObjectName.set(
        `widget_repulsor-pad_${widget.id}`,
        createMaterial(SCENE_COLORS.repulsor),
      );
    }
  }

  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const material = materialByObjectName.get(child.name);
    if (material) child.material = material;
  });
}

function createMaterial(color: string, doubleSided = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: 0.72,
    flatShading: true,
    side: doubleSided ? DoubleSide : FrontSide,
  });
}
