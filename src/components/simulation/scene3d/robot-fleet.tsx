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
import { createRobotMaterials, disposeRobotMaterials, RobotModel, setEyes, spinWheels, STATUS_COLOR } from "./robot-model";

/** Live robot pose in world space, written every frame — read by the camera to follow / chase. */
export const robotPoses = new Map<string, { x: number; z: number; yaw: number }>();

const ringGeometry = typeof window === "undefined" ? null : new THREE.RingGeometry(0.5, 0.56, 48).rotateX(-Math.PI / 2);

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
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lidar = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const cargo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const state = useRef({ yaw: NaN, key: "" });
  // Any re-render (e.g. labels toggled) re-applies the state visuals on the next frame.
  useEffect(() => {
    state.current.key = "";
  });

  const materials = useMemo(() => createRobotMaterials(accent), [accent]);
  useEffect(() => () => disposeRobotMaterials(materials), [materials]);
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
    if (moving) spinWheels(wheels.current, -delta * 14);
    // Tiny suspension bob while driving.
    if (body.current) body.current.position.y = moving ? Math.sin(now / 70) * 0.004 : 0;

    // State visuals, only when something changed.
    const selected = sim.selection?.kind === "robot" && sim.selection.id === id;
    const pkg = robot.packageId ? sim.snapshot.packages.find((p) => p.id === robot.packageId) : undefined;
    const key = `${robot.status}|${robot.waitClass}|${robot.recoveryRole?.role ?? ""}|${selected}|${robot.packageId}|${pkg?.state}`;
    if (key !== state.current.key) {
      state.current.key = key;
      materials.status.color.set(STATUS_COLOR[robot.status]);
      setEyes(materials, robot.status);
      if (cargo.current) {
        cargo.current.visible = robot.packageId !== null;
        materials.cargo.color.set(pkg?.state === "recovery-required" ? "#c0504c" : "#a8875c");
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
      <mesh ref={ring} geometry={ringGeometry ?? undefined} material={ringMat} position-y={0.012} visible={false} renderOrder={2} />
      <RobotModel materials={materials} bodyRef={body} lidarRef={lidar} wheelsRef={wheels} cargoRef={cargo} castShadow />
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
