"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useSimulationStore } from "@/store/simulation-store";
import { cellRef } from "@/lib/format";
import { resolveSelection, selectionKey, type Inspected } from "@/lib/inspection";
import { STATION_KIND } from "@/lib/status";
import { BlockInspector } from "./inspector/entity-inspectors";
import { FleetInspector } from "./inspector/fleet-inspector";
import { RobotInspector } from "./inspector/robot-inspector";
import { CellInspector, StationInspector } from "./inspector/station-cell-inspector";

/** Header label for the inspected entity kind. */
function kindLabel(item: Inspected): string {
  switch (item.kind) {
    case "robot":
      return "Robot";
    case "station":
      return `${STATION_KIND[item.data.station.kind].label} station`;
    case "rack":
      return "Rack block";
    case "obstacle":
      return "Obstacle";
    case "cell":
      return item.data.narrow ? "Narrow aisle" : item.data.openByLayout ? "Aisle cell" : "Cell";
  }
}

/**
 * The Simulation Studio inspector. One panel for every warehouse entity —
 * robot, rack block, obstacle, station or aisle cell — shared by the 2D and
 * 3D views (both write the same selection). With nothing selected it shows
 * the fleet overview.
 */
export function Inspector() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);
  const item = resolveSelection(snapshot, selection, cellRef);
  const key = item ? selectionKey(selection) : "fleet";

  let body: ReactNode;
  if (item?.kind === "robot") body = <RobotInspector robot={item.data.robot} snapshot={snapshot} />;
  else if (item?.kind === "station") body = <StationInspector data={item.data} snapshot={snapshot} />;
  else if (item?.kind === "rack" || item?.kind === "obstacle") body = <BlockInspector data={item.data} snapshot={snapshot} />;
  else if (item?.kind === "cell") body = <CellInspector data={item.data} snapshot={snapshot} />;
  else body = <FleetInspector snapshot={snapshot} />;

  return (
    <aside aria-label="Inspector" className="flex min-h-0 flex-col border-line bg-sidebar/60 lg:w-[320px] lg:border-l">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="flex min-w-0 items-center gap-2">
          <span className="label-caps">Inspector</span>
          {item ? (
            <span aria-live="polite" className="truncate font-mono text-[10.5px] tracking-[0.12em] text-lime uppercase">
              · {kindLabel(item)}
            </span>
          ) : null}
        </span>
        {selection ? (
          <IconButton label="Clear selection" shortcut="Esc" side="left" onClick={() => select(null)}>
            <X />
          </IconButton>
        ) : null}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {/* Enter-only transition: the new entity renders immediately (no wait for an exit). */}
        <motion.div key={key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.14, ease: [0.2, 0.7, 0.2, 1] }}>
          {body}
        </motion.div>
      </div>
    </aside>
  );
}
