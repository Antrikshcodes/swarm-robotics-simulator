import type { RobotState, SimEvent, SimulationSnapshot } from "@/types/simulation";
import { BLOCKED_ALERT_TICKS } from "@/engine/metrics";
import type { Tone } from "./status";

/**
 * Fleet-page derivations. Everything comes from the engine snapshot; the
 * engine has no separate "mode" or "connectivity" fields, so those are
 * derived from robot status, role and failure type as documented below.
 */

export type FleetFilter = "all" | "active" | "idle" | "waiting" | "blocked" | "failed";

/** Moving, carrying or handling a package at a station. */
export const isActive = (r: RobotState) => r.status === "moving" || r.status === "carrying" || r.status === "loading" || r.status === "unloading";
export const isIdle = (r: RobotState) => r.status === "idle" || r.status === "charging";
export const isFailed = (r: RobotState) => r.status === "failed" || r.status === "recovering";
/** Waiting long enough to raise an alert, or part of a deadlock. */
export const isBlocked = (r: RobotState) => r.status === "waiting" && (r.blockedTicks >= BLOCKED_ALERT_TICKS || r.waitClass === "deadlock");

export const FLEET_FILTERS: Record<FleetFilter, (r: RobotState) => boolean> = {
  all: () => true,
  active: isActive,
  idle: isIdle,
  waiting: (r) => r.status === "waiting",
  blocked: isBlocked,
  failed: isFailed,
};

/** Robots needing an operator's attention: failed / restoring, blocked, or deadlocked. */
export const needsAttention = (r: RobotState) => isFailed(r) || isBlocked(r) || r.waitClass === "deadlock";

export function fleetSummary(robots: readonly RobotState[]) {
  return {
    total: robots.length,
    active: robots.filter(isActive).length,
    idle: robots.filter(isIdle).length,
    attention: robots.filter(needsAttention).length,
  };
}

/** Operating mode, derived from status and the robot's current role. */
export function operatingMode(r: RobotState): { label: string; tone: Tone } {
  if (r.status === "failed") return { label: "Halted", tone: "red" };
  if (r.status === "recovering") return { label: "Restoring", tone: "amber" };
  if (r.recoveryRole?.role === "rescuer") return { label: "Recovery task", tone: "cyan" };
  if (r.waitClass === "yielding") return { label: "Yielding", tone: "cyan" };
  if (r.status === "charging") return { label: "Charging", tone: "cyan" };
  return { label: "Autonomous", tone: "lime" };
}

/**
 * Link status. The engine models communication loss as a failure type, so a
 * robot halted by a communication failure is "Link lost"; every other robot
 * is reporting state to the coordinator and is "Online".
 */
export function connectivity(r: RobotState): { label: string; tone: Tone; online: boolean } {
  if (r.status === "failed" && r.failure?.type === "communication") return { label: "Link lost", tone: "red", online: false };
  return { label: "Online", tone: "lime", online: true };
}

/** Mission line for a robot: its mission, or the package it is recovering, or nothing. */
export function missionSummary(r: RobotState, snapshot: SimulationSnapshot): { id: string | null; route: string | null; state: string | null } {
  if (r.missionId) {
    const m = snapshot.missions.find((x) => x.id === r.missionId);
    return { id: r.missionId, route: m ? `${m.pickupStationId} → ${m.dropoffStationId}` : null, state: m?.state ?? null };
  }
  if (r.recoveryRole?.role === "rescuer") {
    const task = snapshot.recovery.tasks.find((t) => t.id === r.recoveryRole!.taskId);
    return { id: task?.id ?? r.recoveryRole.taskId, route: task ? `Recover ${task.packageId} from ${task.failedRobotId}` : null, state: task?.status ?? null };
  }
  return { id: null, route: null, state: null };
}

/** Events that involve a robot, newest first. */
export function robotEvents(events: readonly SimEvent[], robotId: string, limit = 8): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const e = events[i];
    if (e.robotId === robotId || e.robotIds?.includes(robotId)) out.push(e);
  }
  return out;
}

/** Latest thing the robot did or reported. */
export function lastActivity(r: RobotState, events: readonly SimEvent[]): { text: string; tick: number | null } {
  const latest = robotEvents(events, r.id, 1)[0];
  if (r.activityNote) return { text: r.activityNote, tick: latest?.tick ?? null };
  if (latest) return { text: latest.message, tick: latest.tick };
  return { text: "No activity yet", tick: null };
}

export type BatteryLevel = "ok" | "low" | "critical";
export function batteryLevel(value: number): BatteryLevel {
  if (value < 20) return "critical";
  if (value < 40) return "low";
  return "ok";
}
