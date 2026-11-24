# SWARM — Pathfinding & Multi-Robot Coordination Architecture

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Source Files:** `src/engine/coordination/`, `src/engine/pathfinding/`

---

## 1. Space-Time Graph Representation

Single-agent pathfinders evaluate spatial nodes $(x, y) \in G$. In SWARM, multi-robot coordination operates over a 3D Space-Time Graph:
$$G_{ST} = (V \times T, E_{ST})$$
Where:
- A state node is a tuple `((x, y), t)`, representing spatial grid cell $(x, y)$ at integer simulation tick $t$.
- Two primary transitions exist from state `((x, y), t)`:
  1. **Move Action:** `((x, y), t) -> ((x', y'), t + 1)` where $(x', y')$ is an adjacent traversable neighbor ($\|x - x'\| + \|y - y'\| = 1$).
  2. **Wait Action:** `((x, y), t) -> ((x, y), t + 1)` (the robot remains stationary in its current cell for one tick).

---

## 2. The Reservation Table (`ReservationTable`)

The reservation table (`src/engine/coordination/reservation-table.ts`) tracks three distinct reservation types across time:

```ts
interface CellReservation {
  tick: number;
  x: number;
  y: number;
  robotId: string;
}

interface EdgeReservation {
  tick: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  robotId: string;
}

interface CellHold {
  x: number;
  y: number;
  robotId: string;
  fromTick: number;
}
```

### Reservation Semantics
- **Cell Reservation:** A reservation at tick $t$ means "the robot occupies cell $(x, y)$ after simulation tick $t$ advances."
- **Directed Edge Reservation:** When a robot transitions from $u \to v$ at tick $t$, it reserves the directed edge $(u \to v, t)$.
- **Edge Conflict Prevention (`hasEdgeConflict`):** A proposed move $u \to v$ at tick $t$ is strictly rejected if another robot has already reserved the reverse directed edge $(v \to u, t)$. This prevents opposing edge swaps inside narrow aisles.
- **End-of-Plan Holds:** Every completed plan concludes with an indefinite **hold** on its final destination cell. This guarantees that other robots will not plan routes through the destination cell assuming the arriving robot will vanish. (Docking stations are an exception: robots reserve only their dwell window plus 1 tick to depart, allowing dock sharing).
- **Expiration:** Reservations prior to the current tick are automatically pruned each tick.

---

## 3. Windowed Space-Time A\* (`SpaceTimePlanner`)

Pathfinding is executed by `SpaceTimePlanner` (`src/engine/coordination/space-time-planner.ts`):
- **Planning Horizon:** Configured to a bounded **48-tick window**.
- **Expansion Cap:** Node expansions are capped at **4,000 nodes** (or **600 nodes** if the destination cell is currently held by another agent) to guarantee real-time execution.
- **Heuristic Function:** SWARM uses pre-computed, obstacle-respecting **BFS Distance Maps** (`distance-map.ts`) rather than Manhattan distance. This provides an admissible, consistent heuristic that accounts for warehouse racks and permanent barriers.
- **Tie-Breaking:** Consistent deterministic tie-breaking favors nodes with higher $g$-values (moving closer to the goal) and uses coordinate hashing to eliminate non-deterministic traversal orders.

### Plan Outcomes
The planner returns one of four strongly-typed outcomes:
1. `complete`: A valid, collision-free trajectory reaching the goal within the 48-tick horizon.
2. `partial`: A safe, collision-free trajectory making forward progress even though the goal could not be reached within the horizon window.
3. `blocked`: No forward movement is possible without violating active reservations; the robot must wait.
4. `unreachable`: The destination is topologically isolated or closed.

---

## 4. Prioritization, Aging & Right-of-Way Preemption

Robots plan sequentially in descending order of movement priority.

### Priority Formula
$$\text{Priority} = \text{UrgencyWeight} + \text{CarryBonus} + \text{Aging}$$
- **Urgency Weights:**
  - `urgent`: 60 points
  - `high`: 30 points
  - `normal`: 10 points
  - `idle`: 0–4 points
- **Carry Bonus:** $+5$ points if currently carrying a package.
- **Aging Counter:** $+2$ points for each consecutive tick spent waiting (capped at $+24$ points). This mathematical aging ensures that low-priority replenishment robots are never starved indefinitely by streams of incoming express traffic.

### Right-of-Way Preemption
When a high-priority robot has been waiting for $\ge 3$ consecutive ticks behind a lower-priority mobile robot:
1. Right-of-way preemption triggers (`checkPreemption()`).
2. The lower-priority blocking robot is pinned in its current cell for 1 tick, and its future reservations are revoked.
3. The higher-priority robot plans its route first, claiming optimal reservations.
4. The lower-priority robot then replans its route around the higher-priority agent.
5. A 12-tick cooldown prevents preemption thrashing between identical robot pairs.

---

## 5. Commit-Time Move Resolver (`MoveResolver`)

To provide absolute defense against race conditions or multi-agent planning desynchronization, `resolveMoves()` (`src/engine/coordination/move-resolver.ts`) validates the entire fleet's proposed movements at commit time:
- Verifies that no two robots intend to occupy the same spatial coordinate on the next tick.
- Verifies that no two robots intend to traverse the same edge in opposite directions.
- Verifies that no robot enters a cell currently held by a static or failed robot.

Across all benchmark scenarios and stress runs up to 32 robots, SWARM has maintained **zero commit rejections**.
