import type {
  CoordinationDecision,
  CoordinationState,
  CoordinatorStats,
  DecisionKind,
} from "../../types/simulation";
import { DistanceCache, distanceFrom } from "./distance-map";
import { resolveMoves, type MoveIntent, type Rejection } from "./move-resolver";
import { ReservationTable } from "./reservation-table";
import { neighbourCells, planSpaceTime, type PlanningGrid, type SpaceTimeStatus } from "./space-time-planner";

/**
 * Multi-robot coordinator: prioritised cooperative planning over a shared
 * time-indexed reservation table, plus commit-time conflict checking.
 *
 * Each tick (positions known at tick T):
 *  1. Expire reservations before T.
 *  2. Select robots that need a plan (new goal, invalidated, plan running
 *     out, periodic re-check while waiting). Others keep their reservations —
 *     no full-fleet recalculation.
 *  3. Plan them in priority order with space-time A*; reserve cells, edges
 *     and a final hold.
 *  4. Preemption: a robot that has waited ≥ PREEMPT_AFTER ticks behind a
 *     lower-priority robot takes right-of-way — the blocker's future
 *     reservations are released, the higher robot replans first, the blocker
 *     replans around it. Never applied to dwelling or failed robots.
 *  5. Record who each waiting robot is waiting for (wait-for graph).
 *  6. Emit move intents for tick T+1; the engine applies resolveMoves().
 *
 * Deterministic: no clocks, no randomness, all iteration in sorted order.
 */
export type CoordMode = "mobile" | "dwelling" | "failed";

export interface CoordRobotInput {
  readonly id: string;
  readonly rank: number;
  readonly cell: number;
  /** Target cell; the robot's own cell when it should simply stay. */
  readonly goal: number;
  readonly priority: number;
  readonly mode: CoordMode;
}

export interface RobotCoordination {
  readonly priority: number;
  readonly state: CoordinationState;
  readonly planStatus: SpaceTimeStatus | null;
  /** Absolute tick of each planned position, starting at the next tick. */
  readonly plan: readonly { readonly tick: number; readonly cell: number }[];
  readonly waitingFor: string | null;
  readonly waitStreak: number;
  readonly reservedCells: number;
}

export interface CoordinatorOptions {
  readonly horizon?: number;
  readonly maxExpansions?: number;
  readonly preemptAfter?: number;
  readonly replanMargin?: number;
}

interface RobotPlanState {
  positions: number[];
  startTick: number;
  goal: number;
  status: SpaceTimeStatus | null;
  needsPlan: boolean;
  waitingFor: string | null;
  waitStreak: number;
  state: CoordinationState;
  priority: number;
}

const MAX_DECISIONS = 120;
const APPROACH_EXPANSIONS = 600;

export class Coordinator {
  readonly table: ReservationTable;
  private readonly distances = new DistanceCache();
  private readonly robots = new Map<string, RobotPlanState>();
  private decisions: CoordinationDecision[] = [];
  private decisionSeq = 0;
  private worldVersion = 0;
  /** Tick stamped on decisions: the tick being executed (planning tick + 1). */
  private decisionTick = 0;
  readonly horizon: number;
  private readonly maxExpansions: number;
  private readonly preemptAfter: number;
  private readonly replanMargin: number;
  private stats = { plansComputed: 0, nodesExpanded: 0, preemptions: 0, commitRejections: 0, plannedWaits: 0, lastTickPlans: 0 };

  constructor(
    private readonly grid: PlanningGrid,
    options: CoordinatorOptions = {},
  ) {
    this.table = new ReservationTable(grid.width * grid.height);
    this.horizon = options.horizon ?? 48;
    this.maxExpansions = options.maxExpansions ?? 4000;
    this.preemptAfter = options.preemptAfter ?? 3;
    this.replanMargin = options.replanMargin ?? 3;
  }

  // ------------------------------------------------------------ lifecycle

  /** Initial state: every robot holds its start cell from tick 0. */
  reset(robots: readonly CoordRobotInput[]): void {
    this.table.clear();
    this.robots.clear();
    this.decisions = [];
    this.decisionSeq = 0;
    this.stats = { plansComputed: 0, nodesExpanded: 0, preemptions: 0, commitRejections: 0, plannedWaits: 0, lastTickPlans: 0 };
    for (const r of [...robots].sort((a, b) => a.rank - b.rank)) {
      this.table.setHold(r.id, r.cell, 0);
      this.robots.set(r.id, {
        positions: [r.cell],
        startTick: 0,
        goal: r.cell,
        status: null,
        needsPlan: true,
        waitingFor: null,
        waitStreak: 0,
        state: "holding",
        priority: r.priority,
      });
    }
  }

