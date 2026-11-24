import { compileScenario, type CompiledScenario, type ScenarioDefinition } from "../scenario";
import { DEADLOCK_LAB } from "./deadlock-lab";
import { highDensityScenario } from "./high-density";
import { narrowAisleScenario } from "./narrow-aisle";
import { standardScenario } from "./standard";

export const SCENARIOS: readonly ScenarioDefinition[] = [
  standardScenario,
  narrowAisleScenario,
  highDensityScenario,
  ...DEADLOCK_LAB,
];

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export const DEFAULT_SCENARIO_ID = standardScenario.id;

const compiled = new Map<string, CompiledScenario>();

export function getScenario(id: string): ScenarioDefinition {
  const found = SCENARIOS.find((s) => s.id === id);
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
