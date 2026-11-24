"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Box, Crosshair, Navigation, Radio, X } from "lucide-react";
import type { RobotState, SimulationSnapshot } from "@/types/simulation";
import { readCanvasTheme } from "@/lib/render/canvas-theme";
import { cellRef, formatTick, HEADING_DEGREES, HEADING_LABEL } from "@/lib/format";
import { batteryLevel, connectivity, FLEET_FILTERS, lastActivity, missionSummary, operatingMode, robotEvents, type FleetFilter } from "@/lib/fleet";
import { MISSION_STATE, ROBOT_STATUS, TONE_DOT, TONE_TEXT, WAIT_CLASS, FAILURE_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/store/preferences-store";
import { useSimulationStore } from "@/store/simulation-store";
import { useCamera3D } from "@/components/simulation/scene3d/camera-store";
import { PortraitCanvas, RobotPortrait, usePortraitHover } from "./robot-portraits";

/**
 * Robot face cards and the robot detail panel. Every figure comes from the
 * engine snapshot in the simulation store and updates every tick.
 */
export default function FleetFaceGrid({ filter }: { filter: FleetFilter }) {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selection = useSimulationStore((s) => s.selection);
  const palette = useMemo(() => readCanvasTheme(document.documentElement).robots, []);
  const accentOf = (r: RobotState) => palette[(r.colorIndex - 1 + palette.length) % palette.length];
  const robots = snapshot.robots.filter(FLEET_FILTERS[filter]);
  const selected = selection?.kind === "robot" ? snapshot.robots.find((r) => r.id === selection.id) : undefined;

  return (
    <>
      <PortraitCanvas />
      <div className={cn("grid gap-4", selected ? "xl:grid-cols-[minmax(0,1fr)_400px]" : undefined)}>
        {robots.length === 0 ? (
          <p className="rounded-lg border border-white/[0.08] bg-[#121A1E] px-6 py-16 text-center text-sm text-[#89969C]">
            No robots match this filter at {formatTick(snapshot.tick)}.
          </p>
        ) : (
          <ul
            className={cn(
              "grid grid-cols-1 gap-4 sm:grid-cols-2",
              selected ? "lg:grid-cols-2 2xl:grid-cols-3" : "lg:grid-cols-3 2xl:grid-cols-4",
            )}
          >
            {robots.map((robot) => (
              <li key={robot.id}>
                <RobotFaceCard robot={robot} snapshot={snapshot} accent={accentOf(robot)} selected={robot.id === selected?.id} />
              </li>
            ))}
          </ul>
        )}
        {selected ? <RobotDetail robot={selected} snapshot={snapshot} accent={accentOf(selected)} /> : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------- card

function RobotFaceCard({ robot, snapshot, accent, selected }: { robot: RobotState; snapshot: SimulationSnapshot; accent: string; selected: boolean }) {
  const router = useRouter();
  const select = useSimulationStore((s) => s.select);
  const setHovered = usePortraitHover((s) => s.setHovered);
  const status = ROBOT_STATUS[robot.status];
  const mode = operatingMode(robot);
  const link = connectivity(robot);
  const mission = missionSummary(robot, snapshot);
  const activity = lastActivity(robot, snapshot.events);
  const inspectInStudio = () => {
    select({ kind: "robot", id: robot.id });
    if (usePreferences.getState().studioView === "3d") useCamera3D.getState().setPreset("follow", robot.id);
    router.push("/simulation");
  };

  return (
    <article
      aria-label={`${robot.id}, ${status.label}, battery ${Math.round(robot.battery)} percent`}
      onPointerEnter={() => setHovered(robot.id)}
      onPointerLeave={() => setHovered(null)}
      onFocus={() => setHovered(robot.id)}
      onBlur={() => setHovered(null)}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-[#121A1E]",
        "transition-[transform,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        "hover:-translate-y-1 hover:border-[#40C8E8]/45 hover:shadow-[0_14px_36px_-16px_rgba(64,200,232,0.35)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#40C8E8]",
        selected ? "border-[#B7F34A]/55" : "border-white/[0.08]",
      )}
    >
      {/* Portrait */}
      <div className="relative aspect-[4/3] overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(ellipse_at_50%_72%,#1b272d_0%,#0e1417_62%,#0b1013_100%)]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_50%_70%,black_30%,transparent_75%)]"
        />
        {/* Identity glow behind the robot */}
        <div aria-hidden className="absolute inset-x-[20%] bottom-[14%] h-[30%] rounded-full opacity-25 blur-2xl" style={{ backgroundColor: accent }} />
        {/* Scan line on hover */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#40C8E8]/70 to-transparent opacity-0 group-hover:opacity-100 motion-safe:group-hover:animate-[scanline_2.4s_ease-in-out_infinite]"
        />
        <RobotPortrait robotId={robot.id} accent={accent} className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-lg font-semibold tracking-tight text-[#F2F4F3]">
              <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
              {robot.id}
            </div>
            <div className="mt-0.5 font-mono text-[10px] tracking-[0.14em] text-[#89969C] uppercase">{robot.model}</div>
          </div>
          <StatusPill tone={status.tone} label={status.label} pulse={robot.status === "moving" || robot.status === "carrying"} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2.5 font-mono text-[10px] tracking-[0.14em] uppercase">
          <span className={TONE_TEXT[mode.tone]}>{mode.label}</span>
          <span className="flex items-center gap-1.5 text-[#89969C]">
            <Radio className={cn("size-3", link.online ? "text-[#B7F34A]" : "text-[#F06464]")} />
            {link.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <Battery value={robot.battery} />
        <Field label="Mission">
          {mission.id ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-[12.5px] text-[#F2F4F3]">{mission.id}</span>
              <span className="truncate text-[12px] text-[#89969C]">{mission.route}</span>
            </span>
          ) : (
            <span className="text-[12px] text-[#5d6b71]">No mission</span>
          )}
        </Field>
        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3.5">
          <Field label="Position">
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-[#F2F4F3]">
              <Navigation className="size-3 text-[#40C8E8]" style={{ transform: `rotate(${HEADING_DEGREES[robot.heading]}deg)` }} />
              {cellRef(robot.position)}
              <span className="text-[#5d6b71]">
                ({robot.position.x},{robot.position.y})
              </span>
            </span>
          </Field>
          <Field label="Last activity">
            <span className="block truncate text-[12px] text-[#B4BFC4]" title={activity.text}>
              {activity.text}
            </span>
          </Field>
        </div>
        <div className="flex items-center justify-between">
          {/* Primary action: the whole card is its hit area (stretched button). */}
          <button
            type="button"
            aria-pressed={selected}
            aria-label={`View robot ${robot.id}`}
            onClick={() => select({ kind: "robot", id: robot.id })}
            className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-[#89969C] uppercase transition-colors outline-none group-hover:text-[#40C8E8] after:absolute after:inset-0 after:content-['']"
          >
            View robot
            <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            aria-label={`Inspect ${robot.id} in Simulation Studio`}
            title={`Inspect ${robot.id} in Simulation Studio`}
            onClick={inspectInStudio}
            className="relative z-10 rounded-md p-1.5 text-[#89969C] transition-colors outline-none hover:bg-white/[0.05] hover:text-[#40C8E8] focus-visible:ring-2 focus-visible:ring-[#40C8E8]"
          >
            <Crosshair className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ tone, label, pulse }: { tone: keyof typeof TONE_DOT; label: string; pulse?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-white/[0.1] bg-[#0b1013]/80 px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-[#F2F4F3] uppercase">
      <span className="relative flex size-1.5">
        {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", TONE_DOT[tone])} /> : null}
        <span className={cn("relative size-1.5 rounded-full", TONE_DOT[tone])} />
      </span>
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[9.5px] tracking-[0.18em] text-[#6b7980] uppercase">{label}</div>
      {children}
    </div>
  );
}

function Battery({ value }: { value: number }) {
  const level = batteryLevel(value);
  const color = level === "critical" ? "#F06464" : level === "low" ? "#F5B942" : "#B7F34A";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between font-mono">
        <span className="text-[9.5px] tracking-[0.18em] text-[#6b7980] uppercase">Battery</span>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label="Battery">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-[1px] transition-colors duration-500"
            style={{ backgroundColor: i < Math.round(value / 5) ? color : "rgba(255,255,255,0.07)" }}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- detail

function RobotDetail({ robot, snapshot, accent }: { robot: RobotState; snapshot: SimulationSnapshot; accent: string }) {
  const router = useRouter();
  const select = useSimulationStore((s) => s.select);
  const status = ROBOT_STATUS[robot.status];
  const mode = operatingMode(robot);
  const link = connectivity(robot);
  const mission = missionSummary(robot, snapshot);
  const events = robotEvents(snapshot.events, robot.id, 8);
  const missionState = mission.state && mission.state in MISSION_STATE ? MISSION_STATE[mission.state as keyof typeof MISSION_STATE] : null;

  const focusInStudio = () => {
    usePreferences.getState().set("studioView", "3d");
    select({ kind: "robot", id: robot.id });
    useCamera3D.getState().setPreset("follow", robot.id);
    router.push("/simulation");
  };

  return (
    <aside aria-label={`${robot.id} details`} className="self-start overflow-hidden rounded-lg border border-white/[0.08] bg-[#121A1E] xl:sticky xl:top-0">
      <div className="relative aspect-[16/10] border-b border-white/[0.06] bg-[radial-gradient(ellipse_at_50%_72%,#1d2a31_0%,#0e1417_65%,#0b1013_100%)]">
        <div aria-hidden className="absolute inset-x-[22%] bottom-[12%] h-[30%] rounded-full opacity-25 blur-2xl" style={{ backgroundColor: accent }} />
        <RobotPortrait robotId={robot.id} accent={accent} framing="detail" className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-xl font-semibold text-[#F2F4F3]">
              <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
              {robot.id}
            </div>
            <div className="font-mono text-[10px] tracking-[0.14em] text-[#89969C] uppercase">{robot.model} · autonomous mobile robot</div>
          </div>
          <button
            type="button"
            aria-label="Close robot details"
            onClick={() => select(null)}
            className="rounded p-1 text-[#89969C] outline-none hover:text-[#F2F4F3] focus-visible:ring-2 focus-visible:ring-[#40C8E8]"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13px] leading-snug text-[#B4BFC4]">{robot.activityNote ?? "Parked"}</p>
        <dl className="divide-y divide-white/[0.06] border-y border-white/[0.06] text-[12px]">
          <Row k="Status">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", TONE_DOT[status.tone])} />
              {status.label}
              {robot.waitClass !== "none" && robot.waitClass !== "waiting" ? <span className={cn("ml-1", TONE_TEXT[WAIT_CLASS[robot.waitClass].tone])}>· {WAIT_CLASS[robot.waitClass].label}</span> : null}
            </span>
          </Row>
          <Row k="Mode">
            <span className={TONE_TEXT[mode.tone]}>{mode.label}</span>
          </Row>
          <Row k="Connectivity">
            <span className={TONE_TEXT[link.tone]}>{link.label}</span>
          </Row>
          <Row k="Battery">
            <span className="font-mono tabular-nums">{robot.battery.toFixed(1)}%</span>
          </Row>
          <Row k="Mission">
            {mission.id ? (
              <span className="text-right">
                <span className="font-mono">{mission.id}</span> <span className="text-[#89969C]">{mission.route}</span>
                {missionState ? <span className={cn("ml-1.5", TONE_TEXT[missionState.tone])}>{missionState.label}</span> : null}
              </span>
            ) : (
              <span className="text-[#5d6b71]">—</span>
            )}
          </Row>
          <Row k="Package">
            {robot.packageId ? (
              <span className="flex items-center gap-1 font-mono text-[#F5B942]">
                <Box className="size-3" /> {robot.packageId}
              </span>
            ) : (
              <span className="text-[#5d6b71]">Empty</span>
            )}
          </Row>
          <Row k="Position">
            <span className="font-mono">
              {cellRef(robot.position)} ({robot.position.x}, {robot.position.y}) · {HEADING_LABEL[robot.heading]}
            </span>
          </Row>
          <Row k="Destination">
            <span className="font-mono">{robot.destinationStationId ?? (robot.destination ? cellRef(robot.destination) : "—")}</span>
          </Row>
          <Row k="Planned route">
            <span className="font-mono">{robot.route.length ? `${robot.route.length} cells` : "—"}</span>
          </Row>
          {robot.waitingFor ? (
            <Row k="Waiting for">
              <span className="font-mono text-[#F5B942]">{robot.waitingFor}</span>
            </Row>
          ) : null}
          {robot.failure ? (
            <Row k="Last failure">
              <span>
                {FAILURE_TYPE[robot.failure.type].label} <span className="text-[#89969C]">{formatTick(robot.failure.tick)}</span>
              </span>
            </Row>
          ) : null}
        </dl>

        {robot.route.length ? (
          <div>
            <div className="mb-1.5 font-mono text-[9.5px] tracking-[0.18em] text-[#6b7980] uppercase">Next cells</div>
            <ol className="flex flex-wrap gap-1">
              {robot.route.slice(0, 10).map((p, i) => (
                <li key={i} className="rounded-sm border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10.5px] text-[#B4BFC4]">
                  {cellRef(p)}
                </li>
              ))}
              {robot.route.length > 10 ? <li className="px-1 font-mono text-[10.5px] text-[#5d6b71]">+{robot.route.length - 10}</li> : null}
            </ol>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 font-mono text-[9.5px] tracking-[0.18em] text-[#6b7980] uppercase">Recent events</div>
          {events.length === 0 ? (
            <p className="text-[12px] text-[#5d6b71]">No events for {robot.id} yet.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 border-l border-white/[0.08] pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-[11.5px] leading-snug text-[#B4BFC4]">
                  <span className="mr-1.5 font-mono text-[10.5px] text-[#5d6b71] tabular-nums">{formatTick(e.tick)}</span>
                  {e.message}
                </li>
              ))}
            </ol>
          )}
        </div>

        <button
          type="button"
          onClick={focusInStudio}
          className="group inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#40C8E8]/55 bg-[#40C8E8]/[0.08] font-mono text-[11.5px] font-semibold tracking-[0.14em] text-[#F2F4F3] uppercase transition-colors outline-none hover:border-[#40C8E8] hover:bg-[#40C8E8]/[0.14] focus-visible:ring-2 focus-visible:ring-[#40C8E8]"
        >
          <Crosshair className="size-3.5 text-[#40C8E8]" />
          Focus in 3D Studio
          <ArrowRight className="size-3.5 text-[#40C8E8] transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </aside>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[#89969C]">{k}</dt>
      <dd className="min-w-0 text-right text-[#F2F4F3]">{children}</dd>
    </div>
  );
}
