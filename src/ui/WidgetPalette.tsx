import type { WidgetKind } from "../core/types";

const WIDGETS: Array<{ kind: WidgetKind; label: string; icon: string }> = [
  { kind: "antenna", label: "Antenna", icon: "A" },
  { kind: "rocket-engine", label: "Engine", icon: "E" },
  { kind: "cockpit", label: "Cockpit", icon: "C" },
  { kind: "wheel", label: "Wheel", icon: "◉" },
];

export function WidgetPalette({
  active,
  selected,
  onSelect,
}: {
  active: boolean;
  selected: WidgetKind;
  onSelect: (kind: WidgetKind) => void;
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
      {WIDGETS.map((widget) => (
        <button
          key={widget.kind}
          title={widget.label}
          onClick={() => onSelect(widget.kind)}
          style={{
            minHeight: 42,
            border: selected === widget.kind ? "1px solid #e9a040" : "1px solid #254368",
            borderRadius: 4,
            background: selected === widget.kind ? "#243d5a" : "#16213e",
            color: "#e0e0e0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 8px",
            textAlign: "left",
          }}
        >
          <span style={{ width: 18, textAlign: "center", color: "#4ecca3", fontWeight: 700 }}>
            {widget.icon}
          </span>
          <span>{widget.label}</span>
        </button>
      ))}
    </aside>
  );
}
