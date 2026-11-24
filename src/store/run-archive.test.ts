import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import { appendArchivedRun, MAX_ARCHIVED_RUNS, summarizeSnapshotRun } from "./run-archive";

describe("run-archive", () => {
  it("summarizes an engine snapshot accurately", () => {
    const engine = createSimulationSource("high-density");
    for (let i = 0; i < 120; i += 1) engine.step();
    const snap = engine.getSnapshot();

    const summary = summarizeSnapshotRun(snap, 1, "scenario-switch");
    expect(summary.id).toBe("RUN-001");
    expect(summary.scenarioId).toBe("high-density");
    expect(summary.ticks).toBe(120);
    expect(summary.robots).toBe(8);
    expect(summary.deliveries).toBe(snap.metrics.completedDeliveries);
    expect(summary.deliveriesPer100Ticks).toBeGreaterThan(0);
    expect(summary.failures).toBe(1);
    expect(summary.commitRejections).toBe(0);
  });

  it("prepends newest runs and enforces archive retention limit", () => {
    const engine = createSimulationSource("standard");
    engine.step();
    const snap = engine.getSnapshot();

    let archive = [] as ReturnType<typeof summarizeSnapshotRun>[];
    for (let i = 1; i <= MAX_ARCHIVED_RUNS + 5; i += 1) {
      archive = appendArchivedRun(archive, summarizeSnapshotRun(snap, i, "reset"));
    }
    expect(archive).toHaveLength(MAX_ARCHIVED_RUNS);
    expect(archive[0].seq).toBe(MAX_ARCHIVED_RUNS + 5);
    expect(archive.at(-1)?.seq).toBe(6);
  });
});
