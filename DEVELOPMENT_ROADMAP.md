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

## Mission 004 — Deadlock handling and failure recovery

- [ ] Detect wait cycles on the wait-for graph and prolonged blocked dependencies after the commit phase.
- [ ] Bounded, deterministic resolution (e.g. temporary priority inversion, backing a robot out, joint planning for the pair).
- [ ] Test that congestion is not classified as deadlock.
- [ ] Recover-robot command (`failed → recovering → idle`), custody transfer and reassignment of `recovery-required` missions.
- [ ] Release a failed robot's permanent hold when it is recovered or towed.

Already in place from earlier missions: failure state modelling, custody preservation with audit history, dynamic aisle closures with route invalidation and replanning, no simulation reset required.

## Mission 005 — Metrics, polish, and judging scenarios

- [x] Completed jobs, waiting time and utilisation from engine state/events *(Missions 002–003)*; [ ] congestion measure (cell-occupancy heat, blocked-wait per aisle).
- [ ] Scenario controls for all required demonstrations (narrow passage, failure while carrying, dynamic blockage, concurrent deliveries) with one-click setup.
- [x] Event log and coordination decision trace *(Missions 002–003)*; [ ] explainable per-robot timeline.
- [ ] End-to-end UI tests and larger-map performance checks.
- [ ] Concise demo flow and technical explanation.

## Delivery rule

A milestone is complete only when its acceptance checks pass, documentation is current, and the app can be built and demonstrated from a clean checkout.
