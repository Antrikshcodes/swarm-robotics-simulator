"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { CellKind, GridPoint, WarehouseLayout } from "@/types/simulation";
import { CELL, frameOf, worldToGrid } from "@/lib/scene3d/grid-to-world";

/** Texture pixels per grid cell; reduced for very large layouts so the texture stays ≤ 4096 px. */
const MAX_PX = 48;
const MAX_TEXTURE = 4096;
export const floorTexelsPerCell = (width: number, height: number) => Math.max(12, Math.min(MAX_PX, Math.floor(MAX_TEXTURE / Math.max(width, height))));

/**
 * Industrial concrete floor painted from the engine layout: lane safety
 * lines, amber hatching on narrow passages, station pads and (optionally)
 * the grid. One texture, one draw call.
 */
function paintFloor(layout: WarehouseLayout, showGrid: boolean): HTMLCanvasElement {
  const { width, height } = layout;
  const PX = floorTexelsPerCell(width, height);
  const sc = PX / MAX_PX; // scale for line widths and insets
  const canvas = document.createElement("canvas");
  canvas.width = width * PX;
  canvas.height = height * PX;
  const ctx = canvas.getContext("2d")!;
  const kind = (x: number, y: number): CellKind | null => (x < 0 || y < 0 || x >= width || y >= height ? null : layout.cells[y * width + x]);

  // Concrete base with deterministic speckle.
  ctx.fillStyle = "#3a4247";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < width * height * 40 * sc * sc; i += 1) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.02 + rand() * 0.03})` : `rgba(0,0,0,${0.04 + rand() * 0.05})`;
    ctx.fillRect(rand() * canvas.width, rand() * canvas.height, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Broad tonal variation between pours, and saw-cut control joints every four cells.
  for (let py = 0; py < height; py += 4) {
    for (let px = 0; px < width; px += 4) {
      ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${0.012 + rand() * 0.018})` : `rgba(0,0,0,${0.02 + rand() * 0.03})`;
      ctx.fillRect(px * PX, py * PX, 4 * PX, 4 * PX);
    }
  }
  ctx.strokeStyle = "rgba(8,11,13,0.35)";
  ctx.lineWidth = Math.max(1, 1.5 * sc);
  ctx.beginPath();
  for (let x = 4; x < width; x += 4) {
    ctx.moveTo(x * PX, 0);
    ctx.lineTo(x * PX, canvas.height);
  }
  for (let y = 4; y < height; y += 4) {
    ctx.moveTo(0, y * PX);
    ctx.lineTo(canvas.width, y * PX);
  }
  ctx.stroke();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = kind(x, y);
      const px = x * PX;
      const py = y * PX;
      if (k === "rack" || k === "obstacle") {
        ctx.fillStyle = "rgba(10,14,16,0.45)"; // footprint shadow under racks
        ctx.fillRect(px, py, PX, PX);
      } else if (k === "lane") {
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(px, py, PX, PX);
      } else if (k === "narrow") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, PX, PX);
        ctx.clip();
        ctx.fillStyle = "rgba(245,185,66,0.08)";
        ctx.fillRect(px, py, PX, PX);
        ctx.strokeStyle = "rgba(245,185,66,0.28)";
        ctx.lineWidth = 3 * sc;
        for (let d = -PX; d < PX * 2; d += 12 * sc) {
          ctx.beginPath();
          ctx.moveTo(px + d, py + PX);
          ctx.lineTo(px + d + PX, py);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // Yellow safety lines along every edge between an open cell and racking.
  ctx.strokeStyle = "rgba(232,196,92,0.55)";
  ctx.lineWidth = 3 * sc;
  const solid = (k: CellKind | null) => k === "rack" || k === "obstacle";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(kind(x, y))) continue;
      const px = x * PX;
      const py = y * PX;
      const inset = 4 * sc;
      ctx.beginPath();
      if (solid(kind(x, y - 1))) {
        ctx.moveTo(px, py + inset);
        ctx.lineTo(px + PX, py + inset);
      }
      if (solid(kind(x, y + 1))) {
        ctx.moveTo(px, py + PX - inset);
        ctx.lineTo(px + PX, py + PX - inset);
      }
      if (solid(kind(x - 1, y))) {
        ctx.moveTo(px + inset, py);
        ctx.lineTo(px + inset, py + PX);
      }
      if (solid(kind(x + 1, y))) {
        ctx.moveTo(px + PX - inset, py);
        ctx.lineTo(px + PX - inset, py + PX);
      }
      ctx.stroke();
    }
  }

  // Station pads.
  for (const s of layout.stations) {
    const px = s.position.x * PX;
    const py = s.position.y * PX;
    const color = s.kind === "pickup" ? "64,200,232" : s.kind === "dropoff" ? "183,243,74" : "200,210,216";
    ctx.fillStyle = `rgba(${color},0.16)`;
    const k = sc;
    ctx.fillRect(px + 4 * k, py + 4 * k, PX - 8 * k, PX - 8 * k);
    ctx.strokeStyle = `rgba(${color},0.85)`;
    ctx.lineWidth = 2.5 * k;
    ctx.strokeRect(px + 5 * k, py + 5 * k, PX - 10 * k, PX - 10 * k);
    // Corner ticks
    ctx.lineWidth = 4 * k;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const ox = px + 5 * k + cx * (PX - 10 * k);
      const oy = py + 5 * k + cy * (PX - 10 * k);
      ctx.beginPath();
      ctx.moveTo(ox + (cx ? -10 : 10) * k, oy);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox, oy + (cy ? -10 : 10) * k);
      ctx.stroke();
    }
  }

  if (showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 1) {
      ctx.moveTo(x * PX + 0.5, 0);
      ctx.lineTo(x * PX + 0.5, canvas.height);
    }
    for (let y = 0; y <= height; y += 1) {
      ctx.moveTo(0, y * PX + 0.5);
      ctx.lineTo(canvas.width, y * PX + 0.5);
    }
    ctx.stroke();
  }
  return canvas;
}

