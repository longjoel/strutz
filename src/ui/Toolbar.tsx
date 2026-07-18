import { useCallback, useEffect } from "react";
import type { StrutDrawMode, Tool } from "./types";

type ToolbarTool = "structural" | "external" | "widgets";

const TOOLS: { id: ToolbarTool; label: string; shortcut: string }[] = [
  { id: "structural", label: "Structural", shortcut: "S" },
  { id: "external", label: "External", shortcut: "E" },
  { id: "widgets", label: "Widgets", shortcut: "A" },
];

interface ToolbarProps {
  activeTool: Tool;
  strutDrawMode: StrutDrawMode;
  onSelectTool: (tool: Tool) => void;
  onSelectStrutDrawMode: (mode: StrutDrawMode) => void;
}

export function Toolbar({
  activeTool,
  strutDrawMode,
  onSelectTool,
  onSelectStrutDrawMode,
}: ToolbarProps) {
  const selectToolbarTool = useCallback((tool: ToolbarTool) => {
    if (tool === "widgets") {
      onSelectTool("place-widget");
      return;
    }
    onSelectTool("draw-strut");
    onSelectStrutDrawMode(tool === "structural" ? "straight" : "corner");
  }, [onSelectStrutDrawMode, onSelectTool]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool) selectToolbarTool(tool.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectToolbarTool]);

  const activeToolbarTool: ToolbarTool = activeTool === "place-widget"
    ? "widgets"
    : strutDrawMode === "corner"
      ? "external"
      : "structural";

  return (
    <div
      style={{
        width: 52,
        background: "#111b31",
        display: "flex",
        flexDirection: "column",
        padding: 6,
        gap: 4,
        border: "1px solid #254368",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(2, 12, 26, 0.35)",
      }}
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => selectToolbarTool(tool.id)}
          style={{
            width: 40,
            height: 40,
            margin: "0 auto",
            border: tool.id === activeToolbarTool ? "1px solid #4ecca3" : "1px solid transparent",
            borderRadius: 6,
            background: tool.id === activeToolbarTool ? "#243d5a" : "transparent",
            color: tool.id === activeToolbarTool ? "#d7e7f0" : "#86a0ba",
            cursor: "pointer",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {toolIcon(tool.id)}
        </button>
      ))}
    </div>
  );
}

function toolIcon(tool: ToolbarTool): string {
  switch (tool) {
    case "structural":
      return "│";
    case "external":
      return "⌜";
    case "widgets":
      return "⚙";
  }
}
