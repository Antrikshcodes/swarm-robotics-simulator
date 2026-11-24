"use client";

import dynamic from "next/dynamic";
import { usePreferences } from "@/store/preferences-store";
import { CanvasToolbar } from "./canvas-toolbar";
import { Inspector } from "./inspector";
import { MetricsStrip } from "./metrics-strip";
import { PlaybackBar } from "./playback-bar";
import { useStudioShortcuts } from "./use-studio-shortcuts";
import { WarehouseCanvas } from "./warehouse-canvas";

// The 3D view (Three.js / React Three Fiber) loads on demand, client-only.
const Warehouse3D = dynamic(() => import("./scene3d/warehouse-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background font-mono text-[11px] tracking-[0.16em] text-text-dim uppercase">
      Loading 3D warehouse…
    </div>
  ),
});

/**
 * Simulation Studio workspace.
 *
 *  ┌ metrics strip ───────────────────────────────┐
 *  │ toolbar (3D | 2D)              │             │
 *  │ 3D warehouse · or 2D grid      │  inspector  │
 *  ├ playback · timeline · events ──┴─────────────┤
 *
 * Both views are visualizations of the same engine snapshot.
 */
export function SimulationStudio() {
  useStudioShortcuts();
  const view = usePreferences((s) => s.studioView);

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      <MetricsStrip />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[420px] min-w-0 flex-1 flex-col">
          <CanvasToolbar />
          {view === "3d" ? <Warehouse3D className="min-h-0 flex-1 bg-background" /> : <WarehouseCanvas className="min-h-0 flex-1 bg-background" />}
        </div>
        <Inspector />
      </div>
      <PlaybackBar />
    </div>
  );
}
