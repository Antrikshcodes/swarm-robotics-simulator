# SWARM — Hackathon Pitch Script (5–7 Minute Master Delivery)

> **Status:** IMPLEMENTED  
> **Last Verified:** 2026-11-24  
> **Target Duration:** ~6 minutes (4:30 pitch + 1:30 live `/demo` walkthrough)  
> **Presenter Split:** 1 Presenter or 2 Presenters (Split at Slide 04: Product/Story vs. Engineering/Demo)  
> **Local App URLs:** `http://localhost:3000/demo` and `http://localhost:3000/simulation`

---

## Slide 01 — Title & Hook (0:00 – 0:35)

**Visual:** *SWARM Cover Slide — dark industrial grid, glowing cyan reservation trails, bold typography.*

> "Picture a modern fulfillment warehouse running dozens of autonomous mobile robots at peak throughput. Every robot knows how to navigate from point A to point B—until two of them meet face-to-face inside a one-cell-wide aisle, a third blocks the intersection, and a fourth suffers a motor seizure with an urgent customer package on board.
>
> That is why we built **SWARM** — the **Warehouse Robot Coordination Arena**. 
> 
> *[Pause half a second for emphasis]* 
> 
> **One warehouse. Multiple robots. Zero collisions.**"

---

## Slide 02 — The Multi-Robot Breakdown (0:35 – 1:15)

**Visual:** *Four-quadrant diagram illustrating Head-On Conflict, Intersection Loop, Stranded Cargo, and Lane Closure.*

> "Most multi-robot demos treat navigation as a single-agent problem: each robot calculates an independent 2D path and relies on bumper sensors or LiDAR to brake when an obstacle appears. In a real warehouse, that creates four compounding failures:
>
> First, **head-on standoffs** in narrow aisles where robots attempt to swap cells at the exact same tick. Second, **circular deadlocks** at intersections where three or more robots wait on each other in an infinite dependency loop. Third, **stranded cargo**—when a carrier breaks down, inventory records desynchronize. And fourth, **dynamic disruptions**—a pallet spill forces teams to reset the whole simulation from scratch.
>
> You cannot solve fleet coordination with reactive bumper sensors alone. You have to coordinate space, time, and package custody as a single synchronized system."

---

## Slide 03 — The SWARM Solution (1:15 – 1:55)

**Visual:** *SWARM Solution Overview showing the live control interface on MacBook Pro + 7 core capabilities.*

> "Meet **SWARM**—an autonomous fleet coordination and simulation platform built from the ground up as a deterministic, command-driven engine.
>
> Rather than bolting features onto scripted animations, SWARM integrates seven core capabilities into one unified architecture: 4D space-time reservation planning, priority-ordered coordination, cell-and-edge collision prevention, Tarjan-cycle deadlock recovery, fault handover without losing package custody, live dynamic aisle replanning, and real-time operational analytics.
>
> What you see on this screen isn't a static mockup. It is the live SWARM industrial control interface running entirely in the browser."

---

## Slide 04 — How SWARM Works: The 11-Phase Engine (1:55 – 2:45)

**Visual:** *11-phase execution loop pipeline diagram + Engine/UI architectural boundary.*

> "Every single tick in SWARM executes through a fixed, deterministic 11-phase loop inside `WarehouseEngine`.
>
> In **Planning**, we queue prioritized missions, assign jobs to the nearest idle robot using exact cached BFS distances, and compute 48-tick routes with Space-Time A\*.
>
> In **Coordination**, robots plan in priority order—with aging and right-of-way preemption—reserving both cells and directed edges. Before any robot moves, `resolveMoves` runs an atomic fleet-wide commit check.
>
> In **Execution**, robots step at most one cell per tick and execute formal pickup transitions. In **Recovery**, our deadlock and failure managers inspect wait-for graphs and stranded packages. And finally, an immutable snapshot flows out to our HTML5 Canvas renderer and Analytics views.
>
> Crucially, **the UI never owns simulation truth**: React and Canvas only render snapshots, and `checkInvariants()` validates collision, swap, and custody safety on every single tick."

---

## Slide 05 — Deep Engineering & Algorithmic Rigor (2:45 – 3:45)

**Visual:** *Four technical deep-dive quadrants + verified tech stack strip (`Next.js 16`, `React 19`, `TypeScript Strict`, `Vitest 15 files / 196 tests pass`).*

> "Four engineering pillars make SWARM resilient under pressure:
>
> 1. **Windowed Space-Time A\*:** Robots plan over `(x, y, t)` across a 48-tick window using exact cached BFS distance heuristics. Because we only replan when a goal changes or an aisle closes, planning frequency stays around **0.08 plans per robot per tick**.
> 2. **Two-Tier Safety Guard:** Reservations block cell overlap and head-on edge swaps during planning, and `resolveMoves` re-validates every move at commit time—giving us **zero commit rejections** across all benchmarks.
> 3. **Wait-For Deadlock Resolution:** Every tick we build a wait-for graph with a 6-cell route lookahead and run **Tarjan's SCC algorithm**. Cycles must persist 4 ticks before triggering recovery—filtering out ordinary traffic congestion with zero false positives—then a deterministic yielder backs into a safe BFS holding bay.
> 4. **Atomic Custody & Fault Recovery:** Package custody is a formal state machine. When a robot suffers a motor fault while carrying cargo, custody remains locked to the broken unit while the nearest free robot drives beside it and executes an **atomic handover**—ensuring zero lost or double-delivered packages.
>
> All of this runs in pure TypeScript with **15 test files and 196 automated Vitest checks passing**."

---

## Slide 06 / Live Demo Walkthrough (3:45 – 5:15)

**Action:** *Switch to browser window displaying `http://localhost:3000/demo`.*

> "Let’s see the running product in action.
> 
> *[Click Scenario: Narrow Aisle Standoff]*
> Here, two opposing robots attempt to traverse a one-cell passage. Watch how directional passage priority detects the edge reservation conflict; the opposing robot halts cleanly outside the corridor entrance until the lane clears.
> 
> *[Click Scenario: Deadlock Lab B]*
> Now watch a 3-way circular wait at an intersection. In the inspector, you can see the wait-for graph identify the cycle. After four ticks, the deadlock manager ranks the participants, and the lowest-priority robot executes a controlled back-out into a side holding bay, allowing traffic to unlock autonomously.
> 
> *[Click Scenario: Recovery Lab B]*
> Finally, let's watch what happens when hardware breaks down. Robot R-01 suffers a motor breakdown mid-transit while carrying package PKG-0004. Notice that the package is NOT dropped or erased. R-02 is automatically dispatched as a rescuer, drives to an adjacent cell, dwells for two ticks, and executes an atomic custody handover. R-02 completes the delivery to Dock 3. Exactly once. Zero inventory loss."

---

## Slide 07 — Impact, Scalability & Closing (5:15 – 6:00)

**Visual:** *Scaling benchmark table (0.15 ms at 4 robots -> 1.17 ms at 32 robots) + Horizon roadmap.*

> "In empirical scaling benchmarks, SWARM executes 32 robots at **1.17 ms per tick**, achieving linear scalability on standard hardware.
> 
> For systems integrators, SWARM eliminates weeks of pre-commissioning simulation modeling. For robotics OEMs, our space-time trajectory arrays map directly to the standardized **VDA 5050 industrial protocol**.
> 
> SWARM proves that autonomous fleets don't have to freeze, collide, or lose packages. 
> 
> **One warehouse. Multiple robots. Zero collisions.** Thank you!"
