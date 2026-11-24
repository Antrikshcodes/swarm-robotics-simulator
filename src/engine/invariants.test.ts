import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "../types/simulation";
import { createSimulationSource } from "./index";
import { checkInvariants } from "./invariants";

type DeepMutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T[K] extends object
      ? DeepMutable<T[K]>
      : T[K];
};

function mutableClone(snapshot: SimulationSnapshot): DeepMutable<SimulationSnapshot> {
  return structuredClone(snapshot) as DeepMutable<SimulationSnapshot>;
}

describe("checkInvariants", () => {
  it("passes cleanly across healthy simulation ticks", () => {
    const engine = createSimulationSource("standard");
    expect(checkInvariants(engine.getSnapshot())).toEqual([]);
    for (let i = 0; i < 40; i += 1) {
      expect(checkInvariants(engine.step())).toEqual([]);
    }
  });

  it("detects spatial occupancy, bounds, step distance, and battery violations", () => {
    const engine = createSimulationSource("standard");
    const snap = mutableClone(engine.getSnapshot());
    const [r0, r1, r2, r3] = snap.robots;

    r0.position = { x: -1, y: 0 };
    const rackIndex = snap.layout.cells.findIndex((c) => c === "rack");
    r1.position = {
      x: rackIndex % snap.layout.width,
      y: Math.floor(rackIndex / snap.layout.width),
    };
    r1.previousPosition = { ...r1.position };
    r2.position = { ...r3.position };
    r2.battery = 105;

    const violations = checkInvariants(snap);
    expect(violations.some((msg) => msg.includes("outside the warehouse"))).toBe(true);
    expect(violations.some((msg) => msg.includes("moved more than one cell"))).toBe(true);
    expect(violations.some((msg) => msg.includes("non-traversable cell"))).toBe(true);
    expect(violations.some((msg) => msg.includes("occupy the same cell"))).toBe(true);
    expect(violations.some((msg) => msg.includes("battery out of range"))).toBe(true);
  });

  it("detects head-on cell swaps and movement while failed", () => {
    const engine = createSimulationSource("standard");
    const snap = mutableClone(engine.getSnapshot());
    const [a, b, c] = snap.robots;

    a.previousPosition = { x: 2, y: 1 };
    a.position = { x: 3, y: 1 };
    b.previousPosition = { x: 3, y: 1 };
    b.position = { x: 2, y: 1 };

    c.status = "failed";
    c.previousPosition = { x: 5, y: 1 };
    c.position = { x: 6, y: 1 };

    const violations = checkInvariants(snap);
    expect(violations.some((msg) => msg.includes("swapped cells"))).toBe(true);
    expect(violations.some((msg) => msg.includes("moved while failed"))).toBe(true);
  });

  it("detects package custody and mission consistency mismatches", () => {
    const engine = createSimulationSource("standard");
    engine.step();
    const snap = mutableClone(engine.getSnapshot());

    const activeMission = snap.missions.find((m) => m.robotId !== null)!;
    const carrier = snap.robots.find((r) => r.id === activeMission.robotId)!;
    carrier.packageId = "PKG-UNKNOWN";

    snap.packages.push({
      id: "PKG-BAD",
      missionId: activeMission.id,
      state: "available",
      originStationId: "PK-01",
      destinationStationId: "DP-01",
      holderRobotId: carrier.id,
      location: { kind: "station", stationId: "PK-01" },
      recovery: null,
      history: [],
    });

    const violations = checkInvariants(snap);
    expect(violations.some((msg) => msg.includes("carries unknown package PKG-UNKNOWN"))).toBe(true);
    expect(violations.some((msg) => msg.includes("PKG-BAD is available but held"))).toBe(true);
  });
});
