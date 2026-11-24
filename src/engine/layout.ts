import type {
  CellKind,
  GridPoint,
  Station,
  StationKind,
  WarehouseLayout,
} from "../types/simulation";

/**
 * Warehouse maps are authored as ASCII so scenarios stay readable and
 * reviewable in diffs.
 *
 *   .  open floor          -  marked travel lane     =  narrow (one-cell) passage
 *   #  storage rack        X  structural obstacle
 *   P  pickup station      D  drop-off station       C  charging dock
 */
const LEGEND: Record<string, CellKind> = {
  ".": "floor",
  "-": "lane",
  "=": "narrow",
  "#": "rack",
  X: "obstacle",
  P: "pickup",
  D: "dropoff",
  C: "charger",
};

const STATION_PREFIX: Record<StationKind, string> = {
  pickup: "PK",
  dropoff: "DO",
  charger: "CH",
};

const STATION_LABEL: Record<StationKind, string> = {
  pickup: "Inbound pick face",
  dropoff: "Outbound dock",
  charger: "Charging dock",
};

const TRAVERSABLE: ReadonlySet<CellKind> = new Set<CellKind>([
  "floor",
  "lane",
  "narrow",
  "pickup",
  "dropoff",
  "charger",
]);

export function isTraversableKind(kind: CellKind): boolean {
  return TRAVERSABLE.has(kind);
}

export function parseLayout(map: readonly string[]): WarehouseLayout {
  const height = map.length;
  if (height === 0) throw new Error("Layout map is empty");
  const width = map[0].length;

  const cells: CellKind[] = [];
  const stations: Station[] = [];
  const counters: Record<StationKind, number> = { pickup: 0, dropoff: 0, charger: 0 };

  map.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Layout row ${y} has width ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x += 1) {
      const symbol = row[x];
      const kind = LEGEND[symbol];
      if (!kind) throw new Error(`Unknown layout symbol "${symbol}" at (${x}, ${y})`);
      cells.push(kind);
      if (kind === "pickup" || kind === "dropoff" || kind === "charger") {
        counters[kind] += 1;
        stations.push({
          id: `${STATION_PREFIX[kind]}-${String(counters[kind]).padStart(2, "0")}`,
          kind,
          label: STATION_LABEL[kind],
          position: { x, y },
        });
      }
    }
  });

  return { width, height, cells, stations };
}

export function inBounds(layout: WarehouseLayout, p: GridPoint): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < layout.width && p.y < layout.height;
}

export function cellKindAt(layout: WarehouseLayout, p: GridPoint): CellKind | null {
  if (!inBounds(layout, p)) return null;
  return layout.cells[p.y * layout.width + p.x];
}

export function isTraversable(layout: WarehouseLayout, p: GridPoint): boolean {
  const kind = cellKindAt(layout, p);
  return kind !== null && isTraversableKind(kind);
}

export function stationAt(layout: WarehouseLayout, p: GridPoint): Station | undefined {
  return layout.stations.find((s) => s.position.x === p.x && s.position.y === p.y);
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
