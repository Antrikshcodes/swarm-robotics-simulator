"use client";

import { useCallback, useRef } from "react";
import type { SimulationSnapshot } from "@/types/simulation";
import type { RenderView } from "@/lib/render/warehouse-renderer";
import { cn } from "@/lib/utils";
import { useWarehouseRenderer } from "./use-warehouse-renderer";

const PREVIEW_OVERRIDES = { showCoordinates: false, showLabels: false, showGrid: true } as const;

/** Read-only, auto-fitted render of the live snapshot. */
export function WarehousePreview({ className, label }: { className?: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resolveView = useCallback(
    ({ width, height }: { width: number; height: number }, snapshot: SimulationSnapshot): RenderView => {
      const pad = 12;
      const cell = Math.max(
        4,
        Math.min((width - pad * 2) / snapshot.layout.width, (height - pad * 2) / snapshot.layout.height),
      );
      return {
        cell,
        offsetX: (width - snapshot.layout.width * cell) / 2,
        offsetY: (height - snapshot.layout.height * cell) / 2,
        width,
        height,
      };
    },
    [],
  );

  useWarehouseRenderer({ containerRef, canvasRef, resolveView, overrides: PREVIEW_OVERRIDES });

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0" />
    </div>
  );
}
