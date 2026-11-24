import { describe, expect, it } from "vitest";
import type { FailureType, SimEvent, SimulationSnapshot } from "../types/simulation";
import { createSimulationSource, SCENARIOS } from "./index";
import { RESTORE_TICKS } from "./recovery/recovery-manager";
import type { EngineOptions, WarehouseEngine } from "./warehouse-engine";

interface Run {
  readonly engine: WarehouseEngine;
  readonly snap: SimulationSnapshot;
  readonly events: SimEvent[];
  readonly history: SimulationSnapshot[];
}

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

/**
 * Per-tick safety checks on top of the engine's own invariants: no shared
 * cells, no swaps, failed robots never move, nobody enters a closed cell,
 * one holder per package, each package delivered at most once.
 */
function check(prev: SimulationSnapshot, next: SimulationSnapshot, delivered: Map<string, number>) {
  const cells = new Set<string>();
  for (const r of next.robots) {
    expect(cells.has(key(r.position)), `two robots on ${key(r.position)} at ${next.tick}`).toBe(false);
    cells.add(key(r.position));
    const before = prev.robots.find((b) => b.id === r.id)!;
    if (before.status === "failed" || r.status === "failed") {
      if (before.status === "failed") expect(r.position, `${r.id} moved while failed at ${next.tick}`).toEqual(before.position);
    }
    const closedNow = new Set(next.closures.flatMap((c) => c.cells.map(key)));
    if (closedNow.has(key(r.position)) && key(before.position) !== key(r.position)) {
      throw new Error(`${r.id} entered closed cell ${key(r.position)} at ${next.tick}`);
    }
  }
  for (const a of next.robots) {
    for (const b of next.robots) {
      if (a.id >= b.id) continue;
      const pa = prev.robots.find((r) => r.id === a.id)!.position;
      const pb = prev.robots.find((r) => r.id === b.id)!.position;
      expect(key(pa) === key(b.position) && key(pb) === key(a.position) && key(pa) !== key(pb), `${a.id}/${b.id} swapped at ${next.tick}`).toBe(false);
    }
  }
  for (const pkg of next.packages) {
    const holders = next.robots.filter((r) => r.packageId === pkg.id).map((r) => r.id);
    expect(holders.length, `${pkg.id} on ${holders.join("+")} at ${next.tick}`).toBeLessThanOrEqual(1);
    if (holders.length === 1) expect(pkg.holderRobotId).toBe(holders[0]);
  }
  for (const e of next.events) {
    if (e.kind !== "package-delivered" || e.tick !== next.tick || !e.packageId) continue;
    delivered.set(e.packageId, (delivered.get(e.packageId) ?? 0) + 1);
  }
}

function run(id: string, ticks: number, options: EngineOptions = {}, each?: (e: WarehouseEngine, s: SimulationSnapshot) => void): Run {
  const engine = createSimulationSource(id, { checkInvariants: true, ...options });
  const events = new Map<string, SimEvent>();
  const delivered = new Map<string, number>();
  const history: SimulationSnapshot[] = [engine.getSnapshot()];
  let prev = engine.getSnapshot();
  for (let i = 0; i < ticks; i += 1) {
    const next = engine.step();
    check(prev, next, delivered);
    each?.(engine, next);
    for (const e of engine.getSnapshot().events) events.set(e.id, e);
    prev = engine.getSnapshot();
    history.push(prev);
  }
  for (const [pkg, n] of delivered) expect(n, `${pkg} delivered ${n} times`).toBe(1);
  return { engine, snap: prev, events: [...events.values()].sort((a, b) => a.seq - b.seq), history };
}

const kinds = (r: Run, re = /^(robot_|package_|aisle_|route_|recovery_failed)/) => r.events.filter((e) => re.test(e.kind)).map((e) => e.kind);
const robot = (s: SimulationSnapshot, id: string) => s.robots.find((r) => r.id === id)!;

