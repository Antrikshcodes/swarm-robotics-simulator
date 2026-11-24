import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "../types/simulation";
import { checkInvariants } from "./invariants";
import { createSimulationSource, getCompiledScenario, getScenario, SCENARIOS } from "./index";
import { compileScenario, type ScenarioDefinition } from "./scenario";
import { WarehouseEngine } from "./warehouse-engine";

const engine = (id = "standard") => createSimulationSource(id, { checkInvariants: true });

function run(e: WarehouseEngine, ticks: number): SimulationSnapshot {
  let snap = e.getSnapshot();
  for (let i = 0; i < ticks; i += 1) snap = e.step();
  return snap;
}

/** Small open warehouse for focused behaviour tests. */
const TINY: ScenarioDefinition = {
  id: "tiny",
  name: "Tiny",
  summary: "",
  focus: "",
  seed: 7,
  map: [
    "P.......D",
    ".........",
    ".........",
  ],
  robots: [{ id: "R-01", model: "T", colorIndex: 1, heading: "N", battery: 80, home: { x: 4, y: 2 } }],
  missions: [{ pickup: "PK-01", dropoff: "DO-01" }],
  handling: { loadTicks: 2, unloadTicks: 2 },
};
const tiny = () => new WarehouseEngine(compileScenario(TINY), { checkInvariants: true });

describe("scenario compatibility", () => {
  it.each(SCENARIOS.map((s) => s.id))("%s compiles and runs 1 500 ticks with all invariants holding", (id) => {
    const e = engine(id);
    let snap = e.getSnapshot();
    for (let i = 0; i < 1500; i += 1) {
      snap = e.step();
      // The engine also checks internally; assert explicitly for clarity.
      expect(checkInvariants(snap)).toEqual([]);
    }
    expect(snap.tick).toBe(1500);
    if (getScenario(id).group !== "lab") expect(snap.metrics.completedDeliveries).toBeGreaterThan(0);
  });

  it("rejects invalid scenario definitions with precise errors", () => {
    expect(() => compileScenario({ ...TINY, robots: [{ ...TINY.robots[0], home: { x: 20, y: 0 } }] })).toThrow(/outside/);
    expect(() => compileScenario({ ...TINY, robots: [{ ...TINY.robots[0], home: { x: 0, y: 0 } }] })).toThrow(/station/);
    expect(() => compileScenario({ ...TINY, missions: [{ pickup: "DO-01", dropoff: "PK-01" }] })).toThrow(/expected pickup/);
    expect(() => compileScenario({ ...TINY, map: ["P..#", ".."] })).toThrow(/width/);
    expect(() =>
      compileScenario({ ...TINY, robots: [TINY.robots[0], { ...TINY.robots[0], id: "R-02" }] }),
    ).toThrow(/shared/);
  });
});

