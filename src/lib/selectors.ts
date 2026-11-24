import { BLOCKED_ALERT_TICKS, LOW_BATTERY_THRESHOLD } from "@/engine";
import { formatTick } from "@/lib/format";
import type {
  DeadlockIncident,
  RecoveryTask,
  RobotFailure,
  EventSeverity,
  RobotState,
  SimEvent,
  SimulationSnapshot,
  Station,
} from "@/types/simulation";

export function findRobot(snapshot: SimulationSnapshot, id: string): RobotState | undefined {
  return snapshot.robots.find((r) => r.id === id);
}

export function findStation(snapshot: SimulationSnapshot, id: string): Station | undefined {
  return snapshot.layout.stations.find((s) => s.id === id);
}

// ------------------------------------------------------------------ incidents

export type IncidentKind = "robot-failed" | "robot-blocked" | "low-battery" | "aisle-closure" | "deadlock";

export interface Incident {
  readonly id: string;
  readonly kind: IncidentKind;
  readonly severity: Extract<EventSeverity, "warning" | "critical">;
  readonly title: string;
  readonly detail: string;
  readonly robotId: string | null;
  readonly missionId: string | null;
  readonly closureId: string | null;
  readonly openedTick: number;
  readonly open: boolean;
  /** Present for kind "deadlock": the engine's incident record. */
  readonly deadlock?: DeadlockIncident;
  /** Present for kind "robot-failed": the failure record and the package-recovery tasks it caused. */
  readonly failure?: RobotFailure;
  readonly recoveryTasks?: readonly RecoveryTask[];
}

/** Recovery tasks opened for a failure (same robot, at or after the failure tick, before the next failure). */
export function tasksForFailure(snapshot: SimulationSnapshot, failure: RobotFailure): RecoveryTask[] {
  const next = snapshot.recovery.failures.find((f) => f.robotId === failure.robotId && f.tick > failure.tick);
  return snapshot.recovery.tasks.filter(
    (t) => t.failedRobotId === failure.robotId && t.createdTick >= failure.tick && (!next || t.createdTick < next.tick),
  );
}

/**
 * Incidents are derived, never stored: open ones from current engine state,
 * resolved ones from the bounded event log. The open count matches
 * metrics.openIncidents.
 */
