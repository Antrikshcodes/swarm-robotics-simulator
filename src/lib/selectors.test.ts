import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import {
  averageCycleTicks,
  deriveIncidents,
  findRobot,
  findStation,
  missionCycleStats,
  robotUtilisation,
  tasksForFailure,
  throughputBuckets,
} from "./selectors";

describe("selectors", () => {
  it("finds robots and stations safely", () => {
    const engine = createSimulationSource("standard");
    const snap = engine.getSnapshot();
    expect(findRobot(snap, "R-01")?.id).toBe("R-01");
    expect(findRobot(snap, "MISSING")).toBeUndefined();
    expect(findStation(snap, "PK-01")?.kind).toBe("pickup");
    expect(findStation(snap, "MISSING")).toBeUndefined();
  });

  it("clamps throughputBuckets safely when tick is 0 or bucketSize <= 0", () => {
    const engine = createSimulationSource("standard");
    const snap = engine.getSnapshot();
    const zeroBuckets = throughputBuckets(snap, 25);
    expect(zeroBuckets).toHaveLength(1);
    expect(zeroBuckets[0]).toEqual({ start: 0, end: 25, deliveries: 0 });

    const safeBuckets = throughputBuckets({ ...snap, tick: 10, deliveryTicks: [0, 10] }, 0);
    expect(safeBuckets[0].deliveries).toBe(1);
    expect(safeBuckets[9].deliveries).toBe(1);
  });

  it("computes cycle stats and robot utilisation accurately", () => {
    const engine = createSimulationSource("standard");
    for (let i = 0; i < 80; i += 1) engine.step();
    const snap = engine.getSnapshot();

    const avg = averageCycleTicks(snap);
    const stats = missionCycleStats(snap);
    expect(avg).not.toBeNull();
    expect(stats).not.toBeNull();
    expect(stats!.count).toBeGreaterThan(0);
    expect(stats!.min).toBeLessThanOrEqual(stats!.median);
    expect(stats!.median).toBeLessThanOrEqual(stats!.max);
    expect(stats!.mean).toBeCloseTo(avg!, 6);

    const r1 = findRobot(snap, "R-01")!;
    expect(robotUtilisation(r1, 0)).toBe(0);
    expect(robotUtilisation(r1, snap.tick)).toBeGreaterThan(0);
  });

  it("derives open and resolved incidents for deadlocks, failures, and closures", () => {
    const deadlockEngine = createSimulationSource("lab-b-three-robot");
    for (let i = 0; i < 8; i += 1) deadlockEngine.step();
    const dlIncidents = deriveIncidents(deadlockEngine.getSnapshot());
    expect(dlIncidents.some((i) => i.kind === "deadlock" && i.open)).toBe(true);

    const recEngine = createSimulationSource("rec-b-carrying");
    for (let i = 0; i < 14; i += 1) recEngine.step();
    const recSnap = recEngine.getSnapshot();
    const recIncidents = deriveIncidents(recSnap);
    const failedInc = recIncidents.find((i) => i.kind === "robot-failed" && i.open);
    expect(failedInc).toBeDefined();
    expect(failedInc?.failure?.robotId).toBe("R-01");
    expect(tasksForFailure(recSnap, failedInc!.failure!).length).toBe(1);

    const closureEngine = createSimulationSource("rec-c-aisle-closure");
    for (let i = 0; i < 7; i += 1) closureEngine.step();
    const closureIncidents = deriveIncidents(closureEngine.getSnapshot());
    expect(closureIncidents.some((i) => i.kind === "aisle-closure" && i.open)).toBe(true);
  });
});
