# SWARM — Expected Judge Questions & Defensible Answers

> **Status:** IMPLEMENTED (Hackathon Defense Strategy)  
> **Last Verified:** 2026-11-24  
> **Coverage:** 28 Critical Technical, Algorithmic, Product, and Business Questions

---

## Category 1: Problem Relevance & Industry Need

### Q1: Is multi-robot coordination really a problem? Don't AMRs have onboard LiDAR and obstacle avoidance?
> **Answer:** "LiDAR safety fields are purely reactive: when a sensor detects an obstacle within 1.5 meters, the robot halts. In narrow one-cell corridors, two opposing robots both stop, enter a permanent standoff, and neither knows how to yield. Reactive avoidance solves single-obstacle collision; it cannot solve multi-agent topological scheduling."

### Q2: Why can't warehouses just use one-way traffic loops like highway lanes?
> **Answer:** "One-way routing loops reduce head-on conflicts but increase average travel distance by 30–60%, requiring 25% more robots to achieve the same throughput. Furthermore, one-way systems still deadlock at intersections and completely halt if a broken robot blocks the sole unidirectional lane."

---

## Category 2: Target Customers & Market Strategy

### Q3: Who is your primary immediate customer today?
> **Answer:** "Our immediate primary users are **warehouse automation integrators** (who design layouts and size AMR fleets during pre-sales bids) and **robotics software teams** developing central fleet controllers. Long-term, our edge runtime targets fulfillment center operators."

### Q4: How does this integrate with an existing Warehouse Management System (WMS)?
> **Answer:** "SWARM acts as a coordination and execution engine beneath the WMS. The WMS generates transport orders (`Move SKU from Station A to Dock B`). SWARM ingests those tasks, assigns robots, plans space-time trajectories, and reports back atomic custody events (`package_custody_transferred`, `package-delivered`)."

---

## Category 3: Pathfinding & Space-Time Algorithms

### Q5: Why did you choose Windowed Space-Time A\* instead of Conflict-Based Search (CBS)?
> **Answer:** "CBS is complete and optimal, but it is NP-hard. In a busy warehouse with 32 robots and continuous order feeds, CBS cannot meet real-time tick deadlines (50–100 ms). Windowed Space-Time A\* with priority ordering computes safe paths in under 1.2 ms per tick, scaling linearly while our commit resolver and deadlock manager handle residual contention."

### Q6: How do you prevent lower-priority robots from starving indefinitely?
> **Answer:** "We implement **mathematical priority aging**: waiting robots accumulate $+2$ priority points for every consecutive waiting tick (capped at $+24$). Over time, an idle or low-priority robot’s priority climbs until it gains right-of-way over normal traffic."

### Q7: What heuristic do you use for A\*? Is Manhattan distance sufficient?
> **Answer:** "No, Manhattan distance is inadmissible in warehouses with long storage racks because it ignores barrier detours. SWARM precomputes **BFS Distance Maps** from every station across the grid. This gives us an exact, obstacle-respecting distance heuristic that accelerates A\* search and guarantees optimal distance evaluation."

---

## Category 4: Multi-Robot Coordination & Collision Prevention

### Q8: How do you mathematically guarantee that two robots never collide?
> **Answer:** "Through two independent safety layers:
> 1. *Planning Time:* Robots reserve time-indexed cells `(x, y, t)` and directed edges `(u -> v, t)`. Plans that conflict with existing reservations are rejected during graph expansion.
> 2. *Commit Time:* Before any robot moves, `resolveMoves()` checks the collective fleet’s intended next-tick coordinates. If an invariant is breached, the move is rejected. Across thousands of ticks, commit rejections are zero."

### Q9: How do you prevent head-on edge swaps inside single-cell aisles?
> **Answer:** "By indexing directed edge reservations `(u -> v, t)`. If Robot A reserves move $u \to v$ at tick $t$, Robot B is barred from reserving $v \to u$ at tick $t$. The reverse transition is rejected at planning time via `hasEdgeConflict`."

---

## Category 5: Deadlock Detection & Cycle Resolution

### Q10: How does SWARM detect circular deadlocks?
> **Answer:** "Every tick, `buildWaitForGraph()` evaluates all waiting robots, creating dependency edges based on physical occupancy, held cells, and reservations along a 6-cell route lookahead. We then run **Tarjan’s Strongly Connected Components algorithm** in $O(V + E)$ time to pinpoint closed cycles."

### Q11: How do you avoid false-positive deadlock reports during normal traffic congestion?
> **Answer:** "Through a 4-tick persistence confirmation filter (`confirmTicks=4`). Transient cycles that clear within 1–3 ticks as robots move through intersections are tracked as `transientCycles` in telemetry and are never reported as deadlocks."

### Q12: How does SWARM choose which robot yields during a deadlock?
> **Answer:** "Using a deterministic ranking score:
> - $+1000$ points for robots already inside a narrow passage (directional passage priority).
> - $+100$ points per robot queued behind this agent (convoy priority).
> - Additional weights for mission urgency and carried cargo.
> The lowest-scoring candidate yields into the nearest safe BFS holding bay."

