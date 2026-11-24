"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GridPoint, SimulationSnapshot } from "@/types/simulation";
import { cellKindAt, stationAt } from "@/engine";
import {
  hitTest,
  RULER_LEFT,
  RULER_TOP,
  screenToCell,
  type RenderView,
} from "@/lib/render/warehouse-renderer";
import { cellRef } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { BASE_CELL_PX, useViewportStore } from "@/store/viewport-store";
import { useWarehouseRenderer } from "./use-warehouse-renderer";

const DRAG_THRESHOLD = 3;
const KEY_PAN = 48;

function viewFromStore(size: { width: number; height: number }): RenderView {
  const v = useViewportStore.getState();
  return { cell: BASE_CELL_PX * v.scale, offsetX: v.offsetX, offsetY: v.offsetY, width: size.width, height: size.height };
}

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
 * Interactive studio canvas: select, pan (drag / arrow keys), and
 * zoom (wheel / toolbar). All view state lives in the viewport store.
 */
export function WarehouseCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<GridPoint | null>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  const tool = useViewportStore((s) => s.tool);
  const layoutKey = useSimulationStore((s) => s.scenarioId);
  const showCoordinates = usePreferences((s) => s.showCoordinates);

  // setViewport re-fits automatically until the user zooms or pans.
  const onResize = useCallback(({ width, height }: { width: number; height: number }) => {
    useViewportStore.getState().setViewport(width, height);
  }, []);

  const resolveView = useCallback((size: { width: number; height: number }) => viewFromStore(size), []);

  const { invalidate, getProgress } = useWarehouseRenderer({
    containerRef,
    canvasRef,
    resolveView,
    hoverRef,
    onResize,
  });

  // Fit whenever a different scenario (layout) is loaded.
  useEffect(() => {
    const { layout } = useSimulationStore.getState().snapshot;
    const store = useViewportStore.getState();
    store.setGrid(layout.width, layout.height);
    store.fitToView();
  }, [layoutKey]);

  // Wheel zoom needs a non-passive listener to prevent page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      useViewportStore.getState().zoomBy(factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const updateHover = (cell: GridPoint | null, snapshot: SimulationSnapshot) => {
    const prev = hoverRef.current;
    if (prev?.x === cell?.x && prev?.y === cell?.y) return;
    hoverRef.current = cell;
    invalidate();
    const out = readoutRef.current;
    if (!out) return;
    const kind = cell ? cellKindAt(snapshot.layout, cell) : null;
    if (!cell || !kind) {
      out.textContent = "";
      out.dataset.empty = "";
      return;
    }
    delete out.dataset.empty;
    const station = stationAt(snapshot.layout, cell);
    const robot = snapshot.robots.find((r) => r.position.x === cell.x && r.position.y === cell.y);
    out.textContent = [
      `${cellRef(cell)}  (${cell.x}, ${cell.y})`,
      station ? station.id : KIND_LABEL[kind],
      robot ? robot.id : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
  };

  const localPoint = (event: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const p = localPoint(event);
    drag.current = { x: p.x, y: p.y, moved: false, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = localPoint(event);
    const d = drag.current;
    if (d && d.id === event.pointerId) {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      d.x = p.x;
      d.y = p.y;
      useViewportStore.getState().panBy(dx, dy);
      return;
    }
    const snapshot = useSimulationStore.getState().snapshot;
    const size = { width: containerRef.current!.clientWidth, height: containerRef.current!.clientHeight };
    const inRuler = showCoordinates && (p.x < RULER_LEFT || p.y < RULER_TOP);
    updateHover(inRuler ? null : screenToCell(viewFromStore(size), p.x, p.y), snapshot);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || event.button !== 0) return;
    if (useViewportStore.getState().tool !== "select") return;
    const p = localPoint(event);
    if (showCoordinates && (p.x < RULER_LEFT || p.y < RULER_TOP)) return;
    const sim = useSimulationStore.getState();
    const size = { width: containerRef.current!.clientWidth, height: containerRef.current!.clientHeight };
    sim.select(hitTest(sim.snapshot, viewFromStore(size), p.x, p.y, getProgress()));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const pan = useViewportStore.getState().panBy;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN, 0],
      ArrowRight: [-KEY_PAN, 0],
      ArrowUp: [0, KEY_PAN],
      ArrowDown: [0, -KEY_PAN],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      pan(move[0], move[1]);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Warehouse canvas. Click to select robots, stations or cells. Drag or use arrow keys to pan, scroll to zoom."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => updateHover(null, useSimulationStore.getState().snapshot)}
      onKeyDown={onKeyDown}
      className={cn(
        "relative touch-none overflow-hidden outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair",
        className,
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />
      <div
        ref={readoutRef}
        data-empty=""
        aria-live="off"
        className="pointer-events-none absolute right-3 bottom-3 rounded border border-line bg-background/85 px-2 py-1 font-mono text-[11px] whitespace-pre text-text-secondary backdrop-blur-sm data-[empty]:hidden"
      />
    </div>
  );
}
