import { describe, expect, it } from "vitest";
import { ReservationTable } from "./reservation-table";

// 5-wide strip: cell index = x for row 0.
const table = () => new ReservationTable(25);

describe("reservation table", () => {
  it("records ownership of cells and edges by tick", () => {
    const r = table();
    r.reservePlan("A", 10, [0, 1, 2]);
    expect(r.cellOwner(11, 1)).toBe("A");
    expect(r.cellOwner(12, 2)).toBe("A");
    expect(r.edgeOwner(11, 0, 1)).toBe("A");
    expect(r.edgeOwner(12, 1, 2)).toBe("A");
    expect(r.cellOwner(11, 2)).toBeUndefined();
  });

  it("rejects a second robot on the same cell at the same tick", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2]);
    expect(r.canOccupy("B", 1, 1)).toBe(false);
    expect(r.canOccupy("A", 1, 1)).toBe(true);
    expect(r.canOccupy("B", 2, 1)).toBe(true); // A has moved on
    expect(() => r.reservePlan("B", 0, [6, 1])).toThrow(/conflict/);
  });

  it("rejects head-on edge swaps", () => {
    const r = table();
    // A: 2 → 3 during tick 1.
    r.reservePlan("A", 0, [2, 3]);
    r.release("A", 2); // drop the hold so only the swap rule can reject
    // B: 3 → 2 during tick 1 would swap with A.
    expect(r.canMove("B", 1, 3, 2)).toBe(false);
    expect(r.blockerOf("B", 1, 3, 2)).toBe("A");
    // Same direction (following) is fine at the next tick.
    expect(r.canMove("B", 2, 1, 2)).toBe(true);
  });

  it("allows independent movement in parallel", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2]);
    r.reservePlan("B", 0, [20, 21, 22]);
    expect(r.cellOwner(2, 2)).toBe("A");
    expect(r.cellOwner(2, 22)).toBe("B");
  });

  it("holds the final cell indefinitely", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2]);
    expect(r.cellOwner(2, 2)).toBe("A");
    expect(r.cellOwner(500, 2)).toBe("A");
    expect(r.cellOwner(1, 2)).toBeUndefined(); // hold starts at tick 2
    expect(r.canHoldFrom("B", 3, 2)).toBe(false);
    expect(r.canHoldFrom("B", 3, 4)).toBe(true);
    expect(r.canHoldFrom("B", 0, 1)).toBe(false); // A passes through cell 1 at tick 1
  });

  it("releases a robot's future reservations without touching others", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2, 3]);
    r.reservePlan("B", 0, [10, 11]);
    r.release("A", 2);
    expect(r.cellOwner(1, 1)).toBe("A"); // before the release tick: kept
    expect(r.cellOwner(2, 2)).toBeUndefined();
    expect(r.cellOwner(3, 3)).toBeUndefined();
    expect(r.holdAt(3)).toBeUndefined();
    expect(r.cellOwner(1, 11)).toBe("B");
    expect(r.holdAt(11)?.robotId).toBe("B");
  });

  it("expires past ticks", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2, 3]);
    r.expireBefore(3);
    expect(r.cellOwner(1, 1)).toBeUndefined();
    expect(r.cellOwner(2, 2)).toBeUndefined();
    expect(r.cellOwner(3, 3)).toBe("A");
    expect(r.countFor("A")).toBe(1);
  });

  it("re-reserves cleanly after replanning", () => {
    const r = table();
    r.reservePlan("A", 0, [0, 1, 2, 3]);
    r.release("A", 1);
    r.reservePlan("A", 0, [0, 5, 10]);
    expect(r.cellOwner(1, 1)).toBeUndefined();
    expect(r.cellOwner(1, 5)).toBe("A");
    expect(r.holdAt(10)?.robotId).toBe("A");
    expect(r.holdAt(3)).toBeUndefined();
  });

  it("lists reservations deterministically", () => {
    const r = table();
    r.reservePlan("B", 0, [10, 11]);
    r.reservePlan("A", 0, [0, 1]);
    expect(r.listCells().map((c) => `${c.tick}:${c.cell}:${c.robotId}`)).toEqual(["1:1:A", "1:11:B"]);
    expect(r.listHolds().map((h) => h.robotId)).toEqual(["A", "B"]);
  });
});
