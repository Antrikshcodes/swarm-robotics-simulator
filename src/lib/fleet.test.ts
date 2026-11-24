import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import { batteryLevel, connectivity, FLEET_FILTERS, fleetSummary, lastActivity, missionSummary, needsAttention, operatingMode, robotEvents } from "./fleet";

describe("fleet derivations", () => {
  it("summarises live fleet state and every robot lands in exactly the right filters", () => {
    const engine = createSimulationSource("high-density");
    for (let i = 0; i < 60; i += 1) engine.step();
    const snap = engine.getSnapshot();
    const s = fleetSummary(snap.robots);
    expect(s.total).toBe(snap.robots.length);
    expect(s.active + s.idle).toBeLessThanOrEqual(s.total);
    // R-07 fails at tick 40 in this scenario.
    const r07 = snap.robots.find((r) => r.id === "R-07")!;
    expect(FLEET_FILTERS.failed(r07)).toBe(true);
    expect(needsAttention(r07)).toBe(true);
    expect(operatingMode(r07)).toMatchObject({ label: "Halted", tone: "red" });
    for (const r of snap.robots) {
      expect(FLEET_FILTERS.all(r)).toBe(true);
      if (FLEET_FILTERS.blocked(r)) expect(FLEET_FILTERS.waiting(r)).toBe(true);
      expect(Number(FLEET_FILTERS.active(r)) + Number(FLEET_FILTERS.idle(r)) + Number(FLEET_FILTERS.waiting(r)) + Number(FLEET_FILTERS.failed(r))).toBe(1);
    }
  });

  it("reports link loss only for robots halted by a communication failure", () => {
    const engine = createSimulationSource("rec-a-no-package");
    engine.dispatch({ type: "fail_robot", robotId: "R-02", failureType: "communication" });
    engine.dispatch({ type: "fail_robot", robotId: "R-03", failureType: "motor" });
    const snap = engine.getSnapshot();
    const byId = (id: string) => snap.robots.find((r) => r.id === id)!;
    expect(connectivity(byId("R-02"))).toMatchObject({ label: "Link lost", online: false });
    expect(connectivity(byId("R-03"))).toMatchObject({ label: "Online", online: true });
    expect(connectivity(byId("R-01")).online).toBe(true);
  });

  it("describes missions, rescues and recent activity from engine data", () => {
    const engine = createSimulationSource("rec-b-carrying");
    for (let i = 0; i < 11; i += 1) engine.step(); // R-01 failed carrying at 9, R-02 rescuing
    const snap = engine.getSnapshot();
    const r01 = snap.robots.find((r) => r.id === "R-01")!;
    const r02 = snap.robots.find((r) => r.id === "R-02")!;
    expect(missionSummary(r01, snap)).toMatchObject({ id: "M-1001", route: "PK-01 → DO-01", state: "recovery-required" });
    expect(missionSummary(r02, snap)).toMatchObject({ id: "RC-01", route: "Recover PKG-0001 from R-01" });
    expect(operatingMode(r02).label).toBe("Recovery task");
    const events = robotEvents(snap.events, "R-01");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.robotId === "R-01" || e.robotIds?.includes("R-01"))).toBe(true);
    expect(events[0].tick).toBeGreaterThanOrEqual(events.at(-1)!.tick);
    expect(lastActivity(r01, snap.events).text).toMatch(/Navigation failure/);
  });

  it("grades battery levels", () => {
    expect(batteryLevel(90)).toBe("ok");
    expect(batteryLevel(30)).toBe("low");
    expect(batteryLevel(12)).toBe("critical");
  });
});
