import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { exportSceneObj } from "../core/document";
import type { SceneData } from "../core/types";

export function exportSceneGltf(scene: SceneData): Promise<string> {
  const object = new OBJLoader().parse(exportSceneObj(scene));
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
