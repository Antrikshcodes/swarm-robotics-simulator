import type {
  DeadlockIncident,
  DeadlockKind,
  DeadlockSnapshot,
  DeadlockStatus,
  EventSeverity,
  RecoveryAttempt,
  RecoveryOutcome,
  WaitClass,
} from "../../types/simulation";
import { buildWaitForGraph, dependents, findCycles, groupKey, type WaitEdge } from "./wait-for-graph";

/**
 * Deadlock detection and autonomous recovery.
 *
 * Detection (every tick, after moves are committed):
 *  1. Build the wait-for graph over robots that are waiting (wait-for-graph.ts).
 *  2. Circular waits = strongly connected components with ≥ 2 robots.
 *  3. A cycle is a *deadlock* only once the same group has persisted for
 *     `confirmTicks` consecutive ticks and every member has waited at least
 *     that long — shorter cycles are counted as transient congestion.
 *  4. A *stall* is a robot with an active mission waiting ≥ `stallTicks`
 *     without being in a cycle (e.g. stuck behind a parked or failed robot).
 *
 * Recovery (per incident, bounded):
 *  1. Rank group members as yield candidates (deterministic): robots inside a
 *     narrow passage keep passage priority, then lower mission urgency,
 *     no package, shorter wait, higher robot id yield first.
 *  2. For the first candidate with a safe holding position — a reachable,
 *     traversable, non-station cell off every other member's route, not
 *     occupied or held by anyone — start an attempt: the engine releases the
 *     group's future reservations, holds the others in place, and replans the
 *     yielder first to the holding position, then everyone else.
 *  3. The attempt succeeds when the yielder has reached its holding position
 *     and every other member has made progress (or reached its goal). The
 *     yielder then resumes its own goal.
 *  4. Failed attempts (no route, timeout) move on to the next candidate, up to
 *     `maxAttempts`. If no candidate has a safe option the incident fails:
 *     robots stay in their safe waiting state and `deadlock_recovery_failed`
 *     is emitted; it is retried only when the world changes.
 *
 * Never: teleport, reset, delete missions, touch custody, or bypass the
 * reservation table — the manager only changes *goals* and *planning order*.
 */
export interface DeadlockRobotInput {
  readonly id: string;
  readonly rank: number;
  readonly cell: number;
  /** Current movement goal (own cell when it should stay). */
  readonly goal: number;
  readonly mode: "mobile" | "dwelling" | "failed";
  readonly waiting: boolean;
  /** Consecutive waiting ticks. */
  readonly waitStreak: number;
  readonly reservationBlocker: string | null;
  readonly hasMission: boolean;
  /** Mission urgency weight (0 when idle). */
  readonly missionWeight: number;
  readonly carrying: boolean;
  readonly onNarrow: boolean;
  /** Static distance to goal (-1 unreachable). */
  readonly distanceToGoal: number;
  /** Static route cells ahead (nearest first, may be truncated). */
  readonly routeAhead: readonly number[];
  /** Full static route to the goal (bounded), used to protect it during recovery. */
  readonly fullRoute: readonly number[];
  /** Coordinator plan status this tick and whether the plan ends at the goal. */
  readonly planComplete: boolean;
  readonly plannedRoute: readonly number[];
}

export interface DeadlockInput {
  readonly tick: number;
  readonly robots: readonly DeadlockRobotInput[];
  readonly occupant: ReadonlyMap<number, string>;
  readonly holder: ReadonlyMap<number, string>;
  /** Changes whenever the world changes (closures, failures, missions); unblocks failed incidents. */
  readonly worldVersion: number;
  /**
   * Find a safe holding position for `robotId`: BFS from its cell avoiding
   * other robots, returning the nearest cell outside `protectedCells`.
   */
  readonly findHolding: (robotId: string, protectedCells: ReadonlySet<number>) => { cell: number; route: number[] } | null;
}

export interface YieldOrder {
  readonly incidentId: string;
  readonly yielderId: string;
  readonly holdingCell: number;
  /** All robots in the group (yielder included). */
  readonly group: readonly string[];
}

