import type {
  Closure,
  EventSeverity,
  GridPoint,
  Heading,
  Mission,
  MissionState,
  MovementRecord,
  Package,
  RobotAction,
  RobotState,
  RobotStatus,
  SimEvent,
  SimEventKind,
  SimulationSnapshot,
  Station,
} from "../types/simulation";
import {
  isWorldCommand,
  type CommandResult,
  type EngineCommand,
  type LoggedCommand,
  type WorldCommand,
} from "./commands";
import { InvariantViolation, err, ok, type Result } from "./core/result";
import { Prng } from "./core/prng";
import {
  annotateCustody,
  createPackage,
  deliverPackage,
  departWithPackage,
  pickUpPackage,
  releaseReservation,
  reservePackage,
} from "./custody/package-custody";
import { checkInvariants } from "./invariants";
import { BLOCKED_ALERT_TICKS, LOW_BATTERY_THRESHOLD, computeMetrics } from "./metrics";
import { createMission, isActiveMission, transitionMission } from "./missions/mission-lifecycle";
import { findPath, type PathResult } from "./pathfinding/astar";
import { validateRobotTransition } from "./robots/robot-lifecycle";
import type { CompiledScenario, MissionSpec, RobotSpec } from "./scenario";
import { getCompiledScenario, SCENARIOS } from "./scenarios";
import { cellKindAt, inBounds, isStationKind, isTraversableKind, isValidPoint, neighbours, pointKey, samePoint, stationAt } from "./world/layout";

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
}

// ---------------------------------------------------------------- tuning

const MAX_EVENTS = 300;
const MAX_MOVEMENTS = 400;
const MAX_FINISHED_MISSIONS = 200;
/** Base consecutive blocked ticks before replanning around other robots. */
const REPLAN_AFTER = 4;
const MIN_ASSIGN_BATTERY = 15;
const SEEK_CHARGE_BELOW = 25;
const CHARGE_UNTIL = 90;
const CHARGE_RESUME_BELOW = 95;
const DRAIN_MOVE = 0.04;
const DRAIN_WORK = 0.01;
const DRAIN_IDLE = 0.004;
const CHARGE_RATE = 1;

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
  path: GridPoint[];
  goal: GridPoint | null;
  goalStationId: string | null;
  /** Charger chosen for a low-battery top-up, if any. */
  chargerId: string | null;
  dwell: number;
  blockedTicks: number;
  needsReplan: "closure" | null;
  noPathAnnounced: boolean;
  lowBatteryFlag: boolean;
  note: string | null;
  stats: { movingTicks: number; waitingTicks: number; busyTicks: number; distance: number; deliveries: number; replans: number };
}

