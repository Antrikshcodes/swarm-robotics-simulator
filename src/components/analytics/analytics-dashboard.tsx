"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bot, Clock3, Route, ShieldCheck, Warehouse } from "lucide-react";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Stat } from "@/components/ui/stat";
import { RobotChip } from "@/components/fleet/robot-chip";
import { useSimulationStore } from "@/store/simulation-store";
import { deliveryBuckets, deliveryCount, filteredMissions, filteredRobots, rangeStart, recoveryWindowCounts, topTrafficCells, type AnalyticsRange, type MissionFilter } from "@/lib/analytics";
import { formatPercent, formatTick } from "@/lib/format";
import type { SimulationSnapshot } from "@/types/simulation";
import { ThroughputChart } from "./throughput-chart";
import { allocation, TimeAllocation } from "./time-allocation";
import { RobotTimelinePanel } from "./robot-timeline-panel";
import { RunArchivePanel } from "./run-archive-panel";

const RANGES: { label: string; value: AnalyticsRange }[] = [
  { label: "Last 100 ticks", value: 100 },
  { label: "Last 500 ticks", value: 500 },
  { label: "Last 2,000 ticks", value: 2000 },
  { label: "All run", value: "all" },
];

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: { label: string; value: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-secondary">
      <span className="label-caps whitespace-nowrap">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-md border border-line-strong bg-surface-sunken px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {children.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function MissionStatus({ state }: { state: string }) {
  const color = state === "completed" ? "text-lime" : state === "cancelled" ? "text-danger" : state === "recovery-required" ? "text-amber" : "text-cyan";
  return <span className={`font-mono text-[10px] uppercase tracking-wide ${color}`}>{state}</span>;
}

export function AnalyticsDashboard() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const scenarioId = useSimulationStore((state) => state.scenarioId);
  const runArchive = useSimulationStore((state) => state.runArchive);
  const archiveCurrentRun = useSimulationStore((state) => state.archiveCurrentRun);
  const clearRunArchive = useSimulationStore((state) => state.clearRunArchive);
  const [range, setRange] = useState<AnalyticsRange>("all");
  const [robotId, setRobotId] = useState("all");
  const [missionStatus, setMissionStatus] = useState<MissionFilter>("all");
  const { tick } = snapshot;
  const start = rangeStart(tick, range);
  const end = tick;
  const missions = useMemo(() => filteredMissions(snapshot.missions, start, end, "all", robotId), [snapshot.missions, start, end, robotId]);
  const visibleMissions = useMemo(() => filteredMissions(snapshot.missions, start, end, missionStatus, robotId), [snapshot.missions, start, end, missionStatus, robotId]);
  const robots = useMemo(() => filteredRobots(snapshot.robots, robotId), [snapshot.robots, robotId]);
  const selectedRobotCount = robots.length;
  const completed = missions.filter((mission) => mission.state === "completed" && mission.completedTick !== null && mission.completedTick >= start && mission.completedTick <= end);
  const cancelled = missions.filter((mission) => mission.state === "cancelled");
  const active = missions.filter((mission) => !["completed", "cancelled"].includes(mission.state));
  const completedInWindow = completed.length;
  const avgDelivery = completed.length ? completed.reduce((sum, mission) => sum + ((mission.completedTick ?? 0) - mission.createdTick), 0) / completed.length : null;
  const deliveries = deliveryCount(snapshot, start, end, robotId);
  const utilization = tick === 0 || selectedRobotCount === 0 ? null : robots.reduce((sum, robot) => sum + robot.stats.busyTicks, 0) / (tick * selectedRobotCount);
  const averageWait = robots.length ? robots.reduce((sum, robot) => sum + robot.stats.waitingTicks, 0) / robots.length : null;
  const bucketSize = range === "all" ? Math.max(25, Math.ceil(Math.max(1, tick) / 40 / 25) * 25) : Math.max(10, Math.ceil(Number(range) / 24 / 10) * 10);
  const buckets = deliveryBuckets(snapshot, start, end, robotId, bucketSize);
  const incidents = recoveryWindowCounts(snapshot, start, end);
  const trafficCells = topTrafficCells(snapshot, start, end);
  const avgRecovery = averageRecoveryTicks(snapshot, start, end);
  const retainedStart = snapshot.events[0]?.tick ?? tick;
  const incompleteWindow = start < retainedStart && snapshot.events.length >= 300;
  const windowLabel = range === "all" ? `Full run · ${formatTick(tick)}` : `${formatTick(start)}–${formatTick(end)}`;

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">Fleet analytics</span>
        <span className="text-text-dim">·</span>
        <span className="font-mono text-xs">{scenarioId} / {windowLabel}</span>
        <DataSourceBadge />
      </PageIntro>

      <Panel>
        <PanelBody className="flex flex-wrap items-end gap-3">
          <Filter label="Time window" value={String(range)} onChange={(value) => setRange(value === "all" ? "all" : Number(value) as AnalyticsRange)}>
            {RANGES.map((option) => ({ label: option.label, value: String(option.value) }))}
          </Filter>
          <Filter label="Robot" value={robotId} onChange={setRobotId}>
            {[{ label: "Entire fleet", value: "all" }, ...snapshot.robots.map((robot) => ({ label: robot.id, value: robot.id }))]}
          </Filter>
          <Filter label="Mission status" value={missionStatus} onChange={(value) => setMissionStatus(value as MissionFilter)}>
            {[{ label: "All statuses", value: "all" }, { label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }]}
          </Filter>
          <span className="ml-auto text-[11px] text-text-dim">Scenario scope: current run · switch scenarios in the top bar</span>
        </PanelBody>
      </Panel>

      {incompleteWindow && <p role="status" className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-amber">Event-derived congestion and recovery detail starts at {formatTick(retainedStart)} because the engine keeps a bounded 300-event operational log. Mission and delivery records remain available for the full run.</p>}

      <Panel>
        <PanelBody className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Missions in window" value={missions.length} hint="Created, completed, or active" icon={<Route />} />
          <Stat label="Completed" value={completedInWindow} tone="lime" hint="Delivered in selected window" icon={<Warehouse />} />
          <Stat label="Failed / cancelled" value={cancelled.length} tone={cancelled.length ? "red" : undefined} hint="Cancelled missions; no failed state exists" icon={<AlertTriangle />} />
          <Stat label="Active" value={active.length} tone="cyan" hint="Includes recovery-required work" icon={<Activity />} />
          <Stat label="Avg delivery time" value={avgDelivery === null ? "—" : avgDelivery.toFixed(1)} unit={avgDelivery === null ? undefined : "ticks"} hint="Creation to completed delivery" icon={<Clock3 />} />
          <Stat label="Throughput" value={deliveries} unit="deliveries" hint={range === "all" ? "Across full run" : "Completed in selected window"} icon={<BarChart3 />} />
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Delivery throughput" description={`Completed missions per ${bucketSize}-tick bucket`} />
          <PanelBody>{tick === 0 ? <Empty>No simulation ticks recorded yet.</Empty> : <ThroughputChart buckets={buckets} />}</PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Fleet health" description="Utilisation uses cumulative busy robot-ticks" icon={<Bot />} />
          <PanelBody className="grid grid-cols-2 gap-5">
            <Stat label="Utilisation" value={utilization === null ? "—" : formatPercent(utilization, 1)} hint="Busy time / elapsed fleet time" />
            <Stat label="Avg waiting" value={averageWait === null ? "—" : averageWait.toFixed(1)} unit="ticks / robot" hint="Cumulative engine counters" />
            <Stat label="Distance" value={robots.reduce((sum, robot) => sum + robot.stats.distance, 0)} unit="cells" hint="Selected fleet total" />
            <Stat label="Congestion events" value={incidents.congestionEvents} hint="Wait and conflict events in retained window" />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Robot activity allocation" description="Moving, handling, waiting, and other time" />
          <PanelBody>{tick === 0 ? <Empty>No activity to allocate yet.</Empty> : <TimeAllocation robots={robots} tick={tick} />}</PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Congestion heatmap · busiest cells" description={`Movement concentration from retained records · ticks ${formatTick(Math.max(start, snapshot.movements[0]?.tick ?? start))}–${formatTick(end)}`} />
          <PanelBody>
            {trafficCells.length === 0 ? <Empty>No movement in this window.</Empty> : <ol className="flex flex-col gap-2">{trafficCells.map((cell, index) => <li key={`${cell.x},${cell.y}`} className="grid grid-cols-[82px_1fr_44px] items-center gap-3 text-xs"><span className="font-mono text-text-secondary">Cell {cell.x},{cell.y}</span><span className="h-2 overflow-hidden rounded bg-surface-sunken"><span className={index < 2 ? "block h-full bg-amber" : "block h-full bg-cyan/70"} style={{ width: `${Math.max(4, (cell.visits / trafficCells[0].visits) * 100)}%` }} /></span><span className="tabular text-right font-mono">{cell.visits}</span></li>)}</ol>}
            <p className="mt-3 text-[10px] text-text-dim">Heat shows cell visits by movement, not blocked time. Movement history is bounded to the latest 400 moves.</p>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Deadlocks and recovery" description="Incident lifecycle counts within the retained history" icon={<ShieldCheck />} />
          <PanelBody className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Stat label="Deadlocks" value={incidents.deadlocks} hint="Detected" />
            <Stat label="Recovered" value={incidents.deadlockRecoveries} tone="lime" hint="Resolved incidents" />
            <Stat label="Robot failures" value={incidents.robotFailures} tone={incidents.robotFailures ? "red" : undefined} hint="Failure records" />
            <Stat label="Robot recoveries" value={incidents.robotRecoveries} tone="lime" hint="Restored robots" />
            <Stat label="Rescue handovers" value={snapshot.recovery.stats.handovers} hint="Cumulative engine counter" />
            <Stat label="Avg recovery time" value={avgRecovery ?? "—"} unit={avgRecovery === null ? undefined : "ticks"} hint="Failure to robot restoration" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Operational event timeline" description="Recent engine events inside the selected window" />
          <PanelBody>
            {snapshot.events.filter((event) => event.tick >= start && event.tick <= end && (robotId === "all" || event.robotId === robotId)).slice(-8).reverse().length === 0
              ? <Empty>No matching operational events.</Empty>
              : <ol className="flex max-h-64 flex-col divide-y divide-line/70 overflow-y-auto">{snapshot.events.filter((event) => event.tick >= start && event.tick <= end && (robotId === "all" || event.robotId === robotId)).slice(-8).reverse().map((event) => <li key={event.id} className="flex gap-3 py-2.5 first:pt-0"><span className="w-12 shrink-0 font-mono text-[10px] text-text-dim">{formatTick(event.tick)}</span><span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">{event.message}</span><span className="shrink-0 font-mono text-[9px] uppercase text-text-dim">{event.kind.replaceAll("_", " ")}</span></li>)}</ol>}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Robot performance comparison" description="Delivery, distance, utilisation, and waiting counters by robot" />
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-wide text-text-dim"><tr><th className="px-4 py-2.5">Robot</th><th className="px-4 py-2.5 text-right">Deliveries</th><th className="px-4 py-2.5 text-right">Distance</th><th className="px-4 py-2.5 text-right">Utilisation</th><th className="px-4 py-2.5 text-right">Waiting</th><th className="px-4 py-2.5 text-right">Missions</th></tr></thead><tbody>{robots.map((robot) => { const activity = allocation(robot, tick); const robotMissions = missions.filter((mission) => mission.robotId === robot.id).length; return <tr key={robot.id} className="border-b border-line/60 last:border-0"><td className="px-4 py-3"><RobotChip id={robot.id} colorIndex={robot.colorIndex} /></td><td className="tabular px-4 py-3 text-right font-mono">{robot.stats.deliveries}</td><td className="tabular px-4 py-3 text-right font-mono">{robot.stats.distance}</td><td className="tabular px-4 py-3 text-right font-mono">{tick ? formatPercent((activity.moving + activity.handling) / tick) : "—"}</td><td className="tabular px-4 py-3 text-right font-mono">{robot.stats.waitingTicks}</td><td className="tabular px-4 py-3 text-right font-mono">{robotMissions}</td></tr>; })}</tbody></table></div>
      </Panel>

      <Panel>
        <PanelHeader title="Mission analysis" description={`${visibleMissions.length} missions · status filter applies to this table`} />
        <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-wide text-text-dim"><tr><th className="px-4 py-2.5">Mission</th><th className="px-4 py-2.5">Robot</th><th className="px-4 py-2.5">Priority</th><th className="px-4 py-2.5">State</th><th className="px-4 py-2.5 text-right">Cycle</th></tr></thead><tbody>{visibleMissions.slice(-12).reverse().map((mission) => <tr key={mission.id} className="border-b border-line/60 last:border-0"><td className="px-4 py-3 font-mono">{mission.id}</td><td className="px-4 py-3 font-mono text-text-secondary">{mission.robotId ?? "—"}</td><td className="px-4 py-3 uppercase text-text-secondary">{mission.priority}</td><td className="px-4 py-3"><MissionStatus state={mission.state} /></td><td className="tabular px-4 py-3 text-right font-mono">{mission.completedTick === null ? "—" : `${mission.completedTick - mission.createdTick}t`}</td></tr>)}</tbody></table></div>
      </Panel>

      <RobotTimelinePanel
        snapshot={snapshot}
        selectedRobotId={robotId}
        onSelectRobot={setRobotId}
      />

      <RunArchivePanel
        snapshot={snapshot}
        archive={runArchive}
        onArchiveCurrent={archiveCurrentRun}
        onClearArchive={clearRunArchive}
      />
    </PageContainer>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-xs text-text-secondary">{children}</div>;
}

function averageRecoveryTicks(snapshot: SimulationSnapshot, start: number, end: number): string | null {
  const restored = snapshot.recovery.failures.filter((failure) => failure.restoredTick !== null && failure.tick >= start && failure.tick <= end);
  if (!restored.length) return null;
  const average = restored.reduce((sum, failure) => sum + ((failure.restoredTick ?? failure.tick) - failure.tick), 0) / restored.length;
  return average.toFixed(1);
}
