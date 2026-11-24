import type { MissionSpec, ScenarioDefinition } from "../scenario";

/**
 * Synthetic stress-test warehouses for measuring rendering and coordination
 * at fleet sizes the hand-built scenarios do not reach. They are generated,
 * not modelled on a real site, and are labelled as such in the selector.
 *
 * Layout: rack blocks between horizontal aisles every third row, vertical
 * cross-aisles every eighth column, pickup docks on the west wall and
 * drop-off docks on the east wall on every other aisle, and a three-row
 * open staging area along the south wall where the robots start.
 */
export function stressMap(width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = "";
    for (let x = 0; x < width; x += 1) {
      const aisle = y % 3 === 0 && y < height - 3;
      const dockRow = aisle && y % 6 === 3;
      if (y >= height - 3) row += ".";
      else if (x === 0) row += dockRow ? "P" : ".";
      else if (x === width - 1) row += dockRow ? "D" : ".";
      else if (aisle || x === 1 || x === width - 2 || x % 8 === 4) row += "-";
      else row += "#";
    }
    rows.push(row);
  }
  return rows;
}

function dockCount(map: readonly string[], symbol: string): number {
  return map.reduce((n, row) => n + [...row].filter((c) => c === symbol).length, 0);
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);

export interface StressOptions {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly robots: number;
  readonly seed?: number;
  /** Mission feed interval in ticks (default 2: a heavy feed). */
  readonly intervalTicks?: number;
}

export function stressScenario(options: StressOptions): ScenarioDefinition {
  const { width, height, robots } = options;
  const map = stressMap(width, height);
  const pickups = ids("PK", dockCount(map, "P"));
  const dropoffs = ids("DO", dockCount(map, "D"));
  const routes: MissionSpec[] = pickups.flatMap((pickup) => dropoffs.map((dropoff) => ({ pickup, dropoff })));
  const perRow = width - 4;
  return {
    id: options.id,
    group: "stress",
    name: options.name,
    summary: `${robots} robots · ${width} × ${height} synthetic layout · heavy feed`,
    focus: `Synthetic stress test: a generated ${width} × ${height} rack grid with ${pickups.length} pickup and ${dropoffs.length} drop-off docks, ${robots} robots and a mission every ${options.intervalTicks ?? 2} ticks. Used to measure rendering and coordination at scale; it does not model a real site.`,
    seed: options.seed ?? 42,
    map,
    robots: Array.from({ length: robots }, (_, i) => ({
      id: `R-${String(i + 1).padStart(2, "0")}`,
      model: i % 3 === 2 ? "AMR-120" : "AMR-200",
      colorIndex: (i % 8) + 1,
      heading: "N" as const,
      battery: 100 - ((i * 7) % 45),
      home: { x: 2 + (i % perRow), y: height - 1 - Math.floor(i / perRow) },
    })),
    missions: [],
    feed: { intervalTicks: options.intervalTicks ?? 2, maxOpen: robots, routes, priorityMix: { high: 0.2, urgent: 0.05 } },
    handling: { loadTicks: 3, unloadTicks: 3 },
  };
}

export const STRESS_SCENARIOS: readonly ScenarioDefinition[] = [
  stressScenario({ id: "stress-15", name: "Stress test · 15 robots", width: 32, height: 21, robots: 15 }),
  stressScenario({ id: "stress-32", name: "Stress test · 32 robots", width: 40, height: 27, robots: 32 }),
];
