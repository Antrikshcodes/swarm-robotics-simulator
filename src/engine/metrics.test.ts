import { describe, expect, it } from "vitest";
import type { Mission, RobotState } from "../types/simulation";
import { BLOCKED_ALERT_TICKS, computeMetrics, LOW_BATTERY_THRESHOLD } from "./metrics";

function robot(id: string, overrides: Partial<RobotState> = {}): RobotState {
  return {
    id,
    model: "SWARM-M1",
    colorIndex: 1,
    position: { x: 1, y: 1 },
    previousPosition: { x: 1, y: 1 },
    heading: "N",
    status: "idle",
    action: "none",
    battery: 80,
    home: { x: 1, y: 1 },
    missionId: null,
    packageId: null,
    destinationStationId: null,
    destination: null,
    route: [],
    blockedTicks: 0,
    priority: 1,
    coordination: "holding",
    planStatus: null,
    plan: [],
    waitingFor: null,
    waitClass: "none",
    deadlockId: null,
    activityNote: null,
    failure: null,
    recoveryRole: null,
    routeEvent: null,
    stats: { movingTicks: 0, waitingTicks: 0, busyTicks: 0, distance: 0, deliveries: 0, replans: 0 },
    ...overrides,
  };
}

function mission(id: string, state: Mission["state"], robotId: string | null = null): Mission {
  return {
    id,
    priority: "normal",
    packageId: `PKG-${id}`,
    robotId,
    pickupStationId: "PK-01",
    dropoffStationId: "DP-01",
    state,
    createdTick: 0,
    assignedTick: robotId ? 1 : null,
    pickedTick: null,
    completedTick: null,
    history: [],
  };
}

describe("computeMetrics", () => {
  it("handles tick 0 and empty fleets safely without NaN", () => {
    expect(computeMetrics(0, [], [], 0)).toEqual({
      totalRobots: 0,
      activeRobots: 0,
      idleRobots: 0,
      faultedRobots: 0,
      waitingRobots: 0,
      activeMissions: 0,
      queuedMissions: 0,
      waitingMissions: 0,
      completedDeliveries: 0,
      openIncidents: 0,
      utilisation: 0,
    });
  });

  it("derives fleet activity, mission queues, utilisation, and deduplicated open incidents", () => {
    const robots = [
      robot("R-01", {
        status: "moving",
        stats: { movingTicks: 8, waitingTicks: 0, busyTicks: 8, distance: 5, deliveries: 0, replans: 0 },
      }),
      robot("R-02", {
        status: "waiting",
        waitClass: "congestion",
        blockedTicks: BLOCKED_ALERT_TICKS,
        deadlockId: null,
        stats: { movingTicks: 3, waitingTicks: 3, busyTicks: 6, distance: 2, deliveries: 0, replans: 0 },
      }),
      // Deadlocked robot is already covered by openDeadlocks count, not double-counted as blocked alert
      robot("R-03", {
        status: "waiting",
        waitClass: "deadlock",
        blockedTicks: BLOCKED_ALERT_TICKS + 2,
        deadlockId: "DL-0001",
        stats: { movingTicks: 2, waitingTicks: 5, busyTicks: 4, distance: 2, deliveries: 0, replans: 0 },
      }),
      robot("R-04", { status: "idle", battery: LOW_BATTERY_THRESHOLD - 1 }),
      robot("R-05", { status: "failed", battery: LOW_BATTERY_THRESHOLD - 5 }), // failed excludes low-battery double count
      robot("R-06", { status: "recovering", battery: 5 }), // recovering excludes low-battery double count
    ];
    const missions = [
      mission("M-01", "to-pickup", "R-01"),
      mission("M-02", "carrying", "R-02"),
      mission("M-03", "queued", null),
      mission("M-04", "completed", "R-04"),
    ];

    const metrics = computeMetrics(10, robots, missions, 4, 2, 1);

    expect(metrics.totalRobots).toBe(6);
    expect(metrics.activeRobots).toBe(3); // R-01 moving, R-02 waiting, R-03 waiting
    expect(metrics.idleRobots).toBe(1); // R-04
    expect(metrics.faultedRobots).toBe(2); // R-05 + R-06
    expect(metrics.waitingRobots).toBe(2); // R-02 + R-03
    expect(metrics.activeMissions).toBe(2); // M-01 + M-02
    expect(metrics.queuedMissions).toBe(1); // M-03
    expect(metrics.waitingMissions).toBe(1); // M-02 on waiting R-02
    expect(metrics.completedDeliveries).toBe(4);
    // openIncidents = 2 failed + 1 blocked non-deadlock + 1 lowBattery + 2 activeClosures + 1 openDeadlocks
    expect(metrics.openIncidents).toBe(7);
    expect(metrics.utilisation).toBeCloseTo(18 / 60);
  });
});
