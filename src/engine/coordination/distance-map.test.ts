import { describe, expect, it } from "vitest";
import { buildDistanceMap, DistanceCache, distanceFrom } from "./distance-map";
import type { PlanningGrid } from "./space-time-planner";

function makeGrid(rows: string[]): PlanningGrid {
  const height = rows.length;
  const width = rows[0].length;
  return {
    width,
    height,
    passable(cell, isGoal) {
      const x = cell % width;
      const y = (cell - x) / width;
      const ch = rows[y]?.[x];
      if (!ch || ch === "#") return false;
      if (ch === "S") return isGoal;
      return true;
    },
  };
}

describe("coordination/distance-map", () => {
  it("computes exact BFS distances around walls and treats non-goal stations as impassable", () => {
    const grid = makeGrid([
      "S...S",
      ".###.",
      ".....",
    ]);
    const goal = 4; // top-right station (4,0)
    const dist = buildDistanceMap(grid, goal);

    expect(dist[goal]).toBe(0);
    expect(dist[3]).toBe(1);
    expect(dist[1]).toBe(3);
    // Start station at (0,0) is not expanded into, so dist[0] === -1 while distanceFrom finds 1 + neighbour
    expect(dist[0]).toBe(-1);
    expect(distanceFrom(grid, dist, 0)).toBe(4);
    // Blocked rack cell stays -1
    expect(dist[1 * 5 + 2]).toBe(-1);
  });

  it("caches maps per goal and clears cache when worldVersion increments", () => {
    const grid = makeGrid([".....", "....."]);
    const cache = new DistanceCache();

    const m1 = cache.get(grid, 4, 1);
    const m2 = cache.get(grid, 4, 1);
    expect(m1).toBe(m2);
    expect(cache.buildCount).toBe(1);

    const m3 = cache.get(grid, 4, 2);
    expect(m3).not.toBe(m1);
    expect(cache.buildCount).toBe(2);
  });
});
