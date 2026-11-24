"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Line2, LineSegments2 } from "three-stdlib";
import type { EntitySelection, GridPoint, WarehouseLayout } from "@/types/simulation";
import { connectedBlock, selectionForCell, selectionKey, type Bounds } from "@/lib/inspection";
import { CELL, frameOf, gridToWorld, type GridFrame } from "@/lib/scene3d/grid-to-world";
import { useSimulationStore } from "@/store/simulation-store";
import { selectionSource } from "./camera-store";
import { useHover3D } from "./hover-store";

/**
 * Inspection layer of the 3D view: invisible pick volumes for rack bays and
 * obstacles, and the selection / hover highlights. Selection writes only the
 * UI selection in the store; nothing here touches the engine.
 */

const OBSTACLE_HEIGHT = 2.6;
const LIME = "#b7f34a";

/** Select whatever a grid cell means (station, rack block, obstacle, or the cell) from a 3D pick. */
export function selectCell(layout: WarehouseLayout, cell: GridPoint) {
  selectionSource.fromCanvas = true;
  useSimulationStore.getState().select(selectionForCell(layout, cell));
}

const unitBox = typeof window === "undefined" ? null : new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

/**
 * One invisible instanced box per rack / obstacle cell, as tall as the
 * rendered racking. The visible rack geometry (thousands of instances across
 * six meshes) is never raycast; these boxes are.
 */
export function BlockPickers({ layout, rackHeight }: { layout: WarehouseLayout; rackHeight: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: { x: number; y: number; obstacle: boolean }[] = [];
    layout.cells.forEach((k, i) => {
      if (k === "rack" || k === "obstacle") out.push({ x: i % layout.width, y: Math.floor(i / layout.width), obstacle: k === "obstacle" });
    });
    return out;
  }, [layout]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const frame = frameOf(layout);
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      const w = gridToWorld(frame, c.x, c.y);
      m.makeScale(CELL, c.obstacle ? OBSTACLE_HEIGHT : rackHeight, CELL).setPosition(w.x, 0, w.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [cells, layout, rackHeight]);

  if (cells.length === 0 || !unitBox) return null;
  const cellOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? null : cells[e.instanceId]);
  return (
    <instancedMesh
      ref={ref}
      args={[unitBox, undefined, cells.length]}
      visible={false}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        const c = cellOf(e);
        if (c) selectCell(layout, c);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const c = cellOf(e);
        useHover3D.getState().setTarget(c ? selectionForCell(layout, c) : null);
      }}
      onPointerOut={() => {
        const t = useHover3D.getState().target;
        if (t?.kind === "rack" || t?.kind === "obstacle") useHover3D.getState().setTarget(null);
      }}
    />
  );
}

// ---------------------------------------------------------------- outlines

type Vec = [number, number, number];

/** World-space corners of a grid rectangle. */
function worldRect(frame: GridFrame, b: Bounds, pad = 0.04) {
  const a = gridToWorld(frame, b.x0, b.y0);
  const c = gridToWorld(frame, b.x1, b.y1);
  return { x0: a.x - CELL / 2 - pad, z0: a.z - CELL / 2 - pad, x1: c.x + CELL / 2 + pad, z1: c.z + CELL / 2 + pad };
}

/** 12 box edges as line-segment point pairs. */
export function boxEdges(r: { x0: number; z0: number; x1: number; z1: number }, y0: number, y1: number): Vec[] {
  const p = (x: number, y: number, z: number): Vec => [x, y, z];
  const out: Vec[] = [];
  for (const y of [y0, y1]) {
    out.push(p(r.x0, y, r.z0), p(r.x1, y, r.z0), p(r.x1, y, r.z0), p(r.x1, y, r.z1), p(r.x1, y, r.z1), p(r.x0, y, r.z1), p(r.x0, y, r.z1), p(r.x0, y, r.z0));
  }
  for (const [x, z] of [
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x1, r.z1],
    [r.x0, r.z1],
  ]) out.push(p(x, y0, z), p(x, y1, z));
  return out;
}

