import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import type { Tool } from "./types";
import { Scene } from "./Scene";

interface ViewportProps {
  activeTool: Tool;
}

export function Viewport({ activeTool }: ViewportProps) {
  return (
    <div
      style={{ flex: 1, position: "relative" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows
        camera={{ position: [10, 8, 10], fov: 50 }}
        style={{ background: "#1a1a2e" }}
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
          cellColor="#304060"
          sectionSize={4}
          sectionThickness={1.2}
          sectionColor="#0f3460"
          fadeDistance={40}
          position={[0.5, 0, 0.5]}
        />

        <Scene activeTool={activeTool} />

        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <GizmoHelper alignment="bottom-right" margin={[100, 100]}>
          <GizmoViewport axisColors={["#e94560", "#4ecca3", "#3498db"]} labelColor="#e0e0e0" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
