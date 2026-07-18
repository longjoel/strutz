import type { StrutDrawMode } from "./types";

export function StrutPalette({
  active,
  mode,
  onChange,
}: {
  active: boolean;
  mode: StrutDrawMode;
  onChange: (mode: StrutDrawMode) => void;
}) {
  if (!active) return null;

  return (
    <aside
      style={{
        width: 112,
        padding: 8,
        background: "#111b31",
        border: "1px solid #254368",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(2, 12, 26, 0.35)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <ModeButton active={mode === "straight"} label="Structural" icon="|" onClick={() => onChange("straight")} />
      <ModeButton active={mode === "corner"} label="External" icon="⌜" onClick={() => onChange("corner")} />
    </aside>
  );
}

function ModeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      style={{
        minHeight: 42,
        border: active ? "1px solid #4ecca3" : "1px solid #254368",
        borderRadius: 4,
        background: active ? "#243d5a" : "#16213e",
        color: "#d7e7f0",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "0 8px",
        textAlign: "left",
      }}
    >
      <span style={{ width: 18, color: "#4ecca3", fontSize: 18, textAlign: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
