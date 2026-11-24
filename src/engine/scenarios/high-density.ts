import type { ScenarioDefinition } from "../scenario";
import { dockLoop, dockLoopFromReturnLane, type DockLoopSpec } from "./programs";

const WIDTH = 26;

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

const loopA: DockLoopSpec = { width: WIDTH, stationRow: 2, returnRow: 0, pickup: "PK-01", dropoff: "DO-01", load: 4, unload: 4 };
const loopB: DockLoopSpec = { width: WIDTH, stationRow: 6, returnRow: 4, pickup: "PK-02", dropoff: "DO-02", load: 5, unload: 3 };
const loopC: DockLoopSpec = { width: WIDTH, stationRow: 10, returnRow: 8, pickup: "PK-03", dropoff: "DO-03", load: 3, unload: 5 };
const loopD: DockLoopSpec = { width: WIDTH, stationRow: 14, returnRow: 12, pickup: "PK-04", dropoff: "DO-04", load: 4, unload: 4 };

export const highDensityScenario: ScenarioDefinition = {
  id: "high-density",
  name: "High-density warehouse",
  summary: "8 robots · shared lanes · scripted fault on R-07",
  focus:
    "Paired robots share each dock loop at a fixed spacing. R-07 suffers a scripted drive fault at tick 20 while carrying a package, to exercise incident reporting. Recovery and custody transfer are not implemented yet.",
  map: MAP,
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 90, ...dockLoop(loopA) },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "W", battery: 73, ...dockLoopFromReturnLane(loopA, 12) },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "E", battery: 81, ...dockLoop(loopB) },
    { id: "R-04", model: "AMR-200", colorIndex: 4, heading: "W", battery: 66, ...dockLoopFromReturnLane(loopB, 12) },
    { id: "R-05", model: "AMR-120", colorIndex: 5, heading: "E", battery: 58, ...dockLoop(loopC) },
    { id: "R-06", model: "AMR-120", colorIndex: 6, heading: "W", battery: 47, ...dockLoopFromReturnLane(loopC, 12) },
    {
      id: "R-07",
      model: "AMR-200",
      colorIndex: 7,
      heading: "E",
      battery: 69,
      ...dockLoop(loopD),
      fault: { tick: 20, reason: "Drive motor over-current (scripted)" },
    },
    {
      id: "R-08",
      model: "AMR-120",
      colorIndex: 8,
      heading: "N",
      battery: 23,
      start: { x: 2, y: 15 },
      program: [{ op: "charge", station: "CH-01", ticks: 90 }],
    },
  ],
  backlog: [
    { pickup: "PK-01", dropoff: "DO-04" },
    { pickup: "PK-03", dropoff: "DO-02" },
    { pickup: "PK-04", dropoff: "DO-01" },
  ],
};
