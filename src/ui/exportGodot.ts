import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { Group, Matrix4, Mesh, type Object3D } from "three";
import {
  COCKPIT_GEOMETRY,
  DEFAULT_VEHICLE_RUNTIME_SETTINGS,
  PHYSICAL_SCALE,
  WHEEL_GEOMETRY,
} from "../core/constants";
import { exportSceneObj } from "../core/document";
import { calculateMassProperties } from "../core/physics";
import {
  cross,
  getAttachmentPosition,
  getStrutRoutePoints,
  normalize,
  scale,
  sub,
} from "../core/rules";
import { getPanelBrushGeometry } from "../core/scene";
import type { SceneData, Vec3, VehicleRuntimeSettings, WidgetData } from "../core/types";
import { getWidgetAxes, getWidgetCollisionBoxes, getWidgetForceVector } from "../core/widgetGeometry";
import { createZip } from "../core/zip";
import {
  FORCE_EMITTER_GD,
  RAYCAST_WHEEL_GD,
  REPULSOR_PAD_GD,
  VEHICLE_CONTROLLER_GD,
} from "../core/godotRuntime";
import { applySceneMaterials } from "./exportGltf";

export interface GodotBundleResult {
  bytes: Uint8Array;
  fileName: string;
  manifest: GodotVehicleManifest;
  warnings: string[];
}

export interface GodotVehicleManifest {
  format: "strutz-godot-vehicle";
  formatVersion: 1;
  godotVersion: "4.7";
  name: string;
  scenePath: string;
  massKg: number;
  sourceCenterOfMassUnits: Vec3;
  capabilities: Record<string, number | boolean>;
  primaryCockpitId: string | null;
  componentIds: Record<string, string[]>;
}

interface ExportFrame {
  center: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  primaryCockpit: WidgetData | null;
}

interface CollisionHull {
  name: string;
  points: Vec3[];
}

export async function exportGodotVehicleBundle(scene: SceneData, requestedName: string): Promise<GodotBundleResult> {
  if (Object.keys(scene.nodes).length === 0) throw new Error("A Godot vehicle requires at least one node.");
  const slug = slugify(requestedName);
  const runtime: VehicleRuntimeSettings = { ...DEFAULT_VEHICLE_RUNTIME_SETTINGS, ...scene.runtime };
  validateRuntime(runtime);
  const mass = calculateMassProperties(scene);
  if (mass.totalMassKg <= 0) throw new Error("A Godot vehicle must have positive mass.");
  const frame = getExportFrame(scene, mass.centerOfMassUnits);
  const warnings = getWarnings(scene, frame);
  const componentIds = {
    engines: ids(scene, "rocket-engine"),
    thrusters: ids(scene, "thruster"),
    wheels: ids(scene, "wheel"),
    repulsors: ids(scene, "repulsor-pad"),
    cockpits: ids(scene, "cockpit"),
  };
  const capabilities = {
    main_propulsion: componentIds.engines.length > 0,
    maneuvering: componentIds.thrusters.length > 0,
    wheels: componentIds.wheels.length > 0,
    repulsors: componentIds.repulsors.length > 0,
    camera: componentIds.cockpits.length > 0,
    engine_count: componentIds.engines.length,
    thruster_count: componentIds.thrusters.length,
    wheel_count: componentIds.wheels.length,
    repulsor_count: componentIds.repulsors.length,
  };
  const base = `vehicles/${slug}`;
  const manifest: GodotVehicleManifest = {
    format: "strutz-godot-vehicle",
    formatVersion: 1,
    godotVersion: "4.7",
    name: slug,
    scenePath: `res://${base}/${slug}.tscn`,
    massKg: mass.totalMassKg,
    sourceCenterOfMassUnits: mass.centerOfMassUnits,
    capabilities,
    primaryCockpitId: frame.primaryCockpit?.id ?? null,
    componentIds,
  };
  const glb = await exportVehicleGlb(scene, frame);
  const tscn = createPackedScene(scene, slug, base, frame, mass.totalMassKg, runtime);
  const config = createConfigResource(manifest, runtime);
  const readme = createReadme(slug, manifest, warnings);
  const bytes = createZip([
    { name: `${base}/${slug}.tscn`, data: tscn },
    { name: `${base}/${slug}.glb`, data: glb },
    { name: `${base}/${slug}_config.tres`, data: config },
    { name: `${base}/${slug}_manifest.json`, data: JSON.stringify(manifest, null, 2) },
    { name: `${base}/scripts/vehicle_controller.gd`, data: VEHICLE_CONTROLLER_GD },
    { name: `${base}/scripts/force_emitter.gd`, data: FORCE_EMITTER_GD },
    { name: `${base}/scripts/raycast_wheel.gd`, data: RAYCAST_WHEEL_GD },
    { name: `${base}/scripts/repulsor_pad.gd`, data: REPULSOR_PAD_GD },
    { name: `${base}/README.md`, data: readme },
  ]);
  return { bytes, fileName: `${slug}-godot.zip`, manifest, warnings };
}

