# SWARM — Reproducible Demonstration Scenarios

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Scenario Source:** `src/engine/scenarios/`, `src/components/demo/demo-mode.tsx`

---

## Master Demo Scenarios Matrix

| Scenario # | Title | Scenario ID | Key Tested Capability | Verified Status |
|---|---|---|---|---|
| **1** | Normal Warehouse Operations | `standard` | Space-time coordination, steady-state delivery throughput | **IMPLEMENTED** |
| **2** | Narrow-Aisle Conflict | `narrow-aisle` | Head-on collision prevention, passage priority | **IMPLEMENTED** |
| **3** | Deadlock Detection | `lab-b-three-robot` | Wait-for graph construction, Tarjan SCC cycle detection | **IMPLEMENTED** |
| **4** | Deadlock Autonomous Recovery | `lab-a-two-robot` | Yield-to-holding-position, controlled back-out | **IMPLEMENTED** |
| **5** | Robot Failure Mid-Transit | `rec-a-no-package` | Machine fault isolation, cell hold, route invalidation | **IMPLEMENTED** |
| **6** | Package Custody Recovery | `rec-b-carrying` | Atomic cargo handover from broken robot to rescuer | **IMPLEMENTED** |
| **7** | Dynamic Aisle Closure | `rec-c-aisle-closure` | Real-time map mutation without simulation reset | **IMPLEMENTED** |
| **8** | Occupied Aisle Evacuation | `rec-d-occupied-closure` | Safe exit for robots caught inside newly closed zones | **IMPLEMENTED** |
| **9** | Fleet Analytics & Heatmaps | `high-density` | Traffic density visualization, UPH tracking | **IMPLEMENTED** |

---

## Detailed Reproducible Walkthroughs

### Scenario 1: Normal Warehouse Operations
- **Scenario ID:** `standard`
- **Initial Setup:** Standard warehouse layout with 5 operational robots (`R-01` to `R-05`), 4 picking stations, and a seeded feed of mixed normal, high, and urgent missions.
- **User Action:** Select "Standard Warehouse" in Demo Mode or Simulation Studio; click **Play** (or press Spacebar).
- **Expected System Behavior:** Robots plan space-time paths to pickup stations, dwell for 2 ticks to load, transport packages to destination docks, and dwell for 2 ticks to deliver. Higher-priority missions pre-empt lower-priority traffic.
- **Events Generated:** `mission-created`, `mission-assigned`, `pickup-started`, `package-picked-up`, `dropoff-started`, `package-delivered`.
- **What Audience Should Observe:** Fluid, synchronized multi-robot movement across shared lanes with zero collisions, zero head-on standoffs, and steadily climbing delivery counters.
- **Status:** **IMPLEMENTED**.

### Scenario 2: Narrow-Aisle Conflict
- **Scenario ID:** `narrow-aisle`
- **Initial Setup:** A single-cell-wide corridor connecting two warehouse zones. Two robots are dispatched to traverse the corridor in opposing directions.
- **User Action:** Load scenario `narrow-aisle`; start simulation.
- **Expected System Behavior:** The first robot to reserve directed edges into the corridor claims right-of-way. The opposing robot detects the edge conflict (`hasEdgeConflict`), halts at the corridor mouth, or detours via an outer bypass lane.
- **Events Generated:** `right-of-way`, `conflict-prevented`, `robot-waiting`.
- **What Audience Should Observe:** Robots never meet head-on or attempt an edge swap inside the narrow passage. One robot passes cleanly while the other waits patiently outside.
- **Status:** **IMPLEMENTED**.

### Scenario 3: Deadlock Detection (3-Robot Cycle)
- **Scenario ID:** `lab-b-three-robot`
- **Initial Setup:** Three robots arranged at a 3-way intersection, each positioned in the cell requested by the next robot in a circular loop.
- **User Action:** Load Deadlock Lab B; start playback.
- **Expected System Behavior:** Robots step into their waiting states. The engine builds the wait-for graph with 6-cell route lookahead. Tarjan's SCC algorithm flags the 3-robot strongly connected component. After 4 consecutive ticks (`confirmTicks=4`), the incident is confirmed.
- **Events Generated:** `deadlock_detected`, `deadlock_group_identified` (naming all 3 robot IDs).
- **What Audience Should Observe:** In the Incidents console and Canvas overlay, a circular dependency ring appears, highlighting the exact participating robots and contended intersection cells.
- **Status:** **IMPLEMENTED**.

