import type { MissionSpec, ScenarioDefinition } from "../scenario";

// 28 × 18. Two rack blocks split by a central cross aisle; inbound pick
// faces on the west wall, outbound docks on the east wall, parking and
// charging along the south wall.
const MAP = [
  ".--------------------------.",
  ".-#####-#####--#####-#####-.",
  ".-#####-#####--#####-#####-.",
  "P--------------------------D",
  ".-#####-#####--#####-#####-.",
  ".-#####-#####--#####-#####-.",
  ".--------------------------.",
  ".-#####-#####--#####-#####-.",
  ".-#####-#####--#####-#####-.",
  "P--------------------------D",
  ".-#####-#####--#####-#####-.",
  ".-#####-#####--#####-#####-.",
  ".--------------------------.",
  ".-#####-#####--#####-#####-.",
  ".-#####-#####--#####-#####-.",
  "P--------------------------D",
  ".-.....X.....--......X....-.",
  "..C.C.C.....................",
];

const PICKUPS = ["PK-01", "PK-02", "PK-03"];
const DROPOFFS = ["DO-01", "DO-02", "DO-03"];
const ALL_ROUTES: MissionSpec[] = PICKUPS.flatMap((pickup) => DROPOFFS.map((dropoff) => ({ pickup, dropoff })));

export const standardScenario: ScenarioDefinition = {
  id: "standard",
  name: "Standard warehouse",
  summary: "Baseline layout · 5 robots · A*-routed deliveries",
  focus:
    "Missions are queued by a seeded feed and assigned to the nearest available robot. Routes are planned with A*; robots wait for occupied cells and replan around persistent blockers.",
  seed: 1001,
  map: MAP,
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "N", battery: 92, home: { x: 9, y: 17 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "N", battery: 78, home: { x: 11, y: 17 } },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "N", battery: 64, home: { x: 13, y: 17 } },
    { id: "R-04", model: "AMR-200", colorIndex: 4, heading: "N", battery: 41, home: { x: 2, y: 17 } },
    { id: "R-05", model: "AMR-120", colorIndex: 5, heading: "N", battery: 88, home: { x: 4, y: 17 } },
  ],
  missions: [
    { pickup: "PK-01", dropoff: "DO-01" },
    { pickup: "PK-02", dropoff: "DO-02" },
    { pickup: "PK-03", dropoff: "DO-03" },
  ],
  feed: { intervalTicks: 10, maxOpen: 5, routes: ALL_ROUTES },
  handling: { loadTicks: 3, unloadTicks: 3 },
};
