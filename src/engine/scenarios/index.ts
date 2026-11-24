import { compileScenario, type CompiledScenario, type ScenarioDefinition } from "../scenario";
import { DEADLOCK_LAB } from "./deadlock-lab";
import { highDensityScenario } from "./high-density";
import { narrowAisleScenario } from "./narrow-aisle";
import { RECOVERY_LAB } from "./recovery-lab";
import { standardScenario } from "./standard";
import { STRESS_SCENARIOS } from "./stress";

export { STRESS_SCENARIOS } from "./stress";

export const SCENARIOS: readonly ScenarioDefinition[] = [
  standardScenario,
  narrowAisleScenario,
  highDensityScenario,
  ...DEADLOCK_LAB,
  ...RECOVERY_LAB,
];

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export const DEFAULT_SCENARIO_ID = standardScenario.id;

const compiled = new Map<string, CompiledScenario>();

/** Synthetic stress tests live in their own list so the shipped-scenario set stays the judged one. */
const ALL: readonly ScenarioDefinition[] = [...SCENARIOS, ...STRESS_SCENARIOS];

export function hasScenario(id: string): boolean {
  return ALL.some((s) => s.id === id);
}

export function getScenario(id: string): ScenarioDefinition {
  const found = ALL.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario "${id}"`);
  return found;
}

/** Compile once and cache — compiled scenarios are immutable. */
export function getCompiledScenario(id: string): CompiledScenario {
  let entry = compiled.get(id);
  if (!entry) {
    entry = compileScenario(getScenario(id));
    compiled.set(id, entry);
  }
  return entry;
}
