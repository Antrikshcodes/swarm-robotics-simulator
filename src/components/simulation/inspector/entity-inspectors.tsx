"use client";

import type { ReactNode } from "react";
import { Box, Crosshair, Footprints, ScanSearch, TriangleAlert, Video, Warehouse } from "lucide-react";
import type { GridPoint, SimulationSnapshot } from "@/types/simulation";
import { Button } from "@/components/ui/button";
import { RobotChip } from "@/components/fleet/robot-chip";
import { cameraActions } from "@/components/simulation/scene3d/camera-store";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { cellRef } from "@/lib/format";
import type { AisleFace, BlockInspection, Bounds, RobotNearby } from "@/lib/inspection";
import { ROBOT_STATUS, TONE_TEXT } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Dash, Row, Section } from "./inspector-primitives";

/** Identity block at the top of every entity inspector. */
export function EntityTitle({ icon, title, subtitle, accent = "neutral", aside }: { icon: ReactNode; title: ReactNode; subtitle?: ReactNode; accent?: "neutral" | "lime" | "cyan" | "amber" | "red"; aside?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4",
            accent === "lime" && "border-lime/40 text-lime",
            accent === "cyan" && "border-cyan/40 text-cyan",
            accent === "amber" && "border-amber/40 text-amber",
            accent === "red" && "border-danger/40 text-danger",
            accent === "neutral" && "border-line-strong text-text-secondary",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-medium">{title}</div>
          {subtitle ? <div className="truncate text-xs text-text-secondary">{subtitle}</div> : null}
        </div>
      </div>
      {aside}
    </div>
  );
}

