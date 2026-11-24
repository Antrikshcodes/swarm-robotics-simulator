import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO_ID } from "@/engine";
import type { EntitySelection } from "@/types/simulation";
import { selectionForCell } from "@/lib/inspection";
import { hitTest, type RenderView } from "@/lib/render/warehouse-renderer";
import { cameraActions, useCamera3D } from "@/components/simulation/scene3d/camera-store";
import { useSimulationStore } from "./simulation-store";

const view = (snapshotWidth: number, snapshotHeight: number): RenderView => ({ width: snapshotWidth * 20, height: snapshotHeight * 20, cell: 20, offsetX: 0, offsetY: 0 });

describe("selection state", () => {
  beforeEach(() => {
    const store = useSimulationStore.getState();
    store.pause();
    store.loadScenario(DEFAULT_SCENARIO_ID);
    store.reset();
    store.select(null);
  });

  it("selects every entity kind without touching the authoritative snapshot", () => {
    const store = useSimulationStore.getState();
    store.step();
    store.step();
    const before = useSimulationStore.getState();
    const snapshot = before.snapshot;
    const { layout } = snapshot;
    const rackIndex = layout.cells.indexOf("rack");
    const laneIndex = layout.cells.findIndex((k) => k === "lane" || k === "floor");
    const selections: EntitySelection[] = [
      { kind: "robot", id: snapshot.robots[0].id },
      { kind: "station", id: layout.stations[0].id },
      { kind: "rack", x: rackIndex % layout.width, y: Math.floor(rackIndex / layout.width) },
      { kind: "cell", x: laneIndex % layout.width, y: Math.floor(laneIndex / layout.width) },
      { kind: "obstacle", x: 0, y: 0 },
    ];
    for (const sel of selections) {
      store.select(sel);
      const after = useSimulationStore.getState();
      expect(after.selection).toEqual(sel);
      // Same snapshot object, tick, playback state and timeline extent: inspection is read-only.
      expect(after.snapshot).toBe(snapshot);
      expect(after.snapshot.tick).toBe(2);
      expect(after.status).toBe(before.status);
      expect(after.maxTick).toBe(before.maxTick);
    }
    // Stepping after inspecting produces the same next tick as without inspecting.
    store.step();
    expect(useSimulationStore.getState().snapshot.tick).toBe(3);
  });

  it("clears on null (Esc / empty click) and on scenario switch", () => {
    const store = useSimulationStore.getState();
    store.select({ kind: "cell", x: 1, y: 1 });
    store.select(null);
    expect(useSimulationStore.getState().selection).toBeNull();
    store.select({ kind: "station", id: useSimulationStore.getState().snapshot.layout.stations[0].id });
    store.loadScenario("high-density");
    expect(useSimulationStore.getState().selection).toBeNull();
  });

  it("rejects unknown robots and keeps the previous selection", () => {
    const store = useSimulationStore.getState();
    store.select({ kind: "cell", x: 2, y: 2 });
    store.select({ kind: "robot", id: "R-404" });
    expect(useSimulationStore.getState().selection).toEqual({ kind: "cell", x: 2, y: 2 });
  });
});

describe("selection synchronisation between views", () => {
  it("2D hit-testing and 3D picking resolve a cell to the same selection", () => {
    const { snapshot } = useSimulationStore.getState();
    const { layout } = snapshot;
    const v = view(layout.width, layout.height);
    const occupied = new Set(snapshot.robots.map((r) => `${r.position.x},${r.position.y}`));
    for (let y = 0; y < layout.height; y += 1) {
      for (let x = 0; x < layout.width; x += 1) {
        if (occupied.has(`${x},${y}`)) continue; // robots win the 2D hit test, as they do in 3D
        expect(hitTest(snapshot, v, x * 20 + 10, y * 20 + 10, 1)).toEqual(selectionForCell(layout, { x, y }));
      }
    }
  });
});

describe("camera inspector actions", () => {
  it("focus, follow and return to overview only change the camera request", () => {
    const sim = useSimulationStore.getState();
    const snapshot = sim.snapshot;
    const nonce = useCamera3D.getState().nonce;
    cameraActions.focusRobot("R-01");
    expect(useCamera3D.getState()).toMatchObject({ preset: "focus", robotId: "R-01", nonce: nonce + 1 });
    cameraActions.followRobot("R-02");
    expect(useCamera3D.getState()).toMatchObject({ preset: "follow", robotId: "R-02" });
    cameraActions.focusRegion({ x0: 1, y0: 1, x1: 4, y1: 2 });
    expect(useCamera3D.getState()).toMatchObject({ preset: "focus", robotId: null, region: { x0: 1, y0: 1, x1: 4, y1: 2 } });
    cameraActions.returnToOverview();
    expect(useCamera3D.getState()).toMatchObject({ preset: "overview", robotId: null, region: null, nonce: nonce + 4 });
    expect(useSimulationStore.getState().snapshot).toBe(snapshot);
  });
});
