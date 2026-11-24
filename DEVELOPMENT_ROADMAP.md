# Development Roadmap

## Milestone 0 — Repository foundation

- [x] Create public GitHub repository.
- [x] Add project source-of-truth documentation.
- [ ] Clone repository locally and verify default branch.
- [ ] Establish contribution and branch workflow.

## Mission 001 — Frontend foundation

- [ ] Inspect existing repository and preserve all files.
- [ ] Scaffold Next.js App Router with TypeScript and Tailwind.
- [ ] Configure design tokens, Geist fonts, and shared UI primitives.
- [ ] Build application shell: sidebar, top bar, status indicators.
- [ ] Build Overview page foundation.
- [ ] Build Simulation Studio layout foundation with canvas placeholder/grid rendering only.
- [ ] Add route placeholders for Fleet, Missions, Incidents, Analytics, Settings.
- [ ] Add documentation updates and run lint/typecheck/build.

**Out of scope:** advanced pathfinding, backend, real-time network layer, persistence, and final simulation algorithms.

## Mission 002 — World model and visual simulator

- [ ] Define typed warehouse, station, obstacle, robot, and mission models.
- [ ] Implement deterministic discrete-tick simulation loop.
- [ ] Render grid, stations, obstacles, and robots on Canvas.
- [ ] Add pan, zoom, selection, and entity inspector.
- [ ] Add scenario loading and simulation playback controls.

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