function getExportFrame(scene: SceneData, center: Vec3): ExportFrame {
  const cockpits = Object.values(scene.widgets ?? {})
    .filter((widget) => widget.kind === "cockpit")
    .sort((a, b) => Number(Boolean(b.runtime?.primaryCamera)) - Number(Boolean(a.runtime?.primaryCamera)) || a.id.localeCompare(b.id));
  const primaryCockpit = cockpits[0] ?? null;
  if (!primaryCockpit) {
    return {
      center,
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
      primaryCockpit: null,
    };
  }
  const axes = getWidgetAxes(primaryCockpit.face, primaryCockpit.rotation);
  return { center, right: axes.x, up: axes.z, forward: axes.y, primaryCockpit };
}

function toVehiclePoint(frame: ExportFrame, point: Vec3): Vec3 {
  const delta = sub(point, frame.center);
  const meters = PHYSICAL_SCALE.metersPerConstructionUnit;
  return {
    x: dot(delta, frame.right) * meters,
    y: dot(delta, frame.up) * meters,
    z: -dot(delta, frame.forward) * meters,
  };
}

function toVehicleVector(frame: ExportFrame, vector: Vec3): Vec3 {
  return {
    x: dot(vector, frame.right),
    y: dot(vector, frame.up),
    z: -dot(vector, frame.forward),
  };
}

async function exportVehicleGlb(scene: SceneData, frame: ExportFrame): Promise<Uint8Array> {
  const object = new OBJLoader().parse(exportSceneObj(scene));
  applySceneMaterials(object, scene);
  const matrix = frameMatrix(frame);
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry = child.geometry.clone();
    child.geometry.applyMatrix4(matrix);
    const widget = Object.values(scene.widgets ?? {}).find((candidate) => child.name.endsWith(`_${candidate.id}`));
    if (widget) {
      const node = scene.nodes[widget.nodeId];
      if (node) {
        const pivot = toVehiclePoint(frame, getAttachmentPosition(node.position, widget.face));
        child.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
        child.position.set(pivot.x, pivot.y, pivot.z);
      }
    }
  });
  const visual = groupByLayer(object, scene);
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => exporter.parse(
    visual,
    (result) => result instanceof ArrayBuffer
      ? resolve(new Uint8Array(result))
      : reject(new Error("Expected binary GLB output.")),
    reject,
    { binary: true, onlyVisible: false, truncateDrawRange: true },
  ));
}

function groupByLayer(object: Object3D, scene: SceneData): Group {
  const root = new Group();
  root.name = "StrutzVisual";
  const layerGroups = new Map<string, Group>();
  for (const layer of scene.layers ?? []) {
    const group = new Group();
    group.name = `layer_${layer.id}`;
    group.visible = layer.visible;
    layerGroups.set(layer.id, group);
    root.add(group);
  }
  const fallback = new Group();
  fallback.name = "layer_default";
  if (!layerGroups.has("default")) root.add(fallback);
  const children = [...object.children];
  for (const child of children) {
    const layerId = layerForObjectName(child.name, scene);
    (layerGroups.get(layerId ?? "") ?? layerGroups.get("default") ?? fallback).add(child);
  }
  return root;
}

function layerForObjectName(name: string, scene: SceneData): string | undefined {
  for (const item of [...Object.values(scene.nodes), ...Object.values(scene.struts), ...Object.values(scene.panels ?? {}), ...Object.values(scene.widgets ?? {})]) {
    if (name.endsWith(`_${item.id}`)) return item.layerId;
  }
  return undefined;
}

