import { it } from "vitest";
import { compileScenario, type ScenarioDefinition } from "../scenario";
import { stressScenario } from "../scenarios/stress";
import { WarehouseEngine } from "../warehouse-engine";

/**
 * Coordination scaling benchmark (run with `npm run bench`; excluded from
 * `npm test`). Builds a 40 × 27 warehouse with 8 docks and N robots under a
 * heavy mission feed, and measures wall-clock time per tick.
 */
const W = 40;
const H = 27;

function scenario(robots: number): ScenarioDefinition {
  return stressScenario({ id: `bench-${robots}`, name: `Bench ${robots}`, width: W, height: H, robots });
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
