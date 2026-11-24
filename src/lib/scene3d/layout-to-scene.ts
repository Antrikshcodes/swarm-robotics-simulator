import type { CellKind, WarehouseLayout } from "@/types/simulation";
import { CELL, frameOf, gridToWorld } from "./grid-to-world";

/**
 * Derives the static 3D warehouse from the engine's own layout. Every
 * physical object below comes from a layout cell — nothing is hardcoded —
 * so the 3D view can never disagree with the grid the engine plans on.
 *
 * Rack cells become storage bays: four uprights (shared with neighbouring
 * bays), a deck and two load beams per level, and storage bins on each
 * level. Runs are detected from neighbouring rack cells so beams and bins
 * line up along the run; the open ends of every run get X-bracing.
 */

/** Rack geometry in world units (one cell ≈ 1.2 m, so racks are ≈ 3.1 m tall). */
export const RACK = {
  height: 2.6,
  /** Deck heights (bottom of each storage level). */
  levels: [0.12, 0.74, 1.36, 1.98] as const,
  uprightSize: 0.06,
  beamHeight: 0.07,
  beamDepth: 0.05,
  deckThickness: 0.025,
  /** Bin footprint along the run, height and depth across the run. */
  bin: { length: 0.42, height: 0.34, depth: 0.78 },
} as const;

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Rotation about world Y. */
  readonly rotY: number;
}

export interface BinPlacement extends Placement {
  /** 0–3: index into the neutral container palette. */
  readonly shade: number;
}

export interface BracePlacement extends Placement {
  /** Tilt of the diagonal in its plane (radians). */
  readonly tilt: number;
  readonly length: number;
}

export interface RackScene {
  readonly uprights: readonly Placement[];
  readonly beams: readonly Placement[];
  readonly decks: readonly Placement[];
  readonly bins: readonly BinPlacement[];
  readonly braces: readonly BracePlacement[];
  readonly obstacles: readonly Placement[];
  readonly rackCells: number;
}

const kindAt = (layout: WarehouseLayout, x: number, y: number): CellKind | null =>
  x < 0 || y < 0 || x >= layout.width || y >= layout.height ? null : layout.cells[y * layout.width + x];

/** Deterministic per-slot hash (no Math.random: the scene is identical on every load). */
function hash(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= v + 0x9e3779b9;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface RackSceneOptions {
  binsPerLevel?: number;
  emptyEvery?: number;
  /** Storage levels to build (cutaway view uses 1 so robots in narrow aisles stay visible). */
  levels?: number;
}

/** Upright height for a rack built with `levels` storage levels. */
export function rackHeight(levels: number): number {
  return levels >= RACK.levels.length ? RACK.height : RACK.levels[levels - 1] + RACK.bin.height + 0.2;
}

export function buildRackScene(layout: WarehouseLayout, options: RackSceneOptions = {}): RackScene {
  const frame = frameOf(layout);
  const binsPerLevel = options.binsPerLevel ?? 2;
  const emptyEvery = options.emptyEvery ?? 7;
  const levels = RACK.levels.slice(0, Math.max(1, Math.min(RACK.levels.length, options.levels ?? RACK.levels.length)));
  const height = rackHeight(levels.length);
  const isRack = (x: number, y: number) => kindAt(layout, x, y) === "rack";

  const uprights: Placement[] = [];
  const beams: Placement[] = [];
  const decks: Placement[] = [];
  const bins: BinPlacement[] = [];
  const braces: BracePlacement[] = [];
  const obstacles: Placement[] = [];
  const corners = new Set<string>();
  let rackCells = 0;

  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      const kind = kindAt(layout, x, y);
      const c = gridToWorld(frame, x, y);
      if (kind === "obstacle") {
        obstacles.push({ x: c.x, y: 0, z: c.z, rotY: 0 });
        continue;
      }
      if (kind !== "rack") continue;
      rackCells += 1;

      // Run direction: along X when a horizontal neighbour is also rack.
      const alongX = isRack(x - 1, y) || isRack(x + 1, y) || !(isRack(x, y - 1) || isRack(x, y + 1));
      const rotY = alongX ? 0 : Math.PI / 2;

      // Uprights at the four corners, shared between adjacent bays.
      const inset = RACK.uprightSize / 2 + 0.01;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = x * 2 + 1 + dx;
        const cz = y * 2 + 1 + dz;
        const key = `${cx},${cz}`;
        if (corners.has(key)) continue;
        corners.add(key);
        uprights.push({
          x: c.x + dx * (CELL / 2 - inset),
          y: height / 2,
          z: c.z + dz * (CELL / 2 - inset),
          rotY: 0,
        });
      }

      levels.forEach((level, li) => {
        decks.push({ x: c.x, y: level, z: c.z, rotY });
        // Two load beams on the long faces of the bay (perpendicular to the depth axis).
        for (const side of [-1, 1]) {
          const offset = side * (CELL / 2 - RACK.beamDepth / 2 - 0.005);
          beams.push(alongX ? { x: c.x, y: level, z: c.z + offset, rotY: 0 } : { x: c.x + offset, y: level, z: c.z, rotY: Math.PI / 2 });
        }
        // Bins sit on the deck, side by side along the run.
        const step = CELL / binsPerLevel;
        for (let s = 0; s < binsPerLevel; s += 1) {
          const h = hash(x, y, li, s);
          if (emptyEvery > 0 && h % emptyEvery === 0) continue;
          const along = -CELL / 2 + step * (s + 0.5);
          bins.push({
            x: alongX ? c.x + along : c.x,
            y: level + RACK.deckThickness / 2 + RACK.bin.height / 2,
            z: alongX ? c.z : c.z + along,
            rotY,
            shade: (h >>> 8) % 4,
          });
        }
      });

      // X-bracing on each open end of a run.
      const ends: [number, number][] = alongX
        ? ([[-1, 0], [1, 0]] as [number, number][]).filter(([dx]) => !isRack(x + dx, y))
        : ([[0, -1], [0, 1]] as [number, number][]).filter(([, dy]) => !isRack(x, y + dy));
      const length = Math.hypot(CELL - RACK.uprightSize * 2, height - 0.1);
      const tilt = Math.atan2(height - 0.1, CELL - RACK.uprightSize * 2);
      for (const [dx, dy] of ends) {
        const fx = c.x + (dx * CELL) / 2;
        const fz = c.z + (dy * CELL) / 2;
        // Brace plane faces along the run, so it spans the bay's depth.
        const braceRot = alongX ? Math.PI / 2 : 0;
        braces.push({ x: fx, y: height / 2, z: fz, rotY: braceRot, tilt, length });
        braces.push({ x: fx, y: height / 2, z: fz, rotY: braceRot, tilt: -tilt, length });
      }
    }
  }

  return { uprights, beams, decks, bins, braces, obstacles, rackCells };
}

/** Cells a robot may physically occupy (everything except racks and obstacles). */
export function isOpenCell(kind: CellKind): boolean {
  return kind !== "rack" && kind !== "obstacle";
}
