# Simulation Rules and Safety Invariants

These invariants define correctness. All relevant engine mutations and tick transitions must preserve them.

## World and time

- The warehouse is a discrete grid.
- Simulation advances in discrete ticks, independently from display frame rate.
- A fixed initial scenario, random seed, and command sequence must produce repeatable results.
- A blocked cell is not traversable for new route plans.

## Robot occupancy and movement

- A traversable cell may not be occupied by more than one robot at the same tick.
- A robot may not move into a cell occupied by another robot at that tick unless the coordinator has explicitly modelled a safe vacating transition.
- Two robots may not traverse the same undirected edge in opposite directions during the same tick (head-on swap).
- Robots must remain within warehouse bounds and may not pass through blocked cells.
- Waiting and yielding must be explicit engine actions, not invisible UI delays.

## Reservations

- Cell reservations are time-indexed.
- Directed edge reservations are time-indexed.
- Conflicting reservations must be rejected before movement is committed.
- Reservation release and replanning must not leave stale ownership that blocks the fleet indefinitely.

## Mission lifecycle

A mission should have explicit states such as:
- queued
- assigned
- to-pickup
- carrying
- to-dropoff
- completed
- cancelled
- recovery-required

Transitions must be validated. A completed mission must not be reassigned as new work.

## Package custody

A package has exactly one authoritative custody state at any time. Suggested states:
- available
- reserved (owned by one robot/mission)
- picked-up
- in-transit
- delivered

Rules:
- One package cannot be owned or carried by two robots simultaneously.
- Delivery is terminal unless an explicit domain rule is introduced.
- A robot failure while carrying must trigger an explicit recovery/custody transition.
- Completed delivery history must never be erased by robot failure or simulation replanning.
- Custody transitions should be atomic and auditable.

## Dynamic aisle closures

- A closure changes traversability from its effective tick.
- Affected future reservations and routes must be invalidated safely.
- Robots already in a newly blocked location require a defined safe policy; do not teleport them.
- Replanning must occur without resetting simulation time or losing completed missions.

## Deadlock handling

- Distinguish temporary waiting from deadlock.
- Record blocked dependencies and duration.
- Recovery must be bounded and deterministic for the same state.
- Never resolve deadlock by violating collision or package-custody invariants.

## Metrics

Metrics must be derived from engine events/state:
- Completed jobs
- Waiting time
- Congestion (define and document the chosen measure)
- Optional: fleet utilisation and throughput

Do not hardcode values for presentation.
