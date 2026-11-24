# Task Board

Track work here. Keep statuses current and link code changes where practical.

## Status definitions

- **Todo:** not started
- **In progress:** actively being implemented
- **Review:** implementation complete; independent review/testing required
- **Blocked:** waiting on a dependency or decision
- **Done:** acceptance criteria satisfied and verified

## Current milestone: Mission 001 — Frontend foundation

Branch: `feat/mission-001-frontend` (not merged). Implementation tasks sit in **Review** until the independent Codex review (M1-09) completes.

| ID | Task | Status | Owner |
|---|---|---|---|
| M0-01 | Create GitHub repository | Done | Project owner |
| M0-02 | Add source-of-truth documentation | Done | ChatGPT / GitHub |
| M0-03 | Clone repository locally | Done | Project owner |
| M1-01 | Inspect existing repository and git state | Done | Claude Code |
| M1-02 | Scaffold Next.js + TypeScript + Tailwind (+ shadcn/ui, Zustand, Framer Motion, Vitest) | Review | Claude Code |
| M1-03 | Establish design tokens and typography | Review | Claude Code |
| M1-04 | Build application shell and navigation | Review | Claude Code |
| M1-05 | Build Overview page | Review | Claude Code |
| M1-06 | Build Simulation Studio (canvas, toolbar, inspector, playback, metrics, scenarios) | Review | Claude Code |
| M1-07 | Build Fleet, Missions, Incidents, Analytics, Settings routes | Review | Claude Code |
| M1-08 | Run lint, typecheck, tests, build, and route/interaction checks | Done | Claude Code |
| M1-09 | Independent review of Mission 001 | Todo | Codex |
| M1-10 | Resolve review findings and approve milestone | Todo | Claude Code + project owner |

### M1-08 verification record

Run on `feat/mission-001-frontend`, Node 24, Next.js 16.4.6:

- `npm run lint` — 0 errors, 0 warnings
- `npm run typecheck` — passes (strict)
- `npm test` — 20/20 passing (determinism, seek/reset, mission lifecycle, scripted fault, narrow-aisle timing, single-custody, script overlap/swap audit)
- `npm run build` — all 7 routes prerendered as static
- Manual browser checks at 1440×900, 1280×720 and 375×812: every route, sidebar navigation, scenario switching (toolbar and top bar), robot/station/cell selection and inspector, zoom/fit/reset/wheel/pan, grid and overlay toggles, play/pause/step/reset, speed, timeline seek, event-strip jump, incident replay, settings persistence and restore

## Next milestones

Detailed scope and acceptance criteria are in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).

## Change control

- Do not mark a task Done based only on code being written.
- Record verification commands and outcomes in the PR or commit summary.
- Keep one active coding agent per shared working tree.
- Codex reviews Claude's implementation and reports actionable findings before making broad refactors.
