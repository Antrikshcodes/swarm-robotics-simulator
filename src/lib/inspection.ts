import type {
  CellKind,
  EntitySelection,
  GridPoint,
  Mission,
  RobotState,
  SimulationSnapshot,
  Station,
  WarehouseLayout,
} from "@/types/simulation";

/**
 * Warehouse inspection: pure read-only projections of the engine snapshot
 * for whatever the operator has selected — robot, rack block, obstacle,
 * station or an open cell. Used by both the 2D and 3D views and the
 * inspector panel, so every view identifies and describes an entity the
 * same way.
 *
 * Nothing here invents data. The engine models cells, stations, robots,
 * missions, packages, reservations, holds, the wait-for graph, deadlocks and
 * closures; it does not model rack inventory, storage levels or bin
 * occupancy, so those are reported as not modelled rather than guessed.
 */

// ------------------------------------------------------------ identification

export const kindAt = (layout: WarehouseLayout, x: number, y: number): CellKind | null =>
  x < 0 || y < 0 || x >= layout.width || y >= layout.height ? null : layout.cells[y * layout.width + x];

/** The selection a click on a grid cell means: its station, rack, obstacle, or the cell itself. */
export function selectionForCell(layout: WarehouseLayout, p: GridPoint): EntitySelection | null {
  const kind = kindAt(layout, p.x, p.y);
  if (!kind) return null;
  const station = layout.stations.find((s) => s.position.x === p.x && s.position.y === p.y);
  if (station) return { kind: "station", id: station.id };
  if (kind === "rack") return { kind: "rack", x: p.x, y: p.y };
  if (kind === "obstacle") return { kind: "obstacle", x: p.x, y: p.y };
  return { kind: "cell", x: p.x, y: p.y };
}

/** Stable identity string for a selection (for keys and comparisons). */
export function selectionKey(sel: EntitySelection | null): string {
  if (!sel) return "none";
  if (sel.kind === "robot" || sel.kind === "station") return `${sel.kind}:${sel.id}`;
  return `${sel.kind}:${sel.x},${sel.y}`;
}

export const sameSelection = (a: EntitySelection | null, b: EntitySelection | null) => selectionKey(a) === selectionKey(b);

/**
 * Rack and obstacle selections address a block; any cell of the same block
 * is the same selection for highlighting purposes.
 */
export function selectionCells(snapshot: SimulationSnapshot, sel: EntitySelection | null): readonly GridPoint[] {
  if (!sel) return [];
  if (sel.kind === "robot") {
    const r = snapshot.robots.find((x) => x.id === sel.id);
    return r ? [r.position] : [];
  }
  if (sel.kind === "station") {
    const s = snapshot.layout.stations.find((x) => x.id === sel.id);
    return s ? [s.position] : [];
  }
  if (sel.kind === "rack" || sel.kind === "obstacle") return connectedBlock(snapshot.layout, sel, sel.kind).cells;
  return [{ x: sel.x, y: sel.y }];
}

