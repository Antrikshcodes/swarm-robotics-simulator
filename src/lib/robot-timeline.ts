import type {
  DeadlockIncident,
  EventSeverity,
  RecoveryTask,
  RobotFailure,
  SimulationSnapshot,
} from "@/types/simulation";

export type TimelineCategory =
  | "mission"
  | "coordination"
  | "deadlock"
  | "recovery"
  | "fault"
  | "battery";

export interface RobotTimelineEntry {
  readonly id: string;
  readonly tick: number;
  readonly order: number;
  readonly category: TimelineCategory;
  readonly severity: EventSeverity;
  readonly title: string;
  readonly detail: string;
  readonly missionId: string | null;
  readonly cell?: { readonly x: number; readonly y: number };
}

export interface RobotTimelineSummary {
  readonly total: number;
  readonly deliveries: number;
  readonly waits: number;
  readonly preemptions: number;
  readonly deadlockYields: number;
  readonly failures: number;
  readonly rescues: number;
  readonly routeReplans: number;
}

export interface RobotTimeline {
  readonly robotId: string;
  readonly entries: readonly RobotTimelineEntry[];
  readonly summary: RobotTimelineSummary;
}

const EVENT_CATEGORY: Record<string, TimelineCategory> = {
  "mission-assigned": "mission",
  "mission-cancelled": "mission",
  "package-picked": "mission",
  "package-delivered": "mission",
  "robot-waiting": "coordination",
  "robot-no-path": "coordination",
  "conflict-prevented": "coordination",
  "right-of-way": "coordination",
  "battery-low": "battery",
  deadlock_detected: "deadlock",
  deadlock_recovery_started: "deadlock",
  robot_yielded: "deadlock",
  recovery_route_planned: "deadlock",
  deadlock_resolved: "deadlock",
  deadlock_recovery_failed: "deadlock",
  deadlock_escalated: "deadlock",
  robot_failed: "fault",
  robot_restored: "fault",
  robot_recovery_started: "recovery",
  robot_recovery_completed: "recovery",
  package_recovery_required: "recovery",
  package_recovery_started: "recovery",
  package_custody_transferred: "recovery",
  package_delivery_resumed: "recovery",
  recovery_failed: "recovery",
  route_invalidated: "coordination",
  robot_route_replanned: "coordination",
};

function formatDeadlockEntry(
  dl: DeadlockIncident,
  robotId: string,
  order: number,
): RobotTimelineEntry | null {
  if (!dl.robots.includes(robotId)) return null;
  const yieldAttempts = dl.attempts.filter((a) => a.yielderId === robotId);
  const roleNote = yieldAttempts.length
    ? `Selected as yielder (attempt ${yieldAttempts.map((a) => a.attempt).join(", ")})`
    : `Participant in ${dl.robots.join(", ")}`;
  return {
    id: `tl-dl-${dl.id}-${robotId}`,
    tick: dl.detectedTick,
    order,
    category: "deadlock",
    severity: dl.status === "failed" ? "critical" : dl.status === "resolved" ? "success" : "warning",
    title: `${dl.id} · ${dl.kind === "cycle" ? "Circular wait" : "Stall"} (${dl.status})`,
    detail:
      dl.status === "resolved" && dl.resolvedTick !== null
        ? `${roleNote} · resolved at T+${String(dl.resolvedTick).padStart(4, "0")}`
        : dl.failureReason
          ? `${roleNote} · ${dl.failureReason}`
          : roleNote,
    missionId: null,
    cell: dl.blockingCells[0],
  };
}

function formatFailureEntry(
  failure: RobotFailure,
  robotId: string,
  order: number,
): RobotTimelineEntry | null {
  if (failure.robotId !== robotId) return null;
  return {
    id: `tl-fail-${failure.id}`,
    tick: failure.tick,
    order,
    category: "fault",
    severity: failure.status === "restored" ? "warning" : "critical",
    title: `${failure.id} · ${failure.type} fault (${failure.status})`,
    detail:
      failure.restoredTick !== null
        ? `${failure.reason} · restored at T+${String(failure.restoredTick).padStart(4, "0")}`
        : failure.reason,
    missionId: failure.missionId,
    cell: failure.position,
  };
}

