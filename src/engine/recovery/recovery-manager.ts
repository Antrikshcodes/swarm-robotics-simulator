import type {
  EventSeverity,
  FailureStatus,
  FailureType,
  GridPoint,
  RecoverySnapshot,
  RecoveryTask,
  RecoveryTaskStatus,
  RescueAttempt,
  RescueOutcome,
  RobotFailure,
  SimEventKind,
} from "../../types/simulation";

/**
 * Failure recovery manager.
 *
 * Owns the failure records of robots and the recovery tasks of packages that
 * were stranded on a failed robot. It decides; the engine acts:
 *
 *  - The engine reports failures, restorations, rescuer arrivals and
 *    completed handovers (record*, on* methods).
 *  - Every tick `update()` looks at open tasks and returns which robot to
 *    dispatch where (`dispatch`) and which rescuers to release (`release`).
 *    The engine turns a dispatch into an ordinary movement goal, planned by
 *    the same space-time coordinator and reservation table as every other
 *    move — there is no second movement or reservation mechanism.
 *
 * Selection is deterministic: among eligible robots (operational, no mission,
 * no package, no other rescue, enough battery), the one with the shortest
 * static distance to a free cell next to the failed robot; ties go to the
 * lower robot rank. A rescuer that does not reach the handover within
 * `timeoutTicks` is released and excluded for the rest of the budget; after
 * `maxAttempts` the task fails safely (`recovery_failed`) and is retried
 * only after the warehouse changes. Custody never moves inside this module.
 */
export interface RecoveryOptions {
  /** Dispatch a rescuer automatically when a package is stranded (default true). */
  readonly autoStart?: boolean;
  /** Ticks a rescuer may take to start the handover (default 120). */
  readonly timeoutTicks?: number;
  /** Rescue attempts per budget (default 3). */
  readonly maxAttempts?: number;
  /** Ticks the handover takes once the rescuer is beside the failed robot (default 2). */
  readonly handoverTicks?: number;
}

/** Ticks to restore a robot, by failure type. Battery failures end with a fresh battery. */
export const RESTORE_TICKS: Record<FailureType, number> = {
  motor: 12,
  battery: 8,
  navigation: 6,
  communication: 4,
  "emergency-stop": 2,
};

export const FAILURE_LABEL: Record<FailureType, string> = {
  motor: "Motor failure",
  battery: "Battery failure",
  navigation: "Navigation failure",
  communication: "Communication loss",
  "emergency-stop": "Emergency stop",
};

export interface RescueCandidate {
  readonly id: string;
  readonly rank: number;
  readonly cell: number;
}

export interface RecoveryPort {
  readonly tick: number;
  readonly worldVersion: number;
  /** Robots that may be sent to recover a package right now. */
  eligible(): readonly RescueCandidate[];
  /** Nearest usable cell next to `failedRobotId` from `fromCell`, with its static distance. */
  approach(failedRobotId: string, fromCell: number): { cell: number; distance: number } | null;
  /** Whether any operational robot could ever reach a cell next to the failed robot. */
  reachable(failedRobotId: string): boolean;
  /** The failed holder stopped on its own destination dock (nobody else can deliver there). */
  holderOnDestination(packageId: string): boolean;
}

export interface RecoveryEvent {
  readonly kind: SimEventKind;
  readonly severity: EventSeverity;
  readonly message: string;
  readonly robotId?: string;
  readonly robotIds: readonly string[];
  readonly taskId: string;
  readonly packageId: string;
  readonly missionId: string;
  readonly attempt?: number;
  readonly cell?: number;
  readonly action?: string;
  readonly status: RecoveryTaskStatus;
  readonly reason?: string;
}

export interface Dispatch {
  readonly taskId: string;
  readonly packageId: string;
  readonly rescuerId: string;
  readonly approachCell: number;
}

export interface RecoveryUpdate {
  readonly events: RecoveryEvent[];
  readonly dispatch: Dispatch[];
  /** Rescuers to stand down (timeout, cancellation …), with the task they leave. */
  readonly release: { readonly rescuerId: string; readonly taskId: string; readonly packageId: string }[];
}

