# SWARM — Detailed User Personas

> **Status:** IMPLEMENTED (Product & User Research)  
> **Last Verified:** 2026-11-24  
> **Archetypes:** Four Primary Personas across Engineering, Integration, Operations, and Academia

---

## Persona 1: Elena Rostova — Lead Systems Integrator

```
┌────────────────────────────────────────────────────────────────────────┐
│  ELENA ROSTOVA                                                         │
│  Role: Principal Automation & Logistics Solutions Architect            │
│  Company: Apex Automation Integrators (Tier-1 Systems Integrator)       │
│  Experience: 14 years in material handling & warehouse robotics        │
│  Location: Chicago, Illinois                                           │
└────────────────────────────────────────────────────────────────────────┘
```

### Background & Responsibilities
Elena designs turnkey automated logistics systems for Fortune 500 retail clients. She evaluates warehouse CAD layouts, determines required AMR fleet sizes (20–80 robots), specifies rack layouts and charging locations, and presents bid proposals valued between \$5M and \$25M.

### Goals
- Deliver highly optimized warehouse floor layouts that maximize Units Per Hour (UPH) while minimizing total robot count.
- Confidently predict traffic bottlenecks and peak-hour congestion during the pre-sales phase.
- Win client proposals by demonstrating dynamic resilience (e.g., how the facility responds when an aisle is blocked).

### Frustrations & Pain Points
- Existing enterprise discrete-event simulators (FlexSim, Demo3D) require 2–3 weeks of custom scripting just to model a basic multi-robot layout.
- Software licenses cost upwards of \$30,000 per engineer and cannot be easily shared with prospective clients in a web browser.
- Simulators often hide robot deadlocks behind artificial "teleportation" or physics clipping, leading to real-world deployment failures where robots freeze in narrow aisles.

### How Elena Uses SWARM
- Elena uses SWARM’s ASCII grid definition and Simulation Studio to model prospective warehouse layouts in under 30 minutes.
- She loads high-density scenarios (8–32 robots) to identify narrow-aisle choke points and verifies that SWARM's space-time reservations maintain steady throughput without deadlocks.
- During sales presentations, Elena uses SWARM’s `/demo` mode to show client executives real-time dynamic aisle closures and autonomous fault recovery directly in her browser.

---

## Persona 2: Dr. Marcus Vance — Robotics Algorithms Researcher