export interface DeadlockEvent {
  readonly kind:
    | "deadlock_detected"
    | "deadlock_group_identified"
    | "deadlock_recovery_started"
    | "robot_yielded"
    | "recovery_route_planned"
    | "deadlock_resolved"
    | "deadlock_recovery_failed";
  readonly severity: EventSeverity;
  readonly message: string;
  readonly robotIds: readonly string[];
  readonly robotId?: string;
  readonly incidentId: string;
  readonly attempt?: number;
  readonly cell?: number;
  readonly action?: string;
  readonly status: DeadlockStatus;
}

export interface DeadlockUpdate {
  readonly events: readonly DeadlockEvent[];
  /** New yield orders to apply before the next tick's planning. */
  readonly start: readonly YieldOrder[];
  /** Robots whose yield order ended (resume their own goals). */
  readonly release: readonly string[];
  readonly edges: readonly WaitEdge[];
}

export interface DeadlockOptions {
  readonly recovery?: boolean;
  readonly confirmTicks?: number;
  readonly congestionTicks?: number;
  readonly stallTicks?: number;
  readonly maxAttempts?: number;
  readonly attemptTimeout?: number;
  readonly lookahead?: number;
}

interface MutableAttempt {
  attempt: number;
  yielderId: string;
  holdingCell: number | null;
  route: number[];
  startedTick: number;
  endedTick: number | null;
  outcome: RecoveryOutcome;
  note: string;
  routePlanned: boolean;
  heldSince: number | null;
  baseline: Map<string, number>;
  /** Consecutive ticks a cycle persisted among the non-yielding members while holding. */
  residualCycleTicks: number;
}

interface MutableIncident {
  id: string;
  key: string;
  kind: DeadlockKind;
  status: DeadlockStatus;
  robots: string[];
  dependents: string[];
  edges: WaitEdge[];
  blockingCells: number[];
  detectedTick: number;
  resolvedTick: number | null;
  attempts: MutableAttempt[];
  failureReason: string | null;
  failedAtVersion: number | null;
  clearTicks: number;
  /** Attempts made before the current budget started (budget resets when the world changes). */
  attemptBase: number;
  /** Yielders that reached their holding position and keep holding until the incident ends. */
  holders: Map<string, number>;
}

const MAX_INCIDENTS = 40;
const MIN_HOLD_TICKS = 2;
const PROGRESS_CELLS = 3;
const REOPEN_WINDOW = 60;

export class DeadlockManager {
  readonly recoveryEnabled: boolean;
  readonly confirmTicks: number;
  readonly congestionTicks: number;
  readonly stallTicks: number;
  readonly maxAttempts: number;
  readonly attemptTimeout: number;
  private readonly lookahead: number;

  private incidents: MutableIncident[] = [];
  private incidentSeq = 0;
  private cycleSeen = new Map<string, number>();
  private classes = new Map<string, WaitClass>();
  private robotIncident = new Map<string, string>();
  private lastEdges: WaitEdge[] = [];
  private pendingRelease: string[] = [];
  /** Robots in any circular wait this tick (confirmed or not). */
  private inCycle = new Set<string>();
  private stats = { detected: 0, resolved: 0, failed: 0, attempts: 0, transientCycles: 0 };

  constructor(options: DeadlockOptions = {}) {
    this.recoveryEnabled = options.recovery ?? true;
    this.confirmTicks = options.confirmTicks ?? 4;
    this.congestionTicks = options.congestionTicks ?? 3;
    this.stallTicks = options.stallTicks ?? 40;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.attemptTimeout = options.attemptTimeout ?? 60;
    this.lookahead = options.lookahead ?? 6;
  }

