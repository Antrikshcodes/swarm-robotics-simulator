"use client";

import { useMemo } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { StatusDot } from "@/components/ui/status-badge";
import { usePreferences } from "@/store/preferences-store";
import { PLAYBACK_SPEEDS, useSimulationStore } from "@/store/simulation-store";
import { formatTick, ticksToSeconds } from "@/lib/format";
import { PLAYBACK, SEVERITY, TONE_DOT, TONE_TEXT } from "@/lib/status";
import { cn } from "@/lib/utils";

const MIN_HORIZON = 300;

export function PlaybackBar() {
  return (
    <div className="shrink-0 border-t border-line bg-sidebar/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <TransportControls />
        <SpeedSelector />
        <Timeline />
      </div>
      <EventStrip />
    </div>
  );
}

function TransportControls() {
  const status = useSimulationStore((s) => s.status);
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const { togglePlayback, step, reset } = useSimulationStore.getState();
  const running = status === "running";
  const meta = PLAYBACK[status];

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={running ? "Pause" : "Play"}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md pr-3 pl-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              running
                ? "bg-white/[0.06] text-foreground ring-1 ring-line-strong ring-inset hover:bg-white/[0.09]"
                : "bg-lime text-primary-foreground hover:bg-lime/85",
            )}
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "Pause" : status === "ready" ? "Play" : "Resume"}
          </button>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          {running ? "Pause playback" : "Start playback"} <Kbd>Space</Kbd>
        </TooltipContent>
      </Tooltip>
      <IconButton label="Step one tick" shortcut="." side="top" onClick={step} disabled={running}>
        <StepForward />
      </IconButton>
      <IconButton label="Reset to tick 0" shortcut="R" side="top" onClick={reset} disabled={tick === 0 && status === "ready"}>
        <RotateCcw />
      </IconButton>
      <span className="ml-1.5 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider uppercase">
        <StatusDot tone={meta.tone} pulse={running} />
        <span className={TONE_TEXT[meta.tone]}>{meta.label}</span>
      </span>
    </div>
  );
}

function SpeedSelector() {
  const speed = useSimulationStore((s) => s.speed);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  return (
    <div role="radiogroup" aria-label="Playback speed" className="flex h-8 items-center rounded-md border border-line bg-surface-sunken/60 p-0.5">
      {PLAYBACK_SPEEDS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={speed === value}
          onClick={() => setSpeed(value)}
          className={cn(
            "tabular h-full rounded-[4px] px-2 font-mono text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            speed === value ? "bg-white/[0.08] text-foreground" : "text-text-secondary hover:text-foreground",
          )}
        >
          {value}×
        </button>
      ))}
    </div>
  );
}

function Timeline() {
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const maxTick = useSimulationStore((s) => s.maxTick);
  const deliveryTicks = useSimulationStore((s) => s.snapshot.deliveryTicks);
  const events = useSimulationStore((s) => s.snapshot.events);
  const seek = useSimulationStore((s) => s.seek);
  const tickMs = usePreferences((s) => s.tickMs);
  const speed = useSimulationStore((s) => s.speed);

  const horizon = Math.max(MIN_HORIZON, Math.ceil((Math.max(maxTick, tick) + 60) / 100) * 100);
  const markers = useMemo(() => {
    const warn = events
      .filter((e) => e.severity === "warning" || e.severity === "critical")
      .map((e) => ({ tick: e.tick, tone: SEVERITY[e.severity].tone, key: `e${e.seq}` }));
    const delivered = deliveryTicks.map((t, i) => ({ tick: t, tone: "lime" as const, key: `d${i}` }));
    return [...delivered, ...warn];
  }, [events, deliveryTicks]);

  return (
    <div className="flex min-w-[280px] flex-1 items-center gap-3">
      <span className="tabular w-[52px] font-mono text-xs text-foreground">{formatTick(tick)}</span>
      <div className="relative flex-1">
        {/* Explored range + event markers sit under the slider track. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-4 -translate-y-1/2">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.05]" />
          <div
            className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-white/[0.07]"
            style={{ width: `${(maxTick / horizon) * 100}%` }}
          />
          {markers.map((m) => (
            <span
              key={m.key}
              className={cn("absolute top-0 h-1.5 w-px opacity-80", TONE_DOT[m.tone])}
              style={{ left: `${(m.tick / horizon) * 100}%` }}
            />
          ))}
        </div>
        <Slider
          value={[tick]}
          min={0}
          max={horizon}
          step={1}
          onValueChange={([value]) => seek(value)}
          aria-label="Simulation timeline"
          className="relative py-2 [&_[data-slot=slider-range]]:bg-cyan/70 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-cyan [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-track]]:bg-transparent"
        />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="tabular hidden font-mono text-[11px] whitespace-nowrap text-text-secondary outline-none md:inline">
            / {horizon} · {ticksToSeconds(tick, tickMs).toFixed(1)}s
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          Timeline extends as you play. Dragging replays the deterministic script to the chosen tick. {tickMs} ms per
          tick at 1× ({Math.round(tickMs / speed)} ms at {speed}×).
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function EventStrip() {
  const events = useSimulationStore((s) => s.snapshot.events);
  const seek = useSimulationStore((s) => s.seek);
  const select = useSimulationStore((s) => s.select);
  const pause = useSimulationStore((s) => s.pause);
  const recent = events.slice(-10).reverse();

  return (
    <div className="flex h-9 items-center gap-2 border-t border-line/70 px-3">
      <span className="label-caps shrink-0 text-text-dim">Events</span>
      <ol className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {recent.length === 0 ? (
          <li className="text-xs text-text-dim">No events yet.</li>
        ) : (
          recent.map((event) => (
            <li key={event.seq} className="shrink-0">
              <button
                type="button"
                title={`Jump to ${formatTick(event.tick)}${event.robotId ? ` and select ${event.robotId}` : ""}`}
                onClick={() => {
                  pause();
                  seek(event.tick);
                  if (event.robotId) select({ kind: "robot", id: event.robotId });
                }}
                className="flex h-6 items-center gap-1.5 rounded border border-line bg-surface/50 px-2 text-[11px] outline-none hover:border-line-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("size-1.5 rounded-full", TONE_DOT[SEVERITY[event.severity].tone])} />
                <span className="tabular font-mono text-text-dim">{formatTick(event.tick)}</span>
                <span className="max-w-[280px] truncate text-foreground/85">{event.message}</span>
              </button>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
