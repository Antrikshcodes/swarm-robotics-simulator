import type { GridPoint, Heading } from "@/types/simulation";

export const formatTick = (tick: number) => `T+${String(tick).padStart(4, "0")}`;

export const formatPoint = (p: GridPoint) => `${p.x}, ${p.y}`;

/** Spreadsheet-style column reference: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export const cellRef = (p: GridPoint) => `${columnLabel(p.x)}${p.y + 1}`;

export const HEADING_LABEL: Record<Heading, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};

export const HEADING_DEGREES: Record<Heading, number> = { N: 0, E: 90, S: 180, W: 270 };

export const formatPercent = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

/** Seconds of wall-clock time represented by `ticks` at the given tick length. */
export const ticksToSeconds = (ticks: number, tickMs: number) => (ticks * tickMs) / 1000;
