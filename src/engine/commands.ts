import type { FailureType, GridPoint, MissionPriority } from "../types/simulation";
import type { Result } from "./core/result";

/**
 * Commands accepted by WarehouseEngine.dispatch(). Every command returns an
 * explicit Result; nothing is silently ignored.
 *
 * Playback commands (start, pause, step, reset, load-scenario, select-robot)
 * do not change world state beyond what their name says. World commands
 * (missions, closures, failures and package recovery) are recorded in the
 * command log with the tick they were applied at, so seek can replay them
 * deterministically.
 *
 * Failure-recovery and topology commands use the snake_case names of the
 * Mission 005 contract.
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
  | { readonly type: "close_aisle"; readonly cells: readonly GridPoint[]; readonly label?: string }
  | { readonly type: "reopen_aisle"; readonly closureId: string }
  | { readonly type: "fail_robot"; readonly robotId: string; readonly failureType?: FailureType; readonly reason?: string }
  | { readonly type: "restore_robot"; readonly robotId: string }
  /** Start (or restart) recovery of a stranded package, optionally choosing the rescuer. */
  | { readonly type: "start_package_recovery"; readonly packageId: string; readonly rescuerId?: string }
  /** Complete a handover now; the rescuer must already be beside the failed robot. */
  | { readonly type: "complete_package_handover"; readonly packageId: string }
  /** Stop an open recovery before custody changes; the package stays with the failed robot. */
  | { readonly type: "cancel_recovery"; readonly packageId: string };

export type WorldCommand = Extract<
  EngineCommand,
  {
    type:
      | "add-mission"
      | "cancel-mission"
      | "close_aisle"
      | "reopen_aisle"
      | "fail_robot"
      | "restore_robot"
      | "start_package_recovery"
      | "complete_package_handover"
      | "cancel_recovery";
  }
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
  "close_aisle",
  "reopen_aisle",
  "fail_robot",
  "restore_robot",
  "start_package_recovery",
  "complete_package_handover",
  "cancel_recovery",
]);

export const FAILURE_TYPES: readonly FailureType[] = ["motor", "battery", "navigation", "communication", "emergency-stop"];

export function isWorldCommand(command: EngineCommand): command is WorldCommand {
  return WORLD_TYPES.has(command.type);
}
