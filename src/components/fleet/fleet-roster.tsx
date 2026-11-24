"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Crosshair, Package } from "lucide-react";
import type { RobotStatus } from "@/types/simulation";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/data-table";
import { IconButton } from "@/components/ui/icon-button";
import { PlannedNote } from "@/components/ui/planned-note";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { cellRef, formatPercent, formatTick, HEADING_DEGREES, HEADING_LABEL } from "@/lib/format";
import { ROBOT_STATUS } from "@/lib/status";
import { robotUtilisation } from "@/lib/selectors";
import { RobotChip } from "./robot-chip";
import { BatteryMeter } from "./battery-meter";

type Filter = "all" | "working" | "waiting" | "idle" | "failed";

const MATCH: Record<Filter, (s: RobotStatus) => boolean> = {
  all: () => true,
  working: (s) => s === "moving" || s === "carrying" || s === "loading" || s === "unloading",
  waiting: (s) => s === "waiting",
  idle: (s) => s === "idle" || s === "charging",
  failed: (s) => s === "failed" || s === "recovering",
};

export function FleetRoster() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const robots = snapshot.robots.filter((r) => MATCH[filter](r.status));
  const count = (f: Filter) => snapshot.robots.filter((r) => MATCH[f](r.status)).length;

  const inspect = (id: string) => {
    const robot = snapshot.robots.find((r) => r.id === id);
    select({ kind: "robot", id });
    if (robot) useViewportStore.getState().centerOn(robot.position.x, robot.position.y);
    router.push("/simulation");
  };

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">{snapshot.robots.length} robots</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(snapshot.tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      <Panel>
        <PanelHeader
          title="Robot roster"
          description="Live state from the current scenario. Select a row to highlight the robot in Simulation Studio."
          actions={
            <FilterTabs
              label="Filter robots by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: count("all") },
                { value: "working", label: "Working", count: count("working") },
                { value: "waiting", label: "Waiting", count: count("waiting") },
                { value: "idle", label: "Idle", count: count("idle") },
                { value: "failed", label: "Failed", count: count("failed") },
              ]}
            />
          }
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

      <PlannedNote mission="Mission 006">
        Recovery actions — returning a failed robot to service and transferring its package custody — arrive with
        the recovery manager. Today you can mark a robot failed from the Simulation Studio inspector. Battery uses a
        simplified drain / charge model.
      </PlannedNote>
    </PageContainer>
  );
}
