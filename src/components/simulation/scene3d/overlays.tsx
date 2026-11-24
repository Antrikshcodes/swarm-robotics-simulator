"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Line2 } from "three-stdlib";
import type { GridPoint, SimulationSnapshot, Station } from "@/types/simulation";
import { frameOf, gridToWorld, type GridFrame } from "@/lib/scene3d/grid-to-world";
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

const STATION_COLOR = { pickup: "#40c8e8", dropoff: "#b7f34a", charger: "#c8d2d8" } as const;

/**
 * Station furniture, instanced per part (four draw calls for any number of
 * stations): a pylon in the pad corner with a light bar in the station's
 * colour, and a docking backplate with contact strips for chargers.
 */
export function Stations({ stations, frame }: { stations: readonly Station[]; frame: GridFrame }) {
  const pylons = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const docks = useRef<THREE.InstancedMesh>(null);
  const contacts = useRef<THREE.InstancedMesh>(null);
  const chargers = useMemo(() => stations.filter((s) => s.kind === "charger"), [stations]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    stations.forEach((s, i) => {
      const w = gridToWorld(frame, s.position.x, s.position.y);
      pylons.current?.setMatrixAt(i, m.makeTranslation(w.x - 0.42, 0.6, w.z - 0.42));
      lights.current?.setMatrixAt(i, m.makeTranslation(w.x - 0.42, 1.02, w.z - 0.42));
      lights.current?.setColorAt(i, c.set(STATION_COLOR[s.kind]));
    });
    chargers.forEach((s, i) => {
      const w = gridToWorld(frame, s.position.x, s.position.y);
      docks.current?.setMatrixAt(i, m.makeTranslation(w.x, 0.21, w.z - 0.44));
      contacts.current?.setMatrixAt(i, m.makeTranslation(w.x, 0.16, w.z - 0.395));
    });
    for (const r of [pylons, lights, docks, contacts]) {
      const mesh = r.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [stations, chargers, frame]);

  if (stations.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={pylons} args={[undefined, undefined, stations.length]} castShadow>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color="#4b555b" metalness={0.65} roughness={0.38} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, stations.length]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {chargers.length ? (
        <>
          <instancedMesh ref={docks} args={[undefined, undefined, chargers.length]} castShadow>
            <boxGeometry args={[0.56, 0.42, 0.08]} />
            <meshStandardMaterial color="#2c3438" metalness={0.5} roughness={0.45} />
          </instancedMesh>
          <instancedMesh ref={contacts} args={[undefined, undefined, chargers.length]}>
            <boxGeometry args={[0.3, 0.05, 0.012]} />
            <meshBasicMaterial color="#40c8e8" toneMapped={false} />
          </instancedMesh>
        </>
      ) : null}
    </group>
  );
}

// ------------------------------------------------------------------ closures

let stripeTexture: THREE.CanvasTexture | null = null;
/** Red / white diagonal barrier stripes (shared, created once). */
function stripes(): THREE.CanvasTexture {
  if (stripeTexture) return stripeTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e8ecee";
  ctx.fillRect(0, 0, 64, 16);
  ctx.fillStyle = "#d9463f";
  for (let x = -16; x < 64; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 16);
    ctx.lineTo(x + 8, 0);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x + 8, 16);
    ctx.fill();
  }
  stripeTexture = new THREE.CanvasTexture(c);
  stripeTexture.colorSpace = THREE.SRGBColorSpace;
  return stripeTexture;
}

/**
 * Closed cells: a red floor tile and a striped barricade per cell, as three
 * instanced meshes (previously four meshes, each with its own geometry and
 * material, per closed cell).
 */
