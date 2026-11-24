import { describe, expect, it } from "vitest";
import type { Mission, MissionState } from "../../types/simulation";
import { canTransitionRobot, validateRobotTransition } from "../robots/robot-lifecycle";
import { createMission, isTerminalMission, transitionMission } from "./mission-lifecycle";

const base = () => createMission({ id: "M-1001", packageId: "PKG-0001", pickupStationId: "PK-01", dropoffStationId: "DO-01", tick: 0 });

function walk(states: MissionState[]): Mission {
  let m = base();
  states.forEach((s, i) => {
    const r = transitionMission(m, s, i + 1);
    if (!r.ok) throw new Error(r.error.message);
    m = r.value;
  });
  return m;
}

describe("mission lifecycle", () => {
  it("accepts the full happy path and records history", () => {
    const m = walk(["assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "dropping-off", "completed"]);
    expect(m.state).toBe("completed");
    expect(m.history.map((h) => h.to)).toEqual([
      "queued", "assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "dropping-off", "completed",
    ]);
  });

  it("cannot complete without passing through drop-off", () => {
    expect(transitionMission(walk(["assigned", "to-pickup"]), "completed", 9)).toMatchObject({
      ok: false,
      error: { code: "invalid-mission-transition" },
    });
    expect(transitionMission(walk(["assigned", "to-pickup", "picking-up", "carrying", "to-dropoff"]), "completed", 9).ok).toBe(false);
  });

  it("allows cancellation only before pickup", () => {
    expect(transitionMission(base(), "cancelled", 1).ok).toBe(true);
    expect(transitionMission(walk(["assigned", "to-pickup"]), "cancelled", 3).ok).toBe(true);
    expect(transitionMission(walk(["assigned", "to-pickup", "picking-up"]), "cancelled", 4).ok).toBe(false);
  });

  it("treats completed and cancelled as terminal; recovery-required is not", () => {
    for (const terminal of ["completed", "cancelled"] as const) {
      expect(isTerminalMission(terminal)).toBe(true);
    }
    expect(isTerminalMission("recovery-required")).toBe(false);
    const done = walk(["assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "dropping-off", "completed"]);
    expect(transitionMission(done, "assigned", 20).ok).toBe(false);
  });

  it("moves to recovery-required from any active state", () => {
    expect(transitionMission(walk(["assigned", "to-pickup", "picking-up", "carrying"]), "recovery-required", 5).ok).toBe(true);
    expect(transitionMission(base(), "recovery-required", 1).ok).toBe(false);
  });

  it("returns from recovery-required only to carrying (handover or restore), never to completed", () => {
    const stranded = walk(["assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "recovery-required"]);
    expect(transitionMission(stranded, "carrying", 9, { robotId: "R-09" }).ok).toBe(true);
    expect(transitionMission(stranded, "completed", 9).ok).toBe(false);
    expect(transitionMission(stranded, "queued", 9).ok).toBe(false);
  });

  it("requeues a mission whose robot failed while loading", () => {
    expect(transitionMission(walk(["assigned", "to-pickup", "picking-up"]), "queued", 5).ok).toBe(true);
  });
});

describe("robot status transitions", () => {
  it("only leaves failed through recovering", () => {
    expect(canTransitionRobot("moving", "failed")).toBe(true);
    expect(canTransitionRobot("failed", "moving")).toBe(false);
    expect(canTransitionRobot("failed", "idle")).toBe(false);
    expect(canTransitionRobot("failed", "recovering")).toBe(true);
    expect(canTransitionRobot("recovering", "idle")).toBe(true);
    expect(validateRobotTransition("R-01", "failed", "carrying")).toMatchObject({
      ok: false,
      error: { code: "invalid-robot-transition" },
    });
  });
});
