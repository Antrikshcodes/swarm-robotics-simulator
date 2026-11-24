import { describe, expect, it } from "vitest";
import { createSimulationSource } from "@/engine";
import type { GridPoint, SimulationSnapshot } from "@/types/simulation";
import { cellRef } from "./format";
import {
  connectedBlock,
  inspectBlock,
  inspectCell,
  inspectRobot,
  inspectStation,
  kindAt,
  resolveSelection,
  sameSelection,
  selectionCells,
  selectionForCell,
  selectionKey,
} from "./inspection";

function firstCell(snap: SimulationSnapshot, kind: string): GridPoint {
  const i = snap.layout.cells.findIndex((k) => k === kind);
  if (i < 0) throw new Error(`no ${kind} cell`);
  return { x: i % snap.layout.width, y: Math.floor(i / snap.layout.width) };
}

describe("entity identification", () => {
  const snap = createSimulationSource("high-density").getSnapshot();

  it("maps a picked cell to its station, rack, obstacle or the cell itself", () => {
    const station = snap.layout.stations[0];
    expect(selectionForCell(snap.layout, station.position)).toEqual({ kind: "station", id: station.id });
    const rack = firstCell(snap, "rack");
    expect(selectionForCell(snap.layout, rack)).toEqual({ kind: "rack", ...rack });
    const obstacle = firstCell(snap, "obstacle");
    expect(selectionForCell(snap.layout, obstacle)).toEqual({ kind: "obstacle", ...obstacle });
    const lane = firstCell(snap, "lane");
    expect(selectionForCell(snap.layout, lane)).toEqual({ kind: "cell", ...lane });
    expect(selectionForCell(snap.layout, { x: -1, y: 0 })).toBeNull();
    expect(selectionForCell(snap.layout, { x: snap.layout.width, y: 0 })).toBeNull();
  });

  it("gives every selection a stable identity", () => {
    expect(selectionKey(null)).toBe("none");
    expect(selectionKey({ kind: "robot", id: "R-01" })).toBe("robot:R-01");
    expect(selectionKey({ kind: "rack", x: 3, y: 1 })).toBe("rack:3,1");
    expect(sameSelection({ kind: "cell", x: 1, y: 2 }, { kind: "cell", x: 1, y: 2 })).toBe(true);
    expect(sameSelection({ kind: "cell", x: 1, y: 2 }, { kind: "rack", x: 1, y: 2 })).toBe(false);
  });

  it("resolves selections against the snapshot and rejects stale or mismatched ones", () => {
    const lane = firstCell(snap, "lane");
    expect(resolveSelection(snap, { kind: "rack", ...lane }, cellRef)).toBeNull();
    expect(resolveSelection(snap, { kind: "robot", id: "R-99" }, cellRef)).toBeNull();
    expect(resolveSelection(snap, { kind: "station", id: "XX-01" }, cellRef)).toBeNull();
    expect(resolveSelection(snap, { kind: "cell", x: 999, y: 0 }, cellRef)).toBeNull();
    expect(resolveSelection(snap, null, cellRef)).toBeNull();
    expect(resolveSelection(snap, { kind: "robot", id: "R-01" }, cellRef)?.kind).toBe("robot");
    expect(resolveSelection(snap, { kind: "cell", ...lane }, cellRef)?.kind).toBe("cell");
  });
});

describe("rack inspection", () => {
  // High-density row 1: ".-##########--##########-." — two 10-bay single-depth runs.
  const engine = createSimulationSource("high-density");
  for (let i = 0; i < 25; i += 1) engine.step();
  const snap = engine.getSnapshot();

  it("resolves the whole connected rack block from any of its bays", () => {
    const a = connectedBlock(snap.layout, { x: 5, y: 1 }, "rack");
    const b = connectedBlock(snap.layout, { x: 11, y: 1 }, "rack");
    expect(a.cells).toHaveLength(10);
    expect(a.bounds).toEqual({ x0: 2, y0: 1, x1: 11, y1: 1 });
    expect(a).toEqual(b);
    expect(a.width).toBe(10);
    expect(a.depth).toBe(1);
    expect(selectionCells(snap, { kind: "rack", x: 5, y: 1 })).toHaveLength(10);
    expect(connectedBlock(snap.layout, { x: 0, y: 0 }, "rack").cells).toHaveLength(0);
  });

  it("describes dimensions and the aisles on each face from layout and live state only", () => {
    const r = inspectBlock(snap, { x: 5, y: 1 }, "rack", cellRef)!;
    expect(r.label).toBe(`${cellRef({ x: 2, y: 1 })}–${cellRef({ x: 11, y: 1 })}`);
    expect(r.orientation).toBe("east-west");
    expect(r.storageModelled).toBe(false);
    const sides = r.faces.map((f) => f.side).sort();
    expect(sides).toEqual(["east", "north", "south", "west"]);
    const north = r.faces.find((f) => f.side === "north")!;
    expect(north.cells).toHaveLength(10);
    expect(north.cells.every((c) => c.y === 0)).toBe(true);
    // Robots listed on a face are exactly the robots standing on its cells.
    for (const face of r.faces) {
      const expected = snap.robots.filter((rb) => face.cells.some((c) => c.x === rb.position.x && c.y === rb.position.y)).map((rb) => rb.id);
      expect(face.robots).toEqual(expected);
      expect(face.closedCells).toBe(0);
    }
    // Every robot "routing alongside" really has a route cell on one of the faces.
    const faceCells = r.faces.flatMap((f) => f.cells);
    for (const id of r.routesAlongside) {
      const robot = snap.robots.find((x) => x.id === id)!;
      expect(robot.route.some((q) => faceCells.some((c) => c.x === q.x && c.y === q.y))).toBe(true);
    }
  });

  it("describes obstacles as blocks too", () => {
    const o = inspectBlock(snap, { x: 15, y: 15 }, "obstacle", cellRef)!;
    expect(o.block.cells).toHaveLength(2);
    expect(o.kind).toBe("obstacle");
  });
});

