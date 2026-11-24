import type {
  CellKind,
  EntitySelection,
  GridPoint,
  Heading,
  RobotState,
  SimulationSnapshot,
} from "@/types/simulation";
import { columnLabel } from "@/lib/format";
import { robotColor, withAlpha, type CanvasTheme } from "./canvas-theme";

/**
 * Pure Canvas 2D renderer for the warehouse.
 *
 * Draws a snapshot; never mutates or decides simulation state. The only
 * time-dependent input is `progress` (0–1), used to interpolate robot
 * markers between `previousPosition` and `position` for smooth display.
 */
export interface RenderView {
  /** CSS pixels per grid cell. */
  readonly cell: number;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Viewport size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

export interface RenderOptions {
  readonly showGrid: boolean;
  readonly showCoordinates: boolean;
  readonly showRoutes: boolean;
  readonly showLabels: boolean;
  readonly selection: EntitySelection | null;
  readonly hover: GridPoint | null;
  readonly progress: number;
}

export const RULER_TOP = 20;
export const RULER_LEFT = 26;

const HEADING_ANGLE: Record<Heading, number> = {
  N: -Math.PI / 2,
  E: 0,
  S: Math.PI / 2,
  W: Math.PI,
};

export function screenToCell(view: RenderView, sx: number, sy: number): GridPoint {
  return {
    x: Math.floor((sx - view.offsetX) / view.cell),
    y: Math.floor((sy - view.offsetY) / view.cell),
  };
}

function interpolated(robot: RobotState, progress: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: robot.previousPosition.x + (robot.position.x - robot.previousPosition.x) * t,
    y: robot.previousPosition.y + (robot.position.y - robot.previousPosition.y) * t,
  };
}

export function hitTest(
  snapshot: SimulationSnapshot,
  view: RenderView,
  sx: number,
  sy: number,
  progress: number,
): EntitySelection | null {
  // Robots first (by drawn position), so a robot on a station wins.
  for (let i = snapshot.robots.length - 1; i >= 0; i -= 1) {
    const robot = snapshot.robots[i];
    const p = interpolated(robot, progress);
    const cx = view.offsetX + (p.x + 0.5) * view.cell;
    const cy = view.offsetY + (p.y + 0.5) * view.cell;
    const r = Math.max(view.cell * 0.48, 8);
    if (Math.abs(sx - cx) <= r && Math.abs(sy - cy) <= r) return { kind: "robot", id: robot.id };
  }
  const cell = screenToCell(view, sx, sy);
  const { layout } = snapshot;
  if (cell.x < 0 || cell.y < 0 || cell.x >= layout.width || cell.y >= layout.height) return null;
  const station = layout.stations.find((s) => s.position.x === cell.x && s.position.y === cell.y);
  if (station) return { kind: "station", id: station.id };
  return { kind: "cell", x: cell.x, y: cell.y };
}

