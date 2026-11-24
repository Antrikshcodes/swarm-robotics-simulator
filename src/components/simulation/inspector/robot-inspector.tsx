"use client";

import Link from "next/link";
import { ArrowUp, ChevronDown, HandHelping, Package, PowerOff, RotateCcw } from "lucide-react";
import type { FailureType, RobotState, SimulationSnapshot } from "@/types/simulation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { RobotChip } from "@/components/fleet/robot-chip";
import { BatteryMeter } from "@/components/fleet/battery-meter";
import { useSimulationStore } from "@/store/simulation-store";
import { cellRef, formatPercent, formatTick, HEADING_DEGREES, HEADING_LABEL } from "@/lib/format";
import {
  DEADLOCK_STATUS,
  FAILURE_STATUS,
  FAILURE_TYPE,
  MISSION_STATE,
  PACKAGE_STATE,
  RECOVERY_TASK_STATUS,
  RESCUE_OUTCOME,
  ROBOT_ACTION,
  ROBOT_STATUS,
  TONE_TEXT,
  WAIT_CLASS,
  type Tone,
} from "@/lib/status";
import { findStation, robotUtilisation } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { RobotCameraActions } from "./entity-inspectors";
import { Dash, Row, Section } from "./inspector-primitives";

const ROUTE_EVENT: Record<NonNullable<RobotState["routeEvent"]>["kind"], { label: string; tone: Tone }> = {
  invalidated: { label: "Route invalidated", tone: "amber" },
  replanned: { label: "Route replanned", tone: "lime" },
  "no-route": { label: "No route", tone: "red" },
};

const COORD_STATE: Record<RobotState["coordination"], { label: string; tone: Tone }> = {
  moving: { label: "Proceeding", tone: "cyan" },
  waiting: { label: "Waiting", tone: "amber" },
  holding: { label: "Holding", tone: "neutral" },
  dwelling: { label: "At station", tone: "cyan" },
  failed: { label: "Failed", tone: "red" },
  "no-route": { label: "No route", tone: "red" },
  blocked: { label: "Boxed in", tone: "amber" },
};

