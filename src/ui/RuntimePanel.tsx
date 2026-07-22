import { DEFAULT_PHYSICS_SETTINGS, DEFAULT_VEHICLE_RUNTIME_SETTINGS } from "../core/constants";
import type { SceneData, VehicleRuntimeSettings, WidgetRuntimeOverrides } from "../core/types";

export function RuntimePanel({
  scene,
  selectedNodeIds,
  selectedWidgetIds,
  onChange,
  embedded = false,
}: {
  scene: SceneData;
  selectedNodeIds: Set<string>;
  selectedWidgetIds: Set<string>;
  onChange: (update: (scene: SceneData) => SceneData) => void;
  embedded?: boolean;
}) {
  const runtime = { ...DEFAULT_VEHICLE_RUNTIME_SETTINGS, ...scene.runtime };
  const physics = { ...DEFAULT_PHYSICS_SETTINGS, ...scene.physics };
  const node = scene.nodes[[...selectedNodeIds][0] ?? ""];
  const widget = scene.widgets[[...selectedWidgetIds][0] ?? ""];
  const setRuntime = (key: keyof VehicleRuntimeSettings, value: number) => onChange((current) => ({
    ...current, runtime: { ...current.runtime, [key]: value },
  }));
  const setWidget = (patch: Partial<WidgetRuntimeOverrides>) => widget && onChange((current) => ({
    ...current,
    widgets: { ...current.widgets, [widget.id]: { ...current.widgets[widget.id], runtime: { ...current.widgets[widget.id].runtime, ...patch } } },
  }));

  return (
    <aside style={{ ...panelStyle, width: embedded ? "100%" : 230, borderLeft: embedded ? 0 : "1px solid #254368" }}>
      <div style={headingStyle}>GODOT PHYSICS</div>
      <NumberField label="Density kg/m³" value={physics.materialDensityKgPerM3} onChange={(value) => onChange((current) => ({ ...current, physics: { ...current.physics, materialDensityKgPerM3: value } }))} />
      <NumberField label="Default node kg" value={physics.defaultNodeMassKg} onChange={(value) => onChange((current) => ({ ...current, physics: { ...current.physics, defaultNodeMassKg: value } }))} />
      <NumberField label="Engine accel" value={runtime.engineAcceleration} onChange={(value) => setRuntime("engineAcceleration", value)} />
      <NumberField label="Thruster accel" value={runtime.thrusterLinearAcceleration} onChange={(value) => setRuntime("thrusterLinearAcceleration", value)} />
      <NumberField label="Wheel accel" value={runtime.wheelDriveAcceleration} onChange={(value) => setRuntime("wheelDriveAcceleration", value)} />
      <NumberField label="Repulsor range" value={runtime.repulsorRangeMeters} onChange={(value) => setRuntime("repulsorRangeMeters", value)} />
      <NumberField label="Hover height" value={runtime.repulsorTargetMeters} onChange={(value) => setRuntime("repulsorTargetMeters", value)} />
      {node && (
        <>
          <div style={subheadingStyle}>NODE {node.id.slice(0, 8)}</div>
          <NumberField label="Mass kg" value={node.massKg ?? physics.defaultNodeMassKg} onChange={(value) => onChange((current) => ({ ...current, nodes: { ...current.nodes, [node.id]: { ...current.nodes[node.id], massKg: value } } }))} />
        </>
      )}
      {widget && (
        <>
          <div style={subheadingStyle}>{widget.kind.toUpperCase()}</div>
          <CheckField label="Enabled" value={widget.runtime?.enabled ?? true} onChange={(value) => setWidget({ enabled: value })} />
          {(widget.kind === "rocket-engine" || widget.kind === "thruster" || widget.kind === "repulsor-pad") && (
            <NumberField label="Max force N (0=auto)" value={widget.runtime?.maxForceNewtons ?? 0} onChange={(value) => setWidget({ maxForceNewtons: value > 0 ? value : undefined })} />
          )}
          {widget.kind === "wheel" && (
            <>
              <CheckField label="Steering" value={widget.runtime?.steering ?? true} onChange={(value) => setWidget({ steering: value })} />
              <CheckField label="Driven" value={widget.runtime?.driven ?? true} onChange={(value) => setWidget({ driven: value })} />
              <CheckField label="Braking" value={widget.runtime?.braking ?? true} onChange={(value) => setWidget({ braking: value })} />
              <NumberField label="Steering degrees" value={widget.runtime?.steeringLimitDegrees ?? runtime.steeringLimitDegrees} onChange={(value) => setWidget({ steeringLimitDegrees: value })} />
              <NumberField label="Suspension m" value={widget.runtime?.suspensionTravelMeters ?? runtime.suspensionTravelMeters} onChange={(value) => setWidget({ suspensionTravelMeters: value })} />
            </>
          )}
          {widget.kind === "repulsor-pad" && (
            <>
              <NumberField label="Range m" value={widget.runtime?.repulsorRangeMeters ?? runtime.repulsorRangeMeters} onChange={(value) => setWidget({ repulsorRangeMeters: value })} />
              <NumberField label="Target m" value={widget.runtime?.repulsorTargetMeters ?? runtime.repulsorTargetMeters} onChange={(value) => setWidget({ repulsorTargetMeters: value })} />
            </>
          )}
          {widget.kind === "cockpit" && (
            <>
              <CheckField label="Primary camera" value={widget.runtime?.primaryCamera ?? false} onChange={(value) => onChange((current) => ({
                ...current,
                widgets: Object.fromEntries(Object.entries(current.widgets).map(([id, item]) => [id, item.kind === "cockpit" ? { ...item, runtime: { ...item.runtime, primaryCamera: id === widget.id ? value : false } } : item])),
              }))} />
              <NumberField label="Camera FOV" value={widget.runtime?.cameraFovDegrees ?? runtime.cameraFovDegrees} onChange={(value) => setWidget({ cameraFovDegrees: value })} />
            </>
          )}
        </>
      )}
    </aside>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label style={fieldStyle}><span>{label}</span><input type="number" value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} style={inputStyle} /></label>;
}

function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label style={fieldStyle}><span>{label}</span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>;
}

const panelStyle: React.CSSProperties = { height: "100%", minHeight: 0, flexShrink: 0, padding: 8, overflowY: "auto", background: "#10192d", color: "#d7e7f0", fontSize: 11, boxSizing: "border-box" };
const headingStyle: React.CSSProperties = { fontSize: 12, fontWeight: 750, letterSpacing: 0.5, marginBottom: 8 };
const subheadingStyle: React.CSSProperties = { marginTop: 10, marginBottom: 5, paddingTop: 7, borderTop: "1px solid #254368", color: "#9bc8d8", fontWeight: 700 };
const fieldStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 28 };
const inputStyle: React.CSSProperties = { width: 82, padding: "3px 5px", color: "#e7f2f8", background: "#16213e", border: "1px solid #315278", borderRadius: 3 };
