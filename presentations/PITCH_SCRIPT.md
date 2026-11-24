# SWARM — Hackathon Pitch Script (5–7 Minutes)

**Target Duration:** ~6 minutes (5:30 pitch + 1:00–1:30 live `/demo` walkthrough, easily flexing within 5–7 minutes)  
**Speakers:** 1 presenter (or split cleanly at Slide 04 between Product/Story and Engineering/Demo)  
**Live App URL (local demo):** `http://localhost:3000/demo` and `http://localhost:3000/simulation`

---

## Opening Hook (0:00 – 0:35) · Slide 01 — The Cover

**On screen:** *SWARM Cover — dark industrial warehouse floor, glowing cyan/lime reservations, tagline `"ONE WAREHOUSE. MULTIPLE ROBOTS. ZERO COLLISIONS."`*

> "Picture a fulfillment warehouse running dozens of autonomous mobile robots at peak throughput. Every robot knows how to get from A to B—until two of them meet inside a one-lane aisle, a third blocks the cross-junction, and a fourth stalls mid-delivery with a package on board.
>
> That's why we built **SWARM** — the **Warehouse Robot Coordination Arena**. One warehouse. Multiple robots. Zero collisions."

**Key emphasis:** Pause half a second before **"Zero collisions"** so judges lock onto the tagline.

**Transition → Slide 02:** *"Let's look at why naive robot navigation breaks down the moment a warehouse gets busy."*

---

## Slide 02 — The Problem (0:35 – 1:15)

**On screen:** *4-panel conflict diagram + 4 crisp problem cards.*

> "Most multi-robot demos treat navigation as a single-agent problem: each robot runs A* independently and hopes local obstacle avoidance sorts out the rest. In a real warehouse, that creates four compounding failures:
>
> First, **head-on conflicts** in narrow one-cell aisles—two robots try to swap cells at the same tick. Second, **circular-wait deadlocks** at cross-junctions, where every robot waits on the next and the whole corridor freezes. Third, **unexpected robot failures**—if a carrier breaks down mid-aisle, you risk losing or duplicating package ownership. And fourth, **dynamic aisle closures**—a pallet spill invalidates active routes, forcing teams to reset the whole simulation.
>
> You don't solve fleet coordination with better reactive sensors alone—you solve it by coordinating space, time, and custody as one system."

**Transition → Slide 03:** *"That's exactly what SWARM does."*

---

## Slide 03 — The Solution (1:15 – 1:55)

**On screen:** *7 integrated capabilities on the left + MacBook Pro running the live SWARM Overview dashboard.*

> "Meet **SWARM**—an autonomous warehouse fleet coordination and simulation platform built from the ground up as one deterministic engine.
>
> Rather than bolting features onto scripted animations, SWARM integrates seven capabilities into a single system: intelligent space-time pathfinding, priority-ordered coordination, cell-and-edge collision prevention, Tarjan cycle deadlock recovery, fault handover without losing package custody, live dynamic aisle replanning, and real-time operational analytics derived strictly from engine state.
>
> What you see on the MacBook isn't a Figma mockup—it's the live SWARM control interface running in the browser."

**Transition → Slide 04:** *"Here is how every tick executes under the hood, from task assignment to delivery."*

---

## Slide 04 — How SWARM Works (1:55 – 2:45)

**On screen:** *Color-coded 10-step pipeline (`Planning` → `Coordination` → `Execution` → `Recovery` → `Analytics`) + Engine/UI separation bar.*

> "Every tick in SWARM follows a fixed, deterministic 11-phase loop inside `WarehouseEngine`.
>
> In **Planning**, we parse the ASCII warehouse, queue prioritized missions, assign the most urgent jobs to the nearest free robot using exact cached BFS distances, and compute 48-tick routes with Space-Time A*.
>
> In **Coordination**, robots plan in priority order—with aging and right-of-way preemption—reserving both cells and directed edges. Before any robot moves, `resolveMoves` runs a fleet-wide commit check.
>
> In **Execution**, robots step at most one cell per tick and perform atomic pickup and delivery transitions. In **Recovery**, our deadlock and failure managers inspect wait-for graphs and stranded packages. And finally, an immutable snapshot flows out to our Canvas renderer and Analytics views.
>
> Crucially, **the UI never owns simulation truth**: React and Canvas only render engine snapshots and dispatch commands—and `checkInvariants()` verifies collision, swap, and custody safety on every single tick."

**Transition → Slide 05:** *"Let's zoom into the algorithms powering those guarantees."*

---

## Slide 05 — The Engineering (2:45 – 3:40)

**On screen:** *4 technical deep-dive quadrants + verified tech stack strip (`Next.js 16`, `React 19`, `TypeScript Strict`, `Vitest 15 files / 196 pass`).*

