import { describe, expect, it } from "vitest";
import { resolveMoves, type MoveIntent } from "./move-resolver";

const intent = (robotId: string, from: number, to: number, priority = 0, rank = 0): MoveIntent => ({ robotId, from, to, priority, rank });

describe("commit-time move resolver", () => {
  it("accepts independent concurrent moves", () => {
    const r = resolveMoves([intent("A", 0, 1), intent("B", 10, 11), intent("C", 20, 20)]);
    expect(r.rejected).toEqual([]);
    expect(Object.fromEntries(r.final)).toEqual({ A: 1, B: 11, C: 20 });
  });

  it("rejects same-cell conflicts, keeping the higher priority robot", () => {
    const r = resolveMoves([intent("A", 0, 1, 1, 0), intent("B", 2, 1, 5, 1)]);
    expect(r.final.get("B")).toBe(1);
    expect(r.final.get("A")).toBe(0);
    expect(r.rejected).toEqual([{ robotId: "A", reason: "cell-conflict", against: "B", cell: 1 }]);
  });

  it("breaks same-priority ties by rank", () => {
    const r = resolveMoves([intent("B", 2, 1, 0, 1), intent("A", 0, 1, 0, 0)]);
    expect(r.final.get("A")).toBe(1);
    expect(r.final.get("B")).toBe(2);
  });

  it("rejects head-on swaps (2,3)→(2,4) vs (2,4)→(2,3)", () => {
    const a = 3 * 10 + 2;
    const b = 4 * 10 + 2;
    const r = resolveMoves([intent("A", a, b), intent("B", b, a)]);
    expect(r.final.get("A")).toBe(a);
    expect(r.final.get("B")).toBe(b);
    expect(r.rejected.map((x) => x.reason)).toEqual(["swap", "swap"]);
  });

  it("allows following a robot that leaves, and cascades when it cannot", () => {
    const follow = resolveMoves([intent("A", 0, 1), intent("B", 1, 2)]);
    expect(follow.rejected).toEqual([]);
    // C blocks B; B therefore stays; A must then stay too.
    const cascade = resolveMoves([intent("A", 0, 1), intent("B", 1, 2), intent("C", 2, 2)]);
    expect(Object.fromEntries(cascade.final)).toEqual({ A: 0, B: 1, C: 2 });
    expect(cascade.rejected.map((x) => `${x.robotId}:${x.reason}:${x.against}`)).toEqual(["B:occupied:C", "A:occupied:B"]);
  });

  it("never produces two robots in one cell", () => {
    const intents = [intent("A", 0, 1), intent("B", 1, 0), intent("C", 2, 1), intent("D", 3, 2), intent("E", 4, 3)];
    const r = resolveMoves(intents);
    const cells = [...r.final.values()];
    expect(new Set(cells).size).toBe(cells.length);
  });
});
