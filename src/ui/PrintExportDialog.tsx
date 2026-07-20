import { useMemo } from "react";
import { getScenePrintSize } from "../core/exportStl";
import type { SceneData } from "../core/types";

export function PrintExportDialog({
  scene,
  scaleInput,
  error,
  exporting,
  onScaleInput,
  onCancel,
  onExport,
}: {
  scene: SceneData;
  scaleInput: string;
  error: string | null;
  exporting: boolean;
  onScaleInput: (value: string) => void;
  onCancel: () => void;
  onExport: () => void;
}) {
  const scale = Number(scaleInput);
  const size = useMemo(() => Number.isFinite(scale) && scale > 0
    ? getScenePrintSize(scene, scale)
    : null, [scale, scene]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2, 10, 24, 0.72)",
      }}
    >
      <form
        onSubmit={(event) => { event.preventDefault(); onExport(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !exporting) onCancel();
        }}
        style={{
          width: 390,
          padding: 18,
          border: "1px solid #31567f",
          borderRadius: 8,
          background: "#111b31",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          color: "#d7e7f0",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 750 }}>Export Printable STL</div>
        <p style={{ margin: "8px 0 16px", color: "#9bc8d8", fontSize: 12, lineHeight: 1.5 }}>
          Choose how many millimeters each Strutz construction unit should occupy.
        </p>
        <label style={{ display: "block", color: "#b9cad8", fontSize: 11 }}>
          Millimeters per construction unit
          <input
            autoFocus
            type="number"
            min="0.01"
            step="0.1"
            value={scaleInput}
            disabled={exporting}
            onChange={(event) => onScaleInput(event.target.value)}
            style={{
              display: "block",
              boxSizing: "border-box",
              width: "100%",
              height: 34,
              marginTop: 6,
              padding: "0 9px",
              border: `1px solid ${error ? "#e94560" : "#31567f"}`,
              borderRadius: 5,
              outline: 0,
              background: "#0b1d35",
              color: "#f1f7fa",
              fontSize: 13,
            }}
          />
        </label>
        <div style={{ minHeight: 36, marginTop: 10, fontSize: 11 }}>
          {size && (
            <span style={{ color: "#86b9d0" }}>
              Approximate node bounds: {format(size.x)} × {format(size.y)} × {format(size.z)} mm
            </span>
          )}
          {error && <div style={{ marginTop: 5, color: "#ff9cac" }}>{error}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" disabled={exporting} onClick={onCancel} style={buttonStyle(false)}>
            Cancel
          </button>
          <button type="submit" disabled={exporting} style={buttonStyle(true)}>
            {exporting ? "Exporting…" : "Export STL"}
          </button>
        </div>
      </form>
    </div>
  );
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buttonStyle(primary: boolean) {
  return {
    height: 30,
    padding: "0 12px",
    border: `1px solid ${primary ? "#4ecca3" : "#31567f"}`,
    borderRadius: 5,
    background: primary ? "#243d5a" : "transparent",
    color: primary ? "#d7fff4" : "#b9cad8",
    cursor: "pointer",
  } as const;
}
