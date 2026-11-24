import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "../types/simulation";
import { createSimulationSource, SCENARIOS } from "./index";
import { compileScenario } from "./scenario";

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Test-only audit of the *scripted* demo. The engine itself performs no
 * collision checking yet (Mission 004); this guards against authoring a
 * demo script that visually shows two robots in one cell or swapping.
 */
function findScriptConflicts(frames: SimulationSnapshot[]): string[] {
  const problems: string[] = [];
  for (const frame of frames) {
    const occupied = new Map<string, string>();
    for (const robot of frame.robots) {
      const cell = key(robot.position.x, robot.position.y);
      const other = occupied.get(cell);
      if (other) problems.push(`tick ${frame.tick}: ${other} and ${robot.id} share ${cell}`);
      occupied.set(cell, robot.id);
    }
    for (const a of frame.robots) {
      for (const b of frame.robots) {
        if (a.id >= b.id) continue;
        const swapped =
          key(a.position.x, a.position.y) === key(b.previousPosition.x, b.previousPosition.y) &&
          key(b.position.x, b.position.y) === key(a.previousPosition.x, a.previousPosition.y) &&
          key(a.position.x, a.position.y) !== key(a.previousPosition.x, a.previousPosition.y);
        if (swapped) problems.push(`tick ${frame.tick}: ${a.id} and ${b.id} swap cells`);
      }
    }
  }
  return problems;
}

describe.each(SCENARIOS.map((s) => [s.id, s] as const))("scenario %s", (id, definition) => {
  it("compiles: routes are axis-aligned, traversable, and closed loops", () => {
    expect(() => compileScenario(definition)).not.toThrow();
  });

  it("is deterministic across instances and when seeking", () => {
    const a = createSimulationSource(id);
    const b = createSimulationSource(id);
    for (let i = 0; i < 240; i += 1) {
      a.step();
      b.step();
    }
    expect(JSON.stringify(a.getSnapshot())).toEqual(JSON.stringify(b.getSnapshot()));

    const seeker = createSimulationSource(id);
    seeker.seek(500);
    seeker.seek(240); // backwards seek replays from tick 0
    expect(JSON.stringify(seeker.getSnapshot())).toEqual(JSON.stringify(a.getSnapshot()));
  });

  it("reset restores the initial snapshot", () => {
    const source = createSimulationSource(id);
    const initial = JSON.stringify(source.getSnapshot());
    for (let i = 0; i < 50; i += 1) source.step();
    source.reset();
    expect(JSON.stringify(source.getSnapshot())).toEqual(initial);
  });

  it("demo script never places two robots in one cell or swaps them (1 000 ticks)", () => {
    const source = createSimulationSource(id);
    const frames: SimulationSnapshot[] = [source.getSnapshot()];
    for (let i = 0; i < 1000; i += 1) frames.push(source.step());
    expect(findScriptConflicts(frames)).toEqual([]);
  });

  it("derives delivery metrics from completed missions", () => {
    const source = createSimulationSource(id);
    let snap = source.getSnapshot();
    for (let i = 0; i < 400; i += 1) snap = source.step();
    const deliveredEvents = snap.deliveryTicks.length;
    expect(snap.metrics.completedDeliveries).toBe(deliveredEvents);
    expect(snap.metrics.totalRobots).toBe(definition.robots.length);
    expect(snap.metrics.utilisation).toBeGreaterThanOrEqual(0);
    expect(snap.metrics.utilisation).toBeLessThanOrEqual(1);
  });
});

describe("mission lifecycle", () => {
  it("each package is carried by at most one robot", () => {
    const source = createSimulationSource("high-density");
    for (let i = 0; i < 600; i += 1) {
      const snap = source.step();
      const carried = snap.robots.map((r) => r.packageId).filter((p): p is string => p !== null);
      expect(new Set(carried).size).toBe(carried.length);
    }
  });

  it("missions progress to-pickup → carrying → completed", () => {
    const source = createSimulationSource("standard");
    let snap = source.getSnapshot();
    const first = snap.missions.find((m) => m.robotId === "R-01");
    expect(first?.state).toBe("to-pickup");
    for (let i = 0; i < 5; i += 1) snap = source.step();
    expect(snap.missions.find((m) => m.id === first?.id)?.state).toBe("carrying");
    for (let i = 0; i < 40; i += 1) snap = source.step();
    const done = snap.missions.find((m) => m.id === first?.id);
    expect(done?.state).toBe("completed");
    expect(done?.completedTick).not.toBeNull();
  });

  it("backlog missions stay queued because no scheduler exists yet", () => {
    const source = createSimulationSource("high-density");
    for (let i = 0; i < 300; i += 1) source.step();
    const snap = source.getSnapshot();
    expect(snap.metrics.queuedMissions).toBe(3);
  });

  it("scripted fault halts the robot and flags its mission for recovery", () => {
    const source = createSimulationSource("high-density");
    const snap = source.seek(60);
    const r7 = snap.robots.find((r) => r.id === "R-07");
    expect(r7?.status).toBe("fault");
    const frozen = r7?.position;
    const later = source.seek(120).robots.find((r) => r.id === "R-07");
    expect(later?.position).toEqual(frozen);
    expect(snap.missions.some((m) => m.robotId === "R-07" && m.state === "recovery-required")).toBe(
      true,
    );
    expect(snap.events.some((e) => e.kind === "robot-fault")).toBe(true);
  });

  it("narrow-aisle hold happens while R-01 occupies the passage", () => {
    const source = createSimulationSource("narrow-aisle");
    const snap = source.seek(20);
    const r1 = snap.robots.find((r) => r.id === "R-01");
    const r2 = snap.robots.find((r) => r.id === "R-02");
    expect(r2?.status).toBe("waiting");
    expect(r1?.position.y).toBe(5);
    expect(r1?.position.x).toBeGreaterThanOrEqual(8);
    expect(r1?.position.x).toBeLessThanOrEqual(13);
  });
});
