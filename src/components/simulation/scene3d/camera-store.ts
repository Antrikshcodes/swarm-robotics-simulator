"use client";

import { create } from "zustand";

/**
 * 3D Studio camera state. The camera controller (inside the Canvas) reads
 * this; toolbar buttons, double-clicks and fleet selection write it.
 *
 * - isometric / overview / top: one-shot transitions to a fixed pose.
 * - focus:  one-shot transition onto a robot, keeping the viewing direction.
 * - follow: the orbit target tracks a robot continuously (orbit still works).
 * - chase:  the camera rides behind a robot, looking along its heading.
 */
export type CameraPreset = "isometric" | "overview" | "top" | "focus" | "follow" | "chase";

interface Camera3DState {
  preset: CameraPreset;
  robotId: string | null;
  /** Bumped on every request so re-selecting the same preset re-runs the transition. */
  nonce: number;
  setPreset: (preset: CameraPreset, robotId?: string | null) => void;
}

export const useCamera3D = create<Camera3DState>()((set, get) => ({
  preset: "isometric",
  robotId: null,
  nonce: 0,
  setPreset: (preset, robotId) => set({ preset, robotId: robotId === undefined ? get().robotId : robotId, nonce: get().nonce + 1 }),
}));

/** Set while a selection originates inside the 3D canvas, so it doesn't also trigger a camera focus. */
export const selectionSource = { fromCanvas: false };
