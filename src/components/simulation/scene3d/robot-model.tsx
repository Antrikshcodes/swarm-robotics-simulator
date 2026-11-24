"use client";

import type { RefObject } from "react";
import * as THREE from "three";
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
function createShared() {
  const eye = new THREE.CapsuleGeometry(0.022, 0.04, 4, 12).rotateZ(Math.PI / 2);
  return {
    chassis: new THREE.BoxGeometry(0.62, 0.12, 0.78),
    cover: new THREE.BoxGeometry(0.58, 0.15, 0.74),
    band: new THREE.BoxGeometry(0.6, 0.025, 0.76),
    wheel: new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18).rotateZ(Math.PI / 2),
    hub: new THREE.CylinderGeometry(0.035, 0.035, 0.056, 12).rotateZ(Math.PI / 2),
    lidarBase: new THREE.CylinderGeometry(0.07, 0.075, 0.04, 20),
    lidarHead: new THREE.CylinderGeometry(0.058, 0.058, 0.05, 20),
    lidarSlot: new THREE.BoxGeometry(0.05, 0.016, 0.03),
    bezel: new THREE.BoxGeometry(0.46, 0.13, 0.014),
    display: new THREE.BoxGeometry(0.42, 0.1, 0.008),
    eye,
    statusStrip: new THREE.BoxGeometry(0.22, 0.018, 0.012),
    sensor: new THREE.BoxGeometry(0.07, 0.04, 0.02),
    seam: new THREE.BoxGeometry(0.585, 0.008, 0.008),
    cargo: new THREE.BoxGeometry(0.42, 0.22, 0.44),
    graphite: new THREE.MeshStandardMaterial({ color: "#23292d", metalness: 0.55, roughness: 0.45 }),
    coverMat: new THREE.MeshStandardMaterial({ color: "#d6dadd", metalness: 0.15, roughness: 0.35 }),
    bezelMat: new THREE.MeshStandardMaterial({ color: "#8a959b", metalness: 0.85, roughness: 0.28 }),
    displayMat: new THREE.MeshStandardMaterial({ color: "#070a0c", metalness: 0.3, roughness: 0.12 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#121517", roughness: 0.9 }),
    hubMat: new THREE.MeshStandardMaterial({ color: "#59646a", metalness: 0.8, roughness: 0.3 }),
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

export function disposeRobotMaterials(materials: RobotMaterials): void {
  for (const m of Object.values(materials)) m.dispose();
}

/** Spin the four tyres (first child of each wheel assembly) about their axles. */
export function spinWheels(wheels: THREE.Group | null, amount: number): void {
  for (const assembly of wheels?.children ?? []) assembly.children[0].rotation.x += amount;
}

export interface RobotModelProps {
  readonly materials: RobotMaterials;
  readonly bodyRef?: RefObject<THREE.Group | null>;
  readonly lidarRef?: RefObject<THREE.Group | null>;
  /** Group holding the four wheel assemblies (see spinWheels). */
  readonly wheelsRef?: RefObject<THREE.Group | null>;
  readonly cargoRef?: RefObject<THREE.Mesh | null>;
  readonly castShadow?: boolean;
}

const WHEELS = [
  [-0.31, 0.075, -0.25],
  [0.31, 0.075, -0.25],
  [-0.31, 0.075, 0.25],
  [0.31, 0.075, 0.25],
] as const;

export function RobotModel({ materials, bodyRef, lidarRef, wheelsRef, cargoRef, castShadow = false }: RobotModelProps) {
  const g = getShared();
  return (
    <group ref={bodyRef}>
      <mesh geometry={g.chassis} material={g.graphite} position-y={0.12} castShadow={castShadow} />
      <mesh geometry={g.band} material={materials.accent} position-y={0.19} />
      <mesh geometry={g.cover} material={g.coverMat} position-y={0.275} castShadow={castShadow} />
      <mesh geometry={g.seam} material={g.seamMat} position={[0, 0.318, 0.12]} />
      <group ref={wheelsRef}>
        {WHEELS.map((p, i) => (
          <group key={i} position={p}>
            <mesh geometry={g.wheel} material={g.tyre} />
            <mesh geometry={g.hub} material={g.hubMat} />
          </group>
        ))}
      </group>

      {/* Face (−Z): metallic bezel, dark display, two illuminated eyes. */}
      <mesh geometry={g.bezel} material={g.bezelMat} position={[0, 0.272, -0.374]} />
      <mesh geometry={g.display} material={g.displayMat} position={[0, 0.272, -0.382]} />
      <mesh geometry={g.eye} material={materials.eyes} position={[-0.085, 0.277, -0.388]} />
      <mesh geometry={g.eye} material={materials.eyes} position={[0.085, 0.277, -0.388]} />
      {/* Status light and ranging sensors on the chassis nose. */}
      <mesh geometry={g.statusStrip} material={materials.status} position={[0, 0.155, -0.394]} />
      <mesh geometry={g.sensor} material={g.sensorMat} position={[-0.22, 0.115, -0.395]} />
      <mesh geometry={g.sensor} material={g.sensorMat} position={[0.22, 0.115, -0.395]} />

      {/* LiDAR on the rear deck. */}
      <group position={[0, 0.37, 0.22]}>
        <mesh geometry={g.lidarBase} material={g.lidarMat} />
        <group position-y={0.045} ref={lidarRef}>
          <mesh geometry={g.lidarHead} material={g.lidarMat} castShadow={castShadow} />
          <mesh geometry={g.lidarSlot} material={g.slotMat} position-z={0.055} />
        </group>
      </group>

      {/* Carried package. */}
      <mesh
        ref={cargoRef}
        geometry={g.cargo}
        material={materials.cargo}
        position={[0, 0.465, -0.08]}
        visible={false}
        castShadow={castShadow}
      />
    </group>
  );
}
