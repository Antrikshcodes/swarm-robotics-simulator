# Simulation Rules and Safety Invariants

These invariants define correctness. All relevant engine mutations and tick transitions must preserve them.

Status legend: **Enforced** = implemented and checked by `checkInvariants()` after every tick and command (outside production builds) and by tests. **Implemented** = behaviour exists. **Planned** = not built yet.

## World and time

- The warehouse is a discrete grid. — **Implemented** (`src/engine/world/layout.ts`, ASCII maps).
- Simulation advances in discrete ticks, independently from display frame rate. — **Implemented**. The UI's `PlaybackDriver` only decides *when* to call `step()`; it never decides outcomes.
- A fixed initial scenario, random seed, and command sequence must produce repeatable results. — **Enforced by tests**. The engine uses a seeded PRNG (`core/prng.ts`) and never calls `Math.random`.
- A blocked cell is not traversable for new route plans. — **Implemented**: racks and obstacles are never traversable; closure cells are excluded from every new A* plan.

### Tick order (fixed)

1. `tick += 1`
2. Scenario-scheduled world commands for this tick
3. Seeded mission feed (may queue one mission; skips stations blocked by a failed robot)
4. Assignment: queued missions, most urgent first then oldest, each to the available robot with the shortest static distance to its pickup; ties go to the lower robot ID
5. Prepare: station handling, goals and arrivals — no movement
6. Coordinate: prioritised space-time planning over the reservation table
7. Commit: the whole fleet's intended moves are checked together
8. Apply moves, arrivals and waits
9. User commands logged at this tick (only during seek replay)
10. Invariant check

## Robot occupancy and movement

- A traversable cell may not be occupied by more than one robot at the same tick. — **Enforced** at planning time (cell reservations) and at commit time; checked by invariants.
- A robot may not move into a cell reserved by another robot for that tick. — **Enforced** (space-time planner + reservation table).
- Two robots may not traverse the same undirected edge in opposite directions during the same tick (head-on swap). — **Enforced** at planning time (directed-edge reservations: a move a→b at tick t is rejected if another robot reserved b→a at t) and at commit time; checked by invariants.
- Robots move at most one cell per tick. — **Enforced**.
- Robots must remain within warehouse bounds and may not pass through racks or obstacles. — **Enforced**.
- Station cells are entered only as a plan's goal, and only when the robot can stay for its handling time. — **Implemented**.
- Waiting and yielding must be explicit engine actions, not invisible UI delays. — **Implemented**: planned waits are reserved like moves; a waiting robot has status `waiting`, `waitingFor`, `blockedTicks`, an activity note, and emits `robot-waiting` after 3 ticks; right-of-way decisions emit `right-of-way` events.

## Reservations — **Implemented (Mission 003)**

- A reservation at tick t means "where the robot is after tick t". Each is owned by exactly one robot id.
- Cell reservations are time-indexed. — **Enforced**.
- Directed-edge reservations are time-indexed. — **Enforced**.
- Every plan ends with a *hold* on its last cell (the robot stays there until it replans). A plan that ends at a station instead reserves only the handling window plus one tick to leave, so other robots may use the dock before and after.
- A robot always owns the cell it physically occupies until it plans to leave it. Robots that must stay (handling, boxed in, no route, failed) claim their cell and any conflicting claim is revoked; the affected robot stands still and replans.
- Conflicting reservations are rejected before movement is committed. — **Enforced**: plans are built only from legal reservations, and `resolveMoves` re-checks the fleet's moves at commit time (same cell, occupied cell, swap, cascades). Commit-time rejections are counted and evented; they are 0 in all shipped scenarios and benchmarks.
- Reservation release and replanning must not leave stale ownership. — **Implemented**: a robot's future reservations are released before every replan; past ticks expire every tick; closures, failures and cancellations release affected robots' reservations immediately.

### Priority and right-of-way

- Movement priority = mission urgency (normal 10, high 30, urgent 60) + 5 when carrying + aging (2 per consecutive waiting tick, max 24). Idle robots have at most 4.
- Robots plan in priority order (ties: lower robot ID). Earlier reservations stand; later planners route around them, waiting or detouring.
- A robot that has waited ≥ 3 ticks behind a lower-priority mobile robot takes right-of-way: the blocker keeps only its next-tick cell, the higher robot replans first, the blocker replans around it. Dwelling and failed robots are never preempted. Aging prevents low-priority starvation.

### Known limits of prioritised planning

