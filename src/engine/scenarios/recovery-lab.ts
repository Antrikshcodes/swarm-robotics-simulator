import type { RobotSpec, ScenarioDefinition } from "../scenario";

/**
 * Deterministic recovery lab (Mission 005). One small warehouse: three
 * east–west aisles (top, middle, bottom) between rack blocks, a cross aisle
 * at x = 6, pick faces on the west wall and docks on the east wall.
 * Failures and closures are scheduled world commands, so every run (and
 * every seek) reproduces exactly.
 *
 *   x 0123456789012
 *     P...........D   PK-01 (0,0)            DO-01 (12,0)
 *     ..####.####..
 *     .............   middle aisle
 *     ..####.####..
 *     P...........D   PK-02 (0,4)            DO-02 (12,4)
 */
const MAP = ["P...........D", "..####.####..", ".............", "..####.####..", "P...........D"];
const HANDLING = { loadTicks: 2, unloadTicks: 2 } as const;

const robot = (n: number, home: { x: number; y: number }, heading: RobotSpec["heading"] = "W", start?: { x: number; y: number }): RobotSpec => ({
  id: `R-0${n}`,
  model: "AMR-200",
  colorIndex: n,
  heading,
  battery: 90,
  home,
  ...(start ? { start } : {}),
});

/** A — a robot fails on its way to the pick face; the mission is reassigned. */
export const recoveryNoPackage: ScenarioDefinition = {
  id: "rec-a-no-package",
  group: "recovery",
  name: "Recovery A · Failure without package",
  summary: "Fails before pickup · mission reassigned",
  focus:
    "R-01 is sent from the east side to PK-01 and suffers a motor failure on the way (tick 5). Nothing is on board, so its reservation is released and M-1001 is requeued; the nearest free robot takes it over and delivers it exactly once. R-01 stays halted and other robots route around it.",
  seed: 5001,
  map: MAP,
  robots: [robot(1, { x: 11, y: 1 }), robot(2, { x: 12, y: 2 }), robot(3, { x: 11, y: 2 })],
  missions: [{ pickup: "PK-01", dropoff: "DO-02" }],
  schedule: [{ tick: 5, command: { type: "fail_robot", robotId: "R-01", failureType: "motor", reason: "Drive motor over-current (injected)" } }],
  handling: HANDLING,
};

/** B — a robot fails while carrying; a rescuer takes the package over and delivers it. */
export const recoveryCarrying: ScenarioDefinition = {
  id: "rec-b-carrying",
  group: "recovery",
  name: "Recovery B · Failure while carrying",
  summary: "Package stranded · rescuer handover · delivered once",
  focus:
    "R-01 picks up PKG-0001 at PK-01 and loses navigation in the top aisle (tick 9). The package becomes recovery-required and stays in R-01's custody. The nearest free robot drives to a cell beside R-01, takes custody in one atomic handover and completes the delivery to DO-01.",
  seed: 5002,
  map: MAP,
  robots: [robot(1, { x: 1, y: 1 }, "N"), robot(2, { x: 11, y: 2 }), robot(3, { x: 12, y: 2 })],
  missions: [{ pickup: "PK-01", dropoff: "DO-01" }],
  schedule: [{ tick: 9, command: { type: "fail_robot", robotId: "R-01", failureType: "navigation", reason: "Localisation lost (injected)" } }],
  handling: HANDLING,
};

/** C — an aisle used by several robots closes; they replan without a reset. */
export const recoveryAisleClosure: ScenarioDefinition = {
  id: "rec-c-aisle-closure",
  group: "recovery",
  name: "Recovery C · Aisle closure",
  summary: "Aisles closed mid-route · robots replan",
  focus:
    "Four robots run deliveries across the warehouse. At tick 6 a pallet spill blocks column x 4 of the top and middle aisles while two robots are routed westbound through them. Their routes are invalidated, reservations released and new routes planned through the bottom aisle — positions, missions and custody unchanged.",
  seed: 5003,
  map: MAP,
  robots: [robot(1, { x: 1, y: 2 }, "E"), robot(2, { x: 0, y: 2 }, "E"), robot(3, { x: 11, y: 2 }), robot(4, { x: 12, y: 2 })],
  missions: [
    { pickup: "PK-01", dropoff: "DO-02" },
    { pickup: "PK-02", dropoff: "DO-01" },
    { pickup: "PK-01", dropoff: "DO-01" },
    { pickup: "PK-02", dropoff: "DO-02" },
  ],
  schedule: [
    {
      tick: 6,
      command: {
        type: "close_aisle",
        cells: [
          { x: 4, y: 0 },
          { x: 4, y: 2 },
        ],
        label: "Pallet spill across the top and middle aisles",
      },
    },
  ],
  handling: HANDLING,
};