  update(input: DeadlockInput): DeadlockUpdate {
    const events: DeadlockEvent[] = [];
    const start: YieldOrder[] = [];
    const release: string[] = [];
    const byId = new Map(input.robots.map((r) => [r.id, r]));

    // ---- 1. Wait-for graph over waiting robots.
    const waiting = input.robots.filter((r) => r.mode === "mobile" && r.waiting && r.cell !== r.goal);
    const edges = buildWaitForGraph(
      waiting.map((r) => ({ id: r.id, routeAhead: r.routeAhead, reservationBlocker: r.reservationBlocker, reservationCell: null })),
      { occupant: input.occupant, holder: input.holder },
      this.lookahead,
    );
    this.lastEdges = edges;
    const cycles = findCycles(edges);
    this.inCycle = new Set(cycles.flat());

    // ---- 2. Persistence filter.
    const present = new Set<string>();
    const confirmed: string[][] = [];
    for (const group of cycles) {
      const key = groupKey(group);
      present.add(key);
      const seen = (this.cycleSeen.get(key) ?? 0) + 1;
      this.cycleSeen.set(key, seen);
      const allLong = group.every((id) => (byId.get(id)?.waitStreak ?? 0) >= this.confirmTicks);
      if (seen >= this.confirmTicks && allLong) confirmed.push(group);
    }
    for (const [key, seen] of this.cycleSeen) {
      if (present.has(key)) continue;
      if (seen < this.confirmTicks) this.stats.transientCycles += 1;
      this.cycleSeen.delete(key);
    }

    // ---- 3. Progress existing incidents.
    for (const incident of this.incidents) {
      if (incident.status === "resolved") continue;
      if (incident.kind === "cycle" && incident.status !== "recovering" && !present.has(incident.key)) {
        this.absorbGrowth(incident, cycles, edges, events);
      }
      this.progress(incident, input, byId, present, events, start, release);
    }

    // ---- 4. New deadlocks (cycles), then stalls.
    const busy = new Set<string>();
    for (const incident of this.incidents) {
      if (incident.status === "detected" || incident.status === "recovering" || incident.status === "failed") {
        for (const id of incident.robots) busy.add(id);
      }
    }
    for (const group of confirmed) {
      if (group.some((id) => busy.has(id))) continue;
      const incident = this.open("cycle", group, edges, input, events);
      group.forEach((id) => busy.add(id));
      if (this.recoveryEnabled) this.nextAttempt(incident, input, byId, events, start);
    }
    for (const robot of waiting) {
      if (busy.has(robot.id) || !robot.hasMission || robot.waitStreak < this.stallTicks) continue;
      const chain = this.blockerChain(robot.id, edges, byId);
      if (chain.length < 2 || chain.some((id) => busy.has(id))) continue;
      const incident = this.open("stall", chain, edges, input, events);
      chain.forEach((id) => busy.add(id));
      if (this.recoveryEnabled) this.nextAttempt(incident, input, byId, events, start);
    }

    // ---- 5. Classes.
    this.classes = new Map();
    this.robotIncident = new Map();
    for (const robot of input.robots) {
      if (!(robot.mode === "mobile" && robot.waiting && robot.cell !== robot.goal)) this.classes.set(robot.id, "none");
      else this.classes.set(robot.id, robot.waitStreak >= this.congestionTicks ? "congestion" : "waiting");
    }
    for (const incident of this.incidents) {
      if (incident.status === "resolved") continue;
      const active = incident.attempts.at(-1);
      for (const id of incident.robots) {
        this.robotIncident.set(id, incident.id);
        if (incident.status === "recovering" && active?.outcome === "in-progress") {
          this.classes.set(id, id === active.yielderId || incident.holders.has(id) ? "yielding" : "recovering");
        } else {
          this.classes.set(id, "deadlock");
        }
      }
    }

    this.prune();
    release.push(...this.pendingRelease);
    this.pendingRelease = [];
    return { events, start, release: [...new Set(release)], edges };
  }

  // ----------------------------------------------------------- incidents