Prioritised cooperative planning is not complete. If two robots each need the cell the other occupies (e.g. goals equal to each other's current cells in a one-lane corridor), neither can find a plan and both wait. The shipped scenarios never create this geometry (goals are stations or homes), and 2 000-tick tests assert bounded blocking for them, but general deadlock detection and resolution is **Planned (Mission 004)**. The wait-for graph (`snapshot.coordination.waitGraph`) is exposed for it.

## Mission lifecycle

Implemented states and transitions (`missions/mission-lifecycle.ts`). Every change is validated and recorded in `mission.history`.

```
queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed
   │         │           │
   └─────────┴───────────┴──→ cancelled            (only before pickup)
assigned … dropping-off ──→ recovery-required      (robot failed)
assigned / to-pickup ──→ queued                    (requeue: a station on its route is blocked by a failed robot)
```

Missions carry a priority (`normal`, `high`, `urgent`) that orders assignment and drives movement priority.

- `assigned`: a robot is reserved for the mission but has not moved yet (or has no route).
- `carrying`: the package is on the robot but it has no drop-off route yet (e.g. a closure blocks every route).
- `completed`, `cancelled` and `recovery-required` are terminal. A completed mission is never reassigned.
- A mission is completed **only** when its package is delivered at the mission's drop-off station. — **Enforced**.
- Automatic recovery of `recovery-required` missions. — **Planned (Mission 004)**.

## Package custody

A package has exactly one authoritative custody state (`custody/package-custody.ts`):

```
available ⇄ reserved → picked-up → in-transit → delivered
```

- `reserved`: owned by exactly one robot for one mission. Released back to `available` only by that robot (mission cancelled before pickup).
- `picked-up`: loaded at its origin station by the holder.
- `in-transit`: the holder has moved away with it.
- `delivered`: terminal; only at the destination station.

Rules:

- One package cannot be owned or carried by two robots simultaneously. — **Enforced** (custody functions reject it; invariants check robot ↔ package agreement).
- A package cannot be picked up twice. — **Enforced**.
- Delivery is terminal; a delivered package cannot be delivered again. — **Enforced**.
- Only the holding robot may pick up, carry or deliver the package, and only at the correct station. — **Enforced**.
- A robot failure while carrying must trigger an explicit recovery/custody transition. — **Partially implemented**: on failure, custody is retained by the failed robot, an audit note is appended, and the mission becomes `recovery-required`. The explicit transfer to another robot is **Planned (Mission 004)**.
- Completed delivery history must never be erased by robot failure or replanning. — **Implemented** (append-only history; pruning only removes the oldest finished missions beyond 200 together with their packages).
- Custody transitions are atomic and auditable. — **Implemented** (pure functions, each returning a new package with a history record or an explicit error).

## Dynamic aisle closures

- A closure changes traversability from the tick it is applied. — **Implemented** (`close-aisle` command; closure IDs `CL-nn`).
- Affected routes are invalidated safely. — **Implemented**: robots whose remaining path crosses a closed cell replan on their next update and emit `robot-replanned`.
- Robots already on a newly closed cell are not teleported; they may leave it. — **Implemented**.
- Stations, racks and obstacles cannot be closed (explicit error).
- Replanning occurs without resetting simulation time or losing completed missions. — **Implemented**.
- Reopening (`reopen-aisle`) restores the cells; robots without a route retry every tick.

## Robot status

`idle, moving, carrying, waiting, loading, unloading, charging, failed, recovering`. Transitions are validated (`robots/robot-lifecycle.ts`): a failed robot can only become `recovering`, and `recovering` only `idle` or `failed`. No command yet moves a robot out of `failed` — **Planned (Mission 004)**.

## Battery (simplified model)

Drain 0.04 % per move, 0.01 % per handling tick, 0.004 % per idle/waiting tick; +1 % per tick on a charger (starts below 95 %, continues to 100 %). Robots below 25 % with no mission go to a free charger; robots below 15 % are not assigned missions; `battery-low` fires below 20 %. This is a demonstration model, not a physical one.

## Deadlock handling

- Distinguish temporary waiting from deadlock. — **Planned (Mission 004)**. Today waits are planned (space-time) and bounded in the shipped scenarios by priority, aging and right-of-way; the wait-for graph is exposed for detection.
- Record blocked dependencies and duration. — **Implemented** (`waitingFor`, `blockedTicks`, wait-for graph, decision log).
- Recovery must be bounded and deterministic for the same state. — Current replanning is deterministic; bounded deadlock recovery is **Planned**.
- Never resolve deadlock by violating collision or package-custody invariants. — **Enforced**.

## Metrics

Metrics are derived from engine state/events (`engine/metrics.ts`, `lib/selectors.ts`), never hardcoded:

- Completed deliveries — count of `package-delivered` events (`deliveryTicks`).
- Waiting time — per-robot `waitingTicks` (blocked or no route).
- Utilisation — busy robot-ticks (moving, loading, unloading) ÷ elapsed robot-ticks.
- Open incidents — failed robots + robots blocked ≥ 3 ticks + low-battery robots + active closures.
- Coordination — plans computed, nodes expanded, planned waits, right-of-way decisions, commit-time rejections (`snapshot.coordination.stats`).
- Congestion (cell-occupancy heat, blocked-wait per aisle) — **Planned (later mission)**.
