import { describe, expect, it } from "vitest";
import { Coordinator, type CoordRobotInput } from "./coordinator";
import { resolveMoves } from "./move-resolver";
import type { PlanningGrid } from "./space-time-planner";

function grid(rows: string[]): PlanningGrid & { at: (x: number, y: number) => number } {
  const width = rows[0].length;
  const flat = rows.join("");
  return {
    width,
    height: rows.length,
    passable: (cell) => flat[cell] === ".",
    at: (x, y) => y * width + x,
  };
}

interface SimRobot {
  id: string;
  rank: number;
  cell: number;
  goal: number;
  priority: number;
  arrivedAt?: number;
}

/** Minimal execution loop: plan → resolve → apply, checking safety every tick. */
function run(g: PlanningGrid, robots: SimRobot[], ticks: number) {
  const c = new Coordinator(g, { horizon: 40, preemptAfter: 3 });
  const input = (): CoordRobotInput[] =>
    robots.map((r) => ({ id: r.id, rank: r.rank, cell: r.cell, goal: r.goal, priority: r.priority, mode: "mobile" }));
  c.reset(input());
  for (let t = 0; t < ticks; t += 1) {
    const intents = c.plan(t, input());
    const res = resolveMoves(intents);
    c.committed(t + 1, res.rejected);
    const before = new Map(robots.map((r) => [r.id, r.cell]));
    for (const r of robots) r.cell = res.final.get(r.id)!;
    // Safety: no shared cells, no swaps, ≤ 1 step.
    const cells = robots.map((r) => r.cell);
    expect(new Set(cells).size).toBe(cells.length);
    for (const a of robots) {
      for (const b of robots) {
        if (a.id >= b.id) continue;
        const swapped = a.cell === before.get(b.id) && b.cell === before.get(a.id) && a.cell !== before.get(a.id);
        expect(swapped, `${a.id}/${b.id} swapped at ${t + 1}`).toBe(false);
      }
    }
    for (const r of robots) if (r.cell === r.goal && r.arrivedAt === undefined) r.arrivedAt = t + 1;
    if (robots.every((r) => r.arrivedAt !== undefined)) break;
  }
  return { coordinator: c, robots };
}

// One-lane corridor (row 0) with exit spurs at x = 1 and x = 8 and a
// passing bay at (3,1). Robots must cross head-on to reach their goals.
const CORRIDOR = grid(["..........", "#.#.####.#", "#.######.#"]);

describe("coordinator", () => {
  it("lets independent robots move concurrently without waiting", () => {
    const g = grid([".......", "#######", "......."]);
    const { robots, coordinator } = run(
      g,
      [
        { id: "A", rank: 0, cell: g.at(0, 0), goal: g.at(6, 0), priority: 10 },
        { id: "B", rank: 1, cell: g.at(0, 2), goal: g.at(6, 2), priority: 10 },
      ],
      20,
    );
    expect(robots.map((r) => r.arrivedAt)).toEqual([6, 6]);
    expect(coordinator.getStats().plannedWaits).toBe(0);
  });

  it("resolves a head-on corridor conflict via the passing bay, higher priority first", () => {
    const { robots, coordinator } = run(
      CORRIDOR,
      [
        { id: "A", rank: 0, cell: CORRIDOR.at(0, 0), goal: CORRIDOR.at(8, 2), priority: 10 },
        { id: "B", rank: 1, cell: CORRIDOR.at(8, 2), goal: CORRIDOR.at(1, 2), priority: 60 },
      ],
      60,
    );
    const [a, b] = robots;
    // B (urgent) is planned first and keeps its direct 11-tick route.
    expect(b.arrivedAt).toBe(11);
    // A gets out of the way (bay or waiting) and still arrives.
    expect(a.arrivedAt).toBeDefined();
    expect(a.arrivedAt!).toBeGreaterThan(11);
    expect(coordinator.getStats().commitRejections).toBe(0);
  });

  it("makes a lower-priority robot yield when it blocks higher-priority traffic", () => {
    // A low-priority robot parked mid-corridor (goal = its own cell) must make way.
    const g = grid([".........", "####.####"]);
    const { robots, coordinator } = run(
      g,
      [
        { id: "H", rank: 0, cell: g.at(0, 0), goal: g.at(8, 0), priority: 60 },
        { id: "L", rank: 1, cell: g.at(4, 0), goal: g.at(4, 0), priority: 0 },
      ],
      40,
    );
    expect(robots[0].arrivedAt).toBeDefined();
    expect(robots[0].arrivedAt!).toBeLessThanOrEqual(14);
    expect(coordinator.recentDecisions().some((d) => d.kind === "wait" || d.kind === "preempt")).toBe(true);
  });

  it("releases and rebuilds reservations when a robot fails on another's route", () => {
    const g = grid(["........."]);
    const c = new Coordinator(g, { horizon: 20 });
    const robots: CoordRobotInput[] = [
      { id: "A", rank: 0, cell: 0, goal: 8, priority: 10, mode: "mobile" },
      { id: "B", rank: 1, cell: 4, goal: 4, priority: 0, mode: "mobile" },
    ];
    c.reset(robots);
    c.plan(0, robots);
    const affected = c.fail("B", 4, 0);
    // A's reservations through cell 4 are dropped; B holds 4 permanently.
    expect(c.table.holdAt(4)?.robotId).toBe("B");
    if (affected.includes("A")) expect(c.table.listCells().some((r) => r.robotId === "A" && r.cell === 4)).toBe(false);
    const next = c.plan(0, [robots[0], { ...robots[1], mode: "failed" }]);
    expect(next.find((i) => i.robotId === "B")!.to).toBe(4);
    // In a single lane A can no longer reach its goal past the failed robot.
    expect(c.robotView("A", 0).plan.every((p) => p.cell < 4)).toBe(true);
  });

  it("is deterministic", () => {
    const make = () =>
      run(
        CORRIDOR,
        [
          { id: "A", rank: 0, cell: CORRIDOR.at(0, 0), goal: CORRIDOR.at(8, 2), priority: 10 },
          { id: "B", rank: 1, cell: CORRIDOR.at(8, 2), goal: CORRIDOR.at(1, 2), priority: 10 },
        ],
        60,
      );
    const a = make();
    const b = make();
    expect(a.robots.map((r) => r.arrivedAt)).toEqual(b.robots.map((r) => r.arrivedAt));
    expect(a.coordinator.recentDecisions()).toEqual(b.coordinator.recentDecisions());
  });
});
