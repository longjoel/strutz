import type { SceneData } from "../core/types";
import type { CameraMode } from "./camera";

export function AppBar({
  fileName,
  scene,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  cameraMode,
  followSelection,
  onToggleCameraMode,
  onToggleFollowSelection,
}: {
  fileName: string;
  scene: SceneData;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  cameraMode: CameraMode;
  followSelection: boolean;
  onToggleCameraMode: () => void;
  onToggleFollowSelection: () => void;
}) {
  const stats = [
    ["Nodes", Object.keys(scene.nodes).length],
    ["Struts", Object.keys(scene.struts).length],
    ["Panels", Object.keys(scene.panels ?? {}).length],
    ["Widgets", Object.keys(scene.widgets ?? {}).length],
  ] as const;

  return (
    <header
      style={{
        height: 42,
        flexShrink: 0,
        background: "#111b31",
        borderBottom: "1px solid #254368",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 14,
      }}
    >
      <div style={{ color: "#86b9d0", fontSize: 13, fontWeight: 750, letterSpacing: 0.6 }}>
        STRUTZ
      </div>
      <div
        style={{
          color: "#d7e7f0",
          fontSize: 13,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 280,
        }}
        title={fileName}
      >
        {fileName}
      </div>
      <div style={{ height: 18, width: 1, background: "#254368" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <IconButton label="Undo" icon="↶" disabled={!canUndo} onClick={onUndo} />
        <IconButton label="Redo" icon="↷" disabled={!canRedo} onClick={onRedo} />
        <div style={{ height: 18, width: 1, margin: "0 3px", background: "#254368" }} />
        <ModeButton
          label={`Projection: ${cameraMode === "perspective" ? "Perspective" : "Orthographic"} (O)`}
          text={cameraMode === "perspective" ? "Perspective" : "Orthographic"}
          active={cameraMode === "orthographic"}
          onClick={onToggleCameraMode}
        />
        <ModeButton
          label="Toggle automatic camera follow"
          text="Follow"
          active={followSelection}
          onClick={onToggleFollowSelection}
        />
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {stats.map(([label, count]) => (
          <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 4 }} title={label}>
            <span style={{ color: "#86a0ba", fontSize: 11 }}>{label[0]}</span>
            <span style={{ color: "#d7e7f0", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{count}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function ModeButton({
  label,
  text,
  active,
  onClick,
}: {
  label: string;
  text: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 8px",
        border: `1px solid ${active ? "#4ecca3" : "transparent"}`,
        borderRadius: 4,
        background: active ? "#243d5a" : "transparent",
        color: active ? "#d7fff4" : "#d7e7f0",
        cursor: "pointer",
        fontSize: 11,
      }}
    >
      {text}
    </button>
  );
}

function IconButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        border: "1px solid transparent",
        borderRadius: 4,
        background: "transparent",
        color: disabled ? "#42536c" : "#d7e7f0",
        cursor: disabled ? "default" : "pointer",
        fontSize: 19,
        lineHeight: 1,
      }}
    >
      {icon}
    </button>
  );
}
