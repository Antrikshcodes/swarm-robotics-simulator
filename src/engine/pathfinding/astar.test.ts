import { describe, expect, it } from "vitest";
import { parseLayout } from "../world/layout";
import { findPath } from "./astar";
import type { GridPoint } from "../../types/simulation";

const OPEN = parseLayout([
  ".....",
  ".....",
  ".....",
  ".....",
]);

const WALL = parseLayout([
  ".....",
  ".###.",
  ".#.#.",
  ".#...",
]);

function isContiguous(start: GridPoint, path: readonly GridPoint[]): boolean {
  let prev = start;
  for (const p of path) {
    if (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) !== 1) return false;
    prev = p;
  }
  return true;
}

describe("A* pathfinding", () => {
  it("finds a direct shortest route on open floor", () => {
    const result = findPath({ layout: OPEN, start: { x: 0, y: 0 }, goal: { x: 4, y: 3 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(7);
    expect(result.path).toHaveLength(7);
    expect(result.path.at(-1)).toEqual({ x: 4, y: 3 });
    expect(isContiguous({ x: 0, y: 0 }, result.path)).toBe(true);
  });

  it("returns an empty path when start equals goal", () => {
    const result = findPath({ layout: OPEN, start: { x: 2, y: 2 }, goal: { x: 2, y: 2 } });
    expect(result).toMatchObject({ ok: true, path: [], cost: 0 });
  });

  it("routes around obstacles and never enters them", () => {
    const result = findPath({ layout: WALL, start: { x: 2, y: 2 }, goal: { x: 2, y: 0 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Must leave the pocket via (2,3) and go round the rack wall.
    expect(result.cost).toBe(8);
    for (const p of result.path) expect(WALL.cells[p.y * WALL.width + p.x]).not.toBe("rack");
    expect(isContiguous({ x: 2, y: 2 }, result.path)).toBe(true);
  });

  it("reports unreachable destinations as no-path", () => {
    const sealed = parseLayout([".#.", "##.", "..."]);
    const result = findPath({ layout: sealed, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 } });
    expect(result).toMatchObject({ ok: false, reason: "no-path" });
  });

  it("rejects invalid and out-of-bounds coordinates", () => {
    expect(findPath({ layout: OPEN, start: { x: -1, y: 0 }, goal: { x: 1, y: 1 } })).toMatchObject({
      ok: false,
      reason: "invalid-start",
    });
    expect(findPath({ layout: OPEN, start: { x: 0, y: 0 }, goal: { x: 5, y: 0 } })).toMatchObject({
      ok: false,
      reason: "invalid-goal",
    });
    expect(findPath({ layout: OPEN, start: { x: 0.5, y: 0 }, goal: { x: 1, y: 1 } })).toMatchObject({
      ok: false,
      reason: "invalid-start",
    });
    expect(findPath({ layout: WALL, start: { x: 0, y: 0 }, goal: { x: 1, y: 1 } })).toMatchObject({
      ok: false,
      reason: "goal-not-traversable",
    });
  });

  it("respects dynamic blockers but may always leave the start cell", () => {
    const blocked = new Set(["1,0", "1,1", "1,2"]);
    const result = findPath({
      layout: OPEN,
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      isBlocked: (p) => blocked.has(`${p.x},${p.y}`) || (p.x === 0 && p.y === 0),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path.some((p) => blocked.has(`${p.x},${p.y}`))).toBe(false);
    expect(result.cost).toBe(8);
    expect(findPath({ layout: OPEN, start: { x: 0, y: 0 }, goal: { x: 1, y: 1 }, isBlocked: (p) => blocked.has(`${p.x},${p.y}`) })).toMatchObject({
      ok: false,
      reason: "goal-blocked",
    });
  });

  it("only enters station cells when they are the goal", () => {
    const docks = parseLayout(["P.D", "..."]);
    const through = findPath({ layout: docks, start: { x: 0, y: 1 }, goal: { x: 2, y: 0 } });
    expect(through.ok).toBe(true);
    if (!through.ok) return;
    expect(through.path.some((p) => p.x === 0 && p.y === 0)).toBe(false);
    expect(through.path.at(-1)).toEqual({ x: 2, y: 0 });
  });

  it("is deterministic and prefers the same route among equal-cost options", () => {
    const a = findPath({ layout: OPEN, start: { x: 0, y: 0 }, goal: { x: 3, y: 3 } });
    const b = findPath({ layout: OPEN, start: { x: 0, y: 0 }, goal: { x: 3, y: 3 } });
    expect(a).toEqual(b);
    if (!a.ok) return;
    expect(a.cost).toBe(6);
  });
});