> "Four engineering layers make SWARM resilient under pressure:
>
> 1. **Space-Time WHCA*:** Instead of blind spatial A*, robots plan over `(cell, tick)` across a 48-tick window using exact cached BFS distance heuristics—and we only replan robots whose goal changes, runs low, or gets invalidated, keeping planning around 0.08 plans per robot per tick.
> 2. **Two-Layer Safety:** Reservations block cell overlap and head-on edge swaps during planning, and `resolveMoves` re-validates every move at commit time—giving us zero commit rejections across every shipped scenario and benchmark.
> 3. **Wait-For Deadlock Recovery:** Every tick we build a wait-for graph with a 6-cell lookahead and run **Tarjan's SCC algorithm**. Cycles must persist 4 ticks before triggering recovery—filtering out normal traffic congestion with zero false positives—then a deterministic yielder backs into a safe BFS holding bay.
> 4. **Custody & Fault Recovery:** Package custody is an explicit state machine. When a robot fails while carrying, custody stays locked on the failed unit while the nearest eligible robot drives beside it and executes an **atomic handover**—so no package is ever lost or double-delivered.
>
> All of this runs in pure TypeScript with **15 test files and 196 automated Vitest checks passing**, built on Next.js 16, React 19, Tailwind v4, Zustand, and HTML Canvas 2D—with FastAPI, PostgreSQL, and WebSockets scoped honestly as our next backend milestone."

**Transition → Slide 06:** *"Now let's look at the actual running product."*

---

## Slide 06 — The Product Showcase (3:40 – 4:15)

**On screen:** *Hero Apple-style MacBook Pro (`/simulation` Studio) + 2 Smartphones (`/` Overview & `/simulation` Mobile Studio).*

> "This is **Simulation Studio**—our live 2D warehouse arena. On the MacBook, you can see five robots actively executing missions, time-indexed reservations, planned routes, the entity inspector showing `R-02` carrying `PKG-0004`, and a seekable deterministic timeline that replays from tick zero.
>
> Alongside it are our real responsive mobile routes for `/` Overview and `/simulation`. Everything you see here is interactive: judges can click any robot to inspect its custody trail, inject one of five fault types, or close an aisle mid-run."

**Transition → Slide 07 (or Live Demo Switch!):** *"Let's see what happens when the warehouse gets unpredictable."*

---

## Slide 07 — Demonstration & Impact (4:15 – 5:45) *(Includes Optional 60s Live `/demo` Beat)*

**On screen:** *3 real Scenario Cards (`Lab B Deadlock`, `Rec B Cargo Failure`, `Rec C Dynamic Closure`) + Live Analytics (`T+0130`) + Verified `npm run bench` scaling table.*

> "Here are three live failure modes SWARM handles deterministically—and you can run all six judge scenarios in one click inside our **Demo Mode** at `/demo`:
>
> - **Deadlock Lab B:** Three robots enter a circular wait at a cross-junction; Tarjan SCC confirms the cycle at 4 ticks, picks the deterministic yielder, routes it to a holding cell, and resumes the fleet.
> - **Recovery Lab B:** `R-01` suffers a navigation fault at tick 9 while carrying `PKG-0001`. Custody stays locked on `R-01` until `R-02` drives adjacent and takes over in one atomic handover.
> - **Recovery Lab C:** A pallet spill closes two aisles at tick 6. Affected routes invalidate immediately and replan around the south lane with zero simulation reset.
>
> On the bottom left is our live **Analytics** view during a high-density 8-robot run at tick 130—showing 12 completed deliveries and 86.3% fleet utilization. And on the right are our measured **`npm run bench`** scaling benchmarks on a 40×27 grid over 600 ticks: scaling smoothly from **4 robots at 0.16 ms/tick** up to **32 robots at 1.25 ms/tick**, completing **162 deliveries** with **zero commit rejections**—and improving 2,000-tick throughput from 129 to 193 deliveries over our initial occupancy guard."

### Optional Live Demo Script (if switching to browser for 45–60 seconds)
1. **0:00–0:15:** Open `http://localhost:3000/demo`, click **Run** on **C — Deadlock recovery** (`2×` or `4×` speed). Point out the red deadlock halo, yielder route, and resolution event.
2. **0:15–0:35:** Click **Run** on **D — Robot failure with cargo**. Point out `R-01` halted in red, `RC-01` rescuer `R-02` approaching the handover cell, and `package_custody_transferred`.
3. **0:35–0:55:** Click **Analytics** in the sidebar to show live throughput, robot activity allocation, and movement-density cells updated straight from the engine.

**Transition → Slide 08:** *"Let's bring it home."*

---

## Slide 08 — The Vision / Closing (5:45 – 6:15)

**On screen:** *SWARM Vision — `"THE FUTURE OF WAREHOUSING IS COORDINATED."`, GitHub repo link, MacBook + Smartphone running Judge Demo Mode.*

> "Autonomous warehouses don't fail because individual robots can't drive—they fail when fleets aren't coordinated across space, time, and recovery.
>
> **SWARM** brings intelligent planning, deterministic coordination, and resilient recovery together in one warehouse simulation platform—verified today by 196 automated tests and ready for live inspection on GitHub.
>
> **One warehouse. Multiple robots. Zero collisions.** Thank you—we'd love to show you any scenario live in Q&A."