export function drawWarehouse(
  ctx: CanvasRenderingContext2D,
  snapshot: SimulationSnapshot,
  view: RenderView,
  theme: CanvasTheme,
  options: RenderOptions,
): void {
  const { layout } = snapshot;
  const { cell, offsetX: ox, offsetY: oy } = view;
  const gridW = layout.width * cell;
  const gridH = layout.height * cell;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, view.width, view.height);

  // Floor plate with a soft outer frame.
  ctx.fillStyle = theme.floor;
  ctx.fillRect(ox, oy, gridW, gridH);
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(ox) - 0.5, Math.round(oy) - 0.5, Math.round(gridW) + 1, Math.round(gridH) + 1);

  // Cells
  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      const kind = layout.cells[y * layout.width + x];
      drawCell(ctx, theme, kind, ox + x * cell, oy + y * cell, cell, layout, x, y);
    }
  }

  if (options.showGrid) drawGrid(ctx, theme, view, layout.width, layout.height);
  for (const closure of snapshot.closures) {
    for (const c of closure.cells) drawClosedCell(ctx, theme, ox + c.x * cell, oy + c.y * cell, cell);
  }

  // Stations
  for (const station of layout.stations) {
    const sx = ox + station.position.x * cell;
    const sy = oy + station.position.y * cell;
    const color =
      station.kind === "pickup" ? theme.cyan : station.kind === "dropoff" ? theme.lime : theme.textSecondary;
    const inset = Math.max(2, cell * 0.1);
    ctx.fillStyle = withAlpha(color, 0.1);
    ctx.fillRect(sx + inset, sy + inset, cell - inset * 2, cell - inset * 2);
    ctx.strokeStyle = withAlpha(color, 0.7);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + inset + 0.5, sy + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
    if (cell >= 22) {
      ctx.fillStyle = withAlpha(color, 0.85);
      ctx.font = `600 ${Math.round(Math.min(10, cell * 0.28))}px ${theme.monoFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(station.id.replace("-0", "").replace("-", ""), sx + cell / 2, sy + cell / 2);
    }
  }

  // Selected station / cell highlight
  const sel = options.selection;
  if (sel && sel.kind !== "robot") {
    const point =
      sel.kind === "cell"
        ? { x: sel.x, y: sel.y }
        : layout.stations.find((s) => s.id === sel.id)?.position;
    if (point) drawBrackets(ctx, theme.lime, ox + point.x * cell, oy + point.y * cell, cell);
  }

  if (options.showRoutes) {
    for (const robot of snapshot.robots) {
      drawRoute(ctx, theme, view, robot, options, sel?.kind === "robot" && sel.id === robot.id);
    }
  }

  // Hover outline
  if (options.hover) {
    const h = options.hover;
    if (h.x >= 0 && h.y >= 0 && h.x < layout.width && h.y < layout.height) {
      ctx.strokeStyle = withAlpha(theme.text, 0.35);
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + h.x * cell + 0.5, oy + h.y * cell + 0.5, cell - 1, cell - 1);
    }
  }

  // Robots: non-selected first so the selected one draws on top.
  const ordered = [...snapshot.robots].sort(
    (a, b) =>
      Number(sel?.kind === "robot" && sel.id === a.id) - Number(sel?.kind === "robot" && sel.id === b.id),
  );
  for (const robot of ordered) {
    drawRobot(ctx, theme, view, robot, options, sel?.kind === "robot" && sel.id === robot.id);
  }

  if (options.showCoordinates) drawRulers(ctx, theme, view, layout.width, layout.height);
}

// ----------------------------------------------------------------- cells

function drawCell(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  kind: CellKind,
  x: number,
  y: number,
  cell: number,
  layout: SimulationSnapshot["layout"],
  cx: number,
  cy: number,
) {
  switch (kind) {
    case "lane":
    case "pickup":
    case "dropoff":
    case "charger": {
      ctx.fillStyle = theme.lane;
      ctx.fillRect(x, y, cell, cell);
      break;
    }
    case "narrow": {
      ctx.fillStyle = theme.lane;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = theme.narrow;
      ctx.fillRect(x, y, cell, cell);
      // Hazard edge lines along the passage walls.
      ctx.strokeStyle = withAlpha(theme.amber, 0.55);
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + cell, y + 1);
      ctx.moveTo(x, y + cell - 1);
      ctx.lineTo(x + cell, y + cell - 1);
      ctx.stroke();
      break;
    }
    case "rack": {
      const pad = Math.max(1, cell * 0.06);
      ctx.fillStyle = theme.rack;
      ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      ctx.strokeStyle = theme.rackEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, cell - pad * 2 - 1, cell - pad * 2 - 1);
      if (cell >= 14) {
        // Pallet slot divider — orientation follows the rack run.
        const horizontalRun =
          layout.cells[cy * layout.width + cx - 1] === "rack" ||
          layout.cells[cy * layout.width + cx + 1] === "rack";
        ctx.strokeStyle = withAlpha(theme.rackEdge, 0.6);
        ctx.beginPath();
        if (horizontalRun) {
          ctx.moveTo(x + pad, y + cell / 2);
          ctx.lineTo(x + cell - pad, y + cell / 2);
        } else {
          ctx.moveTo(x + cell / 2, y + pad);
          ctx.lineTo(x + cell / 2, y + cell - pad);
        }
        ctx.stroke();
      }
      break;
    }
    case "obstacle": {
      const pad = Math.max(1, cell * 0.12);
      ctx.fillStyle = theme.obstacle;
      ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      ctx.strokeStyle = withAlpha(theme.red, 0.45);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, cell - pad * 2 - 1, cell - pad * 2 - 1);
      ctx.beginPath();
      ctx.moveTo(x + pad * 1.8, y + pad * 1.8);
      ctx.lineTo(x + cell - pad * 1.8, y + cell - pad * 1.8);
      ctx.moveTo(x + cell - pad * 1.8, y + pad * 1.8);
      ctx.lineTo(x + pad * 1.8, y + cell - pad * 1.8);
      ctx.stroke();
      break;
    }
    case "floor":
      break;
  }
}

/** Dynamic aisle closure: red hatch + border, drawn above the floor. */
function drawClosedCell(ctx: CanvasRenderingContext2D, theme: CanvasTheme, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.fillStyle = withAlpha(theme.red, 0.12);
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = withAlpha(theme.red, 0.55);
  ctx.lineWidth = Math.max(1, size * 0.06);
  const step = Math.max(4, size / 3);
  ctx.beginPath();
  for (let d = -size; d < size * 2; d += step) {
    ctx.moveTo(x + d, y + size);
    ctx.lineTo(x + d + size, y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = withAlpha(theme.red, 0.85);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  view: RenderView,
  width: number,
  height: number,
) {
  const { cell, offsetX: ox, offsetY: oy } = view;
  if (cell < 6) return;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 1) {
    ctx.strokeStyle = x % 5 === 0 ? theme.lineStrong : theme.grid;
    const px = Math.round(ox + x * cell) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, oy);
    ctx.lineTo(px, oy + height * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 1) {
    ctx.strokeStyle = y % 5 === 0 ? theme.lineStrong : theme.grid;
    const py = Math.round(oy + y * cell) + 0.5;
    ctx.beginPath();
    ctx.moveTo(ox, py);
    ctx.lineTo(ox + width * cell, py);
    ctx.stroke();
  }
}

function drawBrackets(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, size: number) {
  const len = Math.max(4, size * 0.28);
  const o = 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // top-left
  ctx.moveTo(x - o, y - o + len);
  ctx.lineTo(x - o, y - o);
  ctx.lineTo(x - o + len, y - o);
  // top-right
  ctx.moveTo(x + size + o - len, y - o);
  ctx.lineTo(x + size + o, y - o);
  ctx.lineTo(x + size + o, y - o + len);
  // bottom-right
  ctx.moveTo(x + size + o, y + size + o - len);
  ctx.lineTo(x + size + o, y + size + o);
  ctx.lineTo(x + size + o - len, y + size + o);
  // bottom-left
  ctx.moveTo(x - o + len, y + size + o);
  ctx.lineTo(x - o, y + size + o);
  ctx.lineTo(x - o, y + size + o - len);
  ctx.stroke();
}

// ---------------------------------------------------------------- routes

function drawRoute(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  view: RenderView,
  robot: RobotState,
  options: RenderOptions,
  selected: boolean,
) {
  if (robot.route.length === 0) return;
  const { cell, offsetX: ox, offsetY: oy } = view;
  const color = robotColor(theme, robot.colorIndex);
  const start = interpolated(robot, options.progress);
  const centre = (p: { x: number; y: number }) => [ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell] as const;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(color, selected ? 0.9 : 0.32);
  ctx.lineWidth = selected ? Math.max(2, cell * 0.08) : Math.max(1, cell * 0.05);
  ctx.setLineDash(selected ? [] : [Math.max(2, cell * 0.15), Math.max(3, cell * 0.18)]);
  ctx.beginPath();
  const [sx, sy] = centre(start);
  ctx.moveTo(sx, sy);
  for (const p of robot.route) {
    const [px, py] = centre(p);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Next-step and destination markers.
  const [nx, ny] = centre(robot.route[0]);
  ctx.fillStyle = withAlpha(color, selected ? 1 : 0.6);
  ctx.beginPath();
  ctx.arc(nx, ny, Math.max(1.5, cell * 0.07), 0, Math.PI * 2);
  ctx.fill();

  const end = robot.route[robot.route.length - 1];
  const [ex, ey] = centre(end);
  ctx.strokeStyle = withAlpha(selected ? theme.lime : color, selected ? 1 : 0.55);
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(3, cell * 0.26), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- robots

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawRobot(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  view: RenderView,
  robot: RobotState,
  options: RenderOptions,
  selected: boolean,
) {
  const { cell, offsetX: ox, offsetY: oy } = view;
  const p = interpolated(robot, options.progress);
  const cx = ox + (p.x + 0.5) * cell;
  const cy = oy + (p.y + 0.5) * cell;
  const size = Math.max(8, cell * 0.72);
  const half = size / 2;
  const color = robotColor(theme, robot.colorIndex);
  const faulted = robot.status === "failed";

  ctx.save();

  // Status halo for states that need attention.
  if (robot.status === "waiting" || faulted) {
    ctx.strokeStyle = withAlpha(faulted ? theme.red : theme.amber, 0.9);
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.setLineDash(faulted ? [] : [Math.max(2, cell * 0.1), Math.max(2, cell * 0.08)]);
    roundedRect(ctx, cx - half - 3, cy - half - 3, size + 6, size + 6, size * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Body
  ctx.fillStyle = faulted ? withAlpha(color, 0.35) : color;
  roundedRect(ctx, cx - half, cy - half, size, size, size * 0.22);
  ctx.fill();
  ctx.fillStyle = withAlpha(theme.bg, 0.55);
  roundedRect(ctx, cx - half * 0.62, cy - half * 0.62, size * 0.62, size * 0.62, size * 0.12);
  ctx.fill();

  // Heading wedge
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(HEADING_ANGLE[robot.heading]);
  ctx.fillStyle = faulted ? withAlpha(theme.text, 0.4) : theme.text;
  ctx.beginPath();
  ctx.moveTo(half * 0.5, 0);
  ctx.lineTo(-half * 0.12, -half * 0.32);
  ctx.lineTo(-half * 0.12, half * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Package indicator
  if (robot.packageId) {
    const ps = Math.max(3, size * 0.24);
    ctx.fillStyle = theme.amber;
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = 1;
    roundedRect(ctx, cx + half - ps * 0.75, cy - half - ps * 0.25, ps, ps, 1.5);
    ctx.fill();
    ctx.stroke();
  }

  if (selected) drawBrackets(ctx, theme.lime, cx - half - 3, cy - half - 3, size + 6);

  if (options.showLabels && cell >= 16) {
    const fontSize = Math.round(Math.min(11, Math.max(8, cell * 0.3)));
    ctx.font = `600 ${fontSize}px ${theme.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const label = robot.id;
    const tw = ctx.measureText(label).width;
    const ly = cy + half + 4;
    ctx.fillStyle = withAlpha(theme.bg, 0.82);
    roundedRect(ctx, cx - tw / 2 - 3, ly - 1, tw + 6, fontSize + 3, 2);
    ctx.fill();
    ctx.fillStyle = selected ? theme.lime : faulted ? theme.red : theme.text;
    ctx.fillText(label, cx, ly);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- rulers

function drawRulers(
  ctx: CanvasRenderingContext2D,
  theme: CanvasTheme,
  view: RenderView,
  width: number,
  height: number,
) {
  const { cell, offsetX: ox, offsetY: oy } = view;
  ctx.save();
  ctx.fillStyle = withAlpha(theme.bg, 0.94);
  ctx.fillRect(0, 0, view.width, RULER_TOP);
  ctx.fillRect(0, 0, RULER_LEFT, view.height);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_TOP - 0.5);
  ctx.lineTo(view.width, RULER_TOP - 0.5);
  ctx.moveTo(RULER_LEFT - 0.5, 0);
  ctx.lineTo(RULER_LEFT - 0.5, view.height);
  ctx.stroke();

  ctx.font = `500 9.5px ${theme.monoFont}`;
  ctx.fillStyle = theme.textDim;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const every = cell >= 18 ? 1 : cell >= 9 ? 2 : 5;

  for (let x = 0; x < width; x += every) {
    const px = ox + (x + 0.5) * cell;
    if (px < RULER_LEFT + 4 || px > view.width - 4) continue;
    ctx.fillText(columnLabel(x), px, RULER_TOP / 2);
  }
  for (let y = 0; y < height; y += every) {
    const py = oy + (y + 0.5) * cell;
    if (py < RULER_TOP + 4 || py > view.height - 4) continue;
    ctx.fillText(String(y + 1), RULER_LEFT / 2, py);
  }
  ctx.restore();
}
