import { describe, expect, it } from "vitest";
import type { RobotStatus } from "@/types/simulation";
import { canTransitionRobot, isRobotOperational, validateRobotTransition } from "./robot-lifecycle";

const OPERATIONAL: RobotStatus[] = [
  "idle",
  "moving",
  "carrying",
  "waiting",
  "loading",
  "unloading",
  "charging",
];

describe("robots/robot-lifecycle", () => {
  it("distinguishes operational states from failed and recovering", () => {
    for (const status of OPERATIONAL) {
      expect(isRobotOperational(status)).toBe(true);
    }
    expect(isRobotOperational("failed")).toBe(false);
    expect(isRobotOperational("recovering")).toBe(false);
  });

  it("allows operational states to transition between each other or fail", () => {
    for (const from of OPERATIONAL) {
      for (const to of [...OPERATIONAL, "failed" as const]) {
        expect(canTransitionRobot(from, to)).toBe(true);
        expect(validateRobotTransition("R-01", from, to).ok).toBe(true);
      }
      expect(canTransitionRobot(from, "recovering")).toBe(false);
    }
  });

  it("prevents failed robots from jumping directly back into operation", () => {
    for (const op of OPERATIONAL) {
      expect(canTransitionRobot("failed", op)).toBe(false);
      const res = validateRobotTransition("R-01", "failed", op);
      expect(res.ok).toBe(false);
    }
    expect(canTransitionRobot("failed", "recovering")).toBe(true);
    expect(canTransitionRobot("recovering", "idle")).toBe(true);
    expect(canTransitionRobot("recovering", "failed")).toBe(true);
    expect(canTransitionRobot("recovering", "carrying")).toBe(false);
  });
});
