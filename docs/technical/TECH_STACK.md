# SWARM — Complete Technology Stack Documentation

> **Status:** IMPLEMENTED (Source-Verified)  
> **Last Verified:** 2026-11-24  
> **Verification Basis:** `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, source code imports

---

## 1. Architectural Technology Stack Overview

SWARM uses an industrial-grade, client-first architecture built on modern web and systems primitives. The engine runs locally in the browser runtime with zero remote network latency, ensuring determinism, instant responsiveness, and high tick rates.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SWARM TECHNOLOGY STACK                          │
│                                                                        │
│   Frontend Layer: Next.js 16.4.6, React 19.3.0, Tailwind CSS 4.3.3    │
│   State Management: Zustand 5.1.0 + Context Motion Providers           │
│   Rendering Engine: HTML5 Canvas 2D (Direct Pixel Rendering)           │
│   Simulation Core: Pure TypeScript 5.x Deterministic Engine             │
│   Algorithms: Windowed Space-Time A*, Tarjan SCC, BFS Distance Maps   │
│   Testing & QA: Vitest 5.1.1 (15 Test Files / 196 Automated Tests)     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Currently Implemented Technologies

### A. Frontend Layer

| Technology | Verified Version | Purpose in SWARM | Where Used | Why Selected |
|---|---|---|---|---|
| **Next.js** | `16.4.6` | App Router framework, build system, SSR/SSG route generation | `src/app/`, `next.config.ts` | Modern App Router, optimized client-side routing, modular layout nesting |
| **React** | `19.3.0` | UI component lifecycle, hooks, and reactive presentation | `src/components/`, `src/app/` | Industry-standard declarative UI library with concurrent mode performance |
| **React DOM** | `19.3.0` | DOM binding and rendering target for React 19 | `src/app/layout.tsx` | Standard React web target |
| **TypeScript** | `^5.0.0` | Strict static type safety across engine, models, and UI | Entire repository (`tsconfig.json`) | Enforces mathematical safety invariants, type-safe commands, and compile-time correctness |
| **Tailwind CSS** | `4.3.3` | Industrial utility-first styling system | `src/app/globals.css`, component classes | High-density dark industrial theme, low CSS runtime overhead |
| **@tailwindcss/turbopack** | `4.3.3` | Turbopack integration for Tailwind CSS v4 | Build tooling | Rapid incremental compilation in development |
| **Zustand** | `5.1.0` | Global reactive client state management | `src/store/simulation-store.ts`, `src/store/preferences-store.ts`, `src/store/viewport-store.ts` | Minimal boilerplate, unopinionated outside-React store subscription, zero unnecessary re-renders |
| **HTML5 Canvas 2D** | Native Web API | Hardware-accelerated 2D warehouse rendering | `src/lib/render/warehouse-renderer.ts`, `src/components/simulation/warehouse-canvas.tsx` | High-frequency 60 FPS spatial rendering without DOM tree thrashing |
| **Framer Motion** | `12.43.0` | Purposeful UI transitions, dialog animations, toasts | `src/components/layout/command-toast.tsx`, `src/components/layout/motion-provider.tsx` | Smooth spring-based micro-interactions and status alerts |
| **Lucide React** | `1.79.0` | Clean industrial iconography | Sidebar, toolbar, metrics strips across all views | Crisp, tree-shakeable SVG icons adhering to dark industrial theme |
| **Radix UI** | `1.8.1` | Headless, accessible UI primitive components | `src/components/ui/` | Fully accessible dropdowns, dialogs, sliders, and tooltips |
| **Class Variance Authority (CVA)** | `0.7.1` | Type-safe UI component variants | `src/components/ui/` | Declarative button, badge, and tab variant generation |
| **cn (clsx / tailwind-merge)** | `0.5.2` | Conditional class merge utility | `src/lib/utils.ts` | Eliminates conflicting Tailwind CSS classes dynamically |

### B. Simulation Core & Algorithmic Layer

| Technology / Module | Implementation Source | Purpose in SWARM | Why Selected |
|---|---|---|---|
| **Deterministic Tick Loop** | `src/engine/warehouse-engine.ts` | Authoritative 11-phase discrete-tick simulation coordinator | Ensures mathematical determinism, command sequencing, and state snapshotting |
| **Windowed Space-Time A\*** | `src/engine/coordination/space-time-planner.ts` | 4D pathfinding over space and time `((x, y), t)` | Eliminates cell and edge conflicts before movements are committed |
| **Binary Min-Heap** | `src/engine/pathfinding/min-heap.ts` | Priority queue for A\* open-set evaluation | $O(\log N)$ extraction of lowest-cost space-time nodes |
| **Tarjan's SCC Algorithm** | `src/engine/deadlock/wait-for-graph.ts` | Linear-time Strongly Connected Component cycle detection | Pinpoints closed dependency loops in the wait-for graph in $O(V + E)$ time |
| **BFS Distance Maps** | `src/engine/coordination/distance-map.ts` | Pre-computed static grid distance fields from stations | Provides admissible, obstacle-aware heuristics and instant nearest-robot assignment |
| **Seeded PRNG (Mulberry32)** | `src/engine/core/prng.ts` | Pseudorandom number generator with 32-bit state | Guarantees 100% reproducible scenario generation across runs without `Math.random` |
| **Atomic Custody State Machine** | `src/engine/custody/package-custody.ts` | Finite state transitions for package ownership | Enforces zero double-custody, zero dropped packages, and auditable custody history |

### C. Testing & Verification Tooling

| Technology | Verified Version | Purpose | Why Selected |
|---|---|---|---|
| **Vitest** | `5.1.1` | Fast unit and integration test runner with ESM native support | High-speed in-memory execution of 196 engine and coordination tests in < 3 seconds |
| **ESLint** | `^9.0.0` | Code quality and syntax linting | `eslint.config.mjs`, `npm run lint` | Enforces consistent code style and catches common React/TypeScript errors |
| **Next Typegen** | `16.4.6` | Automatic route and page type generation | `npm run typecheck` | Ensures complete type safety across Next.js App Router boundaries |

---

## 3. Configured but Not Fully Integrated Technologies

| Technology | Current Configuration Status | Intended Evolution |
|---|---|---|
| **Turbopack Dev Mode** | Present in dev scripts (`@tailwindcss/turbopack`) | In sandboxed environments or specific container setups, production builds use `--webpack` fallback to avoid port/process socket restrictions. |
| **Local Storage Persistence** | Configured in `src/store/preferences-store.ts` | Persists user theme, tick duration, and canvas zoom settings; simulation run snapshots remain in-memory per run. |

---

## 4. Planned Future Technologies (Roadmap)

> [!IMPORTANT]
> The following technologies are architectural roadmap selections for Horizon 2 and Horizon 3; they are **not currently present** in the active codebase:

| Planned Technology | Target Layer | Projected Purpose |
|---|---|---|
| **FastAPI (Python 3.12)** | Backend Telemetry Server | High-performance asynchronous REST API for remote scenario execution and cross-run archiving |
| **PostgreSQL 16 / Supabase** | Relational Persistence | Durable storage for warehouse CAD layouts, multi-run benchmarks, and historical playback logs |
| **WebSockets / AsyncIO** | Live Telemetry Streaming | Real-time multi-client telemetry streaming from headless simulation instances to web frontends |
| **MQTT Broker (Eclipse Mosquitto)** | Industrial Messaging | Standardized publish/subscribe message broker for VDA 5050 AMR communication |
| **Docker & Kubernetes** | Orchestration & Deployment | Containerized edge deployment for on-premise warehouse server racks |
