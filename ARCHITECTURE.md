# Architecture

## Architectural direction

Use a modular frontend with a simulation engine isolated from presentation. The engine owns world state and decisions; React renders snapshots and dispatches user intents.

## Planned stack

- Next.js with App Router
- TypeScript (strict)
- Tailwind CSS and shadcn/ui
- Framer Motion for purposeful interface transitions
- Zustand for application/UI state
- HTML Canvas for the 2D top-down warehouse
- Lucide React icons
- FastAPI backend when backend persistence or remote orchestration is introduced
- PostgreSQL / Supabase for durable data when required
- WebSockets for real-time server updates when required

Avoid introducing backend infrastructure before the local deterministic simulator has a stable contract.

## Proposed source layout

```text
src/
  app/
    page.tsx
    simulation/page.tsx
    fleet/page.tsx
    missions/page.tsx
    incidents/page.tsx
    analytics/page.tsx
    settings/page.tsx
  components/
    layout/
    simulation/
    fleet/
    missions/
    incidents/
    analytics/
    ui/
  engine/
    pathfinding/
    coordination/
    reservations/
    deadlock/
    recovery/
    scheduler/
    simulation-loop.ts
  store/
  types/
  lib/
```

Adapt to the generated scaffold if it has a better idiomatic structure; preserve the separation of concerns.

### Current implementation (Mission 003)

```text
src/engine/
  core/result.ts              Result / EngineError / InvariantViolation
  core/prng.ts                seeded PRNG (mulberry32)
  world/layout.ts             ASCII parser, bounds, traversability, grid helpers
  pathfinding/astar.ts        spatial A* (+ min-heap) — kept for spatial queries/tests
  coordination/
    reservation-table.ts      time-indexed cell + directed-edge reservations, holds   ← "Reservation coordinator"
    space-time-planner.ts     windowed cooperative A* over (cell, tick)              ← "Pathfinding" (cooperative)
    distance-map.ts           cached BFS distance maps (heuristic + assignment cost)
    coordinator.ts            prioritised planning, preemption, wait-for graph, decisions
    move-resolver.ts          fleet-wide commit-time conflict check
  custody/package-custody.ts  custody state machine
  missions/mission-lifecycle.ts mission state machine (with priority)                  ← part of "Mission scheduler"
  robots/robot-lifecycle.ts   robot status transitions
  commands.ts invariants.ts metrics.ts scenario.ts scenarios/
  warehouse-engine.ts         world state, tick loop, assignment, commands, events, snapshots
```

**Tick (T → T+1):** scheduled commands → seeded feed → assignment (most urgent first, nearest robot by cached distance) → *prepare* (station handling, goals, arrivals) → *coordinate* (`Coordinator.plan`) → *commit* (`resolveMoves`) → *apply* (moves, arrivals, waits, promote decisions to events) → logged commands (replay) → invariants.

**Reservation model.** A reservation at tick t means "after tick t". Cells and directed edges are reserved per tick and owned by a robot id; every plan ends with a *hold* (indefinite claim of its last cell) unless the plan ends at a station, in which case only the handling window (+1 tick to leave) is reserved. A robot always owns the cell it physically occupies until it plans to leave (`claimCell`); dwelling and failed robots claim their cells and revoke conflicting claims. Reservations before the current tick expire every tick.

**Planning.** Robots are replanned only when needed — new goal, invalidated (closure, failure, preemption, commit rejection), partial plan within 3 ticks of running out, or every 6 ticks while waiting — in priority order. Space-time A* (horizon 48 ticks, 4 000-node cap, 600 when the goal is held by another robot) returns a complete plan, the best safe partial plan, `unreachable` or `blocked`. Priority = mission urgency (normal 10 / high 30 / urgent 60) + 5 if carrying + aging (2 per waiting tick, max 24); idle robots ≤ 4.

**Preemption.** A robot that has waited ≥ 3 ticks behind a lower-priority, mobile robot takes right-of-way: the blocker is pinned for one tick, its other reservations are released, the higher robot replans first, then the blocker replans around it. Dwelling and failed robots are never preempted.

**Deadlock hooks for Mission 004.** `snapshot.coordination.waitGraph` lists every waiting robot and the robot that holds the reservation it needs; `RobotState.blockedTicks`, `waitingFor`, `planStatus` and the decision log give duration and cause. A deadlock detector can run cycle detection on this graph after the commit phase without touching the planner.

- `WarehouseEngine` implements `SimulationSource` (`step`, `reset`, `seek`, `getSnapshot`, `dispatch`). It is the single owner of world state; the UI only reads snapshots and sends commands.
- Wall-clock pacing lives in `components/layout/playback-driver.tsx`; the engine never owns timers.
- The Canvas renderer (`src/lib/render/warehouse-renderer.ts`) is a pure function of snapshot + view + options. `useWarehouseRenderer` draws on demand outside React renders.

