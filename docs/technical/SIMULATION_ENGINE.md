# SWARM — Simulation Engine Architecture & Discrete-Tick Execution

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Source Files:** `src/engine/warehouse-engine.ts`, `src/engine/commands.ts`, `src/engine/invariants.ts`, `src/engine/core/`

---

## 1. Engine Core Principles & Responsibilities

The `WarehouseEngine` is the single authoritative source of simulation truth in SWARM. Presentation layers (React UI and HTML5 Canvas) are strictly decoupled and consume read-only snapshots.

Key architectural invariants:
1. **Discrete-Tick Execution:** Time advances strictly in discrete integer ticks ($t \in \mathbb{N}$).
2. **Pure Determinism:** Given an identical initial scenario, random seed, and command history, the engine produces identical state transitions at every tick.
3. **Command-Driven Replay:** State is reproducible by re-applying the append-only command log from tick zero.
4. **Safety Invariant Enforcement:** After every tick transition and user command, `checkInvariants()` validates spatial exclusivity and custody integrity.

---

## 2. World Model & Grid Representation

The warehouse environment is represented as a 2D discrete grid defined in `src/engine/world/layout.ts`:
- **Dimensions:** Width ($W$) and Height ($H$) defining bounds $[0, W-1] \times [0, H-1]$.
- **Cell Kinds:**
  - `empty`: Standard traversable floor lane.
  - `rack`: Impassable storage shelving.
  - `obstacle`: Impassable structural pillars or permanent barriers.
  - `station`: Picking, drop-off, or charging docks.
  - `closure`: Dynamically closed cells (impassable for new routes).
- **Coordinate System:** 0-indexed integer coordinates $(x, y)$, with $(0, 0)$ at the top-left corner.
- **Neighbor Connectivity:** Standard 4-connected grid (North, East, South, West). Diagonal movement is strictly forbidden.

---

## 3. Seeded Pseudorandom Number Generation (PRNG)

To guarantee 100% determinism without reliance on browser-dependent or non-reproducible `Math.random()`, SWARM implements the **Mulberry32 PRNG** (`src/engine/core/prng.ts`):

```ts
export class Mulberry32PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
```

Every stochastic event (such as random order generation in seeded feeds) is evaluated exclusively through this generator.

---

## 4. The 11-Phase Discrete-Tick Loop

Advances are executed synchronously via `step()`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TICK EXECUTION PIPELINE (T -> T+1)                │
│                                                                        │
│  Phase 1:  Clock Advance (tick += 1)                                   │
│  Phase 2:  Scenario Scheduled Commands (e.g., tick-40 failure)         │
│  Phase 3:  Seeded Mission Feed (skips blocked stations)                │
│  Phase 3a: Failure Recovery Manager Update (timeouts, rescuer dispatch)│
│  Phase 4:  Mission Assignment (nearest robot via BFS distance)         │
│  Phase 5:  Prepare (dwell counters, arrival confirmations, goals)      │
│  Phase 6:  Coordinate (prioritized space-time planning over table)     │
│  Phase 7:  Commit Check (resolveMoves - fleet conflict verification)   │
│  Phase 8:  Apply (advance positions, update carried packages, waits)   │
│  Phase 9:  Deadlock Phase (wait-for graph, Tarjan SCC, yield orders)   │
│  Phase 10: Logged World Commands (applied during seek replay)          │
│  Phase 11: Invariant Verification (checkInvariants())                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Command Log & Time-Travel Replay

The engine supports time-travel seeking through an append-only command log (`src/engine/commands.ts`):
- All world-mutating commands (`add-mission`, `cancel-mission`, `close_aisle`, `reopen_aisle`, `fail_robot`, `restore_robot`, `start_package_recovery`, etc.) are recorded with the exact tick they occurred.
- `seek(targetTick)` resets the world state to tick 0 and steps forward to `targetTick`, re-applying logged commands at their corresponding timestamps.
- **Performance:** Replaying 2,000 ticks executes in approximately **100–160 ms** in memory.
- If an operator dispatches a new command after seeking backwards, commands logged after the seek tick are discarded to maintain a consistent causality branch.

---

## 6. Authoritative Safety Invariants

The `checkInvariants(snapshot)` function enforces system correctness on every tick:
1. **Spatial Exclusivity:** No two robots may occupy the same cell $(x, y)$ at the same tick $t$.
2. **Edge Traversal Safety:** No two robots may traverse the same directed edge in reverse during the same tick (head-on swap prevention).
3. **Custody Exclusivity:** No package may be owned, carried, or delivered by more than one robot at any time.
4. **Boundary & Obstacle Invariants:** Robots must never occupy cells outside warehouse bounds or inside static racks.
5. **Hardware Failure Invariants:** A robot marked `failed` or `recovering` must never move or be assigned active missions.

Any violation immediately throws an `InvariantViolation` error with detailed entity diagnostic data.
