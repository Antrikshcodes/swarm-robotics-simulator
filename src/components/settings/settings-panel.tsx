"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Kbd } from "@/components/ui/kbd";
import { PlannedNote } from "@/components/ui/planned-note";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TICK_DURATIONS, usePreferences, type BooleanPreference, type TickDuration } from "@/store/preferences-store";

function SettingRow({ label, description, control, htmlFor }: { label: string; description: string; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/60 px-4 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-snug text-text-secondary">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ToggleRow({ pref, label, description }: { pref: BooleanPreference; label: string; description: string }) {
  const id = useId();
  const value = usePreferences((s) => s[pref]);
  const toggle = usePreferences((s) => s.toggle);
  return (
    <SettingRow
      htmlFor={id}
      label={label}
      description={description}
      control={<Switch id={id} checked={value} onCheckedChange={() => toggle(pref)} />}
    />
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  [".", "Step one tick"],
  ["R", "Reset to tick 0"],
  ["Esc", "Clear selection"],
  ["+ / −", "Zoom in / out"],
  ["0", "Reset zoom to 100%"],
  ["F", "Fit warehouse to view"],
  ["V / H", "Select / pan tool"],
  ["G / C / P / L", "Grid / coordinates / routes / labels"],
  ["← ↑ → ↓", "Pan (canvas focused)"],
];

export function SettingsPanel() {
  const tickMs = usePreferences((s) => s.tickMs);
  const set = usePreferences((s) => s.set);
  const resetPreferences = usePreferences((s) => s.resetPreferences);
  const tickId = useId();

  return (
    <PageContainer className="max-w-[1080px]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-text-secondary">
          Preferences are stored in this browser only. They change how SWARM looks and plays back — never simulation
          outcomes.
        </p>
        <Button variant="outline" size="sm" className="shrink-0 border-line" onClick={resetPreferences}>
          <RotateCcw />
          Restore defaults
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Playback" description="Wall-clock pacing of the discrete tick loop" />
          <SettingRow
            htmlFor={tickId}
            label="Tick duration at 1×"
            description="Time between ticks. Speed multipliers in the studio scale this value."
            control={
              <Select value={String(tickMs)} onValueChange={(v) => set("tickMs", Number(v) as TickDuration)}>
                <SelectTrigger id={tickId} size="sm" className="w-28 border-line font-mono text-xs">
                  <SelectValue>{tickMs} ms</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TICK_DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)} className="font-mono text-xs">
                      {d} ms
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <ToggleRow
            pref="interpolateMotion"
            label="Smooth robot motion"
            description="Animate markers between ticks. Disabled automatically when your OS requests reduced motion."
          />
        </Panel>

        <Panel>
          <PanelHeader title="Warehouse display" description="Canvas overlays in Simulation Studio" />
          <ToggleRow pref="showGrid" label="Grid lines" description="Cell grid with a stronger line every 5 cells." />
          <ToggleRow pref="showCoordinates" label="Coordinate rulers" description="Column letters and row numbers on the canvas edges." />
          <ToggleRow pref="showRoutes" label="Routes" description="Each robot's remaining scripted path and destination." />
          <ToggleRow pref="showLabels" label="Robot labels" description="Robot IDs beneath markers when zoomed in enough." />
        </Panel>

        <Panel>
          <PanelHeader title="Interface" />
          <ToggleRow pref="sidebarCollapsed" label="Compact sidebar" description="Icon-only navigation on wide screens." />
        </Panel>

        <Panel>
          <PanelHeader title="Keyboard shortcuts" description="Active in Simulation Studio" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3.5 text-xs">
            {SHORTCUTS.map(([key, action]) => (
              <div key={key} className="contents">
                <dt className="text-text-secondary">
                  <Kbd className="h-5 px-1.5 text-[10.5px]">{key}</Kbd>
                </dt>
                <dd className="self-center text-foreground/90">{action}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <PlannedNote mission="Missions 002–007">
        Engine configuration (random seed, planner and reservation horizon, deadlock timeout, recovery policy) and
        backend connection settings will appear here once those systems exist. Nothing here is a placeholder control.
      </PlannedNote>
    </PageContainer>
  );
}
