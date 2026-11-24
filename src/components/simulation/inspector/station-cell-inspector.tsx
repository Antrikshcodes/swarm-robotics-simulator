"use client";

import { BatteryCharging, Box, Lock, LockOpen, MapPin, Navigation } from "lucide-react";
import type { SimulationSnapshot } from "@/types/simulation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { NewMissionForm } from "@/components/missions/new-mission-form";
import { useSimulationStore } from "@/store/simulation-store";
import { cellRef } from "@/lib/format";
import type { CellInspection, StationInspection } from "@/lib/inspection";
import { MISSION_STATE, STATION_KIND } from "@/lib/status";
import { cn } from "@/lib/utils";
import { EntityTitle, FrameButton, NearbyRobots, RobotLinks } from "./entity-inspectors";
import { Dash, Row, Section } from "./inspector-primitives";

const CELL_KIND: Record<string, { label: string; description: string }> = {
  floor: { label: "Open floor", description: "Open floor. Traversable." },
  lane: { label: "Travel lane", description: "Marked travel lane. Traversable." },
  narrow: {
    label: "Narrow aisle",
    description: "One-cell passage. Only one robot can occupy each cell; opposing robots wait and the lower-ranked one replans after a bounded wait.",
  },
  rack: { label: "Storage rack", description: "Storage rack. Not traversable." },
  obstacle: { label: "Obstacle", description: "Structural obstacle. Not traversable." },
  pickup: { label: "Pickup station", description: "Pickup station." },
  dropoff: { label: "Drop-off station", description: "Drop-off station." },
  charger: { label: "Charging dock", description: "Charging dock." },
};

