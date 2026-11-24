"use client";

import { Check, X } from "lucide-react";
import type { Package, RecoveryTask, RobotFailure, SimEvent } from "@/types/simulation";
import { StatusBadge } from "@/components/ui/status-badge";
import { cellRef, formatTick } from "@/lib/format";
import { FAILURE_STATUS, FAILURE_TYPE, PACKAGE_STATE, RECOVERY_TASK_STATUS, RESCUE_OUTCOME, TONE_DOT } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Robot-failure incident detail: failure record, lifecycle, each recovery
 * decision (rescuer, handover cell, outcome), the package's custody trail and
 * the event sequence since the failure.
 */
export function RecoveryDetail({
  failure,
  tasks,
  packages,
  events,
  tick,
}: {
  failure: RobotFailure;
  tasks: readonly RecoveryTask[];
  packages: readonly Package[];
  events: readonly SimEvent[];
  tick: number;
}) {
  const taskIds = new Set(tasks.map((t) => t.id));
  const packageIds = new Set(tasks.map((t) => t.packageId));
  const timeline = events.filter(
    (e) =>
      e.tick >= failure.tick &&
      (e.robotId === failure.robotId ||
        e.robotIds?.includes(failure.robotId) ||
        (e.taskId !== undefined && taskIds.has(e.taskId)) ||
        (e.packageId !== undefined && packageIds.has(e.packageId))),
  );
  const task = tasks.at(-1);
  const pkg = task ? packages.find((p) => p.id === task.packageId) : undefined;
  const status = FAILURE_STATUS[failure.status];
  const stages: { label: string; done: boolean; current: boolean; bad?: boolean }[] = [
    { label: "Failed", done: true, current: false, bad: true },
    {
      label: task ? "Package recovery" : failure.missionId ? "Mission requeued" : "Work recovery",
      done: !task || task.status === "completed",
      current: task !== undefined && task.status !== "completed",
      bad: task?.status === "failed",
    },
    { label: failure.status === "restored" ? "Restored" : failure.status === "restoring" ? "Restoring" : "Awaiting restore", done: failure.status === "restored", current: failure.status === "restoring" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Failure lifecycle">
        {stages.map((s) => (
          <li
            key={s.label}
            aria-current={s.current ? "step" : undefined}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px]",
              s.bad && !s.done ? "border-danger/40 text-danger" : s.bad ? "border-danger/30 text-danger" : s.done ? "border-lime/30 text-lime" : s.current ? "border-cyan/40 text-cyan" : "border-line text-text-dim",
            )}
          >
            {s.bad ? <X className="size-3" /> : s.done ? <Check className="size-3" /> : <span className={cn("size-1.5 rounded-full", s.current ? "bg-cyan" : "bg-text-dim")} />}
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="text-xs text-text-secondary">
          {FAILURE_TYPE[failure.type].label} · {(failure.restoredTick ?? tick) - failure.tick} ticks{failure.status === "restored" ? "" : " so far"}
        </span>
      </div>

      <section aria-label="Failure record" className="rounded-md border border-line">
        <h4 className="border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Failure record</h4>
        <dl className="divide-y divide-line/60">
          <Row k="Failure" v={`${failure.id} · ${FAILURE_TYPE[failure.type].label}`} />
          <Row k="Reason" v={failure.reason} />
          <Row k="Robot · cell" v={`${failure.robotId} · ${cellRef(failure.position)}`} />
          <Row k="Mission at failure" v={failure.missionId ?? "—"} />
          <Row k="Package at failure" v={failure.packageId ?? "—"} />
          <Row k="Failed" v={formatTick(failure.tick)} />
          <Row k="Restored" v={failure.restoredTick === null ? "—" : formatTick(failure.restoredTick)} />
        </dl>
      </section>

      {tasks.map((t) => {
        const ts = RECOVERY_TASK_STATUS[t.status];
        return (
          <section key={t.id} aria-label={`Recovery ${t.id}`} className="rounded-md border border-line">
            <h4 className="flex items-center justify-between border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">
              <span>
                Recovery {t.id} · {t.packageId}
              </span>
              <StatusBadge tone={ts.tone}>{ts.label}</StatusBadge>
            </h4>
            <p className="px-3 pt-2 text-[11.5px] leading-snug text-text-secondary">{t.note}</p>
            {t.attempts.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-secondary">No rescuer dispatched yet.</p>
            ) : (
              <ol className="divide-y divide-line/60">
                {t.attempts.map((a) => {
                  const outcome = RESCUE_OUTCOME[a.outcome];
                  return (
                    <li key={a.attempt} className="flex flex-col gap-0.5 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="tabular font-mono text-text-dim">#{a.attempt}</span>
                        <span className="font-medium">{a.rescuerId}</span>
                        <span className="text-text-dim">→ handover at</span>
                        <span className="font-mono text-[11.5px]">{cellRef(a.approachCell)}</span>
                        <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                          <span className={cn("size-1.5 rounded-full", TONE_DOT[outcome.tone])} />
                          {outcome.label}
                        </span>
                      </div>
                      <p className="tabular font-mono text-[10.5px] text-text-dim">
                        {formatTick(a.startedTick)} – {a.endedTick === null ? "ongoing" : formatTick(a.endedTick)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

      {pkg ? (
        <section aria-label="Package custody" className="rounded-md border border-line">
          <h4 className="flex items-center justify-between border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">
            <span>Custody · {pkg.id}</span>
            <StatusBadge tone={PACKAGE_STATE[pkg.state].tone}>{PACKAGE_STATE[pkg.state].label}</StatusBadge>
          </h4>
          <ol className="scrollbar-thin max-h-44 overflow-y-auto">
            {pkg.history.map((h, i) => (
              <li key={`${h.tick}-${i}`} className="grid grid-cols-[56px_1fr] gap-x-2 border-b border-line/40 px-3 py-1.5 last:border-b-0">
                <span className="tabular font-mono text-[10.5px] text-text-dim">{formatTick(h.tick)}</span>
                <span className="text-[11.5px] leading-snug">
                  <span className="font-mono text-[10.5px] text-text-secondary">{h.to}</span> · {h.note}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-label="Event sequence" className="rounded-md border border-line">
        <h4 className="border-b border-line/60 px-3 py-2 text-[11px] font-medium tracking-wide text-text-secondary uppercase">Event sequence</h4>
        {timeline.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-secondary">Events for this failure have rotated out of the bounded event log.</p>
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
      <dt className="shrink-0 text-text-secondary">{k}</dt>
      <dd className="tabular truncate text-right font-mono text-[11.5px]" title={v}>
        {v}
      </dd>
    </div>
  );
}
