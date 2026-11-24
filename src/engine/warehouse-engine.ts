import type {
  Closure,
  CoordinationSnapshot,
  EventSeverity,
  FailureType,
  GridPoint,
  Heading,
  Mission,
  MissionPriority,
  MissionState,
  MovementRecord,
  Package,
  RobotAction,
  RobotState,
  RobotStatus,
  RouteEvent,
  SimEvent,
  SimEventKind,
  SimulationSnapshot,
  Station,
} from "../types/simulation";
import {
  FAILURE_TYPES,
  isWorldCommand,
  type CommandResult,
  type EngineCommand,
  type LoggedCommand,
  type WorldCommand,
} from "./commands";
import { InvariantViolation, err, ok, type Result } from "./core/result";
import { Prng } from "./core/prng";
import {
  assignRescuer,
  createPackage,
  deliverPackage,
  departWithPackage,
  markRecoveryRequired,
  pickUpPackage,
  releaseReservation,
  reservePackage,
  resumeCustody,
  transferCustody,
} from "./custody/package-custody";
import { FAILURE_LABEL, RESTORE_TICKS, RecoveryManager, type RecoveryOptions, type RecoveryPort } from "./recovery/recovery-manager";
import { checkInvariants } from "./invariants";
import { BLOCKED_ALERT_TICKS, LOW_BATTERY_THRESHOLD, computeMetrics } from "./metrics";
import { createMission, isActiveMission, transitionMission } from "./missions/mission-lifecycle";
import { Coordinator, type CoordMode, type RobotCoordination } from "./coordination/coordinator";
import { resolveMoves } from "./coordination/move-resolver";
import { DeadlockManager, type DeadlockOptions } from "./deadlock/deadlock-manager";
import type { PlanningGrid } from "./coordination/space-time-planner";
import { validateRobotTransition } from "./robots/robot-lifecycle";
import type { CompiledScenario, MissionSpec, RobotSpec } from "./scenario";
import { getCompiledScenario, hasScenario } from "./scenarios";
import { cellKindAt, inBounds, isStationKind, isTraversableKind, isValidPoint, manhattan, samePoint, stationAt } from "./world/layout";

/**
 * The simulation source the UI talks to. Implemented by WarehouseEngine;
 * a future remote engine (WebSocket) can implement the same interface.
 */
export interface SimulationSource {
  readonly scenarioId: string;
  getSnapshot(): SimulationSnapshot;
  step(): SimulationSnapshot;
  reset(): SimulationSnapshot;
  /** Jump to an absolute tick by deterministic replay of the command log. */
  seek(tick: number): SimulationSnapshot;
  dispatch(command: EngineCommand): CommandResult;
}

export interface EngineOptions {
  /** Run checkInvariants after every mutation and throw on violation. */
  readonly checkInvariants?: boolean;
  /** Deadlock detection / recovery settings (recovery on by default). */
  readonly deadlock?: DeadlockOptions;
  /** Package-recovery settings after robot failures (auto-dispatch on by default). */
  readonly recovery?: RecoveryOptions;
}

// ---------------------------------------------------------------- tuning

const MAX_EVENTS = 300;
const MAX_MOVEMENTS = 400;
const MAX_FINISHED_MISSIONS = 200;
/** Movement priority weights (see priorityOf). */
const MISSION_WEIGHT: Record<MissionPriority, number> = { normal: 10, high: 30, urgent: 60 };
const CARRY_BONUS = 5;
const MAX_AGING = 24;
const MIN_ASSIGN_BATTERY = 15;
const SEEK_CHARGE_BELOW = 25;
const CHARGE_UNTIL = 90;
const CHARGE_RESUME_BELOW = 95;
const DRAIN_MOVE = 0.04;
const DRAIN_WORK = 0.01;
const DRAIN_IDLE = 0.004;
const CHARGE_RATE = 1;
/** Movement priority bonus for a robot on its way to recover a stranded package. */
const RESCUE_BONUS = 3;
/** Ticks a route change stays visible on the robot (routeEvent). */
const ROUTE_EVENT_TTL = 10;

// --------------------------------------------------------------- runtime

interface RobotRuntime {
  readonly spec: RobotSpec;
  readonly rank: number;
  position: GridPoint;
  previousPosition: GridPoint;
  heading: Heading;
  status: RobotStatus;
  action: RobotAction;
  battery: number;
  missionId: string | null;
  packageId: string | null;
  goal: GridPoint | null;
  goalStationId: string | null;
  /** Charger chosen for a low-battery top-up, if any. */
  chargerId: string | null;
  dwell: number;
  blockedTicks: number;
  noPathAnnounced: boolean;
  lowBatteryFlag: boolean;
  note: string | null;
  /** Package-recovery job: go to `approachCell` beside the failed holder and take over `packageId`. */
  rescue: { taskId: string; packageId: string; approachCell: number } | null;
  /** Remaining ticks of a restoration (status "recovering"). */
  restoreTicks: number;
  routeEvent: RouteEvent | null;
  stats: { movingTicks: number; waitingTicks: number; busyTicks: number; distance: number; deliveries: number; replans: number };
}

type TargetKind = "pickup" | "dropoff" | "home" | "charger" | "hold" | "rescue";

interface Target {
  readonly kind: TargetKind;
  readonly cell: GridPoint;
  readonly stationId: string | null;
  readonly action: RobotAction;
}

const pad = (n: number, width = 6) => String(n).padStart(width, "0");

function headingFromDelta(from: GridPoint, to: GridPoint, fallback: Heading): Heading {
  if (to.x > from.x) return "E";
  if (to.x < from.x) return "W";
  if (to.y > from.y) return "S";
  if (to.y < from.y) return "N";
  return fallback;
}

const clampBattery = (v: number) => Math.min(100, Math.max(0, v));

/**
 * Deterministic, command-driven warehouse simulation.
 *
 * Tick order (fixed):
 *   1. tick += 1
 *   2. scenario-scheduled world commands for this tick
 *   3. seeded mission feed (skips stations blocked by failed robots)
 *   4. assignment: queued missions (most urgent first) → nearest available
 *      robot by cached static distance, ties by rank
 *   5. prepare: station handling, goals, arrivals — no movement
 *   6. coordinate: prioritised space-time planning over the reservation table
 *   7. commit: resolveMoves() checks the whole fleet's moves at once
 *   8. apply moves, arrivals, waits; promote coordinator decisions to events
 *   9. logged user commands for this tick (replay only)
 *  10. invariant check (outside production)
 *
 * Every committed move was reserved in the time-indexed reservation table
 * (cells + directed edges), so cell collisions and head-on swaps are
 * prevented at planning time and checked again at commit time. Deadlock
 * detection and failure recovery are Mission 004.
 */
export class WarehouseEngine implements SimulationSource {
  private scenario: CompiledScenario;
  private readonly checking: boolean;
  private log: LoggedCommand[] = [];
  private playbackEvents: SimEvent[] = [];
  private playbackSeq = 0;
  private running = false;

  // World state — rebuilt by initialise()
  private tick = 0;
  private robots: RobotRuntime[] = [];
  private missions = new Map<string, Mission>();
  private packages = new Map<string, Package>();
  private closures: Closure[] = [];
  /** Closed cell index → closure id. */
  private closedCells = new Map<number, string>();
  private coordinator!: Coordinator;
  private grid!: PlanningGrid;
  /** Movement target per robot for the current tick (set in prepare). */
  private currentTarget = new Map<string, Target>();
  private readonly deadlockOptions: DeadlockOptions;
  private deadlocks!: DeadlockManager;
  /** Active yield orders: robot → holding cell (deadlock recovery). */
  private yields = new Map<string, { incidentId: string; holdingCell: number }>();
  /** Yielders that must be planned first on the next tick. */
  private freshYields = new Set<string>();
  /** Bumped whenever the warehouse changes in a way that could unblock a failed recovery. */
  private worldVersion = 0;
  private readonly recoveryOptions: RecoveryOptions;
  private recovery!: RecoveryManager;
  /** Robots whose route was invalidated by a world change, with the cause; reported once replanned. */
  private pendingReplan = new Map<string, string>();
  /** Missions requeued because their robot failed: mission → failed robot. */
  private reassignFrom = new Map<string, string>();
  private events: SimEvent[] = [];
  private movements: MovementRecord[] = [];
  private deliveryTicks: number[] = [];
  private eventSeq = 0;
  private missionSeq = 0;
  private packageSeq = 0;
  private closureSeq = 0;
  private prng = new Prng(1);
  private unreachableAnnounced = new Set<string>();
  private snapshot: SimulationSnapshot | null = null;

  constructor(scenario: CompiledScenario, options: EngineOptions = {}) {
    this.scenario = scenario;
    this.checking = options.checkInvariants ?? process.env.NODE_ENV !== "production";
    this.deadlockOptions = options.deadlock ?? {};
    this.recoveryOptions = options.recovery ?? {};
    this.initialise();
    this.verify();
  }

  get scenarioId(): string {
    return this.scenario.definition.id;
  }

  // ============================================================ public API

  getSnapshot(): SimulationSnapshot {
    this.snapshot ??= this.buildSnapshot();
    return this.snapshot;
  }

  step(): SimulationSnapshot {
    this.advance();
    this.replayLogged(this.tick);
    this.verify();
    return this.getSnapshot();
  }

  reset(): SimulationSnapshot {
    this.log = [];
    this.playbackEvents = [];
    this.playbackSeq = 0;
    this.running = false;
    this.initialise();
    this.verify();
    return this.getSnapshot();
  }

  seek(tick: number): SimulationSnapshot {
    const target = Math.max(0, Math.floor(Number.isFinite(tick) ? tick : 0));
    if (target < this.tick) {
      this.initialise();
      this.replayLogged(0);
    }
    while (this.tick < target) {
      this.advance();
      this.replayLogged(this.tick);
    }
    this.running = false;
    this.playbackEvents = this.playbackEvents.filter((e) => e.tick <= target);
    this.invalidate();
    this.verify();
    return this.getSnapshot();
  }