  private open(kind: DeadlockKind, group: string[], edges: readonly WaitEdge[], input: DeadlockInput, events: DeadlockEvent[]): MutableIncident {
    const key = groupKey(group);
    const groupSet = new Set(group);
    const groupEdges = edges.filter((e) => groupSet.has(e.from) && groupSet.has(e.to));
    const blockingCells = [...new Set(groupEdges.map((e) => e.cell).filter((c) => c >= 0))].sort((a, b) => a - b);
    const deps = dependents(edges, group);

    // Re-detection soon after a resolution continues the same incident (bounded attempts).
    const recent = [...this.incidents]
      .reverse()
      .find((i) => i.key === key && i.status === "resolved" && i.resolvedTick !== null && input.tick - i.resolvedTick <= REOPEN_WINDOW);
    let incident: MutableIncident;
    if (recent) {
      incident = recent;
      incident.status = "detected";
      incident.resolvedTick = null;
      incident.edges = groupEdges;
      incident.blockingCells = blockingCells;
      incident.dependents = deps;
      this.stats.resolved -= 1;
      // Recurring soon after a resolution: keep the attempt count (bounded).
    } else {
      this.incidentSeq += 1;
      incident = {
        id: `DL-${String(this.incidentSeq).padStart(4, "0")}`,
        key,
        kind,
        status: "detected",
        robots: [...group],
        dependents: deps,
        edges: groupEdges,
        blockingCells,
        detectedTick: input.tick,
        resolvedTick: null,
        attempts: [],
        failureReason: null,
        failedAtVersion: null,
        clearTicks: 0,
        attemptBase: 0,
        holders: new Map(),
      };
      this.incidents.push(incident);
      this.stats.detected += 1;
    }

    const label = kind === "cycle" ? `circular wait among ${group.join(", ")}` : `${group[0]} cannot progress (blocked by ${group.slice(1).join(" → ")})`;
    events.push({
      kind: "deadlock_detected",
      severity: "critical",
      message: `${incident.id}: ${label}${recent ? " (recurred)" : ""}`,
      robotIds: group,
      incidentId: incident.id,
      cell: blockingCells[0],
      attempt: 0,
      action: "open-incident",
      status: "detected",
    });
    events.push({
      kind: "deadlock_group_identified",
      severity: "warning",
      message: `${incident.id} group: ${groupEdges.map((e) => `${e.from}→${e.to}`).join(", ") || group.join(", ")}${deps.length ? `; also waiting: ${deps.join(", ")}` : ""}`,
      robotIds: group,
      incidentId: incident.id,
      cell: blockingCells[0],
      attempt: 0,
      action: "identify-group",
      status: "detected",
    });
    return incident;
  }

  /**
   * A cycle that grew (another robot joined the circular wait) is the same
   * deadlock, not a resolution: extend the incident to the enlarged group.
   */
  private absorbGrowth(incident: MutableIncident, cycles: readonly string[][], edges: readonly WaitEdge[], events: DeadlockEvent[]) {
    const grown = cycles.find((c) => c.length > incident.robots.length && incident.robots.every((id) => c.includes(id)));
    if (!grown) return;
    const claimed = this.incidents.some((i) => i !== incident && i.status !== "resolved" && i.robots.some((id) => grown.includes(id)));
    if (claimed) return;
    const groupSet = new Set(grown);
    const added = grown.filter((id) => !incident.robots.includes(id));
    incident.key = groupKey(grown);
    incident.robots = [...grown];
    incident.edges = edges.filter((e) => groupSet.has(e.from) && groupSet.has(e.to));
    incident.blockingCells = [...new Set(incident.edges.map((e) => e.cell).filter((c) => c >= 0))].sort((a, b) => a - b);
    incident.dependents = dependents(edges, grown);
    incident.clearTicks = 0;
    events.push({
      kind: "deadlock_group_identified",
      severity: "warning",
      message: `${incident.id} group grew: ${added.join(", ")} joined the circular wait (${grown.join(", ")})`,
      robotIds: incident.robots,
      incidentId: incident.id,
      cell: incident.blockingCells[0],
      attempt: incident.attempts.length,
      action: "extend-group",
      status: incident.status === "failed" ? "failed" : "detected",
    });
  }

