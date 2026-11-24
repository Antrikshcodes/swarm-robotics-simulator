# SWARM — Warehouse Robot Coordination Arena

> **One warehouse. Multiple robots. Zero collisions.**

SWARM is an autonomous multi-robot warehouse coordination and simulation platform. It models a configurable warehouse, assigns pickup and drop-off missions, plans routes through space and time, prevents robot conflicts, and recovers from failures and dynamic aisle blockages without resetting the simulation.

## Project status

**Phase:** Initial foundation  
**Problem statement:** NexHack 2.0 — PS 05  
**Repository:** [Antrikshcodes/swarm-robotics-simulator](https://github.com/Antrikshcodes/swarm-robotics-simulator)

The repository currently contains the product specifications and engineering source of truth. Application implementation begins in Mission 001.

## Core capabilities

- Configurable grid warehouse with stations, shelves, obstacles, and narrow aisles
- Multiple simulated robots with live mission assignment
- Pickup and drop-off task scheduling while the fleet is running
- Space-time route planning and cell/edge reservations
- Collision prevention, including head-on edge swaps
- Deadlock detection and recovery for constrained passages
- Robot failure recovery with package custody preserved
- Dynamic aisle closures and route replanning without resetting
- Operational metrics: completed jobs, wait time, congestion, and fleet utilisation
- Deterministic scenarios for judge-facing demonstrations

## Planned technology

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling and UI | Tailwind CSS, shadcn/ui |
| Motion | Framer Motion |
| State | Zustand |
| Simulation rendering | HTML Canvas (2D top-down) |
| Icons | Lucide React |
| Backend (planned) | Python, FastAPI |
| Persistence (planned) | PostgreSQL / Supabase |
| Live updates (planned) | WebSockets |
| Testing | TypeScript checks, ESLint, unit and scenario tests |

The simulation engine must remain independent of React rendering so it can be tested deterministically.

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
2. Implement one coherent milestone at a time.
3. Keep algorithmic simulation logic separate from UI components.
4. Add tests for coordination, collision safety, package custody, and recovery.
5. Run lint, typecheck, tests, and build before considering a milestone complete.
6. Keep `main` stable; use feature branches and review meaningful changes before merging.

See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) and [TASK_BOARD.md](TASK_BOARD.md).

## Local development

The application scaffold will be established in Mission 001. Setup commands and environment requirements will be added once the scaffold is committed.

## Project principles

- Safety invariants over visual effects.
- Deterministic, reproducible simulation scenarios.
- Every visible control should perform a real action.
- No fake metrics, simulated success claims, or decorative-only features.
- Preserve mission history and package ownership across failures and replanning.
