"use client";

import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { SimulationSnapshot } from "@/types/simulation";
import { frameOf, gridToWorld } from "@/lib/scene3d/grid-to-world";
import { ndcToViewport, robotLabelMeta, stationColorForKind } from "@/lib/scene3d/projection";
import { useSimulationStore } from "@/store/simulation-store";
import { robotPoses } from "./robot-fleet";

export type LabelElementMap = Map<string, HTMLDivElement>;

interface SceneLabelsProps {
  snapshot: SimulationSnapshot;
  palette: readonly string[];
  selectedRobotId: string | null;
  showLabels: boolean;
  labelEls: MutableRefObject<LabelElementMap>;
}

/**
 * Projected 2D overlay badges rendered natively inside the Simulation Studio
 * DOM tree instead of `@react-three/drei` `<Html>` portals (avoiding React 19
 * nested-root `removeChild` errors during scenario swaps and unmounts).
 */
export function SceneLabels({ snapshot, palette, selectedRobotId, showLabels, labelEls }: SceneLabelsProps) {
  if (!showLabels) return null;

  const setRef = (key: string) => (el: HTMLDivElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {snapshot.layout.stations.map((station) => {
        const color = stationColorForKind(station.kind);
        return (
          <div
            key={`${snapshot.scenarioId}:station:${station.id}`}
            ref={setRef(`station:${station.id}`)}
            style={{ opacity: 0, willChange: "transform" }}
            className="absolute top-0 left-0 z-10 rounded-sm bg-[#0b1013]/80 px-1 font-mono text-[10px] font-semibold whitespace-nowrap"
          >
            <span style={{ color }}>{station.id}</span>
          </div>
        );
      })}

      {snapshot.robots.map((robot) => {
        const accent = palette[(robot.colorIndex - 1 + palette.length) % palette.length];
        const { state, tag } = robotLabelMeta(robot, selectedRobotId === robot.id);
        return (
          <div
            key={`${snapshot.scenarioId}:robot:${robot.id}`}
            ref={setRef(`robot:${robot.id}`)}
            data-state={state}
            style={{ opacity: 0, willChange: "transform" }}
            className="absolute top-0 left-0 z-20 flex items-center gap-1 rounded-sm border border-white/15 bg-[#0b1013]/85 px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap text-[#f2f4f3] data-[state=deadlock]:border-[#f06464] data-[state=failed]:border-[#f06464] data-[state=selected]:border-[#b7f34a] data-[state=waiting]:border-[#f5b942]"
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} />
            {robot.id}
            {tag ? <span className="text-[9.5px] text-[#f5b942]">{tag}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Projects station & robot 3D anchors into CSS `translate3d` positions every rendered frame. */
export function LabelProjector({
  showLabels,
  labelEls,
}: {
  showLabels: boolean;
  labelEls: MutableRefObject<LabelElementMap>;
}) {
  const scratch = useRef(new THREE.Vector3());
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (showLabels) invalidate();
  }, [showLabels, invalidate]);

  useFrame(({ camera, size }) => {
    if (!showLabels || labelEls.current.size === 0) return;

    const snapshot = useSimulationStore.getState().snapshot;
    const frame = frameOf(snapshot.layout);
    const vec = scratch.current;

    const place = (key: string, wx: number, wy: number, wz: number) => {
      const el = labelEls.current.get(key);
      if (!el) return;
      vec.set(wx, wy, wz).project(camera);
      const { x, y, visible } = ndcToViewport(vec.x, vec.y, vec.z, size.width, size.height);
      if (!visible) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    };

    for (const s of snapshot.layout.stations) {
      const w = gridToWorld(frame, s.position.x, s.position.y);
      place(`station:${s.id}`, w.x - 0.42, 1.38, w.z - 0.42);
    }

    for (const r of snapshot.robots) {
      const pose = robotPoses.get(r.id);
      if (pose) {
        place(`robot:${r.id}`, pose.x, 0.95, pose.z);
      } else {
        const w = gridToWorld(frame, r.position.x, r.position.y);
        place(`robot:${r.id}`, w.x, 0.95, w.z);
      }
    }
  });

  return null;
}
