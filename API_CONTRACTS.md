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

`createSimulationSource(scenarioId, { checkInvariants? })` builds one. Invariant checking defaults to on outside production builds and throws `InvariantViolation` on any breach.

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
| `close-aisle` | `cells: GridPoint[]`, `label?` | Create closure `CL-nn`, invalidate routes | `empty-closure`, `invalid-coordinates`, `cell-not-closable`, `already-closed` |
| `reopen-aisle` | `closureId` | Remove closure | `unknown-closure` |
| `fail-robot` | `robotId`, `reason?` | Halt robot, mission → recovery-required, requeue missions whose station it blocks, release its reservations and hold its cell | `unknown-robot`, `robot-unavailable` |

World commands (`add-mission`, `cancel-mission`, `close-aisle`, `reopen-aisle`, `fail-robot`) are appended to a command log with the tick they were applied at. `seek` rebuilds state from tick 0 and re-applies logged commands at their ticks. Dispatching a world command after seeking backwards discards logged commands later than the current tick.

Scenario definitions may also schedule world commands at fixed ticks (e.g. the high-density R-07 failure at tick 40).

## Snapshot model

`SimulationSnapshot` (`src/types/simulation.ts`), read-only from the UI's perspective:

- `source: "engine"`, `scenarioId`, `tick`, `running`
- `layout`: dimensions, row-major cell kinds, stations (static)
- `closures`: active closures with cells, label, creation tick
- `robots`: pose, previous pose, heading, status, action, battery, home, mission, package, destination, `route` (reserved path, waits collapsed), `plan` (reserved position per future tick), `planStatus`, `priority`, `coordination` state, `waitingFor`, `blockedTicks`, activity note, stats (moving, waiting, busy ticks, distance, deliveries, replans)
- `missions`: priority, lifecycle state, robot, stations, tick stamps, full transition history
- `packages`: custody state, holder, location, origin/destination, custody history
- `events`: latest 300 events, oldest first (engine `E-nnnnnn` and playback `P-nnnnnn` ids)
- `movements`: latest 400 per-cell movement records
- `deliveryTicks`: tick of every delivery
- `coordination`:
  - `reservations`: `{ tick, x, y, robotId }` from the current tick onwards (current tick = present positions)
  - `holds`: `{ x, y, robotId, fromTick }` indefinite end-of-plan claims
  - `waitGraph`: `{ robotId, waitingFor, ticks }` — input for deadlock detection (Mission 004)
  - `decisions`: latest 120 `{ seq, tick, kind, robotId, otherRobotId?, cell?, message }` with kinds `wait`, `yield`, `preempt`, `replan`, `no-route`, `commit-reject`
  - `stats`: plans computed, nodes expanded, planned waits, right-of-way decisions, commit rejections, distance maps built, plans last tick
  - `horizon`: planning horizon in ticks
- `metrics`: derived fleet and mission metrics

Snapshots are new objects per change; earlier snapshots are never mutated (tested).

## Events

`SimEvent { id, seq, tick, kind, severity, message, robotId?, missionId?, packageId?, stationId?, closureId? }`.

Kinds: `scenario-loaded`, `simulation-started`, `simulation-paused`, `mission-created`, `mission-assigned`, `mission-cancelled`, `mission-requeued`, `mission-recovery-required`, `right-of-way`, `conflict-prevented`, `pickup-started`, `package-picked-up`, `dropoff-started`, `package-delivered`, `robot-waiting`, `robot-replanned`, `robot-no-path`, `robot-failed`, `robot-charging`, `battery-low`, `aisle-closed`, `aisle-reopened`. (`robot-returning-home` is reserved.) Per-cell movement is recorded separately in `movements` to keep the event log readable.

Engine event ids are deterministic for a given scenario and command sequence. Playback events (start/pause) are wall-clock history and are not replayed by seek.

## Error handling

Expected failures are returned as `EngineError { code, message }` with codes such as `invalid-priority`, `invalid-coordinates`, `unknown-robot`, `unknown-mission`, `unknown-station`, `invalid-station-kind`, `cell-not-closable`, `already-closed`, `invalid-mission-transition`, `invalid-custody-transition`, `custody-conflict`, `robot-not-at-station`, `robot-unavailable`, `already-running`, `not-running`, `no-path`.

Internal transitions that should never fail (e.g. custody during normal operation) throw `InvariantViolation` instead — that indicates an engine bug, not a user error.

Space-time planning (`planSpaceTime`) returns `{ status: "complete" | "partial" | "unreachable" | "blocked", positions, expanded, waits }`; `positions[i]` is the cell after `startTick + i`.

Spatial pathfinding returns its own explicit result: `{ ok: true, path, cost, expanded }` or `{ ok: false, reason: "invalid-start" | "invalid-goal" | "start-not-traversable" | "goal-not-traversable" | "goal-blocked" | "no-path", message }`.

## Future HTTP/WebSocket boundary

If a backend is introduced, keep HTTP for durable configuration and queries, and WebSockets (or another explicit streaming contract) for live snapshots/events. A remote engine should implement `SimulationSource` and stream the same snapshot shape. Do not duplicate authoritative planning logic in the browser and backend.