### Q13: What happens if a deadlock has no safe holding position available?
> **Answer:** "In unrecoverable geometries (such as Deadlock Lab Scenario E), the incident transitions safely to `status: failed`. Robots safely hold their current positions without colliding, and recovery retries only when an external world change occurs (e.g., an aisle is reopened or a mission is cancelled)."

---

## Category 6: Robot Hardware Failures & Package Custody

### Q14: What happens when a robot suffers a drive motor failure mid-aisle?
> **Answer:** "The engine halts the robot, cancels its future reservations, and permanently holds its occupied cell (`claimedCell`). Surrounding robots routed through that cell receive `route_invalidated` and automatically calculate detours on the next tick."

### Q15: How does SWARM guarantee zero lost or double-delivered packages?
> **Answer:** "Package custody is modeled as a formal finite state machine (`available`, `reserved`, `picked-up`, `in-transit`, `recovery-required`, `delivered`). If a carrier breaks down, custody remains locked to the broken robot while an adjacent rescuer is dispatched. Only after the rescuer dwells alongside for 2 ticks does `transferCustody()` execute atomically."

### Q16: What happens if the rescuer robot also breaks down en route?
> **Answer:** "The rescue attempt terminates as `rescuer-failed`. Because custody was never transferred, the package remains safely associated with the original failed carrier, and the Recovery Manager dispatches a third eligible robot."

---

## Category 7: Dynamic Topology & Aisle Closures

### Q17: Can an operator close an aisle while robots are moving without restarting?
> **Answer:** "Yes. The `close_aisle` command marks specified coordinates as impassable, immediately invalidates all reservations crossing those cells, and prompts affected robots to replan around the blockage on the next tick."

### Q18: What happens to a robot that is standing inside an aisle when it gets closed?
> **Answer:** "The robot is not teleported or faulted. It retains its physical cell hold, continues along its planned trajectory to exit the closed zone, and no subsequent robot is permitted to enter behind it."

---

## Category 8: Architecture, Performance & Scalability

### Q19: What is the computational overhead per simulation tick?
> **Answer:** "In our scaling benchmarks, mean tick duration is **0.15 ms at 4 robots**, **0.25 ms at 8 robots**, and **1.17 ms at 32 robots** on standard hardware. Because robots only replan when needed (approx. 0.08 replans per robot per tick), overhead scales linearly."

### Q20: Why did you build the core engine in TypeScript instead of C++ or Rust?
> **Answer:** "Building in TypeScript enabled full architectural isolation, instant in-browser zero-install execution for hackathon evaluation, and direct integration with React 19 and HTML5 Canvas. For Horizon 2/3 enterprise deployments, the engine algorithms map directly to Rust/C++."

### Q21: How do you handle animation smoothness without desynchronizing simulation state?
> **Answer:** "The simulation engine is completely decoupled from rendering. The engine advances in discrete ticks, while `PlaybackDriver` uses `requestAnimationFrame` to interpolate physical coordinates between `previousPosition` and `position` at 60 FPS."

---

## Category 9: Competitive Landscape & Defensibility

### Q22: How does SWARM compare to Gazebo or NVIDIA Isaac Sim?
> **Answer:** "Isaac Sim and Gazebo are high-fidelity 3D physics simulators focused on LiDAR raycasting and wheel slip friction. They require high-end GPUs and cannot run 30+ robots for 5,000 ticks in seconds. SWARM is a **coordination and logic arena** that models fleet-level space-time scheduling and custody state machines."

### Q23: How does SWARM compare to Open-RMF?
> **Answer:** "Open-RMF is a traffic dispatch framework for mixed ROS fleets. SWARM focuses specifically on automated narrow-aisle conflict resolution, Tarjan SCC deadlock recovery, and atomic package custody during mid-transit hardware breakdowns—packaged in a zero-install browser environment."

---

## Category 10: Future Scope & Commercialization

### Q24: What is your roadmap for physical robot integration?
> **Answer:** "In Mission 008, we will implement the **VDA 5050 protocol standard**. Our 48-tick space-time plan arrays map directly onto VDA 5050 JSON trajectory nodes and edges, allowing SWARM to dispatch orders directly to physical AMRs over MQTT."

### Q25: What is your monetization model?
> **Answer:** "We propose a dual model:
> 1. A **Cloud Simulation SaaS** (\$499–\$2,500/month) for warehouse automation integrators during layout pre-sales.
> 2. An **Enterprise Edge Runtime** (\$35,000–\$75,000/facility/year) deployed on-premise for live 24/7 fleet coordination."

### Q26: Are these benchmark metrics real or simulated?
> **Answer:** "Every metric cited is backed by automated benchmarks in the repository (`npm test` and `npm run bench`). We run 15 test suites with 196 automated tests covering 3,000-tick stress runs, collision invariants, and custody preservation."

### Q27: How does battery management work in the simulation?
> **Answer:** "We model battery drain per move (0.04%), handling tick (0.01%), and idle tick (0.004%). Robots below 25% battery automatically seek free charging docks when idle; robots below 15% are barred from taking new missions."

### Q28: What is the single biggest technical takeaway of SWARM?
> **Answer:** "That warehouse fleet coordination cannot be an afterthought left to reactive bumper sensors. By scheduling movement across space and time simultaneously, SWARM achieves mathematical certainty: **Zero collisions, zero unrecovered deadlocks, and zero lost packages.**"