```
┌────────────────────────────────────────────────────────────────────────┐
│  DR. MARCUS VANCE                                                      │
│  Role: Senior Research Scientist in Multi-Agent Systems                │
│  Institution: Center for Autonomous Logistics & Robotics Research      │
│  Experience: 8 years in algorithmic pathfinding & graph theory         │
│  Location: Zurich, Switzerland                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Background & Responsibilities
Marcus researches bounded-suboptimal Multi-Agent Pathfinding (MAPF) algorithms. He publishes papers in top-tier robotics conferences (ICRA, IROS, AAMAS) and develops novel conflict-resolution heuristics for constrained multi-agent environments.

### Goals
- Benchmark novel multi-agent coordination heuristics against established baselines (CBS, PBS, Cooperative A\*).
- Reproduce complex topological edge cases (e.g., circular deadlocks, narrow passage standoffs) reliably.
- Validate safety invariants (zero collisions, zero reverse-edge swaps) under extreme agent density.

### Frustrations & Pain Points
- Standard academic benchmark maps (e.g., Moving AI grid benchmarks) treat agents as point masses with zero physical dimensions, zero package custody mechanics, and zero machine breakdown states.
- 3D simulators like Gazebo and Isaac Sim are too slow: running 3,000 ticks takes minutes instead of seconds, and non-deterministic physics engines make edge cases impossible to reproduce consistently.
- Lack of inspectable graph state: traditional simulators do not expose the underlying wait-for dependency graph.

### How Marcus Uses SWARM
- Marcus benchmarks his heuristics against SWARM’s windowed Space-Time A\* and Tarjan SCC cycle resolution.
- He uses SWARM’s deterministic seeded PRNG (`mulberry32`) to run 5,000-tick regression tests in under 500 ms, ensuring 100% reproducible experiments.
- Marcus inspects SWARM's `wait-for graph` and decision traces (`wait`, `yield`, `preempt`, `commit-reject`) to study how transient queuing transitions into persistent circular deadlocks.

---

## Persona 3: Devante Jenkins — Warehouse Operations General Manager

```
┌────────────────────────────────────────────────────────────────────────┐
│  DEVANTE JENKINS                                                       │
│  Role: General Manager of Fulfillment Operations                       │
│  Company: NextDay Logistics (High-Velocity E-Commerce Hub)             │
│  Experience: 11 years in supply chain & fulfillment management         │
│  Location: Dallas, Texas                                               │
└────────────────────────────────────────────────────────────────────────┘
```

### Background & Responsibilities
Devante oversees a 350,000 sq. ft. fulfillment center running 45 Autonomous Mobile Robots and 120 human pickers. His primary KPI is fulfilling 85,000 customer orders per day while meeting a 99.4% on-time dispatch SLA.

### Goals
- Eliminate AMR floor gridlocks that halt picking zones and require manual supervisor intervention.
- Guarantee that hardware breakdowns do not lead to "lost" customer packages or duplicate order picking.
- Manage aisle spills, pallet drops, and rack repairs on the fly without stopping active robot missions.

### Frustrations & Pain Points
- When two robots meet in a narrow aisle, they enter a sensor standoff; a floor supervisor has to physically walk into the active grid with an Xbox controller to manually reverse one robot.
- When an AMR’s drive motor burns out mid-transit, its carried tote is "lost" in the WMS; customer orders are delayed, and inventory audit discrepancies accumulate.
- Traditional fleet management dashboards are clunky, desktop-only, and provide poor real-time visibility into why robots are waiting.

### How Devante Uses SWARM
- Devante monitors the SWARM Overview dashboard to track fleet utilization, waiting share, and active incidents in real time.
- He relies on SWARM’s autonomous deadlock recovery: when a narrow-aisle conflict occurs, the lowest-priority robot automatically backs into a safe holding bay without requiring human intervention.
- When an AMR suffers a motor fault, Devante watches SWARM dispatch the nearest free rescuer to complete an atomic package custody handover, ensuring zero customer orders are dropped.

---

## Persona 4: Priya Sharma — Fleet Software Engineer at AMR OEM

```
┌────────────────────────────────────────────────────────────────────────┐
│  PRIYA SHARMA                                                          │
│  Role: Senior Embedded & Fleet Management Software Engineer            │
│  Company: OmniMove Robotics (Industrial Mobile Robot Manufacturer)     │
│  Experience: 6 years in ROS 2, C++, and industrial firmware            │
│  Location: Boston, Massachusetts                                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Background & Responsibilities
Priya develops central fleet management middleware and onboard navigation algorithms for OmniMove’s line of autonomous pallet lifters. She is responsible for ensuring her company’s robots integrate seamlessly with customer warehouse environments and third-party systems via VDA 5050.

### Goals
- Implement a reliable central coordinator that prevents multi-robot intersection gridlocks before deploying firmware to physical customer sites.
- Ensure strict adherence to safety invariants (no two robots ever occupy the same cell or cross the same edge in reverse).
- Decouple central routing logic from physical hardware so algorithms can be developed and regression-tested continuously in CI/CD.

### Frustrations & Pain Points
- Testing fleet coordination directly on physical hardware is hazardous, expensive, and requires a dedicated warehouse test track.
- Existing open-source frameworks (ROS 2 Nav2) only handle single-robot obstacle avoidance and lack fleet-wide time-reservation protocols.
- Firmware bugs that cause deadlocks only manifest when 10+ robots are operating simultaneously under heavy customer order feeds.

### How Priya Uses SWARM
- Priya uses SWARM as an architectural reference and simulation test harness for OmniMove’s upcoming central fleet manager.
- She runs SWARM’s automated test suite (15 files / 196 tests) inside her team’s CI pipeline to verify that coordination algorithms prevent edge swaps and circular deadlocks under stress.
- Priya references SWARM’s `API_CONTRACTS.md` and `SIMULATION_RULES.md` to design OmniMove’s VDA 5050 command and trajectory dispatch schemas.
