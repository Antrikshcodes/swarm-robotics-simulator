# SWARM — Warehouse Robot Coordination Arena

> **One warehouse. Multiple robots. Zero collisions.**

SWARM is an autonomous multi-robot warehouse coordination and simulation platform. It models a configurable warehouse, assigns pickup and drop-off missions, plans routes through space and time, prevents robot conflicts, and recovers from failures and dynamic aisle blockages without resetting the simulation.

## Project status

**Phase:** Mission 004 — deadlock detection and recovery (in review)
**Problem statement:** NexHack 2.0 — PS 05
**Repository:** [Antrikshcodes/swarm-robotics-simulator](https://github.com/Antrikshcodes/swarm-robotics-simulator)
**Working branch:** `feat/mission-001-frontend` (Missions 001–004; not merged to `main`)

The Simulation Studio is driven by a **deterministic, command-driven engine** with **reservation-based multi-robot coordination**: robots plan cooperatively in space and time over a shared table of cell and edge reservations, wait or detour instead of colliding, and resolve competition by mission priority. **Deadlocks** (circular waits, narrow-aisle standoffs, stalled robots) are detected on a wait-for graph, told apart from ordinary congestion, and recovered autonomously by a bounded, deterministic yield-to-holding-position strategy. Automatic *robot-failure* recovery (repair, custody transfer) is not implemented yet.

## What works today

| Area | Implemented |
|---|---|
| Shell | Persistent sidebar (collapsible, persisted), top bar with breadcrumb, scenario selector, playback status, alerts menu, operator menu |
| Overview `/` | Fleet and mission KPIs, live warehouse preview, active alerts, fleet activity, recent events |
| Simulation Studio `/simulation` | Canvas warehouse (racks, lanes, narrow passages, obstacles, stations, closures, robots, reserved cells, planned stops, wait-for arrows, priority flags, rulers, **deadlock halos, blocking cells, recovery routes and holding positions**); coordination chip and panel with deadlock status; scenario picker grouped into Operations and Deadlock lab; select/pan, zoom, fit, reset, overlay toggles; inspector for robots (task, route, custody trail, **mark failed**), stations (**queue mission**) and cells (**close / reopen**); play/pause/step/reset, 0.5–4× speed, seekable timeline, event strip; keyboard shortcuts |
| Fleet `/fleet` | Status-filtered robot roster, inspect-in-studio |
| Missions `/missions` | Lifecycle KPIs, **new-mission form**, state-filtered log with custody column and **cancel** |
| Incidents `/incidents` | Derived incident queue (deadlocks, failed robots, blocked / no-route robots, low battery, closures), locate, replay-from-tick, reopen closure; **deadlock detail** with lifecycle, wait-for group, recovery decisions and event sequence |
| Analytics `/analytics` | Throughput (chart + table), cycle time, utilisation, per-robot time allocation |
| Settings `/settings` | Tick duration, motion smoothing, canvas overlays, compact sidebar, shortcut reference |

Three scenarios ship: **Standard warehouse** (5 robots, seeded feed with high/urgent missions), **Narrow aisle** (opposing missions compete for a one-cell passage; robots reserve it in turn or take a bypass), and **High-density warehouse** (8 robots, heavy feed, R-07 failed on a dock at tick 40 — its station's missions are held and requeued).

Five **Deadlock lab** scenarios demonstrate Mission 004: **A** two-robot head-on deadlock, **B** three-robot circular wait (cascading recovery), **C** narrow-aisle standoff against a convoy, **D** temporary congestion (must *not* be reported as deadlock), **E** unrecoverable deadlock (safe failure).

### What the engine does

- **World model:** ASCII warehouse grid (lanes, narrow passages, racks, obstacles, pickup / drop-off / charging stations), dynamic closures, robots, missions, packages, events. All entities have stable IDs; coordinates are validated.
- **Coordination:** time-indexed cell and directed-edge reservations owned by robot id; windowed cooperative (space-time) A* with an exact distance heuristic; robots replanned only when needed, in priority order; right-of-way preemption; a robot always owns the cell it occupies; fleet-wide commit-time check as a second safety layer; wait-for graph and decision log.
- **Scheduling:** missions (normal / high / urgent) queue from the scenario, a seeded feed, or the UI; the most urgent go first to the nearest available robot. Missions whose station is blocked by a failed robot are requeued. Idle robots return home; low-battery robots seek a free charger.
- **Lifecycles:** validated mission states (`queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed`, plus `cancelled`, `recovery-required`) and package custody (`available → reserved → picked-up → in-transit → delivered`) with append-only history.
- **Safety:** no two robots in a cell and no head-on swaps — prevented when planning and re-checked at commit (0 commit-time rejections in every shipped scenario and benchmark). `checkInvariants()` runs after every tick and command outside production builds.
- **Deadlocks:** a wait-for graph (occupied / held / reserved cells on each waiting robot's route) is built every tick; strongly connected components are circular waits. A cycle is confirmed only after it persists 4 ticks with every member waiting, so congestion is never misreported. Recovery ranks the group deterministically (passage priority, convoy size, urgency, cargo, wait time, ID), sends the yielder to the nearest safe holding position off everyone else's route through the normal reservation table, cascades if a residual cycle remains, and is bounded (3 attempts, timeouts). If no safe option exists the robots hold in place and `deadlock_recovery_failed` is emitted. Recovery never teleports, resets, deletes missions or touches custody.
- **Commands:** start, pause, step, reset, load scenario, select robot, add / cancel mission, close / reopen aisle, mark robot failed — each returns an explicit success or error, shown as a toast.
- **Determinism:** same scenario + same command sequence ⇒ identical snapshots. The timeline seeks by replaying the command log.

Every number in the UI is derived from engine state and carries an `ENGINE` badge. See [SIMULATION_RULES.md](SIMULATION_RULES.md) for exactly what is enforced versus planned.

## Local development

Requirements: **Node.js 20.9+** (developed on Node 24) and npm.

```bash
git clone https://github.com/Antrikshcodes/swarm-robotics-simulator.git
cd swarm-robotics-simulator
git checkout feat/mission-001-frontend
npm install
npm run dev
```

Open http://localhost:3000.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` (strict) |
| `npm test` | Vitest engine tests (A*, reservations, space-time planner, coordinator, custody, lifecycles, engine behaviour, invariants) |
| `npm run bench` | Coordination scaling benchmark (4–32 robots) |
| `npm run check` | lint + typecheck + tests |

### Studio keyboard shortcuts

`Space` play/pause · `.` step · `R` reset · `Esc` clear selection · `+`/`−` zoom · `0` 100 % · `F` fit · `V`/`H` select/pan tool · `G`/`C`/`P`/`L` grid/coordinates/routes/labels · arrows pan (canvas focused).

## Technology

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict) |
| Styling and UI | Tailwind CSS v4, shadcn/ui (Radix base) |
| Motion | Framer Motion (honours reduced motion) |
| State | Zustand |
| Simulation rendering | HTML Canvas 2D |
| Icons / type | Lucide React · Geist Sans + Geist Mono |
| Tests | Vitest |
| Backend, persistence, live transport | Planned — FastAPI, PostgreSQL/Supabase, WebSockets |

## Source layout

```text
src/
  app/                 routes (/, /simulation, /fleet, /missions, /incidents, /analytics, /settings)
  components/
    layout/            app shell, top bar, playback driver, page containers
    navigation/        sidebar, nav config, brand mark
    simulation/        studio, canvas, toolbar, inspector, playback bar, preview, render hook
    overview/ fleet/ missions/ incidents/ analytics/ settings/
    ui/                shadcn primitives + SWARM primitives (Panel, Stat, StatusBadge, …)
  engine/              pure TypeScript simulation engine (no React, DOM, timers or Math.random)
    warehouse-engine.ts  WarehouseEngine: tick loop, scheduler, movement, commands, events, snapshots
    coordination/      reservation table, space-time A*, distance maps, coordinator, commit resolver
    deadlock/          wait-for graph (Tarjan SCC) and deadlock manager (detection, recovery)
    pathfinding/       spatial A* + min-heap
    custody/           package custody state machine
    missions/ robots/  lifecycle state machines
    world/layout.ts    ASCII warehouse parser and grid helpers
    core/              Result types, seeded PRNG
    commands.ts invariants.ts metrics.ts scenario.ts
    scenarios/         standard, narrow-aisle, high-density, deadlock-lab (A–E)
  lib/
    render/            Canvas theme + pure warehouse renderer
    selectors.ts       derived incidents and analytics
    status.ts format.ts
  store/               simulation, preferences (persisted), viewport
  types/simulation.ts  snapshot contract shared by engine and UI
```

## Key technical decisions

- **Engine/UI boundary.** `src/engine` owns all world state. The UI reads immutable snapshots (`src/types/simulation.ts`) and sends commands through `dispatch()`. A remote engine could implement the same `SimulationSource` interface.
- **Explicit results.** Commands, custody transitions, lifecycle transitions and pathfinding return success/error values; internal impossibilities throw `InvariantViolation`.
- **Fixed tick order** (scheduled commands → feed → assignment → prepare → coordinate → commit → apply → deadlocks → logged commands → invariants) makes runs reproducible.
- **Deadlock recovery only changes goals and planning order.** Yielding goes through the same reservations and commit check as every other move, so recovery cannot break safety invariants. Right-of-way is suspended for robots in a wait-for cycle so the two mechanisms never fight.
- **Two safety layers.** Reservations prevent conflicts when planning; `resolveMoves` re-checks every committed move independently. Planning bugs show up as counted, evented commit rejections, never as collisions.
- **Replan only what changed.** Robots keep their reservations until their goal changes, their plan is invalidated or nearly exhausted, so cost grows with activity, not fleet size squared (see the benchmark in ARCHITECTURE.md).
- **Time is owned outside the engine.** `PlaybackDriver` turns wall-clock time into `step()` calls; the engine has no timers.
- **Canvas off the React render path**, and **one source of colour** (CSS tokens read by the renderer), as in Mission 001.

## Known limitations

- **Deadlock recovery is heuristic, not complete.** It resolves circular waits by having one robot (or a cascade of robots) yield to a safe holding position; it does not do joint multi-robot planning. Geometries with no safe holding position (Lab E) are detected and reported as unresolved rather than solved. Stalls behind a failed robot cannot be cleared until robot recovery exists.
- **No automatic failure recovery.** A failed robot keeps its package, its mission becomes `recovery-required`, and it permanently blocks its cell; there is no repair or custody-transfer command yet.
- Assignment is greedy nearest-robot by priority; no deadlines, batching or global optimisation.
- Planning horizon is 48 ticks; longer routes are planned in windows.
- Battery is a simplified model.
- Simulation state is in memory and resets on full page reload. Preferences persist in `localStorage`.
- Seek replays from tick 0 (about 0.1 s for 2 000 ticks; no checkpoints).
- Performance is measured on one machine (Apple M5) and one synthetic layout up to 32 robots.
- Desktop-first UI; no authentication or backend.

## Documentation

- [Project context](PROJECT_CONTEXT.md)
- [Architecture](ARCHITECTURE.md)
- [Design system](DESIGN_SYSTEM.md)
- [Development roadmap](DEVELOPMENT_ROADMAP.md)
- [Task board](TASK_BOARD.md)
- [API contracts](API_CONTRACTS.md)
- [Simulation rules](SIMULATION_RULES.md)
- [Changelog](CHANGELOG.md)

## Development workflow

1. Read the project context and relevant specifications before editing.
2. Implement one coherent milestone at a time on a feature branch.
3. Keep algorithmic simulation logic in `src/engine`, separate from UI components.
4. Add tests for coordination, collision safety, package custody, and recovery.
5. Run `npm run check` and `npm run build` before considering a milestone complete.
6. Keep `main` stable; review meaningful changes before merging.

## Project principles

- Safety invariants over visual effects.
- Deterministic, reproducible simulation scenarios.
- Every visible control should perform a real action.
- No fake metrics, simulated success claims, or decorative-only features.
- Preserve mission history and package ownership across failures and replanning.
