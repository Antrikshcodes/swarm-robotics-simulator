import { describe, expect, it } from "vitest";
import {
  cellKindAt,
  inBounds,
  isStationKind,
  isTraversable,
  isTraversableKind,
  isValidPoint,
  manhattan,
  neighbours,
  parseLayout,
  pointKey,
  samePoint,
  stationAt,
} from "./layout";

describe("world/layout", () => {
  it("parses ASCII maps into grids and numbered stations", () => {
    const layout = parseLayout([
      "P.-=D",
      ".#X.C",
    ]);
    expect(layout.width).toBe(5);
    expect(layout.height).toBe(2);
    expect(layout.cells).toHaveLength(10);
    expect(layout.stations).toEqual([
      { id: "PK-01", kind: "pickup", label: "Inbound pick face", position: { x: 0, y: 0 } },
      { id: "DO-01", kind: "dropoff", label: "Outbound dock", position: { x: 4, y: 0 } },
      { id: "CH-01", kind: "charger", label: "Charging dock", position: { x: 4, y: 1 } },
    ]);
    expect(cellKindAt(layout, { x: 2, y: 0 })).toBe("lane");
    expect(cellKindAt(layout, { x: 3, y: 0 })).toBe("narrow");
    expect(cellKindAt(layout, { x: 1, y: 1 })).toBe("rack");
    expect(cellKindAt(layout, { x: 2, y: 1 })).toBe("obstacle");
    expect(stationAt(layout, { x: 4, y: 0 })?.id).toBe("DO-01");
    expect(stationAt(layout, { x: 1, y: 0 })).toBeUndefined();
  });

  it("rejects empty, jagged, or unknown-symbol maps", () => {
    expect(() => parseLayout([])).toThrow(/empty/i);
    expect(() => parseLayout(["...", ".."])).toThrow(/width/i);
    expect(() => parseLayout([".?."])).toThrow(/Unknown layout symbol/);
  });

  it("evaluates bounds, traversability, and station kinds", () => {
    const layout = parseLayout(["P.#X"]);
    expect(inBounds(layout, { x: 0, y: 0 })).toBe(true);
    expect(inBounds(layout, { x: -1, y: 0 })).toBe(false);
    expect(inBounds(layout, { x: 4, y: 0 })).toBe(false);
    expect(cellKindAt(layout, { x: 4, y: 0 })).toBeNull();
    expect(isTraversable(layout, { x: 0, y: 0 })).toBe(true);
    expect(isTraversable(layout, { x: 1, y: 0 })).toBe(true);
    expect(isTraversable(layout, { x: 2, y: 0 })).toBe(false);
    expect(isTraversable(layout, { x: 3, y: 0 })).toBe(false);
    expect(isTraversableKind("narrow")).toBe(true);
    expect(isTraversableKind("rack")).toBe(false);
    expect(isStationKind("pickup")).toBe(true);
    expect(isStationKind("dropoff")).toBe(true);
    expect(isStationKind("charger")).toBe(true);
    expect(isStationKind("lane")).toBe(false);
  });

  it("computes neighbours in deterministic N/E/S/W order and point helpers", () => {
    const origin = { x: 3, y: 4 };
    expect(neighbours(origin)).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 5 },
      { x: 2, y: 4 },
    ]);
    expect(manhattan(origin, { x: 0, y: 0 })).toBe(7);
    expect(samePoint(origin, { x: 3, y: 4 })).toBe(true);
    expect(samePoint(origin, { x: 3, y: 5 })).toBe(false);
    expect(pointKey(origin)).toBe("3,4");
    expect(isValidPoint({ x: 1, y: 2 })).toBe(true);
    expect(isValidPoint({ x: 1.5, y: 2 })).toBe(false);
    expect(isValidPoint(null)).toBe(false);
  });
});