type TargetKind = "pickup" | "dropoff" | "home" | "charger";

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
 *   3. seeded mission feed
 *   4. assignment: queued missions → nearest available robot (A* cost, then rank)
 *   5. robots update in ID order (dwell, arrive, plan, wait or move)
 *   6. logged user commands for this tick (replay only)
 *   7. invariant check (outside production)
 *
 * Movement uses a sequential occupancy guard: a robot may only enter a cell
 * no other robot holds at that moment, so cell collisions and head-on swaps
 * cannot occur. It is NOT reservation-based coordination (Mission 004):
 * robots can queue, wait and need bounded replanning to get past each other.
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
  private closedCells = new Map<string, string>();
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
        if (!SCENARIOS.some((s) => s.id === command.scenarioId)) {
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
      position: spec.home,
      previousPosition: spec.home,
      heading: spec.heading,
      status: "idle",
      action: "none",
      battery: spec.battery,
      missionId: null,
      packageId: null,
      path: [],
      goal: null,
      goalStationId: null,
      chargerId: null,
      dwell: 0,
      blockedTicks: 0,
      needsReplan: null,
      noPathAnnounced: false,
      lowBatteryFlag: spec.battery < LOW_BATTERY_THRESHOLD,
      note: null,
      stats: { movingTicks: 0, waitingTicks: 0, busyTicks: 0, distance: 0, deliveries: 0, replans: 0 },
    }));

    this.emit("scenario-loaded", "info", `Scenario "${definition.name}" loaded`);
    for (const job of definition.missions) this.createMissionInternal(job);
    this.invalidate();
  }

  private advance(): void {
    this.tick += 1;
    for (const entry of this.scenario.definition.schedule ?? []) {
      if (entry.tick !== this.tick) continue;
      const result = this.applyWorld(entry.command);
      if (!result.ok) this.emit("robot-no-path", "warning", `Scheduled ${entry.command.type} failed: ${result.error.message}`);
    }
    this.runFeed();
    this.assignMissions();

    for (const robot of this.robots) robot.previousPosition = robot.position;
    const occupancy = new Map(this.robots.map((r) => [pointKey(r.position), r.spec.id]));
    for (const robot of this.robots) this.updateRobot(robot, occupancy);
    for (const robot of this.robots) this.updateBatteryFlag(robot);
    this.invalidate();
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
    let open = 0;
    for (const m of this.missions.values()) if (m.state === "queued" || isActiveMission(m.state)) open += 1;
    if (open >= feed.maxOpen) return;
    this.createMissionInternal(feed.routes[this.prng.int(feed.routes.length)]);
  }

  private assignMissions(): void {
    for (const mission of [...this.missions.values()]) {
      if (mission.state !== "queued") continue;
      const candidates = this.robots.filter(
        (r) => r.status !== "failed" && r.status !== "recovering" && r.missionId === null && r.dwell === 0 && r.battery >= MIN_ASSIGN_BATTERY,
      );
      if (candidates.length === 0) return;
      const pickup = this.station(mission.pickupStationId);
      let best: { robot: RobotRuntime; path: readonly GridPoint[]; cost: number } | null = null;
      for (const robot of candidates) {
        const plan = this.plan(robot, pickup.position, false);
        if (!plan.ok) continue;
        if (!best || plan.cost < best.cost || (plan.cost === best.cost && robot.rank < best.robot.rank)) {
          best = { robot, path: plan.path, cost: plan.cost };
        }
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
      robot.path = [...best.path];
      robot.goal = pickup.position;
      robot.goalStationId = pickup.id;
      robot.action = "travel-to-pickup";
      robot.blockedTicks = 0;
      robot.noPathAnnounced = false;
      this.emit("mission-assigned", "info", `${mission.id} assigned to ${robot.spec.id} (${mission.pickupStationId} → ${mission.dropoffStationId}, ${best.cost} cells)`, {
        robotId: robot.spec.id,
        missionId: mission.id,
        packageId: mission.packageId,
      });
    }
  }

  private updateRobot(robot: RobotRuntime, occupancy: Map<string, string>): void {
    if (robot.status === "failed") return;

    // 1. Station handling in progress.
    if (robot.dwell > 0) {
      robot.dwell -= 1;
      robot.stats.busyTicks += 1;
      robot.battery = clampBattery(robot.battery - DRAIN_WORK);
      if (robot.dwell === 0) this.completeDwell(robot);
      return;
    }

    // 2. Decide where the robot should be.
    const target = this.targetFor(robot);
    robot.goal = target?.cell ?? null;
    robot.goalStationId = target?.stationId ?? null;
    if (!target) {
      this.rest(robot);
      return;
    }
    robot.action = target.action;
    if (samePoint(robot.position, target.cell)) {
      this.arrive(robot, target);
      return;
    }

    // 3. Make sure the plan is valid, replanning if a closure invalidated it.
    if (!this.pathValid(robot, target.cell)) {
      const reason = robot.needsReplan;
      robot.needsReplan = null;
      const plan = this.plan(robot, target.cell, false);
      if (!plan.ok) {
        this.noPath(robot, plan);
        return;
      }
      robot.path = [...plan.path];
      robot.noPathAnnounced = false;
      if (reason === "closure") {
        robot.stats.replans += 1;
        this.emit("robot-replanned", "info", `${robot.spec.id} replanned around a closure (${plan.cost} cells to ${target.stationId ?? "home"})`, {
          robotId: robot.spec.id,
          missionId: robot.missionId ?? undefined,
        });
      }
    }

    // 4. Occupancy guard: wait if the next cell is held right now.
    const next = robot.path[0];
    const holder = occupancy.get(pointKey(next));
    if (holder && holder !== robot.spec.id) {
      this.blocked(robot, target, next, holder, occupancy);
      return;
    }

    // 5. Move one cell.
    occupancy.delete(pointKey(robot.position));
    occupancy.set(pointKey(next), robot.spec.id);
    this.moveTo(robot, next);
    if (samePoint(robot.position, target.cell)) this.arrive(robot, target);
  }

  private targetFor(robot: RobotRuntime): Target | null {
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
    const homes = new Set(this.robots.filter((r) => r !== robot).map((r) => pointKey(r.spec.home)));
    const taken = new Set(this.robots.filter((r) => r !== robot && r.chargerId).map((r) => r.chargerId));
    const chargers = this.scenario.layout.stations.filter(
      (s) => s.kind === "charger" && !homes.has(pointKey(s.position)) && !taken.has(s.id),
    );
    let best: { id: string; cost: number } | null = null;
    for (const charger of chargers) {
      const plan = this.plan(robot, charger.position, false);
      if (plan.ok && (!best || plan.cost < best.cost)) best = { id: charger.id, cost: plan.cost };
    }
    return best?.id ?? null;
  }

  private arrive(robot: RobotRuntime, target: Target): void {
    robot.path = [];
    robot.blockedTicks = 0;
    const handling = this.scenario.definition.handling;
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
    if (robot.status === "moving" || robot.status === "carrying") {
      // Arrived home or at a charger this tick; rest from the next tick on.
      robot.note = target.kind === "charger" ? `Docked at ${target.stationId}` : "Parked at home";
      return;
    }
    this.rest(robot);
  }

  private rest(robot: RobotRuntime): void {
    robot.path = [];
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
    robot.path.shift();
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

  private blocked(robot: RobotRuntime, target: Target, next: GridPoint, holder: string, occupancy: Map<string, string>): void {
    robot.blockedTicks += 1;
    robot.stats.waitingTicks += 1;
    robot.battery = clampBattery(robot.battery - DRAIN_IDLE);
    this.setStatus(robot, "waiting");
    robot.note = `Waiting: next cell (${next.x}, ${next.y}) held by ${holder}`;
    if (robot.blockedTicks === BLOCKED_ALERT_TICKS) {
      this.emit("robot-waiting", "warning", `${robot.spec.id} blocked by ${holder} at (${next.x}, ${next.y})`, {
        robotId: robot.spec.id,
        missionId: robot.missionId ?? undefined,
      });
    }
    // Bounded wait, then plan around every other robot's cell. In a mutual
    // head-on block only the yielding robot replans first; the priority robot
    // replans too only if the block outlasts a longer bound (no alternative
    // found by the yielder), so the pair never stays stuck indefinitely.
    const other = this.robotById(holder);
    const mutual = other !== undefined && other.path.length > 0 && samePoint(other.path[0], robot.position);
    const threshold = mutual && other
      ? this.shouldYield(robot, other) ? REPLAN_AFTER : REPLAN_AFTER * 3
      : REPLAN_AFTER + robot.rank;
    if (robot.blockedTicks % threshold !== 0) return;
    const plan = this.plan(robot, target.cell, true);
    if (!plan.ok || plan.path.length === 0 || samePoint(plan.path[0], next)) {
      // No alternative route (e.g. the goal is the other robot's cell): a
      // yielding robot steps aside into a free neighbour to break the block.
      if (mutual && other && this.shouldYield(robot, other)) this.stepAside(robot, other, holder, occupancy);
      return;
    }
    robot.path = [...plan.path];
    robot.stats.replans += 1;
    this.emit("robot-replanned", "info", `${robot.spec.id} replanned around ${holder} after ${robot.blockedTicks} ticks (${plan.cost} cells)`, {
      robotId: robot.spec.id,
      missionId: robot.missionId ?? undefined,
    });
  }

  private stepAside(robot: RobotRuntime, other: RobotRuntime, holder: string, occupancy: Map<string, string>): void {
    const layout = this.scenario.layout;
    const avoid = new Set(other.path.slice(0, 2).map(pointKey));
    const spot = neighbours(robot.position).find((p) => {
      if (!inBounds(layout, p)) return false;
      const kind = cellKindAt(layout, p)!;
      const key = pointKey(p);
      return isTraversableKind(kind) && !isStationKind(kind) && !this.closedCells.has(key) && !occupancy.has(key) && !avoid.has(key);
    });
    if (!spot) return;
    occupancy.delete(pointKey(robot.position));
    occupancy.set(pointKey(spot), robot.spec.id);
    robot.path = [spot];
    this.moveTo(robot, spot);
    robot.path = [];
    robot.stats.replans += 1;
    robot.note = `Stepped aside for ${holder}`;
    this.emit("robot-replanned", "info", `${robot.spec.id} stepped aside to (${spot.x}, ${spot.y}) to let ${holder} pass`, {
      robotId: robot.spec.id,
      missionId: robot.missionId ?? undefined,
    });
  }

  /** Yield rule for head-on blocks: loaded robots have priority, then lower rank (ID). */
  private shouldYield(robot: RobotRuntime, other: RobotRuntime): boolean {
    if (robot.packageId && !other.packageId) return false;
    if (!robot.packageId && other.packageId) return true;
    return robot.rank > other.rank;
  }

  private noPath(robot: RobotRuntime, plan: Extract<PathResult, { ok: false }>): void {
    robot.path = [];
    robot.blockedTicks += 1;
    robot.stats.waitingTicks += 1;
    robot.battery = clampBattery(robot.battery - DRAIN_IDLE);
    this.setStatus(robot, "waiting");
    robot.note = `No route: ${plan.message}`;
    if (robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      if (mission.state === "to-pickup") this.setMission(mission.id, "assigned");
      if (mission.state === "to-dropoff") this.setMission(mission.id, "carrying");
    }
    if (!robot.noPathAnnounced) {
      robot.noPathAnnounced = true;
      this.emit("robot-no-path", "warning", `${robot.spec.id} has no route to ${robot.goalStationId ?? "its goal"}: ${plan.message}`, {
        robotId: robot.spec.id,
        missionId: robot.missionId ?? undefined,
      });
    }
  }

  private pathValid(robot: RobotRuntime, goal: GridPoint): boolean {
    if (robot.needsReplan) return false;
    const { path } = robot;
    if (path.length === 0 || !samePoint(path[path.length - 1], goal)) return false;
    const first = path[0];
    if (Math.abs(first.x - robot.position.x) + Math.abs(first.y - robot.position.y) !== 1) return false;
    return !path.some((p) => this.closedCells.has(pointKey(p)));
  }

  /**
   * A* from the robot's cell. Static blockers: closures, failed robots and
   * robots parked or working at a station. With `avoidRobots`, every other
   * robot's current cell is avoided too. The goal itself is never treated as
   * robot-blocked (the occupancy guard handles a busy station).
   */
  private plan(robot: RobotRuntime, goal: GridPoint, avoidRobots: boolean): PathResult {
    const goalKey = pointKey(goal);
    const robotCells = new Set<string>();
    for (const other of this.robots) {
      if (other === robot) continue;
      const stationary =
        other.status === "failed" || other.dwell > 0 || (other.path.length === 0 && other.missionId === null);
      if (avoidRobots || stationary) robotCells.add(pointKey(other.position));
    }
    return findPath({
      layout: this.scenario.layout,
      start: robot.position,
      goal,
      isBlocked: (p) => {
        const key = pointKey(p);
        return this.closedCells.has(key) || (key !== goalKey && robotCells.has(key));
      },
    });
  }

  private updateBatteryFlag(robot: RobotRuntime): void {
    if (robot.status === "failed") return;
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
        return this.addMission(command.pickupStationId, command.dropoffStationId);
      case "cancel-mission":
        return this.cancelMission(command.missionId);
      case "close-aisle":
        return this.closeAisle(command.cells, command.label);
      case "reopen-aisle":
        return this.reopenAisle(command.closureId);
      case "fail-robot":
        return this.failRobot(command.robotId, command.reason);
    }
  }

  private addMission(pickupId: string, dropoffId: string): CommandResult {
    const pickup = this.scenario.layout.stations.find((s) => s.id === pickupId);
    const dropoff = this.scenario.layout.stations.find((s) => s.id === dropoffId);
    if (!pickup) return err("unknown-station", `Unknown pickup station "${pickupId}"`);
    if (!dropoff) return err("unknown-station", `Unknown drop-off station "${dropoffId}"`);
    if (pickup.kind !== "pickup") return err("invalid-station-kind", `${pickupId} is a ${pickup.kind} station, not a pickup`);
    if (dropoff.kind !== "dropoff") return err("invalid-station-kind", `${dropoffId} is a ${dropoff.kind} station, not a drop-off`);
    const mission = this.createMissionInternal({ pickup: pickupId, dropoff: dropoffId });
    return ok({ message: `${mission.id} queued (${pickupId} → ${dropoffId})`, entityId: mission.id });
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
        robot.path = [];
        robot.goal = null;
        robot.goalStationId = null;
      }
    }
    this.emit("mission-cancelled", "info", `${missionId} cancelled`, { missionId, robotId: mission.robotId ?? undefined, packageId: mission.packageId });
    return ok({ message: `${missionId} cancelled`, entityId: missionId });
  }

  private closeAisle(cells: readonly GridPoint[], label?: string): CommandResult {
    if (!Array.isArray(cells) || cells.length === 0) return err("empty-closure", "A closure needs at least one cell");
    const layout = this.scenario.layout;
    const unique = new Map<string, GridPoint>();
    for (const cell of cells) {
      if (!isValidPoint(cell) || !inBounds(layout, cell)) {
        return err("invalid-coordinates", `Cell ${JSON.stringify(cell)} is outside the ${layout.width}×${layout.height} warehouse`);
      }
      const kind = cellKindAt(layout, cell)!;
      if (!isTraversableKind(kind)) return err("cell-not-closable", `(${cell.x}, ${cell.y}) is a ${kind} — already impassable`);
      if (isStationKind(kind)) return err("cell-not-closable", `(${cell.x}, ${cell.y}) is a station; stations cannot be closed`);
      const key = pointKey(cell);
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
    let affected = 0;
    for (const robot of this.robots) {
      if (robot.path.some((p) => unique.has(pointKey(p)))) {
        robot.needsReplan = "closure";
        affected += 1;
      }
    }
    this.emit("aisle-closed", "warning", `${id} closed ${unique.size} cell${unique.size > 1 ? "s" : ""}${affected ? ` · ${affected} route${affected > 1 ? "s" : ""} invalidated` : ""}`, {
      closureId: id,
    });
    return ok({ message: `${id} closed`, entityId: id });
  }

  private reopenAisle(closureId: string): CommandResult {
    const closure = this.closures.find((c) => c.id === closureId);
    if (!closure) return err("unknown-closure", `Unknown closure "${closureId}"`);
    this.closures = this.closures.filter((c) => c.id !== closureId);
    for (const cell of closure.cells) this.closedCells.delete(pointKey(cell));
    this.emit("aisle-reopened", "info", `${closureId} reopened`, { closureId });
    return ok({ message: `${closureId} reopened`, entityId: closureId });
  }

  private failRobot(robotId: string, reason?: string): CommandResult {
    const robot = this.robotById(robotId);
    if (!robot) return err("unknown-robot", `Unknown robot "${robotId}"`);
    if (robot.status === "failed") return err("robot-unavailable", `${robotId} has already failed`);
    const why = reason?.trim() || "Marked failed by operator";
    this.setStatus(robot, "failed");
    robot.action = "halted";
    robot.path = [];
    robot.dwell = 0;
    robot.blockedTicks = 0;
    robot.chargerId = null;
    robot.note = why;
    this.emit("robot-failed", "critical", `${robotId} failed: ${why}`, { robotId, missionId: robot.missionId ?? undefined });
    if (robot.missionId) {
      const mission = this.missions.get(robot.missionId)!;
      if (isActiveMission(mission.state)) {
        this.setMission(mission.id, "recovery-required");
        const pkg = this.pkg(mission.packageId);
        this.setPackage(
          annotateCustody(pkg, this.tick, robotId, `Holder ${robotId} failed while package ${pkg.state}; custody retained pending recovery`),
        );
        this.emit("mission-recovery-required", "critical", `${mission.id} needs recovery: ${mission.packageId} is ${pkg.state} with failed ${robotId}`, {
          robotId,
          missionId: mission.id,
          packageId: mission.packageId,
        });
      }
    }
    // Other robots' routes may cross the now-stationary robot.
    for (const other of this.robots) {
      if (other !== robot && other.path.some((p) => samePoint(p, robot.position))) other.needsReplan = "closure";
    }
    return ok({ message: `${robotId} marked failed`, entityId: robotId });
  }

  // =============================================================== helpers

  private createMissionInternal(job: MissionSpec): Mission {
    this.missionSeq += 1;
    this.packageSeq += 1;
    const missionId = `M-${1000 + this.missionSeq}`;
    const packageId = `PKG-${pad(this.packageSeq, 4)}`;
    const mission = createMission({ id: missionId, packageId, pickupStationId: job.pickup, dropoffStationId: job.dropoff, tick: this.tick });
    this.missions.set(missionId, mission);
    this.packages.set(
      packageId,
      createPackage({ id: packageId, missionId, originStationId: job.pickup, destinationStationId: job.dropoff, tick: this.tick }),
    );
    this.emit("mission-created", "info", `${missionId} created: ${packageId} ${job.pickup} → ${job.dropoff}`, {
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
    refs: Pick<SimEvent, "robotId" | "missionId" | "packageId" | "stationId" | "closureId"> = {},
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

  private buildSnapshot(): SimulationSnapshot {
    const robots: RobotState[] = this.robots.map((r) => ({
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
      destinationStationId: r.status === "failed" ? null : r.goalStationId,
      destination: r.status === "failed" ? null : r.goal,
      route: r.path.slice(),
      blockedTicks: r.blockedTicks,
      activityNote: r.note,
      stats: { ...r.stats },
    }));
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
      metrics: computeMetrics(this.tick, robots, missions, this.deliveryTicks.length, this.closures.length),
    };
  }
}
