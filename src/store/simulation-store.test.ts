import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO_ID } from "@/engine";
import { useSimulationStore } from "./simulation-store";

describe("useSimulationStore", () => {
  beforeEach(() => {
    const store = useSimulationStore.getState();
    store.pause();
    store.loadScenario(DEFAULT_SCENARIO_ID);
    store.reset();
    store.clearRunArchive();
  });

  it("steps, seeks, and tracks maxTick and playback status", () => {
    const store = useSimulationStore.getState();
    expect(store.status).toBe("ready");
    expect(store.snapshot.tick).toBe(0);

    store.step();
    store.step();
    expect(useSimulationStore.getState().snapshot.tick).toBe(2);
    expect(useSimulationStore.getState().maxTick).toBe(2);
    expect(useSimulationStore.getState().status).toBe("paused");

    store.seek(1);
    expect(useSimulationStore.getState().snapshot.tick).toBe(1);
    expect(useSimulationStore.getState().maxTick).toBe(2);
  });

  it("archives runs automatically on reset and scenario-switch after tick > 0", () => {
    const store = useSimulationStore.getState();
    for (let i = 0; i < 15; i += 1) store.step();

    store.loadScenario("narrow-aisle");
    let state = useSimulationStore.getState();
    expect(state.scenarioId).toBe("narrow-aisle");
    expect(state.snapshot.tick).toBe(0);
    expect(state.runArchive).toHaveLength(1);
    expect(state.runArchive[0].scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(state.runArchive[0].ticks).toBe(15);
    expect(state.runArchive[0].reason).toBe("scenario-switch");

    for (let i = 0; i < 10; i += 1) state.step();
    state.reset();
    state = useSimulationStore.getState();
    expect(state.runArchive).toHaveLength(2);
    expect(state.runArchive[0].scenarioId).toBe("narrow-aisle");
    expect(state.runArchive[0].ticks).toBe(10);
    expect(state.runArchive[0].reason).toBe("reset");

    state.clearRunArchive();
    expect(useSimulationStore.getState().runArchive).toHaveLength(0);
  });

  it("validates robot selection and records command feedback", () => {
    const store = useSimulationStore.getState();
    store.select({ kind: "robot", id: "R-01" });
    expect(useSimulationStore.getState().selection).toEqual({ kind: "robot", id: "R-01" });

    store.select({ kind: "robot", id: "NO-SUCH-ROBOT" });
    expect(useSimulationStore.getState().feedback?.ok).toBe(false);

    const res = store.dispatch({
      type: "add-mission",
      pickupStationId: "PK-01",
      dropoffStationId: "DO-02",
      priority: "urgent",
    });
    expect(res.ok).toBe(true);
    expect(useSimulationStore.getState().feedback?.ok).toBe(true);
  });
});
