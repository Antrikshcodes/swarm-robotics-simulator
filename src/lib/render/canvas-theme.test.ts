import { describe, expect, it, vi } from "vitest";
import { readCanvasTheme, robotColor, withAlpha, type CanvasTheme } from "./canvas-theme";

describe("canvas-theme helpers", () => {
  it("applies clamped alpha to 6-digit hex colors and preserves non-hex values", () => {
    expect(withAlpha("#40c8e8", 0)).toBe("#40c8e800");
    expect(withAlpha("#40c8e8", 1)).toBe("#40c8e8ff");
    expect(withAlpha("#40c8e8", 0.5)).toBe("#40c8e880");
    expect(withAlpha("#40c8e8", 2)).toBe("#40c8e8ff");
    expect(withAlpha("#40c8e8", -1)).toBe("#40c8e800");
    expect(withAlpha("rgb(1,2,3)", 0.4)).toBe("rgb(1,2,3)");
  });

  it("wraps 1-based robot colour indices around the palette", () => {
    const theme = { robots: ["#111111", "#222222", "#333333"] } as unknown as CanvasTheme;
    expect(robotColor(theme, 1)).toBe("#111111");
    expect(robotColor(theme, 3)).toBe("#333333");
    expect(robotColor(theme, 4)).toBe("#111111");
    expect(robotColor(theme, 0)).toBe("#333333");
  });

  it("reads CSS custom properties with safe fallbacks when tokens are empty", () => {
    const stubStyle = {
      getPropertyValue: (name: string) => {
        if (name === "--swarm-bg") return " #090d10 ";
        if (name === "--font-geist-mono") return '"Geist Mono"';
        if (name === "--robot-1") return "#b7f34a";
        return "";
      },
    };
    const origGetComputedStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = vi.fn(() => stubStyle as unknown as CSSStyleDeclaration);
    try {
      const theme = readCanvasTheme({} as Element);
      expect(theme.bg).toBe("#090d10");
      expect(theme.lime).toBe("#ff00ff");
      expect(theme.robots).toHaveLength(8);
      expect(theme.robots[0]).toBe("#b7f34a");
      expect(theme.robots[7]).toBe("#ff00ff");
      expect(theme.monoFont).toContain('"Geist Mono"');
      expect(theme.sansFont).toBe("ui-sans-serif, system-ui");
    } finally {
      globalThis.getComputedStyle = origGetComputedStyle;
    }
  });
});
