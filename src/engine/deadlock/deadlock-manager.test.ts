import { describe, expect, it } from "vitest";
import { DeadlockManager, type DeadlockInput, type DeadlockRobotInput } from "./deadlock-manager";

/** Synthetic robot on a 1-D strip: cell = x. */
function robot(id: string, rank: number, cell: number, goal: number, extra: Partial<DeadlockRobotInput> = {}): DeadlockRobotInput {
  const step = goal > cell ? 1 : -1;
  const route: number[] = [];
  for (let c = cell + step; goal !== cell && c !== goal + step; c += step) route.push(c);
  return {
    id,
    rank,
    cell,
    goal,
    mode: "mobile",
    waiting: true,
    waitStreak: 10,
    reservationBlocker: null,
    hasMission: false,
    missionWeight: 0,
    carrying: false,
    onNarrow: false,
    distanceToGoal: Math.abs(goal - cell),
    routeAhead: route,
    fullRoute: route,
    planComplete: false,
    plannedRoute: [],
    ...extra,
  };
}

function input(tick: number, robots: DeadlockRobotInput[], findHolding: DeadlockInput["findHolding"] = () => null, worldVersion = 0): DeadlockInput {
  return {
    tick,
    robots,
    occupant: new Map(robots.map((r) => [r.cell, r.id])),
    holder: new Map(),
    worldVersion,
    findHolding,
  };
}

// A at 2 → 6, B at 4 → 0: head-on, each needs the other's cell.
const headOn = () => [robot("A", 0, 2, 6), robot("B", 1, 4, 0)];

describe("deadlock detector", () => {
  it("confirms a two-robot cycle only after it persists for confirmTicks", () => {
    const m = new DeadlockManager({ confirmTicks: 4, recovery: false });
    for (let t = 1; t <= 3; t += 1) {
      const u = m.update(input(t, headOn()));
      expect(u.events.filter((e) => e.kind === "deadlock_detected")).toHaveLength(0);
    }
    const u = m.update(input(4, headOn()));
    expect(u.events.map((e) => e.kind)).toEqual(["deadlock_detected", "deadlock_group_identified"]);
    expect(m.snapshot((c) => ({ x: c, y: 0 }), () => 0).incidents[0].robots).toEqual(["A", "B"]);
  });

  it("requires every member to have waited long enough (persistent waiting threshold)", () => {
    const m = new DeadlockManager({ confirmTicks: 4, recovery: false });
    const fresh = [robot("A", 0, 2, 6, { waitStreak: 1 }), robot("B", 1, 4, 0, { waitStreak: 1 })];
    for (let t = 1; t <= 6; t += 1) expect(m.update(input(t, fresh)).events).toHaveLength(0);
  });

  it("counts short-lived cycles as transient congestion, not deadlock", () => {
    const m = new DeadlockManager({ confirmTicks: 4, recovery: false });
    m.update(input(1, headOn()));
    m.update(input(2, headOn()));
    m.update(input(3, [robot("A", 0, 3, 6, { waiting: false }), robot("B", 1, 4, 0)]));
    const snap = m.snapshot((c) => ({ x: c, y: 0 }), () => 0);
    expect(snap.stats.detected).toBe(0);
    expect(snap.stats.transientCycles).toBe(1);
  });

  it("never reports a wait chain (congestion) as a deadlock, and classifies it", () => {
    const m = new DeadlockManager({ confirmTicks: 2, recovery: false });
    // C → B → A, A is moving towards 9 (not waiting).
    const chain = [robot("A", 0, 5, 9, { waiting: false }), robot("B", 1, 4, 9), robot("C", 2, 3, 9)];
    for (let t = 1; t <= 10; t += 1) expect(m.update(input(t, chain)).events).toHaveLength(0);
    expect(m.classOf("B")).toBe("congestion");
    expect(m.classOf("A")).toBe("none");
  });

  it("flags a robot that cannot progress despite an active mission (stall)", () => {
    const m = new DeadlockManager({ stallTicks: 5, recovery: false });
    // B is parked (not waiting) on A's route; A has a mission.
    const robots = [robot("A", 0, 2, 6, { hasMission: true, waitStreak: 5 }), robot("B", 1, 4, 4, { waiting: false })];
    const u = m.update(input(1, robots));
    const detected = u.events.find((e) => e.kind === "deadlock_detected");
    expect(detected?.robotIds).toEqual(["A", "B"]);
    expect(m.snapshot((c) => ({ x: c, y: 0 }), () => 0).incidents[0].kind).toBe("stall");
  });
});

