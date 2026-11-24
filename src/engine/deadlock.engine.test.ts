import { describe, expect, it } from "vitest";
import type { SimEvent, SimulationSnapshot } from "../types/simulation";
import { createSimulationSource, SCENARIOS } from "./index";
import type { DeadlockOptions } from "./deadlock/deadlock-manager";
import type { WarehouseEngine } from "./warehouse-engine";

const LAB = SCENARIOS.filter((s) => s.group === "lab").map((s) => s.id);
const OPS = SCENARIOS.filter((s) => s.group !== "lab").map((s) => s.id);

const DEADLOCK_KINDS = new Set([
  "deadlock_detected",
  "deadlock_group_identified",
  "deadlock_recovery_started",
  "robot_yielded",
  "recovery_route_planned",
  "deadlock_resolved",
  "deadlock_recovery_failed",
]);

interface Run {
  readonly engine: WarehouseEngine;
  readonly snap: SimulationSnapshot;
  readonly events: SimEvent[];
}

/** Runs a scenario with per-tick invariants and safety checks, collecting every event. */
function run(id: string, ticks: number, deadlock?: DeadlockOptions): Run {
  const engine = createSimulationSource(id, { checkInvariants: true, deadlock });
  const events = new Map<string, SimEvent>();
  let prev = engine.getSnapshot();
  for (let i = 0; i < ticks; i += 1) {
    const next = engine.step();
    // Safety: no two robots in one cell, no swaps, no teleports.
    const cells = new Set<string>();
    for (const r of next.robots) {
      const key = `${r.position.x},${r.position.y}`;
      expect(cells.has(key), `two robots on ${key} at tick ${next.tick}`).toBe(false);
      cells.add(key);
      const before = prev.robots.find((b) => b.id === r.id)!;
      expect(Math.abs(before.position.x - r.position.x) + Math.abs(before.position.y - r.position.y)).toBeLessThanOrEqual(1);
    }
    for (const a of next.robots) {
      for (const b of next.robots) {
        if (a.id >= b.id) continue;
        const pa = prev.robots.find((r) => r.id === a.id)!.position;
        const pb = prev.robots.find((r) => r.id === b.id)!.position;
        const swapped = pa.x === b.position.x && pa.y === b.position.y && pb.x === a.position.x && pb.y === a.position.y;
        expect(swapped, `${a.id}/${b.id} swapped at tick ${next.tick}`).toBe(false);
      }
    }
    for (const e of next.events) events.set(e.id, e);
    prev = next;
  }
  return { engine, snap: prev, events: [...events.values()].sort((a, b) => a.tick - b.tick) };
}

const kinds = (r: Run) => r.events.filter((e) => DEADLOCK_KINDS.has(e.kind)).map((e) => e.kind);
const atHome = (s: SimulationSnapshot) => s.robots.every((r) => r.position.x === r.home.x && r.position.y === r.home.y);

describe("deadlock lab scenarios", () => {
  it("A — two-robot deadlock is detected, one robot yields and both reach their goals", () => {
    const r = run("lab-a-two-robot", 120);
    const k = kinds(r);
    expect(k[0]).toBe("deadlock_detected");
    expect(k).toContain("robot_yielded");
    expect(k).toContain("recovery_route_planned");
    expect(k).toContain("deadlock_resolved");
    expect(k).not.toContain("deadlock_recovery_failed");
    const incident = r.snap.deadlocks.incidents[0];
    expect(incident.robots).toEqual(["R-01", "R-02"]);
    expect(incident.status).toBe("resolved");
    expect(atHome(r.snap)).toBe(true);
  });

  it("B — three-robot circular wait identifies all participants and is resolved", () => {
    const r = run("lab-b-three-robot", 200);
    const first = r.snap.deadlocks.incidents[0];
    expect(first.robots).toEqual(["R-01", "R-02", "R-03"]);
    expect(first.kind).toBe("cycle");
    expect(r.snap.deadlocks.incidents.every((i) => i.status === "resolved")).toBe(true);
    expect(atHome(r.snap)).toBe(true);
  });

  it("C — narrow aisle: a robot backs out to a holding bay, the passage clears, no back-and-forth", () => {
    const r = run("lab-c-narrow-aisle", 250);
    expect(r.snap.deadlocks.stats.detected).toBeGreaterThanOrEqual(1);
    expect(r.snap.deadlocks.stats.failed).toBe(0);
    for (const incident of r.snap.deadlocks.incidents) {
      expect(incident.status).toBe("resolved");
      expect(incident.attempts.length).toBeLessThanOrEqual(r.snap.deadlocks.thresholds.maxAttempts);
    }
    // Bounded: the same robot group is never reopened endlessly.
    expect(r.snap.deadlocks.stats.detected).toBeLessThanOrEqual(3);
    expect(r.snap.metrics.completedDeliveries).toBeGreaterThanOrEqual(1);
  });

  it("D — temporary congestion is never classified as a deadlock", () => {
    const r = run("lab-d-congestion", 300);
    expect(kinds(r)).toEqual([]);
    expect(r.snap.deadlocks.stats.detected).toBe(0);
  });

  it("E — an unrecoverable deadlock fails safely: robots held, no reset, event emitted", () => {
    const r = run("lab-e-unrecoverable", 150);
    expect(kinds(r)).toContain("deadlock_recovery_failed");
    const incident = r.snap.deadlocks.incidents[0];
    expect(incident.status).toBe("failed");
    expect(incident.failureReason).toBeTruthy();
    // After the failure, robots stay put in a safe waiting state (no teleport, no reset).
    const failTick = r.events.find((e) => e.kind === "deadlock_recovery_failed")!.tick;
    const atFailure = r.engine.seek(failTick).robots.map((x) => x.position);
    const later = r.engine.seek(150);
    expect(later.robots.map((x) => x.position)).toEqual(atFailure);
    expect(later.robots.every((x) => x.waitClass === "deadlock")).toBe(true);
    expect(later.tick).toBe(150);
    // Failure is emitted once per world version, not every tick.
    expect(kinds(r).filter((x) => x === "deadlock_recovery_failed")).toHaveLength(1);
  });

  it("without recovery, genuine deadlocks are detected but persist", () => {
    for (const id of ["lab-a-two-robot", "lab-b-three-robot", "lab-c-narrow-aisle"]) {
      const r = run(id, 120, { recovery: false });
      expect(r.snap.deadlocks.stats.detected, id).toBeGreaterThanOrEqual(1);
      expect(r.snap.deadlocks.stats.resolved, id).toBe(0);
      expect(kinds(r), id).not.toContain("robot_yielded");
      expect(r.snap.deadlocks.incidents.some((i) => i.status === "detected"), id).toBe(true);
    }
  });

  it("every deadlock event carries tick, robots, action, attempt and status", () => {
    for (const id of LAB) {
      for (const e of run(id, 150).events.filter((x) => DEADLOCK_KINDS.has(x.kind))) {
        expect(e.incidentId, `${id} ${e.kind}`).toMatch(/^DL-\d{4}$/);
        expect(e.robotIds?.length, `${id} ${e.kind}`).toBeGreaterThan(0);
        expect(e.status, `${id} ${e.kind}`).toBeTruthy();
        expect(e.action, `${id} ${e.kind}`).toBeTruthy();
        expect(typeof e.attempt, `${id} ${e.kind}`).toBe("number");
        expect(e.cell, `${id} ${e.kind}`).toBeDefined();
      }
    }
  });
});

