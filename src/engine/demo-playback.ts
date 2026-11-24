import type {
  FleetMetrics,
  GridPoint,
  Heading,
  Mission,
  RobotState,
  RobotStatus,
  SimEvent,
  SimEventKind,
  EventSeverity,
  SimulationSnapshot,
} from "../types/simulation";
import type { CompiledRobot, CompiledScenario, CompiledStep } from "./scenario";

/**
 * Deterministic demo playback for Mission 001.
 *
 * - Pure TypeScript: no React, DOM, timers, or randomness.
 * - Advances in discrete ticks; the UI decides *when* to call `step()`.
 * - Same scenario + same number of steps ⇒ identical snapshot.
 *
 * It replays hand-authored robot programs. It does NOT plan routes,
 * reserve cells, prevent collisions, detect deadlocks, or recover from
 * failures. Those responsibilities belong to the engine modules planned
 * in ARCHITECTURE.md and will replace this class behind the same
 * `SimulationSource` interface.
 */
export interface SimulationSource {
  readonly scenarioId: string;
  getSnapshot(): SimulationSnapshot;
  step(): SimulationSnapshot;
  reset(): SimulationSnapshot;
  /** Jump to an absolute tick by deterministic replay. */
  seek(tick: number): SimulationSnapshot;
}

const MAX_EVENTS = 200;
const MAX_FINISHED_MISSIONS = 120;
const LOW_BATTERY = 20;

const BATTERY_DRAIN_MOVE = 0.12;
const BATTERY_DRAIN_IDLE = 0.02;
const BATTERY_CHARGE = 1.1;

interface RobotRuntime {
  readonly def: CompiledRobot;
  position: GridPoint;
  previousPosition: GridPoint;
  heading: Heading;
  status: RobotStatus;
  battery: number;
  stepIndex: number;
  stepProgress: number;
  missionId: string | null;
  packageId: string | null;
  activityNote: string | null;
  faulted: boolean;
  lowBatteryFlagged: boolean;
  stats: {
    movingTicks: number;
    waitingTicks: number;
    busyTicks: number;
    distance: number;
    deliveries: number;
  };
}

interface MutableMission {
  id: string;
  packageId: string;
  robotId: string | null;
  pickupStationId: string;
  dropoffStationId: string;
  state: Mission["state"];
  createdTick: number;
  pickedTick: number | null;
  completedTick: number | null;
}

function headingFromDelta(from: GridPoint, to: GridPoint, fallback: Heading): Heading {
  if (to.x > from.x) return "E";
  if (to.x < from.x) return "W";
  if (to.y > from.y) return "S";
  if (to.y < from.y) return "N";
  return fallback;
}

