"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { PageContainer, PageIntro } from "@/components/layout/page-container";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Stat } from "@/components/ui/stat";
import { Table, Td, Th, THead, Tr } from "@/components/ui/data-table";
import { PlannedNote } from "@/components/ui/planned-note";
import { RobotChip } from "@/components/fleet/robot-chip";
import { useSimulationStore } from "@/store/simulation-store";
import { averageCycleTicks, throughputBuckets } from "@/lib/selectors";
import { formatPercent, formatTick } from "@/lib/format";
import { ThroughputChart } from "./throughput-chart";
import { allocation, TimeAllocation } from "./time-allocation";

type View = "chart" | "table";

function bucketSizeFor(tick: number): number {
  // Keep roughly ≤ 40 columns as the run grows.
  return Math.max(25, Math.ceil(tick / 40 / 25) * 25);
}

export function AnalyticsDashboard() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const [view, setView] = useState<View>("chart");
  const { tick, metrics } = snapshot;
  const bucketSize = bucketSizeFor(tick);
  const buckets = throughputBuckets(snapshot, bucketSize);
  const avgCycle = averageCycleTicks(snapshot);
  const empty = tick === 0;

  return (
    <PageContainer>
      <PageIntro>
        <span className="text-foreground">Computed over {tick} ticks</span>
        <span className="text-text-dim">·</span>
        <span className="tabular font-mono text-xs">{formatTick(tick)}</span>
        <DataSourceBadge />
      </PageIntro>

      <Panel>
        <PanelBody className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Stat label="Deliveries" value={metrics.completedDeliveries} tone="lime" hint="Completed drop-offs" />
          <Stat
            label="Throughput"
            value={empty ? "—" : ((metrics.completedDeliveries / tick) * 100).toFixed(1)}
            unit={empty ? undefined : "/ 100 ticks"}
            hint="Deliveries per 100 ticks"
          />
          <Stat
            label="Avg cycle time"
            value={avgCycle === null ? "—" : avgCycle.toFixed(1)}
            unit={avgCycle === null ? undefined : "ticks"}
            hint="Assigned → delivered, retained missions"
          />
          <Stat
            label="Fleet utilisation"
            value={empty ? "—" : formatPercent(metrics.utilisation, 1)}
            hint="Busy robot-ticks ÷ elapsed robot-ticks"
          />
        </PanelBody>
      </Panel>

      {empty ? (
        <Panel className="px-6 py-14 text-center text-sm text-text-secondary">
          No data yet. Start playback in the Simulation Studio or from the Overview to collect analytics.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Deliveries over time"
              description={`Completed deliveries per ${bucketSize}-tick interval`}
              actions={
                <FilterTabs
                  label="Throughput view"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "chart", label: "Chart" },
                    { value: "table", label: "Table" },
                  ]}
                />
              }
            />
            <PanelBody>
              {view === "chart" ? (
                <ThroughputChart buckets={buckets} />
              ) : (
                <div className="scrollbar-thin max-h-[220px] overflow-y-auto rounded-md border border-line">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Interval</Th>
                        <Th className="text-right">Deliveries</Th>
                      </Tr>
                    </THead>
                    <tbody>
                      {buckets.map((b) => (
                        <Tr key={b.start}>
                          <Td className="tabular h-8 font-mono">
                            {formatTick(b.start)} – {formatTick(b.end)}
                          </Td>
                          <Td className="tabular h-8 text-right font-mono">{b.deliveries}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Time allocation by robot" description="Share of elapsed ticks spent in each activity" />
            <PanelBody>
              <TimeAllocation robots={snapshot.robots} tick={tick} />
            </PanelBody>
          </Panel>
        </div>
      )}

      <Panel>
        <PanelHeader title="Per-robot breakdown" icon={<Table2 />} description="Underlying numbers for the charts above" />
        <Table className="min-w-[760px]">
          <THead>
            <Tr>
              <Th>Robot</Th>
              <Th className="text-right">Deliveries</Th>
              <Th className="text-right">Distance</Th>
              <Th className="text-right">Moving</Th>
              <Th className="text-right">Loading / unloading</Th>
              <Th className="text-right">Waiting</Th>
              <Th className="text-right">Idle · charging · fault</Th>
            </Tr>
          </THead>
          <tbody>
            {snapshot.robots.map((robot) => {
              const a = allocation(robot, tick);
              return (
                <Tr key={robot.id}>
                  <Td>
                    <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
                  </Td>
                  <Td className="tabular text-right font-mono">{robot.stats.deliveries}</Td>
                  <Td className="tabular text-right font-mono">{robot.stats.distance}</Td>
                  <Td className="tabular text-right font-mono">{a.moving}</Td>
                  <Td className="tabular text-right font-mono">{a.handling}</Td>
                  <Td className="tabular text-right font-mono">{a.waiting}</Td>
                  <Td className="tabular text-right font-mono text-text-secondary">{a.idle}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <PlannedNote mission="Mission 007">
        <BarChart3 className="mr-1 inline size-3.5 align-[-2px]" />
        Derived congestion measures (per-cell occupancy heat from the movement log, blocked-wait time per aisle),
        queue wait time per mission and cross-scenario comparison are planned. Waiting ticks above come from the
        engine&apos;s occupancy guard: a robot waits when its next cell is held by another robot.
      </PlannedNote>
    </PageContainer>
  );
}
