import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN_WIDTH = 220;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 280;
const STORAGE_KEY = "strutz.inspector-width";
const TAB_STORAGE_KEY = "strutz.inspector-tab";
const COLLAPSED_STORAGE_KEY = "strutz.inspector-collapsed";

export function InspectorDock({ layers, physics }: { layers: ReactNode; physics: ReactNode }) {
  const [tab, setTab] = useState<"layers" | "physics">(() =>
    globalThis.localStorage?.getItem(TAB_STORAGE_KEY) === "physics" ? "physics" : "layers");
  const [collapsed, setCollapsed] = useState(() =>
    globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === "true");
  const [width, setWidth] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampInspectorWidth(stored) : DEFAULT_WIDTH;
  });
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    globalThis.localStorage?.setItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  useEffect(() => {
    globalThis.localStorage?.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      setWidth(clampInspectorWidth(drag.current.startWidth + drag.current.startX - event.clientX));
    };
    const end = () => {
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  if (collapsed) {
    return (
      <aside style={{ ...dockStyle, width: 38 }}>
        <button type="button" title="Restore inspector" aria-label="Restore inspector" onClick={() => setCollapsed(false)} style={collapseButtonStyle}>‹</button>
        <button type="button" title="Layers" onClick={() => { setTab("layers"); setCollapsed(false); }} style={verticalTabStyle}>Layers</button>
        <button type="button" title="Godot physics" onClick={() => { setTab("physics"); setCollapsed(false); }} style={verticalTabStyle}>Physics</button>
      </aside>
    );
  }

  return (
    <aside style={{ ...dockStyle, width }}>
      <div
        role="separator"
        aria-label="Resize inspector"
        aria-orientation="vertical"
        title="Drag to resize; double-click to reset"
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        onPointerDown={(event) => {
          drag.current = { startX: event.clientX, startWidth: width };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          event.preventDefault();
        }}
        style={resizeHandleStyle}
      />
      <div style={tabBarStyle}>
        <Tab active={tab === "layers"} onClick={() => setTab("layers")}>Layers</Tab>
        <Tab active={tab === "physics"} onClick={() => setTab("physics")}>Godot Physics</Tab>
        <button type="button" title="Collapse inspector" aria-label="Collapse inspector" onClick={() => setCollapsed(true)} style={collapseButtonStyle}>›</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "layers" ? layers : physics}
      </div>
    </aside>
  );
}

export function clampInspectorWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} style={{ ...tabStyle, color: active ? "#d7fff4" : "#86a0ba", borderBottomColor: active ? "#4ecca3" : "transparent" }}>{children}</button>;
}

const dockStyle: React.CSSProperties = { position: "relative", zIndex: 4, height: "100%", minHeight: 0, flexShrink: 0, display: "flex", flexDirection: "column", background: "#111b31", borderLeft: "1px solid #254368", color: "#d7e7f0", overflow: "visible" };
const resizeHandleStyle: React.CSSProperties = { position: "absolute", zIndex: 5, left: -5, top: 0, bottom: 0, width: 10, cursor: "col-resize", borderLeft: "1px solid transparent" };
const tabBarStyle: React.CSSProperties = { height: 38, flexShrink: 0, display: "flex", alignItems: "stretch", borderBottom: "1px solid #254368", paddingLeft: 5 };
const tabStyle: React.CSSProperties = { border: 0, borderBottom: "2px solid transparent", background: "transparent", padding: "0 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" };
const collapseButtonStyle: React.CSSProperties = { width: 34, minHeight: 36, marginLeft: "auto", border: 0, background: "transparent", color: "#9bc8d8", fontSize: 20, cursor: "pointer" };
const verticalTabStyle: React.CSSProperties = { width: 36, border: 0, borderTop: "1px solid #254368", background: "transparent", color: "#86b9d0", padding: "10px 0", cursor: "pointer", writingMode: "vertical-rl" };
