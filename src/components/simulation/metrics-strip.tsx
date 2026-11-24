"use client";

import { Activity, AlertTriangle, CheckCircle2, Hourglass, Route } from "lucide-react";
import type { ReactNode } from "react";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { useSimulationStore } from "@/store/simulation-store";
import { TONE_TEXT, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: Tone }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-4 first:pl-0">
      <span className="text-text-dim [&_svg]:size-3.5">{icon}</span>
      <span className="label-caps truncate">{label}</span>
      <span className={cn("tabular font-mono text-[15px] font-medium", tone && value > 0 ? TONE_TEXT[tone] : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export function MetricsStrip() {
  const m = useSimulationStore((s) => s.snapshot.metrics);
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-background px-4 [&>div]:shrink-0">
      <div className="flex items-center divide-x divide-line">
        <Metric icon={<Activity />} label="Active robots" value={m.activeRobots} tone="cyan" />
        <Metric icon={<Route />} label="Active missions" value={m.activeMissions} tone="cyan" />
        <Metric icon={<CheckCircle2 />} label="Delivered" value={m.completedDeliveries} tone="lime" />
        <Metric icon={<Hourglass />} label="Waiting robots" value={m.waitingRobots} tone="amber" />
        <Metric
          icon={<AlertTriangle />}
          label="Incidents"
          value={m.openIncidents}
          tone={m.faultedRobots > 0 ? "red" : "amber"}
        />
      </div>
      <div className="ml-auto pl-3">
        <DataSourceBadge />
      </div>
    </div>
  );
}
