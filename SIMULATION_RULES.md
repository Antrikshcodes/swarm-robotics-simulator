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
3. Seeded mission feed (may queue one mission)
4. Assignment: each queued mission, in creation order, goes to the available robot with the lowest A* cost to its pickup; ties go to the lower robot ID
5. Robots update in ID order: station handling → arrival → (re)plan → wait or move one cell
6. User commands logged at this tick (only during seek replay)
7. Invariant check

## Robot occupancy and movement

- A traversable cell may not be occupied by more than one robot at the same tick. — **Enforced**.
- A robot may not move into a cell occupied by another robot at that tick. — **Enforced** by the *sequential occupancy guard*: robots update in ID order against live occupancy, so a robot only enters a cell that no robot holds at that moment.
- Two robots may not traverse the same undirected edge in opposite directions during the same tick (head-on swap). — **Enforced** (the occupancy guard makes swaps impossible; the invariant checker verifies it).
- Robots move at most one cell per tick. — **Enforced**.
- Robots must remain within warehouse bounds and may not pass through racks or obstacles. — **Enforced**.
- Station cells are entered only as a route's goal, never passed through. — **Implemented** (A* rule).
- Waiting and yielding must be explicit engine actions, not invisible UI delays. — **Implemented**: a blocked robot has status `waiting`, a `blockedTicks` counter, an activity note, and emits `robot-waiting` after 3 ticks.

### Blocking and replanning (basic, pre-reservation)

- A robot blocked for 4 ticks replans with every other robot's cell treated as an obstacle.
- For a *mutual* head-on block (each robot's next cell is the other's position), only the yielding robot replans at 4 ticks: a loaded robot has priority over an empty one; otherwise the higher robot ID yields. If the yielder has no alternative route (e.g. its goal is the other robot's cell), it steps aside into a free, non-station neighbour (N, E, S, W order). The priority robot replans only if the block lasts 12 ticks.
- For one-way blocks the threshold is `4 + rank` ticks, so queued robots do not all replan on the same tick.
- Robots that cannot find any route wait with status `waiting`, a `robot-no-path` event, and retry every tick.

This guarantees safety (no collisions, no swaps) but not efficiency or deadlock freedom in every geometry. Tests assert bounded blocking (< 40 consecutive ticks) and continuous deliveries over 2 000 ticks for the three shipped scenarios only. Reservation-based planning and deadlock detection are **Planned** (Missions 004–005).

## Reservations

- Cell and directed-edge reservations are time-indexed. — **Planned (Mission 004)**.
- Conflicting reservations must be rejected before movement is committed. — **Planned**.
- Reservation release and replanning must not leave stale ownership that blocks the fleet indefinitely. — **Planned**.

## Mission lifecycle

Implemented states and transitions (`missions/mission-lifecycle.ts`). Every change is validated and recorded in `mission.history`.

```
queued → assigned → to-pickup → picking-up → carrying → to-dropoff → dropping-off → completed
   │         │           │
   └─────────┴───────────┴──→ cancelled            (only before pickup)
assigned … dropping-off ──→ recovery-required      (robot failed)
```

- `assigned`: a robot is reserved for the mission but has not moved yet (or has no route).
- `carrying`: the package is on the robot but it has no drop-off route yet (e.g. a closure blocks every route).
- `completed`, `cancelled` and `recovery-required` are terminal. A completed mission is never reassigned.
- A mission is completed **only** when its package is delivered at the mission's drop-off station. — **Enforced**.
- Automatic recovery of `recovery-required` missions. — **Planned (Mission 006)**.

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
- A robot failure while carrying must trigger an explicit recovery/custody transition. — **Partially implemented**: on failure, custody is retained by the failed robot, an audit note is appended, and the mission becomes `recovery-required`. The explicit transfer to another robot is **Planned (Mission 006)**.
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

`idle, moving, carrying, waiting, loading, unloading, charging, failed, recovering`. Transitions are validated (`robots/robot-lifecycle.ts`): a failed robot can only become `recovering`, and `recovering` only `idle` or `failed`. No command yet moves a robot out of `failed` — **Planned (Mission 006)**.

## Battery (simplified model)

Drain 0.04 % per move, 0.01 % per handling tick, 0.004 % per idle/waiting tick; +1 % per tick on a charger (starts below 95 %, continues to 100 %). Robots below 25 % with no mission go to a free charger; robots below 15 % are not assigned missions; `battery-low` fires below 20 %. This is a demonstration model, not a physical one.

## Deadlock handling

- Distinguish temporary waiting from deadlock. — **Planned (Mission 005)**. Today, waiting is bounded only by the replanning rules above.
- Record blocked dependencies and duration. — **Partially implemented** (`blockedTicks`, `robot-waiting` events naming the blocker).
- Recovery must be bounded and deterministic for the same state. — Current replanning is deterministic; bounded deadlock recovery is **Planned**.
- Never resolve deadlock by violating collision or package-custody invariants. — **Enforced**.

## Metrics

Metrics are derived from engine state/events (`engine/metrics.ts`, `lib/selectors.ts`), never hardcoded:

- Completed deliveries — count of `package-delivered` events (`deliveryTicks`).
- Waiting time — per-robot `waitingTicks` (blocked or no route).
- Utilisation — busy robot-ticks (moving, loading, unloading) ÷ elapsed robot-ticks.
- Open incidents — failed robots + robots blocked ≥ 3 ticks + low-battery robots + active closures.
- Congestion (cell-occupancy heat, blocked-wait per aisle) — **Planned (Mission 007)**.
