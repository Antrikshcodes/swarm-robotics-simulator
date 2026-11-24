# API Contracts

## Current status

The authority is the in-browser `WarehouseEngine` (`src/engine/warehouse-engine.ts`). There is no remote API yet. The contracts below are implemented in TypeScript and are the boundary a future backend must preserve.

## SimulationSource

```ts
interface SimulationSource {
  readonly scenarioId: string;
  getSnapshot(): SimulationSnapshot;      // cached, immutable
  step(): SimulationSnapshot;             // advance exactly one tick
  reset(): SimulationSnapshot;            // tick 0, clears the command log
  seek(tick: number): SimulationSnapshot; // deterministic replay; pauses
  dispatch(command: EngineCommand): CommandResult;
}
```

`createSimulationSource(scenarioId, { checkInvariants?, deadlock?, recovery? })` builds one. `deadlock` accepts `{ recovery?, confirmTicks?, congestionTicks?, stallTicks?, maxAttempts?, attemptTimeout?, lookahead? }` (defaults: recovery on, 4, 3, 40, 3, 60, 6). `recovery` (package recovery after robot failures) accepts `{ autoStart?, timeoutTicks?, maxAttempts?, handoverTicks? }` (defaults: true, 120, 3, 2). Invariant checking defaults to on outside production builds and throws `InvariantViolation` on any breach.

## Command model

