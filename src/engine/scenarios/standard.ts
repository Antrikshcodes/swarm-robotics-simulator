import type { ScenarioDefinition } from "../scenario";
import { dockLoop } from "./programs";

const WIDTH = 28;

// 28 × 18. Two rack blocks split by a central cross aisle; inbound pick
// faces on the west wall, outbound docks on the east wall.
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

const r1 = dockLoop({ width: WIDTH, stationRow: 3, returnRow: 0, pickup: "PK-01", dropoff: "DO-01", load: 4, unload: 4 });
const r2 = dockLoop({ width: WIDTH, stationRow: 9, returnRow: 6, pickup: "PK-02", dropoff: "DO-02", load: 5, unload: 3 });
const r3 = dockLoop({ width: WIDTH, stationRow: 15, returnRow: 12, pickup: "PK-03", dropoff: "DO-03", load: 3, unload: 5 });

export const standardScenario: ScenarioDefinition = {
  id: "standard",
  name: "Standard warehouse",
  summary: "Baseline layout · 5 robots · 3 dock-to-dock lanes",
  focus:
    "Concurrent deliveries on independent lanes. Each robot owns a dedicated aisle pair, so no coordination decisions are required.",
  map: MAP,
  robots: [
    { id: "R-01", model: "AMR-200", colorIndex: 1, heading: "E", battery: 92, ...r1 },
    { id: "R-02", model: "AMR-200", colorIndex: 2, heading: "E", battery: 78, startDelay: 6, ...r2 },
    { id: "R-03", model: "AMR-200", colorIndex: 3, heading: "E", battery: 64, startDelay: 12, ...r3 },
    {
      id: "R-04",
      model: "AMR-200",
      colorIndex: 4,
      heading: "N",
      battery: 41,
      start: { x: 2, y: 17 },
      program: [{ op: "charge", station: "CH-01", ticks: 60 }],
    },
    {
      id: "R-05",
      model: "AMR-120",
      colorIndex: 5,
      heading: "N",
      battery: 88,
      start: { x: 4, y: 17 },
      program: [],
    },
  ],
  backlog: [{ pickup: "PK-02", dropoff: "DO-03" }],
};
