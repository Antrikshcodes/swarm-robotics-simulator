"use client";

import { create } from "zustand";
import {
  createSimulationSource,
  DEFAULT_SCENARIO_ID,
  type CommandResult,
  type EngineCommand,
  type WarehouseEngine,
} from "@/engine";
import type { EntitySelection, SimulationSnapshot } from "@/types/simulation";
import { appendArchivedRun, summarizeSnapshotRun, type ArchivedRunSummary } from "./run-archive";

export type PlaybackStatus = "ready" | "running" | "paused";

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** Last command outcome, surfaced as a toast. `seq` changes on every command. */
export interface CommandFeedback {
  readonly seq: number;
  readonly ok: boolean;
  readonly message: string;
}

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
  feedback: CommandFeedback | null;
  runArchive: readonly ArchivedRunSummary[];

  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  /** One tick. Used by the playback driver while running and by the Step button. */
  step: () => void;
  reset: () => void;
  seek: (tick: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  loadScenario: (scenarioId: string) => void;
  select: (selection: EntitySelection | null) => void;
  archiveCurrentRun: () => void;
  clearRunArchive: () => void;
  /** Send a world command (add mission, close aisle, fail robot, …) to the engine. */
  dispatch: (command: EngineCommand) => CommandResult;
}

/**
 * The engine lives outside React state; the store only holds the immutable
 * snapshots it produces. All world changes go through engine.dispatch().
 */
const engine: WarehouseEngine = createSimulationSource(DEFAULT_SCENARIO_ID);
let feedbackSeq = 0;
let archiveSeq = 0;

const now = () => (typeof performance === "undefined" ? 0 : performance.now());

function feedback(result: CommandResult): CommandFeedback {
  feedbackSeq += 1;
  return {
    seq: feedbackSeq,
    ok: result.ok,
    message: result.ok ? result.value.message : result.error.message,
  };
}

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  scenarioId: DEFAULT_SCENARIO_ID,
  snapshot: engine.getSnapshot(),
  status: "ready",
  speed: 1,
  maxTick: 0,
  steppedAt: 0,
  selection: null,
  feedback: null,
  runArchive: [],

  play: () => {
    if (get().status === "running") return;
    const result = engine.dispatch({ type: "start" });
    if (result.ok) set({ status: "running", snapshot: engine.getSnapshot() });
    else set({ feedback: feedback(result) });
  },

  pause: () => {
    if (get().status !== "running") return;
    const result = engine.dispatch({ type: "pause" });
    set({ status: "paused", snapshot: engine.getSnapshot(), ...(result.ok ? {} : { feedback: feedback(result) }) });
  },

  togglePlayback: () => (get().status === "running" ? get().pause() : get().play()),

  step: () => {
    const snapshot = engine.step();
    set((s) => ({
      snapshot,
      steppedAt: now(),
      maxTick: Math.max(s.maxTick, snapshot.tick),
      status: s.status === "ready" ? "paused" : s.status,
    }));
  },

  reset: () => {
    const prev = get().snapshot;
    let nextArchive = get().runArchive;
    if (prev.tick > 0) {
      archiveSeq += 1;
      nextArchive = appendArchivedRun(nextArchive, summarizeSnapshotRun(prev, archiveSeq, "reset"));
    }
    engine.dispatch({ type: "reset" });
    set({
      snapshot: engine.getSnapshot(),
      status: "ready",
      maxTick: 0,
      steppedAt: 0,
      runArchive: nextArchive,
    });
  },

  seek: (tick) => {
    const snapshot = engine.seek(tick);
    set((s) => ({
      snapshot,
      // A seek is a jump, not motion: suppress interpolation.
      steppedAt: 0,
      maxTick: Math.max(s.maxTick, snapshot.tick),
      // Seeking pauses playback (engine.seek clears its running flag too).
      status: s.status === "ready" && snapshot.tick === 0 ? "ready" : "paused",
    }));
  },

  setSpeed: (speed) => set({ speed }),

  loadScenario: (scenarioId) => {
    if (scenarioId === get().scenarioId) return;
    const prev = get().snapshot;
    const result = engine.dispatch({ type: "load-scenario", scenarioId });
    if (!result.ok) {
      set({ feedback: feedback(result) });
      return;
    }
    let nextArchive = get().runArchive;
    if (prev.tick > 0) {
      archiveSeq += 1;
      nextArchive = appendArchivedRun(
        nextArchive,
        summarizeSnapshotRun(prev, archiveSeq, "scenario-switch"),
      );
    }
    set({
      scenarioId,
      snapshot: engine.getSnapshot(),
      status: "ready",
      maxTick: 0,
      steppedAt: 0,
      selection: null,
      runArchive: nextArchive,
    });
  },

  archiveCurrentRun: () => {
    const current = get().snapshot;
    if (current.tick === 0) return;
    archiveSeq += 1;
    set((s) => ({
      runArchive: appendArchivedRun(
        s.runArchive,
        summarizeSnapshotRun(current, archiveSeq, "manual"),
      ),
    }));
  },

  clearRunArchive: () => set({ runArchive: [] }),

  select: (selection) => {
    if (selection?.kind === "robot") {
      const result = engine.dispatch({ type: "select-robot", robotId: selection.id });
      if (!result.ok) {
        set({ feedback: feedback(result) });
        return;
      }
    }
    set({ selection });
  },

  dispatch: (command) => {
    const result = engine.dispatch(command);
    set((s) => ({
      snapshot: engine.getSnapshot(),
      maxTick: Math.max(s.maxTick, engine.getSnapshot().tick),
      feedback: feedback(result),
    }));
    return result;
  },
}));
