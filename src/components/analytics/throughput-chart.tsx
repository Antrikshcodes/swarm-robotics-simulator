"use client";

import type { ThroughputBucket } from "@/lib/selectors";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTick } from "@/lib/format";

const HEIGHT = 180;

/** Single-series column chart: deliveries completed per tick bucket. */
export function ThroughputChart({ buckets }: { buckets: readonly ThroughputBucket[] }) {
  const peak = Math.max(1, ...buckets.map((b) => b.deliveries));
  const ticks = [peak, Math.round(peak / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <figure className="flex flex-col gap-2" aria-label="Deliveries per interval">
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-6 shrink-0" style={{ height: HEIGHT }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 -translate-y-1/2 font-mono text-[10px] text-text-dim"
              style={{ top: `${(1 - t / peak) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: HEIGHT }}>
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-x-0 h-px bg-line/70"
              style={{ top: `${(1 - t / peak) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {buckets.map((b) => (
              <Tooltip key={b.start}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${formatTick(b.start)} to ${formatTick(b.end)}: ${b.deliveries} deliveries`}
                    className="group flex h-full min-w-0 flex-1 items-end justify-center rounded-t-[4px] outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="block w-full max-w-7 rounded-t-[4px] bg-series-a transition-[height] duration-300 group-hover:brightness-125"
                      style={{ height: `${(b.deliveries / peak) * 100}%`, minHeight: b.deliveries ? 2 : 0 }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="tabular font-mono">
                    {formatTick(b.start)}–{formatTick(b.end)} · <strong>{b.deliveries}</strong> deliveries
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
      {/* x axis */}
      <div className="ml-8 flex gap-[2px]">
        {buckets.map((b, i) => (
          <span key={b.start} className="tabular min-w-0 flex-1 truncate font-mono text-[10px] text-text-dim">
            {i % labelEvery === 0 ? b.start : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
