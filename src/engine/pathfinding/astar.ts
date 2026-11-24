import type { GridPoint, WarehouseLayout } from "../../types/simulation";
import { cellKindAt, inBounds, isStationKind, isTraversableKind, isValidPoint, manhattan, neighbours, samePoint } from "../world/layout";
import { MinHeap } from "./min-heap";

/**
 * A* over the warehouse grid.
 *
 * - 4-connected moves, unit cost, Manhattan heuristic (admissible and
 *   consistent for this move set, so results are optimal).
 * - Racks, obstacles and out-of-bounds cells are never entered.
 * - Station cells (pickup / drop-off / charger) are only entered when they
 *   are the goal, so robots never cut through a dock that is in use.
 * - `isBlocked` adds dynamic blockers (closures, stationary robots). It is
 *   not applied to the start cell: a robot may always leave where it is.
 * - Deterministic: ties broken by lower f, then lower h, then lower y, then
 *   lower x; neighbours expanded in fixed N, E, S, W order.
 *
 * Spatial only. Time-indexed reservations are planned for Mission 004.
 */
export type PathFailureReason =
  | "invalid-start"
  | "invalid-goal"
  | "start-not-traversable"
  | "goal-not-traversable"
  | "goal-blocked"
  | "no-path";

export type PathResult =
  | {
      readonly ok: true;
      /** Cells to visit after the start, ending at the goal. Empty if start = goal. */
      readonly path: readonly GridPoint[];
      readonly cost: number;
      readonly expanded: number;
    }
  | { readonly ok: false; readonly reason: PathFailureReason; readonly message: string };

export interface PathRequest {
  readonly layout: WarehouseLayout;
  readonly start: GridPoint;
  readonly goal: GridPoint;
  readonly isBlocked?: (p: GridPoint) => boolean;
}

interface Node {
  readonly x: number;
  readonly y: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
}

const compareNodes = (a: Node, b: Node): number => a.f - b.f || a.h - b.h || a.y - b.y || a.x - b.x;

const fail = (reason: PathFailureReason, message: string): PathResult => ({ ok: false, reason, message });

export function findPath({ layout, start, goal, isBlocked }: PathRequest): PathResult {
  if (!isValidPoint(start) || !inBounds(layout, start)) {
    return fail("invalid-start", `Start ${describe(start)} is outside the ${layout.width}×${layout.height} warehouse`);
  }
  if (!isValidPoint(goal) || !inBounds(layout, goal)) {
    return fail("invalid-goal", `Goal ${describe(goal)} is outside the ${layout.width}×${layout.height} warehouse`);
  }
  if (!isTraversableKind(cellKindAt(layout, start)!)) {
    return fail("start-not-traversable", `Start (${start.x}, ${start.y}) is not a traversable cell`);
  }
  if (!isTraversableKind(cellKindAt(layout, goal)!)) {
    return fail("goal-not-traversable", `Goal (${goal.x}, ${goal.y}) is not a traversable cell`);
  }
  if (samePoint(start, goal)) return { ok: true, path: [], cost: 0, expanded: 0 };
  if (isBlocked?.(goal)) return fail("goal-blocked", `Goal (${goal.x}, ${goal.y}) is currently blocked`);

  const { width } = layout;
  const index = (p: GridPoint) => p.y * width + p.x;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap<Node>(compareNodes);

  const h0 = manhattan(start, goal);
  open.push({ x: start.x, y: start.y, g: 0, h: h0, f: h0 });
  gScore.set(index(start), 0);
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop()!;
    const ci = current.y * width + current.x;
    if (closed.has(ci)) continue; // stale heap entry
    closed.add(ci);
    expanded += 1;

    if (current.x === goal.x && current.y === goal.y) {
      return { ok: true, path: reconstruct(cameFrom, ci, index(start), width), cost: current.g, expanded };
    }

    for (const next of neighbours(current)) {
      if (!inBounds(layout, next)) continue;
      const kind = cellKindAt(layout, next)!;
      if (!isTraversableKind(kind)) continue;
      const isGoal = next.x === goal.x && next.y === goal.y;
      if (isStationKind(kind) && !isGoal) continue;
      if (isBlocked?.(next)) continue;
      const ni = index(next);
      if (closed.has(ni)) continue;
      const g = current.g + 1;
      if (g >= (gScore.get(ni) ?? Infinity)) continue;
      gScore.set(ni, g);
      cameFrom.set(ni, ci);
      const h = manhattan(next, goal);
      open.push({ x: next.x, y: next.y, g, h, f: g + h });
    }
  }

  return fail("no-path", `No path from (${start.x}, ${start.y}) to (${goal.x}, ${goal.y})`);
}

function reconstruct(cameFrom: Map<number, number>, goalIndex: number, startIndex: number, width: number): GridPoint[] {
  const path: GridPoint[] = [];
  let i = goalIndex;
  while (i !== startIndex) {
    path.push({ x: i % width, y: Math.floor(i / width) });
    const prev = cameFrom.get(i);
    if (prev === undefined) break;
    i = prev;
  }
  return path.reverse();
}

function describe(p: unknown): string {
  return isValidPoint(p) ? `(${p.x}, ${p.y})` : JSON.stringify(p);
}
