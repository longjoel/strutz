import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import * as THREE from "three";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { StrutDrawMode, Tool } from "./types";
import type { SceneData, WidgetKind } from "../core/types";
import { Scene } from "./Scene";
import { matchCameraView, moveOrbitFocus, type CameraMode } from "./camera";
import { CONSTRUCTION_GRID_Y } from "./viewportConfig";
import type { AssemblyClipboard } from "../core/composition";

interface ViewportProps {
  activeTool: Tool;
  selectedWidgetKind: WidgetKind;
  strutDrawMode: StrutDrawMode;
  sceneData: SceneData;
  setSceneData: Dispatch<SetStateAction<SceneData>>;
  cameraMode: CameraMode;
  followSelection: boolean;
  onCameraModeChange: (mode: CameraMode) => void;
  selectedStrutIds: Set<string>;
  setSelectedStrutIds: Dispatch<SetStateAction<Set<string>>>;
  selectedPanelIds: Set<string>;
  setSelectedPanelIds: Dispatch<SetStateAction<Set<string>>>;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  selectedWidgetIds: Set<string>;
  setSelectedWidgetIds: Dispatch<SetStateAction<Set<string>>>;
  activeLayerId: string;
  pasteAssembly: AssemblyClipboard | null;
  onCancelPaste: () => void;
  onCommitPaste: (assembly: SceneData) => void;
  panelPreviewSide: "top" | "bottom" | null;
}

export function Viewport({
  activeTool,
  selectedWidgetKind,
  strutDrawMode,
  sceneData,
  setSceneData,
  cameraMode,
  followSelection,
  onCameraModeChange,
  selectedStrutIds,
  setSelectedStrutIds,
  selectedPanelIds,
  setSelectedPanelIds,
  selectedNodeIds,
  setSelectedNodeIds,
  selectedWidgetIds,
  setSelectedWidgetIds,
  activeLayerId,
  pasteAssembly,
  onCancelPaste,
  onCommitPaste,
  panelPreviewSide,
}: ViewportProps) {
  const [perspectiveCamera, setPerspectiveCamera] = useState<THREE.PerspectiveCamera | null>(null);
  const [orthographicCamera, setOrthographicCamera] = useState<THREE.OrthographicCamera | null>(null);
  const perspectiveRef = useRef<THREE.PerspectiveCamera>(null);
  const orthographicRef = useRef<THREE.OrthographicCamera>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const focusTargetRef = useRef(new THREE.Vector3());
  const previousCameraModeRef = useRef(cameraMode);

  const registerPerspectiveCamera = useCallback((camera: THREE.PerspectiveCamera | null) => {
    perspectiveRef.current = camera;
    setPerspectiveCamera(camera);
  }, []);

  const registerOrthographicCamera = useCallback((camera: THREE.OrthographicCamera | null) => {
    orthographicRef.current = camera;
    setOrthographicCamera(camera);
  }, []);

  const focusCamera = useCallback((point: { x: number; y: number; z: number }) => {
    if (!followSelection) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const target = new THREE.Vector3(point.x, point.y, point.z);
    moveOrbitFocus(controls, target);
    focusTargetRef.current.copy(target);
  }, [followSelection]);

  useLayoutEffect(() => {
    const previousMode = previousCameraModeRef.current;
    if (previousMode === cameraMode) return;
    const source = previousMode === "perspective" ? perspectiveRef.current : orthographicRef.current;
    const destination = cameraMode === "perspective" ? perspectiveRef.current : orthographicRef.current;
    const controls = controlsRef.current;
    if (source && destination) {
      const viewportHeight = controls?.domElement?.clientHeight ?? 1;
      matchCameraView(source, destination, focusTargetRef.current, viewportHeight);
    }
    previousCameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() !== "o") return;
      event.preventDefault();
      onCameraModeChange(cameraMode === "perspective" ? "orthographic" : "perspective");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cameraMode, onCameraModeChange]);

  const activeCamera = cameraMode === "perspective" ? perspectiveCamera : orthographicCamera;

  return (
    <div
      style={{ flex: 1, position: "relative" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows
        camera={{ position: [10, 8, 10], fov: 50 }}
        style={{ background: "#0b1d35" }}
        gl={{ antialias: true }}
      >
        <PerspectiveCamera
          ref={registerPerspectiveCamera}
          makeDefault={cameraMode === "perspective"}
          position={INITIAL_CAMERA_POSITION}
          fov={50}
          near={0.1}
          far={5000}
        />
        <OrthographicCamera
          ref={registerOrthographicCamera}
          makeDefault={cameraMode === "orthographic"}
          position={INITIAL_CAMERA_POSITION}
          zoom={50}
          near={-5000}
          far={5000}
        />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <hemisphereLight args={["#87ceeb", "#362d1b", 0.3]} />

        <Grid
          args={[1, 1]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#aebdcb"
          sectionSize={4}
          sectionThickness={1.2}
          sectionColor="#6883a0"
          fadeDistance={100}
          infiniteGrid
          followCamera
          position={[0.5, CONSTRUCTION_GRID_Y, 0.5]}
        />

        <Scene
          activeTool={activeTool}
          selectedWidgetKind={selectedWidgetKind}
          strutDrawMode={strutDrawMode}
          sceneData={sceneData}
          setSceneData={setSceneData}
          onFocusPoint={focusCamera}
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
          onCancelPaste={onCancelPaste}
          onCommitPaste={onCommitPaste}
          panelPreviewSide={panelPreviewSide}
        />

        <OrbitControls
          ref={controlsRef}
          camera={activeCamera ?? undefined}
          target={focusTargetRef.current.toArray()}
          onChange={() => {
            if (controlsRef.current) focusTargetRef.current.copy(controlsRef.current.target);
          }}
          makeDefault
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <GizmoHelper alignment="top-right" margin={[96, 96]}>
          <GizmoViewport axisColors={["#e94560", "#4ecca3", "#3498db"]} labelColor="#e0e0e0" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}

const INITIAL_CAMERA_POSITION: [number, number, number] = [10, 8, 10];
