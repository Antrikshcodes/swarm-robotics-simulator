import { describe, expect, it } from "vitest";
import { createSimulationSource, getCompiledScenario, SCENARIOS } from "../../engine";
import { angleDelta, CELL, gridToWorld, HEADING_YAW, worldToGrid } from "./grid-to-world";
import { easeInOut, lerpGrid, tickProgress } from "./interpolation";
import { buildRackScene, isOpenCell, RACK } from "./layout-to-scene";
import { ndcToViewport, robotLabelMeta, stationColorForKind } from "./projection";

const frame = { width: 28, height: 18 };

describe("grid ⇄ world", () => {
  it("centres the warehouse on the origin and maps x→x, y→z", () => {
    expect(gridToWorld(frame, 0, 0)).toEqual({ x: -13.5, y: 0, z: -8.5 });
    expect(gridToWorld(frame, 27, 17, 2)).toEqual({ x: 13.5, y: 2, z: 8.5 });
    // The warehouse centre (between cells 13 and 14) is the world origin.
    const mid = gridToWorld(frame, 13.5, 8.5);
    expect(mid.x).toBeCloseTo(0);
    expect(mid.z).toBeCloseTo(0);
    expect(gridToWorld(frame, 1, 0).x - gridToWorld(frame, 0, 0).x).toBe(CELL);
  });

  it("round-trips every cell and rejects points outside", () => {
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const w = gridToWorld(frame, x, y);
        expect(worldToGrid(frame, w.x, w.z)).toEqual({ x, y });
        expect(worldToGrid(frame, w.x + 0.49, w.z - 0.49)).toEqual({ x, y });
      }
    }
    expect(worldToGrid(frame, -20, 0)).toBeNull();
    expect(worldToGrid(frame, 0, 9.01)).toBeNull();
  });

  it("orients robots by grid heading (model faces −Z = grid north)", () => {
    const forward = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
    expect(forward(HEADING_YAW.N).z).toBeCloseTo(-1); // north = −y = −z
    expect(forward(HEADING_YAW.S).z).toBeCloseTo(1);
    expect(forward(HEADING_YAW.E).x).toBeCloseTo(1);
    expect(forward(HEADING_YAW.W).x).toBeCloseTo(-1);
    expect(angleDelta(HEADING_YAW.E, HEADING_YAW.N)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(angleDelta(3, -3))).toBeLessThan(Math.PI);
  });
});

describe("tick interpolation", () => {
  it("matches the 2D renderer's progress rule", () => {
    const clock = { steppedAt: 1000, tickMs: 400, speed: 2, interpolate: true };
    expect(tickProgress(clock, 1000)).toBe(0);
    expect(tickProgress(clock, 1100)).toBeCloseTo(0.5);
    expect(tickProgress(clock, 5000)).toBe(1);
    expect(tickProgress({ ...clock, interpolate: false }, 1000)).toBe(1);
    expect(tickProgress({ ...clock, steppedAt: 0 }, 1000)).toBe(1);
  });

  it("eases between cells and ends exactly on the engine position", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(lerpGrid({ x: 2, y: 3 }, { x: 3, y: 3 }, 1)).toEqual({ x: 3, y: 3 });
    expect(lerpGrid({ x: 2, y: 3 }, { x: 3, y: 3 }, 0.5)).toEqual({ x: 2.5, y: 3 });
  });
});

