import type { FleetMetrics, Mission, RobotState } from "../types/simulation";
import { isActiveMission } from "./missions/mission-lifecycle";

export const LOW_BATTERY_THRESHOLD = 20;
/** A robot blocked this many consecutive ticks is reported as an incident. */
export const BLOCKED_ALERT_TICKS = 3;

/** Metrics are derived purely from engine state — never stored or hardcoded. */
export function computeMetrics(
  tick: number,
  robots: readonly RobotState[],
  missions: readonly Mission[],
  completedDeliveries: number,
  activeClosures = 0,
): FleetMetrics {
  const robotById = new Map(robots.map((r) => [r.id, r]));
  const failed = robots.filter((r) => r.status === "failed" || r.status === "recovering").length;
  const idle = robots.filter((r) => r.status === "idle" || r.status === "charging").length;
  const waiting = robots.filter((r) => r.status === "waiting").length;
  const blocked = robots.filter((r) => r.status === "waiting" && r.blockedTicks >= BLOCKED_ALERT_TICKS).length;
  const lowBattery = robots.filter(
    (r) => r.status !== "failed" && r.status !== "recovering" && r.battery < LOW_BATTERY_THRESHOLD,
  ).length;
  const active = missions.filter((m) => isActiveMission(m.state));
  const busy = robots.reduce((sum, r) => sum + r.stats.busyTicks, 0);

  return {
    totalRobots: robots.length,
    activeRobots: robots.length - failed - idle,
    idleRobots: idle,
    faultedRobots: failed,
    waitingRobots: waiting,
    activeMissions: active.length,
    queuedMissions: missions.filter((m) => m.state === "queued").length,
    waitingMissions: active.filter((m) => m.robotId !== null && robotById.get(m.robotId)?.status === "waiting").length,
    completedDeliveries,
    // One incident per failed robot (its stranded mission is part of it),
    // per robot blocked beyond the alert threshold, per low-battery robot,
    // and per active aisle closure. Mirrors deriveIncidents() in the UI.
    openIncidents: failed + blocked + lowBattery + activeClosures,
    utilisation: tick === 0 || robots.length === 0 ? 0 : busy / (tick * robots.length),
  };
}
