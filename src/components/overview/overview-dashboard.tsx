"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BatteryWarning,
  Bot,
  CheckCircle2,
  Clock,
  Hourglass,
  ListTodo,
  OctagonAlert,
  Pause,
  Play,
  PowerOff,
  Route,
} from "lucide-react";
import { getScenario } from "@/engine";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { WarehousePreview } from "@/components/simulation/warehouse-preview";
import { EventFeed } from "@/components/simulation/event-feed";
import { RobotChip } from "@/components/fleet/robot-chip";
import { BatteryMeter } from "@/components/fleet/battery-meter";
import { useSimulationStore } from "@/store/simulation-store";
import { deriveIncidents, robotUtilisation } from "@/lib/selectors";
import { formatPercent, formatTick } from "@/lib/format";
import { ROBOT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export function OverviewDashboard() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const status = useSimulationStore((s) => s.status);
  const togglePlayback = useSimulationStore((s) => s.togglePlayback);
  const scenario = getScenario(snapshot.scenarioId);
  const m = snapshot.metrics;
  const incidents = deriveIncidents(snapshot).filter((i) => i.open);

  return (
    <PageContainer>
      <PageIntro
        actions={
          <>
            <Button variant="outline" size="sm" onClick={togglePlayback} className="border-line">
              {status === "running" ? <Pause /> : <Play />}
              {status === "running" ? "Pause" : status === "ready" ? "Start demo" : "Resume"}
            </Button>
            <Button asChild size="sm">
              <Link href="/simulation">
                Open Simulation Studio
                <ArrowUpRight />
              </Link>
            </Button>
          </>
        }
      >
        <span className="text-foreground">{scenario.name}</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(snapshot.tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      {/* KPI panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Fleet" icon={<Bot />} description={`${m.totalRobots} robots registered in this scenario`} />
          <PanelBody className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label="Total robots" value={m.totalRobots} icon={<Bot />} />
            <Stat label="Active" value={m.activeRobots} tone="cyan" icon={<Activity />} hint="Moving, handling or holding" />
            <Stat label="Idle" value={m.idleRobots} icon={<Clock />} hint="Parked or charging" />
            <Stat label="Failed" value={m.faultedRobots} tone={m.faultedRobots ? "red" : undefined} icon={<PowerOff />} hint="Halted by fault" />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Missions" icon={<Route />} description="Pickup → drop-off jobs" />
          <PanelBody className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label="Active" value={m.activeMissions} tone="cyan" icon={<Activity />} hint="To pickup or carrying" />
            <Stat label="Pending" value={m.queuedMissions} icon={<ListTodo />} hint="Queued · no scheduler yet" />
            <Stat label="Delivered" value={m.completedDeliveries} tone="lime" icon={<CheckCircle2 />} hint="Since tick 0" />
            <Stat label="Waiting" value={m.waitingMissions} tone={m.waitingMissions ? "amber" : undefined} icon={<Hourglass />} hint="Robot on hold" />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Warehouse preview */}
        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader
            title="Warehouse preview"
            description={`${snapshot.layout.width} × ${snapshot.layout.height} grid · ${snapshot.layout.stations.length} stations`}
            actions={
              <Button asChild variant="ghost" size="sm" className="text-text-secondary">
                <Link href="/simulation">
                  Inspect
                  <ArrowUpRight />
                </Link>
              </Button>
            }
          />
          <Link
            href="/simulation"
            aria-label="Open the warehouse in Simulation Studio"
            className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <WarehousePreview
              className="h-[300px] bg-background"
              label={`Live preview of ${scenario.name}: ${m.totalRobots} robots at tick ${snapshot.tick}`}
            />
          </Link>
          <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-text-secondary">{scenario.focus}</p>
        </Panel>

        {/* Alerts */}
        <Panel className="flex flex-col">
          <PanelHeader
            title="Active alerts"
            icon={<AlertTriangle />}
            description={incidents.length ? `${incidents.length} open` : "Nothing needs attention"}
            actions={
              <Button asChild variant="ghost" size="sm" className="text-text-secondary">
                <Link href="/incidents">All incidents</Link>
              </Button>
            }
          />
          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {incidents.length === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-text-secondary">
                No open faults, holds or low-battery robots at {formatTick(snapshot.tick)}.
              </li>
            ) : (
              incidents.map((incident) => (
                <li key={incident.id} className="flex gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5",
                      incident.severity === "critical" ? "bg-danger/12 text-danger" : "bg-amber/12 text-amber",
                    )}
                  >
                    {incident.kind === "robot-fault" ? (
                      <OctagonAlert />
                    ) : incident.kind === "low-battery" ? (
                      <BatteryWarning />
                    ) : (
                      <Hourglass />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">{incident.title}</span>
                      <span className="tabular font-mono text-[10.5px] text-text-dim">{formatTick(incident.openedTick)}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-text-secondary">{incident.detail}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Fleet activity */}
        <Panel>
          <PanelHeader
            title="Fleet activity"
            icon={<Activity />}
            description={`Fleet utilisation ${formatPercent(m.utilisation)} · busy robot-ticks ÷ elapsed robot-ticks`}
            actions={
              <Button asChild variant="ghost" size="sm" className="text-text-secondary">
                <Link href="/fleet">Fleet</Link>
              </Button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead>
                <tr className="border-b border-line text-text-dim">
                  <th className="label-caps px-4 py-2.5 font-medium">Robot</th>
                  <th className="label-caps px-2 py-2.5 font-medium">Status</th>
                  <th className="label-caps px-2 py-2.5 font-medium">Mission</th>
                  <th className="label-caps px-2 py-2.5 font-medium">Battery</th>
                  <th className="label-caps px-4 py-2.5 text-right font-medium">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.robots.map((robot) => {
                  const status = ROBOT_STATUS[robot.status];
                  const util = robotUtilisation(robot, snapshot.tick);
                  return (
                    <tr key={robot.id} className="border-b border-line/50 last:border-b-0">
                      <td className="px-4 py-2.5">
                        <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-text-secondary">
                        {robot.missionId ?? <span className="text-text-dim">—</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <BatteryMeter value={robot.battery} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2.5">
                          <span className="h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                            <span className="block h-full rounded-full bg-cyan/80" style={{ width: `${util * 100}%` }} />
                          </span>
                          <span className="tabular w-9 text-right font-mono text-[11px] text-text-secondary">
                            {formatPercent(util)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Events */}
        <Panel className="flex max-h-[420px] flex-col">
          <PanelHeader title="Recent events" icon={<Clock />} description={`${snapshot.events.length} in buffer`} />
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <EventFeed events={snapshot.events} limit={14} />
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
