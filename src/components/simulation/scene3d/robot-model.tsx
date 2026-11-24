"use client";

import type { RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RobotStatus } from "@/types/simulation";

/**
 * The SWARM autonomous mobile robot — one model shared by the 3D Simulation
 * Studio and the Fleet page portraits, so a robot looks the same everywhere.
 *
 * Model space: front faces −Z, floor at y = 0, ≈ 0.62 × 0.78 m footprint.
 * Front: metallic bezel, dark display with two illuminated eyes, a status
 * light and two ranging sensors. Rear deck: LiDAR. A thin band in the robot's
 * identity colour runs around the body.
 */

export const STATUS_COLOR: Record<RobotStatus, string> = {
  moving: "#b7f34a",
  carrying: "#b7f34a",
  loading: "#40c8e8",
  unloading: "#40c8e8",
  charging: "#40c8e8",
  idle: "#5f8a96",
  waiting: "#f5b942",
  failed: "#f06464",
  recovering: "#f5b942",
};

/** Eye colour: cyan when operational, amber while restoring, dim red when failed. */
export function eyeColorFor(status: RobotStatus): string {
  if (status === "failed") return "#f06464";
  if (status === "recovering") return "#f5b942";
  return "#40c8e8";
}

let shared: ReturnType<typeof createShared> | null = null;

/** Merge copies of `g`, one per transform (all parts share one material, so one draw call). */
function merged(parts: { geometry: THREE.BufferGeometry; x?: number; y?: number; z?: number; rx?: number }[]): THREE.BufferGeometry {
  const list = parts.map(({ geometry, x = 0, y = 0, z = 0, rx = 0 }) => {
    const g = geometry.clone();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  });
  const out = mergeGeometries(list)!;
  list.forEach((g) => g.dispose());
  return out;
}

