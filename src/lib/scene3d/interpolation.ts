import type { GridPoint } from "@/types/simulation";

/**
 * Visual interpolation between two engine snapshots. The engine moves a
 * robot at most one cell per tick; the renderer eases it from
 * `previousPosition` to `position` over the tick's wall-clock duration.
 * Nothing here changes simulation state.
 */
export interface TickClock {
  /** performance.now() when the latest tick was applied (0 = never stepped). */
  readonly steppedAt: number;
  /** Milliseconds per tick at 1× speed. */
  readonly tickMs: number;
  readonly speed: number;
  readonly interpolate: boolean;
}

/** 0 → just stepped, 1 → arrived. Same rule as the 2D renderer. */
export function tickProgress(clock: TickClock, now: number): number {
  if (!clock.interpolate || clock.steppedAt === 0) return 1;
  const duration = clock.tickMs / Math.max(clock.speed, 0.01);
  return Math.min(1, Math.max(0, (now - clock.steppedAt) / duration));
}

/** Smoothstep easing so robots accelerate out of and settle into cells. */
export const easeInOut = (t: number) => t * t * (3 - 2 * t);

export function lerpGrid(from: GridPoint, to: GridPoint, t: number): { x: number; y: number } {
  const e = easeInOut(t);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}
