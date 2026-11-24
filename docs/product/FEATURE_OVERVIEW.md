# SWARM — Complete Product Feature Overview

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Application Areas:** 8 Distinct Functional Views & Controls

---

## 1. Feature Navigation & Page Overview

SWARM provides a unified industrial control room interface across eight core functional surfaces:

```mermaid
flowchart TD
    App["SWARM Application Shell"]
    App --> P1["1. Overview (/)"]
    App --> P2["2. Simulation Studio (/simulation)"]
    App --> P3["3. Demo Mode (/demo)"]
    App --> P4["4. Fleet (/fleet)"]
    App --> P5["5. Missions (/missions)"]
    App --> P6["6. Incidents (/incidents)"]
    App --> P7["7. Analytics (/analytics)"]
    App --> P8["8. Settings (/settings)"]
```

---

## 2. Detailed Feature Breakdown

### 1. Overview Dashboard (`/`)
- **Fleet & Mission KPIs:** Real-time summary tiles displaying active robots, completed deliveries, waiting share percentage, and open incidents.
- **Live Warehouse Preview Canvas:** Compact, interactive top-down rendering of the active warehouse grid with robot positions and active closures.
- **System Activity Feed:** Live stream of recent engine decisions and operational warnings.
- **Quick-Start Scenario Cards:** One-click launch shortcuts into the Simulation Studio.

### 2. Simulation Studio (`/simulation`) — The Primary Experience
- **Interactive HTML5 2D Canvas:** Direct visual warehouse rendering with pan, zoom (0.5x to 3.0x), and auto-follow camera tracking.
- **Layer Visual Toggles:** Toggle display of coordinate coordinates, planned routes, space-time reservation footprints, and the active wait-for dependency graph.
- **Playback Control Strip:** Play, pause, single-tick advance, playback speed multiplier (0.5x, 1x, 2x, 5x), and time-travel scrubber.
- **3D Warehouse (default) and 2D grid:** two views of the same engine snapshot, with camera presets (isometric, overview, top, follow, chase) that frame any layout size. Preset changes glide in an arc and are instant with reduced motion.
- **Interactive warehouse inspection (Mission 007):** click any warehouse element in 3D or 2D. Hover outlines what is under the pointer; the selected element gets a lime highlight. Escape, the inspector's ✕, or clicking empty space clears the selection. The selection is shared between 2D and 3D.
  - **Robots:** identity, status, battery, heading, position, mission, destination and route, current activity, and failure/recovery details. Camera actions: **Focus**, **Follow**, **Overview**.
  - **Rack blocks:** coordinates, footprint and size, the open aisles on each face (lane or narrow, closures, robots, stations), routes running alongside, and robots nearby. Inventory and storage levels are shown as *not modelled*, because the engine does not model them.
  - **Aisle cells:** coordinates, cell type, traversability, narrow aisle, closure, occupant, future reservations, end-of-plan holds, robots waiting on the cell, deadlocks, planned routes through it, and robots within three cells. Close a cell or an aisle run, or reopen it.
  - **Stations (pickup, drop-off, charger):** ID, type, cell, the robot at the station (charging state and battery for chargers), inbound robots, waiting packages, and open missions with package, robot and state. Pickups can queue a new mission.
  - **Obstacles:** block footprint and adjacent aisles.
  - **Frame in view** on any non-robot entity glides the 3D camera to it, or centres the 2D view.
- **Interactive Fault Injection Controls:**
  - `Close Aisle`: Select any aisle cell or run of cells to close dynamically.
  - `Fail Robot`: Select any active robot and inject one of five hardware failure types (`motor`, `battery`, `navigation`, `communication`, `emergency-stop`).
  - `Restore Robot`: Trigger repair and restoration sequence.
  - `Add Mission`: Dispatch ad-hoc customer transport orders between stations.

### 3. Judge Demo Mode (`/demo`)
- **Curated Scenario Selector:** Dedicated hackathon evaluation launcher featuring six seeded, reproducible scenarios.
- **Live Operational Timeline:** Displays timestamped narrative steps and milestones as the scenario unfolds.
- **Automated Completion State:** Automatically detects when all scenario missions have been completed or resolved, presenting a final performance scorecard.

### 4. Fleet Management (`/fleet`)
- **Status-Filtered Roster:** Complete inventory of all robots in the fleet, filterable by status (`idle`, `moving`, `carrying`, `waiting`, `failed`, `recovering`).
- **Battery Health Telemetry:** Visual battery level indicators and charging status.
- **Cumulative Robot Metrics:** Individual stats for distance traveled, busy ticks, waiting ticks, and completed deliveries.

### 5. Mission Operations Board (`/missions`)
- **Lifecycle Kanban & Table:** Tracks transport orders through all formal states (`queued`, `assigned`, `to-pickup`, `picking-up`, `carrying`, `to-dropoff`, `dropping-off`, `completed`, `cancelled`, `recovery-required`).
- **Priority Badges:** Color-coded urgency tags (`urgent` = red, `high` = amber, `normal` = blue).
- **New Mission Dispatcher:** Modal form to submit on-the-fly transport requests while the fleet is operating.

### 6. Incident Management Console (`/incidents`)
- **Deadlock Incident Queue:** Detailed logs of detected dependency cycles (`DL-nnnn`), listing involved robots, blocking coordinates, and recovery attempts.
- **Hardware Failure Records:** Complete log of machine faults (`F-nn`), listing failure cause, stranded package, and assigned rescuer.
- **Package Recovery Tasks:** Auditable view of open and completed cargo rescue missions (`RC-nn`).

### 7. Operational Analytics (`/analytics`)
- **Time-Windowed Throughput:** Bar charts tracking deliveries per 100-tick window.
- **Fleet Time Allocation:** Proportion of robot time spent moving, waiting, loading, charging, or faulted.
- **Movement-Density Heatmap:** Identifies high-traffic corridors and congestion bottlenecks across the warehouse floor based on retained movement history.
- **Recovery & Incident Metrics:** Summary counts of detected cycles, resolved deadlocks, and cargo handovers.

### 8. System Settings (`/settings`)
- **Tick Interval Configuration:** Adjust base tick duration (50 ms to 1,000 ms).
- **Motion Smoothing & Interpolation:** Toggle CSS/Canvas position interpolation for low-end devices.
- **Storage Management:** Reset stored preferences in browser `localStorage`.
