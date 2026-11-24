# SWARM — Warehouse Robot Coordination Arena

> **One warehouse. Multiple robots. Zero collisions.**

SWARM is an autonomous multi-robot warehouse coordination and simulation platform. It models a configurable warehouse, assigns pickup and drop-off missions, plans routes through space and time, prevents robot conflicts, and recovers from failures and dynamic aisle blockages without resetting the simulation.

## Project status

**Phase:** Missions 001–005 implemented; Mission 006 analytics and judge Demo Mode in progress
**Problem statement:** NexHack 2.0 — PS 05
**Repository:** [Antrikshcodes/swarm-robotics-simulator](https://github.com/Antrikshcodes/swarm-robotics-simulator)
**Working branch:** `feat/mission-001-frontend` (Missions 001–005; not merged to `main`)

The Simulation Studio is driven by a **deterministic, command-driven engine** with **reservation-based multi-robot coordination**: robots plan cooperatively in space and time over a shared table of cell and edge reservations, wait or detour instead of colliding, and resolve competition by mission priority. **Deadlocks** (circular waits, narrow-aisle standoffs, stalled robots) are detected on a wait-for graph, told apart from ordinary congestion, and recovered autonomously by a bounded, deterministic yield-to-holding-position strategy. **Robot failures** are recovered without losing work: missions not yet picked up are reassigned, packages stranded on a failed robot are taken over by the nearest free robot through an atomic custody handover, and failed robots can be restored. **Aisles** can be closed and reopened at runtime; affected routes are invalidated and replanned without a reset.

## What works today

| Area | Implemented |
|---|---|
| Shell | Persistent sidebar (collapsible, persisted), top bar with breadcrumb, scenario selector, playback status, alerts menu, operator menu |
| Overview `/` | Fleet and mission KPIs, live warehouse preview, active alerts, fleet activity, recent events |
| Simulation Studio `/simulation` | Canvas warehouse (racks, lanes, narrow passages, obstacles, stations, closures, robots, reserved cells, planned stops, wait-for arrows, priority flags, rulers, **deadlock halos, blocking cells, recovery routes and holding positions**); coordination chip and panel with deadlock status; scenario picker grouped into Operations and Deadlock lab; select/pan, zoom, fit, reset, overlay toggles; inspector for robots (task, route, custody trail, **fail with a failure type**, **restore**, failure & recovery status), stations (**queue mission**) and cells (**close cell or aisle run / reopen**); failure, restoring, restored and rescuer states, stranded packages, rescue links and handover cells, route invalidated/replanned badges; play/pause/step/reset, 0.5–4× speed, seekable timeline, event strip; keyboard shortcuts |
| Demo Mode `/demo` | One-click launch for six deterministic operation, conflict, deadlock, failure, closure, and stress scenarios; live warehouse view, playback and speed controls, incident timeline, and completion state |
| Fleet `/fleet` | Status-filtered robot roster, inspect-in-studio |
| Missions `/missions` | Lifecycle KPIs, **new-mission form**, state-filtered log with custody column and **cancel** |
| Incidents `/incidents` | Derived incident queue (deadlocks, robot failures, blocked / no-route robots, low battery, closures), locate, replay-from-tick, reopen closure, restore robot; **deadlock detail** and **failure detail** (lifecycle, failure record, recovery decisions, custody trail, event sequence) |
| Analytics `/analytics` | Time and robot filters, mission status filter, throughput, delivery time, mission lifecycle, utilization, waiting, distance, movement-density heatmap, deadlock/recovery counters, per-robot comparison, event timeline |
| Settings `/settings` | Tick duration, motion smoothing, canvas overlays, compact sidebar, shortcut reference |

Three scenarios ship: **Standard warehouse** (5 robots, seeded feed with high/urgent missions), **Narrow aisle** (opposing missions compete for a one-cell passage; robots reserve it in turn or take a bypass), and **High-density warehouse** (8 robots, heavy feed, R-07 failed on a dock at tick 40 — its station's missions are held and requeued).

Five **Deadlock lab** scenarios demonstrate Mission 004: **A** two-robot head-on deadlock, **B** three-robot circular wait (cascading recovery), **C** narrow-aisle standoff against a convoy, **D** temporary congestion (must *not* be reported as deadlock), **E** unrecoverable deadlock (safe failure).

Six **Recovery lab** scenarios demonstrate Mission 005: **A** failure without a package (mission reassigned), **B** failure while carrying (rescuer handover, delivered once), **C** aisle closure under moving robots (replanning), **D** closure of a cell occupied by a robot, **E** aisle reopening, **F** failure of the recovery robot itself. Demo Mode maps representative existing scenarios into a short judging flow; it does not use scripted animations.

### What the engine does

- **World model:** ASCII warehouse grid (lanes, narrow passages, racks, obstacles, pickup / drop-off / charging stations), dynamic closures, robots, missions, packages, events. All entities have stable IDs; coordinates are validated.
- **Coordination:** time-indexed cell and directed-edge reservations owned by robot id; windowed cooperative (space-time) A* with an exact distance heuristic; robots replanned only when needed, in priority order; right-of-way preemption; a robot always owns the cell it occupies; fleet-wide commit-time check as a second safety layer; wait-for graph and decision log.
- **Scheduling:** missions (normal / high / urgent) queue from the scenario, a seeded feed, or the UI; the most urgent go first to the nearest available robot. Missions whose station is blocked by a failed robot are requeued. Idle robots return home; low-battery robots seek a free charger.
- **Lifecycles:** validated mission states (`queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed`, plus `cancelled`, `recovery-required`) and package custody (`available → reserved → picked-up → in-transit → delivered`) with append-only history.
- **Safety:** no two robots in a cell and no head-on swaps — prevented when planning and re-checked at commit (0 commit-time rejections in every shipped scenario and benchmark). `checkInvariants()` runs after every tick and command outside production builds.
- **Deadlocks:** a wait-for graph (occupied / held / reserved cells on each waiting robot's route) is built every tick; strongly connected components are circular waits. A cycle is confirmed only after it persists 4 ticks with every member waiting, so congestion is never misreported. Recovery ranks the group deterministically (passage priority, convoy size, urgency, cargo, wait time, ID), sends the yielder to the nearest safe holding position off everyone else's route through the normal reservation table, cascades if a residual cycle remains, and is bounded (3 attempts, timeouts). If no safe option exists the robots hold in place and `deadlock_recovery_failed` is emitted. Recovery never teleports, resets, deletes missions or touches custody.
- **Failure recovery:** five failure types; a failed robot halts, holds its cell and is never assigned. Before pickup its mission is requeued; with a package on board the package becomes `recovery-required` (custody stays with the failed robot) and a recovery task picks the nearest free robot, which drives beside it through the normal reservation table and takes custody in one atomic handover. Timeouts, bounded attempts, rescuer failures and safe failure are handled; `restore_robot` brings a robot back after a type-specific delay.
- **Dynamic topology:** closing cells or aisle runs invalidates crossing routes (`route_invalidated`), releases their reservations and replans them (`robot_route_replanned`); robots on a closed cell stay put and nobody may enter; reopening restores normal planning.
- **Commands:** start, pause, step, reset, load scenario, select robot, add / cancel mission, `close_aisle` / `reopen_aisle`, `fail_robot` / `restore_robot`, `start_package_recovery`, `complete_package_handover`, `cancel_recovery` — each returns an explicit success or error, shown as a toast.
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

## Screenshots

Screenshots are not included in this checkout yet. Capture `/simulation`, `/demo`, and `/analytics` at desktop and mobile widths before publishing a visual project gallery.

## Judge demonstration (3–5 minutes)

1. Open **Demo Mode** and run **A — Normal warehouse operations**. Point out simultaneous pickup/drop-off work, the live tick, and deliveries.
2. Load **B — Narrow aisle conflict**. Show route reservations and how the coordinator yields or detours without cell overlap.
3. Run **C — Deadlock recovery**. Wait for the wait-for cycle to persist, then show the detected incident, selected yielder, and recovery route.
4. Run **D — Robot failure with cargo**. Show that the failed robot keeps package custody until a rescuer reaches the handover cell and resumes delivery.
5. Run **E — Dynamic aisle closure** and show invalidation/replanning; finish by loading **F — Full stress test** to summarize fleet scale and incidents.
6. Open Analytics to review throughput, per-robot work, movement-density cells, and retained event/recovery detail.

All six runs use the same simulation engine as the Studio. Scenarios are deterministic for a given initial scenario and command sequence. Time depends on playback speed and recovery confirmation thresholds.

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
| Icons / type | Lucide React · system sans and monospace stacks (offline build, platform-native rendering) |
| Tests | Vitest |
| Backend, persistence, live transport | Planned — FastAPI, PostgreSQL/Supabase, WebSockets |

## Source layout

```text
src/
  app/                 routes (/, /simulation, /demo, /fleet, /missions, /incidents, /analytics, /settings)
  components/
    layout/            app shell, top bar, playback driver, page containers
    navigation/        sidebar, nav config, brand mark
    simulation/        studio, canvas, toolbar, inspector, playback bar, preview, render hook
    overview/ demo/ fleet/ missions/ incidents/ analytics/ settings/
    ui/                shadcn primitives + SWARM primitives (Panel, Stat, StatusBadge, …)
  engine/              pure TypeScript simulation engine (no React, DOM, timers or Math.random)
    warehouse-engine.ts  WarehouseEngine: tick loop, scheduler, movement, commands, events, snapshots
    coordination/      reservation table, space-time A*, distance maps, coordinator, commit resolver
    deadlock/          wait-for graph (Tarjan SCC) and deadlock manager (detection, recovery)
    recovery/          failure records and package-recovery manager
    pathfinding/       spatial A* + min-heap
    custody/           package custody state machine
    missions/ robots/  lifecycle state machines
    world/layout.ts    ASCII warehouse parser and grid helpers
    core/              Result types, seeded PRNG
    commands.ts invariants.ts metrics.ts scenario.ts
    scenarios/         standard, narrow-aisle, high-density, deadlock-lab (A–E), recovery-lab (A–F)
  lib/
    render/            Canvas theme + pure warehouse renderer
    selectors.ts       derived incidents and analytics
    analytics.ts       filterable metrics from engine snapshots and retained histories
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

- **Deadlock recovery is heuristic, not complete.** It resolves circular waits by having one robot (or a cascade of robots) yield to a safe holding position; it does not do joint multi-robot planning. Geometries with no safe holding position (Lab E) are detected and reported as unresolved rather than solved. Stalls behind a failed robot remain until that robot is restored.
- **Failure recovery is single-rescuer and operator-restored.** A failed robot is never towed: it blocks its cell until `restore_robot`. A robot that failed on its own destination dock must be restored to finish unloading. Failures are injected by command or schedule (no stochastic failure model).
- Assignment is greedy nearest-robot by priority; no deadlines, batching or global optimisation.
- Planning horizon is 48 ticks; longer routes are planned in windows.
- Battery is a simplified model.
- Simulation state is in memory and resets on full page reload. Preferences persist in `localStorage`.
- Seek replays from tick 0 (about 0.1 s for 2 000 ticks; no checkpoints).
- Performance is measured on one machine (Apple M5) and one synthetic layout up to 32 robots.
- Analytics are scoped to the current run. Operational events (300), movements (400), finished mission records (200), recovery failure records (60), and deadlock incidents (40) are bounded histories; cumulative delivery and fleet counters are retained for the active run.
- Mission lifecycle currently has no distinct `failed` state; cancelled missions are shown as failed/cancelled, while `recovery-required` remains active.
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