  dispatch(command: EngineCommand): CommandResult {
    switch (command.type) {
      case "start":
        if (this.running) return err("already-running", "Simulation is already running");
        this.running = true;
        this.emitPlayback("simulation-started", "Simulation started");
        return ok({ message: `Started at tick ${this.tick}` });
      case "pause":
        if (!this.running) return err("not-running", "Simulation is not running");
        this.running = false;
        this.emitPlayback("simulation-paused", "Simulation paused");
        return ok({ message: `Paused at tick ${this.tick}` });
      case "step":
        if (this.running) return err("already-running", "Pause the simulation before stepping");
        this.step();
        return ok({ message: `Stepped to tick ${this.tick}` });
      case "reset":
        this.reset();
        return ok({ message: "Reset to tick 0" });
      case "load-scenario": {
        if (!hasScenario(command.scenarioId)) {
          return err("unknown-scenario", `Unknown scenario "${command.scenarioId}"`);
        }
        this.scenario = getCompiledScenario(command.scenarioId);
        this.reset();
        return ok({ message: `Loaded ${this.scenario.definition.name}`, entityId: command.scenarioId });
      }
      case "select-robot": {
        const robot = this.robotById(command.robotId);
        if (!robot) return err("unknown-robot", `Unknown robot "${command.robotId}"`);
        return ok({ message: `Selected ${robot.spec.id}`, entityId: robot.spec.id });
      }
      default: {
        if (!isWorldCommand(command)) return err("invalid-tick", "Unsupported command");
        const result = this.applyWorld(command);
        if (result.ok) {
          // A new command rewrites the future: drop logged commands after now.
          this.log = this.log.filter((entry) => entry.tick <= this.tick);
          this.log.push({ tick: this.tick, command });
          this.invalidate();
          this.verify();
        }
        return result;
      }
    }
  }

  /** Commands applied so far (for debugging and tests). */
  getCommandLog(): readonly LoggedCommand[] {
    return this.log;
  }

  // ========================================================== tick engine

  private initialise(): void {
    const { definition } = this.scenario;
    this.tick = 0;
    this.prng = new Prng(definition.seed);
    this.missions = new Map();
    this.packages = new Map();
    this.closures = [];
    this.closedCells = new Map();
    this.events = [];
    this.movements = [];
    this.deliveryTicks = [];
    this.eventSeq = 0;
    this.missionSeq = 0;
    this.packageSeq = 0;
    this.closureSeq = 0;
    this.unreachableAnnounced = new Set();

    const specs = [...definition.robots].sort((a, b) => a.id.localeCompare(b.id));
    this.robots = specs.map((spec, rank) => ({
      spec,
      rank,
      position: spec.start ?? spec.home,
      previousPosition: spec.start ?? spec.home,
      heading: spec.heading,
      status: "idle",
      action: "none",
      battery: spec.battery,
      missionId: null,
      packageId: null,
      goal: null,
      goalStationId: null,
      chargerId: null,
      dwell: 0,
      blockedTicks: 0,
      noPathAnnounced: false,
      lowBatteryFlag: spec.battery < LOW_BATTERY_THRESHOLD,
      note: null,
      rescue: null,
      restoreTicks: 0,
      routeEvent: null,
      stats: { movingTicks: 0, waitingTicks: 0, busyTicks: 0, distance: 0, deliveries: 0, replans: 0 },
    }));

    const layout = this.scenario.layout;
    this.grid = {
      width: layout.width,
      height: layout.height,
      passable: (cell, isGoal) => {
        const kind = layout.cells[cell];
        if (!isTraversableKind(kind) || this.closedCells.has(cell)) return false;
        return isGoal || !isStationKind(kind);
      },
    };
    this.coordinator = new Coordinator(this.grid);
    this.coordinator.reset(
      this.robots.map((r) => ({
        id: r.spec.id,
        rank: r.rank,
        cell: this.cellIndex(r.position),
        goal: this.cellIndex(r.position),
        priority: 0,
        mode: "mobile" as const,
      })),
    );
    this.currentTarget = new Map();
    this.deadlocks = new DeadlockManager(this.deadlockOptions);
    this.yields = new Map();
    this.freshYields = new Set();
    this.worldVersion = 0;
    this.recovery = new RecoveryManager(this.recoveryOptions);
    this.pendingReplan = new Map();
    this.reassignFrom = new Map();

    this.emit("scenario-loaded", "info", `Scenario "${definition.name}" loaded`);
    for (const job of definition.missions) this.createMissionInternal(job);
    this.invalidate();
  }

  private advance(): void {
    this.tick += 1;
    const planTick = this.tick - 1;
    for (const entry of this.scenario.definition.schedule ?? []) {
      if (entry.tick !== this.tick) continue;
      const result = this.applyWorld(entry.command);
      if (!result.ok) this.emit("robot-no-path", "warning", `Scheduled ${entry.command.type} failed: ${result.error.message}`);
    }
    this.runFeed();
    // Stranded packages get a rescuer before new missions take the free robots.
    this.runRecovery();
    this.assignMissions();

    // Phase 1 — station work, goals and arrivals (no movement yet).
    for (const robot of this.robots) robot.previousPosition = robot.position;
    const modes = new Map<string, CoordMode>();
    for (const robot of this.robots) modes.set(robot.spec.id, this.prepare(robot));

    // Phase 2 — cooperative planning in priority order (yielders first).
    const recovering = this.deadlocks.recoveringRobots();
    const intents = this.coordinator.plan(
      planTick,
      this.robots.map((robot) => ({
        id: robot.spec.id,
        rank: robot.rank,
        cell: this.cellIndex(robot.position),
        goal: robot.goal ? this.cellIndex(robot.goal) : this.cellIndex(robot.position),
        priority: this.priorityOf(robot),
        mode: modes.get(robot.spec.id)!,
        goalDwell: this.goalDwell(robot),
        recoveryFirst: this.freshYields.has(robot.spec.id),
        noPreempt: recovering.has(robot.spec.id),
      })),
    );
    this.freshYields.clear();
    this.reportReplans(modes);

    // Phase 3 — commit-time conflict check for the whole fleet at once.
    const resolution = resolveMoves(intents);
    this.coordinator.committed(this.tick, resolution.rejected);

    // Phase 4 — apply moves, arrivals and waits.
    for (const robot of this.robots) {
      const mode = modes.get(robot.spec.id)!;
      if (mode !== "mobile") continue;
      const view = this.coordinator.robotView(robot.spec.id, this.tick);
      const target = robot.goal;
      const final = this.cellPoint(resolution.final.get(robot.spec.id)!);
      if (!samePoint(final, robot.position)) {
        this.moveTo(robot, final);
        robot.blockedTicks = 0;
        robot.noPathAnnounced = false;
        const t = this.currentTarget;
        const arrived = t.get(robot.spec.id);
        // Arrive only where the plan ends (the coordinator holds the cell for us).
        const planEnds = view.plan.every((step) => step.cell === this.cellIndex(robot.position));
        if (arrived && samePoint(robot.position, arrived.cell) && planEnds) this.arrive(robot, arrived);
      } else if (target && !samePoint(robot.position, target)) {
        this.waiting(robot, view);
      }
    }
    this.promoteDecisions();
    // Phase 5 — deadlock detection and recovery decisions for the next tick.
    this.runDeadlocks();
    for (const robot of this.robots) this.updateBatteryFlag(robot);
    this.invalidate();
  }

  /** Phase 1 for one robot. Returns its coordination mode for this tick. */
  private prepare(robot: RobotRuntime): CoordMode {
    this.currentTarget.delete(robot.spec.id);
    if (robot.status === "failed") return "failed";
    if (robot.status === "recovering") {
      robot.restoreTicks -= 1;
      if (robot.restoreTicks > 0) {
        robot.note = `Restoring · ${robot.restoreTicks} tick${robot.restoreTicks === 1 ? "" : "s"} left`;
        return "failed";
      }
      this.completeRestore(robot);
    }

    if (robot.dwell > 0) {
      robot.dwell -= 1;
      robot.stats.busyTicks += 1;
      robot.battery = clampBattery(robot.battery - DRAIN_WORK);
      if (robot.dwell === 0) this.completeDwell(robot);
      robot.goal = null;
      return "dwelling";
    }

    // Deadlock recovery: a yielding robot heads for (or stays at) its holding position.
    const yieldOrder = this.yields.get(robot.spec.id);
    if (yieldOrder) {
      const hold = this.cellPoint(yieldOrder.holdingCell);
      robot.goal = hold;
      robot.goalStationId = null;
      robot.action = "yielding";
      if (samePoint(robot.position, hold)) {
        this.setStatus(robot, "waiting");
        robot.blockedTicks = 0;
        robot.note = `Yielding (${yieldOrder.incidentId}) at holding position`;
      }
      return "mobile";
    }

    const target = this.targetFor(robot);
    robot.goal = target?.cell ?? null;
    robot.goalStationId = target?.stationId ?? null;
    if (!target) {
      this.rest(robot);
      return "mobile"; // may still be asked to make way
    }
    robot.action = target.action;
    if (samePoint(robot.position, target.cell)) {
      this.arrive(robot, target);
      if (robot.dwell > 0) {
        robot.goal = null;
        return "dwelling";
      }
      robot.goal = null;
      return "mobile";
    }
    this.currentTarget.set(robot.spec.id, target);
    return "mobile";
  }

  /** Ticks the robot will handle at its current goal station, if it is one. */
  private goalDwell(robot: RobotRuntime): number | undefined {
    const target = this.currentTarget.get(robot.spec.id);
    if (target?.kind === "rescue") return this.recovery.handoverTicks;
    if (target?.kind === "pickup") return this.scenario.definition.handling.loadTicks;
    if (target?.kind === "dropoff") return this.scenario.definition.handling.unloadTicks;
    return undefined;
  }

  /** Movement priority: mission urgency, then carrying, then aging while waiting. */
  private priorityOf(robot: RobotRuntime): number {
    if (robot.status === "failed" || robot.status === "recovering") return 0;
    if (robot.rescue) {
      const stranded = this.missions.get(this.pkg(robot.rescue.packageId).missionId);
      return (stranded ? MISSION_WEIGHT[stranded.priority] : MISSION_WEIGHT.normal) + RESCUE_BONUS + Math.min(robot.blockedTicks * 2, MAX_AGING);
    }
    const mission = robot.missionId ? this.missions.get(robot.missionId) : undefined;
    if (!mission) return Math.min(robot.blockedTicks, 4);
    return MISSION_WEIGHT[mission.priority] + (robot.packageId ? CARRY_BONUS : 0) + Math.min(robot.blockedTicks * 2, MAX_AGING);
  }

