# API Contracts

## Current status

No remote API is implemented in Mission 001. The local simulation engine is the initial authority. Contracts below are the intended conceptual boundary and must be formalised in TypeScript before use.

## Command model

Commands should be validated before mutation and return an explicit success/error result.

Planned command types:
- Start simulation
- Pause simulation
- Step simulation
- Reset/load scenario
- Add mission
- Close aisle / block cell
- Reopen aisle / unblock cell
- Mark robot unavailable / failed
- Select entity (UI-level command)

## Snapshot model

A simulation snapshot should contain:
- Simulation tick and run status
- Warehouse dimensions and traversability
- Stations and obstacle/closure state
- Robot poses, headings, and statuses
- Mission queue and mission lifecycle states
- Package custody state
- Active routes and reservation summaries
- Current metrics
- Recent engine events

Snapshots are read-only from the UI's perspective.

## Error handling

Represent expected failures explicitly, for example:
- Invalid coordinates
- Unknown robot or mission
- Occupied or non-traversable cell
- Conflicting reservation
- Invalid mission lifecycle transition
- Invalid package custody transition
- Command not allowed in current simulation state

Never silently drop a command or claim it succeeded before the engine accepts it.

## Future HTTP/WebSocket boundary

If a backend is introduced, keep HTTP for durable configuration and queries, and WebSockets (or another explicit streaming contract) for live snapshots/events. Do not duplicate authoritative planning logic in the browser and backend.
