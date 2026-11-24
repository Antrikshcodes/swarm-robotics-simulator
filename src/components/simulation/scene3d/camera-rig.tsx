"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { easeInOutCubic, interpolatePose, presetPose, regionPose, type Pose } from "@/lib/scene3d/camera-fit";
import { worldExtent, type GridFrame } from "@/lib/scene3d/grid-to-world";
import { useSimulationStore } from "@/store/simulation-store";
import { selectionSource, useCamera3D } from "./camera-store";
import { robotPoses } from "./robot-fleet";

/** Re-exported for the initial camera pose. */
export { presetPose };

const TRANSITION_MS = 850;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Transition {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
}

/**
 * Drives the camera: preset transitions, robot focus / follow / chase and
 * bounds. OrbitControls stays the single source of user interaction; this
 * rig only moves the camera when a preset asks it to, and stops the moment
 * the user grabs the controls.
 */
export function CameraRig({ frame, sceneHeight }: { frame: GridFrame; sceneHeight: number }) {
  // Read camera / controls through get() so the rig mutates the live Three objects,
  // not values captured from a render.
  const get = useThree((s) => s.get);
  const controlsReady = useThree((s) => s.controls !== null);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<Transition | null>(null);
  const scratch = useRef({ desiredTarget: new THREE.Vector3(), desiredPos: new THREE.Vector3(), delta: new THREE.Vector3(), dir: new THREE.Vector3() });

  // Preset requests: fixed presets, robot focus and region focus start an eased transition.
  useEffect(() => {
    const apply = () => {
      const { preset, robotId, region } = useCamera3D.getState();
      const { camera, controls: c, size } = get();
      const controls = c as OrbitControlsImpl | null;
      if (!controls) return;
      controls.enabled = preset !== "chase";
      const aspect = size.height > 0 ? size.width / size.height : 1.6;
      let to: Pose | null = null;
      if (preset === "isometric" || preset === "overview" || preset === "top") {
        to = presetPose(preset, frame, aspect, sceneHeight);
      } else if (preset === "focus" && robotId) {
        const pose = robotPoses.get(robotId);
        if (pose) {
          // Keep the current viewing direction, move in to a comfortable distance.
          const dir = scratch.current.dir.copy(camera.position).sub(controls.target).normalize();
          if (dir.y < 0.45) dir.set(dir.x, 0.45, dir.z).normalize();
          const target = new THREE.Vector3(pose.x, 0.3, pose.z);
          to = { position: target.clone().add(dir.multiplyScalar(7)), target };
        }
      } else if (preset === "focus" && region) {
        const dir = scratch.current.dir.copy(camera.position).sub(controls.target);
        to = regionPose(frame, region, dir, aspect, sceneHeight);
      }
      if (to) {
        const from = { position: camera.position.clone(), target: controls.target.clone() };
        goal.current = { from, to, start: performance.now(), duration: reducedMotion() ? 0 : TRANSITION_MS };
      } else goal.current = null;
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
  }, [get, controlsReady, frame, sceneHeight, invalidate]);

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
      const g = goal.current;
      const t = g.duration <= 0 ? 1 : Math.min(1, (performance.now() - g.start) / g.duration);
      interpolatePose(g.from, g.to, easeInOutCubic(t), { position: camera.position, target: controls.target });
      if (t >= 1) goal.current = null;
      else moving = true;
    }

    // Keep the orbit target over the warehouse.
    const { halfX, halfZ } = worldExtent(frame);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -halfX - 2, halfX + 2);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -halfZ - 2, halfZ + 2);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, -4, 3);
    controls.update();
    if (moving) invalidate();
  });

  return null;
}
