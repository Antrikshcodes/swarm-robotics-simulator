# SWARM — Operational Use Cases

> **Status:** IMPLEMENTED  
> **Last Verified:** 2026-11-24  
> **Coverage:** 10 Industrial & Engineering Scenarios with Architectural Verification

---

## Use Case Overview Matrix

| # | Use Case Scenario | Primary User | Operational Friction | SWARM Functional Mechanism | Expected Outcome | Implementation Status |
|---|---|---|---|---|---|---|
| **1** | **Multi-Robot Warehouse Operations** | Operations GM / Fleet Supervisor | Multiple AMRs navigating shared aisles create high collision risk | Windowed Space-Time A\* planning with cell & edge reservations | Continuous, collision-free picking & delivery throughput | **IMPLEMENTED** |
| **2** | **Narrow-Aisle Coordination** | Logistics Integrator / Dispatcher | Two robots meet head-on in a one-cell-wide corridor | Directed-edge reservation table + directional passage priority | One robot traverses while the opposing robot waits outside or detours | **IMPLEMENTED** |
| **3** | **Congestion Management** | Facility Engineer | High-traffic pick faces cause localized queuing and bottlenecks | Right-of-way preemption + aging (+2 priority/tick) | Higher-priority urgent orders bypass queues; low-priority jobs avoid starvation | **IMPLEMENTED** |
| **4** | **Deadlock Prevention & Recovery** | Robotics Engineer / Shift Supervisor | 3+ robots in circular wait at an intersection freeze traffic | Tarjan SCC cycle detection (4-tick confirm) + BFS holding bay yield | Lowest-priority robot backs into holding bay; cycle clears autonomously | **IMPLEMENTED** |
| **5** | **Robot Failure Handling** | Maintenance Lead / Field Technician | AMR motor failure freezes mid-aisle, becoming a static obstacle | `fail_robot` halts unit, releases reservations, claims cell as obstacle | Surrounding robots immediately replan around the failed unit | **IMPLEMENTED** |
| **6** | **Package Custody Recovery** | Inventory Manager / WMS Auditor | Carrier failure strands customer package; inventory desynchronizes | Atomic package custody state machine + rescuer handover | Rescuer docks alongside, takes custody atomically; package delivered once | **IMPLEMENTED** |
| **7** | **Dynamic Aisle Closure** | Safety Coordinator / Floor Lead | Pallet spill or floor repair requires closing an active aisle | `close_aisle` command invalidates intersecting routes without reset | Active routes replan instantly; robots inside the closure drive out safely | **IMPLEMENTED** |
| **8** | **Warehouse Route Optimization** | Solutions Architect / Facility Designer | Inefficient rack layout causes excessive robot travel distance | Cached BFS distance maps + time-indexed reservations | Shortest traversable paths calculated with zero unnecessary detours | **IMPLEMENTED** |
| **9** | **Robotics Development & Testing** | Robotics Firmware / Algorithm Dev | Testing fleet algorithms on physical hardware is hazardous and slow | Deterministic discrete-tick engine, seeded PRNG (`mulberry32`), replay | 100% reproducible edge-case debugging with instant time-travel seek | **IMPLEMENTED** |
| **10** | **Academic Research & Simulation** | University Professor / MAPF Researcher | Academic simulators lack realistic cargo custody and hardware faults | Pure TypeScript implementation, 196 automated tests, open architecture | Standardized benchmark platform for Multi-Agent Pathfinding research | **IMPLEMENTED** |

---

## Detailed Use Case Walkthroughs

### Use Case 1: Multi-Robot Warehouse Operations
- **Scenario:** Peak-hour e-commerce fulfillment with 5–16 robots fulfilling concurrent pickup and drop-off missions across dense storage racks.
- **User:** Operations General Manager.
- **Problem:** As fleet size scales, robots crossing intersections and entering shared corridors experience near-misses, emergency stops, and motor wear.
- **SWARM Functionality:** Robots plan over a 48-tick space-time horizon. Cells and directed edges are leased per tick. Before each tick advances, `resolveMoves` verifies that no two robots occupy the same coordinate or traverse an edge in reverse.
- **Expected Outcome:** High sustained throughput (130+ deliveries per 2,000 ticks in standard scenarios) with zero collisions and zero commit rejections.
- **Current Status:** **IMPLEMENTED** (`src/engine/warehouse-engine.ts`, `src/engine/coordination/`).

