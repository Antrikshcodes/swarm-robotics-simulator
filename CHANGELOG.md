# Changelog

Notable project changes are recorded here.

## 2026-11-24 — Mission 005: robot failure recovery and dynamic aisle replanning (`feat/mission-001-frontend`)

### Added
- Failure model: `motor`, `battery`, `navigation`, `communication`, `emergency-stop` failures with records (`F-nn`), `restore_robot` with type-specific restoration (`failed → recovering → idle`).
- Package custody `recovery-required` state with `package.recovery`, `assignRescuer`, atomic `transferCustody` and `resumeCustody`.
- `src/engine/recovery/recovery-manager.ts`: package-recovery tasks (`RC-nn`), deterministic rescuer selection, handover cell, timeouts, bounded attempts, rescuer failure handling, safe failure and world-change retry.
- Commands `restore_robot`, `start_package_recovery`, `complete_package_handover`, `cancel_recovery`; `fail_robot` takes `failureType`.
- Events `robot_failed`, `robot_recovery_started`, `robot_recovery_completed`, `robot_restored`, `package_recovery_required`, `package_recovery_started`, `package_custody_transferred`, `package_delivery_resumed`, `aisle_closed`, `aisle_reopened`, `route_invalidated`, `robot_route_replanned`, `recovery_failed`; `SimEvent` gains `reason`, `failureType`, `taskId`.
- Snapshot `recovery` block; robot `failure`, `recoveryRole`, `routeEvent`.
- Recovery lab scenarios A–F; invariants for failed robots and stranded packages.
- Studio: failure-type menu, restore, failure & recovery inspector section, aisle-run closure, restoring/restored/rescuer halos, stranded-package marker, rescuer link and handover cell, route badges; failure incident detail on the Incidents page.
- 51 new tests (192 total).

### Changed
- `fail-robot`, `close-aisle`, `reopen-aisle` renamed to `fail_robot`, `close_aisle`, `reopen_aisle`; events `robot-failed`, `mission-recovery-required`, `robot-replanned`, `aisle-closed`, `aisle-reopened` replaced by the snake_case kinds above.
- A robot failing before pickup no longer strands its mission: the mission is requeued and reassigned.
- `recovery-required` missions are no longer terminal; they resume as `carrying` after a handover or restoration.
- Reopening an aisle replans robots that gain a route or a shorter one.

## 2026-11-24 — Mission 004: deadlock detection and recovery (`feat/mission-001-frontend`)

### Added
- `src/engine/deadlock`: wait-for graph (occupied / held / reserved edges, route lookahead) with Tarjan SCC cycle detection; `DeadlockManager` with persistence-confirmed detection, congestion and stall classification, deterministic yielder ranking, safe holding positions, cascading attempts, attempt budget and timeouts, safe failure and world-change retry.
- Events `deadlock_detected`, `deadlock_group_identified`, `deadlock_recovery_started`, `robot_yielded`, `recovery_route_planned`, `deadlock_resolved`, `deadlock_recovery_failed`, each with tick, robots, incident, cell, action, attempt and status.
- Snapshot `deadlocks` block; robot `waitClass` and `deadlockId`; `yielding` action; `deadlock` engine option (recovery on/off, thresholds).
- Deadlock lab scenarios A–E; scenario `group` and robot `start` positions.
- Studio: deadlock/recovering/yielding/congestion halos, red deadlock wait links, blocking cells, recovery route and holding cell; inspector wait state and incident card; chip deadlock status; grouped scenario picker.
- Incidents: deadlock incidents with a detail view (lifecycle, wait-for group, recovery decisions, event sequence).
- 49 new tests (141 total).

### Changed
- Right-of-way preemption is suspended for robots in a wait-for cycle or open deadlock incident, with a 12-tick per-pair cooldown.
- Robots in a deadlock are reported once (as the deadlock incident), not also as blocked robots.

## 2026-11-24 — Mission 003: multi-robot coordination (`feat/mission-001-frontend`)

