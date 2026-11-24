"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, View } from "@react-three/drei";
import { useSimulationStore } from "@/store/simulation-store";
import {
  createRobotMaterials,
  disposeRobotMaterials,
  RobotModel,
  setEyes,
  spinWheels,
  STATUS_COLOR,
} from "@/components/simulation/scene3d/robot-model";

/**
 * Live 3D robot portraits for the Fleet page.
 *
 * One WebGL canvas (PortraitCanvas) sits over the page content; every
 * portrait is a drei <View> — a scissored region of that canvas tracking a
 * DOM element — so eight cards cost one context, not eight. Rendering is on
 * demand: a frame is drawn on scroll, resize, engine state change, or while
 * a card is hovered. The robot is the same model the 3D Simulation Studio
 * uses (scene3d/robot-model).
 */

export const usePortraitHover = create<{ hovered: string | null; changedAt: number; setHovered: (id: string | null) => void }>()((set) => ({
  hovered: null,
  changedAt: 0,
  setHovered: (hovered) => set({ hovered, changedAt: performance.now() }),
}));

/** The shared canvas. Mount once, absolutely positioned over the scrolling page body. */
export function PortraitCanvas() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <Canvas
        // R3F's wrapper defaults to pointer-events: auto; the portraits are decorative,
        // so clicks and hovers must pass through to the cards underneath.
        style={{ pointerEvents: "none" }}
        frameloop="demand"
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <View.Port />
        <Invalidator />
      </Canvas>
    </div>
  );
}

/** Requests frames when something visible changes (views must follow their cards while scrolling). */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const request = () => invalidate();
    window.addEventListener("scroll", request, { capture: true, passive: true });
    window.addEventListener("resize", request);
    const unsubs = [useSimulationStore.subscribe(request), usePortraitHover.subscribe(request)];
    // Cards can move without a scroll (filters, layout changes): watch the page body.
    const observer = new ResizeObserver(request);
    const main = document.getElementById("main");
    if (main) observer.observe(main.firstElementChild ?? main);
    request();
    return () => {
      window.removeEventListener("scroll", request, { capture: true });
      window.removeEventListener("resize", request);
      unsubs.forEach((u) => u());
      observer.disconnect();
    };
  }, [invalidate]);
  useFrame(() => {
    // Keep animating while a card is hovered, and briefly after, while it settles back.
    const { hovered, changedAt } = usePortraitHover.getState();
    if (hovered || performance.now() - changedAt < 600) invalidate();
  });
  return null;
}

/** A front-facing portrait of one robot. Place inside a positioned box. */
export function RobotPortrait({ robotId, accent, className, framing = "card" }: { robotId: string; accent: string; className?: string; framing?: "card" | "detail" }) {
  return (
    <View className={className}>
      <PortraitScene robotId={robotId} accent={accent} framing={framing} />
    </View>
  );
}

function PortraitScene({ robotId, accent, framing }: { robotId: string; accent: string; framing: "card" | "detail" }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lidar = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const cargo = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const materials = useMemo(() => createRobotMaterials(accent), [accent]);
  useEffect(() => () => disposeRobotMaterials(materials), [materials]);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#40c8e8", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const anim = useRef({ boost: 0, key: "" });

  useFrame((state, delta) => {
    const robot = useSimulationStore.getState().snapshot.robots.find((r) => r.id === robotId);
    if (!robot) return;
    const hovered = usePortraitHover.getState().hovered === robotId;
    const a = anim.current;
    a.boost += ((hovered ? 1 : 0) - a.boost) * (1 - Math.exp(-delta * 8));
    setEyes(materials, robot.status, a.boost);
    if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.18 * a.boost;

    const key = `${robot.status}|${robot.packageId}`;
    if (key !== a.key) {
      a.key = key;
      materials.status.color.set(STATUS_COLOR[robot.status]);
      if (cargo.current) cargo.current.visible = robot.packageId !== null;
    }
    const operational = robot.status !== "failed" && robot.status !== "recovering";
    if (hovered && operational) {
      if (lidar.current) lidar.current.rotation.y += delta * 4;
      spinWheels(wheels.current, -delta * 2);
    }
    if (root.current) {
      const t = state.clock.elapsedTime;
      root.current.rotation.y = Math.sin(t * 0.8) * 0.12 * a.boost;
      root.current.position.y = Math.sin(t * 2.4) * 0.006 * a.boost;
    }
  });

  // Three-quarter front view; the card framing leaves room for the ID and status overlays.
  const camera = framing === "detail" ? { position: [0.7, 0.62, -1.75] as const, fov: 30 } : { position: [0.66, 0.66, -2.15] as const, fov: 30 };

  return (
    <>
      <PerspectiveCamera makeDefault position={camera.position} fov={camera.fov} near={0.05} far={20} onUpdate={(c) => c.lookAt(0, framing === "detail" ? 0.22 : 0.3, 0)} />
      <hemisphereLight args={["#e6eef2", "#1a2125", 1.1]} />
      <directionalLight position={[1.2, 2.2, -1.6]} intensity={1.8} />
      <directionalLight position={[-1.5, 1, 1.5]} intensity={0.6} color="#40c8e8" />
      <pointLight position={[0, 0.4, -0.9]} intensity={0.4} distance={2} color={accent} />
      {/* Floor: soft contact shadow and a hover glow ring. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.45} depthWrite={false} />
      </mesh>
      <mesh ref={glow} rotation-x={-Math.PI / 2} position-y={0.002} material={glowMat}>
        <ringGeometry args={[0.5, 0.56, 64]} />
      </mesh>
      <group ref={root}>
        <RobotModel materials={materials} bodyRef={body} lidarRef={lidar} wheelsRef={wheels} cargoRef={cargo} />
      </group>
    </>
  );
}
