import { beforeAll, describe, expect, it } from "vitest";
import { createRootScene } from "../core/document";
import { normalizeSceneAttachments } from "../core/scene";
import { exportGodotVehicleBundle } from "./exportGodot";

beforeAll(() => {
  if (typeof FileReader !== "undefined") return;
  class TestFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: ((event: ProgressEvent<FileReader>) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.({ target: this } as unknown as ProgressEvent<FileReader>);
      });
    }
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
        this.onloadend?.({ target: this } as unknown as ProgressEvent<FileReader>);
      });
    }
  }
  Object.assign(globalThis, { FileReader: TestFileReader });
});

describe("Godot vehicle bundle export", () => {
  it("packs a COM-centered RigidBody scene, runtime scripts, components, and camera", async () => {
    const root = createRootScene();
    const nodeId = Object.keys(root.nodes)[0];
    const scene = normalizeSceneAttachments({
      ...root,
      nodes: { [nodeId]: { ...root.nodes[nodeId], massKg: 20 } },
      widgets: {
        cockpit: { id: "cockpit", kind: "cockpit", nodeId, face: "front", rotation: 0, runtime: { primaryCamera: true } },
        engine: { id: "engine", kind: "rocket-engine", nodeId, face: "back", rotation: 0 },
        wheel: { id: "wheel", kind: "wheel", nodeId, face: "right", rotation: 0 },
        repulsor: { id: "repulsor", kind: "repulsor-pad", nodeId, face: "bottom", rotation: 0 },
      },
    });

    const bundle = await exportGodotVehicleBundle(scene, "Test Vehicle.json");
    const storedText = new TextDecoder().decode(bundle.bytes);

    expect(bundle.fileName).toBe("test_vehicle-godot.zip");
    expect(bundle.bytes[0]).toBe(0x50);
    expect(bundle.bytes[1]).toBe(0x4b);
    expect(bundle.manifest.scenePath).toBe("res://vehicles/test_vehicle/test_vehicle.tscn");
    expect(bundle.manifest.primaryCockpitId).toBe("cockpit");
    expect(bundle.manifest.capabilities).toMatchObject({ main_propulsion: true, wheels: true, repulsors: true, camera: true });
    expect(storedText).toContain("RigidBody3D");
    expect(storedText).toContain("vehicle_controller.gd");
    expect(storedText).toContain("strutz_force_emitter");
    expect(storedText).toContain("strutz_wheel");
    expect(storedText).toContain("strutz_repulsor");
    expect(storedText).toContain("Camera3D");
    expect(storedText).toContain("apply_command");
  });

  it("warns when exporting an inert body without a cockpit", async () => {
    const bundle = await exportGodotVehicleBundle(createRootScene(), "crate");
    expect(bundle.warnings).toHaveLength(2);
    expect(bundle.manifest.capabilities.camera).toBe(false);
  });

  it("rejects invalid runtime tuning", async () => {
    const scene = { ...createRootScene(), runtime: { repulsorRangeMeters: 0 } };
    await expect(exportGodotVehicleBundle(scene, "bad")).rejects.toThrow("repulsorRangeMeters");
  });
});
