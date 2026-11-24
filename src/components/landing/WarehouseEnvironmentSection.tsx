"use client";

import { DataStrip, SceneSection, SectionHeader, SpecList, type SpecItem } from "./motion-primitives";

const WAREHOUSE_METRICS: readonly SpecItem[] = [
  {
    index: "01",
    title: "Space-time horizon",
    value: "48 ticks",
    body: "Windowed cooperative search over a shared cell-time reservation table.",
    accent: "#40C8E8",
  },
  {
    index: "02",
    title: "Decision latency",
    value: "< 2.5 ms",
    body: "Exact distance-map heuristic with incremental replanning on blockage.",
    accent: "#B7F34A",
  },
  {
    index: "03",
    title: "Topology changes",
    value: "Dynamic",
    body: "Aisle closures invalidate only the affected routes — no simulation reset.",
    accent: "#40C8E8",
  },
  {
    index: "04",
    title: "Safety invariants",
    value: "Every tick",
    body: "No shared cells and no head-on swaps, checked after every simulation step.",
    accent: "#B7F34A",
  },
];

export function WarehouseEnvironmentSection() {
  return (
    <SceneSection id="warehouse-scale">
      <SectionHeader index="03" label="The warehouse scale" title={["One arena.", "Thousands of moves."]}>
        When independent robots share high-density corridors, uncoordinated navigation creates cascading gridlock. SWARM
        organises every move through synchronised space-time reservations.
      </SectionHeader>
      <DataStrip
        className="mb-10"
        cells={[
          { value: "Cooperative arena", dot: "#40C8E8" },
          { label: "Grid", value: "Space-time reservations" },
          { label: "Status", value: "Active", tone: "#B7F34A" },
        ]}
      />
      <SpecList items={WAREHOUSE_METRICS} />
    </SceneSection>
  );
}