  private progress(
    incident: MutableIncident,
    input: DeadlockInput,
    byId: Map<string, DeadlockRobotInput>,
    present: Set<string>,
    events: DeadlockEvent[],
    start: YieldOrder[],
    release: string[],
  ): void {
    const stillCyclic = present.has(incident.key);

    if (incident.status === "failed") {
      // Retry only after the world changed; clear if the cycle dissolved on its own.
      if (!stillCyclic && incident.kind === "cycle") {
        incident.clearTicks += 1;
        if (incident.clearTicks >= this.confirmTicks) this.resolve(incident, input.tick, events, "cleared after the world changed");
        return;
      }
      incident.clearTicks = 0;
      if (this.recoveryEnabled && incident.failedAtVersion !== input.worldVersion) {
        incident.status = "detected";
        incident.failureReason = null;
        incident.attemptBase = incident.attempts.length;
        this.nextAttempt(incident, input, byId, events, start);
      }
      return;
    }

    if (incident.status === "detected") {
      // Detection-only mode (or between attempts): resolve once the cycle is gone.
      if (!stillCyclic) {
        incident.clearTicks += 1;
        if (incident.clearTicks >= this.confirmTicks) this.resolve(incident, input.tick, events, "cleared without intervention");
      } else incident.clearTicks = 0;
      return;
    }

    // recovering
    const attempt = incident.attempts.at(-1)!;
    const yielder = byId.get(attempt.yielderId);
    const failedMember = incident.robots.find((id) => byId.get(id)?.mode === "failed");
    if (failedMember) {
      this.endAttempt(incident, attempt, input.tick, "aborted", `${failedMember} failed during recovery`);
      release.push(attempt.yielderId);
      this.fail(incident, input, events, `${failedMember} failed during recovery`);
      return;
    }
    if (!yielder) return;

    if (!attempt.routePlanned) {
      if (yielder.planComplete && attempt.holdingCell !== null && yielder.goal === attempt.holdingCell) {
        attempt.routePlanned = true;
        if (yielder.plannedRoute.length > 0) attempt.route = [...yielder.plannedRoute];
        events.push({
          kind: "recovery_route_planned",
          severity: "info",
          message: `${incident.id} attempt ${attempt.attempt}: ${yielder.id} reserved a ${attempt.route.length}-cell route to its holding position`,
          robotIds: incident.robots,
          robotId: yielder.id,
          incidentId: incident.id,
          attempt: attempt.attempt,
          cell: attempt.holdingCell,
          action: "reserve-route-to-holding-position",
          status: "recovering",
        });
      } else if (input.tick - attempt.startedTick >= 2) {
        this.endAttempt(incident, attempt, input.tick, "no-route", `${yielder.id} could not reserve a safe route to its holding position`);
        release.push(yielder.id);
        this.nextAttempt(incident, input, byId, events, start);
        return;
      }
    }

    if (attempt.holdingCell !== null && yielder.cell === attempt.holdingCell) attempt.heldSince ??= input.tick;
    const holding = new Set([...incident.holders.keys(), yielder.id]);
    const active = incident.robots.filter((id) => !holding.has(id));
    const progressed = active.every((id) => {
      const r = byId.get(id);
      if (!r) return true;
      if (r.mode !== "mobile" || r.cell === r.goal) return true;
      const base = attempt.baseline.get(id);
      if (base === undefined || base < 0) return !r.waiting;
      return r.distanceToGoal >= 0 && r.distanceToGoal <= base - Math.min(PROGRESS_CELLS, base);
    });
    if (attempt.heldSince !== null && input.tick - attempt.heldSince >= MIN_HOLD_TICKS && progressed) {
      this.endAttempt(incident, attempt, input.tick, "resolved", "others progressed; yielders resume their goals");
      release.push(yielder.id, ...incident.holders.keys());
      incident.holders.clear();
      this.resolve(incident, input.tick, events, `${[...holding].join(", ")} yielded at holding positions`);
      return;
    }

    // Cascade: the yielder is out of the way but the remaining robots still wait
    // on each other (e.g. one parked in a junction). Keep it holding and pick
    // the next yielder among the rest instead of waiting for the timeout.
    if (attempt.heldSince !== null && input.tick - attempt.heldSince >= MIN_HOLD_TICKS) {
      const activeSet = new Set(active);
      const residual = input.tick >= 0 && this.residualCycle(activeSet);
      attempt.residualCycleTicks = residual ? attempt.residualCycleTicks + 1 : 0;
      if (attempt.residualCycleTicks >= this.confirmTicks) {
        this.endAttempt(incident, attempt, input.tick, "escalated", `${yielder.id} keeps holding; a cycle remains among ${active.join(", ")}`);
        incident.holders.set(yielder.id, attempt.holdingCell!);
        this.nextAttempt(incident, input, byId, events, start);
        return;
      }
    }

    if (input.tick - attempt.startedTick >= this.attemptTimeout) {
      this.endAttempt(incident, attempt, input.tick, "timeout", `no progress within ${this.attemptTimeout} ticks`);
      release.push(yielder.id);
      this.nextAttempt(incident, input, byId, events, start);
    }
  }