function createPackedScene(
  scene: SceneData,
  slug: string,
  base: string,
  frame: ExportFrame,
  massKg: number,
  runtime: VehicleRuntimeSettings,
): string {
  const hulls = collisionHulls(scene, frame);
  const lines = [
    `[gd_scene load_steps=${hulls.length + 7} format=3]`,
    "",
    `[ext_resource type="PackedScene" path="res://${base}/${slug}.glb" id="1_visual"]`,
    `[ext_resource type="Script" path="res://${base}/scripts/vehicle_controller.gd" id="2_controller"]`,
    `[ext_resource type="Script" path="res://${base}/scripts/force_emitter.gd" id="3_emitter"]`,
    `[ext_resource type="Script" path="res://${base}/scripts/raycast_wheel.gd" id="4_wheel"]`,
    `[ext_resource type="Script" path="res://${base}/scripts/repulsor_pad.gd" id="5_repulsor"]`,
    "",
    `[sub_resource type="PhysicsMaterial" id="PhysicsMaterial_vehicle"]`,
    `friction = ${n(runtime.friction)}`,
    `bounce = ${n(runtime.bounce)}`,
  ];
  hulls.forEach((hull, index) => {
    lines.push(
      "",
      `[sub_resource type="ConvexPolygonShape3D" id="Convex_${index}"]`,
      `points = PackedVector3Array(${hull.points.flatMap((point) => [n(point.x), n(point.y), n(point.z)]).join(", ")})`,
    );
  });
  lines.push(
    "",
    `[node name="${godotName(slug)}" type="RigidBody3D"]`,
    `mass = ${n(massKg)}`,
    "center_of_mass_mode = 1",
    "center_of_mass = Vector3(0, 0, 0)",
    `gravity_scale = ${n(runtime.gravityScale)}`,
    `linear_damp = ${n(runtime.linearDamp)}`,
    `angular_damp = ${n(runtime.angularDamp)}`,
    `collision_layer = ${Math.trunc(runtime.collisionLayer)}`,
    `collision_mask = ${Math.trunc(runtime.collisionMask)}`,
    "continuous_cd = true",
    "contact_monitor = true",
    "max_contacts_reported = 16",
    `physics_material_override = SubResource("PhysicsMaterial_vehicle")`,
    `script = ExtResource("2_controller")`,
    `thruster_angular_acceleration = ${n(runtime.thrusterAngularAcceleration)}`,
    `wheel_drive_acceleration = ${n(runtime.wheelDriveAcceleration)}`,
    `wheel_brake_acceleration = ${n(runtime.wheelBrakeAcceleration)}`,
    `suspension_damping_ratio = ${n(runtime.suspensionDampingRatio)}`,
    "",
    `[node name="Visual" parent="." instance=ExtResource("1_visual")]`,
    "",
    `[node name="Collisions" type="Node3D" parent="."]`,
  );
  hulls.forEach((hull, index) => lines.push(
    "",
    `[node name="${godotName(hull.name)}" type="CollisionShape3D" parent="Collisions"]`,
    `shape = SubResource("Convex_${index}")`,
  ));
  lines.push("", `[node name="Components" type="Node3D" parent="."]`);
  addComponents(lines, scene, frame, massKg, runtime);
  addCamera(lines, scene, frame, runtime);
  return `${lines.join("\n")}\n`;
}

