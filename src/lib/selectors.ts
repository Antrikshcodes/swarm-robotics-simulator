import { LOW_BATTERY_THRESHOLD } from "@/engine";
import type {
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

export type IncidentKind = "robot-fault" | "conflict-hold" | "low-battery";

export interface Incident {
  readonly id: string;
  readonly kind: IncidentKind;
  readonly severity: Extract<EventSeverity, "warning" | "critical">;
  readonly title: string;
  readonly detail: string;
  readonly robotId: string;
  readonly missionId: string | null;
  readonly openedTick: number;
  readonly open: boolean;
}

/**
 * Incidents are derived, never stored: open ones from current robot state,
 * historic ones from the bounded event log.
 */
export function deriveIncidents(snapshot: SimulationSnapshot): Incident[] {
  const incidents: Incident[] = [];
  const openKeys = new Set<string>();

  for (const robot of snapshot.robots) {
    if (robot.status === "fault") {
      const opened = lastEvent(snapshot.events, "robot-fault", robot.id);
      const mission = snapshot.missions.find(
        (m) => m.robotId === robot.id && m.state === "recovery-required",
      );
      openKeys.add(`robot-fault:${robot.id}`);
      incidents.push({
        id: `INC-F-${robot.id}`,
        kind: "robot-fault",
        severity: "critical",
        title: `${robot.id} halted`,
        detail: mission
          ? `${robot.activityNote ?? "Fault"}. ${mission.id} (${mission.packageId}) needs recovery — not yet automated.`
          : (robot.activityNote ?? "Fault"),
        robotId: robot.id,
        missionId: mission?.id ?? null,
        openedTick: opened?.tick ?? snapshot.tick,
        open: true,
      });
    }
    if (robot.status === "waiting") {
      const opened = lastEvent(snapshot.events, "robot-waiting", robot.id);
      openKeys.add(`conflict-hold:${robot.id}`);
      incidents.push({
        id: `INC-W-${robot.id}-${opened?.seq ?? 0}`,
        kind: "conflict-hold",
        severity: "warning",
        title: `${robot.id} holding`,
        detail: robot.activityNote ?? "Waiting",
        robotId: robot.id,
        missionId: robot.missionId,
        openedTick: opened?.tick ?? snapshot.tick,
        open: true,
      });
    }
    if (robot.status !== "fault" && robot.battery < LOW_BATTERY_THRESHOLD) {
      const opened = lastEvent(snapshot.events, "battery-low", robot.id);
      openKeys.add(`low-battery:${robot.id}`);
      incidents.push({
        id: `INC-B-${robot.id}`,
        kind: "low-battery",
        severity: "warning",
        title: `${robot.id} low battery`,
        detail: `${robot.battery.toFixed(0)}% sample telemetry, below ${LOW_BATTERY_THRESHOLD}% threshold.`,
        robotId: robot.id,
        missionId: robot.missionId,
        openedTick: opened?.tick ?? 0,
        open: true,
      });
    }
  }

  // Resolved conflict holds from history.
  for (const event of snapshot.events) {
    if (event.kind !== "robot-waiting" || !event.robotId) continue;
    const robot = findRobot(snapshot, event.robotId);
    const stillOpen =
      robot?.status === "waiting" &&
      lastEvent(snapshot.events, "robot-waiting", robot.id)?.seq === event.seq;
    if (stillOpen) continue;
    incidents.push({
      id: `INC-W-${event.robotId}-${event.seq}`,
      kind: "conflict-hold",
      severity: "warning",
      title: `${event.robotId} holding`,
      detail: event.message.replace(`${event.robotId} holding: `, ""),
      robotId: event.robotId,
      missionId: event.missionId ?? null,
      openedTick: event.tick,
      open: false,
    });
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
  const count = Math.max(1, Math.ceil(snapshot.tick / bucketSize));
  const buckets = Array.from({ length: count }, (_, i) => ({
    start: i * bucketSize,
    end: (i + 1) * bucketSize,
    deliveries: 0,
  }));
  for (const tick of snapshot.deliveryTicks) {
    const index = Math.min(count - 1, Math.floor((tick - 1) / bucketSize));
    buckets[index].deliveries += 1;
  }
  return buckets;
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
