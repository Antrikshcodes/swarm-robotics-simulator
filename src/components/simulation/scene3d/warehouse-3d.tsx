"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { GridPoint, SimulationSnapshot } from "@/types/simulation";
import { cellKindAt, stationAt } from "@/engine";
import { cellRef } from "@/lib/format";
import { readCanvasTheme } from "@/lib/render/canvas-theme";
import { frameOf, worldExtent } from "@/lib/scene3d/grid-to-world";
import { tickProgress } from "@/lib/scene3d/interpolation";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { presetPose, CameraRig } from "./camera-rig";
import { selectionSource, useCamera3D } from "./camera-store";
import { Closures, Incidents, Reservations, Routes, Stations } from "./overlays";
import { RobotFleet } from "./robot-fleet";
import { WarehouseFloor } from "./warehouse-floor";
import { WarehouseRacks } from "./warehouse-racks";

type Quality = "high" | "standard" | "low";

function detectQuality(): Quality {
  if (typeof window === "undefined") return "standard";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || window.innerWidth < 768 || cores <= 4 || memory <= 4) return "low";
  if (cores >= 8 && memory >= 8) return "high";
  return "standard";
}

const MAX_DPR: Record<Quality, number> = { high: 1.75, standard: 1.5, low: 1 };

const KIND_LABEL: Record<string, string> = {
  floor: "Open floor",
  lane: "Travel lane",
  narrow: "Narrow passage",
  rack: "Storage rack",
  obstacle: "Obstacle",
  pickup: "Pickup station",
  dropoff: "Drop-off station",
  charger: "Charging dock",
};

/**
 * The 3D Simulation Studio view. A pure visualization of the engine
 * snapshot in the simulation store — it never steps, mutates or
 * re-simulates anything. Static geometry is rebuilt only when the layout
 * changes; per-tick overlays re-render once per tick; robot motion is
 * interpolated per frame outside React.
 */
export default function Warehouse3D({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [quality] = useState<Quality>(detectQuality);
  const [dpr, setDpr] = useState(() => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, MAX_DPR[quality]));
  const layout = useSimulationStore((s) => s.snapshot.layout);
  const frame = useMemo(() => frameOf(layout), [layout]);
  const palette = useMemo(() => (typeof document === "undefined" ? ["#40c8e8"] : readCanvasTheme(document.documentElement).robots), []);
  const initial = useMemo(() => presetPose("isometric", frame), [frame]);
  // Small lab layouts are mostly one-cell corridors between racking: show them cut away.
  const cutawayPref = usePreferences((s) => s.rackCutaway);
  const cutaway = cutawayPref || isCorridorLayout(layout);

  // Reset to the default view whenever a different scenario (layout) loads.
  useEffect(() => {
    useCamera3D.getState().setPreset("isometric", null);
  }, [layout]);

  const onHoverCell = (cell: GridPoint | null) => {
    const out = readoutRef.current;
    if (!out) return;
    const snapshot = useSimulationStore.getState().snapshot;
    const kind = cell ? cellKindAt(snapshot.layout, cell) : null;
    if (!cell || !kind) {
      out.dataset.empty = "";
      out.textContent = "";
      return;
    }
    delete out.dataset.empty;
    const station = stationAt(snapshot.layout, cell);
    const robot = snapshot.robots.find((r) => r.position.x === cell.x && r.position.y === cell.y);
    out.textContent = [`${cellRef(cell)}  (${cell.x}, ${cell.y})`, station ? station.id : KIND_LABEL[kind], robot?.id].filter(Boolean).join("  ·  ");
  };

  const onSelectCell = (cell: GridPoint) => {
    const snapshot = useSimulationStore.getState().snapshot;
    const station = stationAt(snapshot.layout, cell);
    selectionSource.fromCanvas = true;
    useSimulationStore.getState().select(station ? { kind: "station", id: station.id } : { kind: "cell", x: cell.x, y: cell.y });
  };

  const { halfX, halfZ } = worldExtent(frame);
  const span = Math.hypot(halfX, halfZ);

  return (
    <div ref={containerRef} className={className ? `relative ${className}` : "relative"} role="application" aria-label="3D warehouse. Drag to orbit, right-drag to pan, scroll to zoom. Click a robot to select it, double-click to follow it.">
      <Canvas
        frameloop="demand"
        dpr={dpr}
        shadows={quality === "high"}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 40, near: 0.1, far: 400, position: initial.position.toArray() }}
        // Start already at the isometric pose; the rig then owns the camera.
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => useSimulationStore.getState().select(null)}
      >
        <color attach="background" args={["#0b1013"]} />
        <fog attach="fog" args={["#0b1013", span * 2.2, span * 5]} />
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(MAX_DPR[quality], d + 0.25))}
        />
        <Lighting frame={frame} quality={quality} />
        <WarehouseFloor layout={layout} showGrid={usePreferencesValue("showGrid")} onSelectCell={onSelectCell} onHoverCell={onHoverCell} />
        <WarehouseRacks layout={layout} quality={quality} cutaway={cutaway} />
        <Stations stations={layout.stations} frame={frame} showLabels={usePreferencesValue("showLabels")} />
        <LiveLayers palette={palette} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.09}
          minDistance={2.5}
          maxDistance={span * 3}
          maxPolarAngle={Math.PI * 0.46}
          screenSpacePanning={false}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        />
        <CameraRig frame={frame} />
        <FrameDriver statsRef={statsRef} />
      </Canvas>

      <div
        ref={readoutRef}
        data-empty=""
        aria-live="off"
        className="pointer-events-none absolute right-3 bottom-3 rounded-sm border border-line bg-background/85 px-2 py-1 font-mono text-[11px] whitespace-pre text-text-secondary data-[empty]:hidden"
      />
      <div ref={statsRef} aria-hidden className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] tracking-wide text-text-dim" />
    </div>
  );
}

