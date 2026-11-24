# SWARM — Hackathon Pitch Deck Slide Content

**Deck:** `presentations/SWARM_Hackathon_Pitch_Deck.pptx` (Widescreen 16:9, editable)  
**PDF Export:** `presentations/SWARM_Hackathon_Pitch_Deck.pdf`  
**Problem Statement:** NexHack 2.0 — PS 05  
**Repository:** https://github.com/Antrikshcodes/swarm-robotics-simulator (`feat/mission-001-frontend`)

---

## Slide 01 — The Cover

- **Brand Lockup:** SWARM · Robot Coordination Arena (`SwarmMark` 3×3 grid glyph) · `NEXHACK 2.0 · PS 05`
- **Headline:** SWARM
- **Subtitle:** `WAREHOUSE ROBOT COORDINATION ARENA`
- **Tagline:**
  > ONE WAREHOUSE.
  > MULTIPLE ROBOTS.
  > **ZERO COLLISIONS.**
- **Supporting Text:** Intelligent coordination for autonomous warehouse fleets. Deterministic space-time routing, deadlock recovery & fault handover.
- **Technical Pills:** `Space-Time WHCA*` · `Tarjan Deadlock` · `Atomic Custody`
- **Visual:** Custom dark industrial warehouse floor illustration (`#090D10` / `#19242A`) with storage racks, pickup/drop-off docks (`PK1`, `PK2`, `DO1`, `DO2`), glowing cyan/lime reservation paths, and four autonomous mobile robots (`R-01`–`R-04`) operating with zero conflicts.

---

## Slide 02 — The Problem

- **Kicker:** `01 / THE PROBLEM`
- **Headline:** `"ONE WAREHOUSE. TOO MANY MOVING PARTS."`
- **Subhead:** Modern warehouses rely on autonomous mobile robots—yet isolated pathfinding collapses when fleets share tight corridors.
- **Left Visual:** Custom 4-panel warehouse conflict diagram illustrating:
  1. `1 · HEAD-ON AISLE CONFLICT` — Opposing paths collide in 1-cell corridors
  2. `2 · CIRCULAR WAIT DEADLOCK` — Cross-junction cycles freeze entire fleets
  3. `3 · STRANDED CARGO ON FAULT` — Failed robot halts aisle & locks package custody
  4. `4 · DYNAMIC AISLE CLOSURE` — Spills & obstacles break static route plans
- **Right Problem Cards:**
  1. **Narrow-Aisle Conflicts (`Head-on swaps & route collisions`):** Two robots claim the same 1-cell aisle from opposite ends without temporal locks.
  2. **Multi-Robot Deadlocks (`Circular waits freeze entire corridors`):** Local waiting turns into junction cycles that starve downstream missions.
  3. **Robot Failures & Stranded Cargo (`Faulted units lock aisles & ownership`):** Without atomic handover, a broken carrier either loses or duplicates package custody.
  4. **Dynamic Aisle Closures (`Obstacles invalidate static route plans`):** Pallet spills or closed lanes force manual resets unless routes replan live.

---

## Slide 03 — The Solution

- **Kicker:** `02 / THE SOLUTION`
- **Headline:** `"MEET SWARM."`
- **Subhead:** An autonomous warehouse fleet coordination and simulation platform built as one deterministic, invariant-checked system.
- **Core Capabilities (Left Column):**
  1. **Intelligent Pathfinding** — Spatial A* & windowed space-time WHCA* with exact BFS distance maps
  2. **Multi-Robot Coordination** — Priority-ordered planning, aging & 3-tick right-of-way preemption
  3. **Collision Prevention** — Time-indexed cell & directed-edge reservations + commit-time verify
  4. **Deadlock Detection & Recovery** — Wait-for Tarjan SCC (4-tick confirm) & safe holding-bay yield
  5. **Robot Failure Recovery** — Pre-pickup requeue, nearest rescuer & atomic custody handover
  6. **Dynamic Aisle Replanning** — Runtime closures invalidate & replan affected routes without reset
  7. **Operational Analytics** — Throughput, utilization, waiting time & movement density from engine
- **Product Mockup (Right Column):** Space Black MacBook Pro displaying the actual running SWARM `/` Overview dashboard at `T+0048` (`5` robots active, `2` delivered, live warehouse canvas preview, fleet table, and event feed).

---

## Slide 04 — How SWARM Works