describe("recovery safety", () => {
  it.each(LAB)("%s: custody is preserved through recovery", (id) => {
    const r = run(id, 200);
    for (const pkg of r.snap.packages) {
      const holders = r.snap.robots.filter((x) => x.packageId === pkg.id);
      expect(holders.length).toBeLessThanOrEqual(1);
    }
    // Missions are never deleted or cancelled by recovery.
    const initial = createSimulationSource(id).getSnapshot().missions.map((m) => m.id);
    const final = new Set(r.snap.missions.map((m) => m.id));
    for (const m of initial) expect(final.has(m), `${id} lost ${m}`).toBe(true);
    expect(r.events.filter((e) => e.kind === "mission-cancelled")).toEqual([]);
  });

  it("recovery is deterministic, including through seek", () => {
    const a = run("lab-b-three-robot", 120);
    const b = run("lab-b-three-robot", 120);
    const sig = (x: Run) => x.events.filter((e) => DEADLOCK_KINDS.has(e.kind)).map((e) => `${e.tick}:${e.kind}:${e.robotId ?? ""}:${e.attempt ?? ""}`);
    expect(sig(a)).toEqual(sig(b));
    expect(a.snap.deadlocks).toEqual(b.snap.deadlocks);
    const seeked = a.engine.seek(60);
    const fresh = run("lab-b-three-robot", 60).snap;
    expect(seeked.deadlocks).toEqual(fresh.deadlocks);
    expect(seeked.robots.map((x) => x.position)).toEqual(fresh.robots.map((x) => x.position));
  });

  it("a world change (aisle closure) lets a failed incident retry with a fresh, bounded budget", () => {
    const r = run("lab-e-unrecoverable", 40);
    const result = r.engine.dispatch({ type: "close_aisle", cells: [{ x: 1, y: 1 }], label: "test" });
    expect(result.ok).toBe(true);
    let snap = r.snap;
    for (let i = 0; i < 40; i += 1) snap = r.engine.step();
    const failures = snap.events.filter((e) => e.kind === "deadlock_recovery_failed");
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.length).toBeLessThanOrEqual(2);
    // Closing R-02's home makes its goal unreachable, so the circular wait can dissolve;
    // either way the incident is re-evaluated, never reset or duplicated.
    expect(["failed", "resolved"]).toContain(snap.deadlocks.incidents[0].status);
    expect(snap.deadlocks.incidents).toHaveLength(1);
  });
});

describe("no regressions in operational scenarios", () => {
  it.each(OPS)("%s: long run (3 000 ticks) has no deadlocks and keeps delivering", (id) => {
    const r = run(id, 3000);
    expect(r.snap.deadlocks.stats.failed).toBe(0);
    expect(r.snap.deadlocks.incidents.filter((i) => i.status !== "resolved")).toEqual([]);
    expect(r.snap.deliveryTicks.length).toBeGreaterThan(100);
  });
});
