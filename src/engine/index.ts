export { WarehouseEngine } from "./warehouse-engine";
export type { SimulationSource, EngineOptions } from "./warehouse-engine";
export type { EngineCommand, CommandResult, CommandOutcome, LoggedCommand, WorldCommand } from "./commands";
export type { EngineError, EngineErrorCode, Result } from "./core/result";
export { InvariantViolation } from "./core/result";
export { computeMetrics, LOW_BATTERY_THRESHOLD, BLOCKED_ALERT_TICKS } from "./metrics";
export { checkInvariants } from "./invariants";
export { findPath } from "./pathfinding/astar";
export { isActiveMission } from "./missions/mission-lifecycle";
export { SCENARIOS, STRESS_SCENARIOS, DEFAULT_SCENARIO_ID, getScenario, getCompiledScenario, hasScenario } from "./scenarios";
export { cellKindAt, isTraversable, stationAt, samePoint, pointKey } from "./world/layout";

import { WarehouseEngine, type EngineOptions } from "./warehouse-engine";
import { getCompiledScenario } from "./scenarios";

export function createSimulationSource(scenarioId: string, options?: EngineOptions): WarehouseEngine {
  return new WarehouseEngine(getCompiledScenario(scenarioId), options);
}
