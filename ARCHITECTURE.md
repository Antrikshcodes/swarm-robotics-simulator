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

### Current implementation (Mission 002)

```text
src/engine/
  core/result.ts            Result / EngineError / InvariantViolation
  core/prng.ts              seeded PRNG (mulberry32)
  world/layout.ts           ASCII parser, bounds, traversability, grid helpers
  pathfinding/astar.ts      A* (+ min-heap)                       ← "Pathfinding"
  custody/package-custody.ts custody state machine                ← part of "Recovery manager" data model
  missions/mission-lifecycle.ts mission state machine             ← part of "Mission scheduler"
  robots/robot-lifecycle.ts robot status transitions
  commands.ts               command types and log entries
  invariants.ts             checkInvariants(snapshot)
  metrics.ts                derived fleet metrics
  scenario.ts, scenarios/   definitions, validation, three scenarios
  warehouse-engine.ts       WarehouseEngine: world state, tick loop, scheduler,
                            occupancy guard, commands, events, snapshots
```

- `WarehouseEngine` implements `SimulationSource` (`step`, `reset`, `seek`, `getSnapshot`, `dispatch`). It is the single owner of world state; the UI only reads snapshots and sends commands.
- Assignment (nearest available robot by A* cost) and the occupancy guard currently live inside `warehouse-engine.ts`. When reservations arrive (Mission 004), extract `scheduler/` and `coordination/` modules and replace the guard's "is the next cell free now?" check with a reservation-table query. The world model, command log, snapshot contract and tick order stay unchanged.
- Deadlock detection (Mission 005) slots in after step 5 of the tick order, reading `blockedTicks` and the robot that holds each blocked robot's next cell.
- Recovery (Mission 006) adds world commands (e.g. reassign, recover robot) and custody transfer functions. `recovering` status and its transitions already exist.
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

### Measured (Mission 002, Node 24, invariant checks on)

| Scenario | 1 000 × `step()` (with / without invariants) | `seek(1000)` from 0 | Deliveries / 1 000 ticks |
|---|---|---|---|
| Standard (5 robots) | ~26 ms / ~14 ms | ~9 ms | 51 |
| Narrow aisle (4 robots) | ~11 ms / ~9 ms | ~4 ms | 45 |
| High density (8 robots) | ~25 ms / ~18 ms | ~10 ms | 72 |

Trade-offs: A* runs on assignment, on route invalidation and on bounded-wait replans, not every tick. Seek replays from tick 0 (no checkpoints); this is fine for thousands of ticks but would need periodic snapshots for very long runs. Snapshots are rebuilt lazily once per change. Missions/packages beyond the latest 200 finished ones are pruned; events (300) and movement records (400) are ring-buffered.