// ------------------------------------------------------------------ geometry

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Block {
  readonly cells: readonly GridPoint[];
  readonly bounds: Bounds;
  /** Size of the bounding box in cells. */
  readonly width: number;
  readonly depth: number;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 4-connected block of cells of `kind` containing `p` (empty if `p` is not that kind). */
export function connectedBlock(layout: WarehouseLayout, p: GridPoint, kind: CellKind): Block {
  if (kindAt(layout, p.x, p.y) !== kind) return { cells: [], bounds: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, width: 0, depth: 0 };
  const seen = new Set<number>([p.y * layout.width + p.x]);
  const queue: GridPoint[] = [p];
  const cells: GridPoint[] = [];
  let x0 = p.x;
  let y0 = p.y;
  let x1 = p.x;
  let y1 = p.y;
  while (queue.length) {
    const c = queue.pop()!;
    cells.push(c);
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      const key = ny * layout.width + nx;
      if (seen.has(key) || kindAt(layout, nx, ny) !== kind) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  return { cells, bounds: { x0, y0, x1, y1 }, width: x1 - x0 + 1, depth: y1 - y0 + 1 };
}

const OPEN_KINDS: ReadonlySet<CellKind> = new Set(["floor", "lane", "narrow", "pickup", "dropoff", "charger"]);

const at = (list: readonly GridPoint[], x: number, y: number) => list.some((p) => p.x === x && p.y === y);

function closureAt(snapshot: SimulationSnapshot, x: number, y: number) {
  return snapshot.closures.find((c) => at(c.cells, x, y)) ?? null;
}

function robotAt(snapshot: SimulationSnapshot, x: number, y: number): RobotState | null {
  return snapshot.robots.find((r) => r.position.x === x && r.position.y === y) ?? null;
}

function stationAtCell(layout: WarehouseLayout, x: number, y: number): Station | null {
  return layout.stations.find((s) => s.position.x === x && s.position.y === y) ?? null;
}

// ----------------------------------------------------------------- open cell

export interface RobotNearby {
  readonly id: string;
  readonly colorIndex: number;
  readonly status: RobotState["status"];
  readonly distance: number;
  readonly missionId: string | null;
  readonly position: GridPoint;
}

export interface CellInspection {
  readonly point: GridPoint;
  readonly kind: CellKind;
  /** Open by layout (not a rack or obstacle). */
  readonly openByLayout: boolean;
  /** Robots may plan into it right now (open and not closed). */
  readonly traversable: boolean;
  readonly narrow: boolean;
  readonly closure: { readonly id: string; readonly label: string; readonly createdTick: number } | null;
  readonly station: Station | null;
  readonly occupant: RobotState | null;
  /** Future cell reservations on this cell, soonest first. */
  readonly reservations: readonly { readonly robotId: string; readonly tick: number; readonly inTicks: number }[];
  /** Robots holding this cell at the end of their plan. */
  readonly holds: readonly string[];
  /** Wait-for edges whose blocking cell is this one. */
  readonly waits: readonly { readonly robotId: string; readonly waitingFor: string; readonly ticks: number; readonly reason: string | null }[];
  /** Open deadlock incidents that list this cell as blocking. */
  readonly deadlocks: readonly string[];
  /** Robots whose planned route passes through this cell. */
  readonly plannedBy: readonly string[];
  /** Robots within `radius` cells (Manhattan), nearest first. */
  readonly nearby: readonly RobotNearby[];
  /** Straight aisle run through the cell (row or column), bounded by racks, stations and closures. */
  readonly aisle: readonly GridPoint[];
}

export function inspectCell(snapshot: SimulationSnapshot, p: GridPoint, radius = 3): CellInspection | null {
  const kind = kindAt(snapshot.layout, p.x, p.y);
  if (!kind) return null;
  const closure = closureAt(snapshot, p.x, p.y);
  const openByLayout = OPEN_KINDS.has(kind);
  const reservations = snapshot.coordination.reservations
    .filter((r) => r.x === p.x && r.y === p.y && r.tick > snapshot.tick)
    .sort((a, b) => a.tick - b.tick)
    .map((r) => ({ robotId: r.robotId, tick: r.tick, inTicks: r.tick - snapshot.tick }));
  return {
    point: { x: p.x, y: p.y },
    kind,
    openByLayout,
    traversable: openByLayout && closure === null,
    narrow: kind === "narrow",
    closure: closure ? { id: closure.id, label: closure.label, createdTick: closure.createdTick } : null,
    station: stationAtCell(snapshot.layout, p.x, p.y),
    occupant: robotAt(snapshot, p.x, p.y),
    reservations,
    holds: snapshot.coordination.holds.filter((h) => h.x === p.x && h.y === p.y).map((h) => h.robotId),
    waits: snapshot.coordination.waitGraph
      .filter((e) => e.cell && e.cell.x === p.x && e.cell.y === p.y)
      .map((e) => ({ robotId: e.robotId, waitingFor: e.waitingFor, ticks: e.ticks, reason: e.reason ?? null })),
    deadlocks: snapshot.deadlocks.incidents.filter((i) => i.status !== "resolved" && at(i.blockingCells, p.x, p.y)).map((i) => i.id),
    plannedBy: snapshot.robots.filter((r) => at(r.route, p.x, p.y)).map((r) => r.id),
    nearby: robotsNear(snapshot, [p], radius),
    aisle: openByLayout && !stationAtCell(snapshot.layout, p.x, p.y) ? aisleRun(snapshot, p) : [],
  };
}

function robotsNear(snapshot: SimulationSnapshot, cells: readonly GridPoint[], radius: number): RobotNearby[] {
  const out: RobotNearby[] = [];
  for (const r of snapshot.robots) {
    let d = Infinity;
    for (const c of cells) d = Math.min(d, Math.abs(r.position.x - c.x) + Math.abs(r.position.y - c.y));
    if (d <= radius) out.push({ id: r.id, colorIndex: r.colorIndex, status: r.status, distance: d, missionId: r.missionId, position: r.position });
  }
  return out.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

/**
 * The straight aisle run through a cell: the longer of its row or column
 * segment of open, non-station, non-closed cells, capped at 8 cells centred
 * on the cell. Used for "close aisle".
 */
export function aisleRun(snapshot: SimulationSnapshot, p: GridPoint): GridPoint[] {
  const { layout } = snapshot;
  const open = (x: number, y: number) => {
    const k = kindAt(layout, x, y);
    return k !== null && (k === "floor" || k === "lane" || k === "narrow") && !closureAt(snapshot, x, y);
  };
  const run = (dx: number, dy: number) => {
    const cells = [{ x: p.x, y: p.y }];
    for (let i = 1; i <= 3 && open(p.x - dx * i, p.y - dy * i); i += 1) cells.unshift({ x: p.x - dx * i, y: p.y - dy * i });
    for (let i = 1; i <= 4 && cells.length < 8 && open(p.x + dx * i, p.y + dy * i); i += 1) cells.push({ x: p.x + dx * i, y: p.y + dy * i });
    return cells;
  };
  const row = run(1, 0);
  const column = run(0, 1);
  return column.length > row.length ? column : row;
}

// ---------------------------------------------------------------------- rack

export type Side = "north" | "south" | "east" | "west";

export interface AisleFace {
  readonly side: Side;
  /** Open cells along this face of the block. */
  readonly cells: readonly GridPoint[];
  readonly kinds: readonly CellKind[];
  readonly narrow: boolean;
  readonly closedCells: number;
  readonly robots: readonly string[];
  readonly stations: readonly string[];
}

export interface BlockInspection {
  readonly kind: "rack" | "obstacle";
  /** Derived label from the block's corner cells (the engine has no rack IDs). */
  readonly label: string;
  readonly picked: GridPoint;
  readonly block: Block;
  /** Long axis of the block. */
  readonly orientation: "east-west" | "north-south" | "square";
  readonly faces: readonly AisleFace[];
  readonly nearby: readonly RobotNearby[];
  /** Robots whose planned route runs along the block's faces. */
  readonly routesAlongside: readonly string[];
  /** The engine does not model inventory, storage levels or bin occupancy. */
  readonly storageModelled: false;
}

export function inspectBlock(snapshot: SimulationSnapshot, p: GridPoint, kind: "rack" | "obstacle", cellLabel: (p: GridPoint) => string): BlockInspection | null {
  const block = connectedBlock(snapshot.layout, p, kind);
  if (block.cells.length === 0) return null;
  const { x0, y0, x1, y1 } = block.bounds;
  const faces: AisleFace[] = [];
  const sides: [Side, number, number][] = [
    ["north", 0, -1],
    ["south", 0, 1],
    ["west", -1, 0],
    ["east", 1, 0],
  ];
  const faceCells = new Set<string>();
  for (const [side, dx, dy] of sides) {
    const cells: GridPoint[] = [];
    for (const c of block.cells) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      const k = kindAt(snapshot.layout, nx, ny);
      if (k && OPEN_KINDS.has(k) && !faceCells.has(`${side}:${nx},${ny}`)) {
        faceCells.add(`${side}:${nx},${ny}`);
        cells.push({ x: nx, y: ny });
      }
    }
    if (cells.length === 0) continue;
    const kinds = [...new Set(cells.map((c) => kindAt(snapshot.layout, c.x, c.y)!))];
    faces.push({
      side,
      cells,
      kinds,
      narrow: kinds.includes("narrow"),
      closedCells: cells.filter((c) => closureAt(snapshot, c.x, c.y)).length,
      robots: snapshot.robots.filter((r) => at(cells, r.position.x, r.position.y)).map((r) => r.id),
      stations: snapshot.layout.stations.filter((s) => at(cells, s.position.x, s.position.y)).map((s) => s.id),
    });
  }
  const allFace = faces.flatMap((f) => f.cells);
  return {
    kind,
    label: block.cells.length === 1 ? cellLabel({ x: x0, y: y0 }) : `${cellLabel({ x: x0, y: y0 })}–${cellLabel({ x: x1, y: y1 })}`,
    picked: { x: p.x, y: p.y },
    block,
    orientation: block.width > block.depth ? "east-west" : block.depth > block.width ? "north-south" : "square",
    faces,
    nearby: robotsNear(snapshot, block.cells, 2),
    routesAlongside: snapshot.robots.filter((r) => r.route.some((q) => at(allFace, q.x, q.y))).map((r) => r.id),
    storageModelled: false,
  };
}

// ------------------------------------------------------------------- station

export interface StationInspection {
  readonly station: Station;
  /** Robot standing on the station cell. */
  readonly docked: RobotState | null;
  /** Robots heading to this station (excluding the docked one). */
  readonly inbound: readonly RobotState[];
  /** Missions that start or end here and are not finished, newest first. */
  readonly openMissions: readonly Mission[];
  readonly completed: number;
  /** Packages currently waiting at this station. */
  readonly waitingPackages: readonly string[];
}

const isOpenMission = (m: Mission) => m.state !== "completed" && m.state !== "cancelled";

export function inspectStation(snapshot: SimulationSnapshot, id: string): StationInspection | null {
  const station = snapshot.layout.stations.find((s) => s.id === id);
  if (!station) return null;
  const docked = robotAt(snapshot, station.position.x, station.position.y);
  const related = station.kind === "charger" ? [] : snapshot.missions.filter((m) => m.pickupStationId === id || m.dropoffStationId === id);
  return {
    station,
    docked,
    inbound: snapshot.robots.filter((r) => r.destinationStationId === id && r.id !== docked?.id),
    openMissions: related.filter(isOpenMission).sort((a, b) => b.createdTick - a.createdTick),
    completed: related.filter((m) => m.state === "completed").length,
    waitingPackages: snapshot.packages.filter((p) => p.location.kind === "station" && p.location.stationId === id && p.state !== "delivered").map((p) => p.id),
  };
}

// --------------------------------------------------------------------- robot

export interface RobotInspection {
  readonly robot: RobotState;
  readonly mission: Mission | null;
  readonly destination: Station | null;
  /** Cells left on the planned route. */
  readonly routeLength: number;
  readonly nextCell: GridPoint | null;
  /** Robots this robot is waiting for, and robots waiting for it. */
  readonly waitingFor: readonly string[];
  readonly blocking: readonly string[];
}

export function inspectRobot(snapshot: SimulationSnapshot, id: string): RobotInspection | null {
  const robot = snapshot.robots.find((r) => r.id === id);
  if (!robot) return null;
  const graph = snapshot.coordination.waitGraph;
  return {
    robot,
    mission: robot.missionId ? (snapshot.missions.find((m) => m.id === robot.missionId) ?? null) : null,
    destination: robot.destinationStationId ? (snapshot.layout.stations.find((s) => s.id === robot.destinationStationId) ?? null) : null,
    routeLength: robot.route.length,
    nextCell: robot.route[0] ?? null,
    waitingFor: graph.filter((e) => e.robotId === id).map((e) => e.waitingFor),
    blocking: graph.filter((e) => e.waitingFor === id).map((e) => e.robotId),
  };
}

// ------------------------------------------------------------------- resolve

export type Inspected =
  | { readonly kind: "robot"; readonly data: RobotInspection }
  | { readonly kind: "station"; readonly data: StationInspection }
  | { readonly kind: "rack" | "obstacle"; readonly data: BlockInspection }
  | { readonly kind: "cell"; readonly data: CellInspection };

/**
 * Resolve a selection against the current snapshot. Returns null when the
 * selection no longer refers to anything (robot gone, cell out of range,
 * rack selection on a non-rack cell).
 */
export function resolveSelection(snapshot: SimulationSnapshot, sel: EntitySelection | null, cellLabel: (p: GridPoint) => string): Inspected | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "robot": {
      const data = inspectRobot(snapshot, sel.id);
      return data ? { kind: "robot", data } : null;
    }
    case "station": {
      const data = inspectStation(snapshot, sel.id);
      return data ? { kind: "station", data } : null;
    }
    case "rack":
    case "obstacle": {
      const data = inspectBlock(snapshot, sel, sel.kind, cellLabel);
      return data ? { kind: sel.kind, data } : null;
    }
    case "cell": {
      const data = inspectCell(snapshot, sel);
      return data ? { kind: "cell", data } : null;
    }
  }
}