  private waiting(robot: RobotRuntime, view: RobotCoordination): void {
    robot.blockedTicks = view.waitStreak;
    robot.stats.waitingTicks += 1;
    robot.battery = clampBattery(robot.battery - DRAIN_IDLE);
    this.setStatus(robot, "waiting");
    if (view.state === "no-route") {
      robot.note = `No route to ${robot.goalStationId ?? "its goal"} (closure or sealed area)`;
      if (robot.missionId) {
        const mission = this.missions.get(robot.missionId)!;
        if (mission.state === "to-pickup") this.setMission(mission.id, "assigned");
        if (mission.state === "to-dropoff") this.setMission(mission.id, "carrying");
      }
      if (!robot.noPathAnnounced) {
        robot.noPathAnnounced = true;
        this.emit("robot-no-path", "warning", `${robot.spec.id} has no route to ${robot.goalStationId ?? "its goal"}`, {
          robotId: robot.spec.id,
          missionId: robot.missionId ?? undefined,
        });
      }
      return;
    }
    robot.note = view.waitingFor
      ? `Waiting: best next cell is reserved by ${view.waitingFor}`
      : view.state === "blocked"
        ? "Holding: no safe move this tick"
        : "Waiting for a safe opening";
    if (robot.blockedTicks === BLOCKED_ALERT_TICKS) {
      this.emit(
        "robot-waiting",
        "warning",
        `${robot.spec.id} waiting ${robot.blockedTicks} ticks${view.waitingFor ? ` for ${view.waitingFor} (reservation)` : ""}`,
        { robotId: robot.spec.id, missionId: robot.missionId ?? undefined },
      );
    }
  }

  /** Phase 5: feed the tick's outcome to the deadlock manager and apply its decisions. */
  private runDeadlocks(): void {
    const layout = this.scenario.layout;
    const occupant = new Map(this.robots.map((r) => [this.cellIndex(r.position), r.spec.id]));
    const holder = new Map(this.coordinator.table.listHolds().map((h) => [h.cell, h.robotId]));
    const inputs = this.robots.map((robot) => {
      const id = robot.spec.id;
      const view = this.coordinator.robotView(id, this.tick);
      const cell = this.cellIndex(robot.position);
      const goal = robot.goal ? this.cellIndex(robot.goal) : cell;
      const mission = robot.missionId ? this.missions.get(robot.missionId) : undefined;
      const fullRoute = goal === cell ? [] : this.coordinator.staticRoute(goal, cell, 80);
      const planned: number[] = [];
      for (const step of view.plan) if (planned.at(-1) !== step.cell && step.cell !== cell) planned.push(step.cell);
      return {
        id,
        rank: robot.rank,
        cell,
        goal,
        mode: (robot.status === "failed" || robot.status === "recovering" ? "failed" : robot.dwell > 0 ? "dwelling" : "mobile") as "failed" | "dwelling" | "mobile",
        waiting: robot.status === "waiting" && !this.yields.has(id),
        waitStreak: robot.status === "waiting" ? robot.blockedTicks : 0,
        reservationBlocker: view.waitingFor,
        hasMission: (mission !== undefined && isActiveMission(mission.state)) || robot.rescue !== null,
        missionWeight: mission ? MISSION_WEIGHT[mission.priority] : robot.rescue ? MISSION_WEIGHT.normal + RESCUE_BONUS : 0,
        carrying: robot.packageId !== null,
        onNarrow: layout.cells[cell] === "narrow",
        distanceToGoal: goal === cell ? 0 : this.coordinator.distance(goal, cell),
        routeAhead: fullRoute.slice(0, 8),
        fullRoute,
        planComplete: view.planStatus === "complete",
        plannedRoute: planned,
      };
    });

    const update = this.deadlocks.update({
      tick: this.tick,
      robots: inputs,
      occupant,
      holder,
      worldVersion: this.worldVersion,
      findHolding: (robotId, protectedCells) => this.findHolding(robotId, protectedCells, occupant),
    });

    for (const id of update.release) {
      if (this.deadlocks.activeYields().has(id)) continue; // still holding for another attempt
      this.yields.delete(id);
      this.coordinator.invalidate(id);
      const robot = this.robotById(id);
      if (robot) robot.note = "Yield complete; resuming its own goal";
    }
    for (const order of update.start) {
      this.yields.set(order.yielderId, { incidentId: order.incidentId, holdingCell: order.holdingCell });
      this.freshYields.add(order.yielderId);
      this.coordinator.prepareRecovery(
        this.tick,
        order.yielderId,
        order.group.map((id) => ({ id, cell: this.cellIndex(this.robotById(id)!.position) })),
      );
      const robot = this.robotById(order.yielderId)!;
      robot.stats.replans += 1;
      robot.note = `Yielding (${order.incidentId}): moving to a holding position`;
    }
    for (const e of update.events) {
      this.emit(e.kind, e.severity, e.message, {
        robotId: e.robotId,
        robotIds: e.robotIds,
        incidentId: e.incidentId,
        attempt: e.attempt,
        cell: e.cell !== undefined ? this.cellPoint(e.cell) : undefined,
        action: e.action,
        status: e.status,
      });
    }
  }

  /**
   * Nearest safe holding position for a yielding robot: BFS (N, E, S, W)
   * through traversable, non-station, open cells not occupied by another
   * robot, returning the first cell outside `protectedCells` that nobody else
   * holds or has reserved. Bounded to 30 steps.
   */
  private findHolding(robotId: string, protectedCells: ReadonlySet<number>, occupant: ReadonlyMap<number, string>): { cell: number; route: number[] } | null {
    const robot = this.robotById(robotId)!;
    const start = this.cellIndex(robot.position);
    const { width, height } = this.scenario.layout;
    const parent = new Map<number, number>([[start, -1]]);
    const depth = new Map<number, number>([[start, 0]]);
    const queue = [start];
    while (queue.length > 0) {
      const cell = queue.shift()!;
      if (cell !== start && !protectedCells.has(cell) && this.coordinator.table.canHoldFrom(robotId, this.tick + 1, cell)) {
        const route: number[] = [];
        for (let c = cell; c !== start; c = parent.get(c)!) route.push(c);
        return { cell, route: route.reverse() };
      }
      if (depth.get(cell)! >= 30) continue;
      const x = cell % width;
      const y = (cell - x) / width;
      const next = [
        y > 0 ? cell - width : -1,
        x < width - 1 ? cell + 1 : -1,
        y < height - 1 ? cell + width : -1,
        x > 0 ? cell - 1 : -1,
      ];
      for (const n of next) {
        if (n < 0 || parent.has(n)) continue;
        if (!this.grid.passable(n, false)) continue;
        const other = occupant.get(n);
        if (other !== undefined && other !== robotId) continue;
        parent.set(n, cell);
        depth.set(n, depth.get(cell)! + 1);
        queue.push(n);
      }
    }
    return null;
  }

  /** Coordinator decisions that matter to operators become engine events. */
  private promoteDecisions(): void {
    for (const d of this.coordinator.decisionsAt(this.tick)) {
      if (d.kind === "preempt") {
        this.emit("right-of-way", "info", d.message, { robotId: d.robotId });
        const robot = this.robotById(d.robotId);
        if (robot) robot.stats.replans += 1;
      } else if (d.kind === "yield") {
        const robot = this.robotById(d.robotId);
        if (robot) robot.stats.replans += 1;
      } else if (d.kind === "commit-reject") {
        this.emit("conflict-prevented", "warning", d.message, { robotId: d.robotId });
      }
    }
  }

  private replayLogged(tick: number): void {
    for (const entry of this.log) {
      if (entry.tick === tick) this.applyWorld(entry.command);
    }
    this.invalidate();
  }

  private runFeed(): void {
    const feed = this.scenario.definition.feed;
    if (!feed || this.tick % feed.intervalTicks !== 0 || feed.routes.length === 0) return;
    const blocked = (m: { pickup: string; dropoff: string }) =>
      this.failedRobotAt(this.station(m.pickup).position) !== null || this.failedRobotAt(this.station(m.dropoff).position) !== null;
    let open = 0;
    for (const m of this.missions.values()) {
      if (m.state !== "queued" && !isActiveMission(m.state)) continue;
      if (m.state === "queued" && blocked({ pickup: m.pickupStationId, dropoff: m.dropoffStationId })) continue;
      open += 1;
    }
    if (open >= feed.maxOpen) return;
    // Upstream stops sending jobs to stations blocked by a failed robot.
    const routes = feed.routes.filter((r) => !blocked(r));
    if (routes.length === 0) return;
    const route = routes[this.prng.int(routes.length)];
    let priority: MissionPriority = route.priority ?? "normal";
    if (feed.priorityMix) {
      const roll = this.prng.next();
      if (roll < feed.priorityMix.urgent) priority = "urgent";
      else if (roll < feed.priorityMix.urgent + feed.priorityMix.high) priority = "high";
    }
    this.createMissionInternal({ ...route, priority });
  }

  /**
   * Queued missions, most urgent first then oldest, each go to the available
   * robot with the shortest static distance to the pickup (ties: lower rank).
   * Distances come from cached BFS maps, not per-robot searches.
   */
  private assignMissions(): void {
    const queued = [...this.missions.values()]
      .filter((m) => m.state === "queued")
      .sort((a, b) => MISSION_WEIGHT[b.priority] - MISSION_WEIGHT[a.priority] || a.createdTick - b.createdTick || a.id.localeCompare(b.id));
    for (const mission of queued) {
      const candidates = this.robots.filter(
        (r) =>
          r.status !== "failed" &&
          r.status !== "recovering" &&
          r.missionId === null &&
          r.rescue === null &&
          r.dwell === 0 &&
          r.battery >= MIN_ASSIGN_BATTERY,
      );
      if (candidates.length === 0) return;
      const pickup = this.station(mission.pickupStationId);
      const blockedBy = this.failedRobotAt(pickup.position) ?? this.failedRobotAt(this.station(mission.dropoffStationId).position);
      if (blockedBy) {
        if (!this.unreachableAnnounced.has(mission.id)) {
          this.unreachableAnnounced.add(mission.id);
          this.emit("robot-no-path", "warning", `${mission.id} held in queue: a station on its route is blocked by failed ${blockedBy}`, {
            missionId: mission.id,
            robotId: blockedBy,
          });
        }
        continue;
      }
      const goal = this.cellIndex(pickup.position);
      let best: { robot: RobotRuntime; cost: number } | null = null;
      for (const robot of candidates) {
        const cost = this.coordinator.distance(goal, this.cellIndex(robot.position));
        if (cost < 0) continue;
        if (!best || cost < best.cost || (cost === best.cost && robot.rank < best.robot.rank)) best = { robot, cost };
      }
      if (!best) {
        if (!this.unreachableAnnounced.has(mission.id)) {
          this.unreachableAnnounced.add(mission.id);
          this.emit("robot-no-path", "warning", `${mission.id}: no available robot can reach ${mission.pickupStationId}`, {
            missionId: mission.id,
            stationId: mission.pickupStationId,
          });
        }
        continue;
      }
      const { robot } = best;
      this.setMission(mission.id, "assigned", { robotId: robot.spec.id, assignedTick: this.tick });
      this.setPackage(this.expect(reservePackage(this.pkg(mission.packageId), robot.spec.id, this.tick)));
      robot.missionId = mission.id;
      robot.chargerId = null;
      robot.goal = pickup.position;
      robot.goalStationId = pickup.id;
      robot.action = "travel-to-pickup";
      robot.blockedTicks = 0;
      robot.noPathAnnounced = false;
      this.coordinator.invalidate(robot.spec.id);
      this.emit(
        "mission-assigned",
        "info",
        `${mission.id}${mission.priority !== "normal" ? ` (${mission.priority})` : ""} assigned to ${robot.spec.id} (${mission.pickupStationId} → ${mission.dropoffStationId}, ${best.cost} cells)`,
        { robotId: robot.spec.id, missionId: mission.id, packageId: mission.packageId },
      );
      const failedId = this.reassignFrom.get(mission.id);
      if (failedId) {
        this.reassignFrom.delete(mission.id);
        this.emit("robot_recovery_completed", "success", `${failedId}'s ${mission.id} reassigned to ${robot.spec.id}; nothing was lost`, {
          robotId: failedId,
          robotIds: [failedId, robot.spec.id],
          missionId: mission.id,
          packageId: mission.packageId,
          action: "mission-reassigned",
          status: "completed",
        });
      }
    }
  }

