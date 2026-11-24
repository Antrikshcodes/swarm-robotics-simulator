/**
 * Wait-for graph.
 *
 * Nodes are robots. An edge A → B means A cannot make progress because B
 * occupies, holds or has reserved a cell that A needs next:
 *  - "occupied": B stands on a cell within A's next `lookahead` route cells
 *  - "held":     B holds (end-of-plan claim) such a cell
 *  - "reserved": the coordinator reports B owns the reservation A waits on
 *
 * Edges are only built for robots that are actually waiting. Multiple
 * out-edges per robot are allowed: on a 4-connected grid two robots can only
 * block each other directly in pairs (the grid graph is bipartite), so
 * circular waits of three or more robots appear only when a robot is blocked
 * by robots further along its route. Cycles are found as strongly connected
 * components (Tarjan), in deterministic order.
 */
export type WaitReason = "occupied" | "held" | "reserved";

export interface WaitEdge {
  readonly from: string;
  readonly to: string;
  /** Cell index of the contested resource. */
  readonly cell: number;
  readonly reason: WaitReason;
}

export interface WaitingRobot {
  readonly id: string;
  /** Static route cells ahead of the robot (excluding its own cell), nearest first. */
  readonly routeAhead: readonly number[];
  /** Robot the coordinator says this robot waits on, if any. */
  readonly reservationBlocker: string | null;
  /** Cell of that reservation, if known. */
  readonly reservationCell: number | null;
}

export interface GraphContext {
  /** Robot standing on each cell. */
  readonly occupant: ReadonlyMap<number, string>;
  /** Robot holding each cell (end-of-plan claim). */
  readonly holder: ReadonlyMap<number, string>;
}

export function buildWaitForGraph(waiting: readonly WaitingRobot[], ctx: GraphContext, lookahead: number): WaitEdge[] {
  const edges: WaitEdge[] = [];
  for (const robot of [...waiting].sort((a, b) => a.id.localeCompare(b.id))) {
    const seen = new Set<string>();
    const add = (to: string | undefined, cell: number, reason: WaitReason) => {
      if (!to || to === robot.id || seen.has(to)) return;
      seen.add(to);
      edges.push({ from: robot.id, to, cell, reason });
    };
    for (const cell of robot.routeAhead.slice(0, lookahead)) {
      add(ctx.occupant.get(cell), cell, "occupied");
      add(ctx.holder.get(cell), cell, "held");
    }
    if (robot.reservationBlocker !== null) add(robot.reservationBlocker, robot.reservationCell ?? -1, "reserved");
  }
  return edges;
}

/**
 * Strongly connected components with ≥ 2 nodes (circular waits), each sorted,
 * listed in order of their smallest member. Deterministic for a given edge set.
 */
export function findCycles(edges: readonly WaitEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e.to);
  }
  for (const list of adjacency.values()) list.sort();
  const nodes = [...adjacency.keys()].sort();

  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];

  const strongConnect = (v: string) => {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v)!) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indices.get(w)!));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length >= 2) components.push(component.sort());
    }
  };

  for (const v of nodes) if (!indices.has(v)) strongConnect(v);
  return components.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Robots that (transitively) wait on any member of `group` but are not in it. */
export function dependents(edges: readonly WaitEdge[], group: readonly string[]): string[] {
  const inGroup = new Set(group);
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (inGroup.has(e.from) || result.has(e.from)) continue;
      if (inGroup.has(e.to) || result.has(e.to)) {
        result.add(e.from);
        changed = true;
      }
    }
  }
  return [...result].sort();
}

/** Stable key for a robot group. */
export const groupKey = (robots: readonly string[]) => [...robots].sort().join("+");
