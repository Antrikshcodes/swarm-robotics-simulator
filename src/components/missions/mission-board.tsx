"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Mission, MissionState } from "@/types/simulation";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stat } from "@/components/ui/stat";
import { Table, Td, Th, THead, Tr } from "@/components/ui/data-table";
import { PlannedNote } from "@/components/ui/planned-note";
import { RobotChip } from "@/components/fleet/robot-chip";
import { useSimulationStore } from "@/store/simulation-store";
import { averageCycleTicks } from "@/lib/selectors";
import { formatTick } from "@/lib/format";
import { MISSION_STATE } from "@/lib/status";

type Filter = "all" | "active" | "queued" | "completed" | "recovery";

const ACTIVE: ReadonlySet<MissionState> = new Set(["assigned", "to-pickup", "carrying"]);

const MATCH: Record<Filter, (m: Mission) => boolean> = {
  all: () => true,
  active: (m) => ACTIVE.has(m.state),
  queued: (m) => m.state === "queued",
  completed: (m) => m.state === "completed",
  recovery: (m) => m.state === "recovery-required",
};

/** Active first, then queued, then most recent completions. */
function order(m: Mission): number {
  if (m.state === "recovery-required") return 0;
  if (ACTIVE.has(m.state)) return 1;
  if (m.state === "queued") return 2;
  return 3;
}

export function MissionBoard() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const [filter, setFilter] = useState<Filter>("all");
  const robotColour = new Map(snapshot.robots.map((r) => [r.id, r.colorIndex]));
  const count = (f: Filter) => snapshot.missions.filter(MATCH[f]).length;
  const avg = averageCycleTicks(snapshot);

  const missions = snapshot.missions
    .filter(MATCH[filter])
    .sort((a, b) => order(a) - order(b) || (b.completedTick ?? b.createdTick) - (a.completedTick ?? a.createdTick));

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">{snapshot.missions.length} missions tracked</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(snapshot.tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      <Panel>
        <PanelBody className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
          <Stat label="Active" value={snapshot.metrics.activeMissions} tone="cyan" />
          <Stat label="Queued" value={snapshot.metrics.queuedMissions} hint="Awaiting a scheduler" />
          <Stat label="Waiting" value={snapshot.metrics.waitingMissions} tone={snapshot.metrics.waitingMissions ? "amber" : undefined} hint="Robot on hold" />
          <Stat label="Delivered" value={snapshot.metrics.completedDeliveries} tone="lime" />
          <Stat label="Avg cycle" value={avg === null ? "—" : avg.toFixed(1)} unit={avg === null ? undefined : "ticks"} hint="Assigned → delivered" />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Mission log"
          description="Pickup → drop-off jobs and their lifecycle state"
          actions={
            <FilterTabs
              label="Filter missions by state"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: count("all") },
                { value: "active", label: "Active", count: count("active") },
                { value: "queued", label: "Queued", count: count("queued") },
                { value: "completed", label: "Completed", count: count("completed") },
                { value: "recovery", label: "Recovery", count: count("recovery") },
              ]}
            />
          }
        />
        <Table className="min-w-[960px]">
          <THead>
            <Tr>
              <Th>Mission</Th>
              <Th>Package</Th>
              <Th>Robot</Th>
              <Th>Pickup → drop-off</Th>
              <Th>State</Th>
              <Th className="text-right">Created</Th>
              <Th className="text-right">Picked</Th>
              <Th className="text-right">Delivered</Th>
              <Th className="text-right">Cycle</Th>
            </Tr>
          </THead>
          <tbody>
            {missions.length === 0 ? (
              <Tr>
                <Td colSpan={9} className="h-24 text-center text-text-secondary">
                  No missions in this state at {formatTick(snapshot.tick)}.
                </Td>
              </Tr>
            ) : (
              missions.map((m) => {
                const meta = MISSION_STATE[m.state];
                return (
                  <Tr key={m.id} className="hover:bg-white/[0.02]">
                    <Td className="font-mono font-medium">{m.id}</Td>
                    <Td className="font-mono text-text-secondary">{m.packageId}</Td>
                    <Td>
                      {m.robotId ? (
                        <RobotChip id={m.robotId} colorIndex={robotColour.get(m.robotId) ?? 1} />
                      ) : (
                        <span className="text-text-dim">Unassigned</span>
                      )}
                    </Td>
                    <Td className="font-mono">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-cyan">{m.pickupStationId}</span>
                        <ArrowRight className="size-3 text-text-dim" />
                        <span className="text-lime">{m.dropoffStationId}</span>
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </Td>
                    <Td className="tabular text-right font-mono text-text-secondary">{formatTick(m.createdTick)}</Td>
                    <Td className="tabular text-right font-mono text-text-secondary">
                      {m.pickedTick === null ? "—" : formatTick(m.pickedTick)}
                    </Td>
                    <Td className="tabular text-right font-mono text-text-secondary">
                      {m.completedTick === null ? "—" : formatTick(m.completedTick)}
                    </Td>
                    <Td className="tabular text-right font-mono">
                      {m.completedTick === null ? "—" : `${m.completedTick - m.createdTick}`}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Panel>

      <PlannedNote mission="Mission 003">
        Missions are currently generated by each robot&apos;s scripted loop. Queued backlog jobs stay queued because no
        scheduler exists yet. Live mission creation, assignment and A* routing arrive in Mission 003. The log keeps the
        latest 120 completed missions.
      </PlannedNote>
    </PageContainer>
  );
}