### Scenario 4: Deadlock Autonomous Recovery
- **Scenario ID:** `lab-a-two-robot`
- **Initial Setup:** Two robots meet head-on inside a dead-end corridor with a side bay available adjacent to the lane.
- **User Action:** Load Deadlock Lab A; press Play.
- **Expected System Behavior:** Deadlock is detected and confirmed. The candidate ranking algorithm scores both robots; the lower-scoring candidate is chosen to yield. A BFS search locates the nearest safe holding cell in the side bay. The yielder backs up into the bay, claims the hold, allows the opposing robot to pass, and resumes its trajectory once the lane is clear.
- **Events Generated:** `deadlock_recovery_started`, `robot_yielded`, `recovery_route_planned`, `deadlock_resolved`.
- **What Audience Should Observe:** Fully autonomous resolution: one robot backs into the side pocket without any human intervention, and both robots successfully reach their destinations.
- **Status:** **IMPLEMENTED**.

### Scenario 5: Robot Failure Mid-Transit
- **Scenario ID:** `rec-a-no-package`
- **Initial Setup:** Robot `R-01` is dispatched to pick up a package at Station `S-02`.
- **User Action:** At tick 10, robot `R-01` suffers a simulated motor breakdown (or user clicks **Fail Robot** in inspector).
- **Expected System Behavior:** `R-01` halts immediately; its operational status transitions to `failed`. Its future reservations are canceled, and its current cell is permanently claimed. Because the package was not yet picked up, the mission is requeued and reassigned to `R-02`. Surrounding robots replan around `R-01`.
- **Events Generated:** `fail_robot`, `route_invalidated`, `robot_recovery_started` (`requeue-mission`), `robot_recovery_completed` (`mission-reassigned`).
- **What Audience Should Observe:** `R-01` glows red with a hazard ring. Traffic routes around it like a static obstacle, and `R-02` seamlessly takes over the mission.
- **Status:** **IMPLEMENTED**.

### Scenario 6: Package Custody Recovery
- **Scenario ID:** `rec-b-carrying`
- **Initial Setup:** Robot `R-01` picks up package `PKG-0004` and begins transit to drop-off dock `S-03`.
- **User Action:** Injected motor fault halts `R-01` while carrying cargo.
- **Expected System Behavior:** `PKG-0004` transitions to `recovery-required`. Custody remains bound to `R-01`. The Recovery Manager selects idle robot `R-02`, plans an approach to an adjacent cell, dwells for a 2-tick handover, and atomically updates custody to `R-02`. `R-02` then completes delivery to `S-03`.
- **Events Generated:** `package_recovery_required`, `package_recovery_started`, `package_custody_transferred`, `package_delivery_resumed`, `package-delivered`.
- **What Audience Should Observe:** `R-02` drives up directly beside the broken robot, pauses for 2 ticks to simulate package transfer, and then drives to the destination dock. The package is delivered once with a 100% auditable custody trail.
- **Status:** **IMPLEMENTED**.

### Scenario 7: Dynamic Aisle Closure
- **Scenario ID:** `rec-c-aisle-closure`
- **Initial Setup:** Warehouse operating at steady state with multiple robots traversing central Aisle 2.
- **User Action:** Operator calls `close_aisle` across cells `(6, 4)` through `(6, 8)` to simulate a chemical spill.
- **Expected System Behavior:** Closure `CL-01` is registered. Future reservations across those cells are released. Approaching robots receive `route_invalidated` and calculate detours on the next tick. The simulation continues uninterrupted without a reset.
- **Events Generated:** `close_aisle`, `route_invalidated`, `robot_route_replanned`.
- **What Audience Should Observe:** Red hazard diagonal striping appears over the closed aisle. Approaching robots turn into adjacent cross-aisles in real time without stopping or clipping.
- **Status:** **IMPLEMENTED**.

### Scenario 8: Occupied Aisle Evacuation
- **Scenario ID:** `rec-d-occupied-closure`
- **Initial Setup:** Robot `R-02` is parked or moving inside a cell that is suddenly cordoned off by an aisle closure.
- **User Action:** Apply closure directly over `R-02`'s current coordinate.
- **Expected System Behavior:** `R-02` is not teleported, crushed, or faulted. It retains its physical cell hold, continues along its planned exit path, and leaves the closed zone. No other robot is permitted to enter behind it.
- **Events Generated:** `close_aisle`, `route_invalidated`.
- **What Audience Should Observe:** The robot inside the hazard zone drives out safely, after which the cell becomes permanently impassable to all other traffic.
- **Status:** **IMPLEMENTED**.

### Scenario 9: Fleet Analytics & Movement Density
- **Scenario ID:** `high-density`
- **Initial Setup:** 8 robots operating under a heavy mission generation feed (a mission generated every 2 ticks).
- **User Action:** Run simulation for 200+ ticks, then open **Analytics** (`/analytics`).
- **Expected System Behavior:** Engine aggregates delivery timestamps, cumulative robot status allocations, and retained movement coordinates.
- **Events Generated:** Continuous operational event stream.
- **What Audience Should Observe:** Real-time movement density heatmap showing high-traffic intersection hotspots, fleet utilization breakdown, and steady delivery velocity charts.
- **Status:** **IMPLEMENTED**.
