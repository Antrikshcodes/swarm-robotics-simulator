"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WarehouseLayout } from "@/types/simulation";
import { CELL } from "@/lib/scene3d/grid-to-world";
import { buildRackScene, RACK, rackHeight, type Placement } from "@/lib/scene3d/layout-to-scene";

/** Neutral industrial container shades (grey, blue-grey, graphite, light grey). */
const BIN_SHADES = ["#8b949a", "#6f7f8a", "#545e64", "#a9b1b5"].map((c) => new THREE.Color(c));

/**
 * Storage racking generated from the layout's rack cells. Every repeated
 * part is a single InstancedMesh: uprights, load beams, decks, bins,
 * bracing and obstacles — six draw calls whatever the warehouse size.
 */
export function WarehouseRacks({ layout, quality, cutaway }: { layout: WarehouseLayout; quality: "high" | "standard" | "low"; cutaway: boolean }) {
  const levels = cutaway ? 1 : RACK.levels.length;
  const scene = useMemo(() => buildRackScene(layout, { binsPerLevel: quality === "low" ? 1 : 2, levels }), [layout, quality, levels]);
  const shadows = quality === "high";

  return (
    <group key={levels}>
      <Instances items={scene.uprights} castShadow={shadows} geometry={[RACK.uprightSize, rackHeight(levels), RACK.uprightSize]} color="#4f5b62" metalness={0.75} roughness={0.38} />
      <Instances items={scene.beams} geometry={[CELL - RACK.uprightSize, RACK.beamHeight, RACK.beamDepth]} color="#3f6f86" metalness={0.6} roughness={0.42} />
      <Instances items={scene.decks} receiveShadow={shadows} geometry={[CELL - RACK.uprightSize * 2, RACK.deckThickness, CELL - RACK.beamDepth * 2]} color="#6b767c" metalness={0.55} roughness={0.5} />
      <Bins items={scene.bins} castShadow={shadows} />
      <Braces items={scene.braces} />
      <Obstacles items={scene.obstacles} />
    </group>
  );
}

function Instances({
  items,
  geometry,
  color,
  metalness,
  roughness,
  castShadow = false,
  receiveShadow = false,
}: {
  items: readonly Placement[];
  geometry: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rotY);
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false}>
      <boxGeometry args={geometry} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </instancedMesh>
  );
}

function Bins({ items, castShadow }: { items: ReturnType<typeof buildRackScene>["bins"]; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Slightly bevelled-looking container: a box with a darker lip drawn via vertex colours is overkill;
  // a box plus per-instance shade reads well at warehouse distances.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    items.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotY);
      mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s));
      mesh.setColorAt(i, BIN_SHADES[b.shade]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} frustumCulled={false}>
      <boxGeometry args={[RACK.bin.length - 0.04, RACK.bin.height, RACK.bin.depth]} />
      <meshStandardMaterial roughness={0.78} metalness={0.05} />
    </instancedMesh>
  );
}

function Braces({ items }: { items: ReturnType<typeof buildRackScene>["braces"] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const yaw = new THREE.Quaternion();
    const roll = new THREE.Quaternion();
    const p = new THREE.Vector3();
    items.forEach((b, i) => {
      yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotY);
      roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), b.tilt);
      // Unit-length bar along X, scaled to the diagonal, tilted in its plane, then turned to face the run.
      mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), yaw.clone().multiply(roll), new THREE.Vector3(b.length, 1, 1)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false}>
      <boxGeometry args={[1, 0.025, 0.025]} />
      <meshStandardMaterial color="#59656c" metalness={0.7} roughness={0.4} />
    </instancedMesh>
  );
}

/** Obstacles: concrete columns with an amber/black safety band. */
function Obstacles({ items }: { items: readonly Placement[] }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const band = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    items.forEach((o, i) => {
      body.current?.setMatrixAt(i, m.makeTranslation(o.x, 1.3, o.z));
      band.current?.setMatrixAt(i, m.makeTranslation(o.x, 0.35, o.z));
    });
    for (const r of [body, band]) {
      if (r.current) {
        r.current.instanceMatrix.needsUpdate = true;
        r.current.computeBoundingSphere();
      }
    }
  }, [items]);
  if (items.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, items.length]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.7, 2.6, 0.7]} />
        <meshStandardMaterial color="#7d8589" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={band} args={[undefined, undefined, items.length]} frustumCulled={false}>
        <boxGeometry args={[0.72, 0.5, 0.72]} />
        <meshStandardMaterial color="#d4a23c" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}
