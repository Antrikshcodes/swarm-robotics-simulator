import { cn } from "@/lib/utils";
import { LOW_BATTERY_THRESHOLD } from "@/engine";

/** Segmented battery bar. Values are sample telemetry from the demo script. */
export function BatteryMeter({ value, className, showValue = true }: { value: number; className?: string; showValue?: boolean }) {
  const tone = value < LOW_BATTERY_THRESHOLD ? "bg-danger" : value < 40 ? "bg-amber" : "bg-lime";
  const segments = 10;
  const filled = Math.round((value / 100) * segments);
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`${value.toFixed(1)}% (sample telemetry)`}>
      <span className="flex gap-[2px]" aria-hidden>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={cn("h-2.5 w-[3px] rounded-[1px]", i < filled ? tone : "bg-white/[0.08]")} />
        ))}
      </span>
      {showValue ? (
        <span className="tabular w-9 font-mono text-[11px] text-text-secondary">{value.toFixed(0)}%</span>
      ) : (
        <span className="sr-only">{value.toFixed(0)}%</span>
      )}
    </span>
  );
}