describe("layout → 3D scene", () => {
  it.each(SCENARIOS.map((s) => s.id))("%s: one rack bay per rack cell, everything inside its own cell", (id) => {
    const { layout } = getCompiledScenario(id);
    const scene = buildRackScene(layout);
    const rackCells = layout.cells.filter((k) => k === "rack").length;
    expect(scene.rackCells).toBe(rackCells);
    expect(scene.decks).toHaveLength(rackCells * RACK.levels.length);
    expect(scene.beams).toHaveLength(rackCells * RACK.levels.length * 2);
    expect(scene.obstacles).toHaveLength(layout.cells.filter((k) => k === "obstacle").length);
    const f = { width: layout.width, height: layout.height };
    // Every bin and deck lies inside a rack cell; every obstacle inside an obstacle cell.
    for (const p of [...scene.bins, ...scene.decks]) {
      const cell = worldToGrid(f, p.x, p.z)!;
      expect(layout.cells[cell.y * layout.width + cell.x]).toBe("rack");
    }
    for (const p of scene.obstacles) {
      const cell = worldToGrid(f, p.x, p.z)!;
      expect(layout.cells[cell.y * layout.width + cell.x]).toBe("obstacle");
    }
  });

  it("puts bins on decks (no floating or sunken containers) and under the rack top", () => {
    const scene = buildRackScene(getCompiledScenario("standard").layout);
    const bottoms = new Set(RACK.levels.map((l) => +(l + RACK.deckThickness / 2).toFixed(4)));
    for (const bin of scene.bins) {
      expect(bottoms.has(+(bin.y - RACK.bin.height / 2).toFixed(4))).toBe(true);
      expect(bin.y + RACK.bin.height / 2).toBeLessThan(RACK.height);
    }
    // Shared uprights are not duplicated.
    const keys = scene.uprights.map((u) => `${u.x.toFixed(3)},${u.z.toFixed(3)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic", () => {
    const layout = getCompiledScenario("high-density").layout;
    expect(buildRackScene(layout)).toEqual(buildRackScene(layout));
  });

  it("never places a robot on a rack or obstacle cell (engine positions are open cells)", () => {
    for (const s of SCENARIOS) {
      const engine = createSimulationSource(s.id);
      for (let t = 0; t < 200; t += 1) {
        const snap = engine.step();
        for (const r of snap.robots) {
          expect(isOpenCell(snap.layout.cells[r.position.y * snap.layout.width + r.position.x]), `${s.id} ${r.id}`).toBe(true);
        }
      }
    }
  });
});

describe("3D label projection", () => {
  it("converts clip-space coordinates into CSS viewport pixels", () => {
    expect(ndcToViewport(0, 0, 0, 800, 600)).toEqual({ x: 400, y: 300, visible: true });
    expect(ndcToViewport(-1, 1, -0.5, 800, 600)).toEqual({ x: 0, y: 0, visible: true });
    expect(ndcToViewport(1, -1, 1, 800, 600)).toEqual({ x: 800, y: 600, visible: true });
  });

  it("culls coordinates behind the camera, NaN, or far outside viewport margins", () => {
    expect(ndcToViewport(0, 0, 1.01, 800, 600).visible).toBe(false);
    expect(ndcToViewport(0, 0, -1.01, 800, 600).visible).toBe(false);
    expect(ndcToViewport(Number.NaN, 0, 0, 800, 600).visible).toBe(false);
    expect(ndcToViewport(2, 0, 0, 800, 600, 20).visible).toBe(false);
    expect(ndcToViewport(0, 0, 0, 0, 600).visible).toBe(false);
  });

  it("derives robot badge state & tag labels consistently", () => {
    expect(robotLabelMeta({ status: "failed", waitClass: "none" }, true)).toEqual({ state: "failed", tag: "FAILED" });
    expect(robotLabelMeta({ status: "recovering", waitClass: "none" }, false)).toEqual({
      state: "",
      tag: "RESTORING",
    });
    expect(robotLabelMeta({ status: "waiting", waitClass: "deadlock" }, false)).toEqual({
      state: "deadlock",
      tag: "DEADLOCK",
    });
    expect(robotLabelMeta({ status: "waiting", waitClass: "congestion" }, true)).toEqual({
      state: "waiting",
      tag: "WAIT",
    });
    expect(robotLabelMeta({ status: "moving", waitClass: "none" }, true)).toEqual({ state: "selected", tag: "" });
    expect(robotLabelMeta({ status: "idle", waitClass: "none" }, false)).toEqual({ state: "", tag: "" });
  });

  it("maps station kinds to matching post/badge colours", () => {
    expect(stationColorForKind("pickup")).toBe("#40c8e8");
    expect(stationColorForKind("dropoff")).toBe("#b7f34a");
    expect(stationColorForKind("charger")).toBe("#c8d2d8");
  });
});
