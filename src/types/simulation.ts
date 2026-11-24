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
  | "yielding"
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

/** Coordinator's view of a robot this tick. */
export type CoordinationState =
  | "moving"
  | "waiting"
  | "holding"
  | "dwelling"
  | "failed"
  | "no-route"
  | "blocked";

/** Outcome of the robot's latest space-time plan. */
export type PlanStatus = "complete" | "partial" | "unreachable" | "blocked";

export interface PlannedStep {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
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
  /** Movement priority used by the coordinator (higher moves first). */
  readonly priority: number;
  readonly coordination: CoordinationState;
  readonly planStatus: PlanStatus | null;
  /** Reserved future positions, one per tick (waits repeat the cell). */
  readonly plan: readonly PlannedStep[];
  /** Robot that holds the reservation this robot is waiting on, if any. */
  readonly waitingFor: string | null;
  readonly waitClass: WaitClass;
  /** Deadlock incident this robot belongs to, if any is open. */
  readonly deadlockId: string | null;
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

export type MissionPriority = "normal" | "high" | "urgent";

export interface Mission {
  readonly id: string;
  readonly priority: MissionPriority;
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
  | "mission-requeued"
  | "mission-recovery-required"
  | "pickup-started"
  | "package-picked-up"
  | "dropoff-started"
  | "package-delivered"
  | "robot-waiting"
  | "robot-replanned"
  | "right-of-way"
  | "conflict-prevented"
  | "robot-no-path"
  | "robot-failed"
  | "robot-charging"
  | "robot-returning-home"
  | "battery-low"
  | "aisle-closed"
  | "aisle-reopened"
  // Deadlock lifecycle (names follow the Mission 004 event contract).
  | "deadlock_detected"
  | "deadlock_group_identified"
  | "deadlock_recovery_started"
  | "robot_yielded"
  | "recovery_route_planned"
  | "deadlock_resolved"
  | "deadlock_recovery_failed";

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
  /** All robots involved (deadlock events). */
  readonly robotIds?: readonly string[];
  readonly incidentId?: string;
  readonly attempt?: number;
  /** Contested or target cell (blocking resource, holding position). */
  readonly cell?: GridPoint;
  /** Recovery action taken, e.g. "yield-to-holding-position". */
  readonly action?: string;
  /** Resolution status at the time of the event. */
  readonly status?: DeadlockStatus;
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

// ----------------------------------------------------------- coordination

export type DecisionKind = "wait" | "yield" | "preempt" | "replan" | "no-route" | "commit-reject";

export interface CoordinationDecision {
  readonly seq: number;
  readonly tick: number;
  readonly kind: DecisionKind;
  readonly robotId: string;
  readonly otherRobotId?: string;
  readonly cell?: number;
  readonly message: string;
}

export interface CoordinatorStats {
  readonly plansComputed: number;
  readonly nodesExpanded: number;
  readonly preemptions: number;
  readonly commitRejections: number;
  readonly plannedWaits: number;
  readonly distanceMapsBuilt: number;
  readonly lastTickPlans: number;
}

export interface CellReservation {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly robotId: string;
}

export interface HoldReservation {
  readonly x: number;
  readonly y: number;
  readonly robotId: string;
  readonly fromTick: number;
}

/** Edge of the wait-for graph: `robotId` cannot progress because of `waitingFor`. */
export interface WaitForEdge {
  readonly robotId: string;
  readonly waitingFor: string;
  /** Consecutive ticks `robotId` has been waiting. */
  readonly ticks: number;
  /** Contested cell, if known. */
  readonly cell?: GridPoint;
  /** occupied = stands on a route cell; held = end-of-plan claim; reserved = reservation the robot waits on. */
  readonly reason?: "occupied" | "held" | "reserved";
}

// ---------------------------------------------------------------- deadlock

/**
 * How a robot's waiting is classified this tick:
 * none · waiting (brief) · congestion (≥ 3 ticks, no cycle) · deadlock
 * (confirmed circular wait or stall) · recovering (in a group being
 * recovered) · yielding (the robot chosen to make way).
 */
export type WaitClass = "none" | "waiting" | "congestion" | "deadlock" | "recovering" | "yielding";

export type DeadlockKind = "cycle" | "stall";
export type DeadlockStatus = "detected" | "recovering" | "resolved" | "failed";
export type RecoveryOutcome = "in-progress" | "resolved" | "escalated" | "no-holding-position" | "no-route" | "timeout" | "aborted";

export interface RecoveryAttempt {
  readonly attempt: number;
  readonly yielderId: string;
  readonly holdingCell: GridPoint | null;
  /** Route the yielder planned to its holding position (empty until planned). */
  readonly route: readonly GridPoint[];
  readonly startedTick: number;
  readonly endedTick: number | null;
  readonly outcome: RecoveryOutcome;
  readonly note: string;
}

export interface DeadlockIncident {
  readonly id: string;
  readonly kind: DeadlockKind;
  readonly status: DeadlockStatus;
  /** Robots in the circular wait (or the stalled chain). */
  readonly robots: readonly string[];
  /** Robots waiting on the group without being part of the cycle. */
  readonly dependents: readonly string[];
  /** Wait-for edges among the group when it was confirmed. */
  readonly edges: readonly WaitForEdge[];
  /** Cells the group members were contesting. */
  readonly blockingCells: readonly GridPoint[];
  readonly detectedTick: number;
  readonly resolvedTick: number | null;
  readonly attempts: readonly RecoveryAttempt[];
  readonly failureReason: string | null;
}

export interface DeadlockSnapshot {
  /** Latest incidents, newest last, bounded. */
  readonly incidents: readonly DeadlockIncident[];
  readonly stats: {
    readonly detected: number;
    readonly resolved: number;
    readonly failed: number;
    readonly attempts: number;
    /** Cycles seen but cleared before confirmation (not reported as deadlocks). */
    readonly transientCycles: number;
  };
  readonly thresholds: {
    readonly confirmTicks: number;
    readonly congestionTicks: number;
    readonly stallTicks: number;
    readonly maxAttempts: number;
    readonly attemptTimeout: number;
  };
  readonly recoveryEnabled: boolean;
}

export interface CoordinationSnapshot {
  /** Cell reservations from the current tick onwards (current tick = present positions). */
  readonly reservations: readonly CellReservation[];
  readonly holds: readonly HoldReservation[];
  /** Recent coordinator decisions, oldest first, bounded. */
  readonly decisions: readonly CoordinationDecision[];
  /** Wait-for graph for deadlock detection (Mission 004). */
  readonly waitGraph: readonly WaitForEdge[];
  readonly stats: CoordinatorStats;
  readonly horizon: number;
}

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
  readonly coordination: CoordinationSnapshot;
  readonly deadlocks: DeadlockSnapshot;
  readonly metrics: FleetMetrics;
}

export type EntitySelection =
  | { readonly kind: "robot"; readonly id: string }
  | { readonly kind: "station"; readonly id: string }
  | { readonly kind: "cell"; readonly x: number; readonly y: number };
