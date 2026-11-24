import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import { buildRobotTimeline } from "./robot-timeline";

describe("buildRobotTimeline", () => {
  it("captures mission deliveries and coordination decisions for active robots", () => {
    const engine = createSimulationSource("standard");
    for (let i = 0; i < 70; i += 1) engine.step();
    const snap = engine.getSnapshot();

    const tl = buildRobotTimeline(snap, "R-01");
    expect(tl.robotId).toBe("R-01");
    expect(tl.entries.length).toBeGreaterThan(0);
    expect(tl.summary.deliveries).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < tl.entries.length; i += 1) {
      expect(tl.entries[i - 1].tick).toBeGreaterThanOrEqual(tl.entries[i].tick);
    }
  });

  it("traces deadlock yield attempts and recovery roles", () => {
    const dlEngine = createSimulationSource("lab-a-two-robot");
    for (let i = 0; i < 30; i += 1) dlEngine.step();
    const dlSnap = dlEngine.getSnapshot();

    const r1 = buildRobotTimeline(dlSnap, "R-01");
    const r2 = buildRobotTimeline(dlSnap, "R-02");
    expect(r1.entries.some((e) => e.category === "deadlock")).toBe(true);
    expect(r1.summary.deadlockYields + r2.summary.deadlockYields).toBeGreaterThanOrEqual(1);
  });

  it("traces robot failure, stranded cargo, and rescuer handover", () => {
    const recEngine = createSimulationSource("rec-b-carrying");
    for (let i = 0; i < 40; i += 1) recEngine.step();
    const recSnap = recEngine.getSnapshot();

    const failedTl = buildRobotTimeline(recSnap, "R-01");
    expect(failedTl.summary.failures).toBe(1);
    expect(failedTl.entries.some((e) => e.category === "fault")).toBe(true);
    expect(failedTl.entries.some((e) => e.category === "recovery")).toBe(true);

    const rescuerTl = buildRobotTimeline(recSnap, "R-02");
    expect(rescuerTl.summary.rescues).toBe(1);
    expect(rescuerTl.entries.some((e) => e.category === "recovery")).toBe(true);
  });
});
