/**
 * Shared simulation domain types — the read-only snapshot contract between
 * the engine (src/engine) and the UI. See API_CONTRACTS.md.
 *
 * Everything here is produced by WarehouseEngine. The UI never mutates it.
 */

/** Grid coordinate. `x` is the column, `y` is the row (origin top-left). */
export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export type Heading = "N" | "E" | "S" | "W";

// ------------------------------------------------------------------ world

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

/** Static warehouse geometry. Dynamic closures live in the snapshot. */
export interface WarehouseLayout {
  readonly width: number;
  readonly height: number;
  /** Row-major cell kinds, length = width * height. */
  readonly cells: readonly CellKind[];
  readonly stations: readonly Station[];
}

/** A dynamic aisle closure: cells that new plans may not enter. */
export interface Closure {
  readonly id: string;
  readonly cells: readonly GridPoint[];
  readonly label: string;
  readonly createdTick: number;
}

// ----------------------------------------------------------------- robots

export type RobotStatus =
  | "idle"
  | "moving"
  | "carrying"
  | "waiting"
  | "loading"
  | "unloading"
  | "charging"
  | "failed"
  | "recovering";

/** What the robot is trying to do, independent of whether it moved this tick. */
export type RobotAction =
  | "none"
  | "travel-to-pickup"
  | "travel-to-dropoff"
  | "return-home"
  | "travel-to-charger"
  | "loading"
  | "unloading"
  | "charging"
  | "halted";

export interface RobotStats {
  readonly movingTicks: number;
  readonly waitingTicks: number;
  /** Ticks spent moving, loading or unloading. */
  readonly busyTicks: number;
  readonly distance: number;
  readonly deliveries: number;
  readonly replans: number;
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
  readonly action: RobotAction;
  /** Simplified battery model, percent. */
  readonly battery: number;
  readonly home: GridPoint;
  readonly missionId: string | null;
  readonly packageId: string | null;
  /** Station the robot is heading to or working at, if any. */
  readonly destinationStationId: string | null;
  /** Cell the current plan ends at, if any. */
  readonly destination: GridPoint | null;
  /** Remaining planned cells (A* output), excluding the current cell. */
  readonly route: readonly GridPoint[];
  /** Consecutive ticks the robot has been unable to take its next step. */
  readonly blockedTicks: number;
  /** Human-readable explanation of the current activity. */
  readonly activityNote: string | null;
  readonly stats: RobotStats;
}

// --------------------------------------------------------------- missions

export type MissionState =
  | "queued"
  | "assigned"
  | "to-pickup"
  | "picking-up"
  | "carrying"
  | "to-dropoff"
  | "dropping-off"
  | "completed"
  | "cancelled"
  | "recovery-required";

export interface MissionTransition {
  readonly tick: number;
  readonly from: MissionState | null;
  readonly to: MissionState;
}

export interface Mission {
  readonly id: string;
  readonly packageId: string;
  readonly robotId: string | null;
  readonly pickupStationId: string;
  readonly dropoffStationId: string;
  readonly state: MissionState;
  readonly createdTick: number;
  readonly assignedTick: number | null;
  readonly pickedTick: number | null;
  readonly completedTick: number | null;
  readonly history: readonly MissionTransition[];
}

// --------------------------------------------------------------- packages

export type PackageState = "available" | "reserved" | "picked-up" | "in-transit" | "delivered";

export type PackageLocation =
  | { readonly kind: "station"; readonly stationId: string }
  | { readonly kind: "robot"; readonly robotId: string }
  | { readonly kind: "delivered"; readonly stationId: string };

export interface CustodyRecord {
  readonly tick: number;
  readonly from: PackageState | null;
  readonly to: PackageState;
  readonly robotId: string | null;
  readonly note: string;
}

export interface Package {
  readonly id: string;
  readonly missionId: string;
  readonly state: PackageState;
  readonly originStationId: string;
  readonly destinationStationId: string;
  /** The single robot that owns (reserved or carries) the package, if any. */
  readonly holderRobotId: string | null;
  readonly location: PackageLocation;
  readonly history: readonly CustodyRecord[];
}

// ----------------------------------------------------------------- events

export type EventSeverity = "info" | "success" | "warning" | "critical";

export type SimEventKind =
  | "scenario-loaded"
  | "simulation-started"
  | "simulation-paused"
  | "mission-created"
  | "mission-assigned"
  | "mission-cancelled"
  | "mission-recovery-required"
  | "pickup-started"
  | "package-picked-up"
  | "dropoff-started"
  | "package-delivered"
  | "robot-waiting"
  | "robot-replanned"
  | "robot-no-path"
  | "robot-failed"
  | "robot-charging"
  | "robot-returning-home"
  | "battery-low"
  | "aisle-closed"
  | "aisle-reopened";

export interface SimEvent {
  /** Stable identifier, e.g. "E-000042" (engine) or "P-000003" (playback). */
  readonly id: string;
  /** Monotonic ordering key within its id space. */
  readonly seq: number;
  readonly tick: number;
  readonly kind: SimEventKind;
  readonly severity: EventSeverity;
  readonly message: string;
  readonly robotId?: string;
  readonly missionId?: string;
  readonly packageId?: string;
  readonly stationId?: string;
  readonly closureId?: string;
}

/** Per-tick movement record, kept in a separate bounded log. */
export interface MovementRecord {
  readonly tick: number;
  readonly robotId: string;
  readonly from: GridPoint;
  readonly to: GridPoint;
}

// ---------------------------------------------------------------- metrics

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

export type SimulationDataSource = "engine";

export interface SimulationSnapshot {
  readonly source: SimulationDataSource;
  readonly scenarioId: string;
  readonly tick: number;
  readonly running: boolean;
  readonly layout: WarehouseLayout;
  readonly closures: readonly Closure[];
  readonly robots: readonly RobotState[];
  readonly missions: readonly Mission[];
  readonly packages: readonly Package[];
  /** Most recent events, oldest first, bounded. Excludes per-cell movement. */
  readonly events: readonly SimEvent[];
  /** Most recent movement records, bounded. */
  readonly movements: readonly MovementRecord[];
  /** Tick of every completed delivery (for throughput analytics). */
  readonly deliveryTicks: readonly number[];
  readonly metrics: FleetMetrics;
}

export type EntitySelection =
  | { readonly kind: "robot"; readonly id: string }
  | { readonly kind: "station"; readonly id: string }
  | { readonly kind: "cell"; readonly x: number; readonly y: number };
