import { getScenario } from "@/engine";
import { missionCycleStats } from "@/lib/selectors";
import type { ArchivedRunSummary } from "@/store/run-archive";
import type { SimulationSnapshot } from "@/types/simulation";

export interface SwarmRunReport {
  readonly schemaVersion: "1.0.0";
  readonly scenario: {
    readonly id: string;
    readonly name: string;
    readonly grid: { readonly width: number; readonly height: number };
  };
  readonly tick: number;
  readonly metrics: SimulationSnapshot["metrics"];
  readonly cycleStats: ReturnType<typeof missionCycleStats>;
  readonly coordination: SimulationSnapshot["coordination"]["stats"];
  readonly deadlocks: SimulationSnapshot["deadlocks"]["stats"];
  readonly recovery: SimulationSnapshot["recovery"]["stats"];
  readonly robots: readonly {
    readonly id: string;
    readonly status: string;
    readonly battery: number;
    readonly stats: SimulationSnapshot["robots"][number]["stats"];
  }[];
  readonly archivedRuns: readonly ArchivedRunSummary[];
}

export function buildRunReport(
  snapshot: SimulationSnapshot,
  archivedRuns: readonly ArchivedRunSummary[] = [],
): SwarmRunReport {
  const scenario = getScenario(snapshot.scenarioId);
  return {
    schemaVersion: "1.0.0",
    scenario: {
      id: snapshot.scenarioId,
      name: scenario.name,
      grid: { width: snapshot.layout.width, height: snapshot.layout.height },
    },
    tick: snapshot.tick,
    metrics: snapshot.metrics,
    cycleStats: missionCycleStats(snapshot),
    coordination: snapshot.coordination.stats,
    deadlocks: snapshot.deadlocks.stats,
    recovery: snapshot.recovery.stats,
    robots: snapshot.robots.map((r) => ({
      id: r.id,
      status: r.status,
      battery: Number(r.battery.toFixed(2)),
      stats: r.stats,
    })),
    archivedRuns: [...archivedRuns],
  };
}

export function serializeRunReport(
  snapshot: SimulationSnapshot,
  archivedRuns: readonly ArchivedRunSummary[] = [],
): string {
  return JSON.stringify(buildRunReport(snapshot, archivedRuns), null, 2);
}

export function downloadRunReport(
  snapshot: SimulationSnapshot,
  archivedRuns: readonly ArchivedRunSummary[] = [],
): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const json = serializeRunReport(snapshot, archivedRuns);
  const blob = new Blob([json], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `swarm-${snapshot.scenarioId}-t${String(snapshot.tick).padStart(4, "0")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}
