"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MotionValue } from "framer-motion";
import * as THREE from "three";
import { WarehouseRobot, type RobotExpression } from "./WarehouseRobot";
import { CONFLICT_AISLE_CENTER, WarehouseEnvironment } from "./WarehouseEnvironment";
import { detectSceneQuality, framingFor, prefersReducedMotion } from "./scene-quality";

export interface WarehouseSceneProps {
  /** Page scroll progress 0–1. Read inside the render loop — never causes a React render. */
  progress: MotionValue<number>;
  isEnteringWarehouse?: boolean;
  onWebGLUnavailable?: () => void;
  /**
   * Element that receives the robot's projected screen position as CSS custom
   * properties (--robot-x/y, --lidar-x/y, --base-x/y in px) for HUD labels.
   */
  hudRef?: RefObject<HTMLElement | null>;
}

function isWebGLAvailable() {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

interface Shot {
  readonly cam: THREE.Vector3;
  readonly look: THREE.Vector3;
  /** Robot yaw; π faces the robot's display (front, −Z in model space) towards the +Z cameras. */
  readonly yaw: number;
  readonly expression: RobotExpression;
}

const A = CONFLICT_AISLE_CENTER;
const shot = (cam: [number, number, number], look: [number, number, number], yaw: number, expression: RobotExpression): Shot => ({
  cam: new THREE.Vector3(...cam),
  look: new THREE.Vector3(...look),
  yaw,
  expression,
});

/** One camera shot per landing scene; scroll progress interpolates between them. */
const SHOTS: readonly Shot[] = [
  // 01 Introduction — three-quarter front view, robot turned towards the headline.
  shot([1.55, 1.3, 4.6], [0, 0.55, 0], Math.PI - 0.5, "neutral"),
  // 02 Robot reveal — closer, from the other side.
  shot([-1.7, 1.0, 3.2], [0, 0.6, 0], Math.PI + 0.45, "scanning"),
  // 03 Warehouse scale — high wide shot of the hall.
  shot([0.8, 4.4, 7.4], [-0.4, 0.2, -1.6], Math.PI, "neutral"),
  // 04 Narrow-aisle conflict — high three-quarter view of the aisle behind the hero robot;
  // the hero robot is outside this shot.
  shot([A.x + 1.2, 4.2, A.z + 5.0], [A.x + 0.2, 0, A.z - 0.4], Math.PI - 0.6, "scanning"),
  // 05 Fleet — pulled back over the hall.
  shot([-1.0, 3.0, 6.0], [0, 0.3, -1.2], Math.PI + 0.25, "neutral"),
  // 06 Technology — low detail shot.
  shot([2.3, 1.45, 3.4], [0, 0.6, 0], Math.PI - 0.7, "scanning"),
  // 07 Final — near-frontal, welcoming.
  shot([0.7, 1.05, 3.6], [0, 0.6, 0], Math.PI - 0.2, "welcome"),
];

const ENTER_SHOT = shot([0, 0.58, 1.75], [0, 0.52, 0], Math.PI, "welcome");

export function WarehouseScene({ progress, isEnteringWarehouse = false, onWebGLUnavailable, hudRef }: WarehouseSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLSupported] = useState(() => isWebGLAvailable());

  // Everything the loop reads lives in refs: the WebGL scene is created once per mount.
  const enteringRef = useRef(isEnteringWarehouse);
  const unavailableRef = useRef(onWebGLUnavailable);
  useEffect(() => {
    enteringRef.current = isEnteringWarehouse;
  }, [isEnteringWarehouse]);
  useEffect(() => {
    unavailableRef.current = onWebGLUnavailable;
  }, [onWebGLUnavailable]);

  useEffect(() => {
    if (!webGLSupported) {
      unavailableRef.current?.();
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const quality = detectSceneQuality();
    const reduced = prefersReducedMotion();
    /** Something changed that needs a frame (scroll, resize, pointer). */
    let dirty = true;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b0d, 0.03);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 80);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: quality.antialias, powerPreference: "high-performance" });
    } catch {
      unavailableRef.current?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = quality.shadowMapSize > 0;
    renderer.shadowMap.type = quality.tier === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    // Lighting: a readable hall (hemisphere), one shadowing key light, a cool rim and a lime accent.
    scene.add(new THREE.HemisphereLight(0x9db4c2, 0x0a0f12, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 8, 6);
    if (quality.shadowMapSize > 0) {
      key.castShadow = true;
      key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 22;
      key.shadow.camera.left = -3;
      key.shadow.camera.right = 3;
      key.shadow.camera.top = 3;
      key.shadow.camera.bottom = -3;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.02;
    }
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x40c8e8, 1.3);
    rim.position.set(-4, 3, -5);
    scene.add(rim);
    const accent = new THREE.PointLight(0xb7f34a, 1.2, 9);
    accent.position.set(-2.4, 0.6, 1.6);
    scene.add(accent);

    const robot = new WarehouseRobot();
    // Only the robot casts shadows (onto its pedestal and the floor).
    robot.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.castShadow) o.castShadow = quality.shadowMapSize > 0;
    });
    scene.add(robot.group);
    const environment = new WarehouseEnvironment();
    scene.add(environment.group);

    // Pointer parallax (fine pointers only, never with reduced motion).
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const finePointer = window.matchMedia("(pointer: fine)").matches && !reduced;
    const onPointerMove = (e: PointerEvent) => {
      pointer.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
      dirty = true;
    };
    if (finePointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

    // Framing (robot on the right on desktop, below the text on mobile).
    let framing = framingFor(width, height);
    const frame = { shiftX: framing.shiftX, shiftY: framing.shiftY };
    const applyViewOffset = () => {
      camera.setViewOffset(width, height, -frame.shiftX * width, -frame.shiftY * height, width, height);
    };

    // Smoothed state — preallocated, mutated in place every frame.
    const camPos = SHOTS[0].cam.clone();
    const lookAt = SHOTS[0].look.clone();
    const targetCam = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    let robotYaw = SHOTS[0].yaw;
    const projected = new THREE.Vector3();
    const hudCache = { rx: NaN, ry: NaN, lx: NaN, ly: NaN, bx: NaN, by: NaN };

    const onResize = () => {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      framing = framingFor(width, height);
      camera.aspect = width / height;
      renderer.setSize(width, height);
      applyViewOffset();
      camera.updateProjectionMatrix();
      dirty = true;
    };
    window.addEventListener("resize", onResize);

    let lastProgress = -1;
    const unsubscribe = progress.on("change", () => {
      dirty = true;
    });

    const writeHud = () => {
      const el = hudRef?.current;
      if (!el) return;
      const toScreen = (obj: THREE.Object3D | THREE.Vector3, key: "r" | "l" | "b") => {
        if (obj instanceof THREE.Object3D) obj.getWorldPosition(projected);
        else projected.copy(obj);
        projected.project(camera);
        const x = Math.round((projected.x * 0.5 + 0.5) * width);
        const y = Math.round((-projected.y * 0.5 + 0.5) * height);
        const kx = `${key}x` as keyof typeof hudCache;
        const ky = `${key}y` as keyof typeof hudCache;
        if (hudCache[kx] !== x) {
          hudCache[kx] = x;
          el.style.setProperty(`--${key === "r" ? "robot" : key === "l" ? "lidar" : "base"}-x`, `${x}px`);
        }
        if (hudCache[ky] !== y) {
          hudCache[ky] = y;
          el.style.setProperty(`--${key === "r" ? "robot" : key === "l" ? "lidar" : "base"}-y`, `${y}px`);
        }
      };
      toScreen(robot.group, "r");
      toScreen(robot.lidarAnchor, "l");
      toScreen(environment.pedestalGroup, "b");
    };

    let frameId = 0;
    let frameCount = 0;
    let lastTime = performance.now();
    let settleFrames = 90;

    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      frameCount += 1;
      if (quality.frameSkip > 1 && frameCount % quality.frameSkip !== 0) return;

      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const time = now / 1000;
      const p = Math.min(1, Math.max(0, progress.get()));
      const entering = enteringRef.current;

      // Reduced motion: render on demand only (scroll, resize, pointer) until the camera settles.
      if (reduced && !dirty && !entering && settleFrames <= 0) return;
      if (dirty || entering || p !== lastProgress) settleFrames = 45;
      settleFrames -= 1;
      dirty = false;
      lastProgress = p;

      // ---- Targets from scroll (one interpolation system controls the camera).
      let expression: RobotExpression;
      let targetYaw: number;
      let targetShiftX = framing.shiftX;
      let targetShiftY = framing.shiftY;
      if (entering) {
        targetCam.copy(ENTER_SHOT.cam);
        targetLook.copy(ENTER_SHOT.look);
        targetYaw = ENTER_SHOT.yaw;
        expression = "welcome";
        targetShiftX = 0;
        targetShiftY = 0;
      } else {
        const segment = p * (SHOTS.length - 1);
        const index = Math.min(Math.floor(segment), SHOTS.length - 2);
        const t = segment - index;
        const eased = t * t * (3 - 2 * t);
        const s1 = SHOTS[index];
        const s2 = SHOTS[index + 1];
        targetCam.lerpVectors(s1.cam, s2.cam, eased);
        targetLook.lerpVectors(s1.look, s2.look, eased);
        targetYaw = s1.yaw + (s2.yaw - s1.yaw) * eased;
        expression = t < 0.5 ? s1.expression : s2.expression;
      }
      // Narrower screens: pull the camera back along its view direction so the robot stays whole.
      if (!entering && framing.distanceScale !== 1) {
        camDir.subVectors(targetCam, targetLook).multiplyScalar(framing.distanceScale);
        targetCam.copy(targetLook).add(camDir);
      }

      // ---- Frame-rate independent damping (time constant ≈ 0.12 s; snappier when entering).
      const k = reduced ? 1 : 1 - Math.exp(-delta * (entering ? 5 : 8));
      camPos.lerp(targetCam, k);
      lookAt.lerp(targetLook, k);
      robotYaw += (targetYaw - robotYaw) * k;
      frame.shiftX += (targetShiftX - frame.shiftX) * k;
      frame.shiftY += (targetShiftY - frame.shiftY) * k;

      const pk = 1 - Math.exp(-delta * 4);
      pointer.x += (pointer.targetX - pointer.x) * pk;
      pointer.y += (pointer.targetY - pointer.y) * pk;

      camera.position.copy(camPos);
      if (finePointer) {
        // Small parallax only: the robot never drifts towards the text column.
        camera.position.x += pointer.x * 0.12;
        camera.position.y += pointer.y * 0.08;
      }
      camera.lookAt(lookAt);
      applyViewOffset();
      camera.updateProjectionMatrix();

      robot.group.rotation.y = robotYaw;
      const animateIdle = !reduced;
      robot.update({
        time,
        delta,
        scrollProgress: p,
        pointer: finePointer ? pointer : { x: 0, y: 0 },
        expression,
        lidarSpeedMultiplier: entering ? 3 : 1,
        animate: animateIdle,
      });
      environment.update({ time, delta, scrollProgress: p, animate: animateIdle && quality.fleet });

      renderer.render(scene, camera);
      writeHud();
    };
    applyViewOffset();
    camera.updateProjectionMatrix();
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      unsubscribe();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      robot.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [webGLSupported, progress, hudRef]);

  if (!webGLSupported) return null;

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />;
}