export function WarehouseFloor({
  layout,
  showGrid,
  onSelectCell,
  onHoverCell,
}: {
  layout: WarehouseLayout;
  showGrid: boolean;
  onSelectCell: (cell: GridPoint) => void;
  onHoverCell: (cell: GridPoint | null) => void;
}) {
  const frame = frameOf(layout);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(paintFloor(layout, showGrid));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [layout, showGrid]);
  useEffect(() => () => texture.dispose(), [texture]);

  const cellAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => worldToGrid(frame, e.point.x, e.point.z);

  return (
    <group>
      {/* Warehouse slab */}
      <mesh
        rotation-x={-Math.PI / 2}
        receiveShadow
        onClick={(e) => {
          if (e.delta > 4) return; // a drag (orbit), not a click
          e.stopPropagation();
          const cell = cellAt(e);
          if (cell) onSelectCell(cell);
        }}
        onPointerMove={(e) => onHoverCell(cellAt(e))}
        onPointerOut={() => onHoverCell(null)}
      >
        <planeGeometry args={[layout.width * CELL, layout.height * CELL]} />
        <meshStandardMaterial map={texture} roughness={0.88} metalness={0.05} />
      </mesh>
      {/* Surrounding hall floor and a low perimeter curb */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[layout.width * CELL + 24, layout.height * CELL + 24]} />
        <meshStandardMaterial color="#20262a" roughness={0.95} />
      </mesh>
      <Curb width={layout.width * CELL} depth={layout.height * CELL} />
    </group>
  );
}

function Curb({ width, depth }: { width: number; depth: number }) {
  const h = 0.12;
  const t = 0.1;
  return (
    <group>
      {[
        [0, -depth / 2 - t / 2, width + t * 2, t],
        [0, depth / 2 + t / 2, width + t * 2, t],
        [-width / 2 - t / 2, 0, t, depth],
        [width / 2 + t / 2, 0, t, depth],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, h / 2, z]} receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#5b656b" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
