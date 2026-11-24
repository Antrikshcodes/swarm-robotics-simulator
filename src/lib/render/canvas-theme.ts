/**
 * Canvas colours are read from the CSS custom properties defined in
 * globals.css so the design tokens have a single source of truth.
 */
export interface CanvasTheme {
  readonly bg: string;
  readonly floor: string;
  readonly lane: string;
  readonly grid: string;
  readonly rack: string;
  readonly rackEdge: string;
  readonly obstacle: string;
  readonly narrow: string;
  readonly line: string;
  readonly lineStrong: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textDim: string;
  readonly lime: string;
  readonly cyan: string;
  readonly amber: string;
  readonly red: string;
  readonly surface: string;
  readonly robots: readonly string[];
  readonly monoFont: string;
  readonly sansFont: string;
}

const FALLBACK = "#ff00ff";

export function readCanvasTheme(element: Element): CanvasTheme {
  const style = getComputedStyle(element);
  const v = (name: string) => style.getPropertyValue(name).trim() || FALLBACK;
  const mono = style.getPropertyValue("--font-geist-mono").trim();
  const sans = style.getPropertyValue("--font-geist-sans").trim();
  return {
    bg: v("--swarm-bg"),
    floor: v("--swarm-floor"),
    lane: v("--swarm-floor-lane"),
    grid: v("--swarm-grid"),
    rack: v("--swarm-rack"),
    rackEdge: v("--swarm-rack-edge"),
    obstacle: v("--swarm-obstacle"),
    narrow: v("--swarm-narrow"),
    line: v("--swarm-line"),
    lineStrong: v("--swarm-line-strong"),
    text: v("--swarm-text"),
    textSecondary: v("--swarm-text-secondary"),
    textDim: v("--swarm-text-dim"),
    lime: v("--swarm-lime"),
    cyan: v("--swarm-cyan"),
    amber: v("--swarm-amber"),
    red: v("--swarm-red"),
    surface: v("--swarm-surface"),
    robots: Array.from({ length: 8 }, (_, i) => v(`--robot-${i + 1}`)),
    monoFont: mono ? `${mono}, ui-monospace, monospace` : "ui-monospace, monospace",
    sansFont: sans ? `${sans}, ui-sans-serif, system-ui` : "ui-sans-serif, system-ui",
  };
}

export function robotColor(theme: CanvasTheme, colorIndex: number): string {
  return theme.robots[(colorIndex - 1 + theme.robots.length) % theme.robots.length];
}

/** Apply alpha to a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