/** Robot IDs as buttons that select the robot (keyboard reachable). */
export function RobotLinks({ ids, snapshot }: { ids: readonly string[]; snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  if (ids.length === 0) return <Dash />;
  return (
    <span className="inline-flex flex-wrap justify-end gap-x-2 gap-y-1">
      {ids.map((id) => {
        const robot = snapshot.robots.find((r) => r.id === id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => select({ kind: "robot", id })}
            className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Inspect ${id}`}
          >
            {robot ? <RobotChip id={id} colorIndex={robot.colorIndex} /> : id}
          </button>
        );
      })}
    </span>
  );
}

/** Nearby robots table: ID, distance, status and mission. */
export function NearbyRobots({ robots, snapshot }: { robots: readonly RobotNearby[]; snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  if (robots.length === 0) return <p className="text-xs text-text-dim">No robots within range.</p>;
  return (
    <ul className="space-y-0.5">
      {robots.map((r) => {
        const status = ROBOT_STATUS[r.status];
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => select({ kind: "robot", id: r.id })}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-1 text-left text-xs outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <RobotChip id={r.id} colorIndex={snapshot.robots.find((x) => x.id === r.id)?.colorIndex ?? r.colorIndex} />
                <span className={cn("text-[11px]", TONE_TEXT[status.tone])}>{status.label}</span>
              </span>
              <span className="tabular font-mono text-[11px] text-text-secondary">
                {r.missionId ?? "—"} · {r.distance === 0 ? "here" : `${r.distance} cell${r.distance === 1 ? "" : "s"}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Camera action for non-robot entities: frame the region in 3D, or centre
 * the 2D view on it.
 */
export function FrameButton({ bounds, label = "Frame in view" }: { bounds: Bounds; label?: string }) {
  const view = usePreferences((s) => s.studioView);
  const centerOn = useViewportStore((s) => s.centerOn);
  return (
    <Button
      variant="outline"
      size="sm"
      className="border-line"
      onClick={() => (view === "3d" ? cameraActions.focusRegion(bounds) : centerOn((bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2))}
    >
      <ScanSearch />
      {label}
    </Button>
  );
}

/** Robot camera actions: focus, follow, back to overview (3D) — or centre (2D). */
export function RobotCameraActions({ robotId, position }: { robotId: string; position: GridPoint }) {
  const view = usePreferences((s) => s.studioView);
  const centerOn = useViewportStore((s) => s.centerOn);
  if (view !== "3d") {
    return (
      <Button variant="outline" size="sm" className="border-line" onClick={() => centerOn(position.x, position.y)}>
        <Crosshair />
        Centre view
      </Button>
    );
  }
  return (
    <div role="group" aria-label={`Camera for ${robotId}`} className="col-span-2 grid grid-cols-3 gap-1.5">
      <Button variant="outline" size="sm" className="border-line px-2" onClick={() => cameraActions.focusRobot(robotId)}>
        <Crosshair />
        Focus
      </Button>
      <Button variant="outline" size="sm" className="border-line px-2" onClick={() => cameraActions.followRobot(robotId)}>
        <Video />
        Follow
      </Button>
      <Button variant="outline" size="sm" className="border-line px-2" onClick={() => cameraActions.returnToOverview()}>
        <Warehouse />
        Overview
      </Button>
    </div>
  );
}

const SIDE_LABEL: Record<AisleFace["side"], string> = { north: "North", south: "South", east: "East", west: "West" };
const KIND_WORD: Record<string, string> = { floor: "open floor", lane: "travel lane", narrow: "narrow aisle", pickup: "pickup", dropoff: "drop-off", charger: "charger" };

/** Rack block or obstacle. */
export function BlockInspector({ data, snapshot }: { data: BlockInspection; snapshot: SimulationSnapshot }) {
  const { block } = data;
  const rack = data.kind === "rack";
  const busyFaces = data.faces.filter((f) => f.robots.length > 0).length;
  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <EntityTitle
          icon={rack ? <Box /> : <TriangleAlert />}
          accent={rack ? "neutral" : "amber"}
          title={`${rack ? "Rack block" : "Obstacle"} ${data.label}`}
          subtitle={rack ? `${block.cells.length} storage bay${block.cells.length === 1 ? "" : "s"} · runs ${data.orientation === "square" ? "square" : data.orientation}` : "Structural obstacle · not traversable"}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <FrameButton bounds={block.bounds} />
          <div className="flex items-center justify-end font-mono text-[11px] text-text-secondary">
            bay {cellRef(data.picked)} ({data.picked.x}, {data.picked.y})
          </div>
        </div>
      </div>

      <Section title="Footprint">
        <dl>
          <Row label="From">
            {cellRef({ x: block.bounds.x0, y: block.bounds.y0 })} <span className="text-text-secondary">({block.bounds.x0}, {block.bounds.y0})</span>
          </Row>
          <Row label="To">
            {cellRef({ x: block.bounds.x1, y: block.bounds.y1 })} <span className="text-text-secondary">({block.bounds.x1}, {block.bounds.y1})</span>
          </Row>
          <Row label="Size">
            {block.width} × {block.depth} cells
          </Row>
          <Row label="Cells">{block.cells.length}</Row>
          <Row label="Traversable" mono={false}>
            <span className="text-danger">No</span>
          </Row>
        </dl>
      </Section>

      {rack ? (
        <Section title="Storage">
          <dl>
            <Row label="Levels" mono={false}>
              <span className="text-text-secondary">Not modelled</span>
            </Row>
            <Row label="Occupancy" mono={false}>
              <span className="text-text-secondary">Not modelled</span>
            </Row>
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-text-dim">
            The engine models racks as blocked cells. It has no inventory, storage levels or bin occupancy, so none are shown. The levels and totes in the 3D view are decorative.
          </p>
        </Section>
      ) : null}

      <Section title="Adjacent aisles" aside={<span className="font-mono text-[10.5px] text-text-dim">{busyFaces ? `${busyFaces} occupied` : null}</span>}>
        {data.faces.length === 0 ? (
          <p className="text-xs text-text-dim">Enclosed: no open cells beside this block.</p>
        ) : (
          <ul className="space-y-2">
            {data.faces.map((f) => (
              <li key={f.side} className="rounded-md border border-line px-2.5 py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{SIDE_LABEL[f.side]} face</span>
                  <span className={cn("font-mono text-[11px]", f.narrow ? "text-amber" : "text-text-secondary")}>
                    {f.cells.length} cell{f.cells.length === 1 ? "" : "s"} · {f.kinds.map((k) => KIND_WORD[k] ?? k).join(", ")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-secondary">
                  {f.closedCells ? <span className="text-danger">{f.closedCells} closed</span> : <span>Open</span>}
                  {f.stations.length ? <span className="font-mono">{f.stations.join(", ")}</span> : null}
                  {f.robots.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Footprints className="size-3" />
                      <RobotLinks ids={f.robots} snapshot={snapshot} />
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Traffic">
        <dl>
          <Row label="Routes alongside">
            <RobotLinks ids={data.routesAlongside} snapshot={snapshot} />
          </Row>
        </dl>
        <div className="mt-2">
          <NearbyRobots robots={data.nearby} snapshot={snapshot} />
        </div>
      </Section>
    </>
  );
}
