"use client";

import { SceneSection, SectionHeader, SpecList, type SpecItem } from "./motion-primitives";

const TECH_STACK: readonly SpecItem[] = [
  { index: "ALG // 01", title: "A* pathfinding", body: "Exact spatial search with cached distance maps as heuristics." },
  { index: "COORD // 02", title: "Space-time reservations", body: "Time-indexed cell and edge reservations: no overlaps, no swaps." },
  { index: "ORCH // 03", title: "Multi-agent coordination", body: "Prioritised planning with right-of-way by mission urgency." },
  { index: "RESOLV // 04", title: "Deadlock recovery", body: "Wait-for graph cycle detection and deterministic holding moves." },
  { index: "ADAPT // 05", title: "Dynamic replanning", body: "Runtime closures invalidate and replan only affected routes." },
  { index: "CUSTODY // 06", title: "Package custody", body: "Single-owner state machine with atomic handover on failure." },
  { index: "CORE // 07", title: "Deterministic simulation", body: "Command-driven tick engine with replayable event streams." },
  { index: "METRICS // 08", title: "Operational analytics", body: "Throughput, waiting time and fleet utilisation from engine state." },
];

export function TechnologySection() {
  return (
    <SceneSection id="technology">
      <SectionHeader index="06" label="Engineering specification" title={["Engineered to", "move together."]}>
        Deterministic algorithms and safety invariants checked every tick. No heuristics that collapse under dense traffic.
      </SectionHeader>
      <SpecList items={TECH_STACK} className="gap-y-6" />
    </SceneSection>
  );
}
