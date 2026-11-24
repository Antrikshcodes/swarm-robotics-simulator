import type { ScenarioDefinition } from "../scenario";

// 22 × 11. Two zones joined by a single one-cell passage NA-1 (row 5,
// x 8–13) plus longer bypass lanes on rows 1 and 9.
const MAP = [
  "######################",
  "----------------------",
  "-.##.##.######.##.##.-",
  "D-##.##.######.##.##-P",
  ".-....X.######......-.",
  "P-------======-------D",
  "-.##.##.######.##.##.-",
  "-.##.##.######.##.##.-",
  "-.......######.......-",
  "----------------------",
  "..C.C.....XX..........",
];

export const narrowAisleScenario: ScenarioDefinition = {
  id: "narrow-aisle",
  name: "Narrow aisle",
  summary: "Head-on traffic · 4 robots · one-cell passage NA-1",
  focus:
    "Opposing missions both prefer passage NA-1. Without reservations (Mission 004) robots meet head-on, wait, and the lower-ranked robot replans via a bypass after a bounded wait.",
  seed: 2002,
  map: MAP,
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 84, home: { x: 2, y: 8 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 71, home: { x: 17, y: 8 } },
    { id: "R-03", model: "AMR-120", colorIndex: 3, heading: "N", battery: 52, home: { x: 2, y: 10 } },
    { id: "R-04", model: "AMR-120", colorIndex: 4, heading: "N", battery: 12, home: { x: 4, y: 10 } },
  ],
  missions: [
    { pickup: "PK-02", dropoff: "DO-02" },
    { pickup: "PK-01", dropoff: "DO-01" },
  ],
  feed: {
    intervalTicks: 16,
    maxOpen: 3,
    routes: [
      { pickup: "PK-02", dropoff: "DO-02" },
      { pickup: "PK-01", dropoff: "DO-01" },
    ],
  },
  handling: { loadTicks: 3, unloadTicks: 3 },
};
