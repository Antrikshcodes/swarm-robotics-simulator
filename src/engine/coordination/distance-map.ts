import { neighbourCells, type PlanningGrid } from "./space-time-planner";

/**
 * Exact static distance from every cell to `goal` (BFS from the goal).
 * Used as the space-time A* heuristic and to rank robots for assignment.
 * -1 marks cells that cannot reach the goal. Station cells are only valid
 * as the goal itself, matching the planner's passability rule.
 */
export function buildDistanceMap(grid: PlanningGrid, goal: number): Int32Array {
  const size = grid.width * grid.height;
  const dist = new Int32Array(size).fill(-1);
  if (!grid.passable(goal, true)) return dist;
  dist[goal] = 0;
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  queue[tail++] = goal;
  while (head < tail) {
    const cell = queue[head++];
    for (const next of neighbourCells(cell, grid.width, grid.height)) {
      if (dist[next] !== -1 || !grid.passable(next, false)) continue;
      dist[next] = dist[cell] + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

/**
 * Distance from a robot's *current* cell. A robot may always leave the cell
 * it stands on — even a station, which the BFS never expands through — so a
 * start without its own entry takes 1 + its best neighbour.
 */
export function distanceFrom(grid: PlanningGrid, dist: Int32Array, cell: number): number {
  if (dist[cell] >= 0) return dist[cell];
  let best = -1;
  for (const next of neighbourCells(cell, grid.width, grid.height)) {
    if (dist[next] >= 0 && (best < 0 || dist[next] + 1 < best)) best = dist[next] + 1;
  }
  return best;
}

/**
 * Cache of distance maps keyed by goal and a "world version" that changes
 * whenever static passability changes (closures). Bounded LRU-ish: cleared
 * on version change, so it never holds stale maps.
 */
export class DistanceCache {
  private version = -1;
  private readonly maps = new Map<number, Int32Array>();
  private builds = 0;

  get(grid: PlanningGrid, goal: number, version: number): Int32Array {
    if (version !== this.version) {
      this.maps.clear();
      this.version = version;
    }
    let map = this.maps.get(goal);
    if (!map) {
      map = buildDistanceMap(grid, goal);
      this.maps.set(goal, map);
      this.builds += 1;
    }
    return map;
  }

  get buildCount(): number {
    return this.builds;
  }
}