  private targetFor(robot: RobotRuntime): Target | null {
    if (robot.rescue) {
      return { kind: "rescue", cell: this.cellPoint(robot.rescue.approachCell), stationId: null, action: "travel-to-recovery" };
    }
    if (robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      if (mission.state === "assigned" || mission.state === "to-pickup") {
        const s = this.station(mission.pickupStationId);
        return { kind: "pickup", cell: s.position, stationId: s.id, action: "travel-to-pickup" };
      }
      if (mission.state === "carrying" || mission.state === "to-dropoff") {
        const s = this.station(mission.dropoffStationId);
        return { kind: "dropoff", cell: s.position, stationId: s.id, action: "travel-to-dropoff" };
      }
      return null;
    }

    // Low battery: top up at a free charger before going home.
    const homeIsCharger = cellKindAt(this.scenario.layout, robot.spec.home) === "charger";
    if (!homeIsCharger) {
      if (robot.chargerId === null && robot.battery < SEEK_CHARGE_BELOW) robot.chargerId = this.freeCharger(robot);
      if (robot.chargerId !== null) {
        if (robot.battery >= CHARGE_UNTIL) robot.chargerId = null;
        else {
          const s = this.station(robot.chargerId);
          return { kind: "charger", cell: s.position, stationId: s.id, action: "travel-to-charger" };
        }
      }
    }
    if (!samePoint(robot.position, robot.spec.home)) {
      return { kind: "home", cell: robot.spec.home, stationId: stationAt(this.scenario.layout, robot.spec.home)?.id ?? null, action: "return-home" };
    }
    return null;
  }

  private freeCharger(robot: RobotRuntime): string | null {
    // A charger is free if nobody is on it, nobody is heading to it, and — if
    // it is another robot's home — that robot is out working on a mission.
    const unavailable = (station: Station) =>
      this.robots.some(
        (r) =>
          r !== robot &&
          (samePoint(r.position, station.position) ||
            r.chargerId === station.id ||
            (samePoint(r.spec.home, station.position) && r.missionId === null)),
      );
    const chargers = this.scenario.layout.stations.filter((s) => s.kind === "charger" && !unavailable(s));
    let best: { id: string; cost: number } | null = null;
    for (const charger of chargers) {
      const cost = this.coordinator.distance(this.cellIndex(charger.position), this.cellIndex(robot.position));
      if (cost >= 0 && (!best || cost < best.cost)) best = { id: charger.id, cost };
    }
    return best?.id ?? null;
  }

  private arrive(robot: RobotRuntime, target: Target): void {
    robot.blockedTicks = 0;
    const handling = this.scenario.definition.handling;
    if (target.kind === "rescue" && robot.rescue) {
      const task = this.recovery.openTaskFor(robot.rescue.packageId);
      robot.dwell = this.recovery.handoverTicks;
      this.setStatus(robot, "loading");
      robot.action = "handover";
      robot.note = `Taking over ${robot.rescue.packageId} from ${task?.failedRobotId ?? "the failed robot"}`;
      this.recovery.onArrived(robot.rescue.taskId);
      return;
    }
    if (target.kind === "pickup") {
      const mission = this.missions.get(robot.missionId!)!;
      this.setMission(mission.id, "picking-up");
      robot.dwell = handling.loadTicks;
      this.setStatus(robot, "loading");
      robot.action = "loading";
      robot.note = `Loading ${mission.packageId} at ${target.stationId}`;
      this.emit("pickup-started", "info", `${robot.spec.id} loading ${mission.packageId} at ${target.stationId}`, {
        robotId: robot.spec.id,
        missionId: mission.id,
        packageId: mission.packageId,
        stationId: target.stationId ?? undefined,
      });
      return;
    }
    if (target.kind === "dropoff") {
      const mission = this.missions.get(robot.missionId!)!;
      this.setMission(mission.id, "dropping-off");
      robot.dwell = handling.unloadTicks;
      this.setStatus(robot, "unloading");
      robot.action = "unloading";
      robot.note = `Unloading ${mission.packageId} at ${target.stationId}`;
      this.emit("dropoff-started", "info", `${robot.spec.id} unloading ${mission.packageId} at ${target.stationId}`, {
        robotId: robot.spec.id,
        missionId: mission.id,
        packageId: mission.packageId,
        stationId: target.stationId ?? undefined,
      });
      return;
    }
    if (!samePoint(robot.position, robot.previousPosition)) {
      // Arrived home or at a charger this tick; rest from the next tick on.
      robot.note = target.kind === "charger" ? `Docked at ${target.stationId}` : "Parked at home";
      return;
    }
    this.rest(robot);
  }

  private rest(robot: RobotRuntime): void {
    robot.blockedTicks = 0;
    const onCharger = cellKindAt(this.scenario.layout, robot.position) === "charger";
    // Hysteresis: start below CHARGE_RESUME_BELOW, continue to 100 %.
    const wantsCharge = robot.status === "charging" ? robot.battery < 100 : robot.battery < CHARGE_RESUME_BELOW;
    if (onCharger && wantsCharge) {
      if (robot.status !== "charging") {
        this.emit("robot-charging", "info", `${robot.spec.id} charging at ${stationAt(this.scenario.layout, robot.position)?.id}`, {
          robotId: robot.spec.id,
        });
      }
      this.setStatus(robot, "charging");
      robot.action = "charging";
      robot.battery = clampBattery(robot.battery + CHARGE_RATE);
      robot.note = `Charging · ${Math.round(robot.battery)}%`;
      if (robot.chargerId && robot.battery >= CHARGE_UNTIL) robot.chargerId = null;
      return;
    }
    this.setStatus(robot, "idle");
    robot.action = "none";
    robot.battery = clampBattery(robot.battery - DRAIN_IDLE);
    robot.note = samePoint(robot.position, robot.spec.home) ? "Parked at home" : null;
  }

  private completeDwell(robot: RobotRuntime): void {
    if (robot.action === "handover" && robot.rescue) {
      this.completeHandover(robot);
      return;
    }
    const mission = this.missions.get(robot.missionId!)!;
    const here = stationAt(this.scenario.layout, robot.position)?.id ?? null;
    if (robot.status === "loading") {
      this.setPackage(this.expect(pickUpPackage(this.pkg(mission.packageId), robot.spec.id, here, this.tick)));
      robot.packageId = mission.packageId;
      this.setMission(mission.id, "carrying", { pickedTick: this.tick });
      this.setStatus(robot, "carrying");
      robot.action = "travel-to-dropoff";
      robot.note = `Carrying ${mission.packageId} to ${mission.dropoffStationId}`;
      this.emit("package-picked-up", "info", `${robot.spec.id} picked up ${mission.packageId} at ${here}`, {
        robotId: robot.spec.id,
        missionId: mission.id,
        packageId: mission.packageId,
        stationId: here ?? undefined,
      });
      return;
    }
    // Unloading complete: the only path to "completed".
    this.setPackage(this.expect(deliverPackage(this.pkg(mission.packageId), robot.spec.id, here, this.tick)));
    this.setMission(mission.id, "completed", { completedTick: this.tick });
    robot.packageId = null;
    robot.missionId = null;
    robot.stats.deliveries += 1;
    this.setStatus(robot, "idle");
    robot.action = "return-home";
    robot.note = null;
    this.deliveryTicks.push(this.tick);
    this.emit("package-delivered", "success", `${robot.spec.id} delivered ${mission.packageId} to ${here} (${mission.id})`, {
      robotId: robot.spec.id,
      missionId: mission.id,
      packageId: mission.packageId,
      stationId: here ?? undefined,
    });
    this.pruneFinished();
  }

  private moveTo(robot: RobotRuntime, next: GridPoint): void {
    const from = robot.position;
    robot.heading = headingFromDelta(from, next, robot.heading);
    robot.position = next;
    robot.blockedTicks = 0;
    robot.stats.movingTicks += 1;
    robot.stats.busyTicks += 1;
    robot.stats.distance += 1;
    robot.battery = clampBattery(robot.battery - DRAIN_MOVE);
    this.setStatus(robot, robot.packageId ? "carrying" : "moving");
    robot.note = this.travelNote(robot);
    this.movements.push({ tick: this.tick, robotId: robot.spec.id, from, to: next });
    if (this.movements.length > MAX_MOVEMENTS) this.movements.splice(0, this.movements.length - MAX_MOVEMENTS);

    if (robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      if (mission.state === "assigned") this.setMission(mission.id, "to-pickup");
      if (mission.state === "carrying") this.setMission(mission.id, "to-dropoff");
    }
    if (robot.packageId) {
      const pkg = this.pkg(robot.packageId);
      if (pkg.state === "picked-up") this.setPackage(this.expect(departWithPackage(pkg, robot.spec.id, this.tick)));
    }
  }

  private updateBatteryFlag(robot: RobotRuntime): void {
    if (robot.status === "failed" || robot.status === "recovering") return;
    if (robot.battery < LOW_BATTERY_THRESHOLD && !robot.lowBatteryFlag) {
      robot.lowBatteryFlag = true;
      this.emit("battery-low", "warning", `${robot.spec.id} battery below ${LOW_BATTERY_THRESHOLD}%`, { robotId: robot.spec.id });
    } else if (robot.battery >= LOW_BATTERY_THRESHOLD + 10) {
      robot.lowBatteryFlag = false;
    }
  }