/** D — the cell under a parked robot closes; it stays put, nobody else may enter. */
export const recoveryOccupiedClosure: ScenarioDefinition = {
  id: "rec-d-occupied-closure",
  group: "recovery",
  name: "Recovery D · Occupied cell closure",
  summary: "Closed under a robot · held in place",
  focus:
    "R-02 is parked on the cross aisle (6,2) when that cell is closed at tick 3. It is not moved or removed: it keeps its position, may leave when it gets work (tick 12), and from then on no robot plans into the closed cell. The cell reopens at tick 70 so R-02 can return home.",
  seed: 5004,
  map: MAP,
  robots: [robot(1, { x: 1, y: 1 }, "N"), robot(2, { x: 6, y: 2 }, "S"), robot(3, { x: 1, y: 3 }, "S")],
  missions: [
    { pickup: "PK-01", dropoff: "DO-01" },
    { pickup: "PK-02", dropoff: "DO-02" },
  ],
  schedule: [
    { tick: 3, command: { type: "close_aisle", cells: [{ x: 6, y: 2 }], label: "Floor damage under R-02" } },
    { tick: 12, command: { type: "add-mission", pickupStationId: "PK-02", dropoffStationId: "DO-01" } },
    { tick: 70, command: { type: "reopen_aisle", closureId: "CL-01" } },
  ],
  handling: HANDLING,
};

/** E — the only access to a dock closes, then reopens; routes are restored. */
export const recoveryReopen: ScenarioDefinition = {
  id: "rec-e-reopen",
  group: "recovery",
  name: "Recovery E · Aisle reopening",
  summary: "Dock cut off, then reopened · normal planning resumes",
  focus:
    "At tick 7 the two cells in front of DO-02 close while R-01 is carrying a package there. Its route is invalidated and no new route exists: it holds safely in the aisle and reports it. At tick 32 the cells reopen; topology is restored, R-01 replans and delivers.",
  seed: 5005,
  map: MAP,
  robots: [robot(1, { x: 1, y: 3 }, "S"), robot(2, { x: 11, y: 2 })],
  missions: [{ pickup: "PK-02", dropoff: "DO-02" }],
  schedule: [
    {
      tick: 7,
      command: {
        type: "close_aisle",
        cells: [
          { x: 11, y: 4 },
          { x: 12, y: 3 },
        ],
        label: "Dock DO-02 access blocked",
      },
    },
    { tick: 32, command: { type: "reopen_aisle", closureId: "CL-01" } },
  ],
  handling: HANDLING,
};

/** F — the robot sent to recover the package fails too; another one takes over. */
export const recoveryRescuerFailure: ScenarioDefinition = {
  id: "rec-f-rescuer-failure",
  group: "recovery",
  name: "Recovery F · Recovery robot failure",
  summary: "Rescuer fails en route · next candidate selected",
  focus:
    "As in B, R-01 fails carrying PKG-0001 (tick 9) and R-02 is dispatched. R-02 hits an emergency stop on its way (tick 12) before any handover, so custody never moved. The recovery manager ends that attempt and sends R-03; the package is delivered exactly once with a single owner throughout.",
  seed: 5006,
  map: MAP,
  robots: [robot(1, { x: 1, y: 1 }, "N"), robot(2, { x: 11, y: 2 }), robot(3, { x: 12, y: 2 })],
  missions: [{ pickup: "PK-01", dropoff: "DO-01" }],
  schedule: [
    { tick: 9, command: { type: "fail_robot", robotId: "R-01", failureType: "navigation", reason: "Localisation lost (injected)" } },
    { tick: 12, command: { type: "fail_robot", robotId: "R-02", failureType: "emergency-stop", reason: "Bumper pressed (injected)" } },
  ],
  handling: HANDLING,
};

export const RECOVERY_LAB: readonly ScenarioDefinition[] = [
  recoveryNoPackage,
  recoveryCarrying,
  recoveryAisleClosure,
  recoveryOccupiedClosure,
  recoveryReopen,
  recoveryRescuerFailure,
];
