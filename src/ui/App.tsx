import { useCallback, useEffect, useRef, useState } from "react";
import { Viewport } from "./Viewport";
import { Toolbar } from "./Toolbar";
import type { StrutDrawMode, Tool } from "./types";
import type { SceneData } from "../core/types";
import type { WidgetKind } from "../core/types";
import { normalizeSceneAttachments } from "../core/scene";
import { createRootScene, exportSceneJson, exportSceneObj } from "../core/document";
import { WidgetPalette } from "./WidgetPalette";
import { AppBar } from "./AppBar";
import { exportSceneGltf } from "./exportGltf";
import { StrutPalette } from "./StrutPalette";
import { CURRENT_SCENE_VERSION } from "../core/constants";
import type { CameraMode } from "./camera";

interface HistoryState {
  past: SceneData[];
  present: SceneData;
  future: SceneData[];
}

const historyLimit = 100;

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [selectedWidgetKind, setSelectedWidgetKind] = useState<WidgetKind>("antenna");
  const [strutDrawMode, setStrutDrawMode] = useState<StrutDrawMode>("straight");
  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [followSelection, setFollowSelection] = useState(true);
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createRootScene(),
    future: [],
  }));
  const [fileName, setFileName] = useState("strutz.json");
  const [filePath, setFilePath] = useState<string | null>(null);
  const openInputRef = useRef<HTMLInputElement>(null);

  const sceneData = history.present;
  const electron = window.strutzElectron;

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

  const newScene = useCallback(() => {
    replaceSceneData(createRootScene());
    setFileName("strutz.json");
    setFilePath(null);
  }, [replaceSceneData]);

  const save = useCallback(async () => {
    const text = exportSceneJson(sceneData);
    if (electron) {
      try {
        const result = await electron.saveScene({ filePath, fileName, text });
        if (!result.canceled) {
          setFilePath(result.filePath ?? null);
          setFileName(result.fileName ?? fileName);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not save scene file.");
      }
      return;
    }

    downloadText(fileName, exportSceneJson(sceneData), "application/json");
  }, [electron, fileName, filePath, sceneData]);

  const saveAs = useCallback(async () => {
    const text = exportSceneJson(sceneData);
    if (electron) {
      try {
        const result = await electron.saveScene({ filePath: null, fileName, text });
        if (!result.canceled) {
          setFilePath(result.filePath ?? null);
          setFileName(result.fileName ?? fileName);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not save scene file.");
      }
      return;
    }

    const nextName = window.prompt("Save as", fileName) ?? fileName;
    if (!nextName.trim()) return;
    const normalizedName = nextName.endsWith(".json") ? nextName : `${nextName}.json`;
    setFileName(normalizedName);
    downloadText(normalizedName, exportSceneJson(sceneData), "application/json");
  }, [electron, fileName, sceneData]);

  const loadSceneText = useCallback((text: string, nextFileName: string, nextFilePath: string | null) => {
    try {
      const parsed = JSON.parse(text) as SceneData;
      assertSceneData(parsed);
      replaceSceneData(parsed);
      setFileName(nextFileName.endsWith(".json") ? nextFileName : `${nextFileName}.json`);
      setFilePath(nextFilePath);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open scene file.");
    }
  }, [replaceSceneData]);

  const open = useCallback(async () => {
    if (electron) {
      try {
        const result = await electron.openScene();
        if (!result.canceled && result.text && result.fileName) {
          loadSceneText(result.text, result.fileName, result.filePath ?? null);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not open scene file.");
      }
      return;
    }

    openInputRef.current?.click();
  }, [electron, loadSceneText]);

  const exportJson = useCallback(async () => {
    const exportName = fileName.replace(/\.json$/i, ".json");
    const text = exportSceneJson(sceneData);
    if (electron) {
      try {
        await electron.exportScene({ fileName: exportName, text, type: "json" });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not export JSON.");
      }
      return;
    }

    downloadText(exportName, text, "application/json");
  }, [electron, fileName, sceneData]);

  const exportObj = useCallback(async () => {
    const exportName = fileName.replace(/\.json$/i, ".obj");
    const text = exportSceneObj(sceneData);
    if (electron) {
      try {
        await electron.exportScene({ fileName: exportName, text, type: "obj" });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not export OBJ.");
      }
      return;
    }

    downloadText(exportName, text, "model/obj");
  }, [electron, fileName, sceneData]);

  const exportGltf = useCallback(async () => {
    const exportName = fileName.replace(/\.json$/i, ".gltf");
    try {
      const text = await exportSceneGltf(sceneData);
      if (electron) {
        await electron.exportScene({ fileName: exportName, text, type: "gltf" });
      } else {
        downloadText(exportName, text, "model/gltf+json");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not export glTF.");
    }
  }, [electron, fileName, sceneData]);

  const handleOpenFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      loadSceneText(String(reader.result), file.name, null);
    };
    reader.readAsText(file);
  }, [loadSceneText]);

  useEffect(() => {
    if (!electron) return;

    return electron.onMenuCommand((command) => {
      switch (command) {
        case "new":
          newScene();
          break;
        case "open":
          void open();
          break;
        case "save":
          void save();
          break;
        case "save-as":
          void saveAs();
          break;
        case "export-json":
          void exportJson();
          break;
        case "export-obj":
          void exportObj();
          break;
        case "export-gltf":
          void exportGltf();
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
      }
    });
  }, [electron, exportGltf, exportJson, exportObj, newScene, open, redo, save, saveAs, undo]);

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
        if (event.shiftKey) void saveAs();
        else void save();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void open();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newScene();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newScene, open, redo, save, saveAs, undo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <input
        ref={openInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleOpenFile}
      />
      <AppBar
        fileName={fileName}
        scene={sceneData}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        cameraMode={cameraMode}
        followSelection={followSelection}
        onToggleCameraMode={() => setCameraMode((current) =>
          current === "perspective" ? "orthographic" : "perspective")}
        onToggleFollowSelection={() => setFollowSelection((current) => !current)}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        <Viewport
          activeTool={activeTool}
          selectedWidgetKind={selectedWidgetKind}
          strutDrawMode={strutDrawMode}
          sceneData={sceneData}
          setSceneData={setSceneData}
          cameraMode={cameraMode}
          followSelection={followSelection}
          onCameraModeChange={setCameraMode}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <div style={{ position: "absolute", top: 12, left: 12, pointerEvents: "auto" }}>
            <Toolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
            />
          </div>
          <div style={{ position: "absolute", top: 12, left: 72, pointerEvents: "auto" }}>
            <WidgetPalette
              active={activeTool === "place-widget"}
              selected={selectedWidgetKind}
              onSelect={setSelectedWidgetKind}
            />
            <StrutPalette
              active={activeTool === "draw-strut"}
              mode={strutDrawMode}
              onChange={setStrutDrawMode}
            />
          </div>
        </div>
      </div>
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
    !value.widgets && !value.accessories
  ) {
    throw new Error("The selected file is not a Strutz scene.");
  }
  if (value.schemaVersion !== undefined && value.schemaVersion > CURRENT_SCENE_VERSION) {
    throw new Error(
      `This scene uses format version ${value.schemaVersion}; this build supports up to version ${CURRENT_SCENE_VERSION}.`,
    );
  }
}