  // ========================================================= world commands

  private applyWorld(command: WorldCommand): CommandResult {
    switch (command.type) {
      case "add-mission":
        return this.addMission(command.pickupStationId, command.dropoffStationId, command.priority);
      case "cancel-mission":
        return this.cancelMission(command.missionId);
      case "close_aisle":
        return this.closeAisle(command.cells, command.label);
      case "reopen_aisle":
        return this.reopenAisle(command.closureId);
      case "fail_robot":
        return this.failRobot(command.robotId, command.failureType ?? "motor", command.reason);
      case "restore_robot":
        return this.restoreRobot(command.robotId);
      case "start_package_recovery":
        return this.startPackageRecovery(command.packageId, command.rescuerId);
      case "complete_package_handover":
        return this.completePackageHandover(command.packageId);
      case "cancel_recovery":
        return this.cancelRecovery(command.packageId);
    }
  }

  private addMission(pickupId: string, dropoffId: string, priority: MissionPriority = "normal"): CommandResult {
    if (!(priority in MISSION_WEIGHT)) return err("invalid-priority", `Unknown mission priority "${String(priority)}"`);
    const pickup = this.scenario.layout.stations.find((s) => s.id === pickupId);
    const dropoff = this.scenario.layout.stations.find((s) => s.id === dropoffId);
    if (!pickup) return err("unknown-station", `Unknown pickup station "${pickupId}"`);
    if (!dropoff) return err("unknown-station", `Unknown drop-off station "${dropoffId}"`);
    if (pickup.kind !== "pickup") return err("invalid-station-kind", `${pickupId} is a ${pickup.kind} station, not a pickup`);
    if (dropoff.kind !== "dropoff") return err("invalid-station-kind", `${dropoffId} is a ${dropoff.kind} station, not a drop-off`);
    this.worldVersion += 1;
    const mission = this.createMissionInternal({ pickup: pickupId, dropoff: dropoffId, priority });
    return ok({ message: `${mission.id} queued (${pickupId} → ${dropoffId}${priority !== "normal" ? `, ${priority}` : ""})`, entityId: mission.id });
  }

  private cancelMission(missionId: string): CommandResult {
    const mission = this.missions.get(missionId);
    if (!mission) return err("unknown-mission", `Unknown mission "${missionId}"`);
    const next = transitionMission(mission, "cancelled", this.tick);
    if (!next.ok) return err("invalid-mission-transition", `${missionId} is ${mission.state} and can no longer be cancelled`);
    this.missions.set(missionId, next.value);
    if (mission.robotId) {
      const pkg = this.pkg(mission.packageId);
      if (pkg.state === "reserved") {
        this.setPackage(this.expect(releaseReservation(pkg, mission.robotId, this.tick, `${missionId} cancelled`)));
      }
      const robot = this.robotById(mission.robotId);
      if (robot && robot.missionId === missionId) {
        robot.missionId = null;
        robot.goal = null;
        robot.goalStationId = null;
        this.coordinator.invalidate(robot.spec.id);
      }
    }
    this.worldVersion += 1;
    this.emit("mission-cancelled", "info", `${missionId} cancelled`, { missionId, robotId: mission.robotId ?? undefined, packageId: mission.packageId });
    return ok({ message: `${missionId} cancelled`, entityId: missionId });
  }

  private closeAisle(cells: readonly GridPoint[], label?: string): CommandResult {
    if (!Array.isArray(cells) || cells.length === 0) return err("empty-closure", "A closure needs at least one cell");
    const layout = this.scenario.layout;
    const unique = new Map<number, GridPoint>();
    for (const cell of cells) {
      if (!isValidPoint(cell) || !inBounds(layout, cell)) {
        return err("invalid-coordinates", `Cell ${JSON.stringify(cell)} is outside the ${layout.width}×${layout.height} warehouse`);
      }
      const kind = cellKindAt(layout, cell)!;
      if (!isTraversableKind(kind)) return err("cell-not-closable", `(${cell.x}, ${cell.y}) is a ${kind} — already impassable`);
      if (isStationKind(kind)) return err("cell-not-closable", `(${cell.x}, ${cell.y}) is a station; stations cannot be closed`);
      const key = this.cellIndex(cell);
      if (this.closedCells.has(key)) return err("already-closed", `(${cell.x}, ${cell.y}) is already closed by ${this.closedCells.get(key)}`);
      unique.set(key, { x: cell.x, y: cell.y });
    }
    this.closureSeq += 1;
    const id = `CL-${String(this.closureSeq).padStart(2, "0")}`;
    const closure: Closure = {
      id,
      cells: [...unique.values()],
      label: label?.trim() || `Closure ${id}`,
      createdTick: this.tick,
    };
    this.closures.push(closure);
    for (const key of unique.keys()) this.closedCells.set(key, id);
    this.worldVersion += 1;
    // Robots standing on a closed cell stay where they are (never moved or removed);
    // they may leave it, and no plan may enter it from now on.
    const occupants = this.robots.filter((r) => unique.has(this.cellIndex(r.position))).map((r) => r.spec.id);
    const affected = this.coordinator.worldChanged((cell) => unique.has(cell), this.tick);
    this.emit(
      "aisle_closed",
      "warning",
      `${id} closed ${unique.size} cell${unique.size > 1 ? "s" : ""}${affected.length ? ` · routes of ${affected.join(", ")} invalidated` : ""}${
        occupants.length ? ` · ${occupants.join(", ")} stay${occupants.length === 1 ? "s" : ""} in place and may only leave; nobody may enter` : ""
      }`,
      { closureId: id, cell: closure.cells[0], robotIds: affected, reason: closure.label },
    );
    const closedCells = [...unique.values()];
    for (const robotId of affected) {
      const robot = this.robotById(robotId)!;
      robot.stats.replans += 1;
      const plan = this.coordinator.robotView(robotId, this.tick).plan;
      const hit = plan.find((step) => unique.has(step.cell));
      this.invalidateRoute(robot, `${id} closed ${hit !== undefined ? this.cellRefOf(hit.cell) : "its route"}`, {
        closureId: id,
        cell: hit !== undefined ? this.cellPoint(hit.cell) : closedCells[0],
      });
    }
    return ok({ message: `${id} closed${occupants.length ? ` (${occupants.join(", ")} on it, held in place)` : ""}`, entityId: id });
  }

  private reopenAisle(closureId: string): CommandResult {
    const closure = this.closures.find((c) => c.id === closureId);
    if (!closure) return err("unknown-closure", `Unknown closure "${closureId}"`);
    // Robots that will get a shorter route (or any route at all) once the cells reopen.
    const before = new Map(
      this.robots
        .filter((r) => r.goal && r.status !== "failed" && r.status !== "recovering")
        .map((r) => [r.spec.id, this.coordinator.distance(this.cellIndex(r.goal!), this.cellIndex(r.position))]),
    );
    this.closures = this.closures.filter((c) => c.id !== closureId);
    for (const cell of closure.cells) this.closedCells.delete(this.cellIndex(cell));
    this.worldVersion += 1;
    this.coordinator.worldChanged(() => false, this.tick);
    const improved: string[] = [];
    for (const [robotId, old] of before) {
      const robot = this.robotById(robotId)!;
      const now = this.coordinator.distance(this.cellIndex(robot.goal!), this.cellIndex(robot.position));
      if (now >= 0 && (old < 0 || now < old)) {
        improved.push(robotId);
        this.coordinator.invalidate(robotId);
        this.pendingReplan.set(robotId, `${closureId} reopened`);
      }
    }
    this.emit(
      "aisle_reopened",
      "info",
      `${closureId} reopened: ${closure.cells.length} cell${closure.cells.length > 1 ? "s" : ""} traversable again${improved.length ? ` · ${improved.join(", ")} ${improved.length === 1 ? "replans a shorter route" : "replan shorter routes"}` : ""}`,
      { closureId, cell: closure.cells[0], robotIds: improved, reason: closure.label },
    );
    return ok({ message: `${closureId} reopened`, entityId: closureId });
  }

  /**
   * Halt a robot. Its work is recovered without losing anything:
   *  - before pickup: the package reservation is released and the mission
   *    requeued for another robot;
   *  - while carrying: the package becomes recovery-required (custody stays
   *    with the failed robot) and a recovery task is opened;
   *  - while rescuing: its rescue attempt ends and another robot is chosen.
   */
  private failRobot(robotId: string, type: FailureType, reason?: string): CommandResult {
    const robot = this.robotById(robotId);
    if (!robot) return err("unknown-robot", `Unknown robot "${robotId}"`);
    if (!FAILURE_TYPES.includes(type)) return err("invalid-failure-type", `Unknown failure type "${String(type)}"`);
    if (robot.status === "failed") return err("robot-unavailable", `${robotId} has already failed`);
    const why = reason?.trim() || FAILURE_LABEL[type];
    if (robot.status === "recovering") this.recovery.abortRestore(robotId);

    // A rescuer never holds custody before the handover: just stand it down.
    let leftTask: string | null = null;
    if (robot.rescue) {
      const { packageId, taskId } = robot.rescue;
      this.recovery.onRescuerFailed(robotId, this.tick);
      this.setPackage(this.expect(assignRescuer(this.pkg(packageId), taskId, null, this.tick, `Rescuer ${robotId} failed (${FAILURE_LABEL[type]}) before the handover`)));
      robot.rescue = null;
      leftTask = taskId;
    }

    this.setStatus(robot, "failed");
    robot.action = "halted";
    // Halts where it stands (also for display: no interpolation from its last cell).
    robot.previousPosition = robot.position;
    robot.dwell = 0;
    robot.goal = null;
    robot.goalStationId = null;
    robot.restoreTicks = 0;
    this.yields.delete(robotId);
    this.worldVersion += 1;
    robot.blockedTicks = 0;
    robot.chargerId = null;
    robot.note = `${FAILURE_LABEL[type]}: ${why}`;
    const failure = this.recovery.recordFailure({
      robotId,
      type,
      reason: why,
      tick: this.tick,
      position: robot.position,
      missionId: robot.missionId,
      packageId: robot.packageId,
    });
    this.emit(
      "robot_failed",
      "critical",
      `${robotId} failed (${FAILURE_LABEL[type]}): ${why} at ${this.cellRefOf(this.cellIndex(robot.position))}${
        robot.packageId ? ` carrying ${robot.packageId}` : robot.missionId ? ` on ${robot.missionId}` : ""
      }${leftTask ? ` · was recovering a package for ${leftTask}; another robot will be selected` : ""}`,
      {
        robotId,
        robotIds: [robotId],
        missionId: robot.missionId ?? undefined,
        packageId: robot.packageId ?? undefined,
        cell: robot.position,
        failureType: type,
        reason: why,
        status: failure.status,
        action: "halt",
        taskId: leftTask ?? undefined,
      },
    );

    if (robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      const pkg = this.pkg(mission.packageId);
      if (mission.state === "assigned" || mission.state === "to-pickup" || mission.state === "picking-up") {
        // Nothing on board yet: give the job to another robot.
        if (pkg.state === "reserved") {
          this.setPackage(this.expect(releaseReservation(pkg, robotId, this.tick, `${robotId} failed before pickup`)));
        }
        this.setMission(mission.id, "queued", { robotId: null, assignedTick: null });
        robot.missionId = null;
        this.reassignFrom.set(mission.id, robotId);
        this.emit("robot_recovery_started", "warning", `${mission.id} requeued: ${robotId} failed before picking up ${mission.packageId}; it will be reassigned`, {
          robotId,
          robotIds: [robotId],
          missionId: mission.id,
          packageId: mission.packageId,
          cell: robot.position,
          action: "requeue-mission",
          status: "pending",
          reason: why,
        });
      } else if (pkg.state === "picked-up" || pkg.state === "in-transit" || pkg.state === "recovery-required") {
        if (pkg.state !== "recovery-required") {
          this.setPackage(this.expect(markRecoveryRequired(pkg, robotId, this.tick, FAILURE_LABEL[type])));
        }
        if (mission.state !== "recovery-required") this.setMission(mission.id, "recovery-required");
        this.openRecovery(robot, mission.id, mission.packageId, why);
      }
    }
    this.requeueMissionsBlockedAt(robot.position, robotId);
    // Release its reservations and hold its cell; robots routed through it replan.
    const affected = this.coordinator.fail(robotId, this.cellIndex(robot.position), this.tick);
    for (const id of affected) {
      this.invalidateRoute(this.robotById(id)!, `${robotId} failed at ${this.cellRefOf(this.cellIndex(robot.position))}`, {
        cell: robot.position,
      });
    }
    return ok({ message: `${robotId} failed (${FAILURE_LABEL[type]})`, entityId: robotId });
  }

