import type { MissionSpec, ScenarioDefinition } from "../scenario";

// 26 × 16. Single-depth racks with an aisle on every other row.
const RACK = ".-##########--##########-.";
const LANE = ".------------------------.";
const DOCK = "P------------------------D";

const MAP = [
  LANE,
  RACK,
  DOCK,
  RACK,
  LANE,
  RACK,
  DOCK,
  RACK,
  LANE,
  RACK,
  DOCK,
  RACK,
  LANE,
  RACK,
  DOCK,
  "..C.C..........XX.........",
];

const PICKUPS = ["PK-01", "PK-02", "PK-03", "PK-04"];
const DROPOFFS = ["DO-01", "DO-02", "DO-03", "DO-04"];
const ALL_ROUTES: MissionSpec[] = PICKUPS.flatMap((pickup) => DROPOFFS.map((dropoff) => ({ pickup, dropoff })));

export const highDensityScenario: ScenarioDefinition = {
  id: "high-density",
  name: "High-density warehouse",
  summary: "8 robots · heavy mission feed · fault injected on R-07",
  focus:
    "Eight robots share narrow single-depth aisles under a heavy seeded feed. R-07 is failed by a scheduled command at tick 40; its mission becomes recovery-required and other robots route around it. Automatic recovery is not implemented yet.",
  seed: 3003,
  map: MAP,
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "N", battery: 90, home: { x: 6, y: 15 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "N", battery: 73, home: { x: 7, y: 15 } },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "N", battery: 81, home: { x: 8, y: 15 } },
    { id: "R-04", model: "AMR-200", colorIndex: 4, heading: "N", battery: 66, home: { x: 9, y: 15 } },
    { id: "R-05", model: "AMR-120", colorIndex: 5, heading: "N", battery: 58, home: { x: 10, y: 15 } },
    { id: "R-06", model: "AMR-120", colorIndex: 6, heading: "N", battery: 47, home: { x: 11, y: 15 } },
    { id: "R-07", model: "AMR-200", colorIndex: 7, heading: "N", battery: 69, home: { x: 12, y: 15 } },
    { id: "R-08", model: "AMR-120", colorIndex: 8, heading: "N", battery: 23, home: { x: 2, y: 15 } },
  ],
  missions: [
    { pickup: "PK-01", dropoff: "DO-01" },
    { pickup: "PK-02", dropoff: "DO-02" },
    { pickup: "PK-03", dropoff: "DO-03" },
    { pickup: "PK-04", dropoff: "DO-04" },
  ],
  feed: { intervalTicks: 5, maxOpen: 8, routes: ALL_ROUTES, priorityMix: { high: 0.2, urgent: 0.1 } },
  schedule: [{ tick: 40, command: { type: "fail_robot", robotId: "R-07", failureType: "motor", reason: "Drive motor over-current (injected)" } }],
  handling: { loadTicks: 3, unloadTicks: 3 },
};
