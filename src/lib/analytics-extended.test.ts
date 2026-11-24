import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import {
  deliveryBuckets,
  deliveryCount,
  filteredMissions,
  filteredRobots,
  isActive,
  matchesMissionFilter,
  missionInRange,
  recoveryWindowCounts,
  topTrafficCells,
} from "./analytics";

describe("analytics extended filtering", () => {
  it("filters robots and active vs terminal mission states accurately", () => {
    expect(isActive("queued")).toBe(true);
    expect(isActive("recovery-required")).toBe(true);
    expect(isActive("completed")).toBe(false);
    expect(isActive("cancelled")).toBe(false);

    const engine = createSimulationSource("standard");
    for (let i = 0; i < 90; i += 1) engine.step();
    const snap = engine.getSnapshot();

    expect(filteredRobots(snap.robots, "all")).toHaveLength(snap.robots.length);
    expect(filteredRobots(snap.robots, "R-01")).toHaveLength(1);

    const allDeliveries = deliveryCount(snap, 0, snap.tick, "all");
    const r1Deliveries = deliveryCount(snap, 0, snap.tick, "R-01");
    expect(allDeliveries).toBe(snap.metrics.completedDeliveries);
    expect(r1Deliveries).toBeLessThanOrEqual(allDeliveries);

    const completed = filteredMissions(snap.missions, 0, snap.tick, "completed", "all");
    expect(completed.every((m) => matchesMissionFilter(m, "completed"))).toBe(true);
    expect(completed.every((m) => missionInRange(m, 0, snap.tick))).toBe(true);

    const buckets = deliveryBuckets(snap, 0, snap.tick, "R-01", 25);
    expect(buckets.reduce((sum, b) => sum + b.deliveries, 0)).toBe(r1Deliveries);
  });

  it("derives deadlock, failure, and top traffic counts inside tick windows", () => {
    const engine = createSimulationSource("high-density");
    for (let i = 0; i < 100; i += 1) engine.step();
    const snap = engine.getSnapshot();

    const fullWindow = recoveryWindowCounts(snap, 0, snap.tick);
    expect(fullWindow.robotFailures).toBe(1);
    expect(fullWindow.eventCount).toBeGreaterThan(0);

    const preFault = recoveryWindowCounts(snap, 0, 20);
    expect(preFault.robotFailures).toBe(0);

    const cells = topTrafficCells(snap, 0, snap.tick);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < cells.length; i += 1) {
      expect(cells[i - 1].visits).toBeGreaterThanOrEqual(cells[i].visits);
    }
  });
});