export function RobotInspector({ robot, snapshot }: { robot: RobotState; snapshot: SimulationSnapshot }) {
  const status = ROBOT_STATUS[robot.status];
  const mission = robot.missionId ? snapshot.missions.find((m) => m.id === robot.missionId) : undefined;
  const destination = robot.destinationStationId ? findStation(snapshot, robot.destinationStationId) : undefined;
  const dispatch = useSimulationStore((s) => s.dispatch);
  const pkg = robot.packageId ?? mission?.packageId;
  const custody = pkg ? snapshot.packages.find((p) => p.id === pkg) : undefined;
  const failed = robot.status === "failed";
  const restoring = robot.status === "recovering";

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
          <RobotCameraActions robotId={robot.id} position={robot.position} />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {failed ? (
            <Button size="sm" onClick={() => dispatch({ type: "restore_robot", robotId: robot.id })}>
              <RotateCcw />
              Restore
            </Button>
          ) : restoring ? (
            <Button size="sm" variant="outline" className="border-line" disabled>
              <RotateCcw />
              Restoring…
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="destructive" size="sm">
                  <PowerOff />
                  Fail robot
                  <ChevronDown className="ml-auto" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px] text-text-secondary">Inject failure type</DropdownMenuLabel>
                {(Object.keys(FAILURE_TYPE) as FailureType[]).map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onSelect={() =>
                      dispatch({
                        type: "fail_robot",
                        robotId: robot.id,
                        failureType: type,
                        reason: `${FAILURE_TYPE[type].label} (operator)`,
                      })
                    }
                  >
                    {FAILURE_TYPE[type].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {robot.routeEvent ? <RouteEventNote robot={robot} /> : null}
      </div>

      <RecoverySection robot={robot} snapshot={snapshot} />

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
      </Section>

      <CoordinationSection robot={robot} snapshot={snapshot} />

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

function RouteEventNote({ robot }: { robot: RobotState }) {
  const event = robot.routeEvent!;
  const meta = ROUTE_EVENT[event.kind];
  return (
    <p className="mt-2 flex items-center gap-2 text-[11px] leading-snug text-text-secondary">
      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      <span className="min-w-0 truncate" title={event.cause}>
        {formatTick(event.tick)} · {event.cause}
      </span>
    </p>
  );
}

function RecoverySection({ robot, snapshot }: { robot: RobotState; snapshot: SimulationSnapshot }) {
  const dispatch = useSimulationStore((s) => s.dispatch);
  const select = useSimulationStore((s) => s.select);
  const failure = robot.failure;
  const role = robot.recoveryRole;
  const task = role ? snapshot.recovery.tasks.find((t) => t.id === role.taskId) : undefined;
  const stranded = snapshot.packages.find((p) => p.state === "recovery-required" && p.holderRobotId === robot.id);
  const lastTask = stranded ? [...snapshot.recovery.tasks].reverse().find((t) => t.packageId === stranded.id) : undefined;
  const shownTask = task ?? lastTask;
  if (!failure && !shownTask) return null;
  const recentlyRestored = failure?.status === "restored" && failure.restoredTick !== null && snapshot.tick - failure.restoredTick <= 30;
  if (failure?.status === "restored" && !recentlyRestored && !shownTask) return null;
  const status = shownTask ? RECOVERY_TASK_STATUS[shownTask.status] : null;
  const attempt = shownTask?.attempts.at(-1);
  const packageId = shownTask?.packageId ?? stranded?.id;

  return (
    <Section title="Failure & recovery" aside={failure ? <StatusBadge tone={FAILURE_STATUS[failure.status].tone}>{FAILURE_STATUS[failure.status].label}</StatusBadge> : null}>
      {failure ? (
        <dl>
          <Row label="Failure" mono={false}>
            {FAILURE_TYPE[failure.type].label} <span className="font-mono text-[11px] text-text-dim">{failure.id}</span>
          </Row>
          <Row label="At">
            {formatTick(failure.tick)} · {cellRef(failure.position)}
          </Row>
          <Row label="Carrying then">{failure.packageId ?? <Dash />}</Row>
          <Row label="Mission then">{failure.missionId ?? <Dash />}</Row>
          {failure.restoredTick !== null ? <Row label="Restored">{formatTick(failure.restoredTick)}</Row> : null}
        </dl>
      ) : null}
      {shownTask && status ? (
        <div className={cn("mt-2 rounded-md border px-2.5 py-2", status.tone === "red" ? "border-danger/30 bg-danger/[0.05]" : status.tone === "lime" ? "border-lime/30 bg-lime/[0.04]" : "border-cyan/30 bg-cyan/[0.05]")}>
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="font-medium">
              {shownTask.id} · {role?.role === "rescuer" ? `recovering ${shownTask.packageId}` : `${shownTask.packageId} stranded`}
            </span>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">{shownTask.note}</p>
          {attempt ? (
            <p className="mt-1 text-[11px] text-text-secondary">
              Attempt {attempt.attempt}:{" "}
              <button type="button" className="font-mono text-cyan underline-offset-2 hover:underline" onClick={() => select({ kind: "robot", id: attempt.rescuerId })}>
                {attempt.rescuerId}
              </button>{" "}
              → {cellRef(attempt.approachCell)} · {RESCUE_OUTCOME[attempt.outcome].label}
            </p>
          ) : null}
          {role?.role === "rescuer" ? (
            <p className="mt-1 text-[11px] text-text-secondary">
              Holder:{" "}
              <button type="button" className="font-mono text-danger underline-offset-2 hover:underline" onClick={() => select({ kind: "robot", id: shownTask.failedRobotId })}>
                {shownTask.failedRobotId}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
      {packageId && stranded ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shownTask?.status === "failed" || shownTask?.status === "cancelled" ? (
            <Button size="sm" variant="outline" className="h-7 border-line text-xs" onClick={() => dispatch({ type: "start_package_recovery", packageId })}>
              <HandHelping />
              Start recovery
            </Button>
          ) : null}
          {shownTask?.status === "handover" ? (
            <Button size="sm" variant="outline" className="h-7 border-line text-xs" onClick={() => dispatch({ type: "complete_package_handover", packageId })}>
              Complete handover
            </Button>
          ) : null}
          {shownTask && ["pending", "en-route", "handover", "failed"].includes(shownTask.status) ? (
            <Button size="sm" variant="outline" className="h-7 border-line text-xs" onClick={() => dispatch({ type: "cancel_recovery", packageId })}>
              Cancel recovery
            </Button>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function CoordinationSection({ robot, snapshot }: { robot: RobotState; snapshot: SimulationSnapshot }) {
  const select = useSimulationStore((s) => s.select);
  const mission = robot.missionId ? snapshot.missions.find((m) => m.id === robot.missionId) : undefined;
  const state = COORD_STATE[robot.coordination];
  const waits = robot.plan.reduce((n, step, i) => {
    const prev = i === 0 ? robot.position : robot.plan[i - 1];
    return n + (step.x === prev.x && step.y === prev.y ? 1 : 0);
  }, 0);
  const until = robot.plan.at(-1)?.tick;
  const decisions = snapshot.coordination.decisions.filter((d) => d.robotId === robot.id).slice(-4).reverse();

  return (
    <Section title="Coordination" aside={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}>
      <dl>
        <Row label="Movement priority">
          {robot.priority}
          {mission && mission.priority !== "normal" ? (
            <span className={cn("ml-1.5", mission.priority === "urgent" ? "text-danger" : "text-amber")}>{mission.priority}</span>
          ) : null}
        </Row>
        <Row label="Waiting for" mono={false}>
          {robot.waitingFor ? (
            <button type="button" onClick={() => select({ kind: "robot", id: robot.waitingFor! })} className="font-mono text-[11.5px] text-amber underline-offset-2 hover:underline">
              {robot.waitingFor}
            </button>
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Wait state" mono={false}>
          <span className={cn("text-xs", TONE_TEXT[WAIT_CLASS[robot.waitClass].tone])} title={WAIT_CLASS[robot.waitClass].description}>
            {WAIT_CLASS[robot.waitClass].label}
          </span>
        </Row>
        <Row label="Plan">{robot.planStatus ? `${robot.planStatus}${until ? ` · to T+${until}` : ""}` : <Dash />}</Row>
        <Row label="Reserved ticks">{robot.plan.length || <Dash />}</Row>
        <Row label="Planned waits">{waits || <Dash />}</Row>
      </dl>
      <DeadlockNote robot={robot} snapshot={snapshot} />
      {robot.plan.length ? (
        <ol className="mt-2 flex flex-wrap gap-1">
          {robot.plan.slice(0, 8).map((step) => (
            <li key={step.tick} className="rounded border border-line bg-surface-sunken/60 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
              <span className="text-text-dim">+{step.tick - snapshot.tick}</span> {step.x},{step.y}
            </li>
          ))}
          {robot.plan.length > 8 ? <li className="px-1 font-mono text-[10px] text-text-dim">…</li> : null}
        </ol>
      ) : null}
      {decisions.length ? (
        <ul className="mt-3 flex flex-col gap-1 border-l border-line pl-3">
          {decisions.map((d) => (
            <li key={d.seq} className="text-[11px] leading-snug text-text-secondary">
              <span className="tabular mr-1.5 font-mono text-text-dim">{formatTick(d.tick)}</span>
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] leading-snug text-text-dim">
        Space-time A* over the shared reservation table (cells + directed edges). Priority = mission urgency + carry bonus + aging while waiting.
      </p>
    </Section>
  );
}

function DeadlockNote({ robot, snapshot }: { robot: RobotState; snapshot: SimulationSnapshot }) {
  const incident = robot.deadlockId ? snapshot.deadlocks.incidents.find((i) => i.id === robot.deadlockId) : undefined;
  if (!incident) return null;
  const status = DEADLOCK_STATUS[incident.status];
  const attempt = incident.attempts.at(-1);
  const role =
    robot.waitClass === "yielding"
      ? `Yielding to ${attempt?.holdingCell ? cellRef(attempt.holdingCell) : "a holding position"} so the group can pass.`
      : incident.status === "failed"
        ? `Holding safely: ${incident.failureReason ?? "no safe recovery"}.`
        : incident.status === "recovering" && attempt
          ? `Waiting while ${attempt.yielderId} yields (attempt ${attempt.attempt}/${snapshot.deadlocks.thresholds.maxAttempts}).`
          : `In a circular wait with ${incident.robots.filter((id) => id !== robot.id).join(", ")}.`;
  return (
    <div className={cn("mt-2 rounded-md border px-2.5 py-2", status.tone === "cyan" ? "border-cyan/30 bg-cyan/[0.05]" : "border-danger/30 bg-danger/[0.05]")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[11.5px] font-medium", TONE_TEXT[status.tone])}>
          {incident.id} · {status.label}
        </span>
        <Link href="/incidents" className="text-[11px] text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
          Incident
        </Link>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-text-secondary">{role}</p>
    </div>
  );
}
