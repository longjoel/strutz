import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Viewport } from "./Viewport";
import { Toolbar } from "./Toolbar";
import type { StrutDrawMode, Tool } from "./types";
import type { SceneData } from "../core/types";
import type { WidgetKind } from "../core/types";
import {
  addPanelToScene,
  createPanelFromStruts,
  flipPanelInScene,
  getPanelLoopThroughStrut,
  normalizeSceneAttachments,
} from "../core/scene";
import { createRootScene, exportSceneJson, exportSceneObj } from "../core/document";
import { WidgetPalette } from "./WidgetPalette";
import { AppBar } from "./AppBar";
import { exportSceneGltf } from "./exportGltf";
import { CURRENT_SCENE_VERSION, DEFAULT_LAYER_ID } from "../core/constants";
import type { CameraMode } from "./camera";
import { getPanelActionState } from "./panelActions";
import { LayersPanel } from "./LayersPanel";
import {
  assignSelectionToLayer,
  createLayerInScene,
  deleteLayerFromScene,
  getPartLayerId,
  renameLayerInScene,
  selectLayerContents,
  setLayerVisibilityInScene,
} from "../core/layers";
import type { SceneSelection } from "../core/types";
import {
  createAssemblyClipboard,
  mergeAssemblyIntoScene,
  parseAssemblyClipboard,
  prepareAssemblyPaste,
  selectionForAssembly,
  serializeAssemblyClipboard,
  type AssemblyClipboard,
} from "../core/composition";
import { exportSceneStl } from "../core/exportStl";
import { PrintExportDialog } from "./PrintExportDialog";

interface HistoryState {
  past: SceneData[];
  present: SceneData;
  future: SceneData[];
}

