# Project Context

## Identity

- **Working product name:** SWARM
- **Full name:** Warehouse Robot Coordination Arena
- **Tagline:** One warehouse. Multiple robots. Zero collisions.
- **Positioning:** Autonomous Warehouse Fleet Coordination & Simulation Platform
- **Problem statement:** NexHack 2.0, Problem Statement 05
- **Repository:** `Antrikshcodes/swarm-robotics-simulator`

The working product name is SWARM until the team explicitly approves a rename.

## Problem to solve

A warehouse may contain several mobile robots that must collect and deliver packages through shared aisles. The system must coordinate their routes in both space and time, handle constrained passages, and continue operating when robots or aisles become unavailable.

The simulator must support:
1. A configurable warehouse grid, pickup/drop-off stations, obstacles, and multiple robots.
2. Adding tasks while the fleet is operating.
3. Assigning pickup/drop-off work and planning collision-free routes in space and time.
4. Preventing cell collisions and head-on edge swaps.
5. Detecting and recovering from deadlocks in narrow aisles.
6. Recovering robot failures without losing package ownership or completed deliveries.
7. Ensuring no package is simultaneously owned, carried, or delivered by multiple robots.
8. Dynamic aisle closures and replanning without resetting the simulation.
9. Measuring completed jobs, waiting time, and congestion.
10. Demonstrating the key operational failure scenarios.

## Product experience

The product is a simulation-first, desktop-first industrial control interface. The central Simulation Studio is the primary experience, not a generic dashboard.

Planned application areas:
- Overview
- Simulation Studio
- Fleet
- Missions
- Incidents
- Analytics
- Settings

## Primary user journey

1. Open a warehouse scenario.
2. Inspect the warehouse, robot fleet, stations, and active missions.
3. Start or pause the simulation.
4. Observe robot movement, route reservations, and mission progress.
5. Add jobs or block an aisle while simulation is running.
6. Inspect how the planner responds.
7. Trigger or observe a robot failure and verify safe package custody transfer.
8. Review performance metrics and event history.

## Demonstration scenarios

- **Narrow-passage conflict:** Two robots approach a one-cell aisle from opposite ends. The coordinator must prevent collision and avoid indefinite deadlock.
- **Robot failure while carrying:** A robot fails after pickup. The package remains uniquely owned and is transferred/recovered through an explicit custody transition.
- **Dynamic aisle blockage:** An aisle becomes unavailable while robots are moving. Affected routes are invalidated and replanned without resetting the world.
- **Concurrent deliveries:** Several robots complete independent pickup/drop-off missions while the system records metrics.

## Non-negotiable product principles

- Simulation truth is owned by the engine, not by UI animation.
- Safety invariants must be enforced centrally.
- No duplicate package custody.
- No cell collision or opposing edge traversal at the same simulation tick.
- Every state transition is explicit and auditable.
- Deterministic scenarios must be repeatable for testing and judging.
- Controls shown in the interface must work.
- Metrics must be calculated from simulation events, never hardcoded.

## Current delivery sequence

Mission 001 establishes the frontend scaffold, design system, application shell, and simulation studio layout foundation. Advanced coordination algorithms are intentionally deferred until the visual and architectural foundation is in place.
