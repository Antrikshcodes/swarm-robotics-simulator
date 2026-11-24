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

/** Grid rectangle to frame with a "focus" request when no robot is given. */
export interface FocusRegion {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface Camera3DState {
  preset: CameraPreset;
  robotId: string | null;
  region: FocusRegion | null;
  /** Bumped on every request so re-selecting the same preset re-runs the transition. */
  nonce: number;
  setPreset: (preset: CameraPreset, robotId?: string | null, region?: FocusRegion | null) => void;
}

export const useCamera3D = create<Camera3DState>()((set, get) => ({
  preset: "isometric",
  robotId: null,
  region: null,
  nonce: 0,
  setPreset: (preset, robotId, region = null) =>
    set({ preset, robotId: robotId === undefined ? get().robotId : robotId, region, nonce: get().nonce + 1 }),
}));

/** Set while a selection originates inside the 3D canvas, so it doesn't also trigger a camera focus. */
export const selectionSource = { fromCanvas: false };

/** Inspector camera actions (they move the camera only; selection and simulation are untouched). */
export const cameraActions = {
  /** One-shot glide onto a robot, keeping the viewing direction. */
  focusRobot: (robotId: string) => useCamera3D.getState().setPreset("focus", robotId),
  /** Keep the robot under the orbit target while it moves. */
  followRobot: (robotId: string) => useCamera3D.getState().setPreset("follow", robotId),
  /** Stop tracking and glide back to the whole-warehouse overview. */
  returnToOverview: () => useCamera3D.getState().setPreset("overview", null),
  /** Frame a grid region (rack block, station, cell) from the current direction. */
  focusRegion: (region: FocusRegion) => useCamera3D.getState().setPreset("focus", null, region),
};