export function StationInspector({ data, snapshot }: { data: StationInspection; snapshot: SimulationSnapshot }) {
  const { station } = data;
  const meta = STATION_KIND[station.kind];
  const charging = data.docked?.status === "charging" ? data.docked : null;
  const bounds = { x0: station.position.x, y0: station.position.y, x1: station.position.x, y1: station.position.y };

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <EntityTitle
          icon={station.kind === "charger" ? <MapPin /> : <Box />}
          accent={station.kind === "pickup" ? "cyan" : station.kind === "dropoff" ? "lime" : "neutral"}
          title={station.id}
          subtitle={`${meta.label} station · ${station.label}`}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <FrameButton bounds={bounds} />
        </div>
      </div>
      <Section title="Station">
        <dl>
          <Row label="Type" mono={false}>{meta.label}</Row>
          <Row label="Cell">
            {cellRef(station.position)} <span className="text-text-secondary">({station.position.x}, {station.position.y})</span>
          </Row>
          <Row label={station.kind === "charger" ? "Docked robot" : "Robot at station"}>
            <RobotLinks ids={data.docked ? [data.docked.id] : []} snapshot={snapshot} />
          </Row>
          {station.kind === "charger" ? (
            <Row label="Charging" mono={false}>
              {charging ? (
                <span className="inline-flex items-center gap-1.5 text-cyan">
                  <BatteryCharging className="size-3.5" />
                  {charging.id} · {Math.round(charging.battery)}%
                </span>
              ) : (
                <Dash />
              )}
            </Row>
          ) : null}
          <Row label="Inbound robots">
            <RobotLinks ids={data.inbound.map((r) => r.id)} snapshot={snapshot} />
          </Row>
          {station.kind === "pickup" ? <Row label="Packages waiting">{data.waitingPackages.length ? data.waitingPackages.join(", ") : <Dash />}</Row> : null}
        </dl>
      </Section>
      {station.kind !== "charger" ? (
        <Section title="Missions" aside={<span className="font-mono text-[10.5px] text-text-dim">{data.completed} completed</span>}>
          {data.openMissions.length === 0 ? (
            <p className="text-xs text-text-dim">No open missions start or end here.</p>
          ) : (
            <ul className="space-y-1">
              {data.openMissions.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="tabular font-mono text-[11.5px]">
                    {m.id} <span className="text-text-dim">·</span> <span className="text-text-secondary">{m.packageId}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {m.robotId ? <RobotLinks ids={[m.robotId]} snapshot={snapshot} /> : null}
                    <StatusBadge tone={MISSION_STATE[m.state].tone}>{MISSION_STATE[m.state].label}</StatusBadge>
                  </span>
                </li>
              ))}
              {data.openMissions.length > 6 ? <li className="text-[11px] text-text-dim">+{data.openMissions.length - 6} more</li> : null}
            </ul>
          )}
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

export function CellInspector({ data, snapshot }: { data: CellInspection; snapshot: SimulationSnapshot }) {
  const dispatch = useSimulationStore((s) => s.dispatch);
  const { point, closure, occupant, aisle } = data;
  const meta = CELL_KIND[data.kind];
  const closable = data.openByLayout && !data.station;
  const conflict = data.deadlocks.length > 0 || data.waits.length > 0;

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <EntityTitle
          icon={<Navigation />}
          accent={closure ? "red" : data.narrow ? "amber" : "neutral"}
          title={`Cell ${cellRef(point)}`}
          subtitle={`x ${point.x} · y ${point.y} · ${meta?.label ?? data.kind}`}
        />
        {meta ? <p className="mt-3 text-xs leading-snug text-text-secondary">{meta.description}</p> : null}
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
        {occupant && (closure || closable) ? (
          <p className="mt-2 text-[11px] leading-snug text-text-secondary">
            {closure
              ? `${occupant.id} stands on this closed cell: it is held in place, may leave, and nobody may enter.`
              : `${occupant.id} stands here. Closing keeps it in place (no teleport); it may leave and nobody else may enter.`}
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <FrameButton bounds={{ x0: point.x, y0: point.y, x1: point.x, y1: point.y }} />
        </div>
      </div>

      <Section title="Cell">
        <dl>
          <Row label="Type" mono={false}>{meta?.label ?? data.kind}</Row>
          <Row label="Traversable" mono={false}>
            {closure ? <span className="text-danger">No · closed ({closure.id})</span> : data.traversable ? <span className="text-lime">Yes</span> : <span className="text-danger">No</span>}
          </Row>
          <Row label="Narrow aisle" mono={false}>{data.narrow ? <span className="text-amber">Yes · one robot per cell</span> : "No"}</Row>
          <Row label="Closed" mono={false}>{closure ? <span className="text-danger">{closure.label}</span> : "No"}</Row>
          <Row label="Station">{data.station?.id ?? <Dash />}</Row>
          <Row label="Occupied by">
            <RobotLinks ids={occupant ? [occupant.id] : []} snapshot={snapshot} />
          </Row>
          {aisle.length >= 2 ? (
            <Row label="Aisle run">
              {cellRef(aisle[0])}–{cellRef(aisle.at(-1)!)} <span className="text-text-secondary">· {aisle.length} cells</span>
            </Row>
          ) : null}
        </dl>
      </Section>

      <Section
        title="Coordination"
        aside={conflict ? <StatusBadge tone={data.deadlocks.length ? "red" : "amber"}>{data.deadlocks.length ? "Deadlock" : "Contended"}</StatusBadge> : null}
      >
        <dl>
          <Row label="Reservations">
            {data.reservations.length ? (
              <span className="inline-flex flex-wrap justify-end gap-x-2">
                {data.reservations.slice(0, 4).map((r) => (
                  <span key={`${r.robotId}:${r.tick}`}>
                    {r.robotId} <span className="text-text-secondary">+{r.inTicks}</span>
                  </span>
                ))}
                {data.reservations.length > 4 ? <span className="text-text-dim">+{data.reservations.length - 4}</span> : null}
              </span>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="End-of-plan hold">
            <RobotLinks ids={data.holds} snapshot={snapshot} />
          </Row>
          <Row label="On planned route of">
            <RobotLinks ids={data.plannedBy} snapshot={snapshot} />
          </Row>
          <Row label="Robots waiting here">
            {data.waits.length ? (
              <span className={cn("inline-flex flex-wrap justify-end gap-x-2", "text-amber")}>
                {data.waits.map((w) => (
                  <span key={`${w.robotId}>${w.waitingFor}`}>
                    {w.robotId} → {w.waitingFor} <span className="text-text-secondary">{w.ticks}t</span>
                  </span>
                ))}
              </span>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Deadlock">{data.deadlocks.length ? <span className="text-danger">{data.deadlocks.join(", ")}</span> : <Dash />}</Row>
        </dl>
      </Section>

      <Section title="Nearby robots" aside={<span className="font-mono text-[10.5px] text-text-dim">within 3 cells</span>}>
        <NearbyRobots robots={data.nearby} snapshot={snapshot} />
      </Section>
    </>
  );
}

