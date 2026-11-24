"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { addAfterEffect, addEffect, Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { EntitySelection, GridPoint, SimulationSnapshot } from "@/types/simulation";
import { cellKindAt } from "@/engine";
import { cellRef } from "@/lib/format";
import { connectedBlock, selectionForCell } from "@/lib/inspection";
import { RACK, rackHeight } from "@/lib/scene3d/layout-to-scene";
import { readCanvasTheme } from "@/lib/render/canvas-theme";
import { frameOf, worldExtent } from "@/lib/scene3d/grid-to-world";
import { tickProgress } from "@/lib/scene3d/interpolation";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { presetPose, CameraRig } from "./camera-rig";
import { useCamera3D } from "./camera-store";
import { useHover3D } from "./hover-store";
import { BlockPickers, HoverHighlight, SelectionHighlight, selectCell } from "./inspection-layer";
import { Closures, Incidents, Reservations, Routes, Stations } from "./overlays";
import { RobotFleet } from "./robot-fleet";
import { SceneLabels } from "./scene-labels";
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
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const [quality] = useState<Quality>(detectQuality);
  // Never render above the display's own pixel ratio (the adaptive monitor may only lower it).
  const [maxDpr] = useState(() => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, MAX_DPR[quality]));
  const [dpr, setDpr] = useState(maxDpr);
  const layout = useSimulationStore((s) => s.snapshot.layout);
  const frame = useMemo(() => frameOf(layout), [layout]);
  const palette = useMemo(() => (typeof document === "undefined" ? ["#40c8e8"] : readCanvasTheme(document.documentElement).robots), []);
  const initial = useMemo(() => presetPose("isometric", frame), [frame]);
  // Small lab layouts are mostly one-cell corridors between racking: show them cut away.
  const cutawayPref = usePreferences((s) => s.rackCutaway);
  const cutaway = cutawayPref || isCorridorLayout(layout);
  const rackH = rackHeight(cutaway ? 1 : RACK.levels.length);
  const hasObstacles = useMemo(() => layout.cells.includes("obstacle"), [layout]);

  // On a new layout, return to the default view — unless a robot is being
  // followed / chased (e.g. "Focus in 3D Studio" from the Fleet page) and still exists.
  useEffect(() => {
    const { preset, robotId } = useCamera3D.getState();
    const tracking = (preset === "follow" || preset === "chase") && robotId !== null;
    const exists = tracking && useSimulationStore.getState().snapshot.robots.some((r) => r.id === robotId);
    if (exists) useCamera3D.getState().setPreset(preset, robotId);
    else useCamera3D.getState().setPreset("isometric", null);
  }, [layout]);

  // Hover readout and cursor follow the hover store imperatively (no React render per pointer move).
  useEffect(() => {
    const apply = () => {
      const out = readoutRef.current;
      const { target } = useHover3D.getState();
      if (containerRef.current) containerRef.current.style.cursor = target ? "pointer" : "";
      if (!out) return;
      const text = target ? describeHover(useSimulationStore.getState().snapshot, target) : "";
      if (text) delete out.dataset.empty;
      else out.dataset.empty = "";
      out.textContent = text;
    };
    return useHover3D.subscribe(apply);
  }, []);
  // Leaving the view clears hover.
  useEffect(() => () => useHover3D.getState().setTarget(null), []);

  const onHoverCell = (cell: GridPoint | null) => useHover3D.getState().setTarget(cell ? selectionForCell(layout, cell) : null);
  const onSelectCell = (cell: GridPoint) => selectCell(layout, cell);

  const { halfX, halfZ } = worldExtent(frame);
  const span = Math.hypot(halfX, halfZ);

  return (
    <div ref={containerRef} className={className ? `relative ${className}` : "relative"} role="application" aria-label="3D warehouse. Drag to orbit, right-drag to pan, scroll to zoom. Click a robot, rack, station or aisle cell to inspect it, double-click a robot to follow it, Escape clears the selection.">
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
        onPointerMissed={() => {
          useSimulationStore.getState().select(null);
          useHover3D.getState().setTarget(null);
        }}
      >
        <color attach="background" args={["#0b1013"]} />
        <fog attach="fog" args={["#0b1013", span * 2.2, span * 5]} />
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
        />
        <Lighting frame={frame} quality={quality} />
        <WarehouseFloor layout={layout} showGrid={usePreferencesValue("showGrid")} onSelectCell={onSelectCell} onHoverCell={onHoverCell} />
        <WarehouseRacks layout={layout} quality={quality} cutaway={cutaway} />
        <BlockPickers layout={layout} rackHeight={rackH} />
        <Stations stations={layout.stations} frame={frame} />
        <SelectionHighlight layout={layout} rackHeight={rackH} />
        <HoverHighlight layout={layout} rackHeight={rackH} />
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
        <CameraRig frame={frame} sceneHeight={Math.max(rackH, hasObstacles ? 2.6 : 0)} />
        <FrameDriver statsRef={statsRef} />
        <SceneLabels layer={labelLayerRef} />
      </Canvas>
      <div ref={labelLayerRef} aria-hidden data-perf="3d-labels" className="pointer-events-none absolute inset-0 overflow-hidden" />

      <div
        ref={readoutRef}
        data-empty=""
        aria-live="off"
        className="pointer-events-none absolute right-3 bottom-3 rounded-sm border border-line bg-background/85 px-2 py-1 font-mono text-[11px] whitespace-pre text-text-secondary data-[empty]:hidden"
      />
      <div ref={statsRef} aria-hidden data-quality={quality} data-perf="3d-stats" className="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] tracking-wide text-text-dim" />
    </div>
  );
}

