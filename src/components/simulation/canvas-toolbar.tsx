"use client";

import {
  CalendarClock,
  Grid3x3,
  Link2,
  Hand,
  Layers2,
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
import { useSimulationStore } from "@/store/simulation-store";
import { cn } from "@/lib/utils";
import { useCamera3D, type CameraPreset } from "./scene3d/camera-store";
import { useViewportStore } from "@/store/viewport-store";
import { ScenarioSelect } from "./scenario-select";
import { CoordinationChip } from "./coordination-chip";

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
  const showReservations = usePreferences((s) => s.showReservations);
  const showWaitLinks = usePreferences((s) => s.showWaitLinks);
  const toggle = usePreferences((s) => s.toggle);
  const view = usePreferences((s) => s.studioView);
  const is3d = view === "3d";
  const rackCutaway = usePreferences((s) => s.rackCutaway);

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-sidebar/70 px-2"
    >
      <ScenarioSelect compact className="mr-1.5" />
      <ViewSwitch />
      <Divider />
      {is3d ? (
        <>
          <CameraPresets />
          <Divider />
          <IconButton label="Rack cutaway (first level only)" shortcut="K" active={rackCutaway} onClick={() => toggle("rackCutaway")}>
            <Layers2 />
          </IconButton>
        </>
      ) : (
        <>
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
        </>
      )}
      <Divider />
      <IconButton label="Grid" shortcut="G" active={showGrid} onClick={() => toggle("showGrid")}>
        <Grid3x3 />
      </IconButton>
      {is3d ? null : (
        <IconButton label="Coordinates" shortcut="C" active={showCoordinates} onClick={() => toggle("showCoordinates")}>
          <Ruler />
        </IconButton>
      )}
      <IconButton label="Routes" shortcut="P" active={showRoutes} onClick={() => toggle("showRoutes")}>
        <Route />
      </IconButton>
      <IconButton label="Robot labels" shortcut="L" active={showLabels} onClick={() => toggle("showLabels")}>
        <Tag />
      </IconButton>
      <IconButton label="Reservations" shortcut="Y" active={showReservations} onClick={() => toggle("showReservations")}>
        <CalendarClock />
      </IconButton>
      <IconButton label="Wait-for links" shortcut="W" active={showWaitLinks} onClick={() => toggle("showWaitLinks")}>
        <Link2 />
      </IconButton>
      <CoordinationChip />
    </div>
  );
}

/** Compact 3D | 2D switch. Both views read the same engine snapshot. */
function ViewSwitch() {
  const view = usePreferences((s) => s.studioView);
  const set = usePreferences((s) => s.set);
  return (
    <div role="radiogroup" aria-label="Studio view" className="mr-1 flex h-7 items-center rounded-md border border-line p-0.5 font-mono text-[10.5px] tracking-[0.12em]">
      {(["3d", "2d"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => set("studioView", v)}
          className={cn(
            "h-6 rounded px-2 uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring",
            view === v ? "bg-white/[0.08] text-foreground" : "text-text-secondary hover:text-foreground",
          )}
        >
          {v} view
        </button>
      ))}
    </div>
  );
}

const PRESETS: { preset: CameraPreset; label: string; key: string; needsRobot?: boolean }[] = [
  { preset: "isometric", label: "Iso", key: "1" },
  { preset: "overview", label: "Overview", key: "2" },
  { preset: "top", label: "Top", key: "3" },
  { preset: "follow", label: "Follow", key: "F", needsRobot: true },
  { preset: "chase", label: "Chase", key: "4", needsRobot: true },
];

/** Camera presets for the 3D view. Follow / Chase use the selected robot. */
function CameraPresets() {
  const preset = useCamera3D((s) => s.preset);
  const selection = useSimulationStore((s) => s.selection);
  const robotId = selection?.kind === "robot" ? selection.id : null;
  return (
    <div role="group" aria-label="Camera" className="flex items-center gap-0.5 font-mono text-[10.5px] tracking-[0.1em] uppercase">
      {PRESETS.map((p) => {
        const disabled = p.needsRobot && !robotId;
        const active = preset === p.preset || (p.preset === "isometric" && preset === "focus");
        return (
          <Tooltip key={p.preset}>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={active && !(p.preset === "isometric" && preset === "focus")}
                onClick={() => useCamera3D.getState().setPreset(p.preset, p.needsRobot ? robotId : undefined)}
                className={cn(
                  "h-7 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
                  preset === p.preset ? "bg-white/[0.08] text-foreground" : "text-text-secondary hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              {p.needsRobot ? (robotId ? `${p.label} ${robotId}` : "Select a robot first") : `${p.label} camera`} <Kbd>{p.key}</Kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
