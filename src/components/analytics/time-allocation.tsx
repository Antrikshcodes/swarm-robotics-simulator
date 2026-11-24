"use client";

import type { RobotState } from "@/types/simulation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RobotChip } from "@/components/fleet/robot-chip";
import { formatPercent } from "@/lib/format";

const SERIES = [
  { key: "moving", label: "Moving", className: "bg-series-a" },
  { key: "handling", label: "Loading / unloading", className: "bg-series-b" },
  { key: "waiting", label: "Waiting", className: "bg-series-c" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

export function allocation(robot: RobotState, tick: number): Record<SeriesKey | "idle", number> {
  const moving = robot.stats.movingTicks;
  const handling = robot.stats.busyTicks - robot.stats.movingTicks;
  const waiting = robot.stats.waitingTicks;
  return { moving, handling, waiting, idle: Math.max(0, tick - moving - handling - waiting) };
}

/**
 * 100 % stacked bars of how each robot spent elapsed ticks. Idle, charging
 * and faulted time is the unfilled track rather than a fourth colour.
 */
export function TimeAllocation({ robots, tick }: { robots: readonly RobotState[]; tick: number }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span className={`size-2.5 rounded-[2px] ${s.className}`} />
            {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="size-2.5 rounded-[2px] bg-white/[0.07] ring-1 ring-line ring-inset" />
          Idle · charging · fault
        </li>
      </ul>
      <ul className="flex flex-col gap-2.5">
        {robots.map((robot) => {
          const a = allocation(robot, tick);
          return (
            <li key={robot.id} className="grid grid-cols-[64px_1fr_44px] items-center gap-3">
              <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px] bg-white/[0.05]">
                {SERIES.map((s) => {
                  const value = a[s.key];
                  if (value === 0 || tick === 0) return null;
                  return (
                    <Tooltip key={s.key}>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          aria-label={`${robot.id} ${s.label}: ${value} ticks`}
                          className={`h-full shrink-0 outline-none first:rounded-l-[4px] hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring ${s.className}`}
                          style={{ width: `${(value / tick) * 100}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="tabular font-mono">
                          {robot.id} · {s.label}: {value} ticks ({formatPercent(value / tick)})
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <span className="tabular text-right font-mono text-[11px] text-text-secondary">
                {tick === 0 ? "—" : formatPercent((a.moving + a.handling) / tick)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