interface MutableAttempt {
  attempt: number;
  rescuerId: string;
  approachCell: number;
  startedTick: number;
  endedTick: number | null;
  outcome: RescueOutcome;
}

interface MutableTask {
  id: string;
  packageId: string;
  missionId: string;
  failedRobotId: string;
  rescuerId: string | null;
  status: RecoveryTaskStatus;
  createdTick: number;
  completedTick: number | null;
  attempts: MutableAttempt[];
  note: string;
  /** Attempts made before the current budget (reset on world change or manual start). */
  attemptBase: number;
  /** Rescuers that timed out in the current budget. */
  excluded: Set<string>;
  failedAtVersion: number | null;
  /** Operator-chosen rescuer for the next dispatch. */
  forced: string | null;
  /** Set by start_package_recovery; required when autoStart is off. */
  manual: boolean;
}

interface MutableFailure {
  id: string;
  robotId: string;
  type: FailureType;
  reason: string;
  tick: number;
  position: GridPoint;
  missionId: string | null;
  packageId: string | null;
  status: FailureStatus;
  restoreStartedTick: number | null;
  restoredTick: number | null;
}

const MAX_TASKS = 40;
const MAX_FAILURES = 60;

const OPEN: readonly RecoveryTaskStatus[] = ["pending", "en-route", "handover", "failed"];

export class RecoveryManager {
  readonly autoStart: boolean;
  readonly timeoutTicks: number;
  readonly maxAttempts: number;
  readonly handoverTicks: number;

  private tasks: MutableTask[] = [];
  private failures: MutableFailure[] = [];
  private taskSeq = 0;
  private failureSeq = 0;
  private stats = { failures: 0, restored: 0, handovers: 0, recoveryFailures: 0 };

  constructor(options: RecoveryOptions = {}) {
    this.autoStart = options.autoStart ?? true;
    this.timeoutTicks = options.timeoutTicks ?? 120;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.handoverTicks = options.handoverTicks ?? 2;
  }

  // ------------------------------------------------------------- failures

  recordFailure(params: Omit<RobotFailure, "id" | "status" | "restoreStartedTick" | "restoredTick">): RobotFailure {
    this.failureSeq += 1;
    const failure: MutableFailure = {
      ...params,
      id: `F-${String(this.failureSeq).padStart(2, "0")}`,
      status: "active",
      restoreStartedTick: null,
      restoredTick: null,
    };
    this.failures.push(failure);
    if (this.failures.length > MAX_FAILURES) this.failures.splice(0, this.failures.length - MAX_FAILURES);
    this.stats.failures += 1;
    return { ...failure };
  }

  /** Latest failure of a robot, if any. */
  failureOf(robotId: string): RobotFailure | null {
    for (let i = this.failures.length - 1; i >= 0; i -= 1) {
      if (this.failures[i].robotId === robotId) return { ...this.failures[i] };
    }
    return null;
  }

  beginRestore(robotId: string, tick: number): void {
    const f = this.mutableFailure(robotId);
    if (f) {
      f.status = "restoring";
      f.restoreStartedTick = tick;
    }
  }

  finishRestore(robotId: string, tick: number): void {
    const f = this.mutableFailure(robotId);
    if (f) {
      f.status = "restored";
      f.restoredTick = tick;
    }
    this.stats.restored += 1;
  }

  /** The robot failed again while being restored. */
  abortRestore(robotId: string): void {
    const f = this.mutableFailure(robotId);
    if (f && f.status === "restoring") f.status = "restored";
  }

  // ---------------------------------------------------------------- tasks

  openTask(packageId: string, missionId: string, failedRobotId: string, tick: number): RecoveryTask {
    this.taskSeq += 1;
    const task: MutableTask = {
      id: `RC-${String(this.taskSeq).padStart(2, "0")}`,
      packageId,
      missionId,
      failedRobotId,
      rescuerId: null,
      status: "pending",
      createdTick: tick,
      completedTick: null,
      attempts: [],
      note: this.autoStart ? "Selecting a recovery robot" : "Waiting for start_package_recovery",
      attemptBase: 0,
      excluded: new Set(),
      failedAtVersion: null,
      forced: null,
      manual: false,
    };
    this.tasks.push(task);
    this.prune();
    return this.view(task);
  }

