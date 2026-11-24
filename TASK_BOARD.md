# Task Board

Track work here. Keep statuses current and link code changes where practical.

## Status definitions

- **Todo:** not started
- **In progress:** actively being implemented
- **Review:** implementation complete; independent review/testing required
- **Blocked:** waiting on a dependency or decision
- **Done:** acceptance criteria satisfied and verified

## Current milestone: Mission 001 — Frontend foundation

Branch: `feat/mission-001-frontend` (not merged). Implementation tasks sit in **Review** until the independent Codex review (M1-09) completes.

| ID | Task | Status | Owner |
|---|---|---|---|
| M0-01 | Create GitHub repository | Done | Project owner |
| M0-02 | Add source-of-truth documentation | Done | ChatGPT / GitHub |
| M0-03 | Clone repository locally | Done | Project owner |
| M1-01 | Inspect existing repository and git state | Done | Claude Code |
| M1-02 | Scaffold Next.js + TypeScript + Tailwind (+ shadcn/ui, Zustand, Framer Motion, Vitest) | Review | Claude Code |
| M1-03 | Establish design tokens and typography | Review | Claude Code |
| M1-04 | Build application shell and navigation | Review | Claude Code |
| M1-05 | Build Overview page | Review | Claude Code |
| M1-06 | Build Simulation Studio (canvas, toolbar, inspector, playback, metrics, scenarios) | Review | Claude Code |
| M1-07 | Build Fleet, Missions, Incidents, Analytics, Settings routes | Review | Claude Code |
| M1-08 | Run lint, typecheck, tests, build, and route/interaction checks | Done | Claude Code |
| M1-09 | Independent review of Mission 001 | Todo | Codex |
| M1-10 | Resolve review findings and approve milestone | Todo | Claude Code + project owner |

### M1-08 verification record

Run on `feat/mission-001-frontend`, Node 24, Next.js 16.4.6:

- `npm run lint` — 0 errors, 0 warnings
- `npm run typecheck` — passes (strict)
- `npm test` — 20/20 passing (determinism, seek/reset, mission lifecycle, scripted fault, narrow-aisle timing, single-custody, script overlap/swap audit)
- `npm run build` — all 7 routes prerendered as static
- Manual browser checks at 1440×900, 1280×720 and 375×812: every route, sidebar navigation, scenario switching (toolbar and top bar), robot/station/cell selection and inspector, zoom/fit/reset/wheel/pan, grid and overlay toggles, play/pause/step/reset, speed, timeline seek, event-strip jump, incident replay, settings persistence and restore

## Current milestone: Mission 002 — Real simulation engine

Same branch (`feat/mission-001-frontend`). Implementation tasks are in **Review** pending independent review.

| ID | Task | Status | Owner |
|---|---|---|---|
| M2-01 | Inspect engine, stores, components and tests | Done | Claude Code |
| M2-02 | World model types, result/error model, seeded PRNG, layout validation | Review | Claude Code |
| M2-03 | A* pathfinding with deterministic tie-breaking + tests | Review | Claude Code |
| M2-04 | Package custody state machine + invariant tests | Review | Claude Code |
| M2-05 | Mission and robot lifecycle state machines + tests | Review | Claude Code |
| M2-06 | Discrete-tick engine: scheduler, movement, occupancy guard, replanning | Review | Claude Code |
| M2-07 | Command interface with explicit results and replayable command log | Review | Claude Code |
| M2-08 | Event system, metrics derivation, per-tick invariant checks | Review | Claude Code |
| M2-09 | Port three scenarios to engine-driven behaviour | Review | Claude Code |
| M2-10 | Integrate engine with Studio and all routes (commands, toasts, custody, closures) | Review | Claude Code |
| M2-11 | Lint, typecheck, tests, build, browser verification | Done | Claude Code |
| M2-12 | Independent review of Mission 002 | Todo | Codex |

### M2-11 verification record

- `npm run lint` — 0 errors, 0 warnings
- `npm run typecheck` — passes (strict)
- `npm test` — 51/51 passing across 4 files (A* 8, custody 8, lifecycles 6, engine 29), including 1 500-tick runs of every scenario with invariants checked each tick and 2 000-tick liveness checks
- `npm run build` — all 7 routes prerendered
- Browser (1440×900): engine-driven movement in all three scenarios; narrow-aisle head-on wait and replan; high-density scheduled R-07 failure; Mark failed (mission → recovery-required, custody retained); close / reopen cell (inspector and Incidents page); queue and cancel mission; all routes render without console errors

## Current milestone: Mission 003 — Multi-robot coordination

Same branch (`feat/mission-001-frontend`). Implementation tasks are in **Review** pending independent review.

| ID | Task | Status | Owner |
|---|---|---|---|
| M3-01 | Inspect engine, coordination needs and tests | Done | Claude Code |
| M3-02 | Time-indexed reservation table (cells, directed edges, holds, release, expiry) + tests | Review | Claude Code |
| M3-03 | Space-time cooperative A* (waits, swaps, horizon, partial plans, dock windows) + tests | Review | Claude Code |
| M3-04 | Commit-time move resolver (same cell, occupied, swap, cascades) + tests | Review | Claude Code |
| M3-05 | Coordinator: prioritised replanning, right-of-way preemption, cell claiming, wait-for graph, decisions | Review | Claude Code |
| M3-06 | Engine integration: four-phase tick, mission priority, requeue at failed stations, closure/failure release | Review | Claude Code |
| M3-07 | Studio: reservations, planned stops, wait-for arrows, priority flags, coordination panel and chip | Review | Claude Code |
| M3-08 | Scaling benchmark (4–32 robots) | Done | Claude Code |
| M3-09 | Lint, typecheck, tests, build, browser verification | Done | Claude Code |
| M3-10 | Independent review of Mission 003 | Todo | Codex |

### M3-09 verification record

- `npm run lint` — 0 errors, 0 warnings
- `npm run typecheck` — passes (strict)
- `npm test` — 92/92 passing across 9 files (reservation table 10, space-time planner 11, resolver 6, coordinator 5, engine coordination 11, plus Mission 002 suites), including 2 000-tick reservation-consistency checks for every scenario and a 5 000-tick run
- `npm run build` — all 7 routes prerendered
- `npm run bench` — 0 commit rejections at 4, 8, 16, 24 and 32 robots; 0.15–1.17 ms/tick mean
- Browser (1440×900): reservations, planned stops and priority flags in high-density; live wait (R-01 waiting for R-02) with arrow, inspector and decision log in narrow aisle; toolbar toggles; all routes render without console errors

## Next milestones

Detailed scope and acceptance criteria are in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).

## Change control

- Do not mark a task Done based only on code being written.
- Record verification commands and outcomes in the PR or commit summary.
- Keep one active coding agent per shared working tree.
- Codex reviews Claude's implementation and reports actionable findings before making broad refactors.