  /** Static passability changed (closure): invalidate heuristics and affected plans. */
  worldChanged(isClosed: (cell: number) => boolean, tick: number): string[] {
    this.worldVersion += 1;
    const affected: string[] = [];
    for (const [id, s] of this.sorted()) {
      const future = s.positions.slice(Math.max(0, tick - s.startTick + 1));
      if (future.some(isClosed)) {
        s.needsPlan = true;
        affected.push(id);
      }
    }
    return affected;
  }

  invalidate(robotId: string): void {
    const s = this.robots.get(robotId);
    if (s) s.needsPlan = true;
  }

  /**
   * A robot failed at `cell`: drop its plan and hold the cell permanently.
   * Robots whose reservations rely on that cell replan.
   */
  fail(robotId: string, cell: number, tick: number): string[] {
    this.table.release(robotId, tick + 1);
    const affected = new Set<string>();
    const holder = this.table.holdAt(cell);
    if (holder && holder.robotId !== robotId) {
      this.table.release(holder.robotId, tick + 1);
      affected.add(holder.robotId);
    }
    for (const r of this.table.listCells()) {
      if (r.cell === cell && r.robotId !== robotId && r.tick > tick) affected.add(r.robotId);
    }
    for (const id of affected) this.table.release(id, tick + 1);
    this.table.setHold(robotId, cell, tick);
    const s = this.robots.get(robotId);
    if (s) {
      s.positions = [cell];
      s.startTick = tick;
      s.status = null;
      s.state = "failed";
      s.waitingFor = null;
    }
    for (const id of affected) this.invalidate(id);
    return [...affected].sort();
  }

  // --------------------------------------------------------------- planning

  /**
   * Plan for tick T → T+1. Returns intents for every robot.
   */
  plan(tick: number, robots: readonly CoordRobotInput[]): MoveIntent[] {
    this.decisionTick = tick + 1;
    this.table.expireBefore(tick);
    const inputs = [...robots].sort((a, b) => b.priority - a.priority || a.rank - b.rank);
    let plans = 0;

    for (const r of inputs) {
      const s = this.robots.get(r.id)!;
      s.priority = r.priority;
      if (r.mode === "failed") continue;
      if (r.mode === "dwelling") {
        if (s.positions.length > 1 || this.table.holdAt(r.cell)?.robotId !== r.id) this.holdInPlace(r, tick);
        s.state = "dwelling";
        continue;
      }
      if (this.needsPlan(r, s, tick)) {
        this.planOne(r, s, tick);
        plans += 1;
      }
    }

    plans += this.preempt(tick, inputs);
    this.stats.lastTickPlans = plans;
    this.analyseWaits(tick, inputs);

    return inputs.map((r) => {
      const s = this.robots.get(r.id)!;
      const next = r.mode === "mobile" ? (this.positionAt(s, tick + 1) ?? r.cell) : r.cell;
      return { robotId: r.id, from: r.cell, to: next, priority: r.priority, rank: r.rank };
    });
  }

  /** Apply the commit result: rejected robots replan next tick. */
  committed(tick: number, rejected: readonly Rejection[]): void {
    this.decisionTick = tick;
    for (const rej of rejected) {
      const s = this.robots.get(rej.robotId);
      if (!s) continue;
      s.needsPlan = true;
      this.stats.commitRejections += 1;
      this.decide(tick, "commit-reject", rej.robotId, `${rej.robotId} move rejected at commit (${rej.reason} with ${rej.against}); replanning`, rej.against, rej.cell);
    }
  }

  private needsPlan(r: CoordRobotInput, s: RobotPlanState, tick: number): boolean {
    if (s.needsPlan || s.goal !== r.goal || s.status === null) return true;
    const end = s.startTick + s.positions.length - 1;
    if (this.positionAt(s, tick) !== r.cell) return true; // drifted off plan (rejected move)
    if (s.status === "partial" && end - tick <= this.replanMargin) return true;
    if (s.status === "blocked" || s.status === "unreachable") return true;
    // While waiting, periodically look for a better option.
    return s.state === "waiting" && s.waitStreak > 0 && s.waitStreak % 6 === 0;
  }

