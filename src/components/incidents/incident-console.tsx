"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BatteryWarning, Construction, Crosshair, History, Hourglass, LockOpen, OctagonAlert } from "lucide-react";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stat } from "@/components/ui/stat";
import { PlannedNote } from "@/components/ui/planned-note";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { deriveIncidents, type Incident, type IncidentKind } from "@/lib/selectors";
import { formatTick } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "open" | "resolved" | "all";

const KIND: Record<IncidentKind, { label: string; icon: typeof OctagonAlert; planned: string; mission: string }> = {
  "robot-failed": {
    label: "Robot failure",
    icon: OctagonAlert,
    mission: "Mission 006",
    planned:
      "Today the engine halts the robot, keeps package custody with it and marks the mission recovery-required. The recovery manager will transfer custody explicitly and reassign the mission without losing delivery history.",
  },
  "robot-blocked": {
    label: "Blocked robot",
    icon: Hourglass,
    mission: "Missions 004–005",
    planned:
      "Today robots wait behind occupied cells and replan around other robots after a bounded wait; in head-on blocks the empty or higher-ID robot yields and steps aside if it has no other route. Time-indexed reservations will prevent most of these conflicts, and the deadlock manager will tell congestion apart from true deadlock.",
  },
  "low-battery": {
    label: "Low battery",
    icon: BatteryWarning,
    mission: "Later mission",
    planned:
      "The battery model is simplified: fixed drain per move, robots below 25% seek a free charger, robots below 15% are not assigned. Charging-aware scheduling is not in the current roadmap scope.",
  },
  "aisle-closure": {
    label: "Aisle closure",
    icon: Construction,
    mission: "Mission 006",
    planned:
      "Closed cells are excluded from new A* routes and affected robots replan on their next tick. Robots already on a closed cell may leave it. Richer closure tooling (multi-cell selection, scheduled reopen) comes later.",
  },
};

export function IncidentConsole() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = deriveIncidents(snapshot);
  const visible = all.filter((i) => (filter === "all" ? true : filter === "open" ? i.open : !i.open));
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;
  const open = all.filter((i) => i.open);

  const locate = (incident: Incident) => {
    const sim = useSimulationStore.getState();
    const robot = snapshot.robots.find((r) => r.id === incident.robotId);
    const closure = snapshot.closures.find((c) => c.id === incident.closureId);
    const focus = robot?.position ?? closure?.cells[0];
    if (robot) sim.select({ kind: "robot", id: robot.id });
    else if (closure) sim.select({ kind: "cell", x: closure.cells[0].x, y: closure.cells[0].y });
    if (focus) useViewportStore.getState().centerOn(focus.x, focus.y);
    router.push("/simulation");
  };

  const replay = (incident: Incident) => {
    const sim = useSimulationStore.getState();
    sim.pause();
    sim.seek(incident.openedTick);
    if (incident.robotId) sim.select({ kind: "robot", id: incident.robotId });
    router.push("/simulation");
  };

  const reopen = (incident: Incident) => {
    if (incident.closureId) useSimulationStore.getState().dispatch({ type: "reopen-aisle", closureId: incident.closureId });
  };

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">{open.length} open</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(snapshot.tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Panel className="p-4">
          <Stat label="Open critical" value={open.filter((i) => i.severity === "critical").length} tone={open.some((i) => i.severity === "critical") ? "red" : undefined} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Open warnings" value={open.filter((i) => i.severity === "warning").length} tone={open.some((i) => i.severity === "warning") ? "amber" : undefined} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Blocked episodes" value={all.filter((i) => i.kind === "robot-blocked").length} hint="Open + retained history" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Resolved" value={all.filter((i) => !i.open).length} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="flex min-h-[360px] flex-col">
          <PanelHeader
            title="Incident queue"
            description="Derived from robot state and the event log"
            actions={
              <FilterTabs
                label="Filter incidents"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "open", label: "Open", count: open.length },
                  { value: "resolved", label: "Resolved", count: all.length - open.length },
                  { value: "all", label: "All", count: all.length },
                ]}
              />
            }
          />
          {visible.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-6 py-12 text-center text-sm text-text-secondary">
              {filter === "open"
                ? `No open incidents at ${formatTick(snapshot.tick)}. Try the high-density or narrow-aisle scenario.`
                : "Nothing to show for this filter yet."}
            </p>
          ) : (
            <ul className="scrollbar-thin max-h-[560px] overflow-y-auto p-1.5">
              {visible.map((incident) => {
                const meta = KIND[incident.kind];
                const Icon = meta.icon;
                const active = selected?.id === incident.id;
                return (
                  <li key={incident.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(incident.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-white/[0.05] ring-1 ring-line-strong ring-inset" : "hover:bg-white/[0.025]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5",
                          !incident.open
                            ? "bg-white/[0.04] text-text-dim"
                            : incident.severity === "critical"
                              ? "bg-danger/12 text-danger"
                              : "bg-amber/12 text-amber",
                        )}
                      >
                        <Icon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-[13px] font-medium">{incident.title}</span>
                          <span className="tabular shrink-0 font-mono text-[10.5px] text-text-dim">
                            {formatTick(incident.openedTick)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-secondary">{incident.detail}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader title="Details" />
          {selected ? (
            <IncidentDetail incident={selected} tick={snapshot.tick} onLocate={locate} onReplay={replay} onReopen={reopen} />
          ) : (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">Select an incident to see details.</p>
          )}
        </Panel>
      </div>
    </PageContainer>
  );
}

function IncidentDetail({
  incident,
  tick,
  onLocate,
  onReplay,
  onReopen,
}: {
  incident: Incident;
  tick: number;
  onLocate: (i: Incident) => void;
  onReplay: (i: Incident) => void;
  onReopen: (i: Incident) => void;
}) {
  const meta = KIND[incident.kind];
  const rows: [string, string][] = [
    ["Incident", incident.id],
    ["Type", meta.label],
    ["Robot", incident.robotId ?? "—"],
    ["Mission", incident.missionId ?? "—"],
    ["Closure", incident.closureId ?? "—"],
    ["Opened", formatTick(incident.openedTick)],
    ["Duration", incident.open ? `${tick - incident.openedTick} ticks (ongoing)` : "Resolved"],
  ];
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <StatusBadge tone={incident.open ? (incident.severity === "critical" ? "red" : "amber") : "neutral"}>
          {incident.open ? (incident.severity === "critical" ? "Critical" : "Warning") : "Resolved"}
        </StatusBadge>
        <span className="text-sm font-medium">{incident.title}</span>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{incident.detail}</p>
      <dl className="divide-y divide-line/60 rounded-md border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex h-8 items-center justify-between px-3 text-xs">
            <dt className="text-text-secondary">{k}</dt>
            <dd className="tabular font-mono text-[11.5px]">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="border-line" onClick={() => onLocate(incident)}>
          <Crosshair />
          Locate {incident.robotId ?? incident.closureId}
        </Button>
        {incident.kind === "aisle-closure" && incident.open ? (
          <Button size="sm" variant="outline" className="border-line" onClick={() => onReopen(incident)}>
            <LockOpen />
            Reopen {incident.closureId}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="border-line" onClick={() => onReplay(incident)}>
          <History />
          Replay from {formatTick(incident.openedTick)}
        </Button>
      </div>
      <PlannedNote mission={meta.mission} className="mt-auto">
        {meta.planned}
      </PlannedNote>
    </div>
  );
}
