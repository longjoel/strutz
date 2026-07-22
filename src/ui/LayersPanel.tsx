import { useEffect, useState } from "react";
import { DEFAULT_LAYER_ID } from "../core/constants";
import { getPartLayerId } from "../core/layers";
import type { LayerData, SceneData } from "../core/types";

export function LayersPanel({
  scene,
  activeLayerId,
  hasSelection,
  onActivate,
  onToggleVisibility,
  onCreate,
  onRename,
  onDelete,
  onSelectContents,
  onMoveSelection,
  embedded = false,
}: {
  scene: SceneData;
  activeLayerId: string;
  hasSelection: boolean;
  onActivate: (layerId: string) => void;
  onToggleVisibility: (layerId: string, visible: boolean) => void;
  onCreate: () => void;
  onRename: (layerId: string, name: string) => void;
  onDelete: (layerId: string) => void;
  onSelectContents: (layerId: string) => void;
  onMoveSelection: (layerId: string) => void;
  embedded?: boolean;
}) {
  const layers = scene.layers ?? [];
  return (
    <aside style={{
      width: embedded ? "100%" : 230,
      height: "100%",
      flexShrink: 0,
      background: "#111b31",
      borderLeft: embedded ? 0 : "1px solid #254368",
      color: "#d7e7f0",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    }}>
      <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 10px", borderBottom: "1px solid #254368" }}>
        <span style={{ fontSize: 12, fontWeight: 750, letterSpacing: 0.5 }}>LAYERS</span>
        <button type="button" title="Add layer" onClick={onCreate} style={iconButtonStyle}>＋</button>
      </div>
      <div style={{ overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            count={countLayerParts(scene, layer.id)}
            active={activeLayerId === layer.id}
            onActivate={() => onActivate(layer.id)}
            onToggleVisibility={() => onToggleVisibility(layer.id, !layer.visible)}
            onRename={(name) => onRename(layer.id, name)}
            onDelete={() => onDelete(layer.id)}
            onSelectContents={() => onSelectContents(layer.id)}
          />
        ))}
      </div>
      <div style={{ marginTop: "auto", padding: 8, borderTop: "1px solid #254368" }}>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => onMoveSelection(activeLayerId)}
          style={actionButtonStyle(!hasSelection)}
        >
          Move selection here
        </button>
      </div>
    </aside>
  );
}

function LayerRow({
  layer,
  count,
  active,
  onActivate,
  onToggleVisibility,
  onRename,
  onDelete,
  onSelectContents,
}: {
  layer: LayerData;
  count: number;
  active: boolean;
  onActivate: () => void;
  onToggleVisibility: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelectContents: () => void;
}) {
  const [name, setName] = useState(layer.name);
  useEffect(() => setName(layer.name), [layer.name]);
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed) onRename(trimmed);
    else setName(layer.name);
  };
  return (
    <div
      onClick={onActivate}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr auto",
        alignItems: "center",
        gap: 4,
        minHeight: 34,
        padding: "3px 4px",
        border: active ? "1px solid #4ecca3" : "1px solid #254368",
        borderRadius: 5,
        background: active ? "#243d5a" : "#16213e",
      }}
    >
      <button type="button" title={layer.visible ? "Hide layer" : "Show layer"} onClick={(event) => {
        event.stopPropagation();
        onToggleVisibility();
      }} style={{ ...iconButtonStyle, marginLeft: 0, color: layer.visible ? "#d7e7f0" : "#50627b" }}>
        {layer.visible ? "◉" : "○"}
      </button>
      <input
        value={name}
        aria-label={`Rename ${layer.name}`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setName(layer.name);
            event.currentTarget.blur();
          }
        }}
        style={{ minWidth: 0, border: 0, outline: 0, background: "transparent", color: "#d7e7f0", fontSize: 12 }}
      />
      <span style={{ color: "#86a0ba", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span />
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" onClick={(event) => { event.stopPropagation(); onSelectContents(); }} style={miniButtonStyle}>Select</button>
        {layer.id !== DEFAULT_LAYER_ID && (
          <button type="button" title="Delete layer; move its parts to Default" onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }} style={miniButtonStyle}>Delete</button>
        )}
      </div>
    </div>
  );
}

function countLayerParts(scene: SceneData, layerId: string): number {
  return [scene.nodes, scene.struts, scene.panels ?? {}, scene.widgets ?? {}]
    .reduce((total, parts) => total + Object.values(parts)
      .filter((part) => getPartLayerId(part) === layerId).length, 0);
}

const iconButtonStyle = {
  width: 26,
  height: 26,
  marginLeft: "auto",
  border: 0,
  borderRadius: 4,
  background: "transparent",
  color: "#9bc8d8",
  cursor: "pointer",
} as const;

const miniButtonStyle = {
  border: 0,
  padding: 0,
  background: "transparent",
  color: "#86b9d0",
  fontSize: 10,
  cursor: "pointer",
} as const;

function actionButtonStyle(disabled: boolean) {
  return {
    width: "100%",
    height: 28,
    border: `1px solid ${disabled ? "#263750" : "#4ecca3"}`,
    borderRadius: 4,
    background: disabled ? "transparent" : "#243d5a",
    color: disabled ? "#50627b" : "#d7fff4",
    cursor: disabled ? "default" : "pointer",
    fontSize: 11,
  } as const;
}