function clampBattery(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function programMission(program: readonly CompiledStep[]) {
  const load = program.find((s) => s.op === "load");
  const unload = program.find((s) => s.op === "unload");
  if (load?.op === "load" && unload?.op === "unload") {
    return { pickup: load.station, dropoff: unload.station };
  }
  return null;
}

export class DemoPlayback implements SimulationSource {
  readonly scenarioId: string;

  private tick = 0;
  private robots: RobotRuntime[] = [];
  private missions: MutableMission[] = [];
  private events: SimEvent[] = [];
  private deliveryTicks: number[] = [];
  private eventSeq = 0;
  private missionSeq = 0;
  private packageSeq = 0;
  private snapshot: SimulationSnapshot;

  constructor(private readonly scenario: CompiledScenario) {
    this.scenarioId = scenario.definition.id;
    this.initialise();
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot(): SimulationSnapshot {
    return this.snapshot;
  }

  reset(): SimulationSnapshot {
    this.initialise();
    this.snapshot = this.buildSnapshot();
    return this.snapshot;
  }

  seek(tick: number): SimulationSnapshot {
    const target = Math.max(0, Math.floor(tick));
    if (target < this.tick) this.initialise();
    while (this.tick < target) this.advance();
    this.snapshot = this.buildSnapshot();
    return this.snapshot;
  }

  step(): SimulationSnapshot {
    this.advance();
    this.snapshot = this.buildSnapshot();
    return this.snapshot;
  }

  // ---------------------------------------------------------------- setup

  private initialise(): void {
    this.tick = 0;
    this.events = [];
    this.missions = [];
    this.deliveryTicks = [];
    this.eventSeq = 0;
    this.missionSeq = 0;
    this.packageSeq = 0;

    this.robots = this.scenario.robots.map((def) => ({
      def,
      position: def.start,
      previousPosition: def.start,
      heading: def.heading,
      status: "idle",
      battery: def.battery,
      stepIndex: 0,
      stepProgress: 0,
      missionId: null,
      packageId: null,
      activityNote: def.startDelay ? `Staged until tick ${def.startDelay}` : null,
      faulted: false,
      lowBatteryFlagged: def.battery < LOW_BATTERY,
      stats: { movingTicks: 0, waitingTicks: 0, busyTicks: 0, distance: 0, deliveries: 0 },
    }));

    for (const job of this.scenario.definition.backlog) {
      this.missions.push({
        id: this.nextMissionId(),
        packageId: this.nextPackageId(),
        robotId: null,
        pickupStationId: job.pickup,
        dropoffStationId: job.dropoff,
        state: "queued",
        createdTick: 0,
        pickedTick: null,
        completedTick: null,
      });
    }

    this.emit("scenario-loaded", "info", `Scenario "${this.scenario.definition.name}" loaded`);

    // Robots that start at the beginning of a mission cycle get one immediately.
    for (const robot of this.robots) {
      if (!robot.def.startDelay) this.beginCycleIfNeeded(robot);
    }
  }

  // ----------------------------------------------------------------- tick

  private advance(): void {
    this.tick += 1;
    for (const robot of this.robots) this.advanceRobot(robot);
  }

  private advanceRobot(robot: RobotRuntime): void {
    robot.previousPosition = robot.position;
    const { def } = robot;

    if (robot.faulted) return;

    if (def.fault && this.tick >= def.fault.tick) {
      this.triggerFault(robot, def.fault.reason);
      return;
    }

    if (def.program.length === 0) {
      robot.status = "idle";
      robot.battery = clampBattery(robot.battery - BATTERY_DRAIN_IDLE);
      return;
    }

    if (def.startDelay && this.tick <= def.startDelay) {
      robot.status = "idle";
      robot.battery = clampBattery(robot.battery - BATTERY_DRAIN_IDLE);
      if (this.tick === def.startDelay) {
        robot.activityNote = null;
        this.beginCycleIfNeeded(robot);
      }
      return;
    }

    // Skip any zero-length travel steps so every tick performs an action.
    let guard = def.program.length;
    while (guard > 0) {
      const current = def.program[robot.stepIndex];
      if (current.op === "travel" && current.cells.length === 0) {
        this.completeStep(robot);
        guard -= 1;
      } else break;
    }

    const step = def.program[robot.stepIndex];
    robot.stepProgress += 1;

    switch (step.op) {
      case "travel": {
        const next = step.cells[robot.stepProgress - 1];
        robot.heading = headingFromDelta(robot.position, next, robot.heading);
        robot.position = next;
        robot.status = "moving";
        robot.activityNote = null;
        robot.stats.movingTicks += 1;
        robot.stats.busyTicks += 1;
        robot.stats.distance += 1;
        robot.battery = clampBattery(robot.battery - BATTERY_DRAIN_MOVE);
        if (robot.stepProgress >= step.cells.length) this.completeStep(robot);
        break;
      }
      case "load":
      case "unload": {
        robot.status = step.op === "load" ? "loading" : "unloading";
        robot.activityNote = `${step.op === "load" ? "Loading at" : "Unloading at"} ${step.station}`;
        robot.stats.busyTicks += 1;
        robot.battery = clampBattery(robot.battery - BATTERY_DRAIN_IDLE);
        if (robot.stepProgress >= step.ticks) this.completeStep(robot);
        break;
      }
      case "charge": {
        if (robot.stepProgress === 1) {
          this.emit("robot-charging", "info", `${robot.def.id} docked at ${step.station}`, {
            robotId: robot.def.id,
            stationId: step.station,
          });
        }
        robot.status = "charging";
        robot.activityNote = `Charging at ${step.station}`;
        robot.battery = clampBattery(robot.battery + BATTERY_CHARGE);
        if (robot.stepProgress >= step.ticks) this.completeStep(robot);
        break;
      }
      case "wait": {
        if (robot.stepProgress === 1) {
          this.emit("robot-waiting", "warning", `${robot.def.id} holding: ${step.reason}`, {
            robotId: robot.def.id,
            missionId: robot.missionId ?? undefined,
          });
        }
        robot.status = "waiting";
        robot.activityNote = step.reason;
        robot.stats.waitingTicks += 1;
        robot.battery = clampBattery(robot.battery - BATTERY_DRAIN_IDLE);
        if (robot.stepProgress >= step.ticks) this.completeStep(robot);
        break;
      }
    }

    if (robot.battery < LOW_BATTERY && !robot.lowBatteryFlagged) {
      robot.lowBatteryFlagged = true;
      this.emit(
        "battery-low",
        "warning",
        `${robot.def.id} battery below ${LOW_BATTERY}% (sample telemetry)`,
        { robotId: robot.def.id },
      );
    } else if (robot.battery >= LOW_BATTERY + 10) {
      robot.lowBatteryFlagged = false;
    }
  }

  private completeStep(robot: RobotRuntime): void {
    const step = robot.def.program[robot.stepIndex];
    const mission = robot.missionId ? this.findMission(robot.missionId) : undefined;

    if (step.op === "load" && mission) {
      mission.state = "carrying";
      mission.pickedTick = this.tick;
      robot.packageId = mission.packageId;
      this.emit(
        "pickup-complete",
        "info",
        `${robot.def.id} picked ${mission.packageId} at ${step.station}`,
        { robotId: robot.def.id, missionId: mission.id, stationId: step.station },
      );
    }

    if (step.op === "unload" && mission) {
      mission.state = "completed";
      mission.completedTick = this.tick;
      robot.packageId = null;
      robot.missionId = null;
      robot.stats.deliveries += 1;
      this.deliveryTicks.push(this.tick);
      this.emit(
        "delivery-complete",
        "success",
        `${robot.def.id} delivered ${mission.packageId} to ${step.station}`,
        { robotId: robot.def.id, missionId: mission.id, stationId: step.station },
      );
    }

    robot.stepIndex = (robot.stepIndex + 1) % robot.def.program.length;
    robot.stepProgress = 0;
    if (robot.stepIndex === 0) this.beginCycleIfNeeded(robot);
  }

  private beginCycleIfNeeded(robot: RobotRuntime): void {
    if (robot.missionId) return;
    const job = programMission(robot.def.program);
    if (!job) return;
    const mission: MutableMission = {
      id: this.nextMissionId(),
      packageId: this.nextPackageId(),
      robotId: robot.def.id,
      pickupStationId: job.pickup,
      dropoffStationId: job.dropoff,
      state: "to-pickup",
      createdTick: this.tick,
      pickedTick: null,
      completedTick: null,
    };
    this.missions.push(mission);
    robot.missionId = mission.id;
    this.emit(
      "mission-assigned",
      "info",
      `${mission.id} assigned to ${robot.def.id} (${job.pickup} → ${job.dropoff})`,
      { robotId: robot.def.id, missionId: mission.id },
    );
    this.pruneMissions();
  }

  private triggerFault(robot: RobotRuntime, reason: string): void {
    robot.faulted = true;
    robot.status = "fault";
    robot.activityNote = reason;
    const mission = robot.missionId ? this.findMission(robot.missionId) : undefined;
    if (mission) mission.state = "recovery-required";
    this.emit("robot-fault", "critical", `${robot.def.id} fault: ${reason}`, {
      robotId: robot.def.id,
      missionId: mission?.id,
    });
  }

  // -------------------------------------------------------------- helpers

  private findMission(id: string): MutableMission | undefined {
    return this.missions.find((m) => m.id === id);
  }

  private nextMissionId(): string {
    this.missionSeq += 1;
    return `M-${1000 + this.missionSeq}`;
  }

  private nextPackageId(): string {
    this.packageSeq += 1;
    return `PKG-${String(this.packageSeq).padStart(4, "0")}`;
  }

  private pruneMissions(): void {
    const finished = this.missions.filter((m) => m.state === "completed");
    if (finished.length <= MAX_FINISHED_MISSIONS) return;
    const drop = new Set(finished.slice(0, finished.length - MAX_FINISHED_MISSIONS).map((m) => m.id));
    this.missions = this.missions.filter((m) => !drop.has(m.id));
  }

  private emit(
    kind: SimEventKind,
    severity: EventSeverity,
    message: string,
    refs: Pick<SimEvent, "robotId" | "missionId" | "stationId"> = {},
  ): void {
    this.eventSeq += 1;
    this.events.push({ seq: this.eventSeq, tick: this.tick, kind, severity, message, ...refs });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  // ------------------------------------------------------------- snapshot

  private routeFor(robot: RobotRuntime): { route: GridPoint[]; destination: string | null } {
    const { program } = robot.def;
    if (robot.faulted || program.length === 0) return { route: [], destination: null };

    const route: GridPoint[] = [];
    for (let offset = 0; offset < program.length; offset += 1) {
      const index = (robot.stepIndex + offset) % program.length;
      const step = program[index];
      if (step.op === "travel") {
        const from = offset === 0 ? robot.stepProgress : 0;
        route.push(...step.cells.slice(from));
      } else if (step.op !== "wait") {
        return { route, destination: step.station };
      }
    }
    return { route, destination: null };
  }

  private buildSnapshot(): SimulationSnapshot {
    const robots: RobotState[] = this.robots.map((r) => {
      const { route, destination } = this.routeFor(r);
      return {
        id: r.def.id,
        model: r.def.model,
        colorIndex: r.def.colorIndex,
        position: r.position,
        previousPosition: r.previousPosition,
        heading: r.heading,
        status: r.status,
        battery: Math.round(r.battery * 10) / 10,
        missionId: r.missionId,
        packageId: r.packageId,
        destinationStationId: destination,
        route,
        activityNote: r.activityNote,
        stats: { ...r.stats },
      };
    });

    const missions: Mission[] = this.missions.map((m) => ({ ...m }));
    return {
      source: "demo-script",
      scenarioId: this.scenarioId,
      tick: this.tick,
      layout: this.scenario.layout,
      robots,
      missions,
      events: this.events.slice(),
      deliveryTicks: this.deliveryTicks.slice(),
      metrics: computeMetrics(this.tick, robots, missions),
    };
  }
}

export function computeMetrics(
  tick: number,
  robots: readonly RobotState[],
  missions: readonly Mission[],
): FleetMetrics {
  const robotById = new Map(robots.map((r) => [r.id, r]));
  const faulted = robots.filter((r) => r.status === "fault").length;
  const idle = robots.filter((r) => r.status === "idle" || r.status === "charging").length;
  const waiting = robots.filter((r) => r.status === "waiting").length;
  const lowBattery = robots.filter((r) => r.status !== "fault" && r.battery < LOW_BATTERY).length;
  const active = robots.length - faulted - idle;

  const activeMissions = missions.filter(
    (m) => m.state === "assigned" || m.state === "to-pickup" || m.state === "carrying",
  );
  const waitingMissions = activeMissions.filter(
    (m) => m.robotId !== null && robotById.get(m.robotId)?.status === "waiting",
  ).length;
  const busy = robots.reduce((sum, r) => sum + r.stats.busyTicks, 0);

  return {
    totalRobots: robots.length,
    activeRobots: active,
    idleRobots: idle,
    faultedRobots: faulted,
    waitingRobots: waiting,
    activeMissions: activeMissions.length,
    queuedMissions: missions.filter((m) => m.state === "queued").length,
    waitingMissions,
    completedDeliveries: robots.reduce((sum, r) => sum + r.stats.deliveries, 0),
    // One open incident per faulted robot (its stranded mission is part of
    // that incident), per scripted conflict hold, and per low-battery robot.
    openIncidents: faulted + waiting + lowBattery,
    utilisation: tick === 0 || robots.length === 0 ? 0 : busy / (tick * robots.length),
  };
}

export const LOW_BATTERY_THRESHOLD = LOW_BATTERY;
