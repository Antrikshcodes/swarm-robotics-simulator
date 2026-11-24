/**
 * Shared simulation domain types.
 *
 * These types describe the read-only snapshot contract between the
 * simulation layer and the UI (see API_CONTRACTS.md). Mission 001 fills
 * them from a deterministic *demo playback* (src/engine/demo-playback.ts).
 * The real coordination engine (Missions 002–006) is expected to emit the
 * same snapshot shape so the UI does not need to be rewritten.
 */

/** Grid coordinate. `x` is the column, `y` is the row (origin top-left). */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export type Heading = "N" | "E" | "S" | "W";

export type CellKind =
  | "floor"
  | "lane"
  | "narrow"
  | "rack"
  | "obstacle"
  | "pickup"
  | "dropoff"
  | "charger";

export type StationKind = "pickup" | "dropoff" | "charger";

export interface Station {
  readonly id: string;
  readonly kind: StationKind;
  readonly label: string;
  readonly position: GridPoint;
}

export interface WarehouseLayout {
  readonly width: number;
  readonly height: number;
  /** Row-major cell kinds, length = width * height. */
  readonly cells: readonly CellKind[];
  readonly stations: readonly Station[];
}

export type RobotStatus =
  | "idle"
  | "moving"
  | "loading"
  | "unloading"
  | "waiting"
  | "charging"
  | "fault";

export interface RobotStats {
  readonly movingTicks: number;
  readonly waitingTicks: number;
  readonly busyTicks: number;
  readonly distance: number;
  readonly deliveries: number;
}

export interface RobotState {
  readonly id: string;
  readonly model: string;
  /** Index into the robot identity palette (--robot-1 … --robot-8). */
  readonly colorIndex: number;
  readonly position: GridPoint;
  /** Position at the previous tick; used only for render interpolation. */
  readonly previousPosition: GridPoint;
  readonly heading: Heading;
  readonly status: RobotStatus;
  /** Sample telemetry in percent. Not a modelled battery. */
  readonly battery: number;
  readonly missionId: string | null;
  readonly packageId: string | null;
  /** Station the robot is currently heading to, if any. */
  readonly destinationStationId: string | null;
  /** Remaining scripted cells until the destination (excludes current cell). */
  readonly route: readonly GridPoint[];
  /** Human-readable note for the current activity (e.g. scripted wait reason). */
  readonly activityNote: string | null;
  readonly stats: RobotStats;
}

/** Mission lifecycle — subset of SIMULATION_RULES.md states used so far. */
export type MissionState =
  | "queued"
  | "assigned"
  | "to-pickup"
  | "carrying"
  | "completed"
  | "cancelled"
  | "recovery-required";

export interface Mission {
  readonly id: string;
  readonly packageId: string;
  readonly robotId: string | null;
  readonly pickupStationId: string;
  readonly dropoffStationId: string;
  readonly state: MissionState;
  readonly createdTick: number;
  readonly pickedTick: number | null;
  readonly completedTick: number | null;
}

export type EventSeverity = "info" | "success" | "warning" | "critical";

export type SimEventKind =
  | "scenario-loaded"
  | "mission-assigned"
  | "pickup-complete"
  | "delivery-complete"
  | "robot-waiting"
  | "robot-charging"
  | "robot-fault"
  | "battery-low";

export interface SimEvent {
  /** Monotonic, deterministic sequence number. */
  readonly seq: number;
  readonly tick: number;
  readonly kind: SimEventKind;
  readonly severity: EventSeverity;
  readonly message: string;
  readonly robotId?: string;
  readonly missionId?: string;
  readonly stationId?: string;
}

export interface FleetMetrics {
  readonly totalRobots: number;
  readonly activeRobots: number;
  readonly idleRobots: number;
  readonly faultedRobots: number;
  readonly waitingRobots: number;
  readonly activeMissions: number;
  readonly queuedMissions: number;
  readonly waitingMissions: number;
  readonly completedDeliveries: number;
  readonly openIncidents: number;
  /** Busy robot-ticks / total robot-ticks, 0..1. */
  readonly utilisation: number;
}

export type SimulationDataSource = "demo-script" | "engine";

export interface SimulationSnapshot {
  readonly source: SimulationDataSource;
  readonly scenarioId: string;
  readonly tick: number;
  readonly layout: WarehouseLayout;
  readonly robots: readonly RobotState[];
  readonly missions: readonly Mission[];
  /** Most recent events, newest last, bounded. */
  readonly events: readonly SimEvent[];
  /** Tick of every completed delivery (for throughput analytics). */
  readonly deliveryTicks: readonly number[];
  readonly metrics: FleetMetrics;
}

export type EntitySelection =
  | { readonly kind: "robot"; readonly id: string }
  | { readonly kind: "station"; readonly id: string }
  | { readonly kind: "cell"; readonly x: number; readonly y: number };
