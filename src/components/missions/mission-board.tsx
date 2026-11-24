"use client";

import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { isActiveMission } from "@/engine";
import type { Mission, MissionState } from "@/types/simulation";

const CANCELLABLE: ReadonlySet<MissionState> = new Set(["queued", "assigned", "to-pickup"]);
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
import { MISSION_STATE, PACKAGE_STATE } from "@/lib/status";
import { IconButton } from "@/components/ui/icon-button";
import { NewMissionForm } from "./new-mission-form";

type Filter = "all" | "active" | "queued" | "completed" | "recovery";

const MATCH: Record<Filter, (m: Mission) => boolean> = {
  all: () => true,
  active: (m) => isActiveMission(m.state),
  queued: (m) => m.state === "queued",
  completed: (m) => m.state === "completed",
  recovery: (m) => m.state === "recovery-required",
};

/** Active first, then queued, then most recent completions. */
function order(m: Mission): number {
  if (m.state === "recovery-required") return 0;
  if (isActiveMission(m.state)) return 1;
  if (m.state === "queued") return 2;
  return 3;
}

export function MissionBoard() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const [filter, setFilter] = useState<Filter>("all");
  const robotColour = new Map(snapshot.robots.map((r) => [r.id, r.colorIndex]));
  const count = (f: Filter) => snapshot.missions.filter(MATCH[f]).length;
  const avg = averageCycleTicks(snapshot);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const packageById = new Map(snapshot.packages.map((p) => [p.id, p]));

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
          <Stat label="Queued" value={snapshot.metrics.queuedMissions} hint="Waiting for a free robot" />
          <Stat label="Waiting" value={snapshot.metrics.waitingMissions} tone={snapshot.metrics.waitingMissions ? "amber" : undefined} hint="Robot on hold" />
          <Stat label="Delivered" value={snapshot.metrics.completedDeliveries} tone="lime" />
          <Stat label="Avg cycle" value={avg === null ? "—" : avg.toFixed(1)} unit={avg === null ? undefined : "ticks"} hint="Assigned → delivered" />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="New mission"
          description="Queued missions are assigned to the nearest available robot by A* distance on the next tick"
        />
        <PanelBody>
          <NewMissionForm />
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
              <Th>Priority</Th>
              <Th>Package</Th>
              <Th>Robot</Th>
              <Th>Pickup → drop-off</Th>
              <Th>State</Th>
              <Th>Custody</Th>
              <Th className="text-right">Created</Th>
              <Th className="text-right">Picked</Th>
              <Th className="text-right">Delivered</Th>
              <Th className="text-right">Cycle</Th>
              <Th className="w-12"><span className="sr-only">Actions</span></Th>
            </Tr>
          </THead>
          <tbody>
            {missions.length === 0 ? (
              <Tr>
                <Td colSpan={12} className="h-24 text-center text-text-secondary">
                  No missions in this state at {formatTick(snapshot.tick)}.
                </Td>
              </Tr>
            ) : (
              missions.map((m) => {
                const meta = MISSION_STATE[m.state];
                const pkg = packageById.get(m.packageId);
                return (
                  <Tr key={m.id} className="hover:bg-white/[0.02]">
                    <Td className="font-mono font-medium">{m.id}</Td>
                    <Td>
                      {m.priority === "normal" ? (
                        <span className="text-xs text-text-dim">Normal</span>
                      ) : (
                        <StatusBadge tone={m.priority === "urgent" ? "red" : "amber"}>{m.priority === "urgent" ? "Urgent" : "High"}</StatusBadge>
                      )}
                    </Td>
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
                    <Td
                      className="text-text-secondary"
                      title={pkg?.history.map((h) => `${formatTick(h.tick)} ${h.note}`).join("\n")}
                    >
                      {pkg ? (
                        <span className="text-xs">
                          {PACKAGE_STATE[pkg.state].label}
                          {pkg.holderRobotId ? <span className="font-mono text-text-dim"> · {pkg.holderRobotId}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
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
                    <Td>
                      {CANCELLABLE.has(m.state) ? (
                        <IconButton
                          label={`Cancel ${m.id}`}
                          side="left"
                          onClick={() => dispatch({ type: "cancel-mission", missionId: m.id })}
                        >
                          <X />
                        </IconButton>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Panel>

      <PlannedNote mission="Missions 004–006">
        Implemented: the full lifecycle, cancellation before pickup, requeue when a station is blocked by a failed robot,
        and priorities — urgent and high missions are assigned first and their robots get movement priority. Missing:
        deadlines, batching, assignment smarter than nearest robot, and automatic recovery of recovery-required
        missions. The log keeps the latest 200 finished missions; hover a custody cell for the full custody trail.
      </PlannedNote>
    </PageContainer>
  );
}
