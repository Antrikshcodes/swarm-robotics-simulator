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

## Mission 003 — Scheduling and operator tooling

Much of the original Mission 003 (A*, queue, assignment, live task creation, path visualisation) landed in Mission 002. Remaining:

- [ ] Mission priorities, deadlines and assignment beyond greedy nearest-robot (e.g. batch / Hungarian assignment).
- [ ] Multi-cell aisle closure tooling (drag-select a segment) and scheduled reopen.
- [ ] Scenario editor or import for custom layouts.
- [ ] Engine checkpoints for faster long-range seek.

## Mission 004 — Multi-robot coordination and safety

- [ ] Implement time-indexed cell reservations (replace the occupancy guard's "free right now" check).
- [ ] Implement directed-edge reservations and head-on swap prevention at planning time *(swaps are already impossible at execution time and checked by invariants)*.
- [ ] Add conflict-aware replanning.
- [x] Invariant checks for collisions, swaps, custody and mission consistency *(Mission 002)*; [ ] adversarial / property-based tests.

## Mission 005 — Deadlock detection and recovery

- [ ] Detect wait cycles and prolonged blocked dependencies.
- [ ] Implement a bounded recovery policy for narrow aisles.
- [ ] Test that congestion is not incorrectly classified as deadlock.

## Mission 006 — Failure recovery and dynamic changes

- [ ] Model robot failure states.
- [ ] Preserve package custody and delivery history.
- [ ] Transfer/reassign work through explicit atomic state changes.
- [ ] Implement dynamic aisle closures and route invalidation/replanning.
- [ ] Verify no simulation reset is required.

## Mission 007 — Metrics, polish, and judging scenarios

- [ ] Calculate completed jobs, waiting time, congestion, and utilisation from event data.
- [ ] Add scenario controls for all required demonstrations.
- [ ] Add event log and explainable decision traces.
- [ ] Run end-to-end tests and performance checks.
- [ ] Prepare concise demo flow and technical explanation.

## Delivery rule

A milestone is complete only when its acceptance checks pass, documentation is current, and the app can be built and demonstrated from a clean checkout.
