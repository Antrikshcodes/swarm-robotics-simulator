import type { GridPoint, Heading, WarehouseLayout } from "@/types/simulation";

/**
 * The single grid ⇄ world conversion for the 3D Simulation Studio.
 *
 *   grid x  → world  x  (east)
 *   grid y  → world  z  (south; the 2D view's "down")
 *   height  → world  y
 *
 * One grid cell is CELL world units (≈ 1.2 m at the scale the models are
 * built to). The warehouse is centred on the world origin so camera presets
 * work for any layout size.
 */
export const CELL = 1;

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GridFrame {
  readonly width: number;
  readonly height: number;
}

export function frameOf(layout: Pick<WarehouseLayout, "width" | "height">): GridFrame {
  return { width: layout.width, height: layout.height };
}

/** Centre of a grid cell (fractional grid coordinates are allowed for interpolation). */
export function gridToWorld(frame: GridFrame, gx: number, gy: number, y = 0): WorldPoint {
  return {
    x: (gx + 0.5 - frame.width / 2) * CELL,
    y,
    z: (gy + 0.5 - frame.height / 2) * CELL,
  };
}

/** Grid cell containing a world point, or null outside the warehouse. */
export function worldToGrid(frame: GridFrame, wx: number, wz: number): GridPoint | null {
  const x = Math.floor(wx / CELL + frame.width / 2);
  const y = Math.floor(wz / CELL + frame.height / 2);
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return null;
  return { x, y };
}

/** Half extents of the warehouse in world units. */
export function worldExtent(frame: GridFrame): { halfX: number; halfZ: number } {
  return { halfX: (frame.width * CELL) / 2, halfZ: (frame.height * CELL) / 2 };
}

/**
 * Yaw (rotation about world Y) for a grid heading. Robot models face −Z
 * (grid north) at yaw 0; yaw grows counter-clockwise seen from above.
 */
export const HEADING_YAW: Record<Heading, number> = {
  N: 0,
  W: Math.PI / 2,
  S: Math.PI,
  E: -Math.PI / 2,
};

/** Shortest signed angle from `from` to `to`, in (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
