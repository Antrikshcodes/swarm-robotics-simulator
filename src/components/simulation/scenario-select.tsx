"use client";

import { Map as MapIcon } from "lucide-react";
import { SCENARIOS } from "@/engine";
import { useSimulationStore } from "@/store/simulation-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ScenarioSelect({ className, compact = false }: { className?: string; compact?: boolean }) {
  const scenarioId = useSimulationStore((s) => s.scenarioId);
  const loadScenario = useSimulationStore((s) => s.loadScenario);

  return (
    <Select value={scenarioId} onValueChange={loadScenario}>
      <SelectTrigger
        size="sm"
        aria-label="Scenario"
        className={cn(
          "h-8 gap-2 border-line bg-surface-sunken/60 text-[13px] hover:bg-white/[0.03] dark:bg-surface-sunken/60 dark:hover:bg-white/[0.03]",
          compact ? "w-44" : "w-56",
          className,
        )}
      >
        <MapIcon className="size-3.5 text-text-secondary" />
        <SelectValue placeholder="Scenario" />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="w-72">
        {SCENARIOS.map((scenario) => (
          <SelectItem key={scenario.id} value={scenario.id} className="py-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px]">{scenario.name}</span>
              <span className="text-[11px] text-text-secondary in-data-[slot=select-value]:hidden">
                {scenario.summary}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
