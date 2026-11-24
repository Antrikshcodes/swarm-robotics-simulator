# SWARM — Known Limitations & Engineering Boundaries

> **Status:** IMPLEMENTED (Engineering Disclosure)  
> **Last Verified:** 2026-11-24  
> **Principle:** Complete Technical Transparency (Zero Fabricated Capabilities)

---

## 1. Architectural & Memory Boundaries

1. **In-Memory Run Scope:** Simulation state exists entirely in browser memory. A full browser page refresh resets the simulation to tick 0. While user interface preferences (theme, tick speed, canvas layers) persist in `localStorage`, simulation run histories and event logs are not permanently archived.
2. **Bounded Log Ring Buffers:** To prevent browser tab memory exhaustion during long-running simulations (e.g., 10,000+ ticks), historical logs are bounded:
   - Operational Events: capped at the latest **300 events**.
   - Movement Records: capped at the latest **400 moves** (movement-density heatmaps reflect this 400-move window).
   - Finished Missions: capped at the latest **200 completed missions**.
   - Deadlock Incidents: capped at the latest **40 incidents**.
   - Robot Failures: capped at the latest **60 records**.
   - Cumulative all-run counters (total deliveries, lifetime waiting ticks, distance traveled) are retained indefinitely for the active run.
3. **Seek Replay from Tick 0:** The `seek(tick)` operation replays forward from tick 0 by re-applying the command log. While replay is fast (approx. 100–160 ms for 2,000 ticks), there are no intermediate snapshot checkpoints.

---

## 2. Pathfinding & Coordination Boundaries

1. **Incomplete Multi-Agent Search:** Prioritized Space-Time A\* is a bounded-suboptimal heuristic algorithm, not a complete multi-agent solver like Conflict-Based Search (CBS). In complex grid geometries lacking bypass bays (e.g., Deadlock Lab Scenario E), robots can enter unrecoverable deadlocks. SWARM detects these cycles safely and reports them as `failed`, but does not guarantee a solution if no physical bypass exists.
2. **Windowed Planning Horizon (48 Ticks):** Space-time reservations are planned across a rolling 48-tick window. Trajectories longer than 48 ticks are planned in segments.
3. **Discrete Grid Kinematics:** The world model is a discrete 2D grid with cardinal 4-connected movement. Robots accelerate and decelerate instantly within one tick. Continuous kinematic curves, turning radii, inertia, and wheel friction are not modeled.

---

## 3. Failure & Recovery Boundaries

1. **No Physical Robot Towing:** A failed robot remains as a static physical obstacle blocking its grid cell until explicitly repaired via `restore_robot`. There is no automated towing vehicle to physically push or drag a broken robot off the main thoroughfare.
2. **Destination Dock Standoff:** If a robot fails while sitting directly on top of its destination drop-off dock, a rescuer cannot pull alongside to unload it (as the dock cell is blocked). In this specific edge case, the failed robot must be restored to finish unloading.
3. **Deterministic Fault Injection Only:** Failures are triggered explicitly via operator commands (`fail_robot`) or pre-scheduled scenario scripts. There is currently no stochastic Poisson failure distribution modeling random component wear.
4. **Mission State Semantics:** The mission lifecycle currently does not feature a dedicated `failed` terminal state. `cancelled` is the sole terminal unsuccessful state. Missions requiring cargo recovery remain in the active `recovery-required` state until resolved.

---

## 4. Hardware & Platform Boundaries

1. **Zero Real-World Hardware Integration:** SWARM is currently a simulation platform. It does not connect directly to physical AMR hardware, LiDAR drivers, or industrial PLCs.
2. **Simplified Battery Model:** Battery depletion is a linear demonstration model (0.04% per move, 0.01% per handling tick, 0.004% per idle tick; +1% per tick on charger). It does not reflect battery chemistry, voltage sag under heavy load, or temperature variations.
3. **Desktop-First Optimization:** While the application shell features responsive mobile layouts (`/` and `/simulation`), the primary industrial control room experience is optimized for desktop and tablet displays ($\ge 1280 \times 800$ resolution).
4. **Empirical Performance Scope:** Benchmark metrics (sub-1.2 ms tick duration at 32 robots) were measured on a single test machine (Apple M5, Node 24) on a synthetic $40 \times 27$ grid. Ultra-large facilities (e.g., $200 \times 200$ grids with 100+ robots) have not been profiled.
