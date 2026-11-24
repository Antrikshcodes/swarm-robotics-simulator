"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Bell, ChevronRight, Settings, UserRound } from "lucide-react";
import { getScenario } from "@/engine";
import { navItemFor } from "@/components/navigation/nav-config";
import { ScenarioSelect } from "@/components/simulation/scenario-select";
import { StatusDot } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSimulationStore } from "@/store/simulation-store";
import { formatTick } from "@/lib/format";
import { PLAYBACK, SEVERITY, TONE_TEXT } from "@/lib/status";
import { cn } from "@/lib/utils";

export function TopBar() {
  const pathname = usePathname();
  const item = navItemFor(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-background/80 px-4 backdrop-blur-sm lg:px-5">
      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-text-dim">
          <span>SWARM</span>
          <ChevronRight className="size-3" aria-hidden />
          <span>{item.section}</span>
        </nav>
        <div className="flex items-baseline gap-2.5">
          <h1 className="truncate text-[15px] leading-tight font-semibold tracking-tight">{item.label}</h1>
          <span className="hidden truncate text-xs text-text-secondary xl:inline">{item.description}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {item.scenarioScoped ? <ScenarioSelect className="hidden md:flex" compact /> : null}
        <PlaybackIndicator />
        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <EventsMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}

function PlaybackIndicator() {
  const status = useSimulationStore((s) => s.status);
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const meta = PLAYBACK[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/simulation"
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface-sunken/60 px-2.5 outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatusDot tone={meta.tone} pulse={status === "running"} />
          <span className={cn("text-[11px] font-semibold tracking-wider uppercase", TONE_TEXT[meta.tone])}>
            {meta.label}
          </span>
          <span className="tabular hidden font-mono text-[11px] text-text-secondary sm:inline">{formatTick(tick)}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        Simulation engine · {getScenario(scenarioId).name} · open Simulation Studio
      </TooltipContent>
    </Tooltip>
  );
}

function EventsMenu() {
  const events = useSimulationStore((s) => s.snapshot.events);
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  // Seen marker is scoped per scenario load; resets when the event log does.
  const [seen, setSeen] = useState<{ scenarioId: string; seq: number }>({ scenarioId, seq: 0 });

  const notable = useMemo(
    () => events.filter((e) => e.severity === "warning" || e.severity === "critical").slice(-8).reverse(),
    [events],
  );
  // Alerts are engine events only (E- ids), so their seq is one ordered space.
  const latestSeq = notable.length ? notable[0].seq : 0;
  const seenSeq = seen.scenarioId === scenarioId && seen.seq <= latestSeq ? seen.seq : 0;
  const unread = notable.filter((e) => e.seq > seenSeq).length;
  const hasCritical = notable.some((e) => e.seq > seenSeq && e.severity === "critical");

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setSeen({ scenarioId, seq: latestSeq });
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={unread ? `${unread} unread alerts` : "Alerts"}
              className="relative text-text-secondary hover:text-foreground"
            >
              <Bell className="size-4" />
              {unread > 0 ? (
                <span
                  className={cn(
                    "tabular absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-mono text-[9px] font-semibold text-background",
                    hasCritical ? "bg-danger" : "bg-amber",
                  )}
                >
                  {unread}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Alerts</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-xs font-medium text-foreground">Recent alerts</span>
          <span className="font-mono text-[10px] text-text-dim">engine events</span>
        </DropdownMenuLabel>
        <div className="scrollbar-thin max-h-80 overflow-y-auto p-1">
          {notable.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-secondary">
              No warnings or critical events yet. Start playback to generate events.
            </p>
          ) : (
            notable.map((event) => (
              <DropdownMenuItem key={event.id} asChild className="items-start gap-2.5 py-2">
                <Link href="/incidents">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", event.severity === "critical" ? "bg-danger" : "bg-amber")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs leading-snug text-foreground">{event.message}</span>
                    <span className="mt-0.5 flex gap-2 font-mono text-[10px] text-text-dim">
                      <span>{formatTick(event.tick)}</span>
                      <span className={TONE_TEXT[SEVERITY[event.severity].tone]}>{SEVERITY[event.severity].label}</span>
                      {event.seq > seenSeq ? <span className="text-lime">new</span> : null}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="m-1 justify-center text-xs text-text-secondary">
          <Link href="/incidents">Open incidents</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Operator menu"
          className="flex h-8 items-center gap-2 rounded-md pr-1 pl-1 outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-7 items-center justify-center rounded-md border border-line-strong bg-surface font-mono text-[10px] font-semibold text-text-secondary">
            OP
          </span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-xs text-foreground">Local operator</span>
            <span className="block text-[10.5px] text-text-dim">No auth</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <UserRound className="size-4 text-text-secondary" />
          <span className="leading-tight">
            <span className="block text-xs text-foreground">Local operator</span>
            <span className="block text-[11px] font-normal text-text-secondary">
              Authentication is not configured
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Preferences
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
