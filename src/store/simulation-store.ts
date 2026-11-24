"use client";

import { create } from "zustand";
import { createSimulationSource, DEFAULT_SCENARIO_ID, type SimulationSource } from "@/engine";
import type { EntitySelection, SimulationSnapshot } from "@/types/simulation";

export type PlaybackStatus = "ready" | "running" | "paused";

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

interface SimulationState {
  scenarioId: string;
  snapshot: SimulationSnapshot;
  status: PlaybackStatus;
  speed: PlaybackSpeed;
  /** Furthest tick simulated since the scenario was loaded (timeline extent). */
  maxTick: number;
  /** `performance.now()` when the current snapshot was produced. Render-only. */
  steppedAt: number;
  selection: EntitySelection | null;

  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  step: () => void;
  reset: () => void;
  seek: (tick: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  loadScenario: (scenarioId: string) => void;
  select: (selection: EntitySelection | null) => void;
}

/**
 * The simulation source lives outside React state: the store only holds
 * the immutable snapshots it produces. Swapping DemoPlayback for the real
 * engine later only changes `createSimulationSource`.
 */
let source: SimulationSource = createSimulationSource(DEFAULT_SCENARIO_ID);

const now = () => (typeof performance === "undefined" ? 0 : performance.now());

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  scenarioId: DEFAULT_SCENARIO_ID,
  snapshot: source.getSnapshot(),
  status: "ready",
  speed: 1,
  maxTick: 0,
  steppedAt: 0,
  selection: null,

  play: () => set({ status: "running" }),

  pause: () => {
    if (get().status === "running") set({ status: "paused" });
  },

  togglePlayback: () => {
    const { status } = get();
    set({ status: status === "running" ? "paused" : "running" });
  },

  step: () => {
    const snapshot = source.step();
    set((s) => ({
      snapshot,
      steppedAt: now(),
      maxTick: Math.max(s.maxTick, snapshot.tick),
      status: s.status === "ready" ? "paused" : s.status,
    }));
  },

  reset: () => {
    const snapshot = source.reset();
    set({ snapshot, status: "ready", maxTick: 0, steppedAt: 0 });
  },

  seek: (tick) => {
    const snapshot = source.seek(tick);
    set((s) => ({
      snapshot,
      // A seek is a jump, not motion: suppress interpolation.
      steppedAt: 0,
      maxTick: Math.max(s.maxTick, snapshot.tick),
      status: s.status === "ready" && snapshot.tick > 0 ? "paused" : s.status,
    }));
  },

  setSpeed: (speed) => set({ speed }),

  loadScenario: (scenarioId) => {
    if (scenarioId === get().scenarioId) return;
    source = createSimulationSource(scenarioId);
    set({
      scenarioId,
      snapshot: source.getSnapshot(),
      status: "ready",
      maxTick: 0,
      steppedAt: 0,
      selection: null,
    });
  },

  select: (selection) => set({ selection }),
}));
