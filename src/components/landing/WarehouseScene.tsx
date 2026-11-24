"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { WarehouseRobot, type RobotExpression } from "./WarehouseRobot";
import { WarehouseEnvironment } from "./WarehouseEnvironment";

export interface WarehouseSceneProps {
  scrollProgress: number;
  isEnteringWarehouse?: boolean;
  onWebGLUnavailable?: () => void;
}

function isWebGLAvailable() {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export function WarehouseScene({
  scrollProgress,
  isEnteringWarehouse = false,
  onWebGLUnavailable,
}: WarehouseSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLSupported] = useState(() => isWebGLAvailable());

  // Store active props in refs to avoid restarting Three.js loop
  const scrollRef = useRef(scrollProgress);
  const enteringRef = useRef(isEnteringWarehouse);

  useEffect(() => {
    scrollRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    enteringRef.current = isEnteringWarehouse;
  }, [isEnteringWarehouse]);

  useEffect(() => {
    if (!webGLSupported) {
      onWebGLUnavailable?.();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // 2. Setup Three.js Scene, Camera, Renderer
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b0d, 0.035);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.0, 1.5, 4.4);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      onWebGLUnavailable?.();
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // 3. Dark Industrial Cinematic Lights
    const ambientLight = new THREE.AmbientLight(0x0d1419, 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(6, 9, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x192733, 1.4);
    fillLight.position.set(-5, 4, -3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x40c8e8, 2.6, 16);
    rimLight.position.set(0, 0.3, 1.8);
    scene.add(rimLight);

    const limeAccent = new THREE.PointLight(0xb7f34a, 1.6, 12);
    limeAccent.position.set(-2, 0.5, -1);
    scene.add(limeAccent);

    // 4. Instantiate Models
    const robot = new WarehouseRobot();
    scene.add(robot.group);

    const environment = new WarehouseEnvironment();
    scene.add(environment.group);

    // 5. Pointer Tracking with Parallax
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (e: MouseEvent) => {
      pointer.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onPointerMove, { passive: true });

    // 6. Camera States for 7-Scene Continuous Choreography
    const cameraStates = [
      // Scene 01: The Introduction (Hero, scroll ~0.0)
      {
        camPos: new THREE.Vector3(2.1, 1.5, 4.4),
        lookAt: new THREE.Vector3(0.5, 0.75, 0),
        robotPos: new THREE.Vector3(0.5, 0, 0),
        robotRotY: -0.42,
        expression: "neutral" as RobotExpression,
      },
      // Scene 02: The Robot Reveal (scroll ~0.16)
      {
        camPos: new THREE.Vector3(-1.5, 1.15, 2.8),
        lookAt: new THREE.Vector3(-0.1, 0.75, 0),
        robotPos: new THREE.Vector3(-0.1, 0, 0),
        robotRotY: 0.52,
        expression: "scanning" as RobotExpression,
      },
      // Scene 03: The Warehouse Reveal (scroll ~0.33)
      {
        camPos: new THREE.Vector3(0.2, 4.2, 6.2),
        lookAt: new THREE.Vector3(0, 0.4, 0),
        robotPos: new THREE.Vector3(0, 0, 0),
        robotRotY: 0.0,
        expression: "neutral" as RobotExpression,
      },
      // Scene 04: The Coordination Problem (Narrow Aisle, scroll ~0.50)
      {
        camPos: new THREE.Vector3(1.9, 2.3, 3.8),
        lookAt: new THREE.Vector3(0.4, 0.6, 0),
        robotPos: new THREE.Vector3(0.4, 0, 0),
        robotRotY: -0.32,
        expression: "scanning" as RobotExpression,
      },
      // Scene 05: The SWARM Solution (Multi-Robot Fleet, scroll ~0.66)
      {
        camPos: new THREE.Vector3(-2.2, 2.4, 4.2),
        lookAt: new THREE.Vector3(-0.2, 0.5, 0),
        robotPos: new THREE.Vector3(-0.2, 0, 0),
        robotRotY: 0.38,
        expression: "neutral" as RobotExpression,
      },
      // Scene 06: The Technology (4D Reservation Matrix, scroll ~0.83)
      {
        camPos: new THREE.Vector3(2.6, 2.0, 3.5),
        lookAt: new THREE.Vector3(-0.1, 0.75, 0),
        robotPos: new THREE.Vector3(-0.1, 0, 0),
        robotRotY: -0.65,
        expression: "scanning" as RobotExpression,
      },
      // Scene 07: The Final CTA (Heroic Frontal, scroll ~1.0)
      {
        camPos: new THREE.Vector3(0.0, 1.15, 3.1),
        lookAt: new THREE.Vector3(0, 0.75, 0),
        robotPos: new THREE.Vector3(0, 0, 0),
        robotRotY: 0.0,
        expression: "welcome" as RobotExpression,
      },
    ];

    const currentCamPos = cameraStates[0].camPos.clone();
    const currentLookAt = cameraStates[0].lookAt.clone();
    const currentRobotPos = cameraStates[0].robotPos.clone();
    let currentRobotRotY = cameraStates[0].robotRotY;

    // 7. Resize Handler
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // 8. Animation Render Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const time = now / 1000;

      // Pointer easing
      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;

      const p = Math.max(0, Math.min(1, scrollRef.current));
      const isEntering = enteringRef.current;

      let targetCamPos: THREE.Vector3;
      let targetLookAt: THREE.Vector3;
      let targetRobotPos: THREE.Vector3;
      let targetRobotRotY: number;
      let activeExpression: RobotExpression;
      let lidarMultiplier = 1;

      if (isEntering) {
        // Zoom into robot front display for cinematic entrance
        targetCamPos = new THREE.Vector3(0, 0.65, 1.15);
        targetLookAt = new THREE.Vector3(0, 0.52, -0.8);
        targetRobotPos = new THREE.Vector3(0, 0, 0);
        targetRobotRotY = 0;
        activeExpression = "welcome";
        lidarMultiplier = 3.2;
      } else {
        // Continuous scroll choreography interpolation
        const segment = p * (cameraStates.length - 1);
        const index = Math.min(Math.floor(segment), cameraStates.length - 2);
        const t = segment - index;

        // Smooth cubic ease for segment transition
        const smoothT = t * t * (3 - 2 * t);

        const s1 = cameraStates[index];
        const s2 = cameraStates[index + 1];

        targetCamPos = new THREE.Vector3().lerpVectors(s1.camPos, s2.camPos, smoothT);
        targetLookAt = new THREE.Vector3().lerpVectors(s1.lookAt, s2.lookAt, smoothT);
        targetRobotPos = new THREE.Vector3().lerpVectors(s1.robotPos, s2.robotPos, smoothT);
        targetRobotRotY = s1.robotRotY + (s2.robotRotY - s1.robotRotY) * smoothT;
        activeExpression = t < 0.5 ? s1.expression : s2.expression;
      }

      // Parallax camera offset based on pointer
      const parallaxX = pointer.x * 0.25;
      const parallaxY = pointer.y * 0.18;

      currentCamPos.lerp(targetCamPos, isEntering ? 0.08 : 0.06);
      currentLookAt.lerp(targetLookAt, isEntering ? 0.08 : 0.06);
      currentRobotPos.lerp(targetRobotPos, 0.06);
      currentRobotRotY += (targetRobotRotY - currentRobotRotY) * 0.06;

      camera.position.copy(currentCamPos);
      camera.position.x += parallaxX;
      camera.position.y += parallaxY;
      camera.lookAt(currentLookAt);

      robot.group.position.copy(currentRobotPos);
      robot.group.rotation.y = currentRobotRotY;

      // Update robot & environment
      robot.update({
        time,
        delta,
        scrollProgress: p,
        pointer,
        expression: activeExpression,
        lidarSpeedMultiplier: lidarMultiplier,
      });

      environment.update({
        time,
        delta,
        scrollProgress: p,
      });

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 9. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("resize", onResize);

      robot.dispose();
      environment.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [webGLSupported, onWebGLUnavailable]);

  if (!webGLSupported) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
    />
  );
}
