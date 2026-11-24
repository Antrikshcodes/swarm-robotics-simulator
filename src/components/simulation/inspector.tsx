"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useSimulationStore } from "@/store/simulation-store";
import { findRobot, findStation } from "@/lib/selectors";
import { FleetInspector } from "./inspector/fleet-inspector";
import { RobotInspector } from "./inspector/robot-inspector";
import { CellInspector, StationInspector } from "./inspector/station-cell-inspector";

export function Inspector() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);

  let body: ReactNode;
  if (selection?.kind === "robot") {
    const robot = findRobot(snapshot, selection.id);
    body = robot ? <RobotInspector robot={robot} snapshot={snapshot} /> : null;
  } else if (selection?.kind === "station") {
    const station = findStation(snapshot, selection.id);
    body = station ? <StationInspector station={station} snapshot={snapshot} /> : null;
  } else if (selection?.kind === "cell") {
    body = <CellInspector x={selection.x} y={selection.y} snapshot={snapshot} />;
  }

  return (
    <aside aria-label="Inspector" className="flex min-h-0 flex-col border-line bg-sidebar/60 lg:w-[320px] lg:border-l">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="label-caps">Inspector</span>
        {selection ? (
          <IconButton label="Clear selection" shortcut="Esc" side="left" onClick={() => select(null)}>
            <X />
          </IconButton>
        ) : null}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {body ?? <FleetInspector snapshot={snapshot} />}
      </div>
    </aside>
  );
}
