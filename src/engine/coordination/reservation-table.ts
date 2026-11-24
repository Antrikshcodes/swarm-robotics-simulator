/**
 * Time-indexed reservation table.
 *
 * Time convention: a reservation at tick `t` describes where a robot is
 * *after* tick `t` has been processed (the same meaning as `snapshot.tick`).
 *
 *  - Cell reservation (t, cell): the robot occupies `cell` after tick t.
 *  - Edge reservation (t, from → to): the robot moves from → to during tick t.
 *  - Hold ("tail") reservation (cell, fromTick): the robot stays on `cell`
 *    from `fromTick` onwards, indefinitely, until it releases it. Every plan
 *    ends with a hold so a robot is never unprotected when its plan runs out.
 *
 * Cells are row-major indices (y * width + x). All lookups are O(1) map hits.
 */
export interface Hold {
  readonly robotId: string;
  readonly cell: number;
  readonly fromTick: number;
}

export interface ReservedCell {
  readonly tick: number;
  readonly cell: number;
  readonly robotId: string;
}

interface RobotIndex {
  cells: Array<[tick: number, cell: number]>;
  edges: Array<[tick: number, key: number]>;
  hold: number | null;
}

export class ReservationTable {
  private readonly cells = new Map<number, Map<number, string>>();
  private readonly edges = new Map<number, Map<number, string>>();
  private readonly holds = new Map<number, Hold>();
  private readonly byRobot = new Map<string, RobotIndex>();

  constructor(private readonly cellCount: number) {}

  private edgeKey(from: number, to: number): number {
    return from * this.cellCount + to;
  }

  private index(robotId: string): RobotIndex {
    let entry = this.byRobot.get(robotId);
    if (!entry) {
      entry = { cells: [], edges: [], hold: null };
      this.byRobot.set(robotId, entry);
    }
    return entry;
  }

  // ------------------------------------------------------------- queries

  /** Owner of `cell` at tick `t`, considering holds. */
  cellOwner(t: number, cell: number): string | undefined {
    const owner = this.cells.get(t)?.get(cell);
    if (owner !== undefined) return owner;
    const hold = this.holds.get(cell);
    return hold && hold.fromTick <= t ? hold.robotId : undefined;
  }

  edgeOwner(t: number, from: number, to: number): string | undefined {
    return this.edges.get(t)?.get(this.edgeKey(from, to));
  }

  holdAt(cell: number): Hold | undefined {
    return this.holds.get(cell);
  }

  /** True if `robotId` may be on `cell` after tick `t`. */
  canOccupy(robotId: string, t: number, cell: number): boolean {
    const owner = this.cellOwner(t, cell);
    return owner === undefined || owner === robotId;
  }

  /**
   * True if `robotId` may move from → to during tick `t`: the target cell is
   * free at t and nobody reserved the opposite edge (a head-on swap).
   */
  canMove(robotId: string, t: number, from: number, to: number): boolean {
    if (!this.canOccupy(robotId, t, to)) return false;
    if (from === to) return true;
    const swap = this.edgeOwner(t, to, from);
    return swap === undefined || swap === robotId;
  }

  /** Who blocks `robotId` from moving from → to at tick t (cell owner first, then swap owner). */
  blockerOf(robotId: string, t: number, from: number, to: number): string | undefined {
    const owner = this.cellOwner(t, to);
    if (owner !== undefined && owner !== robotId) return owner;
    if (from === to) return undefined;
    const swap = this.edgeOwner(t, to, from);
    return swap !== undefined && swap !== robotId ? swap : undefined;
  }

  /** True if `robotId` can occupy `cell` for every tick in [from, to] (inclusive). */
  canStay(robotId: string, from: number, to: number, cell: number): boolean {
    for (let t = from; t <= to; t += 1) if (!this.canOccupy(robotId, t, cell)) return false;
    return true;
  }

  /**
   * True if `robotId` can stay on `cell` from tick `t` onwards: no other
   * robot has a cell reservation there at any later tick, and no other hold.
   */
  canHoldFrom(robotId: string, t: number, cell: number): boolean {
    const hold = this.holds.get(cell);
    if (hold && hold.robotId !== robotId) return false;
    for (const [tick, bucket] of this.cells) {
      if (tick < t) continue;
      const owner = bucket.get(cell);
      if (owner !== undefined && owner !== robotId) return false;
    }
    return true;
  }

  /** Latest tick with any cell reservation (for bounded scans). */
  maxReservedTick(): number {
    let max = -Infinity;
    for (const tick of this.cells.keys()) if (tick > max) max = tick;
    return max;
  }

  // ----------------------------------------------------------- mutation

