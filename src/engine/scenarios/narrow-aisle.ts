import type { ScenarioDefinition } from "../scenario";

// 22 × 11. The two zones are joined by a single one-cell passage (row 5,
// x 8–13) plus long bypass lanes on rows 1 and 9.
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

/*
 * Timing (both loops have a 70-tick period):
 *   R-01 loads at PK-02 for ticks 1–10, then runs east through the passage,
 *   occupying x = 8…13 on ticks 18–23 and reaching DO-02 on tick 31.
 *   R-02 starts at tick 13, reaches the passage mouth (20,4) on tick 17 and
 *   holds there for 14 ticks, entering the aisle on tick 32 once R-01 is clear.
 *
 * The hold is SCRIPTED. It illustrates the conflict a coordinator must
 * resolve; real reservation-based yielding arrives in Missions 004–005.
 */
export const narrowAisleScenario: ScenarioDefinition = {
  id: "narrow-aisle",
  name: "Narrow aisle",
  summary: "Head-on conflict · 4 robots · one-cell passage NA-1",
  focus:
    "Two robots need the same one-cell passage from opposite ends. The yield shown here is a scripted hold standing in for future reservation logic.",
  map: MAP,
  robots: [
    {
      id: "R-01",
      model: "AMR-200",
      colorIndex: 1,
      heading: "E",
      battery: 84,
      start: { x: 0, y: 5 },
      program: [
        { op: "load", station: "PK-02", ticks: 10 },
        { op: "travel", via: [{ x: 21, y: 5 }] },
        { op: "unload", station: "DO-02", ticks: 10 },
        { op: "travel", via: [{ x: 21, y: 9 }, { x: 0, y: 9 }, { x: 0, y: 5 }] },
      ],
    },
    {
      id: "R-02",
      model: "AMR-200",
      colorIndex: 2,
      heading: "W",
      battery: 71,
      start: { x: 21, y: 3 },
      startDelay: 12,
      program: [
        { op: "load", station: "PK-01", ticks: 3 },
        { op: "travel", via: [{ x: 20, y: 3 }, { x: 20, y: 4 }] },
        { op: "wait", ticks: 14, reason: "Passage NA-1 occupied by R-01 (scripted yield)" },
        {
          op: "travel",
          via: [{ x: 20, y: 5 }, { x: 1, y: 5 }, { x: 1, y: 3 }, { x: 0, y: 3 }],
        },
        { op: "unload", station: "DO-01", ticks: 3 },
        { op: "travel", via: [{ x: 0, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 3 }] },
      ],
    },
    {
      id: "R-03",
      model: "AMR-120",
      colorIndex: 3,
      heading: "N",
      battery: 52,
      start: { x: 2, y: 10 },
      program: [{ op: "charge", station: "CH-01", ticks: 80 }],
    },
    {
      id: "R-04",
      model: "AMR-120",
      colorIndex: 4,
      heading: "N",
      battery: 17,
      start: { x: 4, y: 10 },
      program: [],
    },
  ],
  backlog: [
    { pickup: "PK-02", dropoff: "DO-01" },
    { pickup: "PK-01", dropoff: "DO-02" },
  ],
};
