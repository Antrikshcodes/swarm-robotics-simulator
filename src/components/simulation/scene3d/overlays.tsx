"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Line2 } from "three-stdlib";
import type { GridPoint, SimulationSnapshot, Station } from "@/types/simulation";
import { frameOf, gridToWorld, type GridFrame } from "@/lib/scene3d/grid-to-world";
import { stationColorForKind } from "@/lib/scene3d/projection";
import { robotPoses } from "./robot-fleet";

/**
 * Engine-state overlays for the 3D view. Everything here is drawn from the
 * snapshot — planned routes, reservations, holds, the wait-for graph,
 * deadlock incidents, recovery tasks and closures. Nothing is invented: if
 * the engine has not reported it, it is not shown.
 */

const ROUTE_Y = 0.03;

const toVec = (frame: GridFrame, p: GridPoint, y: number): [number, number, number] => {
  const w = gridToWorld(frame, p.x, p.y, y);
  return [w.x, w.y, w.z];
};

// ------------------------------------------------------------------ stations

export function Stations({ stations, frame }: { stations: readonly Station[]; frame: GridFrame }) {
  return (
    <group>
      {stations.map((s) => {
        const w = gridToWorld(frame, s.position.x, s.position.y);
        const color = stationColorForKind(s.kind);
        return (
          <group key={s.id} position={[w.x, 0, w.z]}>
            {/* Marker post in the pad corner (robots dock on the pad itself). */}
            <mesh position={[-0.42, 0.55, -0.42]} castShadow>
              <boxGeometry args={[0.06, 1.1, 0.06]} />
              <meshStandardMaterial color="#59646a" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[-0.42, 1.12, -0.42]}>
              <boxGeometry args={[0.1, 0.06, 0.1]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {s.kind === "charger" ? (
              <mesh position={[0, 0.2, -0.44]} castShadow>
                <boxGeometry args={[0.5, 0.4, 0.08]} />
                <meshStandardMaterial color="#2c3438" metalness={0.5} roughness={0.5} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ closures

export function Closures({ snapshot }: { snapshot: SimulationSnapshot }) {
  const frame = frameOf(snapshot.layout);
  return (
    <group>
      {snapshot.closures.flatMap((c) =>
        c.cells.map((cell) => {
          const w = gridToWorld(frame, cell.x, cell.y);
          return (
            <group key={`${c.id}:${cell.x},${cell.y}`} position={[w.x, 0, w.z]}>
              <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
                <planeGeometry args={[0.96, 0.96]} />
                <meshBasicMaterial color="#f06464" transparent opacity={0.22} depthWrite={false} />
              </mesh>
              {/* Barricade: two posts and a striped bar */}
              {[-0.34, 0.34].map((x) => (
                <mesh key={x} position={[x, 0.3, 0]}>
                  <cylinderGeometry args={[0.03, 0.04, 0.6, 10]} />
                  <meshStandardMaterial color="#d9dde0" roughness={0.6} />
                </mesh>
              ))}
              <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[0.78, 0.1, 0.04]} />
                <meshStandardMaterial color="#e0574f" emissive="#e0574f" emissiveIntensity={0.25} roughness={0.5} />
              </mesh>
            </group>
          );
        }),
      )}
    </group>
  );
}

// -------------------------------------------------------------------- routes

/** Planned routes from the engine (robot.route), one line per robot; the selected robot's is brighter. */
export function Routes({ snapshot, palette, selectedId }: { snapshot: SimulationSnapshot; palette: readonly string[]; selectedId: string | null }) {
  const frame = frameOf(snapshot.layout);
  return (
    <group>
      {snapshot.robots.map((r) => {
        if (r.route.length === 0 || r.status === "failed") return null;
        const points = [toVec(frame, r.position, ROUTE_Y), ...r.route.map((p) => toVec(frame, p, ROUTE_Y))];
        const selected = r.id === selectedId;
        const color = selected ? "#b7f34a" : palette[(r.colorIndex - 1 + palette.length) % palette.length];
        return <RouteLine key={r.id} points={points} color={color} selected={selected} />;
      })}
    </group>
  );
}

function RouteLine({ points, color, selected }: { points: [number, number, number][]; color: string; selected: boolean }) {
  const ref = useRef<Line2>(null);
  // Dashes flow towards the destination: a directional cue without extra geometry.
  useFrame((_, delta) => {
    const mat = ref.current?.material as (THREE.Material & { dashOffset: number }) | undefined;
    if (mat) mat.dashOffset -= delta * 0.6;
  });
  const end = points[points.length - 1];
  return (
    <group>
      <Line ref={ref} points={points} color={color} lineWidth={selected ? 3.2 : 2} dashed dashSize={0.32} gapSize={0.16} transparent opacity={selected ? 1 : 0.75} depthWrite={false} />
      <mesh position={[end[0], ROUTE_Y + 0.002, end[2]]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.2, 0.26, 32]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 1 : 0.7} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------- reservations

const MAX_RESERVATIONS = 1200;
const tile = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
const holdTile = new THREE.RingGeometry(0.3, 0.36, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);

/** Future reserved cells (fading with time) and end-of-plan holds, as instanced floor tiles. */
export function Reservations({ snapshot, palette, selectedId }: { snapshot: SimulationSnapshot; palette: readonly string[]; selectedId: string | null }) {
  const cells = useRef<THREE.InstancedMesh>(null);
  const holds = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => palette.map((c) => new THREE.Color(c)), [palette]);
  const floor = useMemo(() => new THREE.Color("#3a4247"), []);

  useLayoutEffect(() => {
    const frame = frameOf(snapshot.layout);
    const colorOf = new Map(snapshot.robots.map((r) => [r.id, colors[(r.colorIndex - 1 + colors.length) % colors.length]]));
    const here = new Map(snapshot.robots.map((r) => [r.id, r.position]));
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const horizon = Math.max(1, snapshot.coordination.horizon);
    const mesh = cells.current;
    if (mesh) {
      let n = 0;
      for (const r of snapshot.coordination.reservations) {
        const dt = r.tick - snapshot.tick;
        if (dt < 1 || n >= MAX_RESERVATIONS) continue;
        const pos = here.get(r.robotId);
        if (pos && pos.x === r.x && pos.y === r.y) continue;
        if (selectedId && r.robotId !== selectedId) continue;
        const w = gridToWorld(frame, r.x, r.y, 0.022);
        mesh.setMatrixAt(n, m.makeTranslation(w.x, w.y, w.z));
        // "Fade" by blending towards the floor colour: nearer ticks are stronger.
        const strength = Math.max(0.15, 0.75 * (1 - (dt - 1) / horizon));
        mesh.setColorAt(n, c.copy(floor).lerp(colorOf.get(r.robotId) ?? floor, strength));
        n += 1;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const hm = holds.current;
    if (hm) {
      let n = 0;
      for (const h of snapshot.coordination.holds) {
        const pos = here.get(h.robotId);
        if (pos && pos.x === h.x && pos.y === h.y) continue;
        if (selectedId && h.robotId !== selectedId) continue;
        const w = gridToWorld(frame, h.x, h.y, 0.024);
        hm.setMatrixAt(n, m.makeTranslation(w.x, w.y, w.z));
        hm.setColorAt(n, colorOf.get(h.robotId) ?? floor);
        n += 1;
      }
      hm.count = n;
      hm.instanceMatrix.needsUpdate = true;
      if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
    }
  }, [snapshot, colors, floor, selectedId]);

  return (
    <group>
      <instancedMesh ref={cells} args={[tile, undefined, MAX_RESERVATIONS]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={holds} args={[holdTile, undefined, 64]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ----------------------------------------------------------------- incidents

/**
 * Coordination and incident state from the engine: who waits for whom,
 * deadlock groups and their blocking cells, and package-recovery rescues.
 */
export function Incidents({ snapshot, showWaitLinks }: { snapshot: SimulationSnapshot; showWaitLinks: boolean }) {
  const frame = frameOf(snapshot.layout);
  const robots = new Map(snapshot.robots.map((r) => [r.id, r]));
  const openDeadlocks = snapshot.deadlocks.incidents.filter((i) => i.status !== "resolved");
  const rescues = snapshot.recovery.tasks.filter((t) => (t.status === "en-route" || t.status === "handover") && t.rescuerId);

  return (
    <group>
      {/* Deadlock blocking cells */}
      {openDeadlocks.flatMap((inc) =>
        inc.blockingCells.map((c) => {
          const w = gridToWorld(frame, c.x, c.y, 0.026);
          return (
            <mesh key={`${inc.id}:${c.x},${c.y}`} position={[w.x, w.y, w.z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshBasicMaterial color="#f06464" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
            </mesh>
          );
        }),
      )}
      {/* Deadlock recovery: holding cell of the active attempt */}
      {openDeadlocks.map((inc) => {
        const a = inc.attempts.at(-1);
        if (inc.status !== "recovering" || !a || a.outcome !== "in-progress" || !a.holdingCell) return null;
        const w = gridToWorld(frame, a.holdingCell.x, a.holdingCell.y, 0.028);
        return (
          <mesh key={`${inc.id}:hold`} position={[w.x, w.y, w.z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.32, 0.42, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color="#40c8e8" toneMapped={false} />
          </mesh>
        );
      })}
      {/* Wait-for links: amber, red inside a deadlock group */}
      {showWaitLinks
        ? snapshot.coordination.waitGraph.map((e) => {
            const a = robots.get(e.robotId);
            const b = robots.get(e.waitingFor);
            if (!a || !b) return null;
            const critical = a.deadlockId !== null && a.deadlockId === b.deadlockId;
            return <LiveLink key={`${e.robotId}>${e.waitingFor}`} from={e.robotId} to={e.waitingFor} color={critical ? "#f06464" : "#f5b942"} />;
          })
        : null}
      {/* Package recovery: rescuer → failed holder, and the handover cell */}
      {rescues.map((t) => {
        const a = t.attempts.at(-1);
        return (
          <group key={t.id}>
            <LiveLink from={t.rescuerId!} to={t.failedRobotId} color="#40c8e8" />
            {a ? (
              <mesh position={toVec(frame, a.approachCell, 0.03)} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.8, 0.8]} />
                <meshBasicMaterial color="#40c8e8" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/** A dashed link between two robots that follows their interpolated poses every frame. */
function LiveLink({ from, to, color }: { from: string; to: string; color: string }) {
  const ref = useRef<Line2>(null);
  const positions = useMemo(() => new Float32Array(6), []);
  useFrame(() => {
    const a = robotPoses.get(from);
    const b = robotPoses.get(to);
    const line = ref.current;
    if (!a || !b || !line) return;
    positions.set([a.x, 0.62, a.z, b.x, 0.62, b.z]);
    line.geometry.setPositions(positions);
    line.computeLineDistances();
  });
  return <Line ref={ref} points={[[0, 0, 0], [0, 0, 0]]} color={color} lineWidth={2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.9} depthTest={false} renderOrder={5} />;
}