describe("A — failure without a package", () => {
  it("halts the robot, requeues and reassigns the mission, delivers once, and never assigns the failed robot", () => {
    const r = run("rec-a-no-package", 80);
    const failedAt = r.history.find((s) => robot(s, "R-01").status === "failed")!;
    expect(failedAt.tick).toBe(5);
    expect(robot(r.snap, "R-01").position).toEqual(robot(failedAt, "R-01").position);
    const m = r.snap.missions.find((x) => x.id === "M-1001")!;
    expect(m.state).toBe("completed");
    expect(m.robotId).not.toBe("R-01");
    expect(m.history.map((h) => h.to)).toContain("queued");
    expect(r.events.filter((e) => e.kind === "mission-assigned" && e.robotId === "R-01" && e.tick >= 5)).toEqual([]);
    expect(kinds(r)).toEqual(["robot_failed", "robot_recovery_started", "robot_recovery_completed"]);
    const pkg = r.snap.packages[0];
    expect(pkg.history.map((h) => h.to)).toEqual(["available", "reserved", "available", "reserved", "picked-up", "in-transit", "delivered"]);
    expect(r.snap.recovery.failures[0]).toMatchObject({ robotId: "R-01", type: "motor", tick: 5, missionId: "M-1001", packageId: null, status: "active" });
  });
});

describe("B — failure while carrying", () => {
  it("preserves custody, hands the package over atomically and delivers it exactly once", () => {
    const r = run("rec-b-carrying", 60);
    expect(kinds(r)).toEqual([
      "robot_failed",
      "package_recovery_required",
      "robot_recovery_started",
      "package_recovery_started",
      "package_custody_transferred",
      "package_delivery_resumed",
      "robot_recovery_completed",
    ]);
    const transfer = r.events.find((e) => e.kind === "package_custody_transferred")!;
    // Custody timeline: R-01 until the handover tick, R-02 from it; never two, never none while carried.
    for (const s of r.history) {
      const pkg = s.packages[0];
      const onBoard = s.robots.filter((x) => x.packageId === pkg.id).map((x) => x.id);
      if (s.tick >= 4 && pkg.state !== "delivered") expect(onBoard).toEqual([pkg.holderRobotId]);
      if (s.tick >= 9 && s.tick < transfer.tick) {
        expect(pkg).toMatchObject({ state: "recovery-required", holderRobotId: "R-01" });
        expect(s.missions[0].state).toBe("recovery-required");
      }
      if (s.tick >= transfer.tick && pkg.state !== "delivered") expect(pkg.holderRobotId).toBe("R-02");
    }
    const pkg = r.snap.packages[0];
    expect(pkg.state).toBe("delivered");
    expect(pkg.location).toEqual({ kind: "delivered", stationId: "DO-01" });
    expect(pkg.history.map((h) => h.to)).toEqual(["available", "reserved", "picked-up", "in-transit", "recovery-required", "recovery-required", "recovery-required", "in-transit", "delivered"]);
    expect(r.snap.missions[0]).toMatchObject({ state: "completed", robotId: "R-02" });
    expect(r.snap.recovery.tasks[0]).toMatchObject({ status: "completed", failedRobotId: "R-01" });
    expect(robot(r.snap, "R-01")).toMatchObject({ status: "failed", packageId: null, missionId: null });
    // The handover happened beside the failed robot.
    const atTransfer = r.history.find((s) => s.tick === transfer.tick)!;
    const d = Math.abs(robot(atTransfer, "R-02").position.x - 4) + Math.abs(robot(atTransfer, "R-02").position.y - 0);
    expect(d).toBe(1);
  });

  it("events carry tick, robots, package, mission, location and reason", () => {
    const r = run("rec-b-carrying", 30);
    for (const e of r.events.filter((x) => /^(robot_failed|package_)/.test(x.kind))) {
      expect(e.packageId, e.kind).toBe("PKG-0001");
      expect(e.missionId, e.kind).toBe("M-1001");
      expect(e.robotIds?.length, e.kind).toBeGreaterThan(0);
      expect(e.cell, e.kind).toBeDefined();
    }
    const failed = r.events.find((e) => e.kind === "robot_failed")!;
    expect(failed).toMatchObject({ tick: 9, robotId: "R-01", failureType: "navigation", reason: "Localisation lost (injected)", cell: { x: 4, y: 0 } });
  });
});

