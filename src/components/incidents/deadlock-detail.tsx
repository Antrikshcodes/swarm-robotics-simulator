"use client";

import { ArrowRight, Check, X } from "lucide-react";
import type { DeadlockIncident, SimEvent } from "@/types/simulation";
import { StatusBadge } from "@/components/ui/status-badge";
import { cellRef, formatTick } from "@/lib/format";
import { DEADLOCK_STATUS, RECOVERY_OUTCOME, TONE_DOT } from "@/lib/status";
import { cn } from "@/lib/utils";

const STAGES = ["Detected", "Recovery", "Outcome"] as const;

/**
 * Deadlock incident detail: lifecycle, the wait-for group, each recovery
 * decision (who yielded, where, why, outcome) and the event sequence.
 */
export function DeadlockDetail({ incident, events, tick }: { incident: DeadlockIncident; events: readonly SimEvent[]; tick: number }) {
  const status = DEADLOCK_STATUS[incident.status];
  const timeline = events.filter((e) => e.incidentId === incident.id);
  const stage = incident.status === "detected" ? (incident.attempts.length ? 1 : 0) : incident.status === "recovering" ? 1 : 2;
  const duration = (incident.resolvedTick ?? tick) - incident.detectedTick;

  return (
    <div className="flex flex-col gap-4">
      {/* Lifecycle */}
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Deadlock lifecycle">
        {STAGES.map((label, i) => {
          const done = i < stage || (i === stage && i === 2);
          const current = i === stage && i !== 2;
          const failed = i === 2 && incident.status === "failed";
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px]",
                failed
                  ? "border-danger/40 text-danger"
                  : done
                    ? "border-lime/30 text-lime"
                    : current
                      ? "border-cyan/40 text-cyan"
                      : "border-line text-text-dim",
              )}
            >
              {failed ? <X className="size-3" /> : done ? <Check className="size-3" /> : <span className={cn("size-1.5 rounded-full", current ? "bg-cyan" : "bg-text-dim")} />}
              {i === 2 ? (incident.status === "failed" ? "Failed" : incident.status === "resolved" ? "Resolved" : label) : label}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="text-xs text-text-secondary">
          {incident.kind === "cycle" ? "Circular wait" : "Stalled robot"} · {duration} ticks{incident.status === "resolved" ? "" : " so far"}
        </span>
      </div>
      {incident.failureReason ? (
        <p className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs leading-relaxed text-danger">
          {incident.failureReason}. Robots are held in a safe waiting state; recovery retries when the warehouse changes (mission, closure, failure).
        </p>
      ) : null}

      {/* Wait-for group */}
      <section aria-label="Wait-for relationships" className="rounded-md border border-line">
        <h4 className="border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Wait-for group</h4>
        <ul className="flex flex-col gap-1 px-3 py-2">
          {incident.edges.length === 0 ? <li className="text-xs text-text-secondary">{incident.robots.join(", ")}</li> : null}
          {incident.edges.map((e) => (
            <li key={`${e.robotId}-${e.waitingFor}`} className="flex items-center gap-2 font-mono text-[11.5px]">
              <span>{e.robotId}</span>
              <ArrowRight className="size-3 text-danger" aria-label="waits for" />
              <span>{e.waitingFor}</span>
              {e.cell ? <span className="ml-auto text-text-dim">{cellRef(e.cell)} · {e.reason}</span> : null}
            </li>
          ))}
        </ul>
        <dl className="divide-y divide-line/60 border-t border-line/60">
          <Row k="Blocking cells" v={incident.blockingCells.map(cellRef).join(" ") || "—"} />
          <Row k="Also waiting" v={incident.dependents.join(", ") || "—"} />
          <Row k="Detected" v={formatTick(incident.detectedTick)} />
          <Row k="Resolved" v={incident.resolvedTick === null ? "—" : formatTick(incident.resolvedTick)} />
        </dl>
      </section>

      {/* Recovery decisions */}
      <section aria-label="Recovery attempts" className="rounded-md border border-line">
        <h4 className="border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Recovery decisions</h4>
        {incident.attempts.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-secondary">No recovery attempt yet{incident.status === "detected" ? " (recovery disabled or pending)" : ""}.</p>
        ) : (
          <ol className="divide-y divide-line/60">
            {incident.attempts.map((a) => {
              const outcome = RECOVERY_OUTCOME[a.outcome];
              return (
                <li key={a.attempt} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="tabular font-mono text-text-dim">#{a.attempt}</span>
                    <span className="font-medium">{a.yielderId} yields</span>
                    <span className="text-text-dim">→</span>
                    <span className="font-mono text-[11.5px]">{a.holdingCell ? cellRef(a.holdingCell) : "no holding cell"}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                      <span className={cn("size-1.5 rounded-full", TONE_DOT[outcome.tone])} />
                      {outcome.label}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-snug text-text-secondary">{a.note}</p>
                  <p className="tabular font-mono text-[10.5px] text-text-dim">
                    {formatTick(a.startedTick)} – {a.endedTick === null ? "ongoing" : formatTick(a.endedTick)} · route {a.route.length} cell{a.route.length === 1 ? "" : "s"}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Event sequence */}
      <section aria-label="Event sequence" className="rounded-md border border-line">
        <h4 className="border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Event sequence</h4>
        {timeline.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-secondary">Events for this incident have rotated out of the bounded event log.</p>
        ) : (
          <ol className="scrollbar-thin max-h-64 overflow-y-auto">
            {timeline.map((e) => (
              <li key={e.id} className="grid grid-cols-[56px_1fr] gap-x-2 border-b border-line/40 px-3 py-1.5 last:border-b-0">
                <span className="tabular font-mono text-[10.5px] text-text-dim">{formatTick(e.tick)}</span>
                <span className="flex flex-col">
                  <span className="font-mono text-[10.5px] text-text-secondary">
                    {e.kind}
                    {e.attempt ? ` · attempt ${e.attempt}` : ""}
                    {e.action ? ` · ${e.action}` : ""}
                  </span>
                  <span className="text-[11.5px] leading-snug">{e.message}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 px-3 py-1 text-xs">
      <dt className="text-text-secondary">{k}</dt>
      <dd className="tabular text-right font-mono text-[11.5px]">{v}</dd>
    </div>
  );
}
