"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusDot } from "@/components/ui/status-badge";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { NAV_ITEMS, navItemFor, type NavItem } from "./nav-config";
import { SwarmMark } from "./swarm-mark";

const SECTIONS = ["Operate", "Monitor", "System"] as const;

export function Sidebar() {
  const pathname = usePathname();
  const active = navItemFor(pathname);
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const toggle = usePreferences((s) => s.toggle);
  const expanded = !collapsed;

  // Labels show only when expanded AND the screen is wide enough.
  const labelClass = expanded ? "hidden lg:block" : "hidden";

  return (
    <aside
      aria-label="Primary"
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-out",
        expanded ? "w-[60px] lg:w-56" : "w-[60px]",
      )}
    >
      {/* Brand */}
      <Link
        href="/"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-[18px] outline-none focus-visible:bg-white/[0.03]"
      >
        <SwarmMark />
        <div className={cn("min-w-0 leading-none", labelClass)}>
          <div className="font-display text-[14px] font-bold tracking-[0.22em] text-foreground">SWARM</div>
          <div className="mt-1 truncate text-[10.5px] text-text-secondary">Robot Coordination Arena</div>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-3">
        {SECTIONS.map((section) => (
          <div key={section} className="mb-4 last:mb-0">
            <div className={cn("label-caps mb-1.5 px-2 text-text-dim", labelClass)}>{section}</div>
            <ul className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={item.href === active.href} labelClass={labelClass} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* System status */}
      <SystemStatus labelClass={labelClass} />

      <div className="border-t border-line p-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => toggle("sidebarCollapsed")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-xs text-text-secondary outline-none hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:flex"
            >
              {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
              <span className={labelClass}>Collapse</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  labelClass,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  labelClass: string;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const running = useSimulationStore((s) => s.status === "running");
  const incidents = useSimulationStore((s) => s.snapshot.metrics.openIncidents);
  const faults = useSimulationStore((s) => s.snapshot.metrics.faultedRobots);

  const badge =
    item.href === "/incidents" && incidents > 0 ? (
      <span
        className={cn(
          "tabular ml-auto rounded px-1.5 font-mono text-[10px] leading-4 font-medium",
          faults > 0 ? "bg-danger/15 text-danger" : "bg-amber/15 text-amber",
          labelClass,
        )}
      >
        {incidents}
      </span>
    ) : item.href === "/simulation" && running ? (
      <span className={cn("ml-auto", labelClass)}>
        <StatusDot tone="lime" pulse />
      </span>
    ) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            active ? "text-foreground" : "text-text-secondary hover:bg-white/[0.03] hover:text-foreground",
          )}
        >
          {active ? (
            <motion.span
              layoutId="nav-active"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="absolute inset-0 rounded-md bg-white/[0.055] ring-1 ring-white/[0.06] ring-inset"
            >
              <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-lime" />
            </motion.span>
          ) : null}
          <Icon className={cn("relative size-4 shrink-0", active && "text-lime")} />
          <span className={cn("relative truncate", labelClass)}>{item.label}</span>
          <span className="relative ml-auto flex items-center">{badge}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? undefined : "lg:hidden"}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function SystemStatus({ labelClass }: { labelClass: string }) {
  const status = useSimulationStore((s) => s.status);
  const tick = useSimulationStore((s) => s.snapshot.tick);
  const reserved = useSimulationStore((s) => s.snapshot.coordination.reservations.filter((r) => r.tick > s.snapshot.tick).length);

  return (
    <div className="border-t border-line px-2.5 py-3">
      <div className={cn("label-caps mb-2 px-2 text-text-dim", labelClass)}>System</div>
      <ul className="flex flex-col gap-1.5 px-2 text-xs">
        <StatusRow
          tone={status === "running" ? "lime" : "cyan"}
          label="Simulation engine"
          value={status === "running" ? "Live" : "Local"}
          title={`Deterministic in-browser engine · tick ${tick}`}
          labelClass={labelClass}
        />
        <StatusRow
          tone="lime"
          label="Reservations"
          value={String(reserved)}
          title="Time-indexed cell and edge reservations held by the coordinator right now. Deadlock and failure recovery release and rebuild them."
          labelClass={labelClass}
        />
        <StatusRow
          tone="neutral"
          label="Backend link"
          value="Offline"
          title="No backend is configured. FastAPI/WebSocket integration is out of scope for Mission 001."
          labelClass={labelClass}
        />
      </ul>
    </div>
  );
}

function StatusRow({
  tone,
  label,
  value,
  title,
  labelClass,
}: {
  tone: "lime" | "cyan" | "neutral";
  label: string;
  value: string;
  title: string;
  labelClass: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li tabIndex={0} className="flex h-5 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatusDot tone={tone} />
          <span className={cn("truncate text-text-secondary", labelClass)}>{label}</span>
          <span className={cn("ml-auto font-mono text-[10.5px] text-text-dim", labelClass)}>{value}</span>
        </li>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-60">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