  /** True if this tick's wait-for graph has a cycle made only of `members`. */
  private residualCycle(members: Set<string>): boolean {
    return findCycles(this.lastEdges.filter((e) => members.has(e.from) && members.has(e.to))).length > 0;
  }

  private nextAttempt(
    incident: MutableIncident,
    input: DeadlockInput,
    byId: Map<string, DeadlockRobotInput>,
    events: DeadlockEvent[],
    start: YieldOrder[],
  ): void {
    if (incident.attempts.length - incident.attemptBase >= this.maxAttempts) {
      this.fail(incident, input, events, `${this.maxAttempts} recovery attempts did not resolve it`);
      return;
    }
    const tried = new Set(incident.attempts.map((a) => a.yielderId));
    const pool = incident.robots.filter((id) => !incident.holders.has(id));
    const candidates = this.rankCandidates(pool, byId);
    const ordered = [...candidates.filter((id) => !tried.has(id)), ...candidates.filter((id) => tried.has(id))];

    for (const yielderId of ordered) {
      const protectedCells = new Set<number>();
      for (const id of [...pool, ...incident.dependents]) {
        if (id === yielderId) continue;
        const r = byId.get(id);
        if (!r) continue;
        protectedCells.add(r.cell);
        for (const c of r.fullRoute) protectedCells.add(c);
      }
      const holding = input.findHolding(yielderId, protectedCells);
      if (!holding) continue;

      const baseline = new Map<string, number>();
      for (const id of pool) if (id !== yielderId) baseline.set(id, byId.get(id)?.distanceToGoal ?? -1);
      const attempt: MutableAttempt = {
        attempt: incident.attempts.length + 1,
        yielderId,
        holdingCell: holding.cell,
        route: holding.route,
        startedTick: input.tick,
        endedTick: null,
        outcome: "in-progress",
        note: "",
        routePlanned: false,
        heldSince: null,
        baseline,
        residualCycleTicks: 0,
      };
      incident.attempts.push(attempt);
      incident.status = "recovering";
      incident.clearTicks = 0;
      this.stats.attempts += 1;
      start.push({ incidentId: incident.id, yielderId, holdingCell: holding.cell, group: incident.robots });
      const yielder = byId.get(yielderId)!;
      events.push({
        kind: "deadlock_recovery_started",
        severity: "warning",
        message: `${incident.id} attempt ${attempt.attempt}/${this.maxAttempts}: ${yielderId} selected to yield (${this.reason(yielder, incident.robots, byId)})`,
        robotIds: incident.robots,
        robotId: yielderId,
        incidentId: incident.id,
        attempt: attempt.attempt,
        cell: incident.blockingCells[0],
        action: "select-yielder",
        status: "recovering",
      });
      events.push({
        kind: "robot_yielded",
        severity: "info",
        message: `${yielderId} yields: releasing its reservations and moving to a holding position ${holding.route.length} cells away`,
        robotIds: incident.robots,
        robotId: yielderId,
        incidentId: incident.id,
        attempt: attempt.attempt,
        cell: holding.cell,
        action: "yield-to-holding-position",
        status: "recovering",
      });
      return;
    }

    // Nobody can make way safely.
    const attempt: MutableAttempt = {
      attempt: incident.attempts.length + 1,
      yielderId: ordered[0] ?? incident.robots[0],
      holdingCell: null,
      route: [],
      startedTick: input.tick,
      endedTick: input.tick,
      outcome: "no-holding-position",
      note: "no group member has a reachable holding position off the others' routes",
      routePlanned: false,
      heldSince: null,
      baseline: new Map(),
      residualCycleTicks: 0,
    };
    incident.attempts.push(attempt);
    this.stats.attempts += 1;
    this.fail(incident, input, events, "no safe holding position for any robot in the group");
  }

