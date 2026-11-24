# Task Board

Track work here. Keep statuses current and link code changes where practical.

## Status definitions

- **Todo:** not started
- **In progress:** actively being implemented
- **Review:** implementation complete; independent review/testing required
- **Blocked:** waiting on a dependency or decision
- **Done:** acceptance criteria satisfied and verified

## Current milestone: Mission 001 — Frontend foundation

| ID | Task | Status | Owner |
|---|---|---|---|
| M0-01 | Create GitHub repository | Done | Project owner |
| M0-02 | Add source-of-truth documentation | Done | ChatGPT / GitHub |
| M0-03 | Clone repository locally | Todo | Project owner |
| M1-01 | Inspect existing repository and git state | Todo | Claude Code |
| M1-02 | Scaffold Next.js + TypeScript + Tailwind | Todo | Claude Code |
| M1-03 | Establish design tokens and typography | Todo | Claude Code |
| M1-04 | Build application shell and navigation | Todo | Claude Code |
| M1-05 | Build Overview layout foundation | Todo | Claude Code |
| M1-06 | Build Simulation Studio layout foundation | Todo | Claude Code |
| M1-07 | Add placeholder routes for planned sections | Todo | Claude Code |
| M1-08 | Run lint, typecheck, build, and route checks | Todo | Claude Code |
| M1-09 | Independent review of Mission 001 | Todo | Codex |
| M1-10 | Resolve review findings and approve milestone | Todo | Claude Code + project owner |

## Next milestones

Detailed scope and acceptance criteria are in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).

## Change control

- Do not mark a task Done based only on code being written.
- Record verification commands and outcomes in the PR or commit summary.
- Keep one active coding agent per shared working tree.
- Codex reviews Claude's implementation and reports actionable findings before making broad refactors.