  /**
   * Reserve a plan. `positions[i]` is the robot's cell after tick
   * `startTick + i`; `positions[0]` is its current cell (not reserved here,
   * it is covered by the previous plan or hold). The last cell becomes a hold.
   * Throws if any reservation is owned by another robot — callers must only
   * reserve plans produced against this table.
   */
  reservePlan(robotId: string, startTick: number, positions: readonly number[], options: { hold?: boolean } = {}): void {
    const index = this.index(robotId);
    for (let i = 1; i < positions.length; i += 1) {
      const t = startTick + i;
      const from = positions[i - 1];
      const to = positions[i];
      if (!this.canMove(robotId, t, from, to)) {
        throw new Error(`Reservation conflict: ${robotId} cannot take cell ${to} at tick ${t}`);
      }
      let bucket = this.cells.get(t);
      if (!bucket) {
        bucket = new Map();
        this.cells.set(t, bucket);
      }
      bucket.set(to, robotId);
      index.cells.push([t, to]);
      if (from !== to) {
        let edgeBucket = this.edges.get(t);
        if (!edgeBucket) {
          edgeBucket = new Map();
          this.edges.set(t, edgeBucket);
        }
        const key = this.edgeKey(from, to);
        edgeBucket.set(key, robotId);
        index.edges.push([t, key]);
      }
    }
    if (options.hold === false) {
      this.release(robotId, Number.POSITIVE_INFINITY); // drop any previous hold only
      return;
    }
    this.setHold(robotId, positions[positions.length - 1], startTick + positions.length - 1);
  }

  /** Reserve a single cell at a single tick (no edge, no hold). */
  reserveCell(robotId: string, t: number, cell: number): void {
    if (!this.canOccupy(robotId, t, cell)) throw new Error(`Reservation conflict: ${robotId} cannot take cell ${cell} at tick ${t}`);
    let bucket = this.cells.get(t);
    if (!bucket) {
      bucket = new Map();
      this.cells.set(t, bucket);
    }
    bucket.set(cell, robotId);
    this.index(robotId).cells.push([t, cell]);
  }

  /** First robot other than `robotId` that reserves or holds `cell` at or after tick `t`. */
  nextClaimant(robotId: string, t: number, cell: number): string | undefined {
    let best: { tick: number; robotId: string } | undefined;
    for (const [tick, bucket] of this.cells) {
      if (tick < t) continue;
      const owner = bucket.get(cell);
      if (owner !== undefined && owner !== robotId && (!best || tick < best.tick)) best = { tick, robotId: owner };
    }
    const hold = this.holds.get(cell);
    if (hold && hold.robotId !== robotId && (!best || hold.fromTick < best.tick)) best = { tick: hold.fromTick, robotId: hold.robotId };
    return best?.robotId;
  }

  /** Hold `cell` for `robotId` from `fromTick` on (replaces its previous hold). */
  setHold(robotId: string, cell: number, fromTick: number): void {
    const index = this.index(robotId);
    if (index.hold !== null && this.holds.get(index.hold)?.robotId === robotId) this.holds.delete(index.hold);
    const existing = this.holds.get(cell);
    if (existing && existing.robotId !== robotId) {
      throw new Error(`Hold conflict: cell ${cell} is held by ${existing.robotId}`);
    }
    this.holds.set(cell, { robotId, cell, fromTick });
    index.hold = cell;
  }

  /** Release every reservation of `robotId` at or after `fromTick`, and its hold. */
  release(robotId: string, fromTick: number): void {
    const index = this.byRobot.get(robotId);
    if (!index) return;
    index.cells = index.cells.filter(([t, cell]) => {
      if (t < fromTick) return true;
      const bucket = this.cells.get(t);
      if (bucket?.get(cell) === robotId) bucket.delete(cell);
      return false;
    });
    index.edges = index.edges.filter(([t, key]) => {
      if (t < fromTick) return true;
      const bucket = this.edges.get(t);
      if (bucket?.get(key) === robotId) bucket.delete(key);
      return false;
    });
    if (index.hold !== null && this.holds.get(index.hold)?.robotId === robotId) this.holds.delete(index.hold);
    index.hold = null;
  }

  /** Drop reservations for ticks before `tick` (they describe the past). */
  expireBefore(tick: number): void {
    for (const t of [...this.cells.keys()]) if (t < tick) this.cells.delete(t);
    for (const t of [...this.edges.keys()]) if (t < tick) this.edges.delete(t);
    for (const index of this.byRobot.values()) {
      if (index.cells.length && index.cells[0][0] < tick) index.cells = index.cells.filter(([t]) => t >= tick);
      if (index.edges.length && index.edges[0][0] < tick) index.edges = index.edges.filter(([t]) => t >= tick);
    }
  }

  clear(): void {
    this.cells.clear();
    this.edges.clear();
    this.holds.clear();
    this.byRobot.clear();
  }

  // ------------------------------------------------------------ export

  /** All cell reservations, ordered by tick then cell (deterministic). */
  listCells(): ReservedCell[] {
    const out: ReservedCell[] = [];
    for (const t of [...this.cells.keys()].sort((a, b) => a - b)) {
      const bucket = this.cells.get(t)!;
      for (const cell of [...bucket.keys()].sort((a, b) => a - b)) out.push({ tick: t, cell, robotId: bucket.get(cell)! });
    }
    return out;
  }

  listHolds(): Hold[] {
    return [...this.holds.values()].sort((a, b) => a.cell - b.cell);
  }

  /** Number of cell reservations a robot currently owns (excluding its hold). */
  countFor(robotId: string): number {
    return this.byRobot.get(robotId)?.cells.length ?? 0;
  }
}
