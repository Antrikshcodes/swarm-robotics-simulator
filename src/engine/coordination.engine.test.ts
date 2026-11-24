import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "../types/simulation";
import { createSimulationSource, SCENARIOS } from "./index";
import { compileScenario, type ScenarioDefinition } from "./scenario";
import { WarehouseEngine } from "./warehouse-engine";

const engine = (id: string) => createSimulationSource(id, { checkInvariants: true });

function run(e: WarehouseEngine, ticks: number, each?: (prev: SimulationSnapshot, next: SimulationSnapshot) => void) {
  let snap = e.getSnapshot();
  for (let i = 0; i < ticks; i += 1) {
    const next = e.step();
    each?.(snap, next);
    snap = next;
  }
  return snap;
}

/** 4 robots, two zones joined only by a one-cell passage (row 2, x 4–8). */
const PASSAGE: ScenarioDefinition = {
  id: "passage-contest",
  name: "Passage contest",
  summary: "",
  focus: "",
  seed: 11,
  map: [
    "P...#####...D",
    ".............".replace(/./g, (c, i) => (i >= 4 && i <= 8 ? "#" : c)),
    "....=====....",
    ".............".replace(/./g, (c, i) => (i >= 4 && i <= 8 ? "#" : c)),
    "D...#####...P",
  ],
  robots: [
    { id: "R-01", model: "T", colorIndex: 1, heading: "E", battery: 90, home: { x: 1, y: 1 } },
    { id: "R-02", model: "T", colorIndex: 2, heading: "E", battery: 90, home: { x: 1, y: 3 } },
    { id: "R-03", model: "T", colorIndex: 3, heading: "W", battery: 90, home: { x: 11, y: 1 } },
    { id: "R-04", model: "T", colorIndex: 4, heading: "W", battery: 90, home: { x: 11, y: 3 } },
  ],
  missions: [
    { pickup: "PK-01", dropoff: "DO-01" }, // west → east
    { pickup: "PK-02", dropoff: "DO-02" }, // east → west
    { pickup: "PK-01", dropoff: "DO-01" },
    { pickup: "PK-02", dropoff: "DO-02" },
  ],
  handling: { loadTicks: 2, unloadTicks: 2 },
};