  private openRecovery(robot: RobotRuntime, missionId: string, packageId: string, why: string): void {
    const task = this.recovery.openTask(packageId, missionId, robot.spec.id, this.tick);
    this.setPackage(this.expect(assignRescuer(this.pkg(packageId), task.id, null, this.tick, `${task.id} opened to recover ${packageId}`)));
    this.emit(
      "package_recovery_required",
      "critical",
      `${packageId} needs recovery: stranded on failed ${robot.spec.id} at ${this.cellRefOf(this.cellIndex(robot.position))} (${missionId}); custody stays with ${robot.spec.id}`,
      {
        robotId: robot.spec.id,
        robotIds: [robot.spec.id],
        missionId,
        packageId,
        taskId: task.id,
        cell: robot.position,
        action: "hold-custody",
        status: "pending",
        reason: why,
      },
    );
    this.emit("robot_recovery_started", "warning", `${task.id} opened for ${robot.spec.id}: ${packageId} will be handed over to a recovery robot`, {
      robotId: robot.spec.id,
      robotIds: [robot.spec.id],
      missionId,
      packageId,
      taskId: task.id,
      cell: robot.position,
      action: "recover-package",
      status: "pending",
    });
  }

  /** Start restoring a failed robot; it rejoins the fleet after a type-specific delay. */
  private restoreRobot(robotId: string): CommandResult {
    const robot = this.robotById(robotId);
    if (!robot) return err("unknown-robot", `Unknown robot "${robotId}"`);
    if (robot.status !== "failed") return err("robot-not-failed", `${robotId} is ${robot.status}, not failed`);
    const failure = this.recovery.failureOf(robotId);
    const type = failure?.type ?? "motor";
    this.setStatus(robot, "recovering");
    robot.action = "restoring";
    robot.restoreTicks = RESTORE_TICKS[type];
    robot.note = `Restoring · ${robot.restoreTicks} ticks left`;
    this.recovery.beginRestore(robotId, this.tick);
    this.worldVersion += 1;
    // Still holding a stranded package: it will deliver it itself, so stand any rescuer down.
    if (robot.packageId) {
      const outcome = this.recovery.onHolderRestored(robot.packageId, this.tick);
      if (outcome?.releasedRescuer) this.releaseRescuer(outcome.releasedRescuer, `${robotId} is being restored and keeps ${robot.packageId}`);
      const pkg = this.pkg(robot.packageId);
      if (pkg.recovery?.rescuerId || pkg.recovery?.taskId) {
        this.setPackage(this.expect(assignRescuer(pkg, outcome?.task.id ?? pkg.recovery.taskId ?? "", null, this.tick, `${robotId} restoring; recovery stood down`)));
      }
    }
    this.emit("robot_recovery_started", "info", `${robotId} restoring after ${failure ? FAILURE_LABEL[failure.type].toLowerCase() : "failure"} (${robot.restoreTicks} ticks)`, {
      robotId,
      robotIds: [robotId],
      cell: robot.position,
      failureType: failure?.type,
      action: "restore-robot",
      status: "restoring",
      packageId: robot.packageId ?? undefined,
      missionId: robot.missionId ?? undefined,
    });
    return ok({ message: `${robotId} restoring (${robot.restoreTicks} ticks)`, entityId: robotId });
  }

  private completeRestore(robot: RobotRuntime): void {
    const id = robot.spec.id;
    const failure = this.recovery.failureOf(id);
    this.setStatus(robot, "idle");
    robot.action = "none";
    robot.restoreTicks = 0;
    if (failure?.type === "battery") robot.battery = 100;
    this.recovery.finishRestore(id, this.tick);
    this.coordinator.restore(id, this.cellIndex(robot.position), this.tick - 1);
    this.worldVersion += 1;
    robot.note = "Restored to service";
    robot.routeEvent = { kind: "replanned", tick: this.tick, cause: "restored" };
    this.emit("robot_restored", "success", `${id} restored to service at ${this.cellRefOf(this.cellIndex(robot.position))}`, {
      robotId: id,
      robotIds: [id],
      cell: robot.position,
      failureType: failure?.type,
      action: "restore-robot",
      status: "restored",
    });
    if (robot.packageId && robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      this.setPackage(this.expect(resumeCustody(this.pkg(robot.packageId), id, this.tick)));
      this.setMission(mission.id, "carrying");
      this.setStatus(robot, "carrying");
      robot.action = "travel-to-dropoff";
      this.emit("package_delivery_resumed", "success", `${id} resumes delivering ${robot.packageId} to ${mission.dropoffStationId}`, {
        robotId: id,
        robotIds: [id],
        missionId: mission.id,
        packageId: robot.packageId,
        stationId: mission.dropoffStationId,
        cell: robot.position,
        action: "resume-delivery",
        status: "completed",
      });
      this.emit("robot_recovery_completed", "success", `${id} recovered: it kept custody of ${robot.packageId} and resumed ${mission.id}`, {
        robotId: id,
        robotIds: [id],
        missionId: mission.id,
        packageId: robot.packageId,
        action: "resumed-by-holder",
        status: "completed",
      });
    }
  }

  private startPackageRecovery(packageId: string, rescuerId?: string): CommandResult {
    const pkg = this.packages.get(packageId);
    if (!pkg) return err("unknown-package", `Unknown package "${packageId}"`);
    if (pkg.state !== "recovery-required") return err("package-not-stranded", `${packageId} is ${pkg.state}; only recovery-required packages need recovery`);
    const holder = this.robotById(pkg.holderRobotId!)!;
    if (holder.status !== "failed") return err("holder-restoring", `${holder.spec.id} is being restored and will deliver ${packageId} itself`);
    if (rescuerId !== undefined) {
      const rescuer = this.robotById(rescuerId);
      if (!rescuer) return err("unknown-robot", `Unknown robot "${rescuerId}"`);
      if (!this.isEligibleRescuer(rescuer)) {
        return err("robot-unavailable", `${rescuerId} cannot recover a package now (must be operational, free and charged)`);
      }
    }
    if (!this.recovery.openTaskFor(packageId) && !this.recovery.start(packageId, rescuerId ?? null)) {
      this.recovery.openTask(packageId, pkg.missionId, holder.spec.id, this.tick);
    }
    const task = this.recovery.start(packageId, rescuerId ?? null);
    if (!task) return err("recovery-in-progress", `Recovery of ${packageId} is already under way`);
    this.setPackage(this.expect(assignRescuer(this.pkg(packageId), task.id, null, this.tick, `${task.id} started by operator${rescuerId ? ` (rescuer ${rescuerId})` : ""}`)));
    return ok({ message: `${task.id}: recovery of ${packageId} started${rescuerId ? ` with ${rescuerId}` : ""}`, entityId: task.id });
  }

  private completePackageHandover(packageId: string): CommandResult {
    const pkg = this.packages.get(packageId);
    if (!pkg) return err("unknown-package", `Unknown package "${packageId}"`);
    const task = this.recovery.openTaskFor(packageId);
    if (pkg.state !== "recovery-required" || !task || !task.rescuerId) {
      return err("no-rescuer", `${packageId} has no recovery robot assigned`);
    }
    const rescuer = this.robotById(task.rescuerId)!;
    const holder = this.robotById(task.failedRobotId)!;
    if (manhattan(rescuer.position, holder.position) !== 1 || rescuer.previousPosition === undefined) {
      return err("rescuer-not-adjacent", `${rescuer.spec.id} must be next to ${holder.spec.id} to take over ${packageId}`);
    }
    if (rescuer.dwell === 0 && rescuer.action !== "handover") {
      // Beside the holder but not yet in handover: start it now.
      this.recovery.onArrived(task.id);
    }
    rescuer.dwell = 0;
    this.completeHandover(rescuer);
    return ok({ message: `${packageId} handed over to ${rescuer.spec.id}`, entityId: packageId });
  }

