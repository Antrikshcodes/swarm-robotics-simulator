import type { GridPoint, Heading, MissionPriority, StationKind, WarehouseLayout } from "../types/simulation";
import type { WorldCommand } from "./commands";
import { cellKindAt, inBounds, isTraversable, parseLayout, pointKey } from "./world/layout";

/**
 * Scenario = initial world + deterministic inputs.
 *
 * Robots are placed at their home cells; the engine decides every move
 * (A* + scheduler). Inputs that drive the run are:
 *  - `missions`: jobs queued at tick 0
 *  - `feed`: a seeded generator that queues new jobs on a fixed cadence
 *  - `schedule`: world commands applied at fixed ticks (e.g. a fault)
 */
export interface RobotSpec {
  readonly id: string;
  readonly model: string;
  readonly colorIndex: number;
  /** Start cell and parking spot when the robot has no work. */
  readonly home: GridPoint;
  readonly heading: Heading;
  readonly battery: number;
}

export interface MissionSpec {
  readonly pickup: string;
  readonly dropoff: string;
  readonly priority?: MissionPriority;
}

export interface MissionFeed {
  /** A new mission is considered every `intervalTicks` ticks. */
  readonly intervalTicks: number;
  /** No new mission while this many are queued or active. */
  readonly maxOpen: number;
  /** Candidate pickup → drop-off pairs; the seeded PRNG picks one. */
  readonly routes: readonly MissionSpec[];
  /** Probability that a generated mission is high / urgent priority. */
  readonly priorityMix?: { readonly high: number; readonly urgent: number };
}

export interface ScheduledCommand {
  /** Applied while processing this tick, before missions and robots update. */
  readonly tick: number;
  readonly command: WorldCommand;
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly focus: string;
  readonly seed: number;
  readonly map: readonly string[];
  readonly robots: readonly RobotSpec[];
  readonly missions: readonly MissionSpec[];
  readonly feed?: MissionFeed;
  readonly schedule?: readonly ScheduledCommand[];
  /** Ticks spent loading / unloading at a station. */
  readonly handling: { readonly loadTicks: number; readonly unloadTicks: number };
}

export interface CompiledScenario {
  readonly definition: ScenarioDefinition;
  readonly layout: WarehouseLayout;
}

function requireStation(layout: WarehouseLayout, id: string, kind: StationKind, context: string) {
  const station = layout.stations.find((s) => s.id === id);
  if (!station) throw new Error(`${context}: unknown station ${id}`);
  if (station.kind !== kind) throw new Error(`${context}: ${id} is a ${station.kind} station, expected ${kind}`);
}

function validateJob(layout: WarehouseLayout, job: MissionSpec, context: string) {
  requireStation(layout, job.pickup, "pickup", context);
  requireStation(layout, job.dropoff, "dropoff", context);
}

/** Validate geometry, IDs and references. Throws with a precise message. */
export function compileScenario(definition: ScenarioDefinition): CompiledScenario {
  const layout = parseLayout(definition.map);
  const ctx = definition.id;
  const ids = new Set<string>();
  const homes = new Set<string>();

  for (const robot of definition.robots) {
    const where = `${ctx}/${robot.id}`;
    if (ids.has(robot.id)) throw new Error(`${where}: duplicate robot id`);
    ids.add(robot.id);
    if (!inBounds(layout, robot.home)) throw new Error(`${where}: home is outside the warehouse`);
    if (!isTraversable(layout, robot.home)) {
      throw new Error(`${where}: home (${robot.home.x}, ${robot.home.y}) is a ${cellKindAt(layout, robot.home)} cell`);
    }
    const kind = cellKindAt(layout, robot.home);
    if (kind === "pickup" || kind === "dropoff") throw new Error(`${where}: robots may not park on a pickup/drop-off station`);
    const key = pointKey(robot.home);
    if (homes.has(key)) throw new Error(`${where}: home cell shared with another robot`);
    homes.add(key);
    if (robot.battery < 0 || robot.battery > 100) throw new Error(`${where}: battery must be 0–100`);
  }

  definition.missions.forEach((job, i) => validateJob(layout, job, `${ctx} mission ${i}`));
  definition.feed?.routes.forEach((job, i) => validateJob(layout, job, `${ctx} feed route ${i}`));
  if (definition.feed && definition.feed.intervalTicks < 1) throw new Error(`${ctx}: feed interval must be ≥ 1`);
  for (const entry of definition.schedule ?? []) {
    if (!Number.isInteger(entry.tick) || entry.tick < 1) throw new Error(`${ctx}: scheduled command tick must be ≥ 1`);
  }
  if (definition.handling.loadTicks < 1 || definition.handling.unloadTicks < 1) {
    throw new Error(`${ctx}: handling ticks must be ≥ 1`);
  }

  return { definition, layout };
}
