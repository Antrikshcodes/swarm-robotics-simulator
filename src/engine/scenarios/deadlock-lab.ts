import type { ScenarioDefinition } from "../scenario";

/**
 * Deterministic deadlock lab (Mission 004). Robots start inside corridors or
 * passages facing each other, so cooperative planning alone cannot separate
 * them and the deadlock manager must detect and (where possible) recover.
 */
const HANDLING = { loadTicks: 2, unloadTicks: 2 } as const;

/** A — two robots meet head-on in a one-lane corridor between two rooms. */
export const labTwoRobot: ScenarioDefinition = {
  id: "lab-a-two-robot",
  group: "lab",
  name: "Lab A · Two-robot deadlock",
  summary: "Head-on in a one-lane corridor · 2 robots",
  focus:
    "R-01 and R-02 start inside a one-lane corridor facing each other. Neither can plan past the other: a two-robot circular wait. Recovery picks a yielder, backs it out to a holding cell in the room, lets the other pass, then resumes.",
  seed: 4001,
  map: [
    "....#####....",
    "P...#####...D",
    "....-----....",
    "D...#####...P",
    "....#####....",
  ],
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 90, home: { x: 11, y: 2 }, start: { x: 5, y: 2 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 90, home: { x: 1, y: 2 }, start: { x: 7, y: 2 } },
  ],
  missions: [],
  handling: HANDLING,
};

/** B — three robots in the arms of a cross junction, each needing the next one's arm. */
export const labThreeRobot: ScenarioDefinition = {
  id: "lab-b-three-robot",
  group: "lab",
  name: "Lab B · Three-robot circular wait",
  summary: "Cross junction · 3 robots · circular wait",
  focus:
    "Three robots in one-lane arms of a junction each need to pass through the next robot's arm (N→E, E→S, S→N). The wait-for graph forms a three-robot cycle; the robot with a free arm to retreat into yields.",
  seed: 4002,
  map: [
    "####.####",
    "####.####",
    "####.####",
    "####.####",
    ".........",
    "####.####",
    "####.####",
    "####.####",
    "####.####",
  ],
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "S", battery: 90, home: { x: 8, y: 4 }, start: { x: 4, y: 3 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 90, home: { x: 4, y: 8 }, start: { x: 5, y: 4 } },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "N", battery: 90, home: { x: 4, y: 0 }, start: { x: 4, y: 5 } },
  ],
  missions: [],
  handling: HANDLING,
};

/** C — robots meet inside a single-cell passage; one side has a convoy. */
export const labNarrowAisle: ScenarioDefinition = {
  id: "lab-c-narrow-aisle",
  group: "lab",
  name: "Lab C · Narrow-aisle deadlock",
  summary: "One-cell passage · 3 robots · convoy priority",
  focus:
    "R-01 (eastbound) meets R-02 and R-03 (westbound convoy) inside a one-cell passage. Passage priority favours the convoy: R-01 backs out to a holding cell, both westbound robots pass, then R-01 continues. Missions keep running; package custody is untouched.",
  seed: 4003,
  map: [
    "P....#####....P",
    ".....#####.....",
    "D....=====....D",
    ".....#####.....",
    ".....#####.....",
  ],
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 90, home: { x: 12, y: 4 }, start: { x: 6, y: 2 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 90, home: { x: 2, y: 4 }, start: { x: 8, y: 2 } },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "W", battery: 90, home: { x: 2, y: 3 }, start: { x: 9, y: 2 } },
    { id: "R-04", model: "AMR-120", colorIndex: 4, heading: "N", battery: 90, home: { x: 2, y: 1 } },
  ],
  // R-04 carries a package west → east once the passage clears.
  missions: [{ pickup: "PK-01", dropoff: "DO-02" }],
  handling: HANDLING,
};

/** D — robots queue through a single door: waiting and congestion, no cycle. */
export const labCongestion: ScenarioDefinition = {
  id: "lab-d-congestion",
  group: "lab",
  name: "Lab D · Temporary congestion",
  summary: "Single doorway · 4 robots queue · no deadlock",
  focus:
    "Four robots leave a room through one doorway. They queue and wait (congestion), but every wait chain ends at a moving robot — no circular wait, so no deadlock may be reported.",
  seed: 4004,
  map: [
    "......#......",
    "......#......",
    "......-......",
    "......#......",
    "......#......",
  ],
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 90, home: { x: 8, y: 1 }, start: { x: 5, y: 2 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "E", battery: 90, home: { x: 9, y: 2 }, start: { x: 4, y: 2 } },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "E", battery: 90, home: { x: 8, y: 3 }, start: { x: 5, y: 1 } },
    { id: "R-04", model: "AMR-200", colorIndex: 4, heading: "E", battery: 90, home: { x: 10, y: 2 }, start: { x: 5, y: 3 } },
  ],
  missions: [],
  handling: HANDLING,
};

/** E — head-on in a sealed corridor: nowhere to yield, recovery must fail safely. */
export const labUnrecoverable: ScenarioDefinition = {
  id: "lab-e-unrecoverable",
  group: "lab",
  name: "Lab E · Unrecoverable deadlock",
  summary: "Sealed one-lane corridor · no holding position",
  focus:
    "Two robots face each other in a sealed one-lane corridor. Every cell either robot could back into lies on the other's route, so no safe holding position exists. Recovery must report deadlock_recovery_failed and keep both robots safely in place.",
  seed: 4005,
  map: ["#########", "#.......#", "#########"],
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 90, home: { x: 7, y: 1 }, start: { x: 3, y: 1 } },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 90, home: { x: 1, y: 1 }, start: { x: 5, y: 1 } },
  ],
  missions: [],
  handling: HANDLING,
};

export const DEADLOCK_LAB: readonly ScenarioDefinition[] = [labTwoRobot, labThreeRobot, labNarrowAisle, labCongestion, labUnrecoverable];