  private cancelRecovery(packageId: string): CommandResult {
    const pkg = this.packages.get(packageId);
    if (!pkg) return err("unknown-package", `Unknown package "${packageId}"`);
    const outcome = this.recovery.cancel(packageId, this.tick);
    if (!outcome) return err("no-open-recovery", `${packageId} has no open recovery to cancel`);
    if (outcome.releasedRescuer) this.releaseRescuer(outcome.releasedRescuer, `${outcome.task.id} cancelled by operator`);
    this.setPackage(this.expect(assignRescuer(this.pkg(packageId), outcome.task.id, null, this.tick, `${outcome.task.id} cancelled by operator`)));
    this.emit("package_recovery_required", "warning", `${outcome.task.id} cancelled: ${packageId} stays with failed ${outcome.task.failedRobotId} until recovery is restarted or the robot is restored`, {
      robotId: outcome.task.failedRobotId,
      robotIds: [outcome.task.failedRobotId, ...(outcome.releasedRescuer ? [outcome.releasedRescuer] : [])],
      missionId: outcome.task.missionId,
      packageId,
      taskId: outcome.task.id,
      action: "cancel-recovery",
      status: "cancelled",
      reason: "cancelled by operator",
    });
    return ok({ message: `${outcome.task.id} cancelled`, entityId: outcome.task.id });
  }

  /**
   * Atomic custody handover from the failed holder to its rescuer: package,
   * mission and both robots change together within one engine step.
   */
  private completeHandover(rescuer: RobotRuntime): void {
    const { taskId, packageId } = rescuer.rescue!;
    const task = this.recovery.openTaskFor(packageId)!;
    const holder = this.robotById(task.failedRobotId)!;
    if (holder.status !== "failed" || manhattan(holder.position, rescuer.position) !== 1) {
      throw new InvariantViolation(this.tick, [`handover of ${packageId}: ${rescuer.spec.id} is not beside failed ${holder.spec.id}`]);
    }
    const mission = this.missions.get(task.missionId)!;
    this.setPackage(this.expect(transferCustody(this.pkg(packageId), holder.spec.id, rescuer.spec.id, this.tick, taskId)));
    this.setMission(mission.id, "carrying", { robotId: rescuer.spec.id });
    holder.packageId = null;
    holder.missionId = null;
    holder.note = `${FAILURE_LABEL[this.recovery.failureOf(holder.spec.id)?.type ?? "motor"]}; ${packageId} handed over to ${rescuer.spec.id}`;
    rescuer.rescue = null;
    rescuer.packageId = packageId;
    rescuer.missionId = mission.id;
    rescuer.dwell = 0;
    this.setStatus(rescuer, "carrying");
    rescuer.action = "travel-to-dropoff";
    rescuer.note = `Carrying ${packageId} to ${mission.dropoffStationId} (recovered from ${holder.spec.id})`;
    this.coordinator.invalidate(rescuer.spec.id);
    this.recovery.onHandedOver(taskId, this.tick);
    const refs = { robotIds: [holder.spec.id, rescuer.spec.id], missionId: mission.id, packageId, taskId, cell: holder.position };
    this.emit("package_custody_transferred", "success", `${packageId} custody transferred ${holder.spec.id} → ${rescuer.spec.id} (${taskId})`, {
      ...refs,
      robotId: rescuer.spec.id,
      action: "transfer-custody",
      status: "completed",
    });
    this.emit("package_delivery_resumed", "success", `${rescuer.spec.id} resumes ${mission.id}: delivering ${packageId} to ${mission.dropoffStationId}`, {
      ...refs,
      robotId: rescuer.spec.id,
      stationId: mission.dropoffStationId,
      action: "resume-delivery",
      status: "completed",
    });
    this.emit("robot_recovery_completed", "success", `${holder.spec.id}'s work recovered: ${rescuer.spec.id} now carries ${packageId}`, {
      ...refs,
      robotId: holder.spec.id,
      action: "package-handed-over",
      status: "completed",
    });
  }

  /** Stand a rescuer down (timeout, cancellation, holder restored); it never held custody. */
  private releaseRescuer(robotId: string, why: string): void {
    const robot = this.robotById(robotId);
    if (!robot || !robot.rescue) return;
    robot.rescue = null;
    robot.goal = null;
    robot.goalStationId = null;
    if (robot.action === "handover") {
      robot.dwell = 0;
      this.setStatus(robot, "idle");
    }
    robot.action = "none";
    robot.note = `Recovery stood down: ${why}`;
    this.coordinator.invalidate(robotId);
  }

  private isEligibleRescuer(r: RobotRuntime): boolean {
    return (
      r.status !== "failed" &&
      r.status !== "recovering" &&
      r.missionId === null &&
      r.packageId === null &&
      r.rescue === null &&
      r.dwell === 0 &&
      r.battery >= MIN_ASSIGN_BATTERY &&
      !this.yields.has(r.spec.id)
    );
  }

  /** Free cells beside a failed robot where a rescuer can stand for the handover. */
  private approachCells(failedId: string): number[] {
    const failed = this.robotById(failedId)!;
    const cell = this.cellIndex(failed.position);
    const { width, height } = this.scenario.layout;
    const x = cell % width;
    const y = (cell - x) / width;
    return [y > 0 ? cell - width : -1, x < width - 1 ? cell + 1 : -1, y < height - 1 ? cell + width : -1, x > 0 ? cell - 1 : -1].filter(
      (n) => n >= 0 && this.grid.passable(n, false),
    );
  }

  /** Phase 0: recovery decisions (rescuer dispatch, timeouts) before mission assignment. */
  private runRecovery(): void {
    const occupant = new Map(this.robots.map((r) => [this.cellIndex(r.position), r.spec.id]));
    const port: RecoveryPort = {
      tick: this.tick,
      worldVersion: this.worldVersion,
      eligible: () => this.robots.filter((r) => this.isEligibleRescuer(r)).map((r) => ({ id: r.spec.id, rank: r.rank, cell: this.cellIndex(r.position) })),
      approach: (failedId, fromCell) => {
        const self = occupant.get(fromCell);
        let best: { cell: number; distance: number } | null = null;
        for (const cell of this.approachCells(failedId)) {
          const who = occupant.get(cell);
          if (who !== undefined && who !== self) continue;
          const hold = this.coordinator.table.holdAt(cell);
          if (hold && hold.robotId !== self) continue;
          const distance = cell === fromCell ? 0 : this.coordinator.distance(cell, fromCell);
          if (distance < 0) continue;
          if (!best || distance < best.distance) best = { cell, distance };
        }
        return best;
      },
      reachable: (failedId) =>
        this.approachCells(failedId).some((cell) =>
          this.robots.some((r) => r.status !== "failed" && r.status !== "recovering" && this.coordinator.distance(cell, this.cellIndex(r.position)) >= 0),
        ),
      holderOnDestination: (packageId) => {
        const pkg = this.pkg(packageId);
        const holder = pkg.holderRobotId ? this.robotById(pkg.holderRobotId) : undefined;
        return holder !== undefined && samePoint(holder.position, this.station(pkg.destinationStationId).position);
      },
    };
    const update = this.recovery.update(port);
    for (const r of update.release) {
      this.releaseRescuer(r.rescuerId, `timed out on ${r.taskId}`);
      this.setPackage(this.expect(assignRescuer(this.pkg(r.packageId), r.taskId, null, this.tick, `${r.rescuerId} timed out`)));
      this.emit("recovery_failed", "warning", `${r.taskId}: ${r.rescuerId} did not reach the failed robot within ${this.recovery.timeoutTicks} ticks; trying another robot`, {
        robotId: r.rescuerId,
        robotIds: [r.rescuerId],
        packageId: r.packageId,
        taskId: r.taskId,
        action: "release-rescuer",
        status: "pending",
        reason: "rescuer timed out",
      });
    }
    for (const d of update.dispatch) {
      const robot = this.robotById(d.rescuerId)!;
      robot.rescue = { taskId: d.taskId, packageId: d.packageId, approachCell: d.approachCell };
      robot.chargerId = null;
      robot.blockedTicks = 0;
      robot.noPathAnnounced = false;
      robot.note = `Heading to recover ${d.packageId}`;
      this.coordinator.invalidate(robot.spec.id);
      this.setPackage(this.expect(assignRescuer(this.pkg(d.packageId), d.taskId, d.rescuerId, this.tick, `${d.rescuerId} dispatched to take over ${d.packageId} (${d.taskId})`)));
    }
    for (const e of update.events) {
      this.emit(e.kind, e.severity, e.message, {
        robotId: e.robotId,
        robotIds: e.robotIds,
        missionId: e.missionId,
        packageId: e.packageId,
        taskId: e.taskId,
        attempt: e.attempt,
        cell: e.cell !== undefined ? this.cellPoint(e.cell) : undefined,
        action: e.action,
        status: e.status,
        reason: e.reason,
      });
    }
  }

  /** A world change invalidated this robot's route: record it and report the replan when it happens. */
  private invalidateRoute(robot: RobotRuntime, cause: string, refs: { closureId?: string; cell?: GridPoint }): void {
    robot.routeEvent = { kind: "invalidated", tick: this.tick, cause };
    this.pendingReplan.set(robot.spec.id, cause);
    this.emit("route_invalidated", "warning", `${robot.spec.id} route invalidated: ${cause}; reservations released`, {
      robotId: robot.spec.id,
      robotIds: [robot.spec.id],
      missionId: robot.missionId ?? undefined,
      packageId: robot.packageId ?? undefined,
      action: "release-reservations",
      reason: cause,
      ...refs,
    });
  }

  /** After planning: report robots that replanned following a world change. */
  private reportReplans(modes: ReadonlyMap<string, CoordMode>): void {
    for (const [robotId, cause] of [...this.pendingReplan].sort(([a], [b]) => a.localeCompare(b))) {
      if (modes.get(robotId) !== "mobile") {
        if (modes.get(robotId) === "failed") this.pendingReplan.delete(robotId);
        continue;
      }
      this.pendingReplan.delete(robotId);
      const robot = this.robotById(robotId)!;
      const view = this.coordinator.robotView(robotId, this.tick - 1);
      const cells = new Set(view.plan.map((s) => s.cell)).size;
      const noRoute = view.planStatus === "unreachable" || view.planStatus === "blocked";
      robot.routeEvent = { kind: noRoute ? "no-route" : "replanned", tick: this.tick, cause };
      this.emit(
        "robot_route_replanned",
        noRoute ? "warning" : "info",
        noRoute
          ? `${robotId} has no route after ${cause}; holding safely until the warehouse changes`
          : `${robotId} replanned after ${cause}: ${view.planStatus} route over ${cells} cell${cells === 1 ? "" : "s"}`,
        {
          robotId,
          robotIds: [robotId],
          missionId: robot.missionId ?? undefined,
          packageId: robot.packageId ?? undefined,
          action: noRoute ? "hold" : "replan",
          reason: cause,
          cell: robot.goal ?? undefined,
        },
      );
    }
  }