### Use Case 2: Narrow-Aisle Coordination
- **Scenario:** Two robots assigned to opposing missions must traverse a single-cell-wide passage (e.g., Narrow Aisle scenario).
- **User:** Logistics Integrator.
- **Problem:** Without coordination, both robots enter opposite ends of the passage, meeting in the middle in an unresolvable head-on standoff.
- **SWARM Functionality:** When the first robot reserves the directed edges of the corridor, the opposing robot's space-time planner detects the edge conflict (`hasEdgeConflict`). The second robot either waits outside the corridor entrance or takes a secondary bypass lane.
- **Expected Outcome:** The corridor is shared sequentially without head-on standoffs or reverse edge traversals.
- **Current Status:** **IMPLEMENTED** (`src/engine/scenarios/narrow-aisle.ts`, `src/engine/coordination/move-resolver.ts`).

### Use Case 3: Congestion Management
- **Scenario:** Multiple robots converge on a single high-velocity picking dock (`Station S-01`).
- **User:** Facility Engineer.
- **Problem:** A queue forms; lower-priority replenishment robots block high-priority customer express orders.
- **SWARM Functionality:** Robots waiting behind slower or lower-priority mobile robots accumulate aging (+2 priority per tick, max 24). When an urgent robot waits $\ge 3$ ticks behind a lower-priority unit, right-of-way preemption triggers: the blocking robot holds its position for 1 tick while the urgent carrier replans around it.
- **Expected Outcome:** Urgent missions bypass congestion smoothly, while waiting low-priority robots eventually accumulate sufficient aging to complete their tasks.
- **Current Status:** **IMPLEMENTED** (`src/engine/coordination/coordinator.ts:checkPreemption`).

### Use Case 4: Deadlock Prevention & Recovery
- **Scenario:** Three robots enter a 3-way intersection simultaneously, each waiting for the cell occupied by the next (e.g., Deadlock Lab Scenario B).
- **User:** Robotics Algorithm Engineer.
- **Problem:** Circular dependency freezes the entire intersection indefinitely.
- **SWARM Functionality:** The engine builds a wait-for graph with 6-cell route lookahead. Tarjan's SCC algorithm detects the closed cycle. Once confirmed for 4 consecutive ticks, the manager ranks candidates (passage priority, convoy length, urgency) and commands the lowest-scoring yielder to back into a safe BFS holding bay.
- **Expected Outcome:** The intersection clears in under 15 ticks; the other robots pass, and the yielder resumes its original mission once traffic clears.
- **Current Status:** **IMPLEMENTED** (`src/engine/deadlock/deadlock-manager.ts`, `src/engine/scenarios/deadlock-lab.ts`).

### Use Case 5: Robot Failure Handling
- **Scenario:** An AMR experiences a drive motor seizure or battery depletion mid-transit in a main thoroughfare.
- **User:** Maintenance Lead.
- **Problem:** The broken robot stops abruptly, blocking all following traffic.
- **SWARM Functionality:** The `fail_robot` command transitions the robot to `status: failed`. Its future reservations are released, and its occupied cell is marked as an indefinite hold (`claimedCell`). Surrounding robots with active routes intersecting the broken unit receive `route_invalidated` and replan around the obstacle on the next tick.
- **Expected Outcome:** The broken robot is treated as a static obstacle; fleet traffic flows around it without pile-ups.
- **Current Status:** **IMPLEMENTED** (`src/engine/robots/robot-lifecycle.ts`, `src/engine/warehouse-engine.ts:failRobot`).

