# SWARM — Deadlock Detection & Autonomous Recovery Architecture

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Source Files:** `src/engine/deadlock/deadlock-manager.ts`, `src/engine/deadlock/wait-for-graph.ts`, `src/engine/scenarios/deadlock-lab.ts`

---

## 1. Deadlock Challenge in Multi-Agent Logistics

On a 4-connected grid, two robots can only block each other directly in pairs (because the grid graph is bipartite). However, multi-robot deadlocks involving three or more agents frequently arise at cross-junctions and rack corners because each robot's *future intended path* is blocked by the position or end-of-plan hold of another robot.

SWARM detects and recovers from these topological cycles without requiring central simulation restarts or human supervisor floor walks.

---

## 2. The Wait-For Graph Construction

Every tick after moves are applied, `buildWaitForGraph()` (`src/engine/deadlock/wait-for-graph.ts`) inspects all robots that are currently waiting and have not reached their goal.

### Edge Generation Rules
A directed dependency edge $A \longrightarrow B$ is created if:
1. **Occupancy Dependency (`occupied`):** Robot $B$ physically occupies one of the next **6 cells** along Robot $A$'s static route (computed as a gradient walk over the cached BFS distance map).
2. **Hold Dependency (`held`):** Robot $B$ holds the destination cell claim on one of the next 6 cells of Robot $A$'s static route.
3. **Reservation Dependency (`reserved`):** Robot $B$ owns the space-time reservation that Robot $A$ is currently waiting on.

A single robot may have multiple out-edges if multiple agents block its forward route.

---

## 3. Tarjan’s Strongly Connected Components (SCC)

Once the wait-for graph is constructed:
- SWARM executes **Tarjan's SCC algorithm** to find all maximal strongly connected subgraphs in linear time:
$$O(V + E)$$
- Any strongly connected component containing $\ge 2$ robots represents a closed dependency cycle where every robot in the group is waiting on another member.

### Congestion vs. Fatal Deadlock Discrimination
To eliminate false alarms caused by normal queueing behind active traffic:
- **Persistence Threshold:** A cycle is only declared a deadlock incident if the exact same group of robots persists in the cycle for `confirmTicks = 4` consecutive simulation ticks *and* every participant has individually waited for $\ge 4$ ticks.
- **Transient Cycles:** Cycles that dissolve within 1–3 ticks (as robots clear junctions) are recorded in operational telemetry as `transientCycles` and are **never reported as deadlocks**.
- **Stall Incidents:** If a robot with an active mission has waited for $\ge 40$ ticks without being part of a circular cycle, a separate `stall` incident is opened.

---

## 4. Deterministic Autonomous Recovery Strategy

Once a deadlock incident is confirmed (`DeadlockIncident DL-nnnn`), SWARM executes an autonomous recovery procedure:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DEADLOCK RECOVERY PROTOCOL                        │
│                                                                        │
│  Step 1: Rank Cycle Participants Deterministically                     │
│  Step 2: Identify Nearest BFS Holding Bay for Selected Yielder         │
│  Step 3: Release Group Reservations & Claim Current Coordinates        │
│  Step 4: Command Yielder to Route into Holding Bay (recoveryFirst)     │
│  Step 5: Verify Cycle Resolution & Release Yielder to Resume Goal      │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Candidate Ranking
Cycle members are scored deterministically; the candidate with the **lowest score yields first**:
$$\text{Score} = \text{NarrowPassageScore} + \text{ConvoyScore} + \text{UrgencyWeight} + \text{CarryBonus} + \min(\text{WaitTicks}, 30)$$
- **Directional Passage Priority:** $+1000$ points if the robot is already inside a narrow passage (ensuring robots inside narrow corridors continue forward rather than reversing).
- **Convoy Rule:** $+100$ points per non-cycle robot queued behind this agent (ensuring long convoys maintain right-of-way).
- **Urgency & Carry:** High-urgency and cargo-carrying robots receive higher scores.
- **Ties:** The higher numerical robot ID yields.

### 2. Holding Position BFS Search (`findHolding`)
The engine initiates a breadth-first search from the chosen yielder’s current coordinate up to depth 30:
- Must be a traversable, non-station, unclosed cell.
- Must not be occupied or held by another robot.
- **Protected Path Invariant:** The holding cell must NOT lie along the static route of any other participant or dependent in the deadlock group.

### 3. Execution & Verification
- The yielder’s temporary goal is set to the holding cell, and its planning priority is elevated (`recoveryFirst`).
- Surrounding members claim their current cells and hold.
- Once the yielder reaches the holding cell and holds for $\ge 2$ ticks while other members advance $\ge 3$ cells, the deadlock is flagged as `resolved`.
- The yielder's original mission goal is restored, and normal operations resume.

### 4. Cascade & Failure Handling
- **Cascade:** If a secondary cycle persists among remaining members while the first yielder holds, an additional yielder is selected (`escalated`).
- **Bounded Attempts:** At most 3 recovery attempts are permitted (`maxAttempts = 3`).
- **Safe Failure:** If no safe holding position exists (e.g., Deadlock Lab Scenario E), the incident transitions to `status: failed`. Robots safely hold their positions without crashing, and recovery retries only when external world changes occur (e.g., aisle opened or mission added).
