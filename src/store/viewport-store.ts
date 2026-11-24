"use client";

import { create } from "zustand";

/** Pixels per grid cell at 100 % zoom. */
export const BASE_CELL_PX = 32;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const FIT_PADDING = 48;

export type CanvasTool = "select" | "pan";

interface ViewportState {
  /** Zoom factor relative to BASE_CELL_PX. */
  scale: number;
  /** Screen-space offset of grid origin (top-left of cell 0,0), in CSS px. */
  offsetX: number;
  offsetY: number;
  viewportWidth: number;
  viewportHeight: number;
  gridWidth: number;
  gridHeight: number;
  tool: CanvasTool;
  /** True until the user zooms or pans manually; keeps the view fitted on resize. */
  autoFit: boolean;

  setViewport: (width: number, height: number) => void;
  setGrid: (width: number, height: number) => void;
  setTool: (tool: CanvasTool) => void;
  panBy: (dx: number, dy: number) => void;
  /** Zoom by a factor, keeping the screen point (ax, ay) fixed. */
  zoomBy: (factor: number, ax?: number, ay?: number) => void;
  fitToView: () => void;
  resetZoom: () => void;
  /** Pan so the centre of cell (x, y) sits in the middle of the viewport. */
  centerOn: (x: number, y: number) => void;
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const useViewportStore = create<ViewportState>()((set, get) => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  gridWidth: 0,
  gridHeight: 0,
  tool: "select",
  autoFit: true,

  setViewport: (viewportWidth, viewportHeight) => {
    set({ viewportWidth, viewportHeight });
    if (get().autoFit) get().fitToView();
  },

  setGrid: (gridWidth, gridHeight) => set({ gridWidth, gridHeight }),

  setTool: (tool) => set({ tool }),

  panBy: (dx, dy) => set((s) => ({ offsetX: s.offsetX + dx, offsetY: s.offsetY + dy, autoFit: false })),

  zoomBy: (factor, ax, ay) => {
    const s = get();
    const next = clampScale(s.scale * factor);
    if (next === s.scale) return;
    const anchorX = ax ?? s.viewportWidth / 2;
    const anchorY = ay ?? s.viewportHeight / 2;
    const ratio = next / s.scale;
    set({
      scale: next,
      offsetX: anchorX - (anchorX - s.offsetX) * ratio,
      offsetY: anchorY - (anchorY - s.offsetY) * ratio,
      autoFit: false,
    });
  },

  fitToView: () => {
    const s = get();
    if (!s.viewportWidth || !s.gridWidth) return;
    const cellFit = Math.min(
      (s.viewportWidth - FIT_PADDING * 2) / s.gridWidth,
      (s.viewportHeight - FIT_PADDING * 2) / s.gridHeight,
    );
    const scale = clampScale(cellFit / BASE_CELL_PX);
    centre(set, s, scale);
    set({ autoFit: true });
  },

  resetZoom: () => {
    centre(set, get(), 1);
    set({ autoFit: false });
  },

  centerOn: (x, y) => {
    const s = get();
    const cell = BASE_CELL_PX * s.scale;
    set({
      offsetX: Math.round(s.viewportWidth / 2 - (x + 0.5) * cell),
      offsetY: Math.round(s.viewportHeight / 2 - (y + 0.5) * cell),
      autoFit: false,
    });
  },
}));

function centre(
  set: (partial: Partial<ViewportState>) => void,
  s: ViewportState,
  scale: number,
) {
  const cell = BASE_CELL_PX * scale;
  set({
    scale,
    offsetX: Math.round((s.viewportWidth - s.gridWidth * cell) / 2),
    offsetY: Math.round((s.viewportHeight - s.gridHeight * cell) / 2),
  });
}
