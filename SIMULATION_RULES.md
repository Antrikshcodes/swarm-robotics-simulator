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
9. Deadlock phase: wait-for graph, cycle confirmation, recovery attempts (goal and planning-order changes only, applied from the next tick)
10. User commands logged at this tick (only during seek replay)
11. Invariant check

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

Prioritised cooperative planning is not complete. If two robots each need the cell the other occupies (e.g. goals equal to each other's current cells in a one-lane corridor), neither can find a plan and both wait. Since Mission 004 such circular waits are detected and recovered by the deadlock manager (see *Deadlock handling*); the operational scenarios still never create them (0 deadlocks in 3 000-tick runs).

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

## Deadlock handling — **Implemented (Mission 004)**

Code: `src/engine/deadlock/` (`wait-for-graph.ts`, `deadlock-manager.ts`), integrated as a tick phase after moves are applied.

### Detection

- **Wait-for graph.** Built every tick over robots that are *waiting* and not at their goal. An edge A → B means A cannot progress because B occupies (`occupied`) or holds the end-of-plan claim on (`held`) one of the next 6 cells of A's static route, or because the coordinator reports B owns the reservation A waits on (`reserved`). A robot may have several out-edges. On a 4-connected grid two robots can only block each other directly in pairs (the grid graph is bipartite), so circular waits of three or more robots appear only through this route lookahead.
- **Cycles** are strongly connected components with ≥ 2 robots (Tarjan), listed deterministically. Every participant is identified.
- **Deadlock vs congestion.** A cycle becomes a deadlock only when the same group has persisted for `confirmTicks` = 4 consecutive ticks *and* every member has itself waited ≥ 4 ticks. Cycles that clear sooner are counted as `transientCycles` and never reported. A wait chain without a cycle (waiting behind traffic that is still moving) is never a deadlock; robots waiting ≥ 3 ticks in a chain are classified as `congestion`.
- **Stall.** A robot with an active mission that has waited ≥ `stallTicks` = 40 ticks without being in a cycle opens a `stall` incident with its blocker chain (e.g. behind a parked robot).
- **Growth.** If another robot joins an open (unrecovered) circular wait, the incident is extended to the larger group rather than closed.
- Robot wait classes: `none`, `waiting` (short planned wait), `congestion`, `deadlock`, `recovering` (in a group while another robot yields), `yielding`.

### Recovery

1. **Candidate ranking (deterministic).** Each member gets a score; the lowest score yields first. Score = +1000 if the robot is inside a narrow passage (directional passage priority: the robot already in the passage keeps going), +100 per robot outside the group queued behind it (convoys keep priority), + mission urgency weight, +5 if carrying, + min(wait ticks, 30). Ties: the higher robot ID yields.
2. **Holding position.** For the first candidate in order: breadth-first search (N, E, S, W) from its cell through traversable, non-station cells not occupied by other robots, up to depth 30, for the nearest cell that is not *protected* and where the candidate can legally hold. Protected = every other member's and dependent's current cell and full static route to its goal. This is the controlled back-out: a robot backs up only when the holding cell is off everyone else's path.
3. **Attempt.** The group's future reservations are released and its plans invalidated; the other members claim their current cells; the yielder's goal becomes the holding cell and it plans first (`recoveryFirst`) through the normal reservation table, then the others. Events: `deadlock_recovery_started`, `robot_yielded`, then `recovery_route_planned` once the yielder holds a complete reserved route.
4. **Resolution.** The incident is resolved when the yielder has held its position for ≥ 2 ticks and the others have progressed ≥ 3 cells (or reached their goals). All yielders are then released together and resume their own goals (`deadlock_resolved`).
5. **Cascade.** If a residual cycle among the remaining members persists for `confirmTicks` while the yielder holds, the attempt is `escalated`: the yielder keeps holding and the next attempt selects another yielder from the remaining members.
6. **Bounds.** At most `maxAttempts` = 3 attempts per budget; an attempt fails with `no-route` if the yielder cannot reserve a complete route within 2 ticks, or `timeout` after 60 ticks. A group re-detected within 60 ticks of resolution reopens the same incident and keeps its attempt count, so recovery cannot oscillate forever.
7. **Failure.** If no candidate has a safe holding position, or the budget is exhausted, the incident becomes `failed`: `deadlock_recovery_failed` is emitted once, yielders are released, and all members stay in place in a safe waiting state. A failed incident is retried with a fresh budget only when the world changes (mission added/cancelled, closure added/removed, robot failed); if the cycle dissolves on its own it is resolved.

### Separation from right-of-way

Mission 003's right-of-way preemption is suspended for robots that are in any wait-for cycle or open deadlock incident (`noPreempt`). Cycles are owned by the deadlock manager alone, which prevents the two mechanisms from undoing each other's decisions (back-and-forth). A per-pair right-of-way cooldown of 12 ticks bounds repeated preemption elsewhere.

### Safety guarantees

Recovery never teleports a robot, resets the simulation, deletes or cancels missions, changes package custody, or bypasses the reservation table: it only changes a robot's *goal* and the *planning order*. Every move still goes through space-time planning and the commit-time check, so the collision, swap and custody invariants are enforced (and tested every tick in the lab scenarios).

### Deadlock lab scenarios

| ID | Demonstrates |
|---|---|
| `lab-a-two-robot` | Two robots meet head-on in a one-lane corridor; one backs into a side bay. |
| `lab-b-three-robot` | Three-robot circular wait at a cross junction; cascading recovery (two yielders). |
| `lab-c-narrow-aisle` | One eastbound vs a westbound convoy in a narrow passage; passage priority + convoy rule pick the yielder. A fourth robot keeps delivering. |
| `lab-d-congestion` | Four robots queue through a door: congestion only, zero deadlock reports. |
| `lab-e-unrecoverable` | Sealed corridor with no holding position: `deadlock_recovery_failed`, robots hold safely. |

### Limits

- Prioritised planning is still not complete; recovery is a heuristic yield/hold strategy, not joint multi-robot planning. Geometries with no safe holding position (Lab E) are reported, not solved.
- Stall incidents are recovered only through the robots in the blocker chain; a failed robot cannot be moved (robot recovery/towing is out of scope).
- Partial plans can still park a robot in a junction; the cascade handles the resulting residual cycles within the attempt budget.

## Metrics

Metrics are derived from engine state/events (`engine/metrics.ts`, `lib/selectors.ts`), never hardcoded:

- Completed deliveries — count of `package-delivered` events (`deliveryTicks`).
- Waiting time — per-robot `waitingTicks` (blocked or no route).
- Utilisation — busy robot-ticks (moving, loading, unloading) ÷ elapsed robot-ticks.
- Open incidents — failed robots + robots blocked ≥ 3 ticks + low-battery robots + active closures.
- Coordination — plans computed, nodes expanded, planned waits, right-of-way decisions, commit-time rejections (`snapshot.coordination.stats`).
- Congestion (cell-occupancy heat, blocked-wait per aisle) — **Planned (later mission)**.