  /** Open (unfinished) task for a package. */
  openTaskFor(packageId: string): RecoveryTask | null {
    const t = this.mutableOpen(packageId);
    return t ? this.view(t) : null;
  }

  /** Open task a robot is involved in, as failed holder or rescuer. */
  roleOf(robotId: string): { taskId: string; role: "holder" | "rescuer" } | null {
    for (const t of this.tasks) {
      if (!OPEN.includes(t.status)) continue;
      if (t.rescuerId === robotId) return { taskId: t.id, role: "rescuer" };
      if (t.failedRobotId === robotId) return { taskId: t.id, role: "holder" };
    }
    return null;
  }

  /** Operator start / restart: fresh budget, optional forced rescuer. */
  start(packageId: string, rescuerId: string | null): RecoveryTask | null {
    const t = this.mutableOpen(packageId) ?? this.latestCancelled(packageId);
    if (!t) return null;
    if (t.status === "en-route" || t.status === "handover") return null;
    t.status = "pending";
    t.manual = true;
    t.forced = rescuerId;
    t.attemptBase = t.attempts.length;
    t.excluded = new Set();
    t.failedAtVersion = null;
    t.completedTick = null;
    t.note = rescuerId ? `Operator selected ${rescuerId}` : "Selecting a recovery robot";
    return this.view(t);
  }

