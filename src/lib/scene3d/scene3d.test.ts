import { describe, expect, it } from "vitest";
import { createSimulationSource, getCompiledScenario, SCENARIOS } from "../../engine";
import * as THREE from "three";
import { CAMERA_FOV, easeInOutCubic, interpolatePose, presetPose, regionPose, SCENE_HEIGHT } from "./camera-fit";
import { angleDelta, CELL, gridToWorld, HEADING_YAW, worldExtent, worldToGrid } from "./grid-to-world";
import { easeInOut, lerpGrid, tickProgress } from "./interpolation";
import { buildRackScene, isOpenCell, RACK } from "./layout-to-scene";

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

describe("camera framing", () => {
  const project = (pose: { position: THREE.Vector3; target: THREE.Vector3 }, aspect: number, p: THREE.Vector3) => {
    const cam = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 1000);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld();
    return p.clone().project(cam);
  };

  it.each([
    [26, 16, 1.6],
    [40, 27, 1.6],
    [40, 27, 0.8],
    [12, 8, 2.4],
    [60, 18, 1.2],
  ])("fits a %i × %i warehouse at aspect %f in every fixed preset", (width, height, aspect) => {
    const frame = { width, height };
    const { halfX, halfZ } = worldExtent(frame);
    for (const preset of ["isometric", "overview", "top"] as const) {
      const pose = presetPose(preset, frame, aspect);
      const h = preset === "top" ? 0 : SCENE_HEIGHT;
      for (const x of [-halfX, halfX]) for (const y of [0, h]) for (const z of [-halfZ, halfZ]) {
        const ndc = project(pose, aspect, new THREE.Vector3(x, y, z));
        expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1.0001);
        expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1.0001);
        expect(ndc.z).toBeLessThan(1);
      }
    }
  });

  it("frames a region from the current direction, never closer than the minimum", () => {
    const pose = regionPose({ width: 26, height: 16 }, { x0: 2, y0: 1, x1: 11, y1: 1 }, new THREE.Vector3(0.5, 0.7, 0.6), 1.6);
    expect(pose.position.distanceTo(pose.target)).toBeGreaterThanOrEqual(4.5);
    const tiny = regionPose({ width: 26, height: 16 }, { x0: 5, y0: 5, x1: 5, y1: 5 }, new THREE.Vector3(1, 0.05, 0), 1.6);
    const d = tiny.position.distanceTo(tiny.target);
    expect(d).toBeGreaterThanOrEqual(4.5);
    expect(d).toBeLessThan(15);
    // Elevation is clamped so the camera never skims the floor.
    expect(tiny.position.y - tiny.target.y).toBeGreaterThan(2);
  });

  it("transitions arc around the target and land exactly on the goal", () => {
    const from = presetPose("isometric", { width: 26, height: 16 });
    const to = presetPose("top", { width: 26, height: 16 });
    const out = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    interpolatePose(from, to, 0, out);
    expect(out.position.distanceTo(from.position)).toBeLessThan(1e-6);
    interpolatePose(from, to, 1, out);
    expect(out.position.distanceTo(to.position)).toBeLessThan(1e-4);
    // Midway the camera stays well above the floor (no straight cut through racking).
    interpolatePose(from, to, 0.5, out);
    expect(out.position.y).toBeGreaterThan(SCENE_HEIGHT * 2);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});