function addComponents(lines: string[], scene: SceneData, frame: ExportFrame, massKg: number, runtime: VehicleRuntimeSettings): void {
  const engines = Object.values(scene.widgets).filter((w) => w.kind === "rocket-engine");
  const thrusters = Object.values(scene.widgets).filter((w) => w.kind === "thruster");
  const wheels = Object.values(scene.widgets).filter((w) => w.kind === "wheel");
  const repulsors = Object.values(scene.widgets).filter((w) => w.kind === "repulsor-pad");
  for (const widget of [...engines, ...thrusters]) {
    const node = scene.nodes[widget.nodeId];
    const force = getWidgetForceVector(widget);
    if (!node || !force) continue;
    const position = toVehiclePoint(frame, getAttachmentPosition(node.position, widget.face));
    const direction = toVehicleVector(frame, force);
    const count = widget.kind === "rocket-engine" ? engines.length : thrusters.length;
    const acceleration = widget.kind === "rocket-engine" ? runtime.engineAcceleration : runtime.thrusterLinearAcceleration;
    const maxForce = widget.runtime?.maxForceNewtons ?? massKg * acceleration / Math.max(1, count);
    lines.push(
      "",
      `[node name="${godotName(widget.kind)}_${godotName(widget.id)}" type="Marker3D" parent="Components" groups=["strutz_force_emitter"]]`,
      `position = ${v3(position)}`,
      `script = ExtResource("3_emitter")`,
      `widget_id = "${escapeGodot(widget.id)}"`,
      `component_kind = "${widget.kind === "rocket-engine" ? "engine" : "thruster"}"`,
      `force_direction = ${v3(direction)}`,
      `max_force_newtons = ${n(maxForce)}`,
      `enabled = ${bool(widget.runtime?.enabled ?? true)}`,
    );
  }
  for (const widget of wheels) {
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;
    const position = toVehiclePoint(frame, getAttachmentPosition(node.position, widget.face));
    const axle = toVehicleVector(frame, getWidgetAxes(widget.face, widget.rotation).y);
    lines.push(
      "",
      `[node name="wheel_${godotName(widget.id)}" type="Marker3D" parent="Components" groups=["strutz_wheel"]]`,
      `position = ${v3(position)}`,
      `script = ExtResource("4_wheel")`,
      `widget_id = "${escapeGodot(widget.id)}"`,
      `visual_node_name = "widget_wheel_${escapeGodot(widget.id)}"`,
      `axle_direction = ${v3(axle)}`,
      `radius_meters = ${n(WHEEL_GEOMETRY.radius * PHYSICAL_SCALE.metersPerConstructionUnit)}`,
      `suspension_travel_meters = ${n(widget.runtime?.suspensionTravelMeters ?? runtime.suspensionTravelMeters)}`,
      `steering_limit_degrees = ${n(widget.runtime?.steeringLimitDegrees ?? runtime.steeringLimitDegrees)}`,
      `grip = ${n(widget.runtime?.grip ?? runtime.wheelGrip)}`,
      `steering = ${bool(widget.runtime?.steering ?? true)}`,
      `driven = ${bool(widget.runtime?.driven ?? true)}`,
      `braking = ${bool(widget.runtime?.braking ?? true)}`,
      `enabled = ${bool(widget.runtime?.enabled ?? true)}`,
    );
  }
  for (const widget of repulsors) {
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;
    const position = toVehiclePoint(frame, getAttachmentPosition(node.position, widget.face));
    const direction = toVehicleVector(frame, getWidgetAxes(widget.face, widget.rotation).y);
    const maxForce = widget.runtime?.maxForceNewtons ?? massKg * 9.81 * runtime.repulsorMaxGravity / Math.max(1, repulsors.length);
    lines.push(
      "",
      `[node name="repulsor_${godotName(widget.id)}" type="Marker3D" parent="Components" groups=["strutz_repulsor"]]`,
      `position = ${v3(position)}`,
      `script = ExtResource("5_repulsor")`,
      `widget_id = "${escapeGodot(widget.id)}"`,
      `push_direction = ${v3(direction)}`,
      `range_meters = ${n(widget.runtime?.repulsorRangeMeters ?? runtime.repulsorRangeMeters)}`,
      `target_meters = ${n(widget.runtime?.repulsorTargetMeters ?? runtime.repulsorTargetMeters)}`,
      `max_force_newtons = ${n(maxForce)}`,
      `damping_ratio = ${n(runtime.repulsorDampingRatio)}`,
      `enabled = ${bool(widget.runtime?.enabled ?? true)}`,
    );
  }
}

