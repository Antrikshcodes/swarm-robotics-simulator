import type { Mission, MissionState, RobotState, SimulationSnapshot } from "@/types/simulation";

export type AnalyticsRange = 100 | 500 | 2000 | "all";
export type MissionFilter = "all" | "active" | "completed" | "cancelled";

export function rangeStart(tick: number, range: AnalyticsRange): number {
  return range === "all" ? 0 : Math.max(0, tick - range + 1);
}

export function missionInRange(mission: Mission, start: number, end: number): boolean {
  return (mission.createdTick >= start && mission.createdTick <= end) ||
    (mission.completedTick !== null && mission.completedTick >= start && mission.completedTick <= end) ||
    (isActive(mission.state) && mission.createdTick <= end);
}

export function matchesMissionFilter(mission: Mission, filter: MissionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActive(mission.state);
  return mission.state === filter;
}

export function isActive(state: MissionState): boolean {
  return !["completed", "cancelled"].includes(state);
}

export function filteredMissions(
  missions: readonly Mission[],
  start: number,
  end: number,
  status: MissionFilter,
  robotId: string,
): Mission[] {
  return missions.filter((mission) =>
    missionInRange(mission, start, end) && matchesMissionFilter(mission, status) &&
    (robotId === "all" || mission.robotId === robotId),
  );
}

export function filteredRobots(robots: readonly RobotState[], robotId: string): RobotState[] {
  return robotId === "all" ? [...robots] : robots.filter((robot) => robot.id === robotId);
}

export function deliveryCount(snapshot: SimulationSnapshot, start: number, end: number, robotId: string): number {
  if (robotId === "all") return snapshot.deliveryTicks.filter((tick) => tick >= start && tick <= end).length;
  return snapshot.missions.filter((mission) => mission.state === "completed" && mission.robotId === robotId &&
    mission.completedTick !== null && mission.completedTick >= start && mission.completedTick <= end).length;
}

export function deliveryBuckets(
  snapshot: SimulationSnapshot,
  start: number,
  end: number,
  robotId: string,
  size: number,
): { start: number; end: number; deliveries: number }[] {
  const first = Math.floor(start / size) * size;
  const count = Math.max(1, Math.ceil((end - first + 1) / size));
  const buckets = Array.from({ length: count }, (_, index) => ({
    start: first + index * size,
    end: first + (index + 1) * size,
    deliveries: 0,
  }));
  const ticks = robotId === "all"
    ? snapshot.deliveryTicks
    : snapshot.missions.filter((mission) => mission.state === "completed" && mission.robotId === robotId && mission.completedTick !== null).map((mission) => mission.completedTick as number);
  for (const tick of ticks) {
    if (tick < start || tick > end) continue;
    const index = Math.floor((tick - first) / size);
    if (buckets[index]) buckets[index].deliveries += 1;
  }
  return buckets;
}

export function topTrafficCells(snapshot: SimulationSnapshot, start: number, end: number) {
  const counts = new Map<string, { x: number; y: number; visits: number }>();
  for (const move of snapshot.movements) {
    if (move.tick < start || move.tick > end) continue;
    const key = `${move.to.x},${move.to.y}`;
    const existing = counts.get(key) ?? { ...move.to, visits: 0 };
    existing.visits += 1;
    counts.set(key, existing);
  }
  return [...counts.values()].sort((a, b) => b.visits - a.visits || a.y - b.y || a.x - b.x).slice(0, 8);
}

export function recoveryWindowCounts(snapshot: SimulationSnapshot, start: number, end: number) {
  const events = snapshot.events.filter((event) => event.tick >= start && event.tick <= end);
  const deadlocks = snapshot.deadlocks.incidents.filter((incident) => incident.detectedTick >= start && incident.detectedTick <= end);
  const failures = snapshot.recovery.failures.filter((failure) => failure.tick >= start && failure.tick <= end);
  return {
    deadlocks: deadlocks.length,
    deadlockRecoveries: deadlocks.filter((incident) => incident.status === "resolved").length,
    robotFailures: failures.length,
    robotRecoveries: failures.filter((failure) => failure.status === "restored").length,
    congestionEvents: events.filter((event) => event.kind === "robot-waiting" || event.kind === "conflict-prevented").length,
    eventCount: events.length,
  };
}