- **Kicker:** `03 / SYSTEM WORKFLOW & ARCHITECTURE`
- **Headline:** `"FROM TASK ASSIGNMENT TO DELIVERY."`
- **Subhead:** Fixed 11-phase deterministic tick loop (`WarehouseEngine`) — simulation truth lives in the engine, never in UI animations.
- **Functional Color Legend:** `PLANNING` (`#40C8E8`) · `COORDINATION` (`#B7F34A`) · `EXECUTION` (`#3DD6B0`) · `RECOVERY` (`#F5B942`) · `ANALYTICS` (`#A68CFF`)
- **Workflow Steps:**
  1. **Warehouse Init** *(Planning)*: ASCII layout parsed into grid, docks, pick faces, chargers & racks.
  2. **Mission Creation** *(Planning)*: Missions queue from scenario, seeded feed, or live UI dispatch.
  3. **Task Assignment** *(Planning)*: Urgent jobs first → nearest free robot via cached BFS distance.
  4. **Path Planning** *(Planning)*: 48-tick Space-Time A* plans over `(cell, tick)` with wait actions.
  5. **Coordination** *(Coordination)*: Priority order + right-of-way preemption when blocked ≥ 3 ticks.
  6. **Reservation Check** *(Coordination)*: Time-indexed cell & edge locks + fleet `resolveMoves()` commit check.
  7. **Robot Movement** *(Execution)*: Robots step ≤ 1 cell/tick or hold explicitly; battery drains per move.
  8. **Pickup & Delivery** *(Execution)*: Atomic custody transitions at pick face & drop-off dock.
  9. **Monitor & Recover** *(Recovery)*: Tarjan SCC deadlock yield, rescuer handover & aisle replanning.
  10. **Snapshot & Metrics** *(Analytics)*: Immutable `SimulationSnapshot` drives Studio, Incidents & Analytics.
- **Engine / UI Separation Bar:**
  - `UI Layer (React 19 + Zustand + Canvas 2D)` ⇄ `dispatch / snapshot` ⇄ `WarehouseEngine (Pure TypeScript, zero DOM/timers, mulberry32 PRNG)` → `every tick` → `checkInvariants()` (Collision, swap & custody guard).

---

## Slide 05 — The Engineering

- **Kicker:** `04 / TECHNICAL DEPTH`
- **Headline:** `"INTELLIGENCE BEHIND EVERY MOVE."`
- **Subhead:** Every algorithm is implemented in pure TypeScript under `src/engine/` and verified by 196 automated Vitest checks.
- **Architecture Quadrants:**
  1. **01 · SPACE-TIME PATHFINDING** (`space-time-planner.ts` · `astar.ts` · `distance-map.ts`)
     - Windowed Cooperative A* (WHCA*) over `(cell, tick)`: 48-tick horizon, 4,000-node cap
     - Exact cached BFS distance map heuristic + spatial A* with Manhattan heuristic (`MinHeap`)
     - Replans only on goal change, invalidation, or margin (≈ 0.08 plans / robot / tick)
  2. **02 · RESERVATIONS & TWO-LAYER SAFETY** (`reservation-table.ts` · `move-resolver.ts` · `invariants.ts`)
     - Time-indexed cell & directed-edge reservations block head-on swaps at planning time
     - Priority = urgency (10/30/60) + carry (+5) + wait aging (max 24); 3-tick preemption
     - Fleet `resolveMoves()` commit check + `checkInvariants()` every tick (0 rejections)
  3. **03 · DEADLOCK DETECTION & RECOVERY** (`wait-for-graph.ts` · `deadlock-manager.ts`)
     - Wait-for graph over 6-cell lookahead + Tarjan SCC cycle detection every tick
     - 4-tick persistence threshold filters transient traffic congestion (0 false positives)
     - Deterministic yielder score + BFS holding cell (depth ≤ 30) + bounded 3-attempt cascade
  4. **04 · CUSTODY & FAILURE RECOVERY** (`package-custody.ts` · `recovery-manager.ts`)
     - State machine: `available → reserved → picked-up → in-transit → recovery-required → delivered`
     - 5 fault types (`motor`, `battery`, `navigation`, `communication`, `emergency-stop`); nearest rescuer + atomic handover
     - Dynamic `close_aisle` / `reopen_aisle` invalidates & replans routes without reset
