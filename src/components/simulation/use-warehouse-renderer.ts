"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { GridPoint, SimulationSnapshot } from "@/types/simulation";
import { readCanvasTheme, type CanvasTheme } from "@/lib/render/canvas-theme";
import { drawWarehouse, type RenderOptions, type RenderView } from "@/lib/render/warehouse-renderer";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Params {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Map container size + snapshot to a view transform. Called every frame. */
  resolveView: (size: Size, snapshot: SimulationSnapshot) => RenderView;
  /** Override preference-driven render options (e.g. compact preview). */
  overrides?: Partial<RenderOptions>;
  hoverRef?: RefObject<GridPoint | null>;
  onResize?: (size: Size) => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Drives Canvas drawing outside React's render cycle.
 *
 * Frames are drawn on demand: any store change marks the canvas dirty, and
 * frames keep coming only while a robot is mid-interpolation. React never
 * re-renders per frame.
 */
export function useWarehouseRenderer({ containerRef, canvasRef, resolveView, overrides, hoverRef, onResize }: Params) {
  const frame = useRef<number | null>(null);
  const size = useRef<Size>({ width: 0, height: 0 });
  const theme = useRef<CanvasTheme | null>(null);
  const progressRef = useRef(1);
  const latest = useRef({ resolveView, overrides, onResize });

  useEffect(() => {
    latest.current = { resolveView, overrides, onResize };
  });

  const currentProgress = useCallback((): number => {
    const sim = useSimulationStore.getState();
    const prefs = usePreferences.getState();
    if (!prefs.interpolateMotion || prefersReducedMotion() || sim.steppedAt === 0) return 1;
    const duration = prefs.tickMs / sim.speed;
    return Math.min(1, (performance.now() - sim.steppedAt) / duration);
  }, []);

  const drawRef = useRef<() => void>(() => {});

  const invalidate = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  useEffect(() => {
    drawRef.current = () => {
      frame.current = null;
      const canvas = canvasRef.current;
      const { width, height } = size.current;
      if (!canvas || width === 0 || height === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      theme.current ??= readCanvasTheme(canvas);

      const sim = useSimulationStore.getState();
      const prefs = usePreferences.getState();
      const progress = currentProgress();
      progressRef.current = progress;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const options: RenderOptions = {
        showGrid: prefs.showGrid,
        showCoordinates: prefs.showCoordinates,
        showRoutes: prefs.showRoutes,
        showLabels: prefs.showLabels,
        showReservations: prefs.showReservations,
        showWaitLinks: prefs.showWaitLinks,
        selection: sim.selection,
        hover: hoverRef?.current ?? null,
        progress,
        ...latest.current.overrides,
      };
      drawWarehouse(ctx, sim.snapshot, latest.current.resolveView(size.current, sim.snapshot), theme.current, options);

      // Keep animating only while robots are between cells.
      if (progress < 1) invalidate();
    };
  }, [canvasRef, currentProgress, hoverRef, invalidate]);

  // Resize + DPR handling.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      size.current = { width, height };
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      latest.current.onResize?.(size.current);
      invalidate();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, canvasRef, invalidate]);

  // Redraw on any relevant state change.
  useEffect(() => {
    const unsubs = [
      useSimulationStore.subscribe(invalidate),
      usePreferences.subscribe(invalidate),
      useViewportStore.subscribe(invalidate),
    ];
    invalidate();
    return () => {
      unsubs.forEach((u) => u());
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [invalidate]);

  return { invalidate, getProgress: () => progressRef.current };
}
