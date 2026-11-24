"use client";

import { CanvasToolbar } from "./canvas-toolbar";
import { Inspector } from "./inspector";
import { MetricsStrip } from "./metrics-strip";
import { PlaybackBar } from "./playback-bar";
import { useStudioShortcuts } from "./use-studio-shortcuts";
import { WarehouseCanvas } from "./warehouse-canvas";

/**
 * Simulation Studio workspace.
 *
 *  ┌ metrics strip ───────────────────────────────┐
 *  │ toolbar                        │             │
 *  │ warehouse canvas               │  inspector  │
 *  ├ playback · timeline · events ──┴─────────────┤
 */
export function SimulationStudio() {
  useStudioShortcuts();

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      <MetricsStrip />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[420px] min-w-0 flex-1 flex-col">
          <CanvasToolbar />
          <WarehouseCanvas className="min-h-0 flex-1 bg-background" />
        </div>
        <Inspector />
      </div>
      <PlaybackBar />
    </div>
  );
}
