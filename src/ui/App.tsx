import { useState } from "react";
import { Viewport } from "./Viewport";
import { Toolbar } from "./Toolbar";
import type { Tool } from "./types";

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("select");

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <Toolbar activeTool={activeTool} onSelectTool={setActiveTool} />
      <Viewport activeTool={activeTool} />
    </div>
  );
}
