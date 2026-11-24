import { getScenario } from "@/engine";
import type { SimulationSnapshot } from "@/types/simulation";

export const MAX_ARCHIVED_RUNS = 20;

export interface ArchivedRunSummary {
  readonly id: string;
  readonly seq: number;
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly ticks: number;
  readonly robots: number;
  readonly deliveries: number;
  readonly deliveriesPer100Ticks: number;
  readonly cancelledMissions: number;
  readonly utilisation: number;
  readonly avgWaitingTicks: number;
  readonly totalDistance: number;
  readonly deadlocksDetected: number;
  readonly deadlocksResolved: number;
  readonly failures: number;
  readonly handovers: number;
  readonly commitRejections: number;
  readonly reason: "reset" | "scenario-switch" | "manual";
}

/**
 * Projects a finished or paused engine snapshot into a compact, immutable run
 * summary suitable for cross-scenario comparison in `/analytics`.
 */
export function summarizeSnapshotRun(
  snapshot: SimulationSnapshot,
  seq: number,
  reason: ArchivedRunSummary["reason"],
): ArchivedRunSummary {
  const scenario = getScenario(snapshot.scenarioId);
  const robotCount = Math.max(1, snapshot.robots.length);
  const avgWaitingTicks =
    snapshot.robots.reduce((sum, r) => sum + r.stats.waitingTicks, 0) / robotCount;
  const totalDistance = snapshot.robots.reduce((sum, r) => sum + r.stats.distance, 0);
  const cancelledMissions = snapshot.missions.filter((m) => m.state === "cancelled").length;
  const deliveries = snapshot.metrics.completedDeliveries;
  const deliveriesPer100Ticks =
    snapshot.tick > 0 ? Number(((deliveries / snapshot.tick) * 100).toFixed(2)) : 0;

  return {
    id: `RUN-${String(seq).padStart(3, "0")}`,
    seq,
    scenarioId: snapshot.scenarioId,
    scenarioName: scenario.name,
    ticks: snapshot.tick,
    robots: snapshot.robots.length,
    deliveries,
    deliveriesPer100Ticks,
    cancelledMissions,
    utilisation: snapshot.metrics.utilisation,
    avgWaitingTicks: Number(avgWaitingTicks.toFixed(1)),
    totalDistance,
    deadlocksDetected: snapshot.deadlocks.stats.detected,
    deadlocksResolved: snapshot.deadlocks.stats.resolved,
    failures: snapshot.recovery.failures.length,
    handovers: snapshot.recovery.stats.handovers,
    commitRejections: snapshot.coordination.stats.commitRejections,
    reason,
  };
}

export function appendArchivedRun(
  archive: readonly ArchivedRunSummary[],
  entry: ArchivedRunSummary,
  limit = MAX_ARCHIVED_RUNS,
): ArchivedRunSummary[] {
  const next = [entry, ...archive];
  return next.length > limit ? next.slice(0, limit) : next;
}