describe("C — aisle closure", () => {
  it("invalidates the routes through it, releases reservations, replans and keeps delivering", () => {
    const r = run("rec-c-aisle-closure", 120);
    const invalidated = r.events.filter((e) => e.kind === "route_invalidated").map((e) => e.robotId);
    expect(invalidated.length).toBeGreaterThanOrEqual(2);
    const replanned = r.events.filter((e) => e.kind === "robot_route_replanned").map((e) => e.robotId);
    expect(new Set(replanned)).toEqual(new Set(invalidated));
    // No reservation on a closed cell after the closure (other than a robot standing on it).
    for (const s of r.history.filter((x) => x.closures.length)) {
      const closed = new Set(s.closures.flatMap((c) => c.cells.map(key)));
      for (const res of s.coordination.reservations) {
        if (res.tick > s.tick) expect(closed.has(key(res)), `${res.robotId} reserved closed ${key(res)} at ${res.tick}`).toBe(false);
      }
    }
    expect(r.snap.metrics.completedDeliveries).toBe(4);
    expect(r.snap.missions.every((m) => m.state === "completed")).toBe(true);
    // The rerouted traffic meets in the bottom aisle: deadlock recovery resolves it.
    expect(r.snap.deadlocks.stats.failed).toBe(0);
    expect(r.snap.deadlocks.incidents.every((i) => i.status === "resolved")).toBe(true);
  });

  it("preserves positions, missions and custody at the moment of closure (no reset)", () => {
    const e = createSimulationSource("rec-c-aisle-closure", { checkInvariants: true });
    for (let i = 0; i < 5; i += 1) e.step();
    const before = e.getSnapshot();
    const after = e.step(); // tick 6: scheduled closure, then the tick runs
    expect(after.tick).toBe(6);
    for (const r of after.robots) {
      const b = robot(before, r.id);
      expect(Math.abs(r.position.x - b.position.x) + Math.abs(r.position.y - b.position.y)).toBeLessThanOrEqual(1);
      expect(r.missionId).toBe(b.missionId);
      expect(r.packageId).toBe(b.packageId);
    }
  });
});

describe("D — occupied cell closure", () => {
  it("keeps the robot in place, lets it leave, and lets nobody enter the closed cell", () => {
    const r = run("rec-d-occupied-closure", 100);
    const closedAt = r.history.find((s) => s.closures.length > 0)!;
    expect(robot(closedAt, "R-02").position).toEqual({ x: 6, y: 2 });
    const closure = r.events.find((e) => e.kind === "aisle_closed")!;
    expect(closure.message).toMatch(/R-02 stays in place/);
    let left = false;
    for (const s of r.history.filter((x) => x.tick >= closedAt.tick && x.closures.length > 0)) {
      const occupants = s.robots.filter((x) => key(x.position) === "6,2").map((x) => x.id);
      if (!left && occupants.length === 0) left = true;
      if (left) expect(occupants, `entered at ${s.tick}`).toEqual([]);
      else expect(occupants).toEqual(["R-02"]);
    }
    expect(left).toBe(true);
    expect(r.snap.metrics.completedDeliveries).toBe(3);
  });
});

