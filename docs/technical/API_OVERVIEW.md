# SWARM — API Specifications & Contracts Overview

> **Status:** IMPLEMENTED (In-Browser TypeScript API) / PLANNED (Prospective REST/WS API)  
> **Last Verified:** 2026-11-24  
> **Source Files:** `API_CONTRACTS.md`, `src/types/simulation.ts`, `src/engine/warehouse-engine.ts`

---

## 1. The In-Browser TypeScript API (Active Contract)

The authoritative runtime interface is `SimulationSource` (`src/engine/warehouse-engine.ts`). All commands use the **Result Pattern** (`src/engine/core/result.ts`), guaranteeing explicit error handling without silent failures.

```ts
type Result<T, E = EngineError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

interface EngineError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

---

## 2. Engine Command Reference

All user and scenario actions are dispatched as strongly-typed command objects:

| Command | Payload | Execution Semantics | Error Codes |
|---|---|---|---|
| `start` | `—` | Resumes active simulation clock; emits `simulation-started` | `already-running` |
| `pause` | `—` | Pauses simulation clock; emits `simulation-paused` | `not-running` |
| `step` | `—` | Advances discrete clock by exactly 1 tick | `already-running` |
| `reset` | `—` | Resets world state to tick 0 and clears command log | `—` |
| `load-scenario` | `scenarioId: string` | Switches active layout/scenario and resets to tick 0 | `unknown-scenario` |
| `select-robot` | `robotId: string` | Sets active inspected robot in UI | `unknown-robot` |
| `add-mission` | `pickupStationId: string`<br>`dropoffStationId: string`<br>`priority?: "normal" \| "high" \| "urgent"` | Queues new mission and allocates package | `unknown-station`<br>`invalid-station-kind`<br>`invalid-priority` |
| `cancel-mission` | `missionId: string` | Cancels mission (only allowed prior to physical pickup) | `unknown-mission`<br>`invalid-mission-transition` |
| `close_aisle` | `cells: GridPoint[]`<br>`label?: string` | Marks cells as closed (`CL-nn`), invalidates crossing routes, replans active robots | `empty-closure`<br>`invalid-coordinates`<br>`cell-not-closable`<br>`already-closed` |
| `reopen_aisle` | `closureId: string` | Restores cell traversability and replans robots gaining shorter paths | `unknown-closure` |
| `fail_robot` | `robotId: string`<br>`failureType?: FailureType`<br>`reason?: string` | Halts robot, releases reservations, holds cell, requeues missions or initiates cargo recovery | `unknown-robot`<br>`robot-unavailable`<br>`invalid-failure-type` |
| `restore_robot` | `robotId: string` | Initiates restoration countdown, returns robot to `idle` | `unknown-robot`<br>`robot-not-failed` |
| `start_package_recovery` | `packageId: string`<br>`rescuerId?: string` | Re-opens rescue task for stranded cargo with fresh attempt budget | `unknown-package`<br>`package-not-stranded`<br>`recovery-in-progress` |
| `complete_package_handover` | `packageId: string` | Manually forces atomic custody transfer if rescuer is adjacent | `unknown-package`<br>`no-rescuer`<br>`rescuer-not-adjacent` |
| `cancel_recovery` | `packageId: string` | Cancels active rescue attempt; cargo remains with failed carrier | `unknown-package`<br>`no-open-recovery` |

---

## 3. Operational Event Schema (`SimEvent`)

Events are appended to the bounded 300-event ring buffer in `snapshot.events`:

```ts
interface SimEvent {
  id: string;                      // E-nnnnnn (engine) or P-nnnnnn (playback)
  seq: number;                     // Monotonically increasing sequence number
  tick: number;                    // Simulation timestamp
  kind: SimEventKind;              // Categorical event identifier
  severity: "info" | "warning" | "error" | "success";
  message: string;                 // Human-readable event description
  robotId?: string;                // Primary associated robot
  missionId?: string;              // Associated mission
  packageId?: string;              // Associated package
  stationId?: string;              // Associated station
  closureId?: string;              // Associated closure
  incidentId?: string;             // Associated deadlock incident
  cell?: GridPoint;                // Physical location
}
```

---

## 4. Prospective Remote Backend API (Horizon 2/3 Specification)

When SWARM introduces a FastAPI backend, the following endpoints will mirror the in-browser contracts:

### A. REST Endpoints (`/api/v1/`)
- `GET /api/v1/scenarios` — List available warehouse scenarios.
- `POST /api/v1/simulations` — Initialize a new simulation instance.
- `GET /api/v1/simulations/{id}/snapshot` — Fetch the current world snapshot.
- `POST /api/v1/simulations/{id}/commands` — Dispatch an `EngineCommand`.
- `POST /api/v1/simulations/{id}/seek` — Replay/seek to a specific tick.

### B. WebSocket Telemetry Stream (`/ws/telemetry/{id}`)
- **Client -> Server:** Continuous command stream (`start`, `pause`, `step`, speed adjustments).
- **Server -> Client:** High-frequency binary/JSON snapshot payloads at configured tick rates:
```json
{
  "type": "SNAPSHOT",
  "tick": 142,
  "running": true,
  "robots": [...],
  "missions": [...],
  "events": [...]
}
```
