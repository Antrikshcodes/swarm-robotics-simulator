import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";

describe("deadlock and recovery lab milestones", () => {
  it("lab-a-two-robot detects and resolves a head-on corridor deadlock", () => {
    const engine = createSimulationSource("lab-a-two-robot");
    for (let i = 0; i < 45; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.deadlocks.stats.detected).toBeGreaterThanOrEqual(1);
    expect(snap.deadlocks.stats.resolved).toBeGreaterThanOrEqual(1);
    expect(snap.coordination.stats.commitRejections).toBe(0);
  });

  it("lab-d-congestion filters transient queuing with zero deadlock reports", () => {
    const engine = createSimulationSource("lab-d-congestion");
    for (let i = 0; i < 60; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.deadlocks.stats.detected).toBe(0);
    expect(snap.coordination.stats.commitRejections).toBe(0);
  });

  it("lab-e-unrecoverable safely fails recovery without breaking safety invariants", () => {
    const engine = createSimulationSource("lab-e-unrecoverable");
    for (let i = 0; i < 40; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.deadlocks.stats.detected).toBeGreaterThanOrEqual(1);
    expect(snap.deadlocks.stats.failed).toBeGreaterThanOrEqual(1);
    expect(snap.coordination.stats.commitRejections).toBe(0);
  });

  it("rec-b-carrying transfers stranded cargo atomically and completes delivery once", () => {
    const engine = createSimulationSource("rec-b-carrying");
    for (let i = 0; i < 60; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.recovery.stats.failures).toBe(1);
    expect(snap.recovery.stats.handovers).toBe(1);
    expect(snap.metrics.completedDeliveries).toBe(1);
    expect(snap.packages[0].state).toBe("delivered");
  });

  it("rec-c-aisle-closure replans around closed cells and completes all four deliveries", () => {
    const engine = createSimulationSource("rec-c-aisle-closure");
    for (let i = 0; i < 120; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.closures.length).toBeGreaterThanOrEqual(1);
    expect(snap.metrics.completedDeliveries).toBe(4);
    expect(snap.coordination.stats.commitRejections).toBe(0);
  });

  it("rec-f-rescuer-failure handles rescuer failure and dispatches a backup rescuer", () => {
    const engine = createSimulationSource("rec-f-rescuer-failure");
    for (let i = 0; i < 80; i += 1) engine.step();
    const snap = engine.getSnapshot();
    expect(snap.recovery.stats.failures).toBeGreaterThanOrEqual(2);
    expect(snap.recovery.stats.handovers).toBe(1);
    expect(snap.metrics.completedDeliveries).toBe(1);
  });
});
