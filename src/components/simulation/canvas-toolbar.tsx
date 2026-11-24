"use client";

import {
  Grid3x3,
  Hand,
  Maximize,
  MousePointer2,
  Route,
  Ruler,
  Tag,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { usePreferences } from "@/store/preferences-store";
import { useViewportStore } from "@/store/viewport-store";
import { ScenarioSelect } from "./scenario-select";

const ZOOM_STEP = 1.25;

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}

export function CanvasToolbar() {
  const tool = useViewportStore((s) => s.tool);
  const scale = useViewportStore((s) => s.scale);
  const { setTool, zoomBy, fitToView, resetZoom } = useViewportStore.getState();
  const showGrid = usePreferences((s) => s.showGrid);
  const showRoutes = usePreferences((s) => s.showRoutes);
  const showLabels = usePreferences((s) => s.showLabels);
  const showCoordinates = usePreferences((s) => s.showCoordinates);
  const toggle = usePreferences((s) => s.toggle);

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-sidebar/70 px-2"
    >
      <ScenarioSelect compact className="mr-1.5" />
      <Divider />
      <IconButton label="Select" shortcut="V" active={tool === "select"} onClick={() => setTool("select")}>
        <MousePointer2 />
      </IconButton>
      <IconButton label="Pan" shortcut="H" active={tool === "pan"} onClick={() => setTool("pan")}>
        <Hand />
      </IconButton>
      <Divider />
      <IconButton label="Zoom out" shortcut="−" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={scale <= 0.25}>
        <ZoomOut />
      </IconButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={resetZoom}
            aria-label={`Zoom ${Math.round(scale * 100)} percent. Reset to 100 percent`}
            className="tabular h-7 w-14 rounded-md font-mono text-[11px] text-text-secondary outline-none hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Math.round(scale * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          Reset zoom to 100% <Kbd>0</Kbd>
        </TooltipContent>
      </Tooltip>
      <IconButton label="Zoom in" shortcut="+" onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= 4}>
        <ZoomIn />
      </IconButton>
      <IconButton label="Fit to view" shortcut="F" onClick={fitToView}>
        <Maximize />
      </IconButton>
      <Divider />
      <IconButton label="Grid" shortcut="G" active={showGrid} onClick={() => toggle("showGrid")}>
        <Grid3x3 />
      </IconButton>
      <IconButton label="Coordinates" shortcut="C" active={showCoordinates} onClick={() => toggle("showCoordinates")}>
        <Ruler />
      </IconButton>
      <IconButton label="Routes" shortcut="P" active={showRoutes} onClick={() => toggle("showRoutes")}>
        <Route />
      </IconButton>
      <IconButton label="Robot labels" shortcut="L" active={showLabels} onClick={() => toggle("showLabels")}>
        <Tag />
      </IconButton>
    </div>
  );
}
