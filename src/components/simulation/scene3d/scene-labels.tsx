"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { RobotState, SimulationSnapshot } from "@/types/simulation";
import { frameOf, gridToWorld } from "@/lib/scene3d/grid-to-world";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { robotPoses } from "./robot-fleet";

/**
 * Robot and station labels for the 3D view, drawn as plain DOM elements in a
 * single overlay layer and positioned every rendered frame by projecting the
 * robots' live poses. Unlike one drei <Html> per object (each its own React
 * root, mounted and unmounted with the object), this never creates or tears
 * down React roots when robots or scenarios change.
 */
export function SceneLabels({ layer }: { layer: RefObject<HTMLDivElement | null> }) {
  const nodes = useRef(new Map<string, { el: HTMLDivElement; key: string }>());
  const v = useRef(new THREE.Vector3());

  // Remove every label when the 3D view unmounts.
  useEffect(() => {
    const map = nodes.current;
    return () => {
      for (const { el } of map.values()) el.remove();
      map.clear();
    };
  }, []);

  useFrame((state) => {
    const host = layer.current;
    if (!host) return;
    const map = nodes.current;
    const show = usePreferences.getState().showLabels;
    const sim = useSimulationStore.getState();
    const { snapshot } = sim;
    const frame = frameOf(snapshot.layout);
    const { width, height } = state.size;
    const seen = new Set<string>();
    const selectedId = sim.selection?.kind === "robot" ? sim.selection.id : null;

    const place = (id: string, x: number, y: number, z: number, render: () => { key: string; html: string; state?: string; className: string }) => {
      seen.add(id);
      let entry = map.get(id);
      if (!entry) {
        const el = document.createElement("div");
        host.appendChild(el);
        entry = { el, key: "" };
        map.set(id, entry);
      }
      const p = v.current.set(x, y, z).project(state.camera);
      const visible = show && p.z < 1 && p.z > -1;
      entry.el.style.display = visible ? "" : "none";
      if (!visible) return;
      entry.el.style.transform = `translate3d(${((p.x + 1) / 2) * width}px, ${((1 - p.y) / 2) * height}px, 0) translate(-50%, -100%)`;
      const r = render();
      if (r.key !== entry.key) {
        entry.key = r.key;
        entry.el.className = r.className;
        entry.el.innerHTML = r.html;
        if (r.state) entry.el.dataset.state = r.state;
        else delete entry.el.dataset.state;
      }
    };

    for (const robot of snapshot.robots) {
      const pose = robotPoses.get(robot.id);
      if (!pose) continue;
      place(`robot:${robot.id}`, pose.x, 0.95, pose.z, () => robotLabel(robot, selectedId === robot.id));
    }
    for (const s of snapshot.layout.stations) {
      const w = gridToWorld(frame, s.position.x, s.position.y);
      place(`station:${s.id}`, w.x - 0.42, 1.38, w.z - 0.42, () => stationLabel(s.id, s.kind));
    }
    // Drop labels whose robot or station no longer exists (scenario switched).
    for (const [id, entry] of map) {
      if (!seen.has(id)) {
        entry.el.remove();
        map.delete(id);
      }
    }
  });

  return null;
}

const ROBOT_CLASS =
  "pointer-events-none absolute top-0 left-0 flex items-center gap-1 rounded-sm border border-white/15 bg-[#0b1013]/85 px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap text-[#f2f4f3] data-[state=deadlock]:border-[#f06464] data-[state=failed]:border-[#f06464] data-[state=selected]:border-[#b7f34a] data-[state=waiting]:border-[#f5b942]";

function robotLabel(robot: RobotState, selected: boolean) {
  const tag =
    robot.status === "failed" ? "FAILED" : robot.status === "recovering" ? "RESTORING" : robot.waitClass === "deadlock" ? "DEADLOCK" : robot.status === "waiting" ? "WAIT" : "";
  const state = robot.status === "failed" ? "failed" : robot.waitClass === "deadlock" ? "deadlock" : robot.status === "waiting" ? "waiting" : selected ? "selected" : undefined;
  const accent = `var(--robot-${((robot.colorIndex - 1 + 8) % 8) + 1})`;
  return {
    key: `${robot.id}|${tag}|${state ?? ""}`,
    state,
    className: ROBOT_CLASS,
    html: `<span style="width:6px;height:6px;border-radius:9999px;background:${accent}"></span>${robot.id}${
      tag ? `<span style="font-size:9.5px;color:#f5b942">${tag}</span>` : ""
    }`,
  };
}

function stationLabel(id: string, kind: SimulationSnapshot["layout"]["stations"][number]["kind"]) {
  const color = kind === "pickup" ? "#40c8e8" : kind === "dropoff" ? "#b7f34a" : "#c8d2d8";
  return {
    key: id,
    className: "pointer-events-none absolute top-0 left-0 rounded-sm bg-[#0b1013]/80 px-1 font-mono text-[10px] font-semibold whitespace-nowrap",
    html: `<span style="color:${color}">${id}</span>`,
  };
}
