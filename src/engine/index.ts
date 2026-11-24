export { DemoPlayback, computeMetrics, LOW_BATTERY_THRESHOLD } from "./demo-playback";
export type { SimulationSource } from "./demo-playback";
export {
  SCENARIOS,
  DEFAULT_SCENARIO_ID,
  getScenario,
  getCompiledScenario,
} from "./scenarios";
export { cellKindAt, isTraversable, stationAt, samePoint } from "./layout";

import { DemoPlayback } from "./demo-playback";
import { getCompiledScenario } from "./scenarios";

export function createSimulationSource(scenarioId: string): DemoPlayback {
  return new DemoPlayback(getCompiledScenario(scenarioId));
}