  /** The rescuer reached the cell beside the failed robot; handover starts. */
  onArrived(taskId: string): void {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t || t.status !== "en-route") return;
    t.status = "handover";
    t.note = `${t.rescuerId} beside ${t.failedRobotId}; handover in progress`;
  }

  /** Custody moved to the rescuer: the task is done. */
  onHandedOver(taskId: string, tick: number): void {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t) return;
    const a = t.attempts.at(-1);
    if (a) this.end(a, "handed-over", tick);
    t.status = "completed";
    t.completedTick = tick;
    t.note = `${t.rescuerId} took custody of ${t.packageId} and resumed delivery`;
    this.stats.handovers += 1;
  }

  /**
   * A robot failed: if it was a rescuer, its attempt ends and the task goes
   * back to selection (it never had custody). Returns the affected task.
   */
  onRescuerFailed(robotId: string, tick: number): RecoveryTask | null {
    const t = this.tasks.find((x) => OPEN.includes(x.status) && x.rescuerId === robotId);
    if (!t) return null;
    const a = t.attempts.at(-1);
    if (a && a.outcome === "in-progress") this.end(a, "rescuer-failed", tick);
    t.rescuerId = null;
    t.status = "pending";
    t.note = `Rescuer ${robotId} failed; selecting another recovery robot`;
    return this.view(t);
  }

  /** The failed holder was restored before a handover: it resumes delivery itself. */
  onHolderRestored(packageId: string, tick: number): { task: RecoveryTask; releasedRescuer: string | null } | null {
    const t = this.mutableOpen(packageId) ?? this.latestCancelled(packageId);
    if (!t || t.status === "completed") return null;
    const rescuer = t.rescuerId;
    const a = t.attempts.at(-1);
    if (a && a.outcome === "in-progress") this.end(a, "holder-restored", tick);
    t.rescuerId = null;
    t.status = "completed";
    t.completedTick = tick;
    t.note = `${t.failedRobotId} restored and resumed delivery itself`;
    return { task: this.view(t), releasedRescuer: rescuer };
  }

  /** Operator cancellation (only before custody changes). */
  cancel(packageId: string, tick: number): { task: RecoveryTask; releasedRescuer: string | null } | null {
    const t = this.mutableOpen(packageId);
    if (!t) return null;
    const rescuer = t.rescuerId;
    const a = t.attempts.at(-1);
    if (a && a.outcome === "in-progress") this.end(a, "cancelled", tick);
    t.rescuerId = null;
    t.status = "cancelled";
    t.manual = false;
    t.note = `Cancelled by operator; ${t.packageId} stays with ${t.failedRobotId}`;
    return { task: this.view(t), releasedRescuer: rescuer };
  }

  // --------------------------------------------------------------- update

  update(port: RecoveryPort): RecoveryUpdate {
    const events: RecoveryEvent[] = [];
    const dispatch: Dispatch[] = [];
    const release: RecoveryUpdate["release"] = [];
    const taken = new Set<string>();
    for (const t of this.tasks) if (t.rescuerId && (t.status === "en-route" || t.status === "handover")) taken.add(t.rescuerId);

    for (const t of this.tasks) {
      if (t.status === "en-route") {
        const a = t.attempts.at(-1)!;
        if (port.tick - a.startedTick >= this.timeoutTicks) {
          this.end(a, "timeout", port.tick);
          release.push({ rescuerId: a.rescuerId, taskId: t.id, packageId: t.packageId });
          taken.delete(a.rescuerId);
          t.excluded.add(a.rescuerId);
          t.rescuerId = null;
          t.status = "pending";
          t.note = `${a.rescuerId} did not reach ${t.failedRobotId} within ${this.timeoutTicks} ticks`;
        } else continue;
      }

      if (t.status === "failed") {
        if (t.failedAtVersion === port.worldVersion) continue;
        // The warehouse changed: retry with a fresh budget.
        t.status = "pending";
        t.attemptBase = t.attempts.length;
        t.excluded = new Set();
        t.failedAtVersion = null;
      }
      if (t.status !== "pending") continue;

      if (port.holderOnDestination(t.packageId)) {
        this.fail(t, port, events, `${t.failedRobotId} stopped on the destination dock; restore it to finish unloading`);
        continue;
      }
      if (t.attempts.length - t.attemptBase >= this.maxAttempts) {
        this.fail(t, port, events, `${this.maxAttempts} recovery attempts timed out`);
        continue;
      }
      if (!this.autoStart && !t.manual) continue;

      const choice = this.select(t, port, taken);
      if (!choice) {
        if (!port.reachable(t.failedRobotId)) {
          this.fail(t, port, events, `no operational robot can reach a cell next to ${t.failedRobotId}`);
        } else if (t.excluded.size > 0 && port.eligible().length > 0 && port.eligible().every((c) => t.excluded.has(c.id) || taken.has(c.id))) {
          this.fail(t, port, events, `every available robot timed out (${[...t.excluded].sort().join(", ")})`);
        } else if (t.forced) {
          t.note = `${t.forced} is not available to recover ${t.packageId}; waiting`;
        } else {
          t.note = "Waiting for a free robot to recover the package";
        }
        continue;
      }
      taken.add(choice.rescuerId);
      t.forced = null;
      t.rescuerId = choice.rescuerId;
      t.status = "en-route";
      const attempt: MutableAttempt = {
        attempt: t.attempts.length + 1,
        rescuerId: choice.rescuerId,
        approachCell: choice.cell,
        startedTick: port.tick,
        endedTick: null,
        outcome: "in-progress",
      };
      t.attempts.push(attempt);
      t.note = `${choice.rescuerId} heading to ${t.failedRobotId} (${choice.distance} cells)`;
      dispatch.push({ taskId: t.id, packageId: t.packageId, rescuerId: choice.rescuerId, approachCell: choice.cell });
      events.push({
        kind: "package_recovery_started",
        severity: "warning",
        message: `${t.id}: ${choice.rescuerId} dispatched to recover ${t.packageId} from ${t.failedRobotId} (attempt ${attempt.attempt}, ${choice.distance} cells; ${choice.why})`,
        robotId: choice.rescuerId,
        robotIds: [t.failedRobotId, choice.rescuerId],
        taskId: t.id,
        packageId: t.packageId,
        missionId: t.missionId,
        attempt: attempt.attempt,
        cell: choice.cell,
        action: "dispatch-rescuer",
        status: "en-route",
        reason: choice.why,
      });
    }
    return { events, dispatch, release };
  }

  private select(t: MutableTask, port: RecoveryPort, taken: ReadonlySet<string>): { rescuerId: string; cell: number; distance: number; why: string } | null {
    const candidates = port.eligible().filter((c) => !taken.has(c.id) && !t.excluded.has(c.id) && c.id !== t.failedRobotId);
    if (t.forced) {
      const forced = candidates.find((c) => c.id === t.forced);
      const route = forced ? port.approach(t.failedRobotId, forced.cell) : null;
      return forced && route ? { rescuerId: forced.id, ...route, why: "chosen by operator" } : null;
    }
    let best: { c: RescueCandidate; cell: number; distance: number } | null = null;
    for (const c of [...candidates].sort((a, b) => a.rank - b.rank)) {
      const route = port.approach(t.failedRobotId, c.cell);
      if (!route) continue;
      if (!best || route.distance < best.distance) best = { c, ...route };
    }
    if (!best) return null;
    return { rescuerId: best.c.id, cell: best.cell, distance: best.distance, why: "nearest available robot" };
  }

  private fail(t: MutableTask, port: RecoveryPort, events: RecoveryEvent[], reason: string): void {
    t.status = "failed";
    t.failedAtVersion = port.worldVersion;
    t.note = `Recovery failed: ${reason}. ${t.packageId} stays safely with ${t.failedRobotId}`;
    this.stats.recoveryFailures += 1;
    events.push({
      kind: "recovery_failed",
      severity: "critical",
      message: `${t.id}: cannot recover ${t.packageId} from ${t.failedRobotId} — ${reason}. Custody unchanged; retried when the warehouse changes`,
      robotId: t.failedRobotId,
      robotIds: [t.failedRobotId],
      taskId: t.id,
      packageId: t.packageId,
      missionId: t.missionId,
      attempt: t.attempts.length,
      action: "hold-custody",
      status: "failed",
      reason,
    });
  }

  private end(a: MutableAttempt, outcome: RescueOutcome, tick: number): void {
    a.outcome = outcome;
    a.endedTick = tick;
  }

  private mutableOpen(packageId: string): MutableTask | undefined {
    for (let i = this.tasks.length - 1; i >= 0; i -= 1) {
      const t = this.tasks[i];
      if (t.packageId === packageId && OPEN.includes(t.status)) return t;
    }
    return undefined;
  }

  private latestCancelled(packageId: string): MutableTask | undefined {
    for (let i = this.tasks.length - 1; i >= 0; i -= 1) {
      const t = this.tasks[i];
      if (t.packageId === packageId) return t.status === "cancelled" ? t : undefined;
    }
    return undefined;
  }

  private mutableFailure(robotId: string): MutableFailure | undefined {
    for (let i = this.failures.length - 1; i >= 0; i -= 1) {
      if (this.failures[i].robotId === robotId) return this.failures[i];
    }
    return undefined;
  }

  private prune(): void {
    while (this.tasks.length > MAX_TASKS) {
      const index = this.tasks.findIndex((t) => !OPEN.includes(t.status));
      if (index < 0) break;
      this.tasks.splice(index, 1);
    }
  }

  private view(t: MutableTask): RecoveryTask {
    return {
      id: t.id,
      packageId: t.packageId,
      missionId: t.missionId,
      failedRobotId: t.failedRobotId,
      rescuerId: t.rescuerId,
      status: t.status,
      createdTick: t.createdTick,
      completedTick: t.completedTick,
      attempts: [],
      note: t.note,
    };
  }

  snapshot(cellPoint: (cell: number) => GridPoint): RecoverySnapshot {
    const attempt = (a: MutableAttempt): RescueAttempt => ({
      attempt: a.attempt,
      rescuerId: a.rescuerId,
      approachCell: cellPoint(a.approachCell),
      startedTick: a.startedTick,
      endedTick: a.endedTick,
      outcome: a.outcome,
    });
    return {
      failures: this.failures.map((f) => ({ ...f })),
      tasks: this.tasks.map((t) => ({ ...this.view(t), attempts: t.attempts.map(attempt) })),
      stats: { ...this.stats },
      settings: {
        autoStart: this.autoStart,
        timeoutTicks: this.timeoutTicks,
        maxAttempts: this.maxAttempts,
        handoverTicks: this.handoverTicks,
      },
    };
  }

  /** Current rescue attempt's approach cell for a task. */
  approachOf(taskId: string): number | null {
    const t = this.tasks.find((x) => x.id === taskId);
    const a = t?.attempts.at(-1);
    return a && a.outcome === "in-progress" ? a.approachCell : null;
  }
}