describe("aisle / cell inspection", () => {
  it("reports occupancy, reservations, planned routes and nearby robots from engine state", () => {
    const engine = createSimulationSource("standard");
    for (let i = 0; i < 12; i += 1) engine.step();
    const snap = engine.getSnapshot();
    const robot = snap.robots.find((r) => r.route.length > 0)!;
    const here = inspectCell(snap, robot.position)!;
    expect(here.occupant?.id).toBe(robot.id);
    expect(here.nearby[0]).toMatchObject({ id: robot.id, distance: 0 });

    const next = inspectCell(snap, robot.route[0])!;
    expect(next.plannedBy).toContain(robot.id);
    const reservation = snap.coordination.reservations.find((r) => r.tick > snap.tick)!;
    const reserved = inspectCell(snap, reservation)!;
    expect(reserved.reservations.some((r) => r.robotId === reservation.robotId && r.inTicks === reservation.tick - snap.tick)).toBe(true);
    expect(reserved.reservations.map((r) => r.tick)).toEqual([...reserved.reservations.map((r) => r.tick)].sort((a, b) => a - b));
  });

  it("reports closures and narrow aisles", () => {
    const engine = createSimulationSource("narrow-aisle");
    const snap0 = engine.getSnapshot();
    const narrow = inspectCell(snap0, firstCell(snap0, "narrow"))!;
    expect(narrow.narrow).toBe(true);
    expect(narrow.traversable).toBe(true);

    const lane = firstCell(snap0, "lane");
    expect(engine.dispatch({ type: "close_aisle", cells: [lane], label: "test closure" }).ok).toBe(true);
    const closed = inspectCell(engine.getSnapshot(), lane)!;
    expect(closed.closure?.label).toBe("test closure");
    expect(closed.traversable).toBe(false);
    expect(closed.openByLayout).toBe(true);
  });

  it("marks racks as not traversable and offers no aisle run for them", () => {
    const snap = createSimulationSource("standard").getSnapshot();
    const rack = inspectCell(snap, firstCell(snap, "rack"))!;
    expect(rack.traversable).toBe(false);
    expect(rack.aisle).toHaveLength(0);
    expect(kindAt(snap.layout, -1, -1)).toBeNull();
  });
});

describe("station and robot inspection", () => {
  const engine = createSimulationSource("standard");
  for (let i = 0; i < 30; i += 1) engine.step();
  const snap = engine.getSnapshot();

  it("lists only unfinished missions that start or end at the station", () => {
    const pickup = snap.layout.stations.find((s) => s.kind === "pickup")!;
    const s = inspectStation(snap, pickup.id)!;
    for (const m of s.openMissions) {
      expect(m.pickupStationId === pickup.id || m.dropoffStationId === pickup.id).toBe(true);
      expect(["completed", "cancelled"]).not.toContain(m.state);
    }
    expect(s.completed).toBe(snap.missions.filter((m) => (m.pickupStationId === pickup.id || m.dropoffStationId === pickup.id) && m.state === "completed").length);
    for (const r of s.inbound) expect(r.destinationStationId).toBe(pickup.id);
    const charger = snap.layout.stations.find((x) => x.kind === "charger");
    if (charger) expect(inspectStation(snap, charger.id)!.openMissions).toHaveLength(0);
  });

  it("derives route, destination and wait relations for a robot", () => {
    const robot = snap.robots.find((r) => r.route.length > 0) ?? snap.robots[0];
    const r = inspectRobot(snap, robot.id)!;
    expect(r.routeLength).toBe(robot.route.length);
    expect(r.nextCell).toEqual(robot.route[0] ?? null);
    expect(r.mission?.id ?? null).toBe(robot.missionId);
    expect(r.destination?.id ?? null).toBe(robot.destinationStationId);
  });
});
