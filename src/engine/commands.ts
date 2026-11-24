import type { GridPoint, MissionPriority } from "../types/simulation";
import type { Result } from "./core/result";

/**
 * Commands accepted by WarehouseEngine.dispatch(). Every command returns an
 * explicit Result; nothing is silently ignored.
 *
 * Playback commands (start, pause, step, reset, load-scenario, select-robot)
 * do not change world state beyond what their name says. World commands
 * (add-mission, cancel-mission, close-aisle, reopen-aisle, fail-robot) are
 * recorded in the command log with the tick they were applied at, so seek
 * can replay them deterministically.
 */
export type EngineCommand =
  | { readonly type: "start" }
  | { readonly type: "pause" }
  | { readonly type: "step" }
  | { readonly type: "reset" }
  | { readonly type: "load-scenario"; readonly scenarioId: string }
  | { readonly type: "select-robot"; readonly robotId: string }
  | {
      readonly type: "add-mission";
      readonly pickupStationId: string;
      readonly dropoffStationId: string;
      readonly priority?: MissionPriority;
    }
  | { readonly type: "cancel-mission"; readonly missionId: string }
  | { readonly type: "close-aisle"; readonly cells: readonly GridPoint[]; readonly label?: string }
  | { readonly type: "reopen-aisle"; readonly closureId: string }
  | { readonly type: "fail-robot"; readonly robotId: string; readonly reason?: string };

export type WorldCommand = Extract<
  EngineCommand,
  { type: "add-mission" | "cancel-mission" | "close-aisle" | "reopen-aisle" | "fail-robot" }
>;

export interface CommandOutcome {
  /** Human-readable confirmation for the UI. */
  readonly message: string;
  /** ID of the entity the command created or affected, if any. */
  readonly entityId?: string;
}

export type CommandResult = Result<CommandOutcome>;

export interface LoggedCommand {
  readonly tick: number;
  readonly command: WorldCommand;
}

const WORLD_TYPES: ReadonlySet<EngineCommand["type"]> = new Set([
  "add-mission",
  "cancel-mission",
  "close-aisle",
  "reopen-aisle",
  "fail-robot",
]);

export function isWorldCommand(command: EngineCommand): command is WorldCommand {
  return WORLD_TYPES.has(command.type);
}