Every command returns `Result<{ message: string; entityId?: string }>`, either `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. Nothing is silently ignored.

| Command | Payload | Effect | Notable errors |
|---|---|---|---|
| `start` | — | Mark running, emit `simulation-started` | `already-running` |
| `pause` | — | Mark paused, emit `simulation-paused` | `not-running` |
| `step` | — | Advance one tick | `already-running` |
| `reset` | — | Tick 0, clear command log | — |
| `load-scenario` | `scenarioId` | Switch scenario and reset | `unknown-scenario` |
| `select-robot` | `robotId` | Validate selection (UI-level) | `unknown-robot` |
| `add-mission` | `pickupStationId`, `dropoffStationId`, `priority?` (`normal` \| `high` \| `urgent`) | Queue mission + package | `unknown-station`, `invalid-station-kind`, `invalid-priority` |
| `cancel-mission` | `missionId` | Cancel before pickup, release reservation | `unknown-mission`, `invalid-mission-transition` |
| `close_aisle` | `cells: GridPoint[]`, `label?` | Create closure `CL-nn`; invalidate crossing routes, release their reservations, replan; occupants stay in place | `empty-closure`, `invalid-coordinates`, `cell-not-closable`, `already-closed` |
| `reopen_aisle` | `closureId` | Remove closure; replan robots that gain a (shorter) route | `unknown-closure` |
| `fail_robot` | `robotId`, `failureType?` (`motor` default \| `battery` \| `navigation` \| `communication` \| `emergency-stop`), `reason?` | Halt robot and record the failure; before pickup requeue its mission; with a package on board mark it recovery-required and open a recovery task; as a rescuer end its attempt; release its reservations and hold its cell | `unknown-robot`, `robot-unavailable`, `invalid-failure-type` |
| `restore_robot` | `robotId` | `failed → recovering` for the type's restore time, then `idle`; a holder of a stranded package resumes it (rescuer stood down) | `unknown-robot`, `robot-not-failed` |
| `start_package_recovery` | `packageId`, `rescuerId?` | (Re)start recovery of a recovery-required package with a fresh attempt budget, optionally with a chosen eligible rescuer | `unknown-package`, `package-not-stranded`, `holder-restoring`, `robot-unavailable`, `recovery-in-progress` |
| `complete_package_handover` | `packageId` | Complete the handover now (atomic custody transfer) | `unknown-package`, `no-rescuer`, `rescuer-not-adjacent` |
| `cancel_recovery` | `packageId` | Stop an open recovery before custody changes; rescuer released; package stays with the failed robot; not auto-restarted | `unknown-package`, `no-open-recovery` |

Mission 005 renamed `close-aisle`, `reopen-aisle` and `fail-robot` to the snake_case contract names above (no aliases are kept).

World commands (`add-mission`, `cancel-mission`, `close_aisle`, `reopen_aisle`, `fail_robot`, `restore_robot`, `start_package_recovery`, `complete_package_handover`, `cancel_recovery`) are appended to a command log with the tick they were applied at. `seek` rebuilds state from tick 0 and re-applies logged commands at their ticks. Dispatching a world command after seeking backwards discards logged commands later than the current tick.

Scenario definitions may also schedule world commands at fixed ticks (e.g. the high-density R-07 failure at tick 40).

## Snapshot model

`SimulationSnapshot` (`src/types/simulation.ts`), read-only from the UI's perspective:

- `source: "engine"`, `scenarioId`, `tick`, `running`
- `layout`: dimensions, row-major cell kinds, stations (static)
- `closures`: active closures with cells, label, creation tick
- `robots`: pose, previous pose, heading, status, action, battery, home, mission, package, destination, `route` (reserved path, waits collapsed), `plan` (reserved position per future tick), `planStatus`, `priority`, `coordination` state, `waitingFor`, `blockedTicks`, activity note, stats (moving, waiting, busy ticks, distance, deliveries, replans)
- `missions`: priority, lifecycle state, robot, stations, tick stamps, full transition history
- `packages`: custody state (`available`, `reserved`, `picked-up`, `in-transit`, `recovery-required`, `delivered`), holder, location, origin/destination, custody history, `recovery: { failedRobotId, taskId, rescuerId } | null` (set only while `recovery-required`)
- `events`: latest 300 events, oldest first (engine `E-nnnnnn` and playback `P-nnnnnn` ids)
- `movements`: latest 400 per-cell movement records
- `deliveryTicks`: tick of every delivery
- `coordination`:
  - `reservations`: `{ tick, x, y, robotId }` from the current tick onwards (current tick = present positions)
  - `holds`: `{ x, y, robotId, fromTick }` indefinite end-of-plan claims
  - `waitGraph`: `{ robotId, waitingFor, ticks, cell?, reason? }` — the deadlock manager's wait-for graph (`reason`: `occupied` \| `held` \| `reserved`)
  - `decisions`: latest 120 `{ seq, tick, kind, robotId, otherRobotId?, cell?, message }` with kinds `wait`, `yield`, `preempt`, `replan`, `no-route`, `commit-reject`
  - `stats`: plans computed, nodes expanded, planned waits, right-of-way decisions, commit rejections, distance maps built, plans last tick
  - `horizon`: planning horizon in ticks
- `deadlocks` (Mission 004):
  - `incidents`: latest 40 `DeadlockIncident { id: "DL-nnnn", kind: "cycle" | "stall", status: "detected" | "recovering" | "resolved" | "failed", robots, dependents, edges, blockingCells, detectedTick, resolvedTick, attempts, failureReason }`
  - each attempt: `RecoveryAttempt { attempt, yielderId, holdingCell, route, startedTick, endedTick, outcome, note }` with `outcome` one of `in-progress`, `resolved`, `escalated`, `no-holding-position`, `no-route`, `timeout`, `aborted`
  - `stats`: `detected`, `resolved`, `failed`, `attempts`, `transientCycles`; `thresholds`; `recoveryEnabled`
- robots also carry `waitClass` (`none` \| `waiting` \| `congestion` \| `deadlock` \| `recovering` \| `yielding`) and `deadlockId`; `action` may be `yielding`
- `recovery` (Mission 005):
  - `failures`: latest 60 `RobotFailure { id: "F-nn", robotId, type, reason, tick, position, missionId, packageId, status: "active" | "restoring" | "restored", restoreStartedTick, restoredTick }`
  - `tasks`: latest 40 `RecoveryTask { id: "RC-nn", packageId, missionId, failedRobotId, rescuerId, status: "pending" | "en-route" | "handover" | "completed" | "failed" | "cancelled", createdTick, completedTick, attempts, note }`
  - each attempt: `RescueAttempt { attempt, rescuerId, approachCell, startedTick, endedTick, outcome }` with `outcome` one of `in-progress`, `handed-over`, `timeout`, `rescuer-failed`, `cancelled`, `holder-restored`
  - `stats`: `failures`, `restored`, `handovers`, `recoveryFailures`; `settings`: `autoStart`, `timeoutTicks`, `maxAttempts`, `handoverTicks`
- robots also carry `failure` (latest `RobotFailure` or null), `recoveryRole` (`{ taskId, role: "holder" | "rescuer" }` or null) and `routeEvent` (`{ kind: "invalidated" | "replanned" | "no-route", tick, cause }`, kept 10 ticks); `action` may be `travel-to-recovery`, `handover` or `restoring`; status `recovering` means restoring after a failure
- `metrics`: derived fleet and mission metrics (`openIncidents` counts open deadlock incidents once; their robots are not also counted as blocked)

Snapshots are new objects per change; earlier snapshots are never mutated (tested).

## Events

`SimEvent { id, seq, tick, kind, severity, message, robotId?, missionId?, packageId?, stationId?, closureId?, robotIds?, incidentId?, attempt?, cell?, action?, status?, reason?, failureType?, taskId? }`.

Kinds: `scenario-loaded`, `simulation-started`, `simulation-paused`, `mission-created`, `mission-assigned`, `mission-cancelled`, `mission-requeued`, `right-of-way`, `conflict-prevented`, `pickup-started`, `package-picked-up`, `dropoff-started`, `package-delivered`, `robot-waiting`, `robot-no-path`, `robot-charging`, `battery-low`, plus the deadlock and failure-recovery kinds below. (`robot-returning-home` is reserved.) Mission 005 replaced `robot-failed`, `mission-recovery-required`, `robot-replanned`, `aisle-closed` and `aisle-reopened` with the snake_case kinds below.

Deadlock events (snake_case, Mission 004) always carry `tick`, `robotIds`, `incidentId`, `cell` (blocking or holding cell), `action`, `attempt` (0 before the first attempt) and `status`:

| Kind | Action | Status |
|---|---|---|
| `deadlock_detected` | `open-incident` | `detected` |
| `deadlock_group_identified` | `identify-group` / `extend-group` | `detected` |
| `deadlock_recovery_started` | `select-yielder` | `recovering` |
| `robot_yielded` | `yield-to-holding-position` (`robotId` = yielder) | `recovering` |
| `recovery_route_planned` | `reserve-route-to-holding-position` | `recovering` |
| `deadlock_resolved` | `resume` | `resolved` |
| `deadlock_recovery_failed` | `hold-safely` | `failed` |

Failure-recovery and topology events (snake_case, Mission 005) carry the tick and, where they apply, `robotId`, `robotIds`, `packageId`, `missionId`, `taskId`, `cell` (failure position, handover cell, closed cell), `reason`, `action`, `status` and `failureType`:

| Kind | When | Action / status |
|---|---|---|
| `robot_failed` | `fail_robot` applied | `halt` / `active`; `failureType`, `reason`, position |
| `robot_recovery_started` | a failed robot's work or the robot itself starts recovering | `requeue-mission`, `recover-package` or `restore-robot` |
| `robot_recovery_completed` | its work is fully recovered | `mission-reassigned`, `package-handed-over` or `resumed-by-holder` / `completed` |
| `robot_restored` | restoration finished | `restore-robot` / `restored` |
| `package_recovery_required` | a carried package is stranded (or its recovery was cancelled) | `hold-custody` / `pending`; `cancel-recovery` / `cancelled` |
| `package_recovery_started` | a rescuer is dispatched | `dispatch-rescuer` / `en-route`; `attempt`, handover `cell` |
| `package_custody_transferred` | atomic handover | `transfer-custody` / `completed` |
| `package_delivery_resumed` | the rescuer (or restored holder) continues the mission | `resume-delivery` / `completed` |
| `aisle_closed` / `aisle_reopened` | topology changed | `closureId`, first cell, affected `robotIds`, label as `reason` |
| `route_invalidated` | a robot's reserved route crossed a closed cell or a failed robot | `release-reservations`; `reason` |
| `robot_route_replanned` | that robot replanned (or found no route and holds) | `replan` / `hold`; `reason` |
| `recovery_failed` | a rescue attempt timed out (`pending`) or the task failed (`failed`) | `release-rescuer` / `hold-custody`; `reason` |

Per-cell movement is recorded separately in `movements` to keep the event log readable.

Engine event ids are deterministic for a given scenario and command sequence. Playback events (start/pause) are wall-clock history and are not replayed by seek.

## Error handling

Expected failures are returned as `EngineError { code, message }` with codes such as `invalid-priority`, `invalid-coordinates`, `unknown-robot`, `unknown-mission`, `unknown-station`, `invalid-station-kind`, `cell-not-closable`, `already-closed`, `invalid-mission-transition`, `invalid-custody-transition`, `custody-conflict`, `robot-not-at-station`, `robot-unavailable`, `already-running`, `not-running`, `no-path`, and for failure recovery `invalid-failure-type`, `robot-not-failed`, `unknown-package`, `package-not-stranded`, `holder-restoring`, `recovery-in-progress`, `no-rescuer`, `rescuer-not-adjacent`, `no-open-recovery`.

Internal transitions that should never fail (e.g. custody during normal operation) throw `InvariantViolation` instead — that indicates an engine bug, not a user error.

Space-time planning (`planSpaceTime`) returns `{ status: "complete" | "partial" | "unreachable" | "blocked", positions, expanded, waits }`; `positions[i]` is the cell after `startTick + i`.

Spatial pathfinding returns its own explicit result: `{ ok: true, path, cost, expanded }` or `{ ok: false, reason: "invalid-start" | "invalid-goal" | "start-not-traversable" | "goal-not-traversable" | "goal-blocked" | "no-path", message }`.

## Future HTTP/WebSocket boundary

If a backend is introduced, keep HTTP for durable configuration and queries, and WebSockets (or another explicit streaming contract) for live snapshots/events. A remote engine should implement `SimulationSource` and stream the same snapshot shape. Do not duplicate authoritative planning logic in the browser and backend.

## Mission 006 analytics consumption

The analytics UI reads existing `SimulationSnapshot` fields and adds no mutable engine API. Time-filtered delivery throughput uses `deliveryTicks`; mission cycle time and state use lifecycle timestamps; utilization, waiting, distance, deadlock and recovery totals use cumulative snapshot counters. Movement-density cells derive from `movements`; the event timeline derives from `events`.

The mission model has no distinct `failed` state; analytics reports cancelled missions as failed/cancelled and keeps `recovery-required` work active. Scenario scope is the current run because the snapshot contract has no archived cross-run dataset. Operational events and movements are bounded; consumers must label these as retained-history measures.