  /**
   * Yield order (first entry yields first). Higher score keeps right-of-way:
   *  - inside a narrow passage: +1000 (robots already committed keep going)
   *  - convoy: +100 per robot queued directly behind it outside the group
   *    (directional priority — the larger flow keeps the passage)
   *  - mission urgency weight, +5 when carrying, + waiting ticks (≤ 30)
   * Ties: the higher robot id yields.
   */
  rankCandidates(group: readonly string[], byId: Map<string, DeadlockRobotInput>): string[] {
    const inGroup = new Set(group);
    const convoy = (id: string) => this.lastEdges.filter((e) => e.to === id && !inGroup.has(e.from)).length;
    const score = (r: DeadlockRobotInput) =>
      (r.onNarrow ? 1000 : 0) + 100 * convoy(r.id) + r.missionWeight + (r.carrying ? 5 : 0) + Math.min(r.waitStreak, 30);
    return group
      .map((id) => byId.get(id))
      .filter((r): r is DeadlockRobotInput => r !== undefined && r.mode === "mobile")
      .sort((a, b) => score(a) - score(b) || b.rank - a.rank)
      .map((r) => r.id);
  }

  private reason(r: DeadlockRobotInput, group: readonly string[], byId: Map<string, DeadlockRobotInput>): string {
    const parts: string[] = [];
    const others = group.map((id) => byId.get(id)).filter((x): x is DeadlockRobotInput => !!x && x.id !== r.id);
    if (!r.onNarrow && others.some((o) => o.onNarrow)) parts.push("outside the narrow passage");
    const inGroup = new Set(group);
    const convoy = (id: string) => this.lastEdges.filter((e) => e.to === id && !inGroup.has(e.from)).length;
    if (others.some((o) => convoy(o.id) > convoy(r.id))) parts.push("smaller convoy");
    if (parts.length === 0 && others.some((o) => Math.min(o.waitStreak, 30) > Math.min(r.waitStreak, 30))) parts.push("has waited less");
    if (others.some((o) => o.missionWeight > r.missionWeight)) parts.push("lower mission urgency");
    if (!r.carrying && others.some((o) => o.carrying)) parts.push("not carrying");
    if (parts.length === 0) parts.push("tie-break by robot id");
    return parts.join(", ");
  }

  private endAttempt(incident: MutableIncident, attempt: MutableAttempt, tick: number, outcome: RecoveryOutcome, note: string) {
    attempt.outcome = outcome;
    attempt.endedTick = tick;
    attempt.note = note;
    void incident;
  }

  private resolve(incident: MutableIncident, tick: number, events: DeadlockEvent[], how: string) {
    incident.status = "resolved";
    incident.resolvedTick = tick;
    incident.failureReason = null;
    this.stats.resolved += 1;
    events.push({
      kind: "deadlock_resolved",
      severity: "success",
      message: `${incident.id} resolved after ${tick - incident.detectedTick} ticks: ${how}`,
      robotIds: incident.robots,
      incidentId: incident.id,
      attempt: incident.attempts.length,
      cell: incident.blockingCells[0],
      action: "resume",
      status: "resolved",
    });
  }

  private fail(incident: MutableIncident, input: DeadlockInput, events: DeadlockEvent[], reason: string) {
    // Earlier yielders stop holding; everyone stays in a safe waiting state.
    for (const id of incident.holders.keys()) this.pendingRelease.push(id);
    incident.holders.clear();
    incident.status = "failed";
    incident.failureReason = reason;
    incident.failedAtVersion = input.worldVersion;
    incident.clearTicks = 0;
    this.stats.failed += 1;
    events.push({
      kind: "deadlock_recovery_failed",
      severity: "critical",
      message: `${incident.id} unresolved: ${reason}. Robots hold safely in place; recovery retries when the warehouse changes.`,
      robotIds: incident.robots,
      incidentId: incident.id,
      attempt: incident.attempts.length,
      cell: incident.blockingCells[0],
      action: "hold-safely",
      status: "failed",
    });
  }