describe("coordination in the engine", () => {
  it.each(SCENARIOS.map((s) => s.id))("%s: every committed move was reserved, and the commit check never fires (2 000 ticks)", (id) => {
    const e = engine(id);
    const snap = run(e, 2000, (prev, next) => {
      for (const robot of next.robots) {
        const before = prev.robots.find((r) => r.id === robot.id)!;
        if (robot.position.x === before.position.x && robot.position.y === before.position.y) continue;
        const reserved = next.coordination.reservations.some(
          (r) => r.robotId === robot.id && r.tick === next.tick && r.x === robot.position.x && r.y === robot.position.y,
        );
        expect(reserved, `${robot.id} entered (${robot.position.x},${robot.position.y}) at ${next.tick} without a reservation`).toBe(true);
      }
      const keys = next.coordination.reservations.map((r) => `${r.tick}|${r.x},${r.y}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
    expect(snap.coordination.stats.commitRejections).toBe(0);
    if (SCENARIOS.find((s) => s.id === id)?.group !== "lab") expect(snap.metrics.completedDeliveries).toBeGreaterThan(50);
  });

  it("robots move concurrently, not one at a time", () => {
    const e = engine("high-density");
    let multi = 0;
    run(e, 500, (prev, next) => {
      const moved = next.robots.filter((r, i) => r.position.x !== prev.robots[i].position.x || r.position.y !== prev.robots[i].position.y);
      if (moved.length >= 3) multi += 1;
    });
    expect(multi).toBeGreaterThan(150);
  });

  it("multiple robots competing for a one-cell passage all deliver safely", () => {
    const e = new WarehouseEngine(compileScenario(PASSAGE), { checkInvariants: true });
    const waits: string[] = [];
    const snap = run(e, 200, (_prev, next) => {
      for (const edge of next.coordination.waitGraph) waits.push(`${edge.robotId}->${edge.waitingFor}`);
    });
    expect(snap.missions.every((m) => m.state === "completed")).toBe(true);
    expect(snap.coordination.stats.commitRejections).toBe(0);
    // Someone had to wait for someone else — and the wait names a real robot.
    expect(waits.length).toBeGreaterThan(0);
    for (const w of waits) {
      const [a, b] = w.split("->");
      expect(PASSAGE.robots.map((r) => r.id)).toContain(a);
      expect(PASSAGE.robots.map((r) => r.id)).toContain(b);
    }
  });

  it("urgent missions are assigned first and their robot gets higher movement priority", () => {
    const e = new WarehouseEngine(
      compileScenario({ ...PASSAGE, robots: [PASSAGE.robots[0]], missions: [] }),
      { checkInvariants: true },
    );
    e.dispatch({ type: "add-mission", pickupStationId: "PK-01", dropoffStationId: "DO-01" });
    const urgent = e.dispatch({ type: "add-mission", pickupStationId: "PK-02", dropoffStationId: "DO-02", priority: "urgent" });
    const snap = e.step();
    const id = urgent.ok ? urgent.value.entityId : "";
    expect(snap.missions.find((m) => m.id === id)?.robotId).toBe("R-01");
    expect(snap.missions.find((m) => m.priority === "normal")?.state).toBe("queued");
    expect(snap.robots[0].priority).toBeGreaterThanOrEqual(60);
    expect(e.dispatch({ type: "add-mission", pickupStationId: "PK-01", dropoffStationId: "DO-01", priority: "asap" as never })).toMatchObject({
      ok: false,
      error: { code: "invalid-priority" },
    });
  });

  it("closing a cell releases reservations through it and rebuilds routes around it", () => {
    const e = engine("standard");
    run(e, 20);
    const before = e.getSnapshot();
    const target = before.coordination.reservations.find((r) => r.tick > before.tick + 3);
    expect(target).toBeDefined();
    const cell = { x: target!.x, y: target!.y };
    const occupied = before.robots.some((r) => r.position.x === cell.x && r.position.y === cell.y);
    if (occupied) return; // extremely unlikely; nothing to assert
    const result = e.dispatch({ type: "close-aisle", cells: [cell] });
    expect(result.ok).toBe(true);
    const after = e.step();
    expect(after.coordination.reservations.some((r) => r.x === cell.x && r.y === cell.y)).toBe(false);
    const later = run(e, 100);
    for (const r of later.robots) expect(r.plan.some((p) => p.x === cell.x && p.y === cell.y)).toBe(false);
    expect(later.coordination.stats.commitRejections).toBe(0);
  });

  it("a failed robot keeps only a permanent hold; nobody plans through its cell", () => {
    const e = engine("standard");
    run(e, 15);
    const victim = e.getSnapshot().robots.find((r) => r.status === "moving" || r.status === "carrying")!;
    e.dispatch({ type: "fail-robot", robotId: victim.id });
    const snap = run(e, 60);
    const robot = snap.robots.find((r) => r.id === victim.id)!;
    expect(snap.coordination.reservations.some((r) => r.robotId === victim.id)).toBe(false);
    expect(snap.coordination.holds.find((h) => h.robotId === victim.id)).toMatchObject({ x: robot.position.x, y: robot.position.y });
    for (const other of snap.robots) {
      if (other.id === victim.id) continue;
      expect(other.plan.some((p) => p.x === robot.position.x && p.y === robot.position.y)).toBe(false);
    }
  });

  it("missions waiting on a station blocked by a failed robot are requeued, not stranded", () => {
    const e = engine("high-density");
    const snap = run(e, 400);
    const r7 = snap.robots.find((r) => r.id === "R-07")!;
    expect(r7.status).toBe("failed");
    const blockedStation = snap.layout.stations.find((s) => s.position.x === r7.position.x && s.position.y === r7.position.y);
    if (blockedStation) {
      // No active mission targets the blocked station.
      for (const m of snap.missions) {
        if (m.state === "assigned" || m.state === "to-pickup") expect(m.pickupStationId).not.toBe(blockedStation.id);
      }
    }
    expect(snap.metrics.completedDeliveries).toBeGreaterThan(30);
  });

  it("coordination output is deterministic", () => {
    const a = run(engine("narrow-aisle"), 600);
    const b = run(engine("narrow-aisle"), 600);
    expect(JSON.stringify(a.coordination)).toEqual(JSON.stringify(b.coordination));
    expect(a.coordination.decisions.length).toBeGreaterThan(0);
  });

  it("runs 5 000 ticks with invariants on every tick", () => {
    const snap = run(engine("standard"), 5000);
    expect(snap.tick).toBe(5000);
    expect(snap.coordination.stats.commitRejections).toBe(0);
    expect(snap.metrics.completedDeliveries).toBeGreaterThan(250);
  });
});
