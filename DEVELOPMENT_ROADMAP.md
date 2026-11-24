# Development Roadmap

## Milestone 0 — Repository foundation

- [x] Create public GitHub repository.
- [x] Add project source-of-truth documentation.
- [x] Clone repository locally and verify default branch.
- [x] Establish contribution and branch workflow (feature branch per mission, independent review before merge).

## Mission 001 — Frontend foundation

Status: implementation complete on `feat/mission-001-frontend`, awaiting independent review (see TASK_BOARD.md).

- [x] Inspect existing repository and preserve all files.
- [x] Scaffold Next.js App Router with TypeScript and Tailwind.
- [x] Configure design tokens, Geist fonts, and shared UI primitives.
- [x] Build application shell: sidebar, top bar, status indicators.
- [x] Build Overview page foundation.
- [x] Build Simulation Studio layout foundation. *Delivered beyond the original "grid rendering only" scope: full Canvas warehouse, interactions and playback, driven by a deterministic scripted demo.*
- [x] Add pages for Fleet, Missions, Incidents, Analytics, Settings (real content from the demo snapshot, not empty placeholders).
- [x] Add documentation updates and run lint/typecheck/build.
- [ ] Independent review (Codex) and resolution of findings.

**Out of scope (still):** pathfinding, coordination, backend, real-time network layer, persistence, and final simulation algorithms.

## Mission 002 — World model and simulation engine

Status: implementation complete on `feat/mission-001-frontend`, awaiting independent review.

- [x] Define typed warehouse, station, obstacle, closure, robot, package and mission models with stable IDs and validated coordinates.
- [x] Implement the deterministic discrete-tick simulation loop with a fixed tick order and per-tick invariant checks.
- [x] Render engine snapshots on Canvas (closures added).
- [x] Pan, zoom, selection and entity inspector connected to engine state.
- [x] Scenario loading and playback controls driving the engine; seek by command-log replay.
- [x] A* pathfinding with deterministic tie-breaking *(pulled forward from Mission 003)*.
- [x] Mission queue, nearest-robot assignment and live mission creation *(pulled forward from Mission 003)*.
- [x] Package custody state machine with explicit, audited transitions.
- [x] Command interface: start, pause, step, reset, load scenario, select robot, add/cancel mission, close/reopen aisle, mark robot failed.
- [x] Basic safety: sequential occupancy guard (no collisions, no swaps), bounded-wait replanning.
- [ ] Independent review (Codex) and resolution of findings.

## Mission 003 — Multi-robot coordination

Status: implementation complete on `feat/mission-001-frontend`, awaiting independent review.

- [x] Time-indexed cell reservations with ownership, holds, release and expiry.
- [x] Directed-edge reservations and head-on swap prevention at planning time (plus commit-time re-check).
- [x] Cooperative space-time A* with waiting actions, bounded horizon and deterministic order.
- [x] Prioritised multi-robot scheduling: mission urgency, carry bonus, aging; right-of-way preemption.
- [x] Conflict resolution recorded as decisions and engine events; wait-for graph exposed.
- [x] Dynamic route updates: closures, failures, cancellations release and rebuild reservations.
- [x] Studio visualisation of reservations, waits, priorities and coordination status.
- [x] Scaling benchmark (4–32 robots).
- [ ] Independent review (Codex) and resolution of findings.

## Mission 004 — Deadlock detection and autonomous recovery

Status: implementation complete on `feat/mission-001-frontend`, awaiting independent review.

- [x] Wait-for graph (occupied / held / reserved), cycle detection (Tarjan SCC) with all participants, after the commit phase.
- [x] Persistence threshold separating deadlock from congestion; transient cycles counted, not reported; stall detection for robots with active missions.
- [x] Bounded, deterministic recovery: candidate ranking, safe holding positions, reservation release, replanning, cascade, attempt budget and timeouts.
- [x] Narrow-aisle handling: passage priority, convoy rule, controlled back-out, no back-and-forth (right-of-way suspended in cycles, reopen window).
- [x] Safe failure: robots hold in place, `deadlock_recovery_failed`, retry only after world change.
- [x] Seven deadlock events with tick, robots, cell, action, attempt and status.
- [x] Studio, inspector and Incidents visualisation; deadlock lab scenarios A–E.
- [x] Tests: graph, cycles, thresholds, false positives, selection, holding, release/replan, bounds, failure, custody, collisions, swaps, determinism, long runs.
- [ ] Independent review (Codex) and resolution of findings.

Not in Mission 004 (delivered in Mission 005): recover-robot command (`failed → recovering → idle`), custody transfer and reassignment of `recovery-required` missions, releasing a failed robot's permanent hold.

## Mission 005 — Robot failure recovery and dynamic aisle replanning

Status: implementation complete on `feat/mission-001-frontend`, awaiting independent review.

- [x] Failure model: five failure types, failure records (robot, type, tick, position, mission, package, status), `failed → recovering → idle` with type-specific restoration.
- [x] Failed robots never move or get assignments; missions before pickup are requeued and reassigned.
- [x] Package custody: `recovery-required` state, single assigned rescuer, atomic custody transfer, resume by a restored holder, audit trail; delivered exactly once.
- [x] Recovery manager: deterministic rescuer selection, handover cell, reservations through the existing coordinator, timeouts, bounded attempts, rescuer failure, safe failure and world-change retry, operator start / cancel / complete handover.
- [x] Dynamic aisle closure: cell or aisle-run closure, route invalidation, reservation release, replanning, occupied-cell safety, reopening with replanning.
- [x] Commands `fail_robot`, `restore_robot`, `close_aisle`, `reopen_aisle`, `start_package_recovery`, `complete_package_handover`, `cancel_recovery`; thirteen snake_case events.
- [x] Studio, inspector and Incidents integration; recovery lab scenarios A–F.
- [x] Tests: every failure type, movement/assignment prevention, mission and custody preservation, atomic transfer, duplicate-custody prevention, selection, timeout, rescuer failure, closure, reopening, occupied cell, invalidation, reservation release, replanning, deadlock integration, determinism, 3 000-tick stress run.
- [ ] Independent review (Codex) and resolution of findings.

## Mission 006 — Metrics, polish, and judging scenarios (not started)

- [x] Completed jobs, waiting time and utilisation from engine state/events *(Missions 002–003)*; [ ] congestion measure (cell-occupancy heat, blocked-wait per aisle).
- [ ] Scenario controls for all required demonstrations with one-click setup *(lab scenarios for deadlocks and failure recovery exist since Missions 004–005)*.
- [x] Event log and coordination decision trace *(Missions 002–003)*; [ ] explainable per-robot timeline.
- [ ] End-to-end UI tests and larger-map performance checks.
- [ ] Concise demo flow and technical explanation.

## Delivery rule

A milestone is complete only when its acceptance checks pass, documentation is current, and the app can be built and demonstrated from a clean checkout.
