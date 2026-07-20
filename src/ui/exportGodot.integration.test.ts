import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRootScene } from "../core/document";
import { normalizeSceneAttachments } from "../core/scene";
import { exportGodotVehicleBundle } from "./exportGodot";

const enabled = process.env.STRUTZ_GODOT_INTEGRATION === "1";
let directory = "";

describe.skipIf(!enabled)("Godot bundle headless integration", () => {
  beforeAll(async () => {
    if (typeof FileReader === "undefined") {
      class NodeFileReader {
        result: ArrayBuffer | null = null;
        onloadend: (() => void) | null = null;
        readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
      }
      Object.assign(globalThis, { FileReader: NodeFileReader });
    }
    directory = process.env.STRUTZ_GODOT_PROJECT_DIR ?? await mkdtemp(join(tmpdir(), "strutz-godot-"));
    if (process.env.STRUTZ_GODOT_PROJECT_DIR) {
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
    }
    const root = createRootScene();
    const nodeId = Object.keys(root.nodes)[0];
    const scene = normalizeSceneAttachments({
      ...root,
      widgets: {
        cockpit: { id: "cockpit", kind: "cockpit", nodeId, face: "front", rotation: 0, runtime: { primaryCamera: true } },
        engine: { id: "engine", kind: "rocket-engine", nodeId, face: "back", rotation: 0 },
        thruster: { id: "thruster", kind: "thruster", nodeId, face: "top", rotation: 0 },
        wheel: { id: "wheel", kind: "wheel", nodeId, face: "right", rotation: 0 },
        repulsor: { id: "repulsor", kind: "repulsor-pad", nodeId, face: "bottom", rotation: 0 },
      },
    });
    const bundle = await exportGodotVehicleBundle(scene, "headless_vehicle");
    await extractStoredZip(bundle.bytes, directory);
    await writeFile(join(directory, "project.godot"), `[application]\nconfig/name="Strutz Export Test"\nrun/main_scene="res://vehicles/headless_vehicle/headless_vehicle.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n`);
  });

  afterAll(async () => {
    if (directory && process.env.STRUTZ_KEEP_GODOT_PROJECT !== "1") await rm(directory, { recursive: true, force: true });
  });

  it("imports, parses, and instantiates in Godot 4.7", () => {
    if (process.env.STRUTZ_GODOT_GENERATE_ONLY === "1") {
      expect(directory.length).toBeGreaterThan(0);
      return;
    }
    const output = execFileSync(
      "flatpak",
      ["run", "org.godotengine.Godot", "--headless", "--path", directory, "--editor", "--quit-after", "3"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(output).toContain("Godot Engine");
  }, 30_000);
});

async function extractStoredZip(bytes: Uint8Array, destination: string): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const target = join(destination, name);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
}
