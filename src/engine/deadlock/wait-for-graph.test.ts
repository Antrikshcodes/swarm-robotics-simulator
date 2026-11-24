import { describe, expect, it } from "vitest";
import { buildWaitForGraph, dependents, findCycles, groupKey, type WaitEdge } from "./wait-for-graph";

const edge = (from: string, to: string): WaitEdge => ({ from, to, cell: 0, reason: "occupied" });

describe("wait-for graph", () => {
  it("adds an edge to every robot occupying or holding a cell on the route ahead", () => {
    const edges = buildWaitForGraph(
      [{ id: "A", routeAhead: [1, 2, 3, 4], reservationBlocker: null, reservationCell: null }],
      { occupant: new Map([[2, "B"], [9, "Z"]]), holder: new Map([[4, "C"]]) },
      6,
    );
    expect(edges).toEqual([
      { from: "A", to: "B", cell: 2, reason: "occupied" },
      { from: "A", to: "C", cell: 4, reason: "held" },
    ]);
  });

  it("respects the lookahead and ignores self-references", () => {
    const edges = buildWaitForGraph(
      [{ id: "A", routeAhead: [1, 2, 3], reservationBlocker: "A", reservationCell: 1 }],
      { occupant: new Map([[1, "A"], [3, "B"]]), holder: new Map() },
      2,
    );
    expect(edges).toEqual([]);
  });

  it("includes the coordinator's reservation blocker once", () => {
    const edges = buildWaitForGraph(
      [{ id: "A", routeAhead: [5], reservationBlocker: "B", reservationCell: 5 }],
      { occupant: new Map([[5, "B"]]), holder: new Map() },
      4,
    );
    expect(edges).toHaveLength(1);
  });

  it("detects a two-robot cycle", () => {
    expect(findCycles([edge("A", "B"), edge("B", "A")])).toEqual([["A", "B"]]);
  });

  it("detects a three-robot circular wait with all participants", () => {
    expect(findCycles([edge("A", "B"), edge("B", "C"), edge("C", "A"), edge("D", "A")])).toEqual([["A", "B", "C"]]);
  });

  it("finds separate cycles and merges overlapping ones", () => {
    const cycles = findCycles([edge("A", "B"), edge("B", "A"), edge("B", "C"), edge("C", "B"), edge("X", "Y"), edge("Y", "X")]);
    expect(cycles).toEqual([["A", "B", "C"], ["X", "Y"]]);
  });

  it("does not report chains (congestion) as cycles", () => {
    expect(findCycles([edge("A", "B"), edge("B", "C"), edge("C", "D")])).toEqual([]);
    expect(findCycles([])).toEqual([]);
  });

  it("is order-independent (deterministic)", () => {
    const a = findCycles([edge("C", "A"), edge("A", "B"), edge("B", "C")]);
    const b = findCycles([edge("B", "C"), edge("C", "A"), edge("A", "B")]);
    expect(a).toEqual(b);
  });

  it("lists robots that wait on a group but are not part of it", () => {
    expect(dependents([edge("A", "B"), edge("B", "A"), edge("C", "A"), edge("D", "C"), edge("E", "F")], ["A", "B"])).toEqual(["C", "D"]);
    expect(groupKey(["R-02", "R-01"])).toBe("R-01+R-02");
  });
});
