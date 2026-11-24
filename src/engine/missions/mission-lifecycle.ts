import type { Mission, MissionPriority, MissionState } from "../../types/simulation";
import { err, ok, type Result } from "../core/result";

/**
 * Mission lifecycle.
 *
 *   queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed
 *
 * - `carrying` means the package is secured on the robot but it has no
 *   drop-off route yet (e.g. the drop-off is unreachable because of a closure).
 * - `cancelled` is reachable only before pickup.
 * - `assigned` / `to-pickup` → `queued` (requeue) when the pickup becomes
 *   unusable before pickup, e.g. a failed robot is standing on the station.
 * - A robot failure before the package is picked up (`assigned`, `to-pickup`,
 *   `picking-up`) requeues the mission for reassignment.
 * - `recovery-required` is reached when the robot fails while the package is
 *   on board. It returns to `carrying` once a rescuer has taken custody (or
 *   the original robot is restored), so delivery resumes exactly once.
 * - `completed` and `cancelled` are terminal.
 */
const ACTIVE: readonly MissionState[] = ["assigned", "to-pickup", "picking-up", "carrying", "to-dropoff", "dropping-off"];

const ALLOWED: Record<MissionState, readonly MissionState[]> = {
  queued: ["assigned", "cancelled"],
  assigned: ["to-pickup", "picking-up", "queued", "cancelled", "recovery-required"],
  "to-pickup": ["picking-up", "assigned", "queued", "cancelled", "recovery-required"],
  "picking-up": ["carrying", "queued", "recovery-required"],
  carrying: ["to-dropoff", "dropping-off", "recovery-required"],
  "to-dropoff": ["dropping-off", "carrying", "recovery-required"],
  "dropping-off": ["completed", "recovery-required"],
  completed: [],
  cancelled: [],
  "recovery-required": ["carrying"],
};

export const isActiveMission = (state: MissionState): boolean => ACTIVE.includes(state);

export const isTerminalMission = (state: MissionState): boolean => state === "completed" || state === "cancelled";

export function canTransitionMission(from: MissionState, to: MissionState): boolean {
  return ALLOWED[from].includes(to);
}

export function createMission(params: {
  id: string;
  packageId: string;
  pickupStationId: string;
  dropoffStationId: string;
  tick: number;
  priority?: MissionPriority;
}): Mission {
  return {
    id: params.id,
    priority: params.priority ?? "normal",
    packageId: params.packageId,
    robotId: null,
    pickupStationId: params.pickupStationId,
    dropoffStationId: params.dropoffStationId,
    state: "queued",
    createdTick: params.tick,
    assignedTick: null,
    pickedTick: null,
    completedTick: null,
    history: [{ tick: params.tick, from: null, to: "queued" }],
  };
}

export function transitionMission(
  mission: Mission,
  to: MissionState,
  tick: number,
  patch: Partial<Pick<Mission, "robotId" | "assignedTick" | "pickedTick" | "completedTick">> = {},
): Result<Mission> {
  if (mission.state === to) return ok(mission);
  if (!canTransitionMission(mission.state, to)) {
    return err("invalid-mission-transition", `${mission.id}: cannot move from "${mission.state}" to "${to}"`);
  }
  return ok({
    ...mission,
    ...patch,
    state: to,
    history: [...mission.history, { tick, from: mission.state, to }],
  });
}
