import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/** States clearly which capability is not built yet, and when it lands. */
export function PlannedNote({ mission, children, className }: { mission: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-4 py-3", className)}>
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
      <div className="text-xs leading-relaxed text-text-secondary">
        <span className="mr-1.5 font-mono text-[10.5px] tracking-wide text-foreground uppercase">Planned · {mission}</span>
        {children}
      </div>
    </div>
  );
}