## Engine boundaries

### World model
Owns grid dimensions, traversability, stations, obstacles, dynamic closures, robot poses, and simulation tick.

### Mission scheduler
Owns task queueing, assignment, priorities, and mission lifecycle. New tasks can be submitted while the simulation is running.

### Pathfinding
Provides deterministic path computation over the warehouse grid. Begin with A* for spatial paths, then extend planning with time reservations and conflict-aware replanning.

### Reservation coordinator
Owns time-indexed cell and directed-edge reservations. It must reject conflicting cell occupancy and opposing edge traversal at the same tick.

### Deadlock manager
Detects waiting cycles and blocked dependencies, distinguishes temporary congestion from deadlock, and invokes a bounded recovery strategy.

### Recovery manager
Handles robot unavailability and task reassignment. Package custody must be updated atomically and retain an audit history.

### Simulation loop
Advances discrete ticks, invokes scheduling/coordination, validates invariants, and emits events/snapshots. It must be deterministic for a fixed seed, scenario, and command sequence.

### Rendering layer
Canvas draws the current world and interpolation between engine snapshots. Rendering must not determine robot positions, collisions, or mission outcomes.

## State and data flow

Implemented as described below; see API_CONTRACTS.md for the exact command and snapshot shapes.

1. UI dispatches a command (start, pause, add task, close aisle, fail robot).
2. Engine validates the command and mutates authoritative state.
3. Coordinator produces safe next actions using reservations.
4. Simulation advances one tick and checks invariants.
5. Engine emits events and a read-only snapshot.
6. Store/UI updates and Canvas renders the snapshot.

## Testing strategy

- Unit tests for A*, reservations, edge swaps, custody transitions, deadlock detection, and recovery.
- Property/invariant tests for unique package custody and collision freedom.
- Deterministic scenario tests for all judge-facing demonstrations.
- UI tests for controls, inspector state, and scenario switching.
- Build, lint, and strict typecheck in continuous integration.

## Performance principles

- Keep tick computation independent from render frame rate.
- Avoid React re-rendering the entire application on every Canvas frame.
- Use selectors and stable snapshots for UI state.
- Keep event history bounded in memory with optional persistence.
- Profile before optimizing; document any algorithmic trade-offs.

### Measured (Mission 003, Node 24, Apple M5)

Shipped scenarios, 2 000 ticks:

| Scenario | Time (invariants on / off) | `seek(2000)` | Deliveries | Longest block | Waiting share | Right-of-way | Commit rejections |
|---|---|---|---|---|---|---|---|
| Standard (5 robots) | 163 / 137 ms | 103 ms | 133 | 7 ticks | 0.7% | 2 | 0 |
| Narrow aisle (4) | 63 / 56 ms | 36 ms | 112 | 4 ticks | 0.3% | 0 | 0 |
| High density (8) | 226 / 202 ms | 163 ms | 193 | 7 ticks | 0.8% | 2 | 0 |

For comparison, Mission 002's occupancy guard delivered 101 / 93 / 129 with longest blocks of 14 / 13 / 21 ticks.

Scaling (`npm run bench`): synthetic 40 × 27 warehouse, 8 docks, heavy feed (a mission every 2 ticks), 600 ticks, invariant checks off:

| Robots | ms/tick mean | ms/tick p95 | ms/tick max | plans/tick | nodes/plan | deliveries | waiting share | right-of-way | commit rejections |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 0.15 | 0.49 | 5.1 | 0.18 | 1008 | 23 | 0.3% | 1 | 0 |
| 8 | 0.25 | 2.28 | 3.3 | 0.41 | 794 | 45 | 0.5% | 1 | 0 |
| 16 | 0.57 | 2.86 | 5.8 | 1.14 | 679 | 86 | 1.3% | 4 | 0 |
| 24 | 0.81 | 3.15 | 5.8 | 1.79 | 595 | 125 | 1.7% | 5 | 0 |
| 32 | 1.17 | 3.44 | 7.2 | 2.69 | 597 | 162 | 2.3% | 15 | 0 |

Cost grows roughly linearly with fleet size up to 32 robots on this map because only robots that need a plan are replanned (≈ 0.08 plans per robot per tick). These numbers are from one machine and one synthetic layout; larger maps, longer horizons or much denser traffic have not been measured. Max-tick outliers (≈ 5–7 ms) come from ticks where several robots replan at once.

Trade-offs: seek replays from tick 0 (no checkpoints); snapshots copy reservation lists (≈ robots × horizon entries) once per change; events (300), decisions (120) and movements (400) are ring-buffered.
