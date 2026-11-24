"use client";

import { Box, Lock, LockOpen, MapPin, Navigation } from "lucide-react";
import { cellKindAt, isTraversable, stationAt } from "@/engine";
import type { SimulationSnapshot, Station } from "@/types/simulation";
import { Button } from "@/components/ui/button";
import { NewMissionForm } from "@/components/missions/new-mission-form";
import { useSimulationStore } from "@/store/simulation-store";
import { cellRef } from "@/lib/format";
import { STATION_KIND } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Dash, Row, Section } from "./inspector-primitives";

const CELL_DESCRIPTION: Record<string, string> = {
  floor: "Open floor. Traversable.",
  lane: "Marked travel lane. Traversable.",
  narrow: "One-cell passage. Only one robot can occupy each cell; opposing robots wait and the lower-ranked one replans after a bounded wait.",
  rack: "Storage rack. Not traversable.",
  obstacle: "Structural obstacle. Not traversable.",
  pickup: "Pickup station.",
  dropoff: "Drop-off station.",
  charger: "Charging dock.",
};

export function StationInspector({ station, snapshot }: { station: Station; snapshot: SimulationSnapshot }) {
  const meta = STATION_KIND[station.kind];
  const docked = snapshot.robots.find((r) => r.position.x === station.position.x && r.position.y === station.position.y);
  const inbound = snapshot.robots.filter((r) => r.destinationStationId === station.id && r.id !== docked?.id);
  const field = station.kind === "pickup" ? "pickupStationId" : "dropoffStationId";
  const missions = station.kind === "charger" ? [] : snapshot.missions.filter((m) => m[field] === station.id);
  const open = missions.filter((m) => m.state !== "completed" && m.state !== "cancelled").length;
  const done = missions.filter((m) => m.state === "completed").length;

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-md border [&_svg]:size-4",
              station.kind === "pickup" ? "border-cyan/40 text-cyan" : station.kind === "dropoff" ? "border-lime/40 text-lime" : "border-line-strong text-text-secondary",
            )}
          >
            {station.kind === "charger" ? <MapPin /> : <Box />}
          </span>
          <div>
            <div className="font-mono text-sm font-medium">{station.id}</div>
            <div className="text-xs text-text-secondary">{station.label}</div>
          </div>
        </div>
      </div>
      <Section title="Station">
        <dl>
          <Row label="Type" mono={false}>{meta.label}</Row>
          <Row label="Cell">
            {cellRef(station.position)} <span className="text-text-secondary">({station.position.x}, {station.position.y})</span>
          </Row>
          <Row label="Docked robot">{docked ? docked.id : <Dash />}</Row>
          <Row label="Inbound robots">{inbound.length ? inbound.map((r) => r.id).join(", ") : <Dash />}</Row>
        </dl>
      </Section>
      {station.kind !== "charger" ? (
        <Section title="Missions">
          <dl>
            <Row label="Open">{open}</Row>
            <Row label="Completed">{done}</Row>
          </dl>
        </Section>
      ) : null}
      {station.kind === "pickup" ? (
        <Section title="Queue a mission from here">
          <NewMissionForm key={station.id} defaultPickup={station.id} compact />
        </Section>
      ) : null}
    </>
  );
}

export function CellInspector({ x, y, snapshot }: { x: number; y: number; snapshot: SimulationSnapshot }) {
  const point = { x, y };
  const kind = cellKindAt(snapshot.layout, point);
  const robot = snapshot.robots.find((r) => r.position.x === x && r.position.y === y);
  const planned = snapshot.robots.filter((r) => r.route.some((p) => p.x === x && p.y === y));
  const station = stationAt(snapshot.layout, point);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const closure = snapshot.closures.find((c) => c.cells.some((p) => p.x === x && p.y === y));
  const closable = kind !== null && isTraversable(snapshot.layout, point) && !station;
  const aisle = closable && !closure ? aisleRun(snapshot, point) : [];

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md border border-line-strong text-text-secondary">
            <Navigation className="size-4" />
          </span>
          <div>
            <div className="font-mono text-sm font-medium">Cell {cellRef(point)}</div>
            <div className="font-mono text-xs text-text-secondary">
              x {x} · y {y}
            </div>
          </div>
        </div>
        {kind ? <p className="mt-3 text-xs leading-snug text-text-secondary">{CELL_DESCRIPTION[kind]}</p> : null}
        {closure ? (
          <Button variant="outline" size="sm" className="mt-3 w-full border-line" onClick={() => dispatch({ type: "reopen_aisle", closureId: closure.id })}>
            <LockOpen />
            Reopen {closure.id}
          </Button>
        ) : closable ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="destructive" size="sm" onClick={() => dispatch({ type: "close_aisle", cells: [point], label: `Cell ${cellRef(point)} closed by operator` })}>
              <Lock />
              Close cell
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={aisle.length < 2}
              title={aisle.length >= 2 ? `Close ${aisle.length} cells: ${cellRef(aisle[0])}–${cellRef(aisle.at(-1)!)}` : "No aisle run through this cell"}
              onClick={() => dispatch({ type: "close_aisle", cells: aisle, label: `Aisle ${cellRef(aisle[0])}–${cellRef(aisle.at(-1)!)} closed by operator` })}
            >
              <Lock />
              Close aisle{aisle.length >= 2 ? ` (${aisle.length})` : ""}
            </Button>
          </div>
        ) : null}
        {robot && (closure || closable) ? (
          <p className="mt-2 text-[11px] leading-snug text-text-secondary">
            {closure
              ? `${robot.id} stands on this closed cell: it is held in place, may leave, and nobody may enter.`
              : `${robot.id} stands here. Closing keeps it in place (no teleport); it may leave and nobody else may enter.`}
          </p>
        ) : null}
      </div>
      <Section title="Cell">
        <dl>
          <Row label="Kind" mono={false}>{kind}</Row>
          <Row label="Traversable" mono={false}>
            {closure ? <span className="text-danger">Closed · {closure.id}</span> : isTraversable(snapshot.layout, point) ? "Yes" : "No"}
          </Row>
          <Row label="Station">{station?.id ?? <Dash />}</Row>
          <Row label="Occupied by">{robot?.id ?? <Dash />}</Row>
          <Row label="On planned route of">{planned.length ? planned.map((r) => r.id).join(", ") : <Dash />}</Row>
        </dl>
      </Section>
    </>
  );
}

/**
 * The straight aisle run through a cell: the longer of its row or column
 * segment of open, non-station cells, bounded by racks, walls, stations or
 * closures, and capped at 8 cells centred on the cell.
 */
function aisleRun(snapshot: SimulationSnapshot, p: { x: number; y: number }): { x: number; y: number }[] {
  const open = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < snapshot.layout.width &&
    y < snapshot.layout.height &&
    isTraversable(snapshot.layout, { x, y }) &&
    !stationAt(snapshot.layout, { x, y }) &&
    !snapshot.closures.some((c) => c.cells.some((q) => q.x === x && q.y === y));
  const run = (dx: number, dy: number) => {
    const cells = [{ x: p.x, y: p.y }];
    for (let i = 1; i <= 3 && open(p.x - dx * i, p.y - dy * i); i += 1) cells.unshift({ x: p.x - dx * i, y: p.y - dy * i });
    for (let i = 1; i <= 4 && cells.length < 8 && open(p.x + dx * i, p.y + dy * i); i += 1) cells.push({ x: p.x + dx * i, y: p.y + dy * i });
    return cells;
  };
  const row = run(1, 0);
  const column = run(0, 1);
  return column.length > row.length ? column : row;
}
