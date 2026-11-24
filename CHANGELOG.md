# Changelog

Notable project changes are recorded here.

## 2026-11-25 — Mission 007: interactive warehouse inspection, 3D polish and performance

### Added
- **Warehouse inspection in the 3D and 2D Studio.**
  - Click any robot, rack block, obstacle, pickup, drop-off or charging station, or aisle cell.
  - Hover outline and lime selection highlight in 3D; matching brackets in 2D.
  - Escape, ✕ or clicking empty space clears the selection.
  - Selection is shared and kept when switching between 2D and 3D.
- `EntitySelection` gains `rack` and `obstacle` kinds.
- `src/lib/inspection.ts`: pure inspection projections, used by both views and the inspector.
  - Cell → entity mapping.
  - Connected rack and obstacle blocks with adjacent aisle faces.
  - Cell occupancy, reservations, holds, wait-for edges, deadlocks, planned routes and nearby robots.
  - Station missions, inbound robots and waiting packages.
  - Robot route and wait relations.
- **Inspector panel.**
  - New rack/obstacle inspector, with storage reported as *not modelled*.
  - Extended aisle-cell and station inspectors.
  - Selected-kind label in the header and enter transition.
  - Keyboard-reachable robot links.
- **Camera.**
  - Robot camera actions: Focus, Follow, Overview.
  - **Frame in view** for racks, stations and cells (3D) or centre (2D).
- **Stress-test scenarios.** "Stress test · 15 robots" (32 × 21) and "· 32 robots" (40 × 27) are synthetic and kept out of the 14 shipped scenarios. The engine benchmark uses the same generator.
- **3D performance harness.** `tests/perf/studio-3d.perf.mjs` (`npm run perf:3d`) measures:
  - frame cadence and main-thread frame cost
  - draw calls, triangles and live resources
  - heap
  - first-frame time and selection latency
  - 2D/3D switching and scenario-load resource growth
- Results and methodology are in `docs/technical/PERFORMANCE_3D.md`.
- **Tests.** 27 new unit tests (317 in total): inspection, selection state and read-only guarantee, 2D/3D selection sync, camera actions, camera framing at many layout sizes and aspects, and stress scenarios. The E2E suite gains a 3D inspection step.

### Changed
- **Robot model** (shared with the Fleet portraits):
  - status beacon, spoked hubs, LiDAR emitter window, tote with lid
  - idle robots dimmed; waiting, failed and restoring robots pulse while running (off with reduced motion)
  - selected ring takes priority
- **Routes.** Selecting a robot mutes other routes and shows a destination pin. Wait-for links get arrowheads.
- **Stations.** Pylons with a light bar in the station's colour; charging docks with contacts.
- **Closures.** Striped barricades.
- **Floor.** Concrete pour variation and saw-cut joints.
- **Camera presets** fit the actual warehouse volume, recentred, at any layout size and aspect. Transitions ease along an arc. Small cut-away labs frame tighter.

### Performance (measured; see `docs/technical/PERFORMANCE_3D.md`)
- **Draw calls about halved.** 180 → 88 (5 robots), 425 → 205 (15), 712 → 368 (32), 267 → 129 (high density). Live geometries 55–63 → 32–36.
- **How:**
  - merged same-material robot parts
  - distance LOD for robots
  - instanced stations and closures
  - proxy pick volumes: one hit box per robot instead of about 22 raycast meshes
  - adaptive DPR capped at the display's pixel ratio (it could previously exceed it)
  - floor texture limited to 4096 px
  - robot ring materials disposed on unmount
- **Unchanged:** selection response (5.1 → 4.4 ms), first 3D frame (480 → 469 ms), FPS (vsync-capped at 60). No resource growth across 10 view switches or 12 scenario loads.

### Limits
- No rack inventory model: storage is reported as not modelled.
- 3D picking is pointer-only.
- Benchmarks come from one Apple M5 machine with headless Chrome; GPU time was not measured.

## 2026-11-25 — Mission 006 quality, analytics comparison, and E2E verification

### Added
- Explainable per-robot timeline (`src/lib/robot-timeline.ts` and `src/components/analytics/robot-timeline-panel.tsx`) surfacing mission, coordination, deadlock, recovery, and fault traces per robot.
- Cross-scenario in-memory run archiving (`src/store/run-archive.ts` and `src/components/analytics/run-archive-panel.tsx`) automatically saving summaries on reset or scenario switch, plus JSON run-report export (`src/lib/snapshot-export.ts`).
- Expanded Vitest coverage from 15 files / 196 tests to 29 files / 243 tests (world layout, robot lifecycle, all 14 deterministic scenarios, format/status helpers, selectors, robot timeline, run archive, snapshot export, and Zustand stores).
- Playwright browser E2E suite (`tests/e2e/swarm.e2e.mjs`, `npm run e2e`) covering all 9 desktop and 9 mobile routes plus interactive Studio, Fleet, Missions, Incidents, Analytics, Settings, and Demo Mode workflows.

### Changed
- Split the 840-line Studio inspector (`src/components/simulation/inspector.tsx`) into focused modules under `src/components/simulation/inspector/`.
- Clamped `throughputBuckets` index calculation at tick `0`, set `turbopack.root` in `next.config.ts`, added `@` alias resolution in `vitest.config.ts`, and updated `LandingPage` scroll detection to use viewport bounding rects.

## 2026-11-24 — Mission 006 analytics and Demo Mode

### Added
- `/demo` judge-facing scenario launcher for standard operations, narrow-aisle coordination, deadlock recovery, carrying robot failure, dynamic aisle closure, and high-density stress. Controls use the shared simulation engine and show live canvas state, metrics, and events.
- Analytics filters for time range, robot, and mission status; fleet summaries, throughput, mission cycle time, movement-density cells, recovery measures, event timeline, and robot comparison.
- `src/lib/analytics.ts` snapshot derivations and unit tests.
- `MISSION_006_AUDIT.md` documenting branch state, mission verification, baseline checks, and constraints.

### Limits
- Cross-scenario history is not archived; analytics scope is the current loaded run.
- Event and movement measures use bounded engine histories (300 events and 400 moves). Fleet waiting and utilization counters are cumulative.
- The mission model has `cancelled` but no distinct `failed` terminal state.

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
