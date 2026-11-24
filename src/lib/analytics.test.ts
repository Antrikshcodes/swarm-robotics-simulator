import { describe, expect, it } from "vitest";
import { createSimulationSource } from "../engine";
import { deliveryBuckets, filteredMissions, rangeStart, topTrafficCells } from "./analytics";

describe("analytics derivations", () => {
  it("bounds selectable windows to the current simulation tick", () => {
    expect(rangeStart(80, 100)).toBe(0);
    expect(rangeStart(180, 100)).toBe(81);
    expect(rangeStart(180, "all")).toBe(0);
  });

  it("filters missions by time, status, and robot without mutating the snapshot", () => {
    const engine = createSimulationSource("standard");
    engine.dispatch({ type: "start" });
    engine.step();
    const snapshot = engine.getSnapshot();
    const before = snapshot.missions.length;
    const assigned = snapshot.missions.find((mission) => mission.robotId !== null);
    expect(assigned).toBeDefined();
    const selected = filteredMissions(snapshot.missions, 0, snapshot.tick, "active", assigned?.robotId ?? "all");
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((mission) => mission.robotId === assigned?.robotId && mission.state !== "completed" && mission.state !== "cancelled")).toBe(true);
    expect(snapshot.missions).toHaveLength(before);
  });

  it("keeps delivery buckets empty and stable when a run has no deliveries", () => {
    const engine = createSimulationSource("standard");
    const buckets = deliveryBuckets(engine.getSnapshot(), 0, 0, "all", 25);
    expect(buckets).toEqual([{ start: 0, end: 25, deliveries: 0 }]);
  });

  it("derives traffic concentration from actual movement records", () => {
    const engine = createSimulationSource("standard");
    const snapshot = engine.getSnapshot();
    engine.dispatch({ type: "start" });
    for (let i = 0; i < 20; i += 1) engine.step();
    const live = engine.getSnapshot();
    const cells = topTrafficCells(live, 0, live.tick);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => cell.visits > 0)).toBe(true);
    expect(snapshot.movements).toHaveLength(0);
  });
});
