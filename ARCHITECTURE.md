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

### Current implementation (Mission 001)

- `src/engine/` currently contains `layout.ts` (ASCII map parser), `scenario.ts` (definitions, compilation and validation), `demo-playback.ts` and `scenarios/`. `DemoPlayback` implements `SimulationSource` (`step`, `reset`, `seek`, `getSnapshot`) by replaying hand-authored robot programs. It is deterministic and React-free, but it performs **no** planning, reservation, collision prevention, deadlock or recovery logic.
- The planned `pathfinding/`, `coordination/`, `reservations/`, `deadlock/`, `recovery/`, `scheduler/` modules and `simulation-loop.ts` do not exist yet. The real engine should implement the same `SimulationSource` interface and emit the snapshot type in `src/types/simulation.ts` so that the UI does not change.
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
