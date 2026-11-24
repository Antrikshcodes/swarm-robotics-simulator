# SWARM — Warehouse Robot Coordination Arena

> **One warehouse. Multiple robots. Zero collisions.**

SWARM is an autonomous multi-robot warehouse coordination and simulation platform. It models a configurable warehouse, assigns pickup and drop-off missions, plans routes through space and time, prevents robot conflicts, and recovers from failures and dynamic aisle blockages without resetting the simulation.

## Project status

**Phase:** Mission 001 — frontend foundation (in review)
**Problem statement:** NexHack 2.0 — PS 05
**Repository:** [Antrikshcodes/swarm-robotics-simulator](https://github.com/Antrikshcodes/swarm-robotics-simulator)
**Working branch:** `feat/mission-001-frontend` (not merged to `main`)

Mission 001 delivers the application shell, design system, Simulation Studio, and all seven routes, driven by a **deterministic scripted demo playback**. The coordination engine — pathfinding, reservations, collision prevention, deadlock and failure recovery — is **not implemented yet** (Missions 002–006).

## What works today

| Area | Implemented |
|---|---|
| Shell | Persistent sidebar (collapsible, persisted), top bar with breadcrumb, scenario selector, playback status, alerts menu, operator menu |
| Overview `/` | Fleet and mission KPIs, live warehouse preview, active alerts, fleet activity, recent events |
| Simulation Studio `/simulation` | Canvas warehouse (racks, lanes, narrow passages, obstacles, stations, robots, routes, rulers); select/pan, wheel and button zoom, fit, reset; grid/coordinate/route/label toggles; inspector for robots, stations and cells; play/pause/step/reset, 0.5–4× speed, seekable timeline, clickable event strip; keyboard shortcuts |
| Fleet `/fleet` | Status-filtered robot roster, inspect-in-studio |
| Missions `/missions` | Lifecycle KPIs and state-filtered mission log |
| Incidents `/incidents` | Derived incident queue (faults, conflict holds, low battery), locate and replay-from-tick |
| Analytics `/analytics` | Throughput (chart + table), cycle time, utilisation, per-robot time allocation |
| Settings `/settings` | Tick duration, motion smoothing, canvas overlays, compact sidebar, shortcut reference |

Three scenarios ship: **Standard warehouse**, **Narrow aisle** (head-on conflict at a one-cell passage, resolved by a *scripted* hold), and **High-density warehouse** (8 robots, a *scripted* drive fault on R-07 while carrying).

### About the data

Every number in the UI is **computed live** from the demo playback snapshot — nothing is hardcoded — and every metric surface carries a `DEMO SCRIPT` badge. Robot movement follows hand-authored loops, not planner output. Battery is sample telemetry, not a battery model. A test-only audit checks that the scripts never place two robots in one cell or swap them; the engine itself does no collision checking yet.

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
| `npm test` | Vitest engine tests |
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
  engine/              pure TypeScript simulation layer (no React)
    layout.ts          ASCII warehouse parser
    scenario.ts        scenario definitions + compiler/validation
    demo-playback.ts   deterministic scripted playback (SimulationSource)
    scenarios/         standard, narrow-aisle, high-density
  lib/
    render/            Canvas theme + pure warehouse renderer
    selectors.ts       derived incidents and analytics
    status.ts format.ts
  store/               simulation, preferences (persisted), viewport
  types/simulation.ts  snapshot contract shared by engine and UI
```

## Key technical decisions

- **Engine/UI boundary.** `src/engine` is pure TypeScript with no React, DOM, timers or randomness. It exposes a `SimulationSource` (`step`, `reset`, `seek`, `getSnapshot`) that emits immutable snapshots matching `src/types/simulation.ts`. Mission 002+ replaces `DemoPlayback` behind the same interface; the UI does not change.
- **Time is owned outside the engine.** A single `PlaybackDriver` in the app shell turns wall-clock time into ticks, so playback continues across page navigation.
- **Deterministic seek.** The timeline replays from tick 0 to the target tick; same scenario + tick ⇒ identical snapshot (tested).
- **Canvas off the React render path.** Drawing subscribes to stores directly and runs on demand: one frame per state change, plus frames while robots interpolate between ticks. React never re-renders per frame.
- **One source of colour.** Tokens live in `globals.css`; the Canvas renderer reads the same CSS custom properties at runtime.
- **Honest UI.** Every control performs a real action; unbuilt capabilities appear as clearly labelled "Planned · Mission 00X" notes, never as fake buttons.

## Known limitations

- No pathfinding, reservations, collision prevention, deadlock handling or failure recovery — routes, yields and faults are scripted.
- Missions cannot be created from the UI; backlog missions stay queued (no scheduler).
- Simulation state is in memory and resets on full page reload. Preferences persist in `localStorage`.
- Event history is bounded to the latest 200 events and 120 completed missions.
- Desktop-first. Narrow screens get a usable stacked layout, but the studio is designed for ≥ 1280 px.
- No authentication or backend.

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