const historyLimit = 100;

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>("draw-strut");
  const [selectedWidgetKind, setSelectedWidgetKind] = useState<WidgetKind>("antenna");
  const [strutDrawMode, setStrutDrawMode] = useState<StrutDrawMode>("straight");
  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [followSelection, setFollowSelection] = useState(true);
  const [selectedStrutIds, setSelectedStrutIds] = useState<Set<string>>(new Set());
  const [selectedPanelIds, setSelectedPanelIds] = useState<Set<string>>(new Set());
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set());
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_LAYER_ID);
  const [pasteAssembly, setPasteAssembly] = useState<AssemblyClipboard | null>(null);
  const [compositionStatus, setCompositionStatus] = useState<string | null>(null);
  const [printExportOpen, setPrintExportOpen] = useState(false);
  const [printScaleInput, setPrintScaleInput] = useState("2");
  const [printExportError, setPrintExportError] = useState<string | null>(null);
  const [printExporting, setPrintExporting] = useState(false);
  const [panelPreviewSide, setPanelPreviewSide] = useState<"top" | "bottom" | null>(null);
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createRootScene(),
    future: [],
  }));
  const [fileName, setFileName] = useState("strutz.json");
  const [filePath, setFilePath] = useState<string | null>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<AssemblyClipboard | null>(null);

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
    setSelectedStrutIds(new Set());
    setSelectedPanelIds(new Set());
    setSelectedNodeIds(new Set());
    setSelectedWidgetIds(new Set());
    setActiveLayerId(DEFAULT_LAYER_ID);
    setPasteAssembly(null);
    setPanelPreviewSide(null);
  }, []);

  useEffect(() => {
    const activeLayer = sceneData.layers?.find((layer) => layer.id === activeLayerId);
    if (activeLayer?.visible) return;
    const visibleLayer = sceneData.layers?.find((layer) => layer.visible);
    if (visibleLayer) {
      setActiveLayerId(visibleLayer.id);
      return;
    }
    setSceneData((scene) => setLayerVisibilityInScene(scene, DEFAULT_LAYER_ID, true));
    setActiveLayerId(DEFAULT_LAYER_ID);
  }, [activeLayerId, sceneData.layers, setSceneData]);

  const selectedStrutIdList = useMemo(() => [...selectedStrutIds], [selectedStrutIds]);
  const selection = useMemo<SceneSelection>(() => ({
    nodeIds: selectedNodeIds,
    strutIds: selectedStrutIds,
    panelIds: selectedPanelIds,
    widgetIds: selectedWidgetIds,
  }), [selectedNodeIds, selectedPanelIds, selectedStrutIds, selectedWidgetIds]);
  const hasSelection = selectedNodeIds.size + selectedStrutIds.size +
    selectedPanelIds.size + selectedWidgetIds.size > 0;

  const copySelection = useCallback(async () => {
    const clipboard = createAssemblyClipboard(sceneData, selection);
    if (!clipboard) {
      setCompositionStatus("Nothing selected to copy.");
      return;
    }
    clipboardRef.current = clipboard;
    const text = serializeAssemblyClipboard(clipboard);
    try {
      if (electron?.writeClipboardText) await electron.writeClipboardText(text);
      else await navigator.clipboard?.writeText(text);
    } catch {
      // The in-memory clipboard remains available when browser permissions deny access.
    }
    setCompositionStatus("Selection copied.");
  }, [electron, sceneData, selection]);

  const beginPaste = useCallback(async () => {
    let clipboard: AssemblyClipboard | null = null;
    try {
      const text = electron?.readClipboardText
        ? await electron.readClipboardText()
        : await navigator.clipboard?.readText();
      if (text) clipboard = parseAssemblyClipboard(text);
    } catch {
      // Fall back to the last assembly copied in this renderer.
    }
    clipboard ??= clipboardRef.current;
    if (!clipboard) {
      setCompositionStatus("Clipboard does not contain a Strutz assembly.");
      return;
    }
    setPasteAssembly(prepareAssemblyPaste(clipboard, activeLayerId));
    setPanelPreviewSide(null);
    setCompositionStatus(null);
  }, [activeLayerId, electron]);

  const commitPaste = useCallback((assembly: SceneData) => {
    setSceneData((scene) => mergeAssemblyIntoScene(scene, assembly));
    const next = selectionForAssembly(assembly);
    setSelectedNodeIds(next.nodeIds);
    setSelectedStrutIds(next.strutIds);
    setSelectedPanelIds(next.panelIds);
    setSelectedWidgetIds(next.widgetIds);
    setPasteAssembly(null);
    setCompositionStatus("Assembly placed.");
  }, [setSceneData]);

  useEffect(() => {
    if (!compositionStatus) return;
    const timeout = window.setTimeout(() => setCompositionStatus(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [compositionStatus]);
  const panelActionState = useMemo(
    () => getPanelActionState(sceneData, selectedStrutIdList),
    [sceneData, selectedStrutIdList],
  );

  const addSelectedPanel = useCallback((side: "top" | "bottom") => {
    setPanelPreviewSide(null);
    setSceneData((scene) => {
      const panel = createPanelFromStruts(scene, selectedStrutIdList, side);
      return panel ? addPanelToScene(scene, { ...panel, layerId: activeLayerId }) : scene;
    });
  }, [activeLayerId, selectedStrutIdList, setSceneData]);

  const createLayer = useCallback(() => {
    const nextLayerId = crypto.randomUUID();
    setSceneData((scene) => createLayerInScene(scene, undefined, nextLayerId).scene);
    setActiveLayerId(nextLayerId);
  }, [setSceneData]);

  const toggleLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    const replacement = !visible && activeLayerId === layerId
      ? sceneData.layers?.find((layer) => layer.id !== layerId && layer.visible)
      : undefined;
    setSceneData((scene) => {
      let next = setLayerVisibilityInScene(scene, layerId, visible);
      if (!visible && activeLayerId === layerId && !replacement) {
        next = setLayerVisibilityInScene(next, DEFAULT_LAYER_ID, true);
      }
      return next;
    });
    if (!visible) {
      const hiddenNodes = new Set(Object.values(sceneData.nodes)
        .filter((part) => getPartLayerId(part) === layerId).map((part) => part.id));
      const hiddenStruts = new Set(Object.values(sceneData.struts)
        .filter((part) => getPartLayerId(part) === layerId).map((part) => part.id));
      const hiddenPanels = new Set(Object.values(sceneData.panels)
        .filter((part) => getPartLayerId(part) === layerId).map((part) => part.id));
      const hiddenWidgets = new Set(Object.values(sceneData.widgets)
        .filter((part) => getPartLayerId(part) === layerId).map((part) => part.id));
      setSelectedNodeIds((ids) => new Set([...ids].filter((id) => !hiddenNodes.has(id))));
      setSelectedStrutIds((ids) => new Set([...ids].filter((id) => !hiddenStruts.has(id))));
      setSelectedPanelIds((ids) => new Set([...ids].filter((id) => !hiddenPanels.has(id))));
      setSelectedWidgetIds((ids) => new Set([...ids].filter((id) => !hiddenWidgets.has(id))));
      if (activeLayerId === layerId) {
        if (replacement) setActiveLayerId(replacement.id);
        else setActiveLayerId(DEFAULT_LAYER_ID);
      }
    }
  }, [activeLayerId, sceneData, setSceneData]);

  const activateLayer = useCallback((layerId: string) => {
    const layer = sceneData.layers?.find((candidate) => candidate.id === layerId);
    if (layer && !layer.visible) setSceneData((scene) => setLayerVisibilityInScene(scene, layerId, true));
    setActiveLayerId(layerId);
  }, [sceneData.layers, setSceneData]);

  const selectCompleteLoop = useCallback(() => {
    const strutId = selectedStrutIdList.length === 1 ? selectedStrutIdList[0] : null;
    if (!strutId) return;
    const loop = getPanelLoopThroughStrut(sceneData, strutId);
    if (loop) setSelectedStrutIds(new Set(loop));
  }, [sceneData, selectedStrutIdList]);

  const flipSelectedPanels = useCallback(() => {
    setSceneData((scene) => {
      let result = scene;
      for (const panelId of selectedPanelIds) result = flipPanelInScene(result, panelId);
      return result;
    });
  }, [selectedPanelIds, setSceneData]);

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

  const exportStl = useCallback(() => {
    setPrintScaleInput("2");
    setPrintExportError(null);
    setPrintExportOpen(true);
  }, []);

  const confirmExportStl = useCallback(async () => {
    const scale = Number(printScaleInput);
    if (!Number.isFinite(scale) || scale <= 0) {
      setPrintExportError("Enter a print scale greater than zero.");
      return;
    }
    const exportName = fileName.replace(/\.json$/i, ".stl");
    setPrintExportError(null);
    setPrintExporting(true);
    try {
      const text = exportSceneStl(sceneData, scale);
      if (electron) await electron.exportScene({ fileName: exportName, text, type: "stl" });
      else downloadText(exportName, text, "model/stl");
      setPrintExportOpen(false);
    } catch (error) {
      setPrintExportError(error instanceof Error ? error.message : "Could not export printable STL.");
    } finally {
      setPrintExporting(false);
    }
  }, [electron, fileName, printScaleInput, sceneData]);

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
        case "export-stl":
          void exportStl();
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
        case "copy":
          void copySelection();
          break;
        case "paste":
          void beginPaste();
          break;
      }
    });
  }, [beginPaste, copySelection, electron, exportGltf, exportJson, exportObj, exportStl, newScene, open, redo, save, saveAs, undo]);

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

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelection();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void beginPaste();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [beginPaste, copySelection, newScene, open, redo, save, saveAs, undo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <input
        ref={openInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleOpenFile}
      />
      {printExportOpen && (
        <PrintExportDialog
          scene={sceneData}
          scaleInput={printScaleInput}
          error={printExportError}
          exporting={printExporting}
          onScaleInput={(value) => {
            setPrintScaleInput(value);
            setPrintExportError(null);
          }}
          onCancel={() => setPrintExportOpen(false)}
          onExport={() => void confirmExportStl()}
        />
      )}
      <AppBar
        fileName={fileName}
        status={compositionStatus}
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
        panelSelectionStatus={panelActionState.status}
        canAddOuter={panelActionState.canAddOuter}
        canAddInner={panelActionState.canAddInner}
        selectedPanelCount={selectedPanelIds.size}
        onAddOuter={() => addSelectedPanel("top")}
        onAddInner={() => addSelectedPanel("bottom")}
        onFlipPanels={flipSelectedPanels}
        canSelectLoop={panelActionState.canSelectLoop}
        onSelectLoop={selectCompleteLoop}
        onPreviewPanel={setPanelPreviewSide}
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
          selectedStrutIds={selectedStrutIds}
          setSelectedStrutIds={setSelectedStrutIds}
          selectedPanelIds={selectedPanelIds}
          setSelectedPanelIds={setSelectedPanelIds}
          selectedNodeIds={selectedNodeIds}
          setSelectedNodeIds={setSelectedNodeIds}
          selectedWidgetIds={selectedWidgetIds}
          setSelectedWidgetIds={setSelectedWidgetIds}
          activeLayerId={activeLayerId}
          pasteAssembly={pasteAssembly}
          onCancelPaste={() => setPasteAssembly(null)}
          onCommitPaste={commitPaste}
          panelPreviewSide={panelPreviewSide}
        />
        <LayersPanel
          scene={sceneData}
          activeLayerId={activeLayerId}
          hasSelection={hasSelection}
          onActivate={activateLayer}
          onToggleVisibility={toggleLayerVisibility}
          onCreate={createLayer}
          onRename={(layerId, name) => setSceneData((scene) => renameLayerInScene(scene, layerId, name))}
          onDelete={(layerId) => {
            setSceneData((scene) => {
              const deleted = deleteLayerFromScene(scene, layerId);
              return activeLayerId === layerId
                ? setLayerVisibilityInScene(deleted, DEFAULT_LAYER_ID, true)
                : deleted;
            });
            if (activeLayerId === layerId) setActiveLayerId(DEFAULT_LAYER_ID);
          }}
          onSelectContents={(layerId) => {
            const next = selectLayerContents(sceneData, layerId);
            setSelectedNodeIds(next.nodeIds);
            setSelectedStrutIds(next.strutIds);
            setSelectedPanelIds(next.panelIds);
            setSelectedWidgetIds(next.widgetIds);
          }}
          onMoveSelection={(layerId) => setSceneData((scene) =>
            assignSelectionToLayer(scene, selection, layerId))}
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
              strutDrawMode={strutDrawMode}
              onSelectTool={setActiveTool}
              onSelectStrutDrawMode={setStrutDrawMode}
            />
          </div>
          <div style={{ position: "absolute", top: 12, left: 72, pointerEvents: "auto" }}>
            <WidgetPalette
              active={activeTool === "place-widget"}
              selected={selectedWidgetKind}
              onSelect={setSelectedWidgetKind}
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