/** Subscribe to one preference (keeps the Canvas root from re-rendering on unrelated changes). */
function usePreferencesValue(key: "showGrid" | "showLabels" | "showRoutes" | "showReservations" | "showWaitLinks"): boolean {
  return usePreferences((s) => s[key]);
}

/** Per-tick overlays: re-render once per engine tick (not per frame). */
function LiveLayers({ palette }: { palette: readonly string[] }) {
  const snapshot: SimulationSnapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const showRoutes = usePreferencesValue("showRoutes");
  const showReservations = usePreferencesValue("showReservations");
  const showWaitLinks = usePreferencesValue("showWaitLinks");
  const showLabels = usePreferencesValue("showLabels");
  const selectedId = selection?.kind === "robot" ? selection.id : null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [snapshot, selection, showRoutes, showReservations, showWaitLinks, showLabels, invalidate]);
  return (
    <group>
      <Closures snapshot={snapshot} />
      {showReservations ? <Reservations snapshot={snapshot} palette={palette} selectedId={selectedId} /> : null}
      {showRoutes ? <Routes snapshot={snapshot} palette={palette} selectedId={selectedId} /> : null}
      <Incidents snapshot={snapshot} showWaitLinks={showWaitLinks} />
      <RobotFleet snapshot={snapshot} palette={palette} showLabels={showLabels} />
    </group>
  );
}

function Lighting({ frame, quality }: { frame: ReturnType<typeof frameOf>; quality: Quality }) {
  const { halfX, halfZ } = worldExtent(frame);
  const span = Math.max(halfX, halfZ);
  return (
    <group>
      <hemisphereLight args={["#dfe7ec", "#2a3136", 1.15]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[span * 0.6, span * 1.2, span * 0.45]}
        intensity={1.6}
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-halfX - 2}
        shadow-camera-right={halfX + 2}
        shadow-camera-top={halfZ + 2}
        shadow-camera-bottom={-halfZ - 2}
        shadow-camera-near={1}
        shadow-camera-far={span * 4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-span, span * 0.6, -span * 0.8]} intensity={0.35} color="#9fc6d8" />
    </group>
  );
}

/**
 * Demand-driven frame loop: frames are requested only while something moves
 * (simulation running, a robot between cells, the camera gliding). It also
 * writes a small FPS / draw-call readout without React state.
 */
function FrameDriver({ statsRef }: { statsRef: React.RefObject<HTMLDivElement | null> }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const stats = useRef({ frames: 0, since: 0, worst: 0, last: 0 });

  useEffect(() => {
    const unsubs = [useSimulationStore.subscribe(() => invalidate()), usePreferences.subscribe(() => invalidate()), useCamera3D.subscribe(() => invalidate())];
    return () => unsubs.forEach((u) => u());
  }, [invalidate]);

  useFrame(() => {
    const sim = useSimulationStore.getState();
    const prefs = usePreferences.getState();
    const now = performance.now();
    const progress = tickProgress({ steppedAt: sim.steppedAt, tickMs: prefs.tickMs, speed: sim.speed, interpolate: prefs.interpolateMotion }, now);
    const { preset } = useCamera3D.getState();
    if (sim.status === "running" || progress < 1 || preset === "follow" || preset === "chase") invalidate();

    const s = stats.current;
    if (s.since === 0) {
      s.since = now;
      s.last = now;
    }
    s.frames += 1;
    s.worst = Math.max(s.worst, now - s.last);
    s.last = now;
    if (now - s.since >= 1000 && statsRef.current) {
      const fps = (s.frames * 1000) / (now - s.since);
      statsRef.current.textContent = `${fps.toFixed(0)} FPS · worst ${s.worst.toFixed(0)} ms · ${gl.info.render.calls} draw calls · ${gl.getPixelRatio().toFixed(2)}× DPR`;
      s.frames = 0;
      s.since = now;
      s.worst = 0;
    }
  });
  return null;
}

/**
 * Layouts where open space is almost all one-cell corridors (the deadlock /
 * recovery labs): full-height racks would hide every robot, so the racks are
 * cut away by default.
 */
export function isCorridorLayout(layout: { width: number; height: number }): boolean {
  return layout.width * layout.height <= 200;
}