- **Verified Tech Stack Strip:** `Next.js 16` · `React 19` · `TypeScript Strict` · `Tailwind v4 + shadcn` · `Zustand` · `Framer Motion` · `Canvas 2D` · `Vitest · 15 files / 196 pass`
- **Honest Scope Note:** Planned backend infrastructure (not yet built): `FastAPI · PostgreSQL · WebSockets`.

---

## Slide 06 — The Product: MacBook + Smartphone Showcase

- **Kicker:** `05 / WORKING PRODUCT SHOWCASE`
- **Headline:** `"NOT JUST A CONCEPT. A WORKING SIMULATION."`
- **Subhead:** Actual captures from the running SWARM web application across desktop Simulation Studio and responsive mobile routes.
- **Hero Device Composition:**
  - **MacBook Pro (`/simulation`):** Live Simulation Studio at `T+0048` (`Standard warehouse`, 28×18 grid, 5 active robots, 67 reserved cells, planned routes, `R-02` Entity Inspector showing `Carrying PKG-0004 to DO-02`, 0.5–4× playback bar, timeline & event strip).
  - **Smartphone 1 (`/`):** Actual responsive Overview page at `T+0036` (`5/5` active robots, Fleet & Missions KPIs, Warehouse preview link).
  - **Smartphone 2 (`/simulation`):** Actual responsive Simulation Studio at `T+0036` (mobile canvas, scenario selector, inspector & playback controls).
- **Technical Callouts:** `Simulation Studio` · `Live Entity Inspector` · `Responsive Fleet Status` · `Mobile Studio View`.

---

## Slide 07 — Demonstration & Impact

- **Kicker:** `06 / DEMONSTRATION & IMPACT`
- **Headline:** `"WHEN THE WAREHOUSE GETS UNPREDICTABLE."`
- **Subhead:** Reproducible failure, deadlock & closure scenarios paired with measured engine scaling benchmarks.
- **Top Scenario Proof Cards (Real Studio Captures):**
  1. **LAB B · 3-ROBOT DEADLOCK:** Before: 3 robots lock in cross-junction cycle. → After: 4-tick confirm → yielder backs to bay & all resume.
  2. **REC B · FAILURE WITH CARGO:** Before: `R-01` fails at `T+0009` carrying `PKG-0001`. → After: Custody held → `R-02` drives beside & takes over atomically.
  3. **REC C · DYNAMIC CLOSURE:** Before: Pallet spill blocks 2 aisles at `T+0006`. → After: Plans invalidated → live reroute via south aisle without reset.
- **Bottom-Left (Real Analytics Capture):** `/analytics` during `high-density` at `T+0130` (`12` completed deliveries, `86.3%` fleet utilization, `56.4` ticks average delivery time, `818` cells distance, delivery throughput chart, robot activity allocation, congestion heatmap).
- **Bottom-Right (Verified `npm run bench` Scaling Table · 40×27 Grid · 600 Ticks · Apple M5 / Node 24):**
  - `4 robots`: `0.16 ms/tick` · `23 deliveries` · `0.3% wait` · `0 rejects`
  - `8 robots`: `0.27 ms/tick` · `45 deliveries` · `0.5% wait` · `0 rejects`
  - `16 robots`: `0.61 ms/tick` · `86 deliveries` · `1.3% wait` · `0 rejects`
  - `32 robots`: `1.25 ms/tick` · `162 deliveries` · `2.3% wait` · `0 rejects`
  - **2,000-tick comparison vs Mission 002 occupancy guard:** Standard `133 vs 101` deliveries · High-density `193 vs 129` deliveries · `0 commit rejections`.

---

## Slide 08 — The Vision / Closing

- **Brand Lockup:** SWARM · Warehouse Robot Coordination Arena
- **Headline:** `THE FUTURE OF WAREHOUSING IS COORDINATED.`
- **Supporting Text:** `"SWARM brings intelligent planning, autonomous coordination and resilient recovery together in one warehouse simulation platform."`
- **Closing Tagline:**
  > ONE WAREHOUSE.
  > MULTIPLE ROBOTS.
  > **ZERO COLLISIONS.**
- **Repository & Status Card:**
  - `https://github.com/Antrikshcodes/swarm-robotics-simulator`
  - Branch: `feat/mission-001-frontend` · `196` passing tests · Ready for live judge demo (`/demo`)
- **Product Visual:** MacBook Pro running Judge Demo Mode (`/demo`, `Narrow aisle conflict`) paired with responsive mobile Demo Mode view.
