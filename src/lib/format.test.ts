import { describe, expect, it } from "vitest";
import {
  cellRef,
  columnLabel,
  formatPercent,
  formatPoint,
  formatTick,
  HEADING_DEGREES,
  HEADING_LABEL,
  ticksToSeconds,
} from "./format";

describe("lib/format", () => {
  it("formats ticks, points, and percentages", () => {
    expect(formatTick(0)).toBe("T+0000");
    expect(formatTick(42)).toBe("T+0042");
    expect(formatTick(12345)).toBe("T+12345");
    expect(formatPoint({ x: 3, y: 11 })).toBe("3, 11");
    expect(formatPercent(0.8634)).toBe("86%");
    expect(formatPercent(0.8634, 1)).toBe("86.3%");
    expect(ticksToSeconds(20, 250)).toBe(5);
  });

  it("converts spreadsheet column indices and cell references", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
    expect(columnLabel(27)).toBe("AB");
    expect(cellRef({ x: 0, y: 0 })).toBe("A1");
    expect(cellRef({ x: 26, y: 9 })).toBe("AA10");
  });

  it("maps headings cleanly", () => {
    expect(HEADING_LABEL).toEqual({ N: "North", E: "East", S: "South", W: "West" });
    expect(HEADING_DEGREES).toEqual({ N: 0, E: 90, S: 180, W: 270 });
  });
});