describe("E — aisle reopening", () => {
  it("cuts the dock off (safe hold, no route), then restores topology and the delivery", () => {
    const r = run("rec-e-reopen", 80);
    expect(kinds(r)).toEqual(["aisle_closed", "route_invalidated", "robot_route_replanned", "aisle_reopened", "robot_route_replanned"]);
    const [noRoute, restored] = r.events.filter((e) => e.kind === "robot_route_replanned");
    expect(noRoute.message).toMatch(/no route/);
    expect(restored.tick).toBe(32);
    const during = r.history.filter((s) => s.tick > 8 && s.tick < 32);
    expect(new Set(during.map((s) => key(robot(s, "R-01").position))).size).toBe(1); // holds safely
    expect(r.snap.closures).toEqual([]);
    expect(r.snap.packages[0]).toMatchObject({ state: "delivered", location: { kind: "delivered", stationId: "DO-02" } });
  });
});

describe("F — recovery robot failure", () => {
  it("re-selects a rescuer without ever moving custody to the failed rescuer", () => {
    const r = run("rec-f-rescuer-failure", 60);
    const task = r.snap.recovery.tasks[0];
    expect(task.attempts.map((a) => [a.rescuerId, a.outcome])).toEqual([
      ["R-02", "rescuer-failed"],
      ["R-03", "handed-over"],
    ]);
    for (const s of r.history) {
      expect(robot(s, "R-02").packageId).toBeNull();
      expect(s.packages[0].holderRobotId).not.toBe("R-02");
    }
    const holders = new Set(r.history.map((s) => s.packages[0].holderRobotId));
    expect(holders).toEqual(new Set([null, "R-01", "R-03"]));
    expect(r.snap.packages[0].state).toBe("delivered");
    expect(r.snap.missions[0].robotId).toBe("R-03");
    expect(r.events.filter((e) => e.kind === "package_custody_transferred")).toHaveLength(1);
  });
});

describe("failure types and restoration", () => {
  const types: FailureType[] = ["motor", "battery", "navigation", "communication", "emergency-stop"];

  it.each(types)("%s: halts the robot, records the failure and restores after the type's delay", (type) => {
    const e = createSimulationSource("rec-a-no-package", { checkInvariants: true });
    for (let i = 0; i < 3; i += 1) e.step();
    expect(e.dispatch({ type: "fail_robot", robotId: "R-02", failureType: type }).ok).toBe(true);
    const failed = e.getSnapshot();
    expect(robot(failed, "R-02")).toMatchObject({ status: "failed", action: "halted" });
    expect(robot(failed, "R-02").failure).toMatchObject({ type, status: "active", tick: 3 });
    expect(failed.events.at(-1)).toMatchObject({ kind: "robot_failed", failureType: type });
    const at = robot(failed, "R-02").position;
    for (let i = 0; i < 10; i += 1) expect(robot(e.step(), "R-02").position).toEqual(at);
    expect(e.dispatch({ type: "restore_robot", robotId: "R-02" }).ok).toBe(true);
    let s = e.getSnapshot();
    expect(robot(s, "R-02").status).toBe("recovering");
    for (let i = 0; i < RESTORE_TICKS[type] - 1; i += 1) {
      s = e.step();
      expect(robot(s, "R-02").status).toBe("recovering");
      expect(robot(s, "R-02").position).toEqual(at);
    }
    s = e.step();
    expect(robot(s, "R-02").status).not.toBe("recovering");
    expect(robot(s, "R-02").failure).toMatchObject({ status: "restored", restoredTick: s.tick });
    expect(s.events.some((ev) => ev.kind === "robot_restored" && ev.robotId === "R-02")).toBe(true);
    if (type === "battery") expect(robot(s, "R-02").battery).toBe(100);
  });

  it("a restored robot is assignable again; a failed one never is", () => {
    const e = createSimulationSource("rec-a-no-package", { checkInvariants: true });
    e.dispatch({ type: "fail_robot", robotId: "R-02", failureType: "communication" });
    e.dispatch({ type: "fail_robot", robotId: "R-03", failureType: "communication" });
    for (let i = 0; i < 6; i += 1) e.step();
    // R-01 fails at tick 5 (scheduled): nobody is left to take M-1001.
    expect(e.getSnapshot().missions[0]).toMatchObject({ state: "queued", robotId: null });
    e.dispatch({ type: "restore_robot", robotId: "R-03" });
    let s = e.getSnapshot();
    for (let i = 0; i < 8; i += 1) s = e.step();
    expect(s.missions[0].robotId).toBe("R-03");
    expect(s.events.some((ev) => ev.kind === "robot_recovery_completed" && ev.missionId === "M-1001")).toBe(true);
  });

  it("restoring a holder before any handover stands the rescuer down; the holder delivers itself", () => {
    const e = createSimulationSource("rec-b-carrying", { checkInvariants: true });
    for (let i = 0; i < 11; i += 1) e.step(); // R-01 failed at 9, R-02 en route
    expect(robot(e.getSnapshot(), "R-02").recoveryRole?.role).toBe("rescuer");
    expect(e.dispatch({ type: "restore_robot", robotId: "R-01" }).ok).toBe(true);
    const s1 = e.getSnapshot();
    expect(robot(s1, "R-02").recoveryRole).toBeNull();
    expect(s1.packages[0]).toMatchObject({ state: "recovery-required", holderRobotId: "R-01" });
    let s = s1;
    for (let i = 0; i < 40; i += 1) s = e.step();
    expect(s.packages[0]).toMatchObject({ state: "delivered" });
    expect(s.missions[0]).toMatchObject({ state: "completed", robotId: "R-01" });
    expect(s.recovery.tasks[0].attempts[0].outcome).toBe("holder-restored");
    expect(s.events.some((ev) => ev.kind === "package_delivery_resumed" && ev.robotId === "R-01")).toBe(true);
  });
});

