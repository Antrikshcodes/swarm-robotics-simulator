import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Marks values that come from the scripted demo playback rather than the
 * (not yet built) coordination engine. Required wherever metrics appear.
 */
export function DataSourceBadge({ className, label = "Demo script" }: { className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded border border-dashed border-amber/40 px-1.5 font-mono text-[10px] font-medium tracking-wide text-amber/90 uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <FlaskConical className="size-3" aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Values are computed live from a deterministic, hand-scripted demo playback. They are not
        produced by a coordination engine — routing, reservations and recovery are not implemented
        yet.
      </TooltipContent>
    </Tooltip>
  );
}