function addCamera(lines: string[], scene: SceneData, frame: ExportFrame, runtime: VehicleRuntimeSettings): void {
  const cockpit = frame.primaryCockpit;
  if (!cockpit) return;
  const node = scene.nodes[cockpit.nodeId];
  if (!node) return;
  const axes = getWidgetAxes(cockpit.face, cockpit.rotation);
  const anchor = getAttachmentPosition(node.position, cockpit.face);
  const worldPosition = add(add(anchor, scale(axes.y, COCKPIT_GEOMETRY.cameraCenterY)), scale(axes.z, COCKPIT_GEOMETRY.cameraCenterZ));
  const position = toVehiclePoint(frame, worldPosition);
  const x = toVehicleVector(frame, axes.x);
  const y = toVehicleVector(frame, axes.z);
  const z = scale(toVehicleVector(frame, axes.y), -1);
  lines.push(
    "",
    `[node name="CameraRig" type="Node3D" parent="."]`,
    "",
    `[node name="Camera3D" type="Camera3D" parent="CameraRig"]`,
    `transform = Transform3D(${[x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z, position.x, position.y, position.z].map(n).join(", ")})`,
    `fov = ${n(cockpit.runtime?.cameraFovDegrees ?? runtime.cameraFovDegrees)}`,
    `near = ${n(cockpit.runtime?.cameraNearMeters ?? runtime.cameraNearMeters)}`,
    `far = ${n(cockpit.runtime?.cameraFarMeters ?? runtime.cameraFarMeters)}`,
    "current = false",
  );
}

function collisionHulls(scene: SceneData, frame: ExportFrame): CollisionHull[] {
  const hulls: CollisionHull[] = [];
  for (const node of Object.values(scene.nodes)) {
    hulls.push({ name: `node_${node.id}`, points: boxCorners(node.position, { x: 1, y: 1, z: 1 }).map((p) => toVehiclePoint(frame, p)) });
  }
  for (const strut of Object.values(scene.struts)) {
    const a = scene.nodes[strut.nodeA];
    const b = scene.nodes[strut.nodeB];
    if (!a || !b) continue;
    const route = getStrutRoutePoints({ nodeA: a.position, faceA: strut.faceA, nodeB: b.position, faceB: strut.faceB, kind: strut.kind });
    for (let index = 0; index + 1 < route.length; index += 1) {
      hulls.push({ name: `strut_${strut.id}_${index}`, points: segmentBox(route[index], route[index + 1], 1).map((p) => toVehiclePoint(frame, p)) });
    }
  }
  for (const panel of Object.values(scene.panels ?? {})) {
    const brush = getPanelBrushGeometry(scene, panel.strutIds, panel.side ?? "top");
    if (brush) hulls.push({ name: `panel_${panel.id}`, points: brush.points.map((p) => toVehiclePoint(frame, p)) });
  }
  for (const widget of Object.values(scene.widgets ?? {})) {
    if (widget.kind === "wheel") continue;
    const node = scene.nodes[widget.nodeId];
    if (!node) continue;
    const anchor = getAttachmentPosition(node.position, widget.face);
    getWidgetCollisionBoxes(widget, anchor).forEach((box, index) => {
      const points: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        points.push(add(add(add(box.center, scale(box.axes[0], box.halfSize.x * x)), scale(box.axes[1], box.halfSize.y * y)), scale(box.axes[2], box.halfSize.z * z)));
      }
      hulls.push({ name: `widget_${widget.id}_${index}`, points: points.map((p) => toVehiclePoint(frame, p)) });
    });
  }
  return hulls;
}

function boxCorners(center: Vec3, size: Vec3): Vec3[] {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    points.push({ x: center.x + x * size.x / 2, y: center.y + y * size.y / 2, z: center.z + z * size.z / 2 });
  }
  return points;
}