describe("recovery commands", () => {
  it("cancel_recovery stands the rescuer down; start_package_recovery restarts with a chosen rescuer; handover completes", () => {
    const e = createSimulationSource("rec-b-carrying", { checkInvariants: true });
    for (let i = 0; i < 11; i += 1) e.step();
    expect(e.dispatch({ type: "cancel_recovery", packageId: "PKG-0001" }).ok).toBe(true);
    let s = e.getSnapshot();
    expect(s.recovery.tasks[0].status).toBe("cancelled");
    expect(s.packages[0]).toMatchObject({ state: "recovery-required", holderRobotId: "R-01", recovery: { rescuerId: null } });
    for (let i = 0; i < 10; i += 1) s = e.step();
    expect(s.recovery.tasks[0].status).toBe("cancelled"); // not restarted automatically
    expect(e.dispatch({ type: "start_package_recovery", packageId: "PKG-0001", rescuerId: "R-03" }).ok).toBe(true);
    s = e.step();
    expect(s.recovery.tasks[0]).toMatchObject({ status: "en-route", rescuerId: "R-03" });
    expect(e.dispatch({ type: "complete_package_handover", packageId: "PKG-0001" })).toMatchObject({ ok: false, error: { code: "rescuer-not-adjacent" } });
    for (let i = 0; i < 40 && e.getSnapshot().recovery.tasks[0].status !== "handover"; i += 1) e.step();
    expect(e.getSnapshot().recovery.tasks[0].status).toBe("handover");
    expect(e.dispatch({ type: "complete_package_handover", packageId: "PKG-0001" }).ok).toBe(true);
    s = e.getSnapshot();
    expect(s.packages[0]).toMatchObject({ state: "in-transit", holderRobotId: "R-03" });
    expect(e.dispatch({ type: "complete_package_handover", packageId: "PKG-0001" }).ok).toBe(false); // exactly once
  });

  it("rejects unsafe or invalid recovery commands with explicit errors", () => {
    const e = createSimulationSource("rec-b-carrying", { checkInvariants: true });
    for (let i = 0; i < 6; i += 1) e.step(); // R-01 carrying, not failed
    const cases: [Parameters<WarehouseEngine["dispatch"]>[0], string][] = [
      [{ type: "fail_robot", robotId: "R-01", failureType: "gremlins" as FailureType }, "invalid-failure-type"],
      [{ type: "restore_robot", robotId: "R-01" }, "robot-not-failed"],
      [{ type: "restore_robot", robotId: "R-99" }, "unknown-robot"],
      [{ type: "start_package_recovery", packageId: "PKG-0001" }, "package-not-stranded"],
      [{ type: "start_package_recovery", packageId: "PKG-9999" }, "unknown-package"],
      [{ type: "complete_package_handover", packageId: "PKG-0001" }, "no-rescuer"],
      [{ type: "cancel_recovery", packageId: "PKG-0001" }, "no-open-recovery"],
    ];
    for (const [command, code] of cases) expect(e.dispatch(command), code).toMatchObject({ ok: false, error: { code } });
    e.dispatch({ type: "fail_robot", robotId: "R-01" });
    // A robot that already carries something can never be made a rescuer.
    expect(e.dispatch({ type: "start_package_recovery", packageId: "PKG-0001", rescuerId: "R-01" })).toMatchObject({ ok: false });
  });

  it("a timed-out rescuer is released and replaced; when all time out, recovery fails safely", () => {
    const r = run("rec-b-carrying", 40, { recovery: { timeoutTicks: 4 } });
    const failed = r.events.filter((e) => e.kind === "recovery_failed");
    expect(failed.map((e) => e.status)).toEqual(["pending", "pending", "failed"]);
    const task = r.snap.recovery.tasks[0];
    expect(task.status).toBe("failed");
    expect(task.attempts.map((a) => a.outcome)).toEqual(["timeout", "timeout"]);
    expect(r.snap.packages[0]).toMatchObject({ state: "recovery-required", holderRobotId: "R-01", recovery: { rescuerId: null } });
    expect(r.snap.robots.filter((x) => x.recoveryRole?.role === "rescuer")).toEqual([]);
  });
});