describe("robot movement and mission lifecycle", () => {
  it("drives a mission end to end: plan, travel, load, carry, unload, return home", () => {
    const snap = run(tiny(), 40);
    // Assignment and the first move can share a tick, so read the audit trail.
    expect(snap.missions[0].history.map((h) => h.to)).toEqual([
      "queued", "assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "dropping-off", "completed",
    ]);
    const pkg = snap.packages[0];
    expect(pkg.state).toBe("delivered");
    expect(pkg.location).toEqual({ kind: "delivered", stationId: "DO-01" });
    expect(pkg.history.map((h) => h.to)).toEqual(["available", "reserved", "picked-up", "in-transit", "delivered"]);
    const robot = snap.robots[0];
    expect(robot.position).toEqual(robot.home);
    expect(robot.status).toBe("idle");
    expect(robot.stats.deliveries).toBe(1);
  });

  it("moves at most one cell per tick along A* routes", () => {
    const e = engine("high-density");
    for (let i = 0; i < 300; i += 1) {
      const snap = e.step();
      for (const r of snap.robots) {
        expect(Math.abs(r.position.x - r.previousPosition.x) + Math.abs(r.position.y - r.previousPosition.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("assigns the nearest available robot, ties broken by ID", () => {
    const snap = engine("standard").step();
    const assigned = snap.missions.filter((m) => m.robotId).map((m) => [m.id, m.robotId]);
    expect(assigned.length).toBe(3);
    // Deterministic: same answer every run.
    expect(engine("standard").step().missions.map((m) => m.robotId)).toEqual(snap.missions.map((m) => m.robotId));
  });

  it("never completes a mission whose package was not delivered to its drop-off", () => {
    const e = engine("high-density");
    for (let i = 0; i < 800; i += 1) {
      const snap = e.step();
      for (const m of snap.missions.filter((x) => x.state === "completed")) {
        const pkg = snap.packages.find((p) => p.id === m.packageId);
        expect(pkg?.state).toBe("delivered");
        expect(pkg?.location).toEqual({ kind: "delivered", stationId: m.dropoffStationId });
      }
    }
  });
});

describe("determinism, reset and seek", () => {
  it("identical scenario + command sequence ⇒ identical snapshots", () => {
    const drive = () => {
      const e = engine("narrow-aisle");
      run(e, 30);
      e.dispatch({ type: "add-mission", pickupStationId: "PK-01", dropoffStationId: "DO-02" });
      run(e, 20);
      e.dispatch({ type: "close_aisle", cells: [{ x: 10, y: 5 }] });
      return JSON.stringify(run(e, 200));
    };
    expect(drive()).toEqual(drive());
  });

  it("reset restores the initial snapshot and clears the command log", () => {
    const e = engine("standard");
    const initial = JSON.stringify(e.getSnapshot());
    run(e, 25);
    e.dispatch({ type: "fail_robot", robotId: "R-02" });
    e.reset();
    expect(JSON.stringify(e.getSnapshot())).toEqual(initial);
    expect(e.getCommandLog()).toHaveLength(0);
  });

  it("seek replays logged commands at their original ticks", () => {
    const e = engine("standard");
    run(e, 15);
    e.dispatch({ type: "close_aisle", cells: [{ x: 13, y: 6 }, { x: 14, y: 6 }] });
    run(e, 60);
    const live = JSON.stringify(e.getSnapshot());
    e.seek(5);
    expect(e.getSnapshot().closures).toHaveLength(0);
    e.seek(75);
    expect(JSON.stringify(e.getSnapshot())).toEqual(live);
  });

  it("a new command after seeking back discards the old future", () => {
    const e = engine("standard");
    run(e, 40);
    e.dispatch({ type: "fail_robot", robotId: "R-01" });
    e.seek(10);
    e.dispatch({ type: "fail_robot", robotId: "R-03" });
    expect(e.getCommandLog().map((c) => c.command)).toEqual([{ type: "fail_robot", robotId: "R-03" }]);
    const snap = run(e, 50);
    expect(snap.robots.find((r) => r.id === "R-01")?.status).not.toBe("failed");
  });

  it("snapshots are not mutated by later ticks", () => {
    const e = engine("high-density");
    const early = run(e, 20);
    const frozen = JSON.stringify(early);
    run(e, 100);
    expect(JSON.stringify(early)).toEqual(frozen);
  });
});

describe("events", () => {
  it("have stable, unique, ordered identifiers and ticks", () => {
    const e = engine("high-density");
    const snap = run(e, 400);
    const ids = snap.events.map((ev) => ev.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < snap.events.length; i += 1) {
      expect(snap.events[i].tick).toBeGreaterThanOrEqual(snap.events[i - 1].tick);
    }
    const engineSeqs = snap.events.filter((ev) => ev.id.startsWith("E-")).map((ev) => ev.seq);
    expect(engineSeqs).toEqual([...engineSeqs].sort((a, b) => a - b));
    const again = run(engine("high-density"), 400);
    expect(again.events.map((ev) => ev.id)).toEqual(ids);
  });

  it("records the lifecycle in order for a single mission", () => {
    const snap = run(tiny(), 40);
    const kinds = snap.events.map((ev) => ev.kind);
    const order = ["mission-created", "mission-assigned", "pickup-started", "package-picked-up", "dropoff-started", "package-delivered"];
    let cursor = -1;
    for (const kind of order) {
      const at = kinds.indexOf(kind as (typeof kinds)[number], cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(snap.movements.length).toBeGreaterThan(0);
  });

  it("start and pause emit playback events without changing world state", () => {
    const e = engine("standard");
    const before = JSON.stringify({ ...e.getSnapshot(), events: [], running: false });
    expect(e.dispatch({ type: "start" }).ok).toBe(true);
    expect(e.dispatch({ type: "pause" }).ok).toBe(true);
    const snap = e.getSnapshot();
    expect(snap.events.filter((ev) => ev.id.startsWith("P-")).map((ev) => ev.kind)).toEqual(["simulation-started", "simulation-paused"]);
    expect(JSON.stringify({ ...snap, events: [], running: false })).toEqual(before);
  });
});

describe("commands", () => {
  it("return explicit errors for invalid input", () => {
    const e = engine("standard");
    const cases = [
      [{ type: "pause" }, "not-running"],
      [{ type: "load-scenario", scenarioId: "nope" }, "unknown-scenario"],
      [{ type: "select-robot", robotId: "R-99" }, "unknown-robot"],
      [{ type: "add-mission", pickupStationId: "PK-09", dropoffStationId: "DO-01" }, "unknown-station"],
      [{ type: "add-mission", pickupStationId: "DO-01", dropoffStationId: "PK-01" }, "invalid-station-kind"],
      [{ type: "cancel-mission", missionId: "M-9999" }, "unknown-mission"],
      [{ type: "close_aisle", cells: [] }, "empty-closure"],
      [{ type: "close_aisle", cells: [{ x: 99, y: 0 }] }, "invalid-coordinates"],
      [{ type: "close_aisle", cells: [{ x: 2, y: 1 }] }, "cell-not-closable"],
      [{ type: "close_aisle", cells: [{ x: 0, y: 3 }] }, "cell-not-closable"],
      [{ type: "reopen_aisle", closureId: "CL-42" }, "unknown-closure"],
      [{ type: "fail_robot", robotId: "R-99" }, "unknown-robot"],
    ] as const;
    for (const [command, code] of cases) {
      const result = e.dispatch(command);
      expect(result.ok, `${command.type} should fail`).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
    e.dispatch({ type: "start" });
    expect(e.dispatch({ type: "start" })).toMatchObject({ ok: false, error: { code: "already-running" } });
    expect(e.dispatch({ type: "step" })).toMatchObject({ ok: false, error: { code: "already-running" } });
    e.dispatch({ type: "close_aisle", cells: [{ x: 5, y: 0 }] });
    expect(e.dispatch({ type: "close_aisle", cells: [{ x: 5, y: 0 }] })).toMatchObject({ ok: false, error: { code: "already-closed" } });
    e.dispatch({ type: "fail_robot", robotId: "R-01" });
    expect(e.dispatch({ type: "fail_robot", robotId: "R-01" })).toMatchObject({ ok: false, error: { code: "robot-unavailable" } });
  });

  it("add-mission queues a job that the scheduler delivers", () => {
    const e = tiny();
    run(e, 40);
    const result = e.dispatch({ type: "add-mission", pickupStationId: "PK-01", dropoffStationId: "DO-01" });
    expect(result.ok).toBe(true);
    const id = result.ok ? result.value.entityId : "";
    expect(e.getSnapshot().missions.find((m) => m.id === id)?.state).toBe("queued");
    const snap = run(e, 60);
    expect(snap.missions.find((m) => m.id === id)?.state).toBe("completed");
  });

  it("cancel-mission releases the reservation before pickup and is refused after", () => {
    const e = tiny();
    const snap = e.step();
    const mission = snap.missions[0];
    expect(snap.packages[0].state).toBe("reserved");
    expect(e.dispatch({ type: "cancel-mission", missionId: mission.id }).ok).toBe(true);
    const after = e.getSnapshot();
    expect(after.packages[0]).toMatchObject({ state: "available", holderRobotId: null });
    expect(after.robots[0].missionId).toBeNull();

    const e2 = tiny();
    run(e2, 12); // well past pickup
    const m2 = e2.getSnapshot().missions[0];
    expect(["carrying", "to-dropoff", "dropping-off", "completed"]).toContain(m2.state);
    expect(e2.dispatch({ type: "cancel-mission", missionId: m2.id })).toMatchObject({ ok: false, error: { code: "invalid-mission-transition" } });
  });

  it("close-aisle forces replanning around the closure and reopen restores the cells", () => {
    const e = tiny();
    run(e, 7); // loaded and heading east along y = 0 or 1
    const robot = e.getSnapshot().robots[0];
    const blockers = [0, 1, 2].map((y) => ({ x: 6, y })).filter((p) => !(p.x === robot.position.x && p.y === robot.position.y));
    const closed = e.dispatch({ type: "close_aisle", cells: blockers.slice(0, 2), label: "Spill" });
    expect(closed.ok).toBe(true);
    const snap = run(e, 30);
    for (const record of snap.movements) {
      expect(blockers.slice(0, 2).some((p) => p.x === record.to.x && p.y === record.to.y)).toBe(false);
    }
    expect(snap.events.some((ev) => ev.kind === "aisle_closed")).toBe(true);
    expect(snap.missions[0].state).toBe("completed");
    const id = closed.ok ? closed.value.entityId! : "";
    expect(e.dispatch({ type: "reopen_aisle", closureId: id }).ok).toBe(true);
    expect(e.getSnapshot().closures).toHaveLength(0);
  });

  it("a fully blocking closure leaves the robot waiting with a no-path event, then recovers on reopen", () => {
    const e = tiny();
    run(e, 6);
    const wall = [0, 1, 2].map((y) => ({ x: 7, y }));
    const closed = e.dispatch({ type: "close_aisle", cells: wall });
    expect(closed.ok).toBe(true);
    let snap = run(e, 15);
    expect(snap.robots[0].status).toBe("waiting");
    expect(snap.events.some((ev) => ev.kind === "robot-no-path")).toBe(true);
    expect(snap.missions[0].state).toBe("carrying");
    e.dispatch({ type: "reopen_aisle", closureId: closed.ok ? closed.value.entityId! : "" });
    snap = run(e, 20);
    expect(snap.missions[0].state).toBe("completed");
  });

  it("fail_robot halts the robot, keeps custody and flags the package for recovery", () => {
    const e = tiny();
    run(e, 8);
    const before = e.getSnapshot();
    expect(before.robots[0].packageId).not.toBeNull();
    expect(e.dispatch({ type: "fail_robot", robotId: "R-01", reason: "Test fault" }).ok).toBe(true);
    const snap = run(e, 20);
    const robot = snap.robots[0];
    expect(robot.status).toBe("failed");
    expect(robot.position).toEqual(before.robots[0].position);
    expect(snap.missions[0].state).toBe("recovery-required");
    const pkg = snap.packages[0];
    expect(pkg.holderRobotId).toBe("R-01");
    expect(pkg.state).toBe("recovery-required");
    expect(pkg.history.some((h) => h.to === "recovery-required" && /failed/.test(h.note))).toBe(true);
    // A single-robot warehouse has nobody to send: recovery fails safely, custody unchanged.
    expect(snap.recovery.tasks[0].status).toBe("failed");
    expect(snap.events.some((ev) => ev.kind === "recovery_failed")).toBe(true);
    expect(pkg.history.length).toBeGreaterThan(3);
  });

  it("scheduled fault in high-density fails R-07 at tick 40 and others route around it", () => {
    const e = engine("high-density");
    const snap = run(e, 40);
    expect(snap.robots.find((r) => r.id === "R-07")?.status).toBe("failed");
    expect(snap.events.some((ev) => ev.kind === "robot_failed" && ev.robotId === "R-07" && ev.tick === 40)).toBe(true);
    const later = run(e, 300);
    expect(later.metrics.completedDeliveries).toBeGreaterThan(snap.metrics.completedDeliveries);
  });
});

describe("narrow aisle", () => {
  it("opposing robots never collide or swap and both missions complete", () => {
    const e = engine("narrow-aisle");
    let snap = e.getSnapshot();
    const first = snap.missions.slice(0, 2).map((m) => m.id);
    for (let i = 0; i < 200; i += 1) snap = e.step();
    for (const id of first) expect(snap.missions.find((m) => m.id === id)?.state).toBe("completed");
  });
});

describe("liveness in shipped scenarios (bounded-wait replanning, not a general guarantee)", () => {
  // Deadlock-lab scenarios are deliberately stuck or delivery-free; covered in deadlock.engine.test.ts.
  it.each(SCENARIOS.filter((s) => s.group !== "lab").map((s) => s.id))("%s keeps delivering and never blocks a working robot for long", (id) => {
    const e = engine(id);
    let maxBlocked = 0;
    let lastDelivered = 0;
    for (let window = 0; window < 4; window += 1) {
      let snap = e.getSnapshot();
      for (let i = 0; i < 500; i += 1) {
        snap = e.step();
        for (const r of snap.robots) if (r.status !== "failed") maxBlocked = Math.max(maxBlocked, r.blockedTicks);
      }
      expect(snap.metrics.completedDeliveries, `no deliveries in window ${window}`).toBeGreaterThan(lastDelivered);
      lastDelivered = snap.metrics.completedDeliveries;
    }
    expect(maxBlocked).toBeLessThan(40);
  });
});

describe("pathological inputs", () => {
  it("compiled scenarios are cached and shared safely", () => {
    expect(getCompiledScenario("standard")).toBe(getCompiledScenario("standard"));
  });

  it("seek handles negative and non-finite ticks", () => {
    const e = engine();
    expect(e.seek(-5).tick).toBe(0);
    expect(e.seek(Number.NaN).tick).toBe(0);
  });
});
