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
import { useHover3D } from "./hover-store";
import { createRobotMaterials, disposeRobotMaterials, RobotModel, setEyes, setRobotDetail, setStatusLight, spinWheels } from "./robot-model";

/** Live robot pose in world space, written every frame — read by the camera to follow / chase. */
export const robotPoses = new Map<string, { x: number; z: number; yaw: number }>();

const ringGeometry = typeof window === "undefined" ? null : new THREE.RingGeometry(0.5, 0.56, 48).rotateX(-Math.PI / 2);
/**
 * Invisible pick volume. Pointer events raycast this one box instead of the
 * robot's ~18 visible meshes (R3F raycasts every interactive object
 * recursively on each pointer move).
 */
const hitGeometry = typeof window === "undefined" ? null : new THREE.BoxGeometry(0.74, 0.62, 0.86).translate(0, 0.31, 0);

/** Camera distance beyond which fine robot details are hidden (with hysteresis). */
const LOD_HIDE = 15;
const LOD_SHOW = 13;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const detail = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const state = useRef({ yaw: NaN, key: "", detail: true, still: reducedMotion() });
  // Any re-render (e.g. labels toggled) re-applies the state visuals on the next frame.
  useEffect(() => {
    state.current.key = "";
  });

  const materials = useMemo(() => createRobotMaterials(accent), [accent]);
  useEffect(() => () => disposeRobotMaterials(materials), [materials]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#b7f34a", transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);

  useFrame(({ camera }, delta) => {
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

    // Level of detail: small parts are hidden when the robot is far from the camera.
    const dist = camera.position.distanceTo(group.position);
    const wantDetail = state.current.detail ? dist < LOD_HIDE : dist < LOD_SHOW;
    if (wantDetail !== state.current.detail) {
      state.current.detail = wantDetail;
      setRobotDetail({ detail: detail.current, wheels: wheels.current, lidar: lidar.current }, wantDetail);
    }

    const moving = t < 1 && (robot.position.x !== robot.previousPosition.x || robot.position.y !== robot.previousPosition.y);
    const operational = robot.status !== "failed" && robot.status !== "recovering";
    if (lidar.current && operational && sim.status === "running") lidar.current.rotation.y += delta * 6;
    if (moving) spinWheels(wheels.current, -delta * 14);
    // Tiny suspension bob while driving.
    if (body.current) body.current.position.y = moving ? Math.sin(now / 70) * 0.004 : 0;

    // State visuals, only when something changed.
    const selected = sim.selection?.kind === "robot" && sim.selection.id === id;
    const hovered = useHover3D.getState().key === `robot:${id}`;
    const pkg = robot.packageId ? sim.snapshot.packages.find((p) => p.id === robot.packageId) : undefined;
    const key = `${robot.status}|${robot.waitClass}|${robot.recoveryRole?.role ?? ""}|${selected}|${hovered}|${robot.packageId}|${pkg?.state}`;
    if (key !== state.current.key) {
      state.current.key = key;
      setStatusLight(materials, robot.status, 1);
      setEyes(materials, robot.status, hovered || selected ? 0.6 : 0);
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
    // Waiting, failed and restoring robots pulse their ring and status lights while the
    // simulation runs (frames are being drawn anyway; no extra frames are requested).
    const alert = robot.status === "waiting" || robot.status === "failed" || robot.status === "recovering";
    if (alert && sim.status === "running" && !state.current.still) {
      const wave = 0.5 + 0.5 * Math.sin(now / (robot.status === "failed" ? 160 : 260));
      setStatusLight(materials, robot.status, 0.45 + 0.55 * wave);
      if (ring.current?.visible && !selected) {
        const s = 1 + wave * 0.08;
        ring.current.scale.set(s, 1, s);
      }
      state.current.key = ""; // re-apply steady state once the pulse stops
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
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useHover3D.getState().setTarget({ kind: "robot", id });
  };
  const onOut = () => {
    if (useHover3D.getState().key === `robot:${id}`) useHover3D.getState().setTarget(null);
  };

  return (
    <group ref={root}>
      <mesh geometry={hitGeometry ?? undefined} visible={false} onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onOver} onPointerMove={onOver} onPointerOut={onOut} />
      <mesh ref={ring} geometry={ringGeometry ?? undefined} material={ringMat} position-y={0.012} visible={false} renderOrder={2} />
      <RobotModel materials={materials} bodyRef={body} lidarRef={lidar} wheelsRef={wheels} cargoRef={cargo} detailRef={detail} castShadow />
    </group>
  );
});

function ringColorFor(robot: RobotState, selected: boolean): string | null {
  if (selected) return "#b7f34a";
  if (robot.status === "failed" || robot.waitClass === "deadlock") return "#f06464";
  if (robot.status === "recovering") return "#f5b942";
  if (robot.recoveryRole?.role === "rescuer" || robot.waitClass === "yielding") return "#40c8e8";
  if (robot.status === "waiting" || robot.waitClass === "congestion") return "#f5b942";
  return null;
}
