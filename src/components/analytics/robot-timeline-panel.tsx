"use client";

import { useMemo, useState } from "react";
import { Activity, Bot, Clock, GitCommitHorizontal, ShieldAlert, Wrench } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { RobotChip } from "@/components/fleet/robot-chip";
import { formatTick } from "@/lib/format";
import { buildRobotTimeline, type TimelineCategory } from "@/lib/robot-timeline";
import type { EventSeverity, SimulationSnapshot } from "@/types/simulation";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | TimelineCategory;

const CATEGORIES: readonly { readonly value: CategoryFilter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "mission", label: "Missions" },
  { value: "coordination", label: "Coordination" },
  { value: "deadlock", label: "Deadlocks" },
  { value: "recovery", label: "Recovery" },
  { value: "fault", label: "Faults" },
];

const SEVERITY_DOT: Record<EventSeverity, string> = {
  info: "bg-cyan",
  success: "bg-lime",
  warning: "bg-amber",
  critical: "bg-danger",
};

const CATEGORY_TEXT: Record<TimelineCategory, string> = {
  mission: "text-lime",
  coordination: "text-cyan",
  deadlock: "text-amber",
  recovery: "text-cyan",
  fault: "text-danger",
  battery: "text-amber",
};

export function RobotTimelinePanel({
  snapshot,
  selectedRobotId,
  onSelectRobot,
}: {
  snapshot: SimulationSnapshot;
  selectedRobotId: string;
  onSelectRobot: (id: string) => void;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const activeRobotId =
    selectedRobotId !== "all" && snapshot.robots.some((r) => r.id === selectedRobotId)
      ? selectedRobotId
      : (snapshot.robots[0]?.id ?? "R-01");

  const timeline = useMemo(
    () => buildRobotTimeline(snapshot, activeRobotId),
    [snapshot, activeRobotId],
  );
  const robot = snapshot.robots.find((r) => r.id === activeRobotId);
  const filteredEntries =
    category === "all"
      ? timeline.entries
      : timeline.entries.filter((e) => e.category === category);

  return (
    <Panel>
      <PanelHeader
        title="Explainable robot timeline"
        icon={<GitCommitHorizontal />}
        description="Chronological mission, coordination, deadlock, and recovery trace for one robot"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="label-caps">Inspect</span>
              <select
                aria-label="Inspect robot timeline"
                value={activeRobotId}
                onChange={(e) => onSelectRobot(e.target.value)}
                className="h-8 rounded-md border border-line-strong bg-surface-sunken px-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {snapshot.robots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      <PanelBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken/60 px-3 py-2.5">
          <div className="flex items-center gap-3">
            {robot ? <RobotChip id={robot.id} colorIndex={robot.colorIndex} /> : <Bot className="size-4 text-cyan" />}
            <span className="text-xs text-text-secondary">
              {robot?.activityNote ?? "No active note"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
            <span className="text-text-secondary">
              Deliveries <strong className="text-lime">{timeline.summary.deliveries}</strong>
            </span>
            <span className="text-text-secondary">
              Wait ticks <strong className="text-amber">{timeline.summary.waits}</strong>
            </span>
            <span className="text-text-secondary">
              Preemptions <strong className="text-cyan">{timeline.summary.preemptions}</strong>
            </span>
            <span className="text-text-secondary">
              Yields <strong className="text-foreground">{timeline.summary.deadlockYields}</strong>
            </span>
            <span className="text-text-secondary">
              Faults <strong className={timeline.summary.failures ? "text-danger" : "text-foreground"}>{timeline.summary.failures}</strong>
            </span>
            <span className="text-text-secondary">
              Rescues <strong className="text-cyan">{timeline.summary.rescues}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter robot timeline">
          {CATEGORIES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={category === opt.value}
              onClick={() => setCategory(opt.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                category === opt.value
                  ? "border-lime/50 bg-lime/10 text-lime"
                  : "border-line bg-surface-sunken/40 text-text-secondary hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10.5px] text-text-dim">
            {filteredEntries.length} retained trace{filteredEntries.length === 1 ? "" : "s"}
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-4 py-8 text-xs text-text-secondary">
            {category === "fault" ? <ShieldAlert className="size-4 text-text-dim" /> : category === "recovery" ? <Wrench className="size-4 text-text-dim" /> : snapshot.tick === 0 ? <Clock className="size-4 text-text-dim" /> : <Activity className="size-4 text-text-dim" />}
            <span>
              {snapshot.tick === 0
                ? "Start or step the simulation to record per-robot decisions and events."
                : `No ${category === "all" ? "" : `${category} `}entries recorded for ${activeRobotId} in the retained log.`}
            </span>
          </div>
        ) : (
          <ol className="scrollbar-thin flex max-h-72 flex-col divide-y divide-line/60 overflow-y-auto pr-1">
            {filteredEntries.slice(0, 40).map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="tabular w-14 shrink-0 font-mono text-[10.5px] text-text-dim">
                  {formatTick(entry.tick)}
                </span>
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEVERITY_DOT[entry.severity])} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-mono text-[10px] uppercase tracking-wide", CATEGORY_TEXT[entry.category])}>
                      {entry.category}
                    </span>
                    <span className="text-xs font-medium text-foreground">{entry.title}</span>
                    {entry.missionId ? (
                      <span className="font-mono text-[10px] text-text-dim">{entry.missionId}</span>
                    ) : null}
                    {entry.cell ? (
                      <span className="font-mono text-[10px] text-text-dim">
                        ({entry.cell.x},{entry.cell.y})
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{entry.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