### Added
- `src/engine/coordination`: time-indexed reservation table (cells, directed edges, holds), windowed cooperative space-time A* with exact distance heuristic, cached distance maps, `Coordinator` (prioritised replanning, right-of-way preemption, cell claiming, wait-for graph, decision log, stats), and `resolveMoves` commit-time check.
- Mission priority (`normal`, `high`, `urgent`) for assignment order and movement priority; seeded priority mix in scenarios; `add-mission` accepts `priority`.
- Snapshot `coordination` block (reservations, holds, wait-for graph, decisions, stats) and per-robot `priority`, `plan`, `planStatus`, `coordination`, `waitingFor`.
- Events `right-of-way`, `conflict-prevented`, `mission-requeued`.
- Studio: reserved cells, planned stops, wait-for arrows, priority flags, coordination chip, inspector coordination section and fleet coordination panel; Reservations (Y) and Wait-for (W) toggles; priority in mission form, Missions and Fleet tables.
- `npm run bench` scaling benchmark; 92 tests.

### Changed
- Sequential occupancy guard, step-aside and yield rule replaced by reservation-based coordination.
- Assignment uses cached distance maps and serves urgent missions first.
- Dock reservations cover only the handling window, not the dock forever.
- Missions waiting on a station blocked by a failed robot are requeued; the feed skips such stations.

### Fixed
- Robots arriving at a charger or home could stay in "moving" and never charge.
- Low-battery robots could not use another robot's home charger while that robot was out working.

## 2026-11-24 — Mission 002: real simulation engine (`feat/mission-001-frontend`)

### Added
- `WarehouseEngine`: deterministic, command-driven discrete-tick simulation that owns all world state and replaces the scripted demo playback.
- A* pathfinding (Manhattan, 4-connected, deterministic tie-breaking, explicit failure reasons).
- Package custody state machine with append-only history; mission and robot lifecycle state machines with validated transitions.
- Nearest-robot mission assignment, seeded mission feed, return-to-home and low-battery charging behaviour, simplified battery model.
- Sequential occupancy guard (no collisions or swaps) with bounded-wait replanning, a head-on yield rule and step-aside when the yielder has no alternative route.
- Commands with explicit results: start, pause, step, reset, load-scenario, select-robot, add-mission, cancel-mission, close-aisle, reopen-aisle, fail-robot; command log with deterministic seek replay.
- Event system with stable ids, separate movement log, derived metrics, `checkInvariants()` after every tick and command outside production.
- UI: command toast; inspector task / route / custody trail; Mark failed; close / reopen cell; queue mission from a pickup station; Missions page new-mission form, custody column and cancel; incident reopen; closed cells on the canvas; `ENGINE` data badge.
- 51 tests across A*, custody, lifecycles and engine behaviour (including per-tick invariants and 2 000-tick liveness for the shipped scenarios).

### Changed
- Scenarios now define robot homes, initial missions, a seeded feed and scheduled commands instead of scripted robot programs.
- Snapshot contract extended (closures, packages, movements, robot action / home / blockedTicks, mission history); `fault` status renamed `failed`.

### Removed
- `DemoPlayback` and scripted robot programs.

## 2026-11-24 — Mission 001: frontend foundation (`feat/mission-001-frontend`)

### Added
- Next.js 16 App Router application with strict TypeScript, Tailwind CSS v4, shadcn/ui (Radix), Zustand, Framer Motion, Lucide and Vitest.
- SWARM design tokens (DESIGN_SYSTEM.md palette) shared by CSS and the Canvas renderer; Geist Sans/Mono.
- Application shell: collapsible sidebar with system status, top bar with breadcrumb, scenario selector, playback status, alerts and operator menus.
- Routes: Overview, Simulation Studio, Fleet, Missions, Incidents, Analytics, Settings, plus a shell-styled 404.
- Simulation Studio: interactive Canvas warehouse, toolbar (select/pan, zoom, fit, reset, overlays, scenario), inspector, metrics strip, playback bar with speed, seekable timeline and event strip, keyboard shortcuts.
- `src/engine`: deterministic, seekable **scripted demo playback** behind a `SimulationSource` interface; three scenarios (standard, narrow aisle, high density).
- Engine test suite (20 tests).

### Notes
- All metrics are computed from the demo snapshot and badged `DEMO SCRIPT`. Routing, yielding and faults are scripted; no coordination engine exists yet.
- `AGENTS.md` (generated by `create-next-app`) is committed; it points coding agents at the bundled Next.js 16 docs.

## 2026-11-24

- Created the SWARM repository foundation.
- Added product context, architecture, design system, roadmap, task board, API contract direction, and simulation safety rules.
- Marked Mission 001 as the first implementation milestone.
