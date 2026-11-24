import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "@/lib/status";

/** Compact numeric readout: caps label, mono value, optional context line. */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5">
        {icon ? <span className="text-text-dim [&_svg]:size-3.5">{icon}</span> : null}
        <span className="label-caps truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "tabular font-mono text-[22px] leading-none font-medium tracking-tight",
            tone ? TONE_TEXT[tone] : "text-foreground",
          )}
        >
          {value}
        </span>
        {unit ? <span className="font-mono text-xs text-text-secondary">{unit}</span> : null}
      </div>
      {hint ? <div className="truncate text-xs text-text-secondary">{hint}</div> : null}
    </div>
  );
}
