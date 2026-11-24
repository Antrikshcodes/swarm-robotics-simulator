"use client";

import type { ReactNode } from "react";
import {
  ArrowUp,
  Box,
  Crosshair,
  MapPin,
  Navigation,
  Lock,
  LockOpen,
  Package,
  PowerOff,
  Warehouse,
  X,
} from "lucide-react";
import { cellKindAt, getScenario, isTraversable, stationAt } from "@/engine";
import type { RobotState, SimulationSnapshot, Station } from "@/types/simulation";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RobotChip } from "@/components/fleet/robot-chip";
import { NewMissionForm } from "@/components/missions/new-mission-form";
import { BatteryMeter } from "@/components/fleet/battery-meter";
import { useSimulationStore } from "@/store/simulation-store";
import { useViewportStore } from "@/store/viewport-store";
import { cellRef, formatPercent, formatTick, HEADING_DEGREES, HEADING_LABEL } from "@/lib/format";
import { MISSION_STATE, PACKAGE_STATE, ROBOT_ACTION, ROBOT_STATUS, STATION_KIND } from "@/lib/status";
import { findRobot, findStation, robotUtilisation } from "@/lib/selectors";
import { cn } from "@/lib/utils";

export function Inspector() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const select = useSimulationStore((s) => s.select);

  let body: ReactNode;
  if (selection?.kind === "robot") {
    const robot = findRobot(snapshot, selection.id);
    body = robot ? <RobotInspector robot={robot} snapshot={snapshot} /> : null;
  } else if (selection?.kind === "station") {
    const station = findStation(snapshot, selection.id);
    body = station ? <StationInspector station={station} snapshot={snapshot} /> : null;
  } else if (selection?.kind === "cell") {
    body = <CellInspector x={selection.x} y={selection.y} snapshot={snapshot} />;
  }

  return (
    <aside aria-label="Inspector" className="flex min-h-0 flex-col border-line bg-sidebar/60 lg:w-[320px] lg:border-l">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="label-caps">Inspector</span>
        {selection ? (
          <IconButton label="Clear selection" shortcut="Esc" side="left" onClick={() => select(null)}>
            <X />
          </IconButton>
        ) : null}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {body ?? <FleetRoster snapshot={snapshot} />}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ layout

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="label-caps">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-xs">
      <dt className="shrink-0 text-text-secondary">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-foreground", mono && "tabular font-mono text-[11.5px]")}>
        {children}
      </dd>
    </div>
  );
}

const Dash = () => <span className="text-text-dim">—</span>;

// ------------------------------------------------------------------- robot