### Use Case 6: Package Custody Recovery
- **Scenario:** Robot `R-01` breaks down while carrying package `PKG-0004` to shipping dock `S-03` (e.g., Recovery Lab Scenario B).
- **User:** Inventory Manager / WMS Auditor.
- **Problem:** The package is trapped mid-aisle. Canceling the mission leaves physical inventory untracked; reassigning the mission from the start station causes double-picking.
- **SWARM Functionality:** Package transitions to `recovery-required`. Custody remains strictly bound to `R-01`. The Recovery Manager selects the nearest eligible idle robot (`R-02`), routes it to a free cell beside `R-01`, dwells for a 2-tick handover, and calls `transferCustody()`.
- **Expected Outcome:** `R-02` takes physical custody and completes the delivery to `S-03`. The package is delivered exactly once with a complete, auditable custody history.
- **Current Status:** **IMPLEMENTED** (`src/engine/custody/package-custody.ts`, `src/engine/recovery/recovery-manager.ts`).

### Use Case 7: Dynamic Aisle Closure
- **Scenario:** A liquid detergent spill occurs in Aisle 3; facility personnel cordon off cells `(6, 4)` through `(6, 8)`.
- **User:** Safety Coordinator.
- **Problem:** In traditional simulators, altering warehouse layout requires stopping the engine and re-importing CAD configurations.
- **SWARM Functionality:** The operator dispatches `close_aisle` with the affected cell coordinates. The engine registers closure `CL-01`, excludes those cells from all future A\* searches, invalidates intersecting routes, and prompts immediate replanning. Any robot currently standing inside the closure retains its cell and is allowed to drive out safely.
- **Expected Outcome:** Active robots reroute through adjacent aisles in real time without pausing or resetting the simulation.
- **Current Status:** **IMPLEMENTED** (`src/engine/warehouse-engine.ts:closeAisle`, `src/engine/scenarios/recovery-lab.ts:rec-c-aisle-closure`).

### Use Case 8: Warehouse Route Optimization
- **Scenario:** Sizing aisles and placement of charging stations in a newly commissioned 30,000 sq. meter distribution hub.
- **User:** Solutions Architect.
- **Problem:** Sizing travel lanes without empirical simulation leads to suboptimal rack layouts and unnecessary travel distance.
- **SWARM Functionality:** Pre-computed BFS distance maps provide exact obstacle-respecting distance heuristics. Schedulers assign missions based on exact travel costs rather than Euclidean approximations.
- **Expected Outcome:** 15–25% reduction in overall robot travel distance compared to Euclidean dispatch models.
- **Current Status:** **IMPLEMENTED** (`src/engine/coordination/distance-map.ts`).

### Use Case 9: Robotics Development & Testing
- **Scenario:** A robotics startup is developing firmware for autonomous pallet lifters and needs to test coordination logic against edge cases.
- **User:** Robotics Software Engineer.
- **Problem:** Testing corner-case deadlocks on physical robots is dangerous, expensive, and non-reproducible.
- **SWARM Functionality:** SWARM’s seeded PRNG (`mulberry32`) ensures that running a test with seed `0x5f3759df` produces the exact same robot trajectories, tick by tick, every single run. The command log allows engineers to seek backwards and forward through time to inspect bug states.
- **Expected Outcome:** Accelerated development velocity and zero risk of physical robot collisions during firmware prototyping.
- **Current Status:** **IMPLEMENTED** (`src/engine/core/prng.ts`, `src/engine/warehouse-engine.ts:seek`).

### Use Case 10: Academic Research & Simulation
- **Scenario:** Graduate researchers evaluating novel MAPF heuristics on dense multi-agent benchmark grids.
- **User:** University Professor.
- **Problem:** Academic researchers lack a modern, inspectable software platform that incorporates real-world logistics constraints (cargo custody, machine breakdown, battery depletion).
- **SWARM Functionality:** Open, modular TypeScript architecture with strictly separated concerns (`engine/`, `coordination/`, `deadlock/`, `recovery/`, `ui/`) and full test coverage.
- **Expected Outcome:** Researchers can easily plug in novel space-time heuristics and publish peer-reviewed papers using SWARM as an open benchmark arena.
- **Current Status:** **IMPLEMENTED** (`src/engine/`, `vitest.config.ts`).
