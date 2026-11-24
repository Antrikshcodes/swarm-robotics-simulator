import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Marks values computed by the local simulation engine, and states plainly
 * which coordination capabilities are not built yet.
 */
export function DataSourceBadge({ className, label = "Engine" }: { className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded border border-cyan/35 px-1.5 font-mono text-[10px] font-medium tracking-wide text-cyan/90 uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Cpu className="size-3" aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 flex-col items-start gap-1">
        <span>
          Live values from the deterministic in-browser engine: space-time reservations and cooperative A*, mission
          scheduling with priorities, package custody, deadlock and failure recovery, and per-tick safety invariants.
        </span>
        <span className="text-text-secondary">Not yet: backend or persistence.</span>
      </TooltipContent>
    </Tooltip>
  );
}