  private cellRefOf(cell: number): string {
    const p = this.cellPoint(cell);
    return `(${p.x}, ${p.y})`;
  }

  // =============================================================== helpers

  private createMissionInternal(job: MissionSpec): Mission {
    this.missionSeq += 1;
    this.packageSeq += 1;
    const missionId = `M-${1000 + this.missionSeq}`;
    const packageId = `PKG-${pad(this.packageSeq, 4)}`;
    const mission = createMission({
      id: missionId,
      packageId,
      pickupStationId: job.pickup,
      dropoffStationId: job.dropoff,
      tick: this.tick,
      priority: job.priority ?? "normal",
    });
    this.missions.set(missionId, mission);
    this.packages.set(
      packageId,
      createPackage({ id: packageId, missionId, originStationId: job.pickup, destinationStationId: job.dropoff, tick: this.tick }),
    );
    this.emit("mission-created", "info", `${missionId} created: ${packageId} ${job.pickup} → ${job.dropoff}${mission.priority !== "normal" ? ` · ${mission.priority}` : ""}`, {
      missionId,
      packageId,
    });
    return mission;
  }

  private setMission(
    id: string,
    to: MissionState,
    patch: Partial<Pick<Mission, "robotId" | "assignedTick" | "pickedTick" | "completedTick">> = {},
  ): void {
    const mission = this.missions.get(id)!;
    this.missions.set(id, this.expect(transitionMission(mission, to, this.tick, patch)));
  }

  private setPackage(pkg: Package): void {
    this.packages.set(pkg.id, pkg);
  }

  private setStatus(robot: RobotRuntime, to: RobotStatus): void {
    this.expect(validateRobotTransition(robot.spec.id, robot.status, to));
    robot.status = to;
  }

  /** Internal transitions must succeed; a failure here is an engine bug. */
  private expect<T>(result: Result<T>): T {
    if (!result.ok) throw new InvariantViolation(this.tick, [`${result.error.code}: ${result.error.message}`]);
    return result.value;
  }

  private failedRobotAt(p: GridPoint): string | null {
    return this.robots.find((r) => r.status === "failed" && samePoint(r.position, p))?.spec.id ?? null;
  }

  /**
   * Scheduling response to a station becoming unusable before pickup: the
   * mission returns to the queue and its robot is released.
   */
  private requeueMissionsBlockedAt(p: GridPoint, failedId: string): string[] {
    const requeued: string[] = [];
    for (const robot of this.robots) {
      if (!robot.missionId || robot.status === "failed") continue;
      const mission = this.missions.get(robot.missionId)!;
      if (mission.state !== "assigned" && mission.state !== "to-pickup") continue;
      const pickup = this.station(mission.pickupStationId).position;
      const dropoff = this.station(mission.dropoffStationId).position;
      if (!samePoint(pickup, p) && !samePoint(dropoff, p)) continue;
      this.setPackage(this.expect(releaseReservation(this.pkg(mission.packageId), robot.spec.id, this.tick, `station blocked by failed ${failedId}`)));
      this.missions.set(mission.id, this.expect(transitionMission(mission, "queued", this.tick, { robotId: null, assignedTick: null })));
      robot.missionId = null;
      robot.goal = null;
      robot.goalStationId = null;
      this.coordinator.invalidate(robot.spec.id);
      requeued.push(mission.id);
      this.emit("mission-requeued", "warning", `${mission.id} requeued: ${robot.spec.id} released because a station on its route is blocked by failed ${failedId}`, {
        missionId: mission.id,
        robotId: robot.spec.id,
      });
    }
    return requeued;
  }

  private cellIndex(p: GridPoint): number {
    return p.y * this.scenario.layout.width + p.x;
  }

  private cellPoint(index: number): GridPoint {
    const { width } = this.scenario.layout;
    return { x: index % width, y: Math.floor(index / width) };
  }

  private pkg(id: string): Package {
    const pkg = this.packages.get(id);
    if (!pkg) throw new InvariantViolation(this.tick, [`unknown package ${id}`]);
    return pkg;
  }

  private station(id: string): Station {
    const station = this.scenario.layout.stations.find((s) => s.id === id);
    if (!station) throw new InvariantViolation(this.tick, [`unknown station ${id}`]);
    return station;
  }

  private robotById(id: string): RobotRuntime | undefined {
    return this.robots.find((r) => r.spec.id === id);
  }

  private travelNote(robot: RobotRuntime): string {
    switch (robot.action) {
      case "travel-to-pickup":
        return `To ${robot.goalStationId} for pickup`;
      case "travel-to-dropoff":
        return `Carrying ${robot.packageId} to ${robot.goalStationId}`;
      case "travel-to-charger":
        return `Low battery · heading to ${robot.goalStationId}`;
      case "return-home":
        return "Returning home";
      default:
        return "Moving";
    }
  }

  private pruneFinished(): void {
    const finished = [...this.missions.values()].filter((m) => m.state === "completed" || m.state === "cancelled");
    const excess = finished.length - MAX_FINISHED_MISSIONS;
    for (let i = 0; i < excess; i += 1) {
      this.missions.delete(finished[i].id);
      this.packages.delete(finished[i].packageId);
    }
  }

  private emit(
    kind: SimEventKind,
    severity: EventSeverity,
    message: string,
    refs: Pick<
      SimEvent,
      | "robotId"
      | "missionId"
      | "packageId"
      | "stationId"
      | "closureId"
      | "robotIds"
      | "incidentId"
      | "attempt"
      | "cell"
      | "action"
      | "status"
      | "reason"
      | "failureType"
      | "taskId"
    > = {},
  ): void {
    this.eventSeq += 1;
    this.events.push({ id: `E-${pad(this.eventSeq)}`, seq: this.eventSeq, tick: this.tick, kind, severity, message, ...refs });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.invalidate();
  }

  private emitPlayback(kind: "simulation-started" | "simulation-paused", message: string): void {
    this.playbackSeq += 1;
    this.playbackEvents.push({ id: `P-${pad(this.playbackSeq)}`, seq: this.playbackSeq, tick: this.tick, kind, severity: "info", message });
    if (this.playbackEvents.length > MAX_EVENTS) this.playbackEvents.splice(0, this.playbackEvents.length - MAX_EVENTS);
    this.invalidate();
  }

  private invalidate(): void {
    this.snapshot = null;
  }

  private verify(): void {
    if (!this.checking) return;
    const violations = checkInvariants(this.getSnapshot());
    if (violations.length > 0) throw new InvariantViolation(this.tick, violations);
  }

  // ============================================================== snapshot

  private coordinationSnapshot(robots: readonly RobotState[]): CoordinationSnapshot {
    const table = this.coordinator.table;
    return {
      reservations: table
        .listCells()
        .filter((r) => r.tick >= this.tick)
        .map((r) => ({ tick: r.tick, robotId: r.robotId, ...this.cellPoint(r.cell) })),
      holds: table.listHolds().map((h) => ({ robotId: h.robotId, fromTick: h.fromTick, ...this.cellPoint(h.cell) })),
      decisions: this.coordinator.recentDecisions().slice(),
      // Multi-edge wait-for graph from the deadlock detector (see deadlock/wait-for-graph.ts).
      waitGraph: this.deadlocks.edges().map((e) => ({
        robotId: e.from,
        waitingFor: e.to,
        ticks: robots.find((r) => r.id === e.from)?.blockedTicks ?? 0,
        cell: e.cell >= 0 ? this.cellPoint(e.cell) : undefined,
        reason: e.reason,
      })),
      stats: this.coordinator.getStats(),
      horizon: this.coordinator.horizon,
    };
  }

  private buildSnapshot(): SimulationSnapshot {
    const robots: RobotState[] = this.robots.map((r) => {
      const view = this.coordinator.robotView(r.spec.id, this.tick);
      const plan = view.plan.map((step) => ({ tick: step.tick, ...this.cellPoint(step.cell) }));
      const route: GridPoint[] = [];
      for (const step of plan) {
        const last = route[route.length - 1] ?? r.position;
        if (step.x !== last.x || step.y !== last.y) route.push({ x: step.x, y: step.y });
      }
      return {
        id: r.spec.id,
        model: r.spec.model,
        colorIndex: r.spec.colorIndex,
        position: r.position,
        previousPosition: r.previousPosition,
        heading: r.heading,
        status: r.status,
        action: r.action,
        battery: Math.round(r.battery * 10) / 10,
        home: r.spec.home,
        missionId: r.missionId,
        packageId: r.packageId,
        destinationStationId: r.status === "failed" || r.status === "recovering" ? null : r.goalStationId,
        destination: r.status === "failed" || r.status === "recovering" ? null : r.goal,
        route,
        blockedTicks: r.blockedTicks,
        priority: this.priorityOf(r),
        coordination: view.state,
        planStatus: view.planStatus,
        plan,
        waitingFor: view.waitingFor,
        waitClass: this.deadlocks.classOf(r.spec.id),
        deadlockId: this.deadlocks.incidentOf(r.spec.id),
        activityNote: r.note,
        failure: this.recovery.failureOf(r.spec.id),
        recoveryRole: this.recovery.roleOf(r.spec.id),
        routeEvent: r.routeEvent && this.tick - r.routeEvent.tick <= ROUTE_EVENT_TTL ? r.routeEvent : null,
        stats: { ...r.stats },
      };
    });
    const missions = [...this.missions.values()];
    const events = [...this.events, ...this.playbackEvents]
      .sort((a, b) => a.tick - b.tick || (a.id[0] === b.id[0] ? a.seq - b.seq : a.id[0] === "E" ? -1 : 1))
      .slice(-MAX_EVENTS);
    return {
      source: "engine",
      scenarioId: this.scenario.definition.id,
      tick: this.tick,
      running: this.running,
      layout: this.scenario.layout,
      closures: this.closures.slice(),
      robots,
      missions,
      packages: [...this.packages.values()],
      events,
      movements: this.movements.slice(),
      deliveryTicks: this.deliveryTicks.slice(),
      coordination: this.coordinationSnapshot(robots),
      deadlocks: this.deadlocks.snapshot(
        (cell) => this.cellPoint(cell),
        (id) => robots.find((r) => r.id === id)?.blockedTicks ?? 0,
      ),
      recovery: this.recovery.snapshot((cell) => this.cellPoint(cell)),
      metrics: computeMetrics(
        this.tick,
        robots,
        missions,
        this.deliveryTicks.length,
        this.closures.length,
        new Set(robots.filter((r) => r.waitClass === "deadlock" || r.waitClass === "recovering" || r.waitClass === "yielding").map((r) => r.deadlockId)).size,
      ),
    };
  }
}