/** One-line readout for whatever the pointer is over. */
function describeHover(snapshot: SimulationSnapshot, target: EntitySelection): string {
  if (target.kind === "robot") {
    const r = snapshot.robots.find((x) => x.id === target.id);
    return r ? `${r.id}  ·  ${r.status}  ·  ${cellRef(r.position)}` : "";
  }
  if (target.kind === "station") {
    const s = snapshot.layout.stations.find((x) => x.id === target.id);
    return s ? `${s.id}  ·  ${KIND_LABEL[s.kind]}  ·  ${cellRef(s.position)}` : "";
  }
  const cell = { x: target.x, y: target.y };
  const kind = cellKindAt(snapshot.layout, cell);
  if (!kind) return "";
  if (target.kind === "rack" || target.kind === "obstacle") {
    const b = connectedBlock(snapshot.layout, cell, target.kind).bounds;
    const name = target.kind === "rack" ? "Rack block" : "Obstacle";
    return `${name} ${cellRef({ x: b.x0, y: b.y0 })}–${cellRef({ x: b.x1, y: b.y1 })}  ·  bay ${cellRef(cell)}`;
  }
  const robot = snapshot.robots.find((r) => r.position.x === cell.x && r.position.y === cell.y);
  const closed = snapshot.closures.some((c) => c.cells.some((p) => p.x === cell.x && p.y === cell.y));
  return [`${cellRef(cell)}  (${cell.x}, ${cell.y})`, KIND_LABEL[kind], closed ? "closed" : null, robot?.id].filter(Boolean).join("  ·  ");
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
      <RobotFleet snapshot={snapshot} palette={palette} />
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
  // Main-thread cost of each rendered frame (useFrame callbacks + scene submission), in ms.
  const cost = useRef({ start: 0, samples: [] as number[] });

  useEffect(() => {
    const unsubs = [useSimulationStore.subscribe(() => invalidate()), usePreferences.subscribe(() => invalidate()), useCamera3D.subscribe(() => invalidate())];
    const c = cost.current;
    unsubs.push(
      addEffect(() => {
        c.start = performance.now();
      }),
      addAfterEffect(() => {
        if (c.start) c.samples.push(performance.now() - c.start);
        c.start = 0;
      }),
    );
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
      const el = statsRef.current;
      const { render, memory, programs } = gl.info;
      el.textContent = `${fps.toFixed(0)} FPS · worst ${s.worst.toFixed(0)} ms · ${render.calls} draw calls · ${gl.getPixelRatio().toFixed(2)}× DPR`;
      // Renderer counters for the performance harness (tests/perf); read-only diagnostics.
      el.dataset.calls = String(render.calls);
      el.dataset.triangles = String(render.triangles);
      el.dataset.geometries = String(memory.geometries);
      el.dataset.textures = String(memory.textures);
      el.dataset.programs = String(programs?.length ?? 0);
      const samples = cost.current.samples.sort((a, b) => a - b);
      if (samples.length) {
        el.dataset.cpuMean = (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3);
        el.dataset.cpuP95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))].toFixed(3);
      }
      cost.current.samples = [];
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
