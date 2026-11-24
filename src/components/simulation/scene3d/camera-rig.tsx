"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { worldExtent, type GridFrame } from "@/lib/scene3d/grid-to-world";
import { useSimulationStore } from "@/store/simulation-store";
import { selectionSource, useCamera3D, type CameraPreset } from "./camera-store";
import { robotPoses } from "./robot-fleet";

const FOV = 40;

/**
 * Camera pose (position + orbit target) for a fixed preset. The distance is
 * solved from the field of view and the viewport aspect so the whole
 * warehouse fits the frame, whatever the layout size or panel width.
 */
export function presetPose(preset: CameraPreset, frame: GridFrame, aspect = 1.6): { position: THREE.Vector3; target: THREE.Vector3 } {
  const { halfX, halfZ } = worldExtent(frame);
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  // Distance at which a box of half-size (hx, hz) seen along `dir` fits the view (with margin).
  const fit = (hx: number, hz: number, margin: number) => Math.max(hx / tanH, hz / tanV) * margin;
  const target = new THREE.Vector3(0, 0, 0);
  switch (preset) {
    case "overview": {
      const dir = new THREE.Vector3(0, 0.84, 0.54).normalize();
      return { position: dir.multiplyScalar(fit(halfX, halfZ * 0.85, 1.18) + 2.6), target };
    }
    case "top":
      return { position: new THREE.Vector3(0, fit(halfX, halfZ, 1.1) + 2.6, 0.001), target };
    default: {
      // Isometric: elevated three-quarter view showing rack height and aisle depth.
      const dir = new THREE.Vector3(0.5, 0.72, 0.62).normalize();
      const reach = Math.hypot(halfX, halfZ);
      return { position: dir.multiplyScalar(fit(reach * 0.92, reach * 0.62, 1.12)), target: new THREE.Vector3(0, 0, 0.4) };
    }
  }
}

/**
 * Drives the camera: preset transitions, robot focus / follow / chase and
 * bounds. OrbitControls stays the single source of user interaction; this
 * rig only moves the camera when a preset asks it to, and stops the moment
 * the user grabs the controls.
 */
export function CameraRig({ frame }: { frame: GridFrame }) {
  // Read camera / controls through get() so the rig mutates the live Three objects,
  // not values captured from a render.
  const get = useThree((s) => s.get);
  const controlsReady = useThree((s) => s.controls !== null);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const scratch = useRef({ desiredTarget: new THREE.Vector3(), desiredPos: new THREE.Vector3(), delta: new THREE.Vector3(), dir: new THREE.Vector3() });

  // Preset requests.
  useEffect(() => {
    const apply = () => {
      const { preset, robotId } = useCamera3D.getState();
      const { camera, controls: c } = get();
      const controls = c as OrbitControlsImpl | null;
      if (!controls) return;
      controls.enabled = preset !== "chase";
      if (preset === "isometric" || preset === "overview" || preset === "top") {
        const { width, height } = get().size;
        goal.current = presetPose(preset, frame, height > 0 ? width / height : 1.6);
      } else if (preset === "focus" && robotId) {
        const pose = robotPoses.get(robotId);
        if (pose) {
          // Keep the current viewing direction, move in to a comfortable distance.
          const dir = scratch.current.dir.copy(camera.position).sub(controls.target).normalize();
          if (dir.y < 0.45) dir.set(dir.x, 0.45, dir.z).normalize();
          const target = new THREE.Vector3(pose.x, 0.3, pose.z);
          goal.current = { position: target.clone().add(dir.multiplyScalar(7)), target };
        }
      } else {
        goal.current = null;
      }
      invalidate();
    };
    let last = useCamera3D.getState().nonce;
    const unsub = useCamera3D.subscribe((s) => {
      if (s.nonce !== last) {
        last = s.nonce;
        apply();
      }
    });
    return unsub;
  }, [get, controlsReady, frame, invalidate]);

  // Selecting a robot elsewhere (fleet panel, incidents) focuses the camera on it.
  useEffect(() => {
    let last = useSimulationStore.getState().selection;
    return useSimulationStore.subscribe((s) => {
      if (s.selection === last) return;
      last = s.selection;
      if (selectionSource.fromCanvas) {
        selectionSource.fromCanvas = false;
        return;
      }
      if (s.selection?.kind === "robot") {
        const { preset } = useCamera3D.getState();
        // Already following/chasing: switch the subject; otherwise a one-shot focus.
        useCamera3D.getState().setPreset(preset === "follow" || preset === "chase" ? preset : "focus", s.selection.id);
      }
    });
  }, []);

  // The user taking control cancels any running transition.
  useEffect(() => {
    const controls = get().controls as OrbitControlsImpl | null;
    if (!controls) return;
    const onStart = () => {
      goal.current = null;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [get, controlsReady]);

  useFrame((state, delta) => {
    const camera = state.camera;
    const controls = state.controls as OrbitControlsImpl | null;
    if (!controls) return;
    const { preset, robotId } = useCamera3D.getState();
    const k = 1 - Math.exp(-delta * 5);
    const s = scratch.current;
    let moving = false;

    const pose = robotId ? robotPoses.get(robotId) : undefined;
    if ((preset === "follow" || preset === "chase") && pose) {
      if (preset === "follow") {
        // Track the robot with the orbit target; carry the camera along so the user's orbit is kept.
        s.desiredTarget.set(pose.x, 0.3, pose.z);
        s.delta.copy(s.desiredTarget).sub(controls.target).multiplyScalar(k);
        controls.target.add(s.delta);
        camera.position.add(s.delta);
        // On entering follow, glide in to a working distance.
        const dist = camera.position.distanceTo(controls.target);
        if (dist > 9) camera.position.lerp(s.desiredPos.copy(camera.position).sub(controls.target).setLength(9).add(controls.target), k);
        moving = s.delta.lengthSq() > 1e-6 || dist > 9.01;
      } else {
        // Chase: behind and above the robot, looking along its heading.
        const fx = -Math.sin(pose.yaw);
        const fz = -Math.cos(pose.yaw);
        s.desiredPos.set(pose.x - fx * 2.6, 1.55, pose.z - fz * 2.6);
        s.desiredTarget.set(pose.x + fx * 1.8, 0.35, pose.z + fz * 1.8);
        camera.position.lerp(s.desiredPos, k);
        controls.target.lerp(s.desiredTarget, k);
        moving = camera.position.distanceToSquared(s.desiredPos) > 1e-5;
      }
    } else if (goal.current) {
      camera.position.lerp(goal.current.position, k);
      controls.target.lerp(goal.current.target, k);
      if (camera.position.distanceToSquared(goal.current.position) < 1e-4 && controls.target.distanceToSquared(goal.current.target) < 1e-4) {
        goal.current = null;
      } else moving = true;
    }

    // Keep the orbit target over the warehouse.
    const { halfX, halfZ } = worldExtent(frame);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -halfX - 2, halfX + 2);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -halfZ - 2, halfZ + 2);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 3);
    controls.update();
    if (moving) invalidate();
  });

  return null;
}
