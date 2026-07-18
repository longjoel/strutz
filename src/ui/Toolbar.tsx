import { useEffect } from "react";
import type { Tool } from "./types";

const TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: "select", label: "Select/Move", shortcut: "V" },
  { id: "draw-strut", label: "Draw Strut", shortcut: "S" },
  { id: "place-widget", label: "Widgets", shortcut: "A" },
];

interface ToolbarProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

export function Toolbar({
  activeTool,
  onSelectTool,
}: ToolbarProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool) onSelectTool(tool.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelectTool]);

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
          onClick={() => onSelectTool(tool.id)}
          style={{
            width: 40,
            height: 40,
            margin: "0 auto",
            border: tool.id === activeTool ? "1px solid #4ecca3" : "1px solid transparent",
            borderRadius: 6,
            background: tool.id === activeTool ? "#243d5a" : "transparent",
            color: tool.id === activeTool ? "#d7e7f0" : "#86a0ba",
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

function toolIcon(tool: Tool): string {
  switch (tool) {
    case "select":
      return "⬏";
    case "draw-strut":
      return "╪";
    case "place-widget":
      return "⚙";
  }
}
