"use client";

import { useEffect } from "react";
import { usePreferences, type BooleanPreference } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { useCamera3D } from "./scene3d/camera-store";

const TOGGLES: Record<string, BooleanPreference> = {
  g: "showGrid",
  c: "showCoordinates",
  p: "showRoutes",
  l: "showLabels",
  y: "showReservations",
  w: "showWaitLinks",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.getAttribute("role") === "combobox";
}

/** Studio keyboard shortcuts. Active only while the studio is mounted and visible. */
export function useStudioShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const sim = useSimulationStore.getState();
      const view = useViewportStore.getState();
      const key = event.key.toLowerCase();

      // Space on a focused button should click that button, not toggle playback.
      if (key === " " && event.target instanceof HTMLButtonElement) return;

      const is3d = usePreferences.getState().studioView === "3d";
      const robotId = sim.selection?.kind === "robot" ? sim.selection.id : null;
      const cam = useCamera3D.getState();

      let handled = true;
      if (key === " ") sim.togglePlayback();
      else if (key === "." && sim.status !== "running") sim.step();
      else if (key === "r") sim.reset();
      else if (key === "escape") sim.select(null);
      // 3D camera presets
      else if (is3d && key === "1") cam.setPreset("isometric");
      else if (is3d && key === "2") cam.setPreset("overview");
      else if (is3d && key === "3") cam.setPreset("top");
      else if (is3d && key === "f" && robotId) cam.setPreset("follow", robotId);
      else if (is3d && key === "4" && robotId) cam.setPreset("chase", robotId);
      else if (is3d && key === "k") usePreferences.getState().toggle("rackCutaway");
      // 2D canvas tools
      else if (!is3d && (key === "=" || key === "+")) view.zoomBy(1.25);
      else if (!is3d && (key === "-" || key === "_")) view.zoomBy(1 / 1.25);
      else if (!is3d && key === "0") view.resetZoom();
      else if (!is3d && key === "f") view.fitToView();
      else if (!is3d && key === "v") view.setTool("select");
      else if (!is3d && key === "h") view.setTool("pan");
      else if (TOGGLES[key]) usePreferences.getState().toggle(TOGGLES[key]);
      else handled = false;

      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
