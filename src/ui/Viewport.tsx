import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import type { Dispatch, SetStateAction } from "react";
import type { StrutDrawMode, Tool } from "./types";
import type { SceneData, WidgetKind } from "../core/types";
import { Scene } from "./Scene";

interface ViewportProps {
  activeTool: Tool;
  selectedWidgetKind: WidgetKind;
  strutDrawMode: StrutDrawMode;
  sceneData: SceneData;
  setSceneData: Dispatch<SetStateAction<SceneData>>;
}

export function Viewport({ activeTool, selectedWidgetKind, strutDrawMode, sceneData, setSceneData }: ViewportProps) {
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
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <hemisphereLight args={["#87ceeb", "#362d1b", 0.3]} />

        <Grid
          args={[40, 40]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#aebdcb"
          sectionSize={4}
          sectionThickness={1.2}
          sectionColor="#6883a0"
          fadeDistance={40}
          position={[0.5, 0, 0.5]}
        />

        <Scene
          activeTool={activeTool}
          selectedWidgetKind={selectedWidgetKind}
          strutDrawMode={strutDrawMode}
          sceneData={sceneData}
          setSceneData={setSceneData}
        />

        <OrbitControls
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
