"use client";

import { useMemo } from "react";
import { Check, CircleAlert, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { SCENARIOS } from "@/engine";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { WarehousePreview } from "@/components/simulation/warehouse-preview";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { useSimulationStore } from "@/store/simulation-store";
import { deriveIncidents } from "@/lib/selectors";
import { formatTick } from "@/lib/format";

const DEMOS = [
  { id: "standard", code: "A", title: "Normal warehouse operations", focus: "Concurrent pickup and delivery work across a seeded fleet." },
  { id: "narrow-aisle", code: "B", title: "Narrow aisle conflict", focus: "Opposing traffic competes for a constrained passage under reservations." },
  { id: "lab-a-two-robot", code: "C", title: "Deadlock recovery", focus: "A real head-on wait is detected, then resolved through a reserved holding route." },
  { id: "rec-b-carrying", code: "D", title: "Robot failure with cargo", focus: "A failed carrier retains custody until a rescuer performs a handover." },
  { id: "rec-c-aisle-closure", code: "E", title: "Dynamic aisle closure", focus: "Active paths are invalidated and replanned around closed cells." },
  { id: "high-density", code: "F", title: "Full stress test", focus: "Eight robots, a seeded mission feed, and a scheduled failure disruption." },
] as const;

export function DemoMode() {
  const scenarioId = useSimulationStore((state) => state.scenarioId);
  const snapshot = useSimulationStore((state) => state.snapshot);
  const status = useSimulationStore((state) => state.status);
  const speed = useSimulationStore((state) => state.speed);
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  const incidents = useMemo(() => deriveIncidents(snapshot).filter((incident) => incident.open), [snapshot]);
  const allTerminal = snapshot.missions.length > 0 && snapshot.missions.every((mission) => mission.state === "completed" || mission.state === "cancelled");
  const complete = snapshot.tick > 0 && allTerminal && status !== "running";

  const load = (id: string, start = false) => {
    const store = useSimulationStore.getState();
    store.pause();
    store.loadScenario(id);
    if (start) useSimulationStore.getState().play();
  };
  const run = (id: string) => load(id, true);
  const toggle = useSimulationStore((state) => state.togglePlayback);
  const reset = useSimulationStore((state) => state.reset);
  const setSpeed = useSimulationStore((state) => state.setSpeed);

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">Judge runbook</span><span className="text-text-dim">·</span>
        <span className="font-mono text-xs">deterministic engine scenarios</span><DataSourceBadge />
      </PageIntro>

      <Panel>
        <PanelBody className="flex flex-wrap items-center gap-3 py-3">
          <div className="mr-auto flex items-center gap-2 text-xs"><span className={`size-2 rounded-full ${complete ? "bg-lime" : status === "running" ? "animate-pulse bg-lime" : "bg-text-dim"}`} /><span>{complete ? "Scenario complete" : status === "running" ? "Simulation running" : status === "paused" ? "Paused" : "Ready"}</span><span className="font-mono text-text-dim">{scenario?.name} · {formatTick(snapshot.tick)}</span></div>
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface-sunken p-1" role="group" aria-label="Playback speed">
            {([0.5, 1, 2, 4] as const).map((value) => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)} className={`rounded px-2 py-1 font-mono text-[11px] ${speed === value ? "bg-white/10 text-lime" : "text-text-secondary hover:text-foreground"}`}>{value}×</button>)}
          </div>
          <button type="button" onClick={toggle} aria-label={status === "running" ? "Pause demo" : "Start or resume demo"} className="inline-flex h-8 items-center gap-2 rounded-md bg-lime px-3 text-xs font-medium text-primary-foreground hover:bg-lime/85">{status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start"}</button>
          <button type="button" onClick={reset} className="inline-flex h-8 items-center gap-2 rounded-md border border-line-strong px-3 text-xs text-text-secondary hover:bg-white/[0.04] hover:text-foreground"><RotateCcw className="size-3.5" />Reset</button>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Live warehouse" description={`${scenario?.summary ?? "Select a scenario"} · routes and robot positions are rendered from the current engine snapshot`} />
          <WarehousePreview label={`${scenario?.name ?? "Warehouse"}, live simulation view`} className="aspect-[16/8] min-h-[280px] bg-surface-sunken" />
        </Panel>
        <Panel>
          <PanelHeader title="Operational telemetry" description="Updated from simulation state" />
          <PanelBody className="grid grid-cols-2 gap-5">
            <Stat label="Robots" value={`${snapshot.metrics.activeRobots}/${snapshot.metrics.totalRobots}`} hint="Active / total" />
            <Stat label="Active missions" value={snapshot.metrics.activeMissions} hint="Queued and in progress" />
            <Stat label="Deliveries" value={snapshot.metrics.completedDeliveries} tone="lime" hint="Custody complete" />
            <Stat label="Waiting" value={snapshot.metrics.waitingRobots} hint="Robots waiting this tick" />
            <Stat label="Incidents" value={snapshot.metrics.openIncidents} tone={snapshot.metrics.openIncidents ? "amber" : undefined} hint="Open engine incidents" />
            <Stat label="Deadlocks" value={snapshot.deadlocks.stats.detected} hint="Detected by wait-for graph" />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
        <Panel>
          <PanelHeader title="Choose a demonstration" description="Each selection loads the real deterministic engine scenario. Run starts playback immediately." />
          <PanelBody className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {DEMOS.map((demo) => {
              const selected = scenarioId === demo.id;
              const definition = SCENARIOS.find((item) => item.id === demo.id);
              return <article key={demo.id} className={`rounded-md border p-3 ${selected ? "border-lime/50 bg-lime/[0.035]" : "border-line bg-surface-sunken/50"}`}>
                <div className="flex items-start gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded border border-line-strong font-mono text-xs text-lime">{demo.code}</span><div className="min-w-0 flex-1"><h2 className="text-[13px] font-medium">{demo.title}</h2><p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{demo.focus}</p>{definition && <p className="mt-2 font-mono text-[10px] text-text-dim">{definition.robots.length} robots · scenario {demo.id}</p>}</div>{selected && <Check className="size-4 text-lime" />}</div>
                <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => load(demo.id)} className="h-7 rounded border border-line-strong px-2.5 text-[11px] text-text-secondary hover:text-foreground">Load</button><button type="button" onClick={() => run(demo.id)} className="inline-flex h-7 items-center gap-1.5 rounded bg-lime px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-lime/85"><Zap className="size-3" />Run</button></div>
              </article>;
            })}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Operational timeline" description="Incidents, decisions, and mission events from the engine" />
          <PanelBody>
            {snapshot.events.length === 0 ? <div className="py-8 text-center text-xs text-text-secondary">Start the scenario to populate the event timeline.</div> : <ol className="flex max-h-[390px] flex-col divide-y divide-line/70 overflow-y-auto">{snapshot.events.slice(-14).reverse().map((event) => <li key={event.id} className="flex gap-2.5 py-2.5 first:pt-0"><span className="w-11 shrink-0 font-mono text-[10px] text-text-dim">{formatTick(event.tick)}</span><span className={`mt-1 size-1.5 shrink-0 rounded-full ${event.severity === "critical" ? "bg-danger" : event.severity === "warning" ? "bg-amber" : event.severity === "success" ? "bg-lime" : "bg-cyan"}`} /><span className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground/90">{event.message}</span></li>)}</ol>}
            {complete && <div role="status" className="mt-3 flex items-start gap-2 rounded-md border border-lime/30 bg-lime/5 p-3 text-xs text-lime"><Check className="mt-0.5 size-4 shrink-0" /><span>All missions in this run reached a terminal state. Reset or choose another scenario to continue.</span></div>}
            {!complete && incidents.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-[10px] text-amber"><CircleAlert className="size-3" />{incidents.length} open incident{incidents.length === 1 ? "" : "s"} — inspect the Incidents page for recovery detail.</p>}
          </PanelBody>
        </Panel>
      </div>

      <p className="text-[10px] leading-relaxed text-text-dim">Scenarios use seeded missions and scheduled engine commands. Robot motion, incidents, recovery, and completion are produced by the coordination engine; the interface does not animate scripted outcomes.</p>
    </PageContainer>
  );
}
