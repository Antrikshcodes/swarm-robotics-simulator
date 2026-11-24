import { MinHeap } from "../pathfinding/min-heap";
import { distanceFrom } from "./distance-map";
import type { ReservationTable } from "./reservation-table";

/**
 * Space-time A* (cooperative, windowed — "WHCA*").
 *
 * State = (cell, tick). Actions each tick: move N/E/S/W or wait. A move or
 * wait is legal only if the reservation table allows it (target cell free at
 * t+1 and no opposing edge reserved → no head-on swap).
 *
 * - Cost = ticks elapsed, so the planner minimises arrival time and will
 *   wait when waiting is faster than detouring.
 * - Heuristic = exact static distance to the goal (BFS map, see
 *   distance-map.ts) — admissible, and far better informed than Manhattan.
 * - Goal test: on the goal AND able to hold it from then on (nobody else
 *   reserved it later), because robots dwell at stations. A goal station is
 *   only entered when it can be held — stations are never through-routes.
 * - Bounded: search depth ≤ `horizon` ticks and ≤ `maxExpansions` nodes. If
 *   the goal is not reached the best *safe* partial plan is returned (closest
 *   to the goal, then earliest) and the robot replans before it runs out.
 * - Deterministic: heap order (f, h, cell, tick); actions tried N, E, S, W, wait.
 */
export interface PlanningGrid {
  readonly width: number;
  readonly height: number;
  /** Static passability, including closures. Stations only when `isGoal`. */
  passable(cell: number, isGoal: boolean): boolean;
}

export interface SpaceTimeRequest {
  readonly robotId: string;
  readonly start: number;
  readonly startTick: number;
  readonly goal: number;
  readonly grid: PlanningGrid;
  /** Static distance from each cell to the goal (-1 = unreachable). */
  readonly distances: Int32Array;
  readonly table: ReservationTable;
  readonly horizon: number;
  readonly maxExpansions: number;
  /**
   * Ticks the robot will stay on the goal (station handling). When set, the
   * goal only has to be free for [arrival, arrival + goalDwell + 1] instead of
   * forever, so a robot can use a dock another robot will need later.
   */
  readonly goalDwell?: number;
}

export type SpaceTimeStatus =
  /** Reaches the goal and can hold it. */
  | "complete"
  /** Best safe progress within the horizon; replan before it runs out. */
  | "partial"
  /** No static route exists (closures, sealed area). */
  | "unreachable"
  /** Not even staying put is safe — another reservation claims this cell. */
  | "blocked";

export interface SpaceTimePlan {
  readonly status: SpaceTimeStatus;
  /** positions[i] = cell after tick startTick + i; positions[0] = start. */
  readonly positions: readonly number[];
  readonly expanded: number;
  readonly waits: number;
}

interface Node {
  readonly cell: number;
  readonly t: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly parent: number;
}

export function neighbourCells(cell: number, width: number, height: number): number[] {
  const x = cell % width;
  const y = (cell - x) / width;
  const out: number[] = [];
  if (y > 0) out.push(cell - width); // N
  if (x < width - 1) out.push(cell + 1); // E
  if (y < height - 1) out.push(cell + width); // S
  if (x > 0) out.push(cell - 1); // W
  return out;
}

export function planSpaceTime(req: SpaceTimeRequest): SpaceTimePlan {
  const { robotId, start, startTick, goal, grid, distances, table, horizon, maxExpansions, goalDwell } = req;
  const goalFree = (t: number) =>
    goalDwell === undefined ? table.canHoldFrom(robotId, t, goal) : table.canStay(robotId, t, t + goalDwell + 1, goal);
  const cellCount = grid.width * grid.height;
  const startH = distanceFrom(grid, distances, start);
  if (startH < 0) return { status: "unreachable", positions: [start], expanded: 0, waits: 0 };

  const nodes: Node[] = [];
  const open = new MinHeap<number>((a, b) => {
    const A = nodes[a];
    const B = nodes[b];
    return A.f - B.f || A.h - B.h || A.cell - B.cell || A.t - B.t;
  });
  const seen = new Set<number>();
  const key = (cell: number, t: number) => (t - startTick) * cellCount + cell;

  nodes.push({ cell: start, t: startTick, g: 0, h: startH, f: startH, parent: -1 });
  open.push(0);
  seen.add(key(start, startTick));

  let expanded = 0;
  let best = -1;

  while (open.size > 0 && expanded < maxExpansions) {
    const id = open.pop()!;
    const node = nodes[id];
    expanded += 1;

    const safeToHold = table.canHoldFrom(robotId, node.t, node.cell);
    if (node.cell === goal && goalFree(node.t)) return finish(nodes, id, "complete", expanded);
    if (safeToHold) {
      const b = best >= 0 ? nodes[best] : null;
      if (!b || node.h < b.h || (node.h === b.h && node.t < b.t)) best = id;
    }
    if (node.t - startTick >= horizon) continue;

    const t1 = node.t + 1;
    const options = [...neighbourCells(node.cell, grid.width, grid.height), node.cell];
    for (const next of options) {
      const isWait = next === node.cell;
      if (!isWait) {
        if (!grid.passable(next, next === goal)) continue;
        if (distances[next] < 0) continue;
        // A goal station is never a through-route: enter it only to stay.
        if (next === goal && !grid.passable(next, false) && !goalFree(t1)) continue;
      }
      // Waiting on a cell with no map entry (a station start) keeps its start distance.
      const h = isWait ? node.h : distances[next];
      if (!table.canMove(robotId, t1, node.cell, next)) continue;
      const k = key(next, t1);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = node.g + 1;
      nodes.push({ cell: next, t: t1, g, h, f: g + h, parent: id });
      open.push(nodes.length - 1);
    }
  }

  if (best >= 0) return finish(nodes, best, "partial", expanded);
  return { status: "blocked", positions: [start], expanded, waits: 0 };
}

function finish(nodes: Node[], id: number, status: SpaceTimeStatus, expanded: number): SpaceTimePlan {
  const positions: number[] = [];
  for (let i = id; i >= 0; i = nodes[i].parent) positions.push(nodes[i].cell);
  positions.reverse();
  let waits = 0;
  for (let i = 1; i < positions.length; i += 1) if (positions[i] === positions[i - 1]) waits += 1;
  return { status, positions, expanded, waits };
}
