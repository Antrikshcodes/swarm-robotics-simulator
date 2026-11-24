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

## Mission 002 — World model and visual simulator

Groundwork from Mission 001: typed snapshot contract, ASCII layouts, a deterministic tick loop (scripted), Canvas rendering, pan/zoom/selection/inspector, scenario loading and playback controls already exist. Mission 002 replaces the scripted playback with an authoritative world model.

- [ ] Define typed warehouse, station, obstacle, robot, and mission models as engine-owned mutable state with validated commands (see API_CONTRACTS.md).
- [ ] Implement the deterministic discrete-tick simulation loop with invariant checks.
- [ ] Render grid, stations, obstacles, and robots on Canvas *(renderer exists; connect it to engine snapshots)*.
- [ ] Add pan, zoom, selection, and entity inspector *(exists; extend for new entities such as closures)*.
- [ ] Add scenario loading and simulation playback controls *(exists; switch to the engine source)*.

## Mission 003 — Missions and pathfinding

- [ ] Implement mission queue and assignment.
- [ ] Implement A* pathfinding with deterministic tie-breaking.
- [ ] Visualise paths and mission state.
- [ ] Support task creation while simulation is running.

## Mission 004 — Multi-robot coordination and safety

- [ ] Implement time-indexed cell reservations.
- [ ] Implement directed-edge reservations and head-on swap prevention.
- [ ] Add conflict-aware replanning.
- [ ] Add invariant checks and adversarial tests.

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