export function deriveIncidents(snapshot: SimulationSnapshot): Incident[] {
  const incidents: Incident[] = [];
  const openEventSeqs = new Set<number>();

  for (const robot of snapshot.robots) {
    if (robot.status === "failed" || robot.status === "recovering") {
      const failure = robot.failure;
      const tasks = failure ? tasksForFailure(snapshot, failure) : [];
      const task = tasks.at(-1);
      const mission = snapshot.missions.find((m) => m.robotId === robot.id && m.state === "recovery-required");
      incidents.push({
        id: `INC-F-${failure?.id ?? robot.id}`,
        kind: "robot-failed",
        severity: "critical",
        title: robot.status === "recovering" ? `${robot.id} restoring` : `${robot.id} failed`,
        detail: task
          ? `${robot.activityNote ?? "Failed"} · ${task.id}: ${task.note}`
          : (robot.activityNote ?? "Failed"),
        robotId: robot.id,
        missionId: mission?.id ?? failure?.missionId ?? null,
        closureId: null,
        openedTick: failure?.tick ?? snapshot.tick,
        open: true,
        failure: failure ?? undefined,
        recoveryTasks: tasks,
      });
      continue;
    }
    // Robots in a deadlock are reported once, under the deadlock incident.
    if (robot.status === "waiting" && robot.blockedTicks >= BLOCKED_ALERT_TICKS && robot.deadlockId === null) {
      const noRoute = robot.activityNote?.startsWith("No route") ?? false;
      const opened = lastEvent(snapshot.events, noRoute ? "robot-no-path" : "robot-waiting", robot.id);
      if (opened) openEventSeqs.add(opened.seq);
      incidents.push({
        id: `INC-W-${robot.id}-${opened?.seq ?? snapshot.tick - robot.blockedTicks}`,
        kind: "robot-blocked",
        severity: "warning",
        title: noRoute ? `${robot.id} has no route` : `${robot.id} blocked`,
        detail: `${robot.activityNote ?? "Waiting"} · ${robot.blockedTicks} ticks`,
        robotId: robot.id,
        missionId: robot.missionId,
        closureId: null,
        openedTick: snapshot.tick - robot.blockedTicks + 1,
        open: true,
      });
    }
    if (robot.battery < LOW_BATTERY_THRESHOLD) {
      const opened = lastEvent(snapshot.events, "battery-low", robot.id);
      incidents.push({
        id: `INC-B-${robot.id}`,
        kind: "low-battery",
        severity: "warning",
        title: `${robot.id} low battery`,
        detail: `${robot.battery.toFixed(0)}% — below the ${LOW_BATTERY_THRESHOLD}% threshold. Robots below 15% are not assigned missions.`,
        robotId: robot.id,
        missionId: robot.missionId,
        closureId: null,
        openedTick: opened?.tick ?? 0,
        open: true,
      });
    }
  }

  for (const closure of snapshot.closures) {
    incidents.push({
      id: `INC-C-${closure.id}`,
      kind: "aisle-closure",
      severity: "warning",
      title: `${closure.id} active`,
      detail: `${closure.label} · ${closure.cells.length} cell${closure.cells.length > 1 ? "s" : ""} closed to new routes`,
      robotId: null,
      missionId: null,
      closureId: closure.id,
      openedTick: closure.createdTick,
      open: true,
    });
  }

  // Deadlocks come straight from the engine's incident records (open and history).
  for (const dl of snapshot.deadlocks.incidents) {
    const open = dl.status !== "resolved";
    const group = dl.robots.join(", ");
    const last = dl.attempts.at(-1);
    const detail =
      dl.status === "failed"
        ? `Unresolved: ${dl.failureReason ?? "no safe recovery"}. Robots hold safely in place.`
        : dl.status === "recovering" && last
          ? `Attempt ${last.attempt}: ${last.yielderId} yielding to a holding position.`
          : dl.status === "resolved"
            ? `Resolved at ${dl.resolvedTick === null ? "—" : formatTick(dl.resolvedTick)} after ${dl.attempts.length} attempt${dl.attempts.length === 1 ? "" : "s"}.`
            : dl.kind === "cycle"
              ? `Circular wait among ${group}.`
              : `${dl.robots[0]} cannot progress.`;
    incidents.push({
      id: dl.id,
      kind: "deadlock",
      severity: open ? "critical" : "warning",
      title: `${dl.id} · ${dl.kind === "cycle" ? `${dl.robots.length}-robot circular wait` : "stalled robot"}`,
      detail,
      robotId: dl.robots[0] ?? null,
      missionId: null,
      closureId: null,
      openedTick: dl.detectedTick,
      open,
      deadlock: dl,
    });
  }

  // Restored failures stay as resolved history.
  for (const failure of snapshot.recovery.failures) {
    if (failure.status !== "restored") continue;
    const robot = snapshot.robots.find((r) => r.id === failure.robotId);
    if (robot && robot.failure?.id === failure.id && (robot.status === "failed" || robot.status === "recovering")) continue;
    const tasks = tasksForFailure(snapshot, failure);
    incidents.push({
      id: `INC-F-${failure.id}`,
      kind: "robot-failed",
      severity: "critical",
      title: `${failure.robotId} failure resolved`,
      detail: `Restored at ${failure.restoredTick === null ? "—" : formatTick(failure.restoredTick)}${tasks.length ? ` · ${tasks.map((t) => `${t.id} ${t.status}`).join(", ")}` : ""}`,
      robotId: failure.robotId,
      missionId: failure.missionId,
      closureId: null,
      openedTick: failure.tick,
      open: false,
      failure,
      recoveryTasks: tasks,
    });
  }

  // Resolved history from the event log.
  const openClosures = new Set(snapshot.closures.map((c) => c.id));
  for (const event of snapshot.events) {
    if ((event.kind === "robot-waiting" || event.kind === "robot-no-path") && event.robotId && !openEventSeqs.has(event.seq)) {
      incidents.push({
        id: `INC-W-${event.robotId}-${event.seq}`,
        kind: "robot-blocked",
        severity: "warning",
        title: event.kind === "robot-no-path" ? `${event.robotId} had no route` : `${event.robotId} was blocked`,
        detail: event.message,
        robotId: event.robotId,
        missionId: event.missionId ?? null,
        closureId: null,
        openedTick: event.tick,
        open: false,
      });
    }
    if (event.kind === "aisle_closed" && event.closureId && !openClosures.has(event.closureId)) {
      incidents.push({
        id: `INC-C-${event.closureId}-${event.seq}`,
        kind: "aisle-closure",
        severity: "warning",
        title: `${event.closureId} reopened`,
        detail: event.message,
        robotId: null,
        missionId: null,
        closureId: event.closureId,
        openedTick: event.tick,
        open: false,
      });
    }
  }

  return incidents.sort((a, b) => Number(b.open) - Number(a.open) || b.openedTick - a.openedTick);
}

function lastEvent(events: readonly SimEvent[], kind: SimEvent["kind"], robotId: string) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].kind === kind && events[i].robotId === robotId) return events[i];
  }
  return undefined;
}

// ------------------------------------------------------------------ analytics

export interface ThroughputBucket {
  readonly start: number;
  readonly end: number;
  readonly deliveries: number;
}

export function throughputBuckets(snapshot: SimulationSnapshot, bucketSize = 25): ThroughputBucket[] {
  const safeSize = Math.max(1, bucketSize);
  const count = Math.max(1, Math.ceil(snapshot.tick / safeSize));
  const buckets = Array.from({ length: count }, (_, i) => ({
    start: i * safeSize,
    end: (i + 1) * safeSize,
    deliveries: 0,
  }));
  for (const tick of snapshot.deliveryTicks) {
    const index = Math.max(0, Math.min(count - 1, Math.floor((tick - 1) / safeSize)));
    buckets[index].deliveries += 1;
  }
  return buckets;
}

export interface CycleStats {
  readonly count: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly mean: number;
}

export function missionCycleStats(snapshot: SimulationSnapshot): CycleStats | null {
  const durations = snapshot.missions
    .filter((m) => m.state === "completed" && m.completedTick !== null)
    .map((m) => Math.max(0, (m.completedTick ?? m.createdTick) - m.createdTick))
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 1 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  return {
    count: durations.length,
    min: durations[0],
    median,
    max: durations[durations.length - 1],
    mean: sum / durations.length,
  };
}

export function averageCycleTicks(snapshot: SimulationSnapshot): number | null {
  const done = snapshot.missions.filter(
    (m) => m.state === "completed" && m.completedTick !== null,
  );
  if (done.length === 0) return null;
  const total = done.reduce((sum, m) => sum + ((m.completedTick ?? 0) - m.createdTick), 0);
  return total / done.length;
}

export function robotUtilisation(robot: RobotState, tick: number): number {
  return tick === 0 ? 0 : robot.stats.busyTicks / tick;
}
