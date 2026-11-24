"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowUp, Crosshair, Package } from "lucide-react";
import { FLEET_FILTERS, fleetSummary, type FleetFilter } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/data-table";
import { IconButton } from "@/components/ui/icon-button";
import { PlannedNote } from "@/components/ui/planned-note";
import { Stat } from "@/components/ui/stat";
import { usePreferences } from "@/store/preferences-store";
import { useCamera3D } from "@/components/simulation/scene3d/camera-store";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { cellRef, formatPercent, formatTick, HEADING_DEGREES, HEADING_LABEL } from "@/lib/format";
import { ROBOT_STATUS } from "@/lib/status";
import { robotUtilisation } from "@/lib/selectors";
import { RobotChip } from "./robot-chip";
import { BatteryMeter } from "./battery-meter";

// Face cards render live 3D portraits (Three.js): load on the client only.
const FleetFaceGrid = dynamic(() => import("./fleet-face-grid"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-lg border border-white/[0.08] bg-[#121A1E] font-mono text-[11px] tracking-[0.16em] text-[#5d6b71] uppercase">
      Loading fleet portraits…
    </div>
  ),
});

type FleetView = "cards" | "table";

const FILTER_LABELS: Record<FleetFilter, string> = {
  all: "All",
  active: "Active",
  idle: "Idle",
  waiting: "Waiting",
  blocked: "Blocked",
  failed: "Failed",
};

export function FleetRoster() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);
  const router = useRouter();
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [view, setView] = useState<FleetView>("cards");

  const robots = snapshot.robots.filter(FLEET_FILTERS[filter]);
  const count = (f: FleetFilter) => snapshot.robots.filter(FLEET_FILTERS[f]).length;
  const summary = fleetSummary(snapshot.robots);

  const inspect = (id: string) => {
    const robot = snapshot.robots.find((r) => r.id === id);
    select({ kind: "robot", id });
    if (robot) useViewportStore.getState().centerOn(robot.position.x, robot.position.y);
    if (usePreferences.getState().studioView === "3d") useCamera3D.getState().setPreset("follow", id);
    router.push("/simulation");
  };

  const filterTabs = (
    <FilterTabs
      label="Filter robots by status"
      value={filter}
      onChange={setFilter}
      options={(Object.keys(FILTER_LABELS) as FleetFilter[]).map((f) => ({ value: f, label: FILTER_LABELS[f], count: count(f) }))}
    />
  );

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">{snapshot.robots.length} robots</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(snapshot.tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Panel className="p-4">
          <Stat label="Total robots" value={summary.total} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Active" value={summary.active} tone={summary.active ? "lime" : undefined} hint="Moving, carrying or handling" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Idle" value={summary.idle} hint="Parked or charging" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Needs attention" value={summary.attention} tone={summary.attention ? "red" : undefined} hint="Failed, blocked or deadlocked" />
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {filterTabs}
        <div role="radiogroup" aria-label="Fleet view" className="flex h-8 items-center rounded-md border border-line p-0.5 font-mono text-[10.5px] tracking-[0.12em] uppercase">
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-7 rounded px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === v ? "bg-white/[0.08] text-foreground" : "text-text-secondary hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "cards" ? <FleetFaceGrid filter={filter} /> : null}

      {view === "table" ? (
      <Panel>
        <PanelHeader
          title="Robot roster"
          description="Live state from the current scenario. Select a row to highlight the robot in Simulation Studio."
        />
        <Table className="min-w-[1240px]">
          <THead>
            <Tr>
              <Th>Robot</Th>
              <Th>Model</Th>
              <Th>Status</Th>
              <Th className="text-right">Priority</Th>
              <Th>Waiting for</Th>
              <Th>Cell</Th>
              <Th>Heading</Th>
              <Th>Mission</Th>
              <Th>Payload</Th>
              <Th>Battery</Th>
              <Th className="text-right">Distance</Th>
              <Th className="text-right">Deliveries</Th>
              <Th className="text-right">Utilisation</Th>
              <Th className="w-12"><span className="sr-only">Actions</span></Th>
            </Tr>
          </THead>
          <tbody>
            {robots.length === 0 ? (
              <Tr>
                <Td colSpan={14} className="h-24 text-center text-text-secondary">
                  No robots match this filter at {formatTick(snapshot.tick)}.
                </Td>
              </Tr>
            ) : (
              robots.map((robot) => {
                const status = ROBOT_STATUS[robot.status];
                const selected = selection?.kind === "robot" && selection.id === robot.id;
                return (
                  <Tr
                    key={robot.id}
                    aria-selected={selected}
                    onClick={() => select({ kind: "robot", id: robot.id })}
                    className="cursor-pointer hover:bg-white/[0.025] aria-selected:bg-lime/[0.05]"
                  >
                    <Td>
                      <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
                    </Td>
                    <Td className="font-mono text-text-secondary">{robot.model}</Td>
                    <Td>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </Td>
                    <Td className="tabular text-right font-mono">{robot.priority}</Td>
                    <Td className="font-mono text-amber">{robot.waitingFor ?? <span className="text-text-dim">—</span>}</Td>
                    <Td className="tabular font-mono">
                      {cellRef(robot.position)} <span className="text-text-dim">({robot.position.x},{robot.position.y})</span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <ArrowUp className="size-3" style={{ transform: `rotate(${HEADING_DEGREES[robot.heading]}deg)` }} />
                        {HEADING_LABEL[robot.heading]}
                      </span>
                    </Td>
                    <Td className="font-mono">{robot.missionId ?? <span className="text-text-dim">—</span>}</Td>
                    <Td className="font-mono">
                      {robot.packageId ? (
                        <span className="inline-flex items-center gap-1 text-amber">
                          <Package className="size-3" /> {robot.packageId}
                        </span>
                      ) : (
                        <span className="text-text-dim">Empty</span>
                      )}
                    </Td>
                    <Td>
                      <BatteryMeter value={robot.battery} />
                    </Td>
                    <Td className="tabular text-right font-mono">{robot.stats.distance}</Td>
                    <Td className="tabular text-right font-mono">{robot.stats.deliveries}</Td>
                    <Td className="tabular text-right font-mono">{formatPercent(robotUtilisation(robot, snapshot.tick))}</Td>
                    <Td>
                      <IconButton
                        label={`Inspect ${robot.id} in Simulation Studio`}
                        side="left"
                        onClick={(event) => {
                          event.stopPropagation();
                          inspect(robot.id);
                        }}
                      >
                        <Crosshair />
                      </IconButton>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Panel>
      ) : null}

      <PlannedNote mission="Mission 005">
        Portraits use the same 3D robot model as the Simulation Studio. Mode and connectivity are derived from engine
        state (a robot halted by a communication failure shows Link lost). Fail or restore robots from the Simulation
        Studio inspector. Battery uses a simplified drain / charge model.
      </PlannedNote>
    </PageContainer>
  );
}
