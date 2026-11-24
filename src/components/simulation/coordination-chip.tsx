"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulationStore } from "@/store/simulation-store";
import { cn } from "@/lib/utils";

/** Compact live coordination status for the canvas toolbar. */
export function CoordinationChip() {
  const coordination = useSimulationStore((s) => s.snapshot.coordination);
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const future = coordination.reservations.filter((r) => r.tick > tick).length;
  const waiting = coordination.waitGraph.length;
  const clean = coordination.stats.commitRejections === 0;
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
      </TooltipContent>
    </Tooltip>
  );
}