  /** Follow first out-edges from `start` to a robot that is not waiting (or a repeat). */
  private blockerChain(startId: string, edges: readonly WaitEdge[], byId: Map<string, DeadlockRobotInput>): string[] {
    const chain = [startId];
    let current = startId;
    for (let i = 0; i < 6; i += 1) {
      const next = edges.find((e) => e.from === current)?.to;
      if (!next || chain.includes(next)) break;
      chain.push(next);
      const r = byId.get(next);
      if (!r || !r.waiting) break;
      current = next;
    }
    return chain;
  }

  private prune(): void {
    if (this.incidents.length <= MAX_INCIDENTS) return;
    const closed = this.incidents.filter((i) => i.status === "resolved");
    const excess = this.incidents.length - MAX_INCIDENTS;
    const drop = new Set(closed.slice(0, excess).map((i) => i.id));
    this.incidents = this.incidents.filter((i) => !drop.has(i.id));
  }

  // -------------------------------------------------------------- export

  classOf(robotId: string): WaitClass {
    return this.classes.get(robotId) ?? "none";
  }

  incidentOf(robotId: string): string | null {
    return this.robotIncident.get(robotId) ?? null;
  }

  edges(): readonly WaitEdge[] {
    return this.lastEdges;
  }

  /** Incident ids with an in-progress attempt, mapped to the yielder. */
  activeYields(): Map<string, { incidentId: string; holdingCell: number }> {
    const out = new Map<string, { incidentId: string; holdingCell: number }>();
    for (const i of this.incidents) {
      const a = i.attempts.at(-1);
      if (i.status === "recovering" && a && a.outcome === "in-progress" && a.holdingCell !== null) {
        out.set(a.yielderId, { incidentId: i.id, holdingCell: a.holdingCell });
      }
      if (i.status === "recovering") for (const [id, cell] of i.holders) out.set(id, { incidentId: i.id, holdingCell: cell });
    }
    return out;
  }

  /**
   * Robots the coordinator must not preempt: anyone in a circular wait
   * (confirmed or not) or in an open incident. Cycles are the deadlock
   * manager's job; right-of-way stays for non-circular blocking. This stops
   * the two mechanisms from undoing each other (back-and-forth replanning).
   */
  recoveringRobots(): Set<string> {
    const out = new Set<string>(this.inCycle);
    for (const i of this.incidents) if (i.status === "recovering" || i.status === "detected") i.robots.forEach((id) => out.add(id));
    return out;
  }

  snapshot(cellPoint: (cell: number) => { x: number; y: number }, waitTicks: (id: string) => number): DeadlockSnapshot {
    const incidents: DeadlockIncident[] = this.incidents.map((i) => ({
      id: i.id,
      kind: i.kind,
      status: i.status,
      robots: [...i.robots],
      dependents: [...i.dependents],
      edges: i.edges.map((e) => ({
        robotId: e.from,
        waitingFor: e.to,
        ticks: waitTicks(e.from),
        cell: e.cell >= 0 ? cellPoint(e.cell) : undefined,
        reason: e.reason,
      })),
      blockingCells: i.blockingCells.map(cellPoint),
      detectedTick: i.detectedTick,
      resolvedTick: i.resolvedTick,
      attempts: i.attempts.map(
        (a): RecoveryAttempt => ({
          attempt: a.attempt,
          yielderId: a.yielderId,
          holdingCell: a.holdingCell === null ? null : cellPoint(a.holdingCell),
          route: a.route.map(cellPoint),
          startedTick: a.startedTick,
          endedTick: a.endedTick,
          outcome: a.outcome,
          note: a.note,
        }),
      ),
      failureReason: i.failureReason,
    }));
    return {
      incidents,
      stats: { ...this.stats },
      thresholds: {
        confirmTicks: this.confirmTicks,
        congestionTicks: this.congestionTicks,
        stallTicks: this.stallTicks,
        maxAttempts: this.maxAttempts,
        attemptTimeout: this.attemptTimeout,
      },
      recoveryEnabled: this.recoveryEnabled,
    };
  }
}
