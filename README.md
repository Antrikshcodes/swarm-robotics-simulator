# SWARM — Warehouse Robot Coordination Arena

> **One warehouse. Multiple robots. Zero collisions.**

SWARM is an autonomous multi-robot warehouse coordination and simulation platform. It models a configurable warehouse, assigns pickup and drop-off missions, plans routes through space and time, prevents robot conflicts, and recovers from failures and dynamic aisle blockages without resetting the simulation.

## Project status

**Phase:** Mission 002 — real simulation engine (in review)
**Problem statement:** NexHack 2.0 — PS 05
**Repository:** [Antrikshcodes/swarm-robotics-simulator](https://github.com/Antrikshcodes/swarm-robotics-simulator)
**Working branch:** `feat/mission-001-frontend` (Missions 001–002; not merged to `main`)

The Simulation Studio is driven by a **deterministic, command-driven engine**: A* routing, mission scheduling, package custody, aisle closures, robot failure, and per-tick safety invariants. Time-indexed reservations, deadlock detection and automatic failure recovery are **not implemented yet** (Missions 004–006).

## What works today

| Area | Implemented |
|---|---|
| Shell | Persistent sidebar (collapsible, persisted), top bar with breadcrumb, scenario selector, playback status, alerts menu, operator menu |
| Overview `/` | Fleet and mission KPIs, live warehouse preview, active alerts, fleet activity, recent events |
| Simulation Studio `/simulation` | Canvas warehouse (racks, lanes, narrow passages, obstacles, stations, closures, robots, A* routes, rulers); select/pan, zoom, fit, reset, overlay toggles; inspector for robots (task, route, custody trail, **mark failed**), stations (**queue mission**) and cells (**close / reopen**); play/pause/step/reset, 0.5–4× speed, seekable timeline, event strip; keyboard shortcuts |
| Fleet `/fleet` | Status-filtered robot roster, inspect-in-studio |
| Missions `/missions` | Lifecycle KPIs, **new-mission form**, state-filtered log with custody column and **cancel** |
| Incidents `/incidents` | Derived incident queue (failed robots, blocked / no-route robots, low battery, closures), locate, replay-from-tick, reopen closure |
| Analytics `/analytics` | Throughput (chart + table), cycle time, utilisation, per-robot time allocation |
| Settings `/settings` | Tick duration, motion smoothing, canvas overlays, compact sidebar, shortcut reference |

Three scenarios ship: **Standard warehouse** (5 robots, seeded mission feed), **Narrow aisle** (opposing missions meet in a one-cell passage; the yielding robot replans via a bypass), and **High-density warehouse** (8 robots, heavy feed, R-07 failed by a scheduled command at tick 40).

### What the engine does

- **World model:** ASCII warehouse grid (lanes, narrow passages, racks, obstacles, pickup / drop-off / charging stations), dynamic closures, robots, missions, packages, events. All entities have stable IDs; coordinates are validated.
- **A\* pathfinding:** Manhattan heuristic, 4-connected, deterministic tie-breaking; station cells only as goals; closures and stationary robots as blockers.
- **Scheduling:** missions queue from the scenario, a seeded feed, or the UI; each goes to the nearest available robot (A* cost, then robot ID). Idle robots return home; low-battery robots seek a free charger.
- **Lifecycles:** validated mission states (`queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed`, plus `cancelled`, `recovery-required`) and package custody (`available → reserved → picked-up → in-transit → delivered`) with append-only history.
- **Safety:** a sequential occupancy guard prevents cell collisions and head-on swaps; blocked robots wait and replan after a bounded wait (yield rule and step-aside for head-on blocks). `checkInvariants()` runs after every tick and command outside production builds.
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
| `npm test` | Vitest engine tests (A*, custody, lifecycles, engine behaviour, invariants) |
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
    pathfinding/       A* + min-heap
    custody/           package custody state machine
    missions/ robots/  lifecycle state machines
    world/layout.ts    ASCII warehouse parser and grid helpers
    core/              Result types, seeded PRNG
    commands.ts invariants.ts metrics.ts scenario.ts
    scenarios/         standard, narrow-aisle, high-density
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
- **Fixed tick order** (scheduled commands → feed → assignment → robots in ID order → logged commands → invariants) makes runs reproducible.
- **Safety before efficiency.** The occupancy guard rules out collisions and swaps by construction; efficiency (reservations) and liveness (deadlock handling) are later missions.
- **Time is owned outside the engine.** `PlaybackDriver` turns wall-clock time into `step()` calls; the engine has no timers.
- **Canvas off the React render path**, and **one source of colour** (CSS tokens read by the renderer), as in Mission 001.

## Known limitations

- **No time-indexed reservations.** Robots plan spatially and resolve conflicts by waiting and replanning; congestion causes waits and detours.
- **No deadlock detection or recovery policy.** Bounded-wait replanning resolves the head-on cases in the shipped scenarios, but liveness is not guaranteed for every geometry.
- **No automatic failure recovery.** A failed robot keeps its package and its mission becomes `recovery-required`; there is no command to repair the robot or transfer custody yet.
- Assignment is greedy nearest-robot; no priorities, deadlines or batching.
- Battery is a simplified model.
- Simulation state is in memory and resets on full page reload. Preferences persist in `localStorage`.
- Seek replays from tick 0 (fast for thousands of ticks; no checkpoints).
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
