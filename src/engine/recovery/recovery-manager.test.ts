import { describe, expect, it } from "vitest";
import { RecoveryManager, type RecoveryPort, type RescueCandidate } from "./recovery-manager";

/** 1-D strip: cell = x; the failed robot stands on cell 10, approach cells are 9 and 11. */
function port(tick: number, candidates: RescueCandidate[], extra: Partial<RecoveryPort> = {}): RecoveryPort {
  return {
    tick,
    worldVersion: 0,
    eligible: () => candidates,
    approach: (_failed, from) => {
      const cell = from < 10 ? 9 : 11;
      return { cell, distance: Math.abs(from - cell) };
    },
    reachable: () => true,
    holderOnDestination: () => false,
    ...extra,
  };
}

const open = (m: RecoveryManager) => m.openTask("PKG-0001", "M-1001", "R-01", 1);

describe("recovery manager", () => {
  it("records failures with type, position, mission and package, and tracks restoration", () => {
    const m = new RecoveryManager();
    const f = m.recordFailure({ robotId: "R-01", type: "battery", reason: "Cell fault", tick: 4, position: { x: 2, y: 3 }, missionId: "M-1001", packageId: "PKG-0001" });
    expect(f).toMatchObject({ id: "F-01", robotId: "R-01", type: "battery", status: "active", tick: 4, missionId: "M-1001", packageId: "PKG-0001" });
    m.beginRestore("R-01", 6);
    expect(m.failureOf("R-01")?.status).toBe("restoring");
    m.finishRestore("R-01", 14);
    expect(m.failureOf("R-01")).toMatchObject({ status: "restored", restoreStartedTick: 6, restoredTick: 14 });
    expect(m.failureOf("R-02")).toBeNull();
  });

  it("selects the nearest eligible robot, ties broken by rank, deterministically", () => {
    const pick = (cands: RescueCandidate[]) => {
      const m = new RecoveryManager();
      open(m);
      return m.update(port(2, cands)).dispatch[0]?.rescuerId;
    };
    expect(pick([{ id: "R-02", rank: 1, cell: 2 }, { id: "R-03", rank: 2, cell: 14 }])).toBe("R-03"); // 3 vs 7 cells
    expect(pick([{ id: "R-03", rank: 2, cell: 13 }, { id: "R-02", rank: 1, cell: 7 }])).toBe("R-02"); // tie (2) → rank
    expect(pick([{ id: "R-02", rank: 1, cell: 7 }, { id: "R-03", rank: 2, cell: 13 }])).toBe("R-02");
  });

  it("dispatches with an event carrying task, package, mission, robots, cell and attempt", () => {
    const m = new RecoveryManager();
    open(m);
    const u = m.update(port(2, [{ id: "R-02", rank: 1, cell: 14 }]));
    expect(u.dispatch).toEqual([{ taskId: "RC-01", packageId: "PKG-0001", rescuerId: "R-02", approachCell: 11 }]);
    expect(u.events[0]).toMatchObject({
      kind: "package_recovery_started",
      robotIds: ["R-01", "R-02"],
      taskId: "RC-01",
      packageId: "PKG-0001",
      missionId: "M-1001",
      attempt: 1,
      cell: 11,
      status: "en-route",
    });
    expect(m.roleOf("R-02")).toEqual({ taskId: "RC-01", role: "rescuer" });
    expect(m.roleOf("R-01")).toEqual({ taskId: "RC-01", role: "holder" });
  });

  it("never sends the same robot to two tasks", () => {
    const m = new RecoveryManager();
    m.openTask("PKG-0001", "M-1001", "R-01", 1);
    m.openTask("PKG-0002", "M-1002", "R-05", 1);
    const u = m.update(port(2, [{ id: "R-02", rank: 1, cell: 14 }]));
    expect(u.dispatch.map((d) => d.rescuerId)).toEqual(["R-02"]);
    expect(m.snapshot((c) => ({ x: c, y: 0 })).tasks[1].note).toMatch(/Waiting for a free robot/);
  });

  it("times out a rescuer, excludes it, tries the next one, then fails after the budget", () => {
    const m = new RecoveryManager({ timeoutTicks: 5, maxAttempts: 2 });
    open(m);
    const cands = [{ id: "R-02", rank: 1, cell: 14 }, { id: "R-03", rank: 2, cell: 16 }, { id: "R-04", rank: 3, cell: 18 }];
    expect(m.update(port(2, cands)).dispatch[0].rescuerId).toBe("R-02");
    const u1 = m.update(port(7, cands));
    expect(u1.release).toEqual([{ rescuerId: "R-02", taskId: "RC-01", packageId: "PKG-0001" }]);
    expect(u1.dispatch[0].rescuerId).toBe("R-03");
    const u2 = m.update(port(12, cands));
    expect(u2.release.map((r) => r.rescuerId)).toEqual(["R-03"]);
    expect(u2.dispatch).toEqual([]);
    expect(u2.events.map((e) => e.kind)).toEqual(["recovery_failed"]);
    const task = m.snapshot((c) => ({ x: c, y: 0 })).tasks[0];
    expect(task.status).toBe("failed");
    expect(task.attempts.map((a) => a.outcome)).toEqual(["timeout", "timeout"]);
    // No retry until the world changes, then a fresh budget.
    expect(m.update(port(20, cands)).dispatch).toEqual([]);
    expect(m.update(port(21, cands, { worldVersion: 1 })).dispatch[0].rescuerId).toBe("R-02");
  });

  it("re-selects when the rescuer fails before the handover", () => {
    const m = new RecoveryManager();
    open(m);
    m.update(port(2, [{ id: "R-02", rank: 1, cell: 14 }, { id: "R-03", rank: 2, cell: 16 }]));
    expect(m.onRescuerFailed("R-02", 4)?.status).toBe("pending");
    const u = m.update(port(5, [{ id: "R-03", rank: 2, cell: 16 }]));
    expect(u.dispatch[0].rescuerId).toBe("R-03");
    expect(m.snapshot((c) => ({ x: c, y: 0 })).tasks[0].attempts.map((a) => a.outcome)).toEqual(["rescuer-failed", "in-progress"]);
  });

  it("fails safely when no robot can reach the failed robot or the holder sits on its destination dock", () => {
    const unreachable = new RecoveryManager();
    open(unreachable);
    const u = unreachable.update(port(2, [], { reachable: () => false }));
    expect(u.events[0]).toMatchObject({ kind: "recovery_failed", status: "failed" });
    const docked = new RecoveryManager();
    open(docked);
    expect(docked.update(port(2, [{ id: "R-02", rank: 1, cell: 14 }], { holderOnDestination: () => true })).events[0].reason).toMatch(/destination dock/);
  });

  it("supports operator start with a chosen rescuer, cancellation and holder restoration", () => {
    const m = new RecoveryManager({ autoStart: false });
    open(m);
    const cands = [{ id: "R-02", rank: 1, cell: 12 }, { id: "R-03", rank: 2, cell: 30 }];
    expect(m.update(port(2, cands)).dispatch).toEqual([]); // waits for the operator
    m.start("PKG-0001", "R-03");
    expect(m.update(port(3, cands)).dispatch[0].rescuerId).toBe("R-03");
    expect(m.start("PKG-0001", null)).toBeNull(); // already under way
    const cancelled = m.cancel("PKG-0001", 4);
    expect(cancelled?.releasedRescuer).toBe("R-03");
    expect(m.update(port(5, cands)).dispatch).toEqual([]); // not auto-restarted
    m.start("PKG-0001", null);
    expect(m.update(port(6, cands)).dispatch[0].rescuerId).toBe("R-02");
    const restored = m.onHolderRestored("PKG-0001", 7);
    expect(restored?.releasedRescuer).toBe("R-02");
    expect(m.snapshot((c) => ({ x: c, y: 0 })).tasks[0]).toMatchObject({ status: "completed" });
  });

  it("completes a task on handover", () => {
    const m = new RecoveryManager();
    open(m);
    m.update(port(2, [{ id: "R-02", rank: 1, cell: 14 }]));
    m.onArrived("RC-01");
    expect(m.openTaskFor("PKG-0001")?.status).toBe("handover");
    m.onHandedOver("RC-01", 6);
    const snap = m.snapshot((c) => ({ x: c, y: 0 }));
    expect(snap.tasks[0]).toMatchObject({ status: "completed", completedTick: 6 });
    expect(snap.tasks[0].attempts[0].outcome).toBe("handed-over");
    expect(snap.stats.handovers).toBe(1);
    expect(m.openTaskFor("PKG-0001")).toBeNull();
  });
});
