"use client";

import { useEffect } from "react";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";

/**
 * Owns the wall-clock → tick cadence. Mounted once in the app shell so
 * playback continues while navigating between pages, and so the
 * simulation source itself never touches timers.
 */
export function PlaybackDriver() {
  const status = useSimulationStore((s) => s.status);
  const speed = useSimulationStore((s) => s.speed);
  const tickMs = usePreferences((s) => s.tickMs);

  useEffect(() => {
    void usePreferences.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    const interval = window.setInterval(() => {
      useSimulationStore.getState().step();
    }, tickMs / speed);
    return () => window.clearInterval(interval);
  }, [status, speed, tickMs]);

  return null;
}