  private planOne(r: CoordRobotInput, s: RobotPlanState, tick: number): void {
    this.table.release(r.id, tick + 1);
    const distances = this.distances.get(this.grid, r.goal, this.worldVersion);
    // If another robot holds the goal (docked / parked there), the goal cannot
    // be reached within this plan: run a cheap "approach" search instead of
    // exhausting the whole space-time horizon.
    const goalHolder = this.table.holdAt(r.goal);
    const approach = goalHolder !== undefined && goalHolder.robotId !== r.id;
    const result = planSpaceTime({
      robotId: r.id,
      start: r.cell,
      startTick: tick,
      goal: r.goal,
      grid: this.grid,
      distances,
      table: this.table,
      horizon: this.horizon,
      maxExpansions: approach ? Math.min(this.maxExpansions, APPROACH_EXPANSIONS) : this.maxExpansions,
    });
    this.stats.plansComputed += 1;
    this.stats.nodesExpanded += result.expanded;
    this.stats.plannedWaits += result.waits;
    s.goal = r.goal;
    s.status = result.status;
    s.needsPlan = false;
    if (result.status === "complete" || result.status === "partial") {
      this.table.reservePlan(r.id, tick, result.positions);
      s.positions = [...result.positions];
      s.startTick = tick;
      return;
    }
    // unreachable / blocked: the robot physically stays, so it must own its cell.
    s.positions = [r.cell];
    s.startTick = tick;
    this.claimCell(r.id, r.cell, tick);
    if (result.status === "unreachable" && s.state !== "no-route") {
      this.decide(tick, "no-route", r.id, `${r.id} has no route to its goal (closure or sealed area); holding`, undefined, r.goal);
    }
  }

  private holdInPlace(r: CoordRobotInput, tick: number): void {
    const s = this.robots.get(r.id)!;
    this.table.release(r.id, tick + 1);
    this.claimCell(r.id, r.cell, tick);
    s.positions = [r.cell];
    s.startTick = tick;
    s.goal = r.cell;
    s.status = "complete";
  }

  /**
   * A robot that will physically stay on `cell` must own it from the next
   * tick on. Any other robot that planned to use the cell loses its plan,
   * stands still this tick and replans — the occupied cell wins.
   */
  private claimCell(robotId: string, cell: number, tick: number): void {
    const claimants = new Set<string>();
    const hold = this.table.holdAt(cell);
    if (hold && hold.robotId !== robotId) claimants.add(hold.robotId);
    for (const r of this.table.listCells()) {
      if (r.cell === cell && r.tick > tick && r.robotId !== robotId) claimants.add(r.robotId);
    }
    for (const id of [...claimants].sort()) {
      this.table.release(id, tick + 1);
      const other = this.robots.get(id);
      if (!other) continue;
      const here = this.positionAt(other, tick) ?? other.positions[0];
      other.positions = [here];
      other.startTick = tick;
      other.status = null;
      other.needsPlan = true;
      this.decide(tick, "yield", id, `${id} gives up its route through a cell ${robotId} cannot leave; replanning`, robotId, cell);
    }
    this.table.setHold(robotId, cell, tick + 1);
  }

  /**
   * Priority preemption: a waiting robot blocked by a lower-priority robot
   * for long enough takes right-of-way. Returns the number of replans.
   */
  private preempt(tick: number, inputs: readonly CoordRobotInput[]): number {
    let replans = 0;
    const touched = new Set<string>();
    const byId = new Map(inputs.map((r) => [r.id, r]));
    for (const r of inputs) {
      const s = this.robots.get(r.id)!;
      if (r.mode !== "mobile" || r.cell === r.goal || touched.has(r.id)) continue;
      if (s.waitStreak < this.preemptAfter) continue;
      if (this.positionAt(s, tick + 1) !== r.cell) continue; // already moving
      const blockerId = this.blockerFor(r, tick);
      if (!blockerId || touched.has(blockerId)) continue;
      const blocker = byId.get(blockerId);
      if (!blocker || blocker.mode !== "mobile") continue;
      if (!(blocker.priority < r.priority || (blocker.priority === r.priority && blocker.rank > r.rank))) continue;
      // The blocker physically stays put next tick; skip if that cell is promised to someone else.
      if (!this.table.canOccupy(blockerId, tick + 1, blocker.cell)) continue;

      // Pin the blocker on its current cell for one tick so the swap is physical,
      // free the rest, plan the higher-priority robot, then the blocker.
      this.table.release(blockerId, tick + 1);
      this.table.reserveCell(blockerId, tick + 1, blocker.cell);
      this.planOne(r, s, tick);
      const bs = this.robots.get(blockerId)!;
      this.planOne(blocker, bs, tick);
      replans += 2;
      touched.add(r.id);
      touched.add(blockerId);
      this.stats.preemptions += 1;
      this.decide(
        tick,
        "preempt",
        r.id,
        `${r.id} (priority ${r.priority}) took right-of-way from ${blockerId} (priority ${blocker.priority}) after waiting ${s.waitStreak} ticks`,
        blockerId,
      );
      this.decide(tick, "yield", blockerId, `${blockerId} yields to ${r.id} and replans`, r.id);
    }
    return replans;
  }

