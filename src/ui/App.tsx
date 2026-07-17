import { useCallback, useEffect, useRef, useState } from "react";
import { Viewport } from "./Viewport";
import { Toolbar } from "./Toolbar";
import type { Tool } from "./types";
import type { SceneData } from "../core/types";
import { normalizeSceneAttachments } from "../core/scene";
import { createRootScene, exportSceneJson, exportSceneObj } from "../core/document";

interface HistoryState {
  past: SceneData[];
  present: SceneData;
  future: SceneData[];
}

const historyLimit = 100;

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createRootScene(),
    future: [],
  }));
  const [fileName, setFileName] = useState("strutz.json");
  const openInputRef = useRef<HTMLInputElement>(null);

  const sceneData = history.present;

  const setSceneData = useCallback((update: React.SetStateAction<SceneData>) => {
    setHistory((current) => {
      const next = typeof update === "function"
        ? (update as (scene: SceneData) => SceneData)(current.present)
        : update;

      if (JSON.stringify(next) === JSON.stringify(current.present)) {
        return current;
      }

      return {
        past: [...current.past, current.present].slice(-historyLimit),
        present: next,
        future: [],
      };
    });
  }, []);

  const replaceSceneData = useCallback((scene: SceneData) => {
    setHistory({
      past: [],
      present: normalizeSceneAttachments(scene),
      future: [],
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;

      return {
        past: [...current.past, current.present].slice(-historyLimit),
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const save = useCallback(() => {
    downloadText(fileName, exportSceneJson(sceneData), "application/json");
  }, [fileName, sceneData]);

  const saveAs = useCallback(() => {
    const nextName = window.prompt("Save as", fileName) ?? fileName;
    if (!nextName.trim()) return;
    const normalizedName = nextName.endsWith(".json") ? nextName : `${nextName}.json`;
    setFileName(normalizedName);
    downloadText(normalizedName, exportSceneJson(sceneData), "application/json");
  }, [fileName, sceneData]);

  const open = useCallback(() => {
    openInputRef.current?.click();
  }, []);

  const exportJson = useCallback(() => {
    downloadText(fileName.replace(/\.json$/i, ".json"), exportSceneJson(sceneData), "application/json");
  }, [fileName, sceneData]);

  const exportObj = useCallback(() => {
    downloadText(fileName.replace(/\.json$/i, ".obj"), exportSceneObj(sceneData), "model/obj");
  }, [fileName, sceneData]);

  const handleOpenFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SceneData;
        assertSceneData(parsed);
        replaceSceneData(parsed);
        setFileName(file.name.endsWith(".json") ? file.name : `${file.name}.json`);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not open scene file.");
      }
    };
    reader.readAsText(file);
  }, [replaceSceneData]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [redo, save, undo]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <input
        ref={openInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleOpenFile}
      />
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onSave={save}
        onSaveAs={saveAs}
        onOpen={open}
        onExportJson={exportJson}
        onExportObj={exportObj}
      />
      <Viewport activeTool={activeTool} sceneData={sceneData} setSceneData={setSceneData} />
    </div>
  );
}

function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function assertSceneData(value: SceneData) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.nodes ||
    !value.struts ||
    !value.accessories
  ) {
    throw new Error("The selected file is not a Strutz scene.");
  }
}