function RobotInspector({ robot, snapshot }: { robot: RobotState; snapshot: SimulationSnapshot }) {
  const status = ROBOT_STATUS[robot.status];
  const mission = robot.missionId ? snapshot.missions.find((m) => m.id === robot.missionId) : undefined;
  const destination = robot.destinationStationId ? findStation(snapshot, robot.destinationStationId) : undefined;
  const centerOn = useViewportStore((s) => s.centerOn);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const pkg = robot.packageId ?? mission?.packageId;
  const custody = pkg ? snapshot.packages.find((p) => p.id === pkg) : undefined;
  const failed = robot.status === "failed";

  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <RobotChip id={robot.id} colorIndex={robot.colorIndex} className="text-sm" />
            <div className="mt-1 text-xs text-text-secondary">{robot.model} autonomous mobile robot</div>
          </div>
          <StatusBadge tone={status.tone} pulse={robot.status === "moving" || robot.status === "carrying"}>
            {status.label}
          </StatusBadge>
        </div>
        {robot.activityNote ? (
          <p
            className={cn(
              "mt-3 rounded-md border px-2.5 py-2 text-xs leading-snug",
              robot.status === "failed"
                ? "border-danger/30 bg-danger/[0.06] text-danger"
                : robot.status === "waiting"
                  ? "border-amber/30 bg-amber/[0.06] text-amber"
                  : "border-line bg-surface-sunken/50 text-text-secondary",
            )}
          >
            {robot.activityNote}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="border-line" onClick={() => centerOn(robot.position.x, robot.position.y)}>
            <Crosshair />
            Centre view
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={failed}
            onClick={() => dispatch({ type: "fail-robot", robotId: robot.id, reason: "Marked failed by operator" })}
          >
            <PowerOff />
            {failed ? "Failed" : "Mark failed"}
          </Button>
        </div>
      </div>

      <Section title="Pose">
        <dl>
          <Row label="Cell">
            {cellRef(robot.position)} <span className="text-text-secondary">({robot.position.x}, {robot.position.y})</span>
          </Row>
          <Row label="Heading">
            <span className="inline-flex items-center gap-1.5">
              <ArrowUp className="size-3 text-cyan" style={{ transform: `rotate(${HEADING_DEGREES[robot.heading]}deg)` }} />
              {HEADING_LABEL[robot.heading]}
            </span>
          </Row>
          <Row label="Next cell">{robot.route[0] ? cellRef(robot.route[0]) : <Dash />}</Row>
        </dl>
      </Section>

      <Section title="Task">
        <dl>
          <Row label="Action" mono={false}>{ROBOT_ACTION[robot.action]}</Row>
          <Row label="Mission">{mission?.id ?? <Dash />}</Row>
          <Row label="State" mono={false}>
            {mission ? (
              <StatusBadge tone={MISSION_STATE[mission.state].tone}>{MISSION_STATE[mission.state].label}</StatusBadge>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Package">
            {robot.packageId ? (
              <span className="inline-flex items-center gap-1.5 text-amber">
                <Package className="size-3" />
                {robot.packageId}
              </span>
            ) : mission ? (
              <span className="text-text-secondary">{mission.packageId} · not loaded</span>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Route">
            {mission ? (
              <>
                {mission.pickupStationId} <span className="text-text-dim">→</span> {mission.dropoffStationId}
              </>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Destination">
            {destination ? (
              <>
                {destination.id} <span className="text-text-secondary">· {cellRef(destination.position)}</span>
              </>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="A* route">{robot.route.length ? `${robot.route.length} cells` : <Dash />}</Row>
          <Row label="Blocked for">{robot.blockedTicks ? `${robot.blockedTicks} ticks` : <Dash />}</Row>
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-text-dim">
          Spatial A* route. Robots wait for occupied cells and replan after a bounded wait; time-indexed reservations
          arrive in Mission 004.
        </p>
      </Section>

      {custody ? (
        <Section title="Package custody" aside={<span className="font-mono text-[10px] text-text-dim">{custody.id}</span>}>
          <dl>
            <Row label="State" mono={false}>
              <StatusBadge tone={PACKAGE_STATE[custody.state].tone}>{PACKAGE_STATE[custody.state].label}</StatusBadge>
            </Row>
            <Row label="Holder">{custody.holderRobotId ?? <Dash />}</Row>
          </dl>
          <ol className="mt-2 flex flex-col gap-1 border-l border-line pl-3">
            {custody.history.slice(-5).map((h, i) => (
              <li key={`${h.tick}-${i}`} className="text-[11px] leading-snug text-text-secondary">
                <span className="tabular mr-1.5 font-mono text-text-dim">{formatTick(h.tick)}</span>
                {h.note}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Telemetry" aside={<span className="font-mono text-[10px] text-text-dim">SIMPLIFIED</span>}>
        <dl>
          <Row label="Battery" mono={false}>
            <BatteryMeter value={robot.battery} />
          </Row>
          <Row label="Speed">{robot.status === "moving" || robot.status === "carrying" ? "1 cell / tick" : "0"}</Row>
          <Row label="Distance travelled">{robot.stats.distance} cells</Row>
        </dl>
      </Section>

      <Section title="Performance">
        <dl>
          <Row label="Deliveries">{robot.stats.deliveries}</Row>
          <Row label="Utilisation">{formatPercent(robotUtilisation(robot, snapshot.tick))}</Row>
          <Row label="Moving ticks">{robot.stats.movingTicks}</Row>
          <Row label="Waiting ticks">{robot.stats.waitingTicks}</Row>
          <Row label="Replans">{robot.stats.replans}</Row>
        </dl>
      </Section>
    </>
  );
}

// ----------------------------------------------------------------- station

function StationInspector({ station, snapshot }: { station: Station; snapshot: SimulationSnapshot }) {
  const meta = STATION_KIND[station.kind];
  const docked = snapshot.robots.find(
    (r) => r.position.x === station.position.x && r.position.y === station.position.y,
  );
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
              station.kind === "pickup"
                ? "border-cyan/40 text-cyan"
                : station.kind === "dropoff"
                  ? "border-lime/40 text-lime"
                  : "border-line-strong text-text-secondary",
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

// -------------------------------------------------------------------- cell

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

function CellInspector({ x, y, snapshot }: { x: number; y: number; snapshot: SimulationSnapshot }) {
  const point = { x, y };
  const kind = cellKindAt(snapshot.layout, point);
  const robot = snapshot.robots.find((r) => r.position.x === x && r.position.y === y);
  const planned = snapshot.robots.filter((r) => r.route.some((p) => p.x === x && p.y === y));
  const station = stationAt(snapshot.layout, point);
  const dispatch = useSimulationStore((s) => s.dispatch);
  const closure = snapshot.closures.find((c) => c.cells.some((p) => p.x === x && p.y === y));
  const closable = kind !== null && isTraversable(snapshot.layout, point) && !station;

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
          <Button variant="outline" size="sm" className="mt-3 w-full border-line" onClick={() => dispatch({ type: "reopen-aisle", closureId: closure.id })}>
            <LockOpen />
            Reopen {closure.id}
          </Button>
        ) : closable ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-3 w-full"
            onClick={() => dispatch({ type: "close-aisle", cells: [point], label: `Cell ${cellRef(point)} closed by operator` })}
          >
            <Lock />
            Close cell to traffic
          </Button>
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

// ------------------------------------------------------------------ roster

function FleetRoster({ snapshot }: { snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  const scenario = getScenario(snapshot.scenarioId);
  return (
    <>
      <div className="border-b border-line px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Warehouse className="size-4 text-text-secondary" />
          {scenario.name}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{scenario.focus}</p>
      </div>
      <Section title={`Fleet · ${snapshot.robots.length}`} aside={<span className="font-mono text-[10px] text-text-dim">{formatTick(snapshot.tick)}</span>}>
        <ul className="-mx-2 flex flex-col">
          {snapshot.robots.map((robot) => {
            const status = ROBOT_STATUS[robot.status];
            return (
              <li key={robot.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: "robot", id: robot.id })}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RobotChip id={robot.id} colorIndex={robot.colorIndex} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-dim">
                    {robot.missionId ?? ""}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-text-dim">Select a robot, station or cell on the canvas to inspect it.</p>
      </Section>
      <Section title="Legend">
        <Legend />
      </Section>
    </>
  );
}

function Legend() {
  const items: { swatch: ReactNode; label: string }[] = [
    { swatch: <span className="size-3 rounded-[2px] border border-cyan/70 bg-cyan/10" />, label: "Pickup station" },
    { swatch: <span className="size-3 rounded-[2px] border border-lime/70 bg-lime/10" />, label: "Drop-off station" },
    { swatch: <span className="size-3 rounded-[2px] border border-text-secondary/70 bg-white/5" />, label: "Charging dock" },
    { swatch: <span className="size-3 rounded-[2px] border border-[var(--swarm-rack-edge)] bg-[var(--swarm-rack)]" />, label: "Storage rack" },
    { swatch: <span className="size-3 rounded-[2px] border border-danger/50 bg-[var(--swarm-obstacle)]" />, label: "Obstacle" },
    { swatch: <span className="h-3 w-3 border-y border-amber/60 bg-amber/15" />, label: "Narrow passage" },
    { swatch: <span className="h-0 w-3 border-t-2 border-dashed border-cyan/70" />, label: "A* route" },
    { swatch: <span className="size-3 rounded-[2px] border border-danger bg-danger/20" />, label: "Closed cell" },
    { swatch: <span className="size-2.5 rounded-[2px] bg-amber" />, label: "Carrying package" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-dashed border-amber" />, label: "Holding / waiting" },
    { swatch: <span className="size-3 rounded-[3px] border-2 border-danger" />, label: "Failed" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="flex w-3.5 justify-center">{item.swatch}</span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
