import { describe, expect, it } from "vitest";
import { checkInvariants, createSimulationSource, getCompiledScenario, getScenario, SCENARIOS } from "@/engine";

describe("scenarios registry and deterministic execution", () => {
  it("compiles all 14 shipped scenarios cleanly with valid coordinates", () => {
    expect(SCENARIOS.length).toBe(14);
    for (const def of SCENARIOS) {
      const compiled = getCompiledScenario(def.id);
      expect(getScenario(def.id).id).toBe(def.id);
      expect(compiled.layout.width).toBeGreaterThan(0);
      expect(compiled.layout.height).toBeGreaterThan(0);
      expect(compiled.definition.robots.length).toBeGreaterThan(0);
    }
    expect(() => getScenario("unknown-scenario")).toThrow(/Unknown scenario/);
  });

  it.each(SCENARIOS.map((s) => [s.id, s.group ?? "operations"] as const))(
    "%s (%s) runs deterministically for 120 ticks with zero commit rejections",
    (scenarioId) => {
      const a = createSimulationSource(scenarioId);
      const b = createSimulationSource(scenarioId);

      for (let i = 0; i < 120; i += 1) {
        const snapA = a.step();
        const snapB = b.step();
        expect(() => checkInvariants(snapA)).not.toThrow();
        expect(snapA.coordination.stats.commitRejections).toBe(0);
        expect(snapA.tick).toBe(snapB.tick);
        expect(snapA.robots.map((r) => r.position)).toEqual(snapB.robots.map((r) => r.position));
      }

      const end = a.getSnapshot();
      const replayed = a.seek(60);
      expect(replayed.tick).toBe(60);
      expect(() => checkInvariants(replayed)).not.toThrow();
      const backToEnd = a.seek(end.tick);
      expect(backToEnd.metrics.completedDeliveries).toBe(end.metrics.completedDeliveries);
      expect(backToEnd.robots.map((r) => r.position)).toEqual(end.robots.map((r) => r.position));
    },
  );
});
