import { describe, expect, it } from "vitest";
import { checkInvariants, createSimulationSource, getScenario, hasScenario, SCENARIOS, STRESS_SCENARIOS } from "@/engine";

describe("synthetic stress scenarios", () => {
  it("are resolvable but kept out of the shipped scenario list", () => {
    for (const def of STRESS_SCENARIOS) {
      expect(hasScenario(def.id)).toBe(true);
      expect(getScenario(def.id).group).toBe("stress");
      expect(SCENARIOS.some((s) => s.id === def.id)).toBe(false);
    }
    expect(STRESS_SCENARIOS.map((s) => s.robots.length)).toEqual([15, 32]);
  });

  it.each(STRESS_SCENARIOS.map((s) => [s.id]))("%s runs 80 ticks safely and delivers", (id) => {
    const engine = createSimulationSource(id);
    let snap = engine.getSnapshot();
    for (let i = 0; i < 80; i += 1) {
      snap = engine.step();
      expect(() => checkInvariants(snap)).not.toThrow();
    }
    expect(snap.coordination.stats.commitRejections).toBe(0);
    expect(snap.robots.some((r) => r.missionId !== null)).toBe(true);
  });

  it("can be loaded through the engine command", () => {
    const engine = createSimulationSource("standard");
    expect(engine.dispatch({ type: "load-scenario", scenarioId: "stress-32" }).ok).toBe(true);
    expect(engine.getSnapshot().robots).toHaveLength(32);
  });
});