describe("recovery manager", () => {
  it("selects yield candidates deterministically by passage, convoy, urgency, cargo, wait, then id", () => {
    const m = new DeadlockManager();
    const byId = (rs: DeadlockRobotInput[]) => new Map(rs.map((r) => [r.id, r]));
    const rs = [
      robot("A", 0, 0, 1, { onNarrow: true }),
      robot("B", 1, 0, 1, { missionWeight: 60 }),
      robot("C", 2, 0, 1, { carrying: true, missionWeight: 10 }),
      robot("D", 3, 0, 1, { missionWeight: 10 }),
      robot("E", 4, 0, 1, { missionWeight: 10 }),
    ];
    // Lowest score yields first; D and E tie → higher id (E) first.
    expect(m.rankCandidates(["A", "B", "C", "D", "E"], byId(rs))).toEqual(["E", "D", "C", "B", "A"]);
    expect(m.rankCandidates(["E", "D", "C", "B", "A"], byId(rs))).toEqual(["E", "D", "C", "B", "A"]);
  });

  it("protects every other member's route and cell when choosing a holding position", () => {
    const m = new DeadlockManager({ confirmTicks: 1 });
    const seen: { id: string; cells: number[] }[] = [];
    m.update(
      input(1, headOn(), (id, protectedCells) => {
        seen.push({ id, cells: [...protectedCells].sort((a, b) => a - b) });
        return id === "B" ? { cell: 7, route: [5, 6, 7] } : null;
      }),
    );
    // B (higher id, same score) is asked first; A's cell 2 and route 3..6 are protected.
    expect(seen[0]).toEqual({ id: "B", cells: [2, 3, 4, 5, 6] });
  });

  it("starts an attempt with explicit events and a yield order", () => {
    const m = new DeadlockManager({ confirmTicks: 1 });
    const u = m.update(input(1, headOn(), (id) => (id === "B" ? { cell: 7, route: [5, 6, 7] } : null)));
    expect(u.events.map((e) => e.kind)).toEqual([
      "deadlock_detected",
      "deadlock_group_identified",
      "deadlock_recovery_started",
      "robot_yielded",
    ]);
    expect(u.start).toEqual([{ incidentId: "DL-0001", yielderId: "B", holdingCell: 7, group: ["A", "B"] }]);
    expect(m.classOf("B")).toBe("yielding");
    expect(m.classOf("A")).toBe("recovering");
  });

  it("falls back to the next candidate when the first has no holding position", () => {
    const m = new DeadlockManager({ confirmTicks: 1 });
    const u = m.update(input(1, headOn(), (id) => (id === "A" ? { cell: 0, route: [1, 0] } : null)));
    expect(u.start[0]?.yielderId).toBe("A");
  });

  it("fails safely when nobody can yield, and only retries after the world changes", () => {
    const m = new DeadlockManager({ confirmTicks: 1, maxAttempts: 3 });
    const u1 = m.update(input(1, headOn()));
    expect(u1.events.map((e) => e.kind)).toContain("deadlock_recovery_failed");
    expect(u1.start).toEqual([]);
    for (let t = 2; t <= 20; t += 1) expect(m.update(input(t, headOn())).events).toHaveLength(0);
    // World changed: one retry, which fails again (bounded).
    const u2 = m.update(input(21, headOn(), () => null, 1));
    expect(u2.events.map((e) => e.kind)).toEqual(["deadlock_recovery_failed"]);
    expect(m.snapshot((c) => ({ x: c, y: 0 }), () => 0).incidents).toHaveLength(1);
  });

  it("bounds attempts when the yielder can never reserve a route", () => {
    const m = new DeadlockManager({ confirmTicks: 1, maxAttempts: 3 });
    const holding: DeadlockInput["findHolding"] = (id) => ({ cell: id === "A" ? 0 : 7, route: [] });
    let failed = 0;
    for (let t = 1; t <= 40; t += 1) {
      const u = m.update(input(t, headOn(), holding)); // planComplete stays false
      failed += u.events.filter((e) => e.kind === "deadlock_recovery_failed").length;
    }
    const incident = m.snapshot((c) => ({ x: c, y: 0 }), () => 0).incidents[0];
    expect(incident.attempts).toHaveLength(3);
    expect(incident.attempts.every((a) => a.outcome === "no-route")).toBe(true);
    expect(incident.status).toBe("failed");
    expect(failed).toBe(1);
  });

  it("resolves once the yielder holds and the others progress, then releases the yielder", () => {
    const m = new DeadlockManager({ confirmTicks: 1 });
    m.update(input(1, headOn(), (id) => (id === "B" ? { cell: 7, route: [5, 6, 7] } : null)));
    // B planned its route and reaches its holding cell.
    const planned = (bCell: number, aCell: number, aWaiting: boolean) => [
      robot("A", 0, aCell, 6, { waiting: aWaiting }),
      robot("B", 1, bCell, 7, { waiting: false, planComplete: true, plannedRoute: [5, 6, 7] }),
    ];
    const u2 = m.update(input(2, planned(5, 2, true)));
    expect(u2.events.map((e) => e.kind)).toEqual(["recovery_route_planned"]);
    m.update(input(3, planned(7, 3, false)));
    m.update(input(4, planned(7, 4, false)));
    const u5 = m.update(input(5, planned(7, 5, false)));
    expect(u5.events.map((e) => e.kind)).toEqual(["deadlock_resolved"]);
    expect(u5.release).toEqual(["B"]);
    expect(m.snapshot((c) => ({ x: c, y: 0 }), () => 0).incidents[0].attempts[0].outcome).toBe("resolved");
  });

  it("is deterministic", () => {
    const run = () => {
      const m = new DeadlockManager({ confirmTicks: 2 });
      const out: string[] = [];
      for (let t = 1; t <= 10; t += 1) {
        const u = m.update(input(t, headOn(), (id) => (id === "B" ? { cell: 7, route: [7] } : null)));
        out.push(...u.events.map((e) => `${t}:${e.kind}:${e.robotId ?? ""}`));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