export function Closures({ snapshot }: { snapshot: SimulationSnapshot }) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => snapshot.closures.flatMap((c) => c.cells), [snapshot.closures]);
  const capacity = Math.max(8, cells.length);
  const barMaterial = useMemo(() => new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.55, emissive: "#d9463f", emissiveIntensity: 0.12 }), []);
  useEffect(() => () => barMaterial.dispose(), [barMaterial]);

  useLayoutEffect(() => {
    const frame = frameOf(snapshot.layout);
    const m = new THREE.Matrix4();
    cells.forEach((cell, i) => {
      const w = gridToWorld(frame, cell.x, cell.y);
      tiles.current?.setMatrixAt(i, m.makeTranslation(w.x, 0.02, w.z));
      posts.current?.setMatrixAt(i * 2, m.makeTranslation(w.x - 0.34, 0.3, w.z));
      posts.current?.setMatrixAt(i * 2 + 1, m.makeTranslation(w.x + 0.34, 0.3, w.z));
      bars.current?.setMatrixAt(i, m.makeTranslation(w.x, 0.5, w.z));
    });
    for (const [r, n] of [
      [tiles, cells.length],
      [posts, cells.length * 2],
      [bars, cells.length],
    ] as const) {
      if (!r.current) continue;
      r.current.count = n;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [cells, snapshot.layout]);

  return (
    <group visible={cells.length > 0}>
      <instancedMesh key={`t${capacity}`} ref={tiles} args={[closureTile ?? undefined, undefined, capacity]} renderOrder={1}>
        <meshBasicMaterial color="#f06464" transparent opacity={0.24} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`p${capacity}`} ref={posts} args={[undefined, undefined, capacity * 2]}>
        <cylinderGeometry args={[0.03, 0.04, 0.6, 10]} />
        <meshStandardMaterial color="#d9dde0" roughness={0.6} />
      </instancedMesh>
      <instancedMesh key={`b${capacity}`} ref={bars} args={[undefined, undefined, capacity]} material={barMaterial}>
        <boxGeometry args={[0.78, 0.1, 0.04]} />
      </instancedMesh>
    </group>
  );
}

const closureTile = typeof window === "undefined" ? null : new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);

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
        // With a robot selected, other routes recede so its plan reads at a glance.
        return <RouteLine key={r.id} points={points} color={color} emphasis={selected ? "selected" : selectedId ? "muted" : "normal"} />;
      })}
    </group>
  );
}

function RouteLine({ points, color, emphasis }: { points: [number, number, number][]; color: string; emphasis: "selected" | "normal" | "muted" }) {
  const selected = emphasis === "selected";
  const opacity = selected ? 1 : emphasis === "muted" ? 0.28 : 0.75;
  const ref = useRef<Line2>(null);
  // Dashes flow towards the destination: a directional cue without extra geometry.
  useFrame((_, delta) => {
    const mat = ref.current?.material as (THREE.Material & { dashOffset: number }) | undefined;
    if (mat) mat.dashOffset -= delta * 0.6;
  });
  const end = points[points.length - 1];
  return (
    <group>
      <Line ref={ref} points={points} color={color} lineWidth={selected ? 4 : emphasis === "muted" ? 1.5 : 2} dashed dashSize={0.32} gapSize={0.16} transparent opacity={opacity} depthWrite={false} renderOrder={selected ? 4 : 2} />
      <mesh position={[end[0], ROUTE_Y + 0.002, end[2]]} rotation-x={-Math.PI / 2} geometry={destinationRing ?? undefined}>
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
      {selected ? (
        // Destination pin for the selected robot: visible over racking.
        <mesh position={[end[0], 0.6, end[2]]} geometry={destinationPin ?? undefined}>
          <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

const destinationRing = typeof window === "undefined" ? null : new THREE.RingGeometry(0.2, 0.26, 32);
const destinationPin = typeof window === "undefined" ? null : new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6);

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

const arrowHead = typeof window === "undefined" ? null : new THREE.ConeGeometry(0.09, 0.22, 10).rotateX(Math.PI / 2);

/**
 * A dashed link between two robots that follows their interpolated poses
 * every frame, with an arrowhead at the robot being waited for.
 */
function LiveLink({ from, to, color }: { from: string; to: string; color: string }) {
  const ref = useRef<Line2>(null);
  const head = useRef<THREE.Mesh>(null);
  const positions = useMemo(() => new Float32Array(6), []);
  useFrame(() => {
    const a = robotPoses.get(from);
    const b = robotPoses.get(to);
    const line = ref.current;
    if (!a || !b || !line) return;
    // Stop short of the target robot so the arrowhead sits beside it.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ex = b.x - (dx / len) * 0.42;
    const ez = b.z - (dz / len) * 0.42;
    positions.set([a.x, 0.62, a.z, ex, 0.62, ez]);
    line.geometry.setPositions(positions);
    line.computeLineDistances();
    if (head.current) {
      head.current.position.set(ex, 0.62, ez);
      head.current.rotation.y = Math.atan2(dx, dz);
    }
  });
  return (
    <group>
      <Line ref={ref} points={[[0, 0, 0], [0, 0, 0]]} color={color} lineWidth={2.2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.95} depthTest={false} renderOrder={5} />
      <mesh ref={head} geometry={arrowHead ?? undefined} renderOrder={6}>
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}
