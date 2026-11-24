import { describe, expect, it } from "vitest";
import { buildDistanceMap } from "./distance-map";
import { ReservationTable } from "./reservation-table";
import { planSpaceTime, type PlanningGrid } from "./space-time-planner";

/** Grid from ASCII: '.' open, '#' blocked, 'S' station (goal-only). */
function grid(rows: string[]): PlanningGrid & { at: (x: number, y: number) => number } {
  const width = rows[0].length;
  const height = rows.length;
  const flat = rows.join("");
  return {
    width,
    height,
    passable: (cell, isGoal) => flat[cell] === "." || (flat[cell] === "S" && isGoal),
    at: (x, y) => y * width + x,
  };
}

function plan(g: ReturnType<typeof grid>, table: ReservationTable, robotId: string, start: number, goal: number, startTick = 0, horizon = 30) {
  return planSpaceTime({
    robotId,
    start,
    startTick,
    goal,
    grid: g,
    distances: buildDistanceMap(g, goal),
    table,
    horizon,
    maxExpansions: 5000,
  });
}

describe("space-time A*", () => {
  it("plans the shortest route when nothing interferes", () => {
    const g = grid([".....", "....."]);
    const r = plan(g, new ReservationTable(10), "A", g.at(0, 0), g.at(4, 0));
    expect(r.status).toBe("complete");
    expect(r.positions).toEqual([0, 1, 2, 3, 4]);
    expect(r.waits).toBe(0);
  });

  it("waits instead of entering a cell another robot has reserved", () => {
    // One-lane corridor; B crosses cell 2 at ticks 2..3 heading down/up a side spur.
    const g = grid([".....", "##.##"]);
    const table = new ReservationTable(10);
    table.reservePlan("B", 0, [g.at(2, 1), g.at(2, 1), g.at(2, 0), g.at(2, 1)]); // B occupies (2,0) at tick 2
    const r = plan(g, table, "A", g.at(0, 0), g.at(4, 0));
    expect(r.status).toBe("complete");
    // A must not be on (2,0) at tick 2.
    expect(r.positions[2]).not.toBe(g.at(2, 0));
    expect(r.waits).toBeGreaterThan(0);
    // and never shares a cell with B at any tick
    for (let t = 1; t < r.positions.length; t += 1) expect(table.canOccupy("A", t, r.positions[t])).toBe(true);
  });

  it("never plans a head-on swap", () => {
    const g = grid(["....."]);
    const table = new ReservationTable(5);
    // B moves 3 → 2 during tick 1, then stays out of the way at 2? No: continues to 0.
    table.reservePlan("B", 0, [3, 2, 1, 0]);
    // A at 2 wants to reach 4: the only way is through 3, which B leaves at tick 1 —
    // but A cannot take 2→3 at tick 1 (swap). A and B share a single lane, so A
    // must not pass through B at all; the planner must keep A safe.
    const r = plan(g, table, "A", 2, 4);
    for (let t = 1; t < r.positions.length; t += 1) {
      expect(table.canMove("A", t, r.positions[t - 1], r.positions[t])).toBe(true);
    }
    expect(r.positions[1]).not.toBe(3);
  });

  it("detours when the detour is faster than waiting", () => {
    const g = grid([".....", ".....", "....."]);
    const table = new ReservationTable(15);
    // B parks in the middle of row 0 for a long time.
    table.setHold("B", g.at(2, 0), 0);
    const r = plan(g, table, "A", g.at(0, 0), g.at(4, 0));
    expect(r.status).toBe("complete");
    expect(r.positions).not.toContain(g.at(2, 0));
    expect(r.positions.length - 1).toBe(6); // 4 straight + 2 to step around
  });

  it("does not finish on a goal that another robot will need later", () => {
    const g = grid(["...S"]);
    const table = new ReservationTable(4);
    table.setHold("B", 3, 0); // B is docked at the station
    const r = plan(g, table, "A", 0, 3);
    expect(r.status).toBe("partial");
    expect(r.positions.at(-1)).toBe(2); // waits next to the dock
  });

  it("enters stations only as the goal", () => {
    const g = grid(["S..", "..."]);
    const r = plan(g, new ReservationTable(6), "A", g.at(1, 0), g.at(2, 1));
    expect(r.positions).not.toContain(g.at(0, 0));
  });

  it("returns a partial plan beyond the horizon and unreachable when sealed", () => {
    const g = grid(["..........."]);
    const r = plan(g, new ReservationTable(11), "A", 0, 10, 0, 4);
    expect(r.status).toBe("partial");
    expect(r.positions).toEqual([0, 1, 2, 3, 4]);
    const sealed = grid(["..#.."]);
    expect(plan(sealed, new ReservationTable(5), "A", 0, 4).status).toBe("unreachable");
  });

  it("reports blocked when even staying is unsafe", () => {
    const g = grid(["#.#"]);
    const table = new ReservationTable(3);
    table.reservePlan("B", 0, [1, 1]); // B claims the only cell A is on at tick 1
    const r = plan(g, table, "A", 1, 1);
    expect(r.status).toBe("blocked");
  });

  it("is deterministic", () => {
    const g = grid([".....", ".....", "....."]);
    const a = plan(g, new ReservationTable(15), "A", 0, 14);
    const b = plan(g, new ReservationTable(15), "A", 0, 14);
    expect(a).toEqual(b);
  });
});