function formatRecoveryTaskEntries(
  task: RecoveryTask,
  robotId: string,
  baseOrder: number,
): RobotTimelineEntry[] {
  const out: RobotTimelineEntry[] = [];
  if (task.failedRobotId === robotId) {
    out.push({
      id: `tl-rc-holder-${task.id}`,
      tick: task.createdTick,
      order: baseOrder,
      category: "recovery",
      severity: task.status === "failed" ? "critical" : "warning",
      title: `${task.id} · Stranded ${task.packageId}`,
      detail: task.note,
      missionId: task.missionId,
      cell: task.attempts.at(-1)?.approachCell,
    });
  }
  for (const attempt of task.attempts) {
    if (attempt.rescuerId !== robotId) continue;
    out.push({
      id: `tl-rc-rescuer-${task.id}-${attempt.attempt}`,
      tick: attempt.startedTick,
      order: baseOrder + attempt.attempt,
      category: "recovery",
      severity:
        attempt.outcome === "handed-over"
          ? "success"
          : attempt.outcome === "in-progress"
            ? "info"
            : "warning",
      title: `${task.id} · Rescue attempt #${attempt.attempt} (${attempt.outcome})`,
      detail: `Recovering ${task.packageId} from ${task.failedRobotId}`,
      missionId: task.missionId,
      cell: attempt.approachCell,
    });
  }
  return out;
}

/**
 * Builds an explainable chronological timeline for a single robot from the
 * retained snapshot histories (events, decisions, deadlock incidents, failures,
 * and recovery tasks).
 */
export function buildRobotTimeline(
  snapshot: SimulationSnapshot,
  robotId: string,
): RobotTimeline {
  const entries: RobotTimelineEntry[] = [];
  const seenEvents = new Set<number>();

  for (const event of snapshot.events) {
    const involvesRobot =
      event.robotId === robotId || (event.robotIds?.includes(robotId) ?? false);
    if (!involvesRobot) continue;
    seenEvents.add(event.seq);
    entries.push({
      id: `tl-ev-${event.id}`,
      tick: event.tick,
      order: event.seq,
      category: EVENT_CATEGORY[event.kind] ?? "coordination",
      severity: event.severity,
      title: event.kind.replace(/[_-]/g, " "),
      detail: event.message,
      missionId: event.missionId ?? null,
      cell: event.cell,
    });
  }

  const width = Math.max(1, snapshot.layout.width);
  for (const decision of snapshot.coordination.decisions) {
    if (decision.robotId !== robotId && decision.otherRobotId !== robotId) continue;
    if (decision.kind === "wait" && !decision.otherRobotId) continue;
    const cellPoint =
      decision.cell !== undefined
        ? { x: decision.cell % width, y: Math.floor(decision.cell / width) }
        : undefined;
    entries.push({
      id: `tl-dec-${decision.seq}`,
      tick: decision.tick,
      order: 100_000 + decision.seq,
      category: "coordination",
      severity: decision.kind === "commit-reject" ? "critical" : decision.kind === "preempt" ? "warning" : "info",
      title: `Coordinator · ${decision.kind}`,
      detail: decision.message,
      missionId: null,
      cell: cellPoint,
    });
  }

  snapshot.deadlocks.incidents.forEach((dl, idx) => {
    const entry = formatDeadlockEntry(dl, robotId, 200_000 + idx);
    if (entry) entries.push(entry);
  });

  snapshot.recovery.failures.forEach((failure, idx) => {
    const entry = formatFailureEntry(failure, robotId, 300_000 + idx);
    if (entry) entries.push(entry);
  });

  snapshot.recovery.tasks.forEach((task, idx) => {
    entries.push(...formatRecoveryTaskEntries(task, robotId, 400_000 + idx * 10));
  });

  entries.sort((a, b) => b.tick - a.tick || b.order - a.order);

  const robot = snapshot.robots.find((r) => r.id === robotId);
  const summary: RobotTimelineSummary = {
    total: entries.length,
    deliveries:
      robot?.stats.deliveries ??
      snapshot.events.filter((e) => e.kind === "package-delivered" && seenEvents.has(e.seq)).length,
    waits:
      robot?.stats.waitingTicks ??
      entries.filter((e) => e.category === "coordination" && e.title.includes("wait")).length,
    preemptions: snapshot.coordination.decisions.filter(
      (d) => d.kind === "preempt" && (d.robotId === robotId || d.otherRobotId === robotId),
    ).length,
    deadlockYields: snapshot.deadlocks.incidents.reduce(
      (count, dl) => count + dl.attempts.filter((a) => a.yielderId === robotId).length,
      0,
    ),
    failures: snapshot.recovery.failures.filter((f) => f.robotId === robotId).length,
    rescues: snapshot.recovery.tasks.reduce(
      (count, t) =>
        count + t.attempts.filter((a) => a.rescuerId === robotId && a.outcome === "handed-over").length,
      0,
    ),
    routeReplans:
      robot?.stats.replans ??
      entries.filter((e) => e.title.includes("replanned")).length,
  };

  return { robotId, entries, summary };
}
