"use client";

import type { ReactNode } from "react";
import { Warehouse } from "lucide-react";
import { getScenario } from "@/engine";
import type { SimulationSnapshot } from "@/types/simulation";
import { StatusBadge } from "@/components/ui/status-badge";
import { RobotChip } from "@/components/fleet/robot-chip";
import { useSimulationStore } from "@/store/simulation-store";
import { formatTick } from "@/lib/format";
import { ROBOT_STATUS } from "@/lib/status";
import { Dash, Row, Section } from "./inspector-primitives";

export function FleetInspector({ snapshot }: { snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  const scenario = getScenario(snapshot.scenarioId);
  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Warehouse className="size-4 text-text-secondary" />
          {scenario.name}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{scenario.focus}</p>
      </div>
      <Section title={`Fleet · ${snapshot.robots.length}`} aside={<span className="font-mono text-[10px] text-text-dim">{formatTick(snapshot.tick)}</span>}>
        <ul className="-mx-2 flex flex-col">
          {snapshot.robots.map((robot) => {
            const status = ROBOT_STATUS[robot.status];
            return (
              <li key={robot.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "robot", id: robot.id })}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-dim">
                    {robot.missionId ?? ""}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-text-dim">Select a robot, station or cell on the canvas to inspect it.</p>
      </Section>
      <CoordinationOverview snapshot={snapshot} />
      <Section title="Legend">
        <Legend />
      </Section>
    </>
  );
}

function CoordinationOverview({ snapshot }: { snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  const { coordination, tick } = snapshot;
  const future = coordination.reservations.filter((r) => r.tick > tick).length;
  const recent = coordination.decisions.filter((d) => d.kind !== "wait" || d.otherRobotId).slice(-8).reverse();
  return (
    <Section title="Coordination" aside={<span className="font-mono text-[10px] text-text-dim">horizon {coordination.horizon}</span>}>
      <dl>
        <Row label="Reserved cells">{future}</Row>
        <Row label="Waiting robots">{coordination.waitGraph.length}</Row>
        <Row label="Plans computed">{coordination.stats.plansComputed}</Row>
        <Row label="Right-of-way decisions">{coordination.stats.preemptions}</Row>
        <Row label="Moves rejected at commit">{coordination.stats.commitRejections}</Row>
        <Row label="Deadlocks">
          {snapshot.deadlocks.stats.detected ? (
            <>
              {snapshot.deadlocks.stats.detected}
              <span className="ml-1.5 text-text-dim">
                {snapshot.deadlocks.stats.resolved} resolved · {snapshot.deadlocks.stats.failed} failed
              </span>
            </>
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Transient cycles filtered">{snapshot.deadlocks.stats.transientCycles || <Dash />}</Row>
      </dl>
      {recent.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {recent.map((d) => (
            <li key={d.seq}>
              <button
                type="button"
                onClick={() => select({ kind: "robot", id: d.robotId })}
                className="w-full rounded px-1 py-0.5 text-left text-[11px] leading-snug text-text-secondary outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="tabular mr-1.5 font-mono text-text-dim">{formatTick(d.tick)}</span>
                <span className={d.kind === "preempt" ? "text-lime" : d.kind === "yield" ? "text-amber" : d.kind === "commit-reject" ? "text-danger" : undefined}>
                  {d.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-text-dim">No conflicts yet. Start playback to see coordination decisions.</p>
      )}
    </Section>
  );
}

function Legend() {
  const items: { swatch: ReactNode; label: string }[] = [
    { swatch: <span className="size-3 rounded-[2px] border border-cyan/70 bg-cyan/10" />, label: "Pickup station" },
    { swatch: <span className="size-3 rounded-[2px] border border-lime/70 bg-lime/10" />, label: "Drop-off station" },
    { swatch: <span className="size-3 rounded-[2px] border border-text-secondary/70 bg-white/5" />, label: "Charging dock" },
    { swatch: <span className="size-3 rounded-[2px] border border-[var(--swarm-rack-edge)] bg-[var(--swarm-rack)]" />, label: "Storage rack" },
    { swatch: <span className="size-3 rounded-[2px] border border-danger/50 bg-[var(--swarm-obstacle)]" />, label: "Obstacle" },
    { swatch: <span className="h-3 w-3 border-y border-amber/60 bg-amber/15" />, label: "Narrow passage" },
    { swatch: <span className="h-0 w-3 border-t-2 border-dashed border-cyan/70" />, label: "A* route" },
    { swatch: <span className="size-3 rounded-[2px] border border-danger bg-danger/20" />, label: "Closed cell" },
    { swatch: <span className="size-2 rounded-[1px] bg-cyan/50" />, label: "Reserved cell" },
    { swatch: <span className="size-3 rounded-[2px] border border-dashed border-cyan" />, label: "Planned stop" },
    { swatch: <span className="h-0 w-3 border-t border-dashed border-amber" />, label: "Waiting for" },
    { swatch: <span className="h-0 w-3 border-t-2 border-danger" />, label: "Deadlock wait" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-danger" />, label: "Deadlocked" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-cyan" />, label: "Yielding" },
    { swatch: <span className="size-3 rounded-[2px] border border-cyan font-mono text-[7px] leading-[9px] text-cyan">H</span>, label: "Holding position" },
    { swatch: <span className="size-3 border border-danger bg-danger/10" />, label: "Blocking cell" },
    { swatch: <span className="size-2 rotate-45 bg-danger" />, label: "Urgent mission" },
    { swatch: <span className="size-2.5 rounded-[2px] bg-amber" />, label: "Carrying package" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-dashed border-amber" />, label: "Waiting / congestion" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-danger/50 bg-danger/10" />, label: "Failed robot" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-dashed border-amber" />, label: "Restoring" },
    { swatch: <span className="size-3 rounded-[3px] border border-lime" />, label: "Restored" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-dashed border-cyan" />, label: "Recovery robot" },
    { swatch: <span className="size-2.5 rounded-[2px] bg-danger" />, label: "Package recovery" },
    { swatch: <span className="size-3 rounded-[2px] border border-cyan bg-cyan/10" />, label: "Handover cell" },
    { swatch: <span className="size-2.5 rounded-full bg-amber" />, label: "Route invalidated" },
    { swatch: <span className="size-2.5 rounded-full bg-lime" />, label: "Route replanned" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="flex w-3.5 justify-center">{item.swatch}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