  /** Who reserved the cell this robot would ideally step into next. */
  private blockerFor(r: CoordRobotInput, tick: number): string | undefined {
    const distances = this.distances.get(this.grid, r.goal, this.worldVersion);
    const here = distanceFrom(this.grid, distances, r.cell);
    for (const next of neighbourCells(r.cell, this.grid.width, this.grid.height)) {
      if (distances[next] < 0 || distances[next] >= here) continue;
      if (!this.grid.passable(next, next === r.goal)) continue;
      for (const t of [tick + 1, tick + 2]) {
        const who = this.table.blockerOf(r.id, t, r.cell, next);
        if (who) return who;
      }
    }
    // Goal free now but promised to another robot later (queueing for a dock).
    return this.table.nextClaimant(r.id, tick + 1, r.goal);
  }

  private analyseWaits(tick: number, inputs: readonly CoordRobotInput[]): void {
    for (const r of inputs) {
      const s = this.robots.get(r.id)!;
      if (r.mode === "failed") {
        s.state = "failed";
        s.waitingFor = null;
        s.waitStreak = 0;
        continue;
      }
      if (r.mode === "dwelling") {
        s.waitingFor = null;
        s.waitStreak = 0;
        continue;
      }
      const next = this.positionAt(s, tick + 1) ?? r.cell;
      if (next !== r.cell) {
        s.state = "moving";
        s.waitingFor = null;
        s.waitStreak = 0;
        continue;
      }
      if (r.cell === r.goal) {
        s.state = s.status === "blocked" ? "blocked" : "holding";
        s.waitingFor = null;
        s.waitStreak = 0;
        continue;
      }
      if (s.status === "unreachable") {
        s.state = "no-route";
        s.waitingFor = null;
        s.waitStreak += 1;
        continue;
      }
      const waitingFor = this.blockerFor(r, tick) ?? null;
      s.state = s.status === "blocked" ? "blocked" : "waiting";
      if (s.waitStreak === 0 || s.waitingFor !== waitingFor) {
        this.decide(
          tick,
          "wait",
          r.id,
          waitingFor
            ? `${r.id} waits: next cell on its best route is reserved by ${waitingFor}`
            : `${r.id} waits for a safe opening`,
          waitingFor ?? undefined,
        );
      }
      s.waitingFor = waitingFor;
      s.waitStreak += 1;
    }
  }

  // ------------------------------------------------------------------ util

  private positionAt(s: RobotPlanState, tick: number): number | undefined {
    const i = tick - s.startTick;
    if (i < 0) return undefined;
    return i < s.positions.length ? s.positions[i] : s.positions[s.positions.length - 1];
  }

  private sorted(): [string, RobotPlanState][] {
    return [...this.robots.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  private decide(_planTick: number, kind: DecisionKind, robotId: string, message: string, otherRobotId?: string, cell?: number): void {
    this.decisionSeq += 1;
    this.decisions.push({ seq: this.decisionSeq, tick: this.decisionTick, kind, robotId, otherRobotId, cell, message });
    if (this.decisions.length > MAX_DECISIONS) this.decisions.splice(0, this.decisions.length - MAX_DECISIONS);
  }

  // ---------------------------------------------------------------- export

  robotView(robotId: string, tick: number): RobotCoordination {
    const s = this.robots.get(robotId)!;
    const plan: { tick: number; cell: number }[] = [];
    for (let i = tick - s.startTick + 1; i < s.positions.length; i += 1) {
      if (i < 0) continue;
      plan.push({ tick: s.startTick + i, cell: s.positions[i] });
    }
    return {
      priority: s.priority,
      state: s.state,
      planStatus: s.status,
      plan,
      waitingFor: s.waitingFor,
      waitStreak: s.waitStreak,
      reservedCells: this.table.countFor(robotId),
    };
  }

  /** Decisions since (and including) `fromTick`, oldest first. */
  recentDecisions(): readonly CoordinationDecision[] {
    return this.decisions;
  }

  /** Decisions recorded at exactly `tick` (for promoting some to engine events). */
  decisionsAt(tick: number): CoordinationDecision[] {
    return this.decisions.filter((d) => d.tick === tick);
  }

  getStats(): CoordinatorStats {
    return { ...this.stats, distanceMapsBuilt: this.distances.buildCount };
  }

  /** Static distance from `cell` to `goal`, or -1. Used for assignment. */
  distance(goal: number, cell: number): number {
    return distanceFrom(this.grid, this.distances.get(this.grid, goal, this.worldVersion), cell);
  }

  /** Commit check for a set of intents (exposed for the engine). */
  static resolve(intents: readonly MoveIntent[]) {
    return resolveMoves(intents);
  }
}
