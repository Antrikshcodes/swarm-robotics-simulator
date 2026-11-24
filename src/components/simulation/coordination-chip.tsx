"use client";

import { RefreshCcwDot, ShieldCheck, ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulationStore } from "@/store/simulation-store";
import { cn } from "@/lib/utils";

/** Compact live coordination status for the canvas toolbar. */
export function CoordinationChip() {
  const coordination = useSimulationStore((s) => s.snapshot.coordination);
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const future = coordination.reservations.filter((r) => r.tick > tick).length;
  const waiting = coordination.waitGraph.length;
  const deadlocks = useSimulationStore((s) => s.snapshot.deadlocks);
  const clean = coordination.stats.commitRejections === 0;
  const open = deadlocks.incidents.filter((i) => i.status !== "resolved");
  const failed = open.some((i) => i.status === "failed");
  const recovering = open.some((i) => i.status === "recovering");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "ml-auto hidden h-7 items-center gap-2 rounded-md border px-2 font-mono text-[10.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring xl:flex",
            clean ? "border-line text-text-secondary" : "border-amber/40 text-amber",
          )}
        >
          {clean ? <ShieldCheck className="size-3.5 text-lime" /> : <ShieldAlert className="size-3.5" />}
          <span className="tabular">{future} reserved</span>
          <span className="text-text-dim">·</span>
          <span className={cn("tabular", waiting ? "text-amber" : undefined)}>{waiting} waiting</span>
          {open.length ? (
            <>
              <span className="text-text-dim">·</span>
              <span className={cn("flex items-center gap-1", recovering && !failed ? "text-cyan" : "text-danger")}>
                <RefreshCcwDot className="size-3" />
                {failed ? "deadlock unresolved" : recovering ? "recovering" : "deadlock"}
              </span>
            </>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 flex-col items-start gap-1">
        <span>
          Space-time reservations: {future} future cell reservations, {coordination.holds.length} holds, horizon{" "}
          {coordination.horizon} ticks.
        </span>
        <span className="text-text-secondary">
          {coordination.stats.plansComputed} plans · {coordination.stats.preemptions} right-of-way decisions ·{" "}
          {coordination.stats.commitRejections} moves rejected at commit
        </span>
        <span className="text-text-secondary">
          Deadlocks: {deadlocks.stats.detected} detected · {deadlocks.stats.resolved} resolved · {deadlocks.stats.failed} failed ·{" "}
          {deadlocks.stats.transientCycles} transient cycles filtered · recovery {deadlocks.recoveryEnabled ? "on" : "off"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
