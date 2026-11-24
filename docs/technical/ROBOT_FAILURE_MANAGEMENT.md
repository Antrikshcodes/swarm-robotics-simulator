# SWARM — Robot Failure Management & Package Custody Handover

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Source Files:** `src/engine/recovery/recovery-manager.ts`, `src/engine/custody/package-custody.ts`, `src/engine/robots/robot-lifecycle.ts`

---

## 1. Hardware Failure Modeling

Real warehouse mobile robots experience hardware breakdowns. In SWARM, failures are not treated as generic exceptions that reset the simulation; they are modeled as explicit state transitions within the deterministic engine.

### The Five Simulated Failure Types
SWARM models five distinct industrial failure modes (`src/engine/robots/robot-lifecycle.ts`):

| Failure Type | Industrial Cause | Recovery Dwell Time (Ticks) | Restoration Behavior |
|---|---|---|---|
| `motor` | Drive wheel seizure, gearbox failure, traction motor burnout | 12 ticks | Motor repaired; robot re-enters fleet as `idle` |
| `battery` | Battery Management System (BMS) voltage cutoff, thermal limit | 8 ticks | Battery replaced; robot restored with fresh 100% charge |
| `navigation` | LiDAR optical blinding, encoder slip, SLAM localization loss | 6 ticks | Sensors recalibrated; pose re-localized |
| `communication` | Wi-Fi dead-zone, packet loss, ROS 2 heartbeat timeout | 4 ticks | Network link re-established |
| `emergency-stop` | Physical bumper hit, safety laser curtain breach, manual E-stop | 2 ticks | Safety interlock reset |

Each failure generates a unique record (`RobotFailure F-nn`) capturing timestamp, position, active mission, and cargo status.

---

## 2. Invariant: Separation of Cargo Custody from Machine Availability

In naive fleet simulators, when a robot fails, its assigned mission is canceled and the inventory item is erased from active tracking. In real-world fulfillment, this causes severe inventory drift and phantom stock.

SWARM enforces strict decoupling between **hardware operational status** and **physical package custody**:
- A failed carrier cannot move or be assigned new missions.
- However, physical custody of the cargo remains **locked to the failed robot**.
- The package is transitioned to `recovery-required`.
- The mission is transitioned to `recovery-required`.
- No third-party robot can pick up, deliver, or reserve this package until a formal custody handover is completed.

---

## 3. Package Custody Finite State Machine

Package custody is governed by formal transitions in `src/engine/custody/package-custody.ts`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     PACKAGE CUSTODY TRANSITIONS                        │
│                                                                        │
│   available <──> reserved ──> picked-up ──> in-transit ──> delivered   │
│                                                 │                      │
│                                                 ▼                      │
│                                         recovery-required              │
│                                                 │                      │
│                                                 └──> in-transit        │
│                                                 (Handover to Rescuer)  │
└────────────────────────────────────────────────────────────────────────┘
```

1. `available`: Package sits at origin station, unassigned.
2. `reserved`: Allocated to a specific robot for a mission; cannot be reserved by another agent.
3. `picked-up`: Carrier has arrived at origin and loaded package onto chassis.
4. `in-transit`: Carrier has departed origin station carrying the package.
5. `recovery-required`: Carrier failed mid-transit. Package remains physically on the disabled robot.
6. `delivered`: Final terminal state; cargo unloaded at destination station.

---

## 4. The Autonomous Package Recovery Protocol (`RecoveryManager`)

When a robot carrying a package fails, the `RecoveryManager` (`src/engine/recovery/recovery-manager.ts`) automatically opens a recovery task (`RecoveryTask RC-nn`):

### 1. Rescuer Candidate Selection
Every tick, before general mission assignment, the manager queries the fleet for eligible rescue robots:
- Must be `operational` and `idle`.
- Must have no active mission or package on board.
- Must not be yielding in an active deadlock.
- Must have $\ge 15\%$ battery charge.
- Must be able to calculate a valid traversable route to an open cell adjacent to the failed carrier.

The candidate with the **shortest BFS distance to a free adjacent cell** is selected.

### 2. Approach & Reservation Coordination
The assigned rescuer receives a temporary mission targeting the adjacent handover cell. Crucially, **the rescuer uses the standard space-time planner and reservation table**. It does not teleport or bypass normal traffic rules; it plans routes, waits for passing traffic, and respects deadlock resolution like any other fleet agent.

### 3. Atomic Handover Execution
1. The rescuer arrives at the cell adjacent to the failed carrier.
2. The rescuer dwells for `handoverTicks = 2` ticks to simulate physical arm or automated transfer latching.
3. The engine invokes `transferCustody()`:
   - Package holder transitions from `failedRobotId -> rescuerId`.
   - Package status transitions from `recovery-required -> in-transit`.
   - Mission assignment transitions to `rescuerId`.
   - Custody audit log appends the handover record with the exact simulation tick.
4. The rescuer resumes the delivery trajectory to the original destination station.

### 4. Edge-Case Guarantees
- **Rescuer Failure:** If the rescuer itself breaks down en route to the handover, the attempt is aborted (`rescuer-failed`), custody remains safely with the original carrier, and a new rescuer is dispatched.
- **Holder Restored First:** If an operator repairs the failed carrier (`restore_robot`) before the rescuer completes handover, the rescuer is stood down, and the original robot resumes its delivery.
- **Destination Dock Failure:** If a carrier fails directly on top of its destination dock, another robot cannot pull alongside to unload; the carrier must be restored to complete delivery.
- **Bounded Attempts:** At most 3 rescue attempts are permitted before requiring world change or manual operator intervention.
