"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { RobotState, SimulationSnapshot } from "@/types/simulation";
import { angleDelta, frameOf, gridToWorld, HEADING_YAW } from "@/lib/scene3d/grid-to-world";
import { lerpGrid, tickProgress } from "@/lib/scene3d/interpolation";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { selectionSource, useCamera3D } from "./camera-store";

/** Live robot pose in world space, written every frame — read by the camera to follow / chase. */
export const robotPoses = new Map<string, { x: number; z: number; yaw: number }>();

const STATUS_COLOR = {
  moving: "#b7f34a",
  carrying: "#b7f34a",
  loading: "#40c8e8",
  unloading: "#40c8e8",
  charging: "#40c8e8",
  idle: "#5f8a96",
  waiting: "#f5b942",
  failed: "#f06464",
  recovering: "#f5b942",
} as const;

// Shared geometry / materials for every robot (created once on the client).
let shared: ReturnType<typeof createShared> | null = null;
function createShared() {
  return {
    chassis: new THREE.BoxGeometry(0.62, 0.12, 0.78),
    cover: new THREE.BoxGeometry(0.58, 0.15, 0.74),
    band: new THREE.BoxGeometry(0.6, 0.025, 0.76),
    wheel: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18).rotateZ(Math.PI / 2),
    lidarBase: new THREE.CylinderGeometry(0.07, 0.075, 0.04, 20),
    lidarHead: new THREE.CylinderGeometry(0.058, 0.058, 0.05, 20),
    lidarSlot: new THREE.BoxGeometry(0.05, 0.016, 0.03),
    statusStrip: new THREE.BoxGeometry(0.36, 0.03, 0.012),
    sensor: new THREE.BoxGeometry(0.07, 0.04, 0.02),
    cargo: new THREE.BoxGeometry(0.42, 0.22, 0.44),
    ring: new THREE.RingGeometry(0.5, 0.56, 48).rotateX(-Math.PI / 2),
    graphite: new THREE.MeshStandardMaterial({ color: "#23292d", metalness: 0.55, roughness: 0.45 }),
    coverMat: new THREE.MeshStandardMaterial({ color: "#d6dadd", metalness: 0.15, roughness: 0.35 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#121517", roughness: 0.9 }),
    lidarMat: new THREE.MeshStandardMaterial({ color: "#1a1f22", metalness: 0.8, roughness: 0.25 }),
    sensorMat: new THREE.MeshStandardMaterial({ color: "#0f1316", metalness: 0.6, roughness: 0.2 }),
    slotMat: new THREE.MeshBasicMaterial({ color: "#40c8e8", toneMapped: false }),
  };
}
const getShared = () => (shared ??= createShared());

export function RobotFleet({ snapshot, palette }: { snapshot: SimulationSnapshot; palette: readonly string[] }) {
  const roster = useMemo(() => snapshot.robots.map((r) => ({ id: r.id, colorIndex: r.colorIndex })), [snapshot.scenarioId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {roster.map((r) => (
        <Robot3D key={`${snapshot.scenarioId}:${r.id}`} id={r.id} accent={palette[(r.colorIndex - 1 + palette.length) % palette.length]} />
      ))}
    </group>
  );
}

/**
 * One robot. Its pose comes from the engine snapshot (previousPosition →
 * position, eased over the tick) and its state from the robot record; all
 * of it is applied imperatively in useFrame, so React does not re-render
 * per frame or per tick.
 */
const Robot3D = memo(function Robot3D({ id, accent }: { id: string; accent: string }) {
  const g = getShared();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lidar = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Mesh[]>([]);
  const cargo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const state = useRef({ yaw: NaN, key: "" });
  useEffect(() => () => {
    robotPoses.delete(id);
  }, [id]);

  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.4 }), [accent]);
  const statusMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#5f8a96", toneMapped: false }), []);
  const cargoMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a8875c", roughness: 0.85 }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#b7f34a", transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }), []);

  useFrame((_, delta) => {
    const sim = useSimulationStore.getState();
    const robot = sim.snapshot.robots.find((r) => r.id === id);
    const group = root.current;
    if (!robot || !group) return;
    const prefs = usePreferences.getState();
    const now = performance.now();
    const t = tickProgress({ steppedAt: sim.steppedAt, tickMs: prefs.tickMs, speed: sim.speed, interpolate: prefs.interpolateMotion }, now);
    const frame = frameOf(sim.snapshot.layout);
    const g2 = lerpGrid(robot.previousPosition, robot.position, t);
    const w = gridToWorld(frame, g2.x, g2.y);
    group.position.set(w.x, 0, w.z);

    // Heading: turn smoothly towards the engine heading along the shortest arc.
    const target = HEADING_YAW[robot.heading];
    if (Number.isNaN(state.current.yaw)) state.current.yaw = target;
    state.current.yaw += angleDelta(state.current.yaw, target) * (1 - Math.exp(-delta * 12));
    group.rotation.y = state.current.yaw;
    robotPoses.set(id, { x: w.x, z: w.z, yaw: state.current.yaw });

    const moving = t < 1 && (robot.position.x !== robot.previousPosition.x || robot.position.y !== robot.previousPosition.y);
    const operational = robot.status !== "failed" && robot.status !== "recovering";
    if (lidar.current && operational && sim.status === "running") lidar.current.rotation.y += delta * 6;
    if (moving) for (const wheel of wheels.current) wheel.rotation.x -= delta * 14;
    // Tiny suspension bob while driving.
    if (body.current) body.current.position.y = moving ? Math.sin(now / 70) * 0.004 : 0;

    // State visuals, only when something changed.
    const selected = sim.selection?.kind === "robot" && sim.selection.id === id;
    const pkg = robot.packageId ? sim.snapshot.packages.find((p) => p.id === robot.packageId) : undefined;
    const key = `${robot.status}|${robot.waitClass}|${robot.recoveryRole?.role ?? ""}|${selected}|${robot.packageId}|${pkg?.state}`;
    if (key !== state.current.key) {
      state.current.key = key;
      statusMat.color.set(STATUS_COLOR[robot.status]);
      if (cargo.current) {
        cargo.current.visible = robot.packageId !== null;
        cargoMat.color.set(pkg?.state === "recovery-required" ? "#c0504c" : "#a8875c");
      }
      const ringColor = ringColorFor(robot, selected);
      if (ring.current) {
        ring.current.visible = ringColor !== null;
        if (ringColor) ringMat.color.set(ringColor);
      }
    }
    // Pulse the ring for waiting / failed robots.
    if (ring.current?.visible && !selected && robot.status !== "idle") {
      const s = 1 + Math.sin(now / 220) * 0.05;
      ring.current.scale.set(s, 1, s);
    } else ring.current?.scale.set(1, 1, 1);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    selectionSource.fromCanvas = true;
    useSimulationStore.getState().select({ kind: "robot", id });
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectionSource.fromCanvas = true;
    useSimulationStore.getState().select({ kind: "robot", id });
    useCamera3D.getState().setPreset("follow", id);
  };

  return (
    <group ref={root} onClick={onClick} onDoubleClick={onDoubleClick}>
      <mesh ref={ring} geometry={g.ring} material={ringMat} position-y={0.012} visible={false} renderOrder={2} />
      <group ref={body}>
        <mesh geometry={g.chassis} material={g.graphite} position-y={0.12} castShadow />
        <mesh geometry={g.band} material={accentMat} position-y={0.19} />
        <mesh geometry={g.cover} material={g.coverMat} position-y={0.275} castShadow />
        {(
          [
            [-0.31, 0.075, -0.25],
            [0.31, 0.075, -0.25],
            [-0.31, 0.075, 0.25],
            [0.31, 0.075, 0.25],
          ] as const
        ).map((p, i) => (
          <mesh
            key={i}
            geometry={g.wheel}
            material={g.tyre}
            position={p}
            ref={(m) => {
              if (m) wheels.current[i] = m;
            }}
          />
        ))}
        {/* Front (−Z): status light and two ranging sensors */}
        <mesh geometry={g.statusStrip} material={statusMat} position={[0, 0.27, -0.375]} />
        <mesh geometry={g.sensor} material={g.sensorMat} position={[-0.2, 0.13, -0.395]} />
        <mesh geometry={g.sensor} material={g.sensorMat} position={[0.2, 0.13, -0.395]} />
        {/* LiDAR on the rear deck */}
        <group position={[0, 0.37, 0.22]}>
          <mesh geometry={g.lidarBase} material={g.lidarMat} />
          <group ref={lidar} position-y={0.045}>
            <mesh geometry={g.lidarHead} material={g.lidarMat} castShadow />
            <mesh geometry={g.lidarSlot} material={g.slotMat} position-z={0.055} />
          </group>
        </group>
        {/* Carried package */}
        <mesh ref={cargo} geometry={g.cargo} material={cargoMat} position={[0, 0.465, -0.08]} visible={false} castShadow />
      </group>
    </group>
  );
});

function ringColorFor(robot: RobotState, selected: boolean): string | null {
  if (robot.status === "failed" || robot.waitClass === "deadlock") return "#f06464";
  if (robot.status === "recovering") return "#f5b942";
  if (robot.recoveryRole?.role === "rescuer" || robot.waitClass === "yielding") return "#40c8e8";
  if (selected) return "#b7f34a";
  if (robot.status === "waiting" || robot.waitClass === "congestion") return "#f5b942";
  return null;
}