describe("determinism and long runs", () => {
  it.each(SCENARIOS.filter((s) => s.group === "recovery").map((s) => s.id))("%s is reproducible, including through seek", (id) => {
    const a = run(id, 70);
    const b = run(id, 70);
    expect(b.events.map((e) => `${e.tick}:${e.kind}:${e.robotId}`)).toEqual(a.events.map((e) => `${e.tick}:${e.kind}:${e.robotId}`));
    const seeked = a.engine.seek(30);
    expect(seeked.packages).toEqual(a.history[30].packages);
    expect(seeked.recovery).toEqual(a.history[30].recovery);
  });

  it("high-density with repeated failures and restorations stays safe for 3 000 ticks", () => {
    const ids = ["R-01", "R-03", "R-05", "R-02", "R-06", "R-08"];
    const types: FailureType[] = ["motor", "battery", "navigation", "communication", "emergency-stop"];
    let n = 0;
    const r = run("high-density", 3000, {}, (engine, s) => {
      if (s.tick % 150 === 0) {
        const victim = ids[n % ids.length];
        if (robot(s, victim).status !== "failed") engine.dispatch({ type: "fail_robot", robotId: victim, failureType: types[n % types.length] });
        n += 1;
      }
      if (s.tick % 150 === 60) {
        for (const x of s.robots) if (x.status === "failed" && x.id !== "R-07") engine.dispatch({ type: "restore_robot", robotId: x.id });
      }
    });
    expect(r.snap.recovery.stats.failures).toBeGreaterThanOrEqual(15);
    expect(r.snap.recovery.stats.handovers + r.events.filter((e) => e.kind === "robot_recovery_completed").length).toBeGreaterThan(0);
    expect(r.snap.metrics.completedDeliveries).toBeGreaterThan(150);
    // Nothing is lost: every package is delivered, on a robot, or waiting at its pick face.
    for (const pkg of r.snap.packages) {
      if (pkg.state === "available") expect(pkg.location).toEqual({ kind: "station", stationId: pkg.originStationId });
      if (pkg.state === "recovery-required") expect(robot(r.snap, pkg.holderRobotId!).status).toMatch(/failed|recovering/);
    }
  });
});