/** Corner brackets on the floor around a rectangle (8 segments). */
export function floorBrackets(r: { x0: number; z0: number; x1: number; z1: number }, y: number): Vec[] {
  const len = Math.min(0.3, (r.x1 - r.x0) * 0.3, (r.z1 - r.z0) * 0.3);
  const out: Vec[] = [];
  for (const [cx, cz, sx, sz] of [
    [r.x0, r.z0, 1, 1],
    [r.x1, r.z0, -1, 1],
    [r.x1, r.z1, -1, -1],
    [r.x0, r.z1, 1, -1],
  ]) {
    out.push([cx, y, cz], [cx + sx * len, y, cz], [cx, y, cz], [cx, y, cz + sz * len]);
  }
  return out;
}

/** Outline geometry for a selection, or null for robots (they have their own ring). */
export function outlineFor(layout: WarehouseLayout, sel: EntitySelection | null, rackHeight: number): { points: Vec[]; fill: { x: number; z: number; w: number; d: number } | null } | null {
  if (!sel || sel.kind === "robot") return null;
  const frame = frameOf(layout);
  let bounds: Bounds;
  if (sel.kind === "station") {
    const s = layout.stations.find((x) => x.id === sel.id);
    if (!s) return null;
    bounds = { x0: s.position.x, y0: s.position.y, x1: s.position.x, y1: s.position.y };
  } else if (sel.kind === "rack" || sel.kind === "obstacle") {
    const block = connectedBlock(layout, sel, sel.kind);
    if (block.cells.length === 0) return null;
    bounds = block.bounds;
  } else {
    bounds = { x0: sel.x, y0: sel.y, x1: sel.x, y1: sel.y };
  }
  const r = worldRect(frame, bounds);
  const fill = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 };
  if (sel.kind === "rack" || sel.kind === "obstacle") {
    const h = (sel.kind === "obstacle" ? OBSTACLE_HEIGHT : rackHeight) + 0.06;
    return { points: boxEdges(r, 0.02, h), fill };
  }
  return { points: floorBrackets(r, 0.045), fill };
}

/** The selected rack block / obstacle / station / cell: lime outline plus a soft footprint. */
export function SelectionHighlight({ layout, rackHeight }: { layout: WarehouseLayout; rackHeight: number }) {
  const selection = useSimulationStore((s) => s.selection);
  const outline = useMemo(() => outlineFor(layout, selection, rackHeight), [layout, selection, rackHeight]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [outline, invalidate]);
  if (!outline) return null;
  return (
    <group key={selectionKey(selection)}>
      <Line points={outline.points} segments color={LIME} lineWidth={2.4} toneMapped={false} depthTest={false} renderOrder={8} transparent opacity={0.95} />
      {outline.fill ? (
        <mesh position={[outline.fill.x, 0.028, outline.fill.z]} rotation-x={-Math.PI / 2} renderOrder={3}>
          <planeGeometry args={[outline.fill.w, outline.fill.d]} />
          <meshBasicMaterial color={LIME} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * Hover outline, updated imperatively from the hover store (no React render
 * per pointer move). Robots are not outlined; their eyes brighten instead.
 */
export function HoverHighlight({ layout, rackHeight }: { layout: WarehouseLayout; rackHeight: number }) {
  const ref = useRef<Line2 | LineSegments2>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const apply = () => {
      const line = ref.current;
      if (!line) return;
      const { target } = useHover3D.getState();
      const selected = useSimulationStore.getState().selection;
      const outline = target && selectionKey(target) !== selectionKey(selected) ? outlineFor(layout, target, rackHeight) : null;
      line.visible = outline !== null;
      if (outline) {
        line.geometry.setPositions(outline.points.flat());
        line.computeLineDistances();
      }
      invalidate();
    };
    apply();
    const unsubs = [useHover3D.subscribe(apply), useSimulationStore.subscribe((s, prev) => s.selection !== prev.selection && apply())];
    return () => unsubs.forEach((u) => u());
  }, [layout, rackHeight, invalidate]);
  return (
    <Line
      ref={ref}
      points={[
        [0, 0, 0],
        [0, 0, 0],
      ]}
      segments
      color="#e6eef2"
      lineWidth={1.4}
      transparent
      opacity={0.7}
      depthTest={false}
      renderOrder={7}
      visible={false}
    />
  );
}