function segmentBox(from: Vec3, to: Vec3, width: number): Vec3[] {
  const direction = normalize(sub(to, from));
  const seed = Math.abs(direction.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const right = normalize(cross(direction, seed));
  const up = normalize(cross(right, direction));
  const half = width / 2;
  const points: Vec3[] = [];
  for (const endpoint of [from, to]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
    points.push(add(add(endpoint, scale(right, half * x)), scale(up, half * y)));
  }
  return points;
}

function frameMatrix(frame: ExportFrame): Matrix4 {
  const s = PHYSICAL_SCALE.metersPerConstructionUnit;
  return new Matrix4().set(
    frame.right.x * s, frame.right.y * s, frame.right.z * s, -dot(frame.center, frame.right) * s,
    frame.up.x * s, frame.up.y * s, frame.up.z * s, -dot(frame.center, frame.up) * s,
    -frame.forward.x * s, -frame.forward.y * s, -frame.forward.z * s, dot(frame.center, frame.forward) * s,
    0, 0, 0, 1,
  );
}

function createConfigResource(manifest: GodotVehicleManifest, runtime: VehicleRuntimeSettings): string {
  return `[gd_resource type="Resource" format=3]\n\n[resource]\nresource_name = "${godotName(manifest.name)} configuration"\nmetadata/mass_kg = ${n(manifest.massKg)}\nmetadata/godot_version = "4.7"\nmetadata/capabilities = ${godotDictionary(manifest.capabilities)}\nmetadata/runtime = ${godotDictionary(runtime)}\n`;
}

function createReadme(slug: string, manifest: GodotVehicleManifest, warnings: string[]): string {
  return `# ${slug}\n\nGodot 4.7 vehicle exported by Strutz. Copy the \`vehicles\` directory into the project root and instantiate \`${manifest.scenePath}\`.\n\nDrive it by calling \`apply_command(command)\` on the RigidBody3D root. Positive \`linear.z\` means vehicle-forward even though Godot forward is -Z. The cockpit Camera3D is inactive until \`activate_camera()\` is called. No InputMap actions are installed.\n\nSignals: \`controller_ready\`, \`capabilities_changed\`, \`grounded_changed\`, \`wheel_contact_changed\`, \`repulsor_contact_changed\`, \`body_contact_started\`, and \`body_contact_ended\`.\n${warnings.length ? `\n## Export warnings\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n` : ""}`;
}

function getWarnings(scene: SceneData, frame: ExportFrame): string[] {
  const warnings: string[] = [];
  if (!frame.primaryCockpit) warnings.push("No cockpit was present; Strutz front/top define vehicle forward/up and no Camera3D was generated.");
  if (!Object.values(scene.widgets).some((w) => w.kind === "rocket-engine" || w.kind === "thruster" || w.kind === "wheel" || w.kind === "repulsor-pad")) warnings.push("The scene has no powered movement components and will export as an inert rigid body.");
  const shapeCount = collisionHulls(scene, frame).length;
  if (shapeCount > 128) warnings.push(`The compound body has ${shapeCount} collision shapes; consider simplifying it for runtime performance.`);
  return warnings;
}

function validateRuntime(runtime: VehicleRuntimeSettings): void {
  const positive: Array<keyof VehicleRuntimeSettings> = ["friction", "engineAcceleration", "thrusterLinearAcceleration", "wheelDriveAcceleration", "wheelBrakeAcceleration", "suspensionTravelMeters", "repulsorRangeMeters", "repulsorTargetMeters", "cameraFovDegrees", "cameraNearMeters", "cameraFarMeters"];
  for (const key of positive) if (!Number.isFinite(runtime[key]) || runtime[key] <= 0) throw new Error(`${key} must be greater than zero.`);
  if (runtime.repulsorTargetMeters > runtime.repulsorRangeMeters) throw new Error("Repulsor target distance cannot exceed its range.");
}

function ids(scene: SceneData, kind: WidgetData["kind"]): string[] {
  return Object.values(scene.widgets ?? {}).filter((widget) => widget.kind === kind).map((widget) => widget.id).sort();
}

function slugify(value: string): string {
  const slug = value.replace(/\.[^.]+$/, "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "strutz_vehicle";
}

function godotName(value: string): string { return value.replace(/[^a-zA-Z0-9_]+/g, "_") || "vehicle"; }
function escapeGodot(value: string): string { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function n(value: number): string { return Number(value.toFixed(6)).toString(); }
function bool(value: boolean): string { return value ? "true" : "false"; }
function v3(value: Vec3): string { return `Vector3(${n(value.x)}, ${n(value.y)}, ${n(value.z)})`; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function godotDictionary(value: object): string {
  return `{ ${Object.entries(value as Record<string, unknown>).map(([key, item]) => `"${escapeGodot(key)}": ${typeof item === "boolean" ? bool(item) : typeof item === "number" ? n(item) : `"${escapeGodot(String(item))}"`}`).join(", ")} }`;
}
