import type { GridPoint, Heading, WarehouseLayout } from "../types/simulation";
import { isTraversable, parseLayout, samePoint } from "./layout";

/**
 * Scenario definitions for the Mission 001 demo playback.
 *
 * IMPORTANT: robot movement here is *scripted*. Routes are hand-authored
 * waypoint loops expanded into straight grid segments; there is no
 * pathfinding, reservation, or collision avoidance yet. Those arrive in
 * Missions 003–005 and will replace `program` with planner output.
 */
export type ProgramStep =
  /** Move cell-by-cell through axis-aligned waypoints. */
  | { readonly op: "travel"; readonly via: readonly GridPoint[] }
  | { readonly op: "load"; readonly station: string; readonly ticks: number }
  | { readonly op: "unload"; readonly station: string; readonly ticks: number }
  | { readonly op: "charge"; readonly station: string; readonly ticks: number }
  /** Scripted hold — stands in for future coordinator yield decisions. */
  | { readonly op: "wait"; readonly ticks: number; readonly reason: string };

export interface ScriptedRobot {
  readonly id: string;
  readonly model: string;
  readonly colorIndex: number;
  readonly start: GridPoint;
  readonly heading: Heading;
  readonly battery: number;
  /** Ticks to remain staged before the program starts (phase offset). */
  readonly startDelay?: number;
  /** Looped program. Empty = robot stays idle. */
  readonly program: readonly ProgramStep[];
  /** Scripted fault injection for demonstrating incident UI. */
  readonly fault?: { readonly tick: number; readonly reason: string };
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly focus: string;
  readonly map: readonly string[];
  readonly robots: readonly ScriptedRobot[];
  /** Missions that stay queued: no scheduler exists yet (Mission 003). */
  readonly backlog: readonly { readonly pickup: string; readonly dropoff: string }[];
}

export type CompiledStep =
  | { readonly op: "travel"; readonly cells: readonly GridPoint[] }
  | Exclude<ProgramStep, { op: "travel" }>;

export interface CompiledRobot extends Omit<ScriptedRobot, "program"> {
  readonly program: readonly CompiledStep[];
}

export interface CompiledScenario {
  readonly definition: ScenarioDefinition;
  readonly layout: WarehouseLayout;
  readonly robots: readonly CompiledRobot[];
}

/** Expand axis-aligned waypoints into the cells visited after `from`. */
export function expandWaypoints(
  layout: WarehouseLayout,
  from: GridPoint,
  via: readonly GridPoint[],
  context: string,
): GridPoint[] {
  const cells: GridPoint[] = [];
  let cursor = from;
  for (const target of via) {
    if (cursor.x !== target.x && cursor.y !== target.y) {
      throw new Error(
        `${context}: segment (${cursor.x},${cursor.y})→(${target.x},${target.y}) is not axis-aligned`,
      );
    }
    const dx = Math.sign(target.x - cursor.x);
    const dy = Math.sign(target.y - cursor.y);
    while (!samePoint(cursor, target)) {
      cursor = { x: cursor.x + dx, y: cursor.y + dy };
      if (!isTraversable(layout, cursor)) {
        throw new Error(`${context}: cell (${cursor.x},${cursor.y}) is not traversable`);
      }
      cells.push(cursor);
    }
  }
  return cells;
}

export function compileScenario(definition: ScenarioDefinition): CompiledScenario {
  const layout = parseLayout(definition.map);
  const stationIds = new Set(layout.stations.map((s) => s.id));
  const seenIds = new Set<string>();

  const robots = definition.robots.map((robot): CompiledRobot => {
    const context = `${definition.id}/${robot.id}`;
    if (seenIds.has(robot.id)) throw new Error(`${context}: duplicate robot id`);
    seenIds.add(robot.id);
    if (!isTraversable(layout, robot.start)) {
      throw new Error(`${context}: start cell is not traversable`);
    }

    let cursor = robot.start;
    const program = robot.program.map((step, index): CompiledStep => {
      if (step.op === "travel") {
        const cells = expandWaypoints(layout, cursor, step.via, `${context} step ${index}`);
        if (cells.length > 0) cursor = cells[cells.length - 1];
        return { op: "travel", cells };
      }
      if (step.op !== "wait" && !stationIds.has(step.station)) {
        throw new Error(`${context} step ${index}: unknown station ${step.station}`);
      }
      if (step.ticks < 1) throw new Error(`${context} step ${index}: ticks must be ≥ 1`);
      return step;
    });

    if (program.length > 0 && !samePoint(cursor, robot.start)) {
      throw new Error(
        `${context}: program must loop back to its start (${robot.start.x},${robot.start.y}); ends at (${cursor.x},${cursor.y})`,
      );
    }
    return { ...robot, program };
  });

  for (const job of definition.backlog) {
    if (!stationIds.has(job.pickup) || !stationIds.has(job.dropoff)) {
      throw new Error(`${definition.id}: backlog references unknown station`);
    }
  }

  return { definition, layout, robots };
}
