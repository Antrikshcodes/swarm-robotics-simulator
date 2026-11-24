/**
 * Commit-time conflict check — the last line of defence.
 *
 * Plans come from the reservation table, so in normal operation every intent
 * is accepted. This resolver does not trust that: before any move is applied
 * it rejects, for the whole fleet at once,
 *  - two robots targeting the same cell (lower priority rejected),
 *  - a robot entering a cell whose occupant is not leaving,
 *  - head-on swaps (both rejected).
 * Rejections cascade (a rejected robot stays, which may block a follower)
 * until stable. Following a robot that leaves this tick is allowed.
 */
export interface MoveIntent {
  readonly robotId: string;
  readonly from: number;
  readonly to: number;
  /** Higher wins a same-cell contest. */
  readonly priority: number;
  /** Tie-breaker: lower rank wins. */
  readonly rank: number;
}

export type RejectionReason = "cell-conflict" | "occupied" | "swap";

export interface Rejection {
  readonly robotId: string;
  readonly reason: RejectionReason;
  readonly against: string;
  readonly cell: number;
}

export interface Resolution {
  /** Final cell for every robot (unchanged for stays and rejections). */
  readonly final: ReadonlyMap<string, number>;
  readonly rejected: readonly Rejection[];
}

const beats = (a: MoveIntent, b: MoveIntent) => a.priority > b.priority || (a.priority === b.priority && a.rank < b.rank);

export function resolveMoves(intents: readonly MoveIntent[]): Resolution {
  const byId = new Map(intents.map((i) => [i.robotId, i]));
  const occupant = new Map(intents.map((i) => [i.from, i.robotId]));
  const rejected = new Map<string, Rejection>();
  const moving = (i: MoveIntent) => i.to !== i.from && !rejected.has(i.robotId);
  const reject = (i: MoveIntent, reason: RejectionReason, against: string) => {
    if (!rejected.has(i.robotId)) rejected.set(i.robotId, { robotId: i.robotId, reason, against, cell: i.to });
  };

  let changed = true;
  while (changed) {
    changed = false;
    const before = rejected.size;

    // Same target cell: keep the winner.
    const byTarget = new Map<number, MoveIntent[]>();
    for (const i of intents) {
      if (!moving(i)) continue;
      const list = byTarget.get(i.to) ?? [];
      list.push(i);
      byTarget.set(i.to, list);
    }
    for (const list of byTarget.values()) {
      if (list.length < 2) continue;
      const winner = list.reduce((w, i) => (beats(i, w) ? i : w));
      for (const i of list) if (i !== winner) reject(i, "cell-conflict", winner.robotId);
    }

    // Occupied targets and swaps.
    for (const i of intents) {
      if (!moving(i)) continue;
      const otherId = occupant.get(i.to);
      if (otherId === undefined || otherId === i.robotId) continue;
      const other = byId.get(otherId)!;
      if (moving(other) && other.to === i.from) {
        reject(i, "swap", other.robotId);
        reject(other, "swap", i.robotId);
      } else if (!moving(other)) {
        reject(i, "occupied", other.robotId);
      }
    }

    changed = rejected.size !== before;
  }

  const final = new Map<string, number>();
  for (const i of intents) final.set(i.robotId, rejected.has(i.robotId) ? i.from : i.to);
  return { final, rejected: [...rejected.values()] };
}
