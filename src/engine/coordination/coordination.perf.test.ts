import { it } from "vitest";
import { compileScenario, type MissionSpec, type ScenarioDefinition } from "../scenario";
import { WarehouseEngine } from "../warehouse-engine";

/**
 * Coordination scaling benchmark (run with `npm run bench`; excluded from
 * `npm test`). Builds a 40 × 27 warehouse with 8 docks and N robots under a
 * heavy mission feed, and measures wall-clock time per tick.
 */
const W = 40;
const H = 27;

function buildMap(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y += 1) {
    let row = "";
    for (let x = 0; x < W; x += 1) {
      const aisle = y % 3 === 0 && y < H - 3;
      const dockRow = aisle && y % 6 === 3;
      if (y >= H - 3) row += ".";
      else if (x === 0) row += dockRow ? "P" : ".";
      else if (x === W - 1) row += dockRow ? "D" : ".";
      else if (aisle || x === 1 || x === W - 2 || x % 8 === 4) row += "-";
      else row += "#";
    }
    rows.push(row);
  }
  return rows;
}

function scenario(robots: number): ScenarioDefinition {
  const pickups = ["PK-01", "PK-02", "PK-03", "PK-04"];
  const dropoffs = ["DO-01", "DO-02", "DO-03", "DO-04"];
  const routes: MissionSpec[] = pickups.flatMap((pickup) => dropoffs.map((dropoff) => ({ pickup, dropoff })));
  return {
    id: `bench-${robots}`,
    name: `Bench ${robots}`,
    summary: "",
    focus: "",
    seed: 42,
    map: buildMap(),
    robots: Array.from({ length: robots }, (_, i) => ({
      id: `R-${String(i + 1).padStart(2, "0")}`,
      model: "B",
      colorIndex: (i % 8) + 1,
      heading: "N" as const,
      battery: 100,
      home: { x: 2 + (i % 36), y: H - 1 - Math.floor(i / 36) },
    })),
    missions: [],
    feed: { intervalTicks: 2, maxOpen: robots, routes, priorityMix: { high: 0.2, urgent: 0.05 } },
    handling: { loadTicks: 3, unloadTicks: 3 },
  };
}

it("coordination scaling", () => {
  const TICKS = 600;
  const rows: string[] = [];
  for (const n of [4, 8, 16, 24, 32]) {
    const engine = new WarehouseEngine(compileScenario(scenario(n)), { checkInvariants: false });
    const times: number[] = [];
    let snap = engine.getSnapshot();
    for (let i = 0; i < TICKS; i += 1) {
      const t0 = performance.now();
      snap = engine.step();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];
    const max = times[times.length - 1];
    const stats = snap.coordination.stats;
    const waiting = snap.robots.reduce((a, r) => a + r.stats.waitingTicks, 0);
    rows.push(
      `| ${n} | ${mean.toFixed(2)} | ${p95.toFixed(2)} | ${max.toFixed(1)} | ${(stats.plansComputed / TICKS).toFixed(2)} | ${Math.round(stats.nodesExpanded / Math.max(1, stats.plansComputed))} | ${snap.metrics.completedDeliveries} | ${(waiting / (n * TICKS) * 100).toFixed(1)}% | ${stats.preemptions} | ${stats.commitRejections} |`,
    );
  }
  console.log(
    [
      `Coordination scaling — ${W}×${H} grid, ${TICKS} ticks, invariant checks off`,
      "| Robots | ms/tick mean | ms/tick p95 | ms/tick max | plans/tick | nodes/plan | deliveries | waiting share | preemptions | commit rejections |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...rows,
    ].join("\n"),
  );
}, 120_000);