function createShared() {
  const eye = new THREE.CapsuleGeometry(0.022, 0.04, 4, 12).rotateZ(Math.PI / 2);
  const sensor = new THREE.BoxGeometry(0.07, 0.04, 0.02);
  const tyre = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24).rotateZ(Math.PI / 2);
  // Hub cap with three spokes, so wheel rotation is visible.
  const hubDisk = new THREE.CylinderGeometry(0.036, 0.036, 0.054, 14).rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(0.058, 0.104, 0.012);
  const hub = merged([{ geometry: hubDisk }, ...[0, Math.PI / 3, (2 * Math.PI) / 3].map((rx) => ({ geometry: spoke, rx }))]);
  const tote = new THREE.BoxGeometry(0.42, 0.2, 0.44);
  const lid = new THREE.BoxGeometry(0.44, 0.03, 0.46);
  const strip = new THREE.BoxGeometry(0.22, 0.018, 0.012);
  const beacon = new THREE.CylinderGeometry(0.026, 0.03, 0.035, 16);
  const geometries = {
    chassis: new THREE.BoxGeometry(0.62, 0.12, 0.78),
    cover: new THREE.BoxGeometry(0.58, 0.15, 0.74),
    band: new THREE.BoxGeometry(0.6, 0.025, 0.76),
    /** Left + right tyre on one axle (axle at the group origin). */
    tyrePair: merged([{ geometry: tyre, x: -0.31 }, { geometry: tyre, x: 0.31 }]),
    hubPair: merged([{ geometry: hub, x: -0.31 }, { geometry: hub, x: 0.31 }]),
    lidarBase: new THREE.CylinderGeometry(0.07, 0.075, 0.04, 20),
    lidarHead: new THREE.CylinderGeometry(0.058, 0.058, 0.05, 20),
    /** Emitter window: an arc of the LiDAR head, so its spin reads. */
    lidarWindow: new THREE.CylinderGeometry(0.0595, 0.0595, 0.016, 12, 1, true, -0.55, 1.1),
    bezel: new THREE.BoxGeometry(0.46, 0.13, 0.014),
    display: new THREE.BoxGeometry(0.42, 0.1, 0.008),
    eyes: merged([{ geometry: eye, x: -0.085 }, { geometry: eye, x: 0.085 }]),
    sensors: merged([{ geometry: sensor, x: -0.22 }, { geometry: sensor, x: 0.22 }]),
    /** Status strip on the nose and a beacon on the deck share the status material. */
    statusLights: merged([
      { geometry: strip, y: 0.155, z: -0.394 },
      { geometry: beacon, x: 0.2, y: 0.368, z: -0.26 },
    ]),
    seam: new THREE.BoxGeometry(0.585, 0.008, 0.008),
    cargo: merged([{ geometry: tote }, { geometry: lid, y: 0.11 }]),
  };
  for (const g of [eye, sensor, tyre, hubDisk, spoke, hub, tote, lid, strip, beacon]) g.dispose();
  return {
    ...geometries,
    graphite: new THREE.MeshStandardMaterial({ color: "#23292d", metalness: 0.55, roughness: 0.45 }),
    coverMat: new THREE.MeshStandardMaterial({ color: "#d9dde0", metalness: 0.12, roughness: 0.32 }),
    bezelMat: new THREE.MeshStandardMaterial({ color: "#8a959b", metalness: 0.85, roughness: 0.26 }),
    displayMat: new THREE.MeshStandardMaterial({ color: "#070a0c", metalness: 0.3, roughness: 0.12 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#141719", roughness: 0.92 }),
    hubMat: new THREE.MeshStandardMaterial({ color: "#7a858b", metalness: 0.85, roughness: 0.28 }),
    lidarMat: new THREE.MeshStandardMaterial({ color: "#1a1f22", metalness: 0.8, roughness: 0.25 }),
    sensorMat: new THREE.MeshStandardMaterial({ color: "#0f1316", metalness: 0.6, roughness: 0.2 }),
    seamMat: new THREE.MeshStandardMaterial({ color: "#5d676c", roughness: 0.6 }),
    slotMat: new THREE.MeshBasicMaterial({ color: "#40c8e8", toneMapped: false }),
  };
}
const getShared = () => (shared ??= createShared());

/** Per-robot materials (identity accent, status light, eyes, cargo). */
export interface RobotMaterials {
  readonly accent: THREE.MeshStandardMaterial;
  readonly status: THREE.MeshBasicMaterial;
  readonly eyes: THREE.MeshStandardMaterial;
  readonly cargo: THREE.MeshStandardMaterial;
}

/** Create in the consuming component with useMemo; dispose on change/unmount. */
export function createRobotMaterials(accent: string): RobotMaterials {
  return {
    accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.4 }),
    status: new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle, toneMapped: false }),
    eyes: new THREE.MeshStandardMaterial({ color: "#40c8e8", emissive: "#40c8e8", emissiveIntensity: 1.4, toneMapped: false }),
    cargo: new THREE.MeshStandardMaterial({ color: "#a8875c", roughness: 0.85 }),
  };
}

/** Eye colour and brightness for a status; `boost` (0–1) brightens them (e.g. on hover). */
export function setEyes(materials: RobotMaterials, status: RobotStatus, boost = 0): void {
  const color = eyeColorFor(status);
  materials.eyes.color.set(color);
  materials.eyes.emissive.set(color);
  materials.eyes.emissiveIntensity = (status === "failed" ? 0.5 : 1.4) + boost * 1.6;
}

/**
 * Status lights (nose strip + deck beacon). Idle robots are dimmed so moving
 * ones stand out; `level` (0–1) modulates brightness for pulsing alerts.
 */
export function setStatusLight(materials: RobotMaterials, status: RobotStatus, level = 1): void {
  const base = status === "idle" ? 0.55 : 1;
  materials.status.color.set(STATUS_COLOR[status]).multiplyScalar(base * level);
}

