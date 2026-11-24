"use client";

import { Archive, BookmarkPlus, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatPercent, formatTick } from "@/lib/format";
import { downloadRunReport } from "@/lib/snapshot-export";
import { summarizeSnapshotRun, type ArchivedRunSummary } from "@/store/run-archive";
import type { SimulationSnapshot } from "@/types/simulation";

export function RunArchivePanel({
  snapshot,
  archive,
  onArchiveCurrent,
  onClearArchive,
}: {
  snapshot: SimulationSnapshot;
  archive: readonly ArchivedRunSummary[];
  onArchiveCurrent: () => void;
  onClearArchive: () => void;
}) {
  const current = summarizeSnapshotRun(snapshot, 0, "manual");
  const rows: ArchivedRunSummary[] = [current, ...archive];

  return (
    <Panel>
      <PanelHeader
        title="Cross-scenario run comparison"
        icon={<Archive />}
        description="Runs are archived automatically on reset or scenario switch (in-memory for this session)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-line text-xs"
              onClick={() => downloadRunReport(snapshot, archive)}
            >
              <Download />
              Export JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-line text-xs"
              disabled={snapshot.tick === 0}
              onClick={onArchiveCurrent}
            >
              <BookmarkPlus />
              Save snapshot
            </Button>
            {archive.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-text-secondary hover:text-foreground"
                onClick={onClearArchive}
              >
                <Trash2 />
                Clear ({archive.length})
              </Button>
            ) : null}
          </div>
        }
      />
      <PanelBody className="p-0">
        {archive.length === 0 && snapshot.tick === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-text-secondary">
            Run a scenario and switch or reset it (or click Save snapshot) to compare throughput, utilisation, and recovery across runs.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-line text-[10px] uppercase tracking-wide text-text-dim">
                <tr>
                  <th className="px-4 py-2.5">Run</th>
                  <th className="px-4 py-2.5">Scenario</th>
                  <th className="px-4 py-2.5 text-right">Ticks</th>
                  <th className="px-4 py-2.5 text-right">Robots</th>
                  <th className="px-4 py-2.5 text-right">Deliveries</th>
                  <th className="px-4 py-2.5 text-right">Rate / 100t</th>
                  <th className="px-4 py-2.5 text-right">Utilisation</th>
                  <th className="px-4 py-2.5 text-right">Avg wait</th>
                  <th className="px-4 py-2.5 text-right">Deadlocks</th>
                  <th className="px-4 py-2.5 text-right">Faults / Handovers</th>
                  <th className="px-4 py-2.5 text-right">Rejects</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((run, idx) => (
                  <tr
                    key={`${run.id}-${idx}`}
                    className={
                      idx === 0
                        ? "border-b border-line/70 bg-lime/[0.03]"
                        : "border-b border-line/60 last:border-0"
                    }
                  >
                    <td className="px-4 py-3 font-mono">
                      {idx === 0 ? (
                        <span className="text-lime">LIVE</span>
                      ) : (
                        <span className="text-text-secondary">{run.id}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{run.scenarioName}</div>
                      <div className="font-mono text-[10px] text-text-dim">{run.scenarioId}</div>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono">{formatTick(run.ticks)}</td>
                    <td className="tabular px-4 py-3 text-right font-mono">{run.robots}</td>
                    <td className="tabular px-4 py-3 text-right font-mono text-lime">{run.deliveries}</td>
                    <td className="tabular px-4 py-3 text-right font-mono text-cyan">{run.deliveriesPer100Ticks.toFixed(2)}</td>
                    <td className="tabular px-4 py-3 text-right font-mono">
                      {run.ticks > 0 ? formatPercent(run.utilisation, 1) : "—"}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono">{run.avgWaitingTicks.toFixed(1)}t</td>
                    <td className="tabular px-4 py-3 text-right font-mono">
                      {run.deadlocksResolved}/{run.deadlocksDetected}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono">
                      {run.failures} / {run.handovers}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono text-lime">{run.commitRejections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
