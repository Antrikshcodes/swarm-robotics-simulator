import type { RobotStatus } from "../../types/simulation";
import { err, ok, type Result } from "../core/result";

/**
 * Robot operational status transitions.
 *
 * Status is recomputed every tick from what the robot did, so most
 * operational states can follow one another. The hard rules are:
 *  - `failed` is only left via `recovering` (recovery workflow: Mission 006)
 *  - `recovering` returns to `idle`
 *  - nothing jumps straight from `failed` back into operation
 */
const OPERATIONAL: readonly RobotStatus[] = ["idle", "moving", "carrying", "waiting", "loading", "unloading", "charging"];

const ALLOWED: Record<RobotStatus, readonly RobotStatus[]> = {
  idle: [...OPERATIONAL, "failed"],
  moving: [...OPERATIONAL, "failed"],
  carrying: [...OPERATIONAL, "failed"],
  waiting: [...OPERATIONAL, "failed"],
  loading: [...OPERATIONAL, "failed"],
  unloading: [...OPERATIONAL, "failed"],
  charging: [...OPERATIONAL, "failed"],
  failed: ["failed", "recovering"],
  recovering: ["recovering", "idle", "failed"],
};

export function canTransitionRobot(from: RobotStatus, to: RobotStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function validateRobotTransition(robotId: string, from: RobotStatus, to: RobotStatus): Result {
  if (canTransitionRobot(from, to)) return ok();
  return err("invalid-robot-transition", `${robotId}: cannot move from "${from}" to "${to}"`);
}

export const isRobotOperational = (status: RobotStatus): boolean => OPERATIONAL.includes(status);
