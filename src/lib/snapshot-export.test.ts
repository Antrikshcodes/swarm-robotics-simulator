import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import { summarizeSnapshotRun } from "@/store/run-archive";
import { buildRunReport, serializeRunReport } from "./snapshot-export";

describe("snapshot-export", () => {
  it("builds a complete deterministic run report with archived runs", () => {
    const engine = createSimulationSource("standard");
    for (let i = 0; i < 65; i += 1) engine.step();
    const snap = engine.getSnapshot();
    const archived = [summarizeSnapshotRun(snap, 1, "manual")];

    const report = buildRunReport(snap, archived);
    expect(report.schemaVersion).toBe("1.0.0");
    expect(report.scenario.id).toBe("standard");
    expect(report.tick).toBe(65);
    expect(report.robots).toHaveLength(snap.robots.length);
    expect(report.coordination.commitRejections).toBe(0);
    expect(report.archivedRuns).toHaveLength(1);

    const parsed = JSON.parse(serializeRunReport(snap, archived)) as typeof report;
    expect(parsed.metrics.completedDeliveries).toBe(snap.metrics.completedDeliveries);
  });
});