export function disposeRobotMaterials(materials: RobotMaterials): void {
  for (const m of Object.values(materials)) m.dispose();
}

/** Spin both axles (each holds a merged tyre pair and hub pair). */
export function spinWheels(wheels: THREE.Group | null, amount: number): void {
  for (const axle of wheels?.children ?? []) axle.rotation.x += amount;
}

/**
 * Level of detail for distant robots: hides the small parts (face bezel and
 * eyes, sensors, seam, hub caps, LiDAR window) that are sub-pixel from far
 * away. The silhouette, identity band, status lights and cargo stay.
 */
export function setRobotDetail(parts: { detail: THREE.Object3D | null; wheels: THREE.Group | null; lidar: THREE.Group | null }, visible: boolean): void {
  if (parts.detail) parts.detail.visible = visible;
  for (const axle of parts.wheels?.children ?? []) if (axle.children[1]) axle.children[1].visible = visible;
  const window = parts.lidar?.children[1];
  if (window) window.visible = visible;
}

export interface RobotModelProps {
  readonly materials: RobotMaterials;
  readonly bodyRef?: RefObject<THREE.Group | null>;
  readonly lidarRef?: RefObject<THREE.Group | null>;
  /** Group holding the four wheel assemblies (see spinWheels). */
  readonly wheelsRef?: RefObject<THREE.Group | null>;
  readonly cargoRef?: RefObject<THREE.Mesh | null>;
  /** Group of fine details (see setRobotDetail). */
  readonly detailRef?: RefObject<THREE.Group | null>;
  readonly castShadow?: boolean;
}

/** Axle positions (front, rear). */
const AXLES = [
  [0, 0.075, -0.25],
  [0, 0.075, 0.25],
] as const;

export function RobotModel({ materials, bodyRef, lidarRef, wheelsRef, cargoRef, detailRef, castShadow = false }: RobotModelProps) {
  const g = getShared();
  return (
    <group ref={bodyRef}>
      <mesh geometry={g.chassis} material={g.graphite} position-y={0.12} castShadow={castShadow} />
      <mesh geometry={g.band} material={materials.accent} position-y={0.19} />
      <mesh geometry={g.cover} material={g.coverMat} position-y={0.275} castShadow={castShadow} />
      <group ref={wheelsRef}>
        {AXLES.map((p, i) => (
          <group key={i} position={p}>
            <mesh geometry={g.tyrePair} material={g.tyre} />
            <mesh geometry={g.hubPair} material={g.hubMat} />
          </group>
        ))}
      </group>

      {/* Face (−Z): dark display; bezel and eyes are near-detail. Status strip + deck beacon share one mesh. */}
      <mesh geometry={g.display} material={g.displayMat} position={[0, 0.272, -0.382]} />
      <mesh geometry={g.statusLights} material={materials.status} />
      <group ref={detailRef}>
        <mesh geometry={g.seam} material={g.seamMat} position={[0, 0.318, 0.12]} />
        <mesh geometry={g.bezel} material={g.bezelMat} position={[0, 0.272, -0.374]} />
        <mesh geometry={g.eyes} material={materials.eyes} position={[0, 0.277, -0.388]} />
        <mesh geometry={g.sensors} material={g.sensorMat} position={[0, 0.115, -0.395]} />
      </group>

      {/* LiDAR on the rear deck; the emitter window turns with the head. */}
      <group position={[0, 0.37, 0.22]}>
        <mesh geometry={g.lidarBase} material={g.lidarMat} />
        <group position-y={0.045} ref={lidarRef}>
          <mesh geometry={g.lidarHead} material={g.lidarMat} />
          <mesh geometry={g.lidarWindow} material={g.slotMat} />
        </group>
      </group>

      {/* Carried tote (with lid). */}
      <mesh ref={cargoRef} geometry={g.cargo} material={materials.cargo} position={[0, 0.455, -0.08]} visible={false} castShadow={castShadow} />
    </group>
  );
}
