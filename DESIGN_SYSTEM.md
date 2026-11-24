# Design System

## Direction

Premium industrial robotics software. The experience should feel like a real fleet operations tool: precise, legible, quiet, and data-dense without becoming cluttered.

- Theme: dark
- Layout: desktop-first
- Primary experience: 2D top-down Simulation Studio
- Tone: industrial, technical, restrained
- Avoid: generic AI dashboard tropes, excessive gradients, glassmorphism, neon overload, decorative-only controls.

## Color tokens

| Token | Hex | Intended use |
|---|---|---|
| Background | `#090D10` | Main application background |
| Sidebar | `#11191E` | Navigation surface |
| Surface | `#19242A` | Cards, panels, inspector |
| Secondary text | `#82919A` | Supporting labels and metadata |
| Lime | `#B7F34A` | Primary action, active state, selected robot |
| Cyan | `#40C8E8` | Route, telemetry, informational emphasis |
| Amber | `#F5B942` | Warning, waiting, caution |
| Red | `#F06464` | Failure, blocked, critical incident |

Use semantic colors consistently. Do not make every element bright.

## Typography

- Geist Sans for interface text.
- Geist Mono for coordinates, IDs, timestamps, metrics, and telemetry.
- Use clear hierarchy and compact technical labels.
- Numeric values should align and remain easy to scan.

## Layout principles

- Persistent left navigation.
- Top application bar with active scenario and simulation status.
- Main work area prioritizes the warehouse canvas.
- Inspector panel exposes selected robot, station, mission, or obstacle.
- Bottom timeline/command strip provides playback controls and event history.
- KPI strip is supportive and must not displace the simulator.

## Simulation Studio essentials

- Warehouse grid and aisle markings
- Pickup and drop-off stations
- Robot markers with IDs, headings, and statuses
- Planned route and next-step visualisation
- Obstacles and dynamically blocked aisles
- Zoom, pan, fit-to-view
- Selectable entities and contextual inspector
- Start, pause, step, and reset controls
- Scenario selector
- Event/timeline view
- Live metrics computed from engine state

## Interaction rules

- All buttons and toggles must have real behavior.
- Provide hover, focus, active, disabled, and error states.
- Keyboard focus must be visible.
- Use animation to communicate state changes, not as decoration.
- Keep motion purposeful and respect reduced-motion preferences.
- Provide labels/tooltips for icon-only controls.

## Responsive behavior

Desktop is the priority for the full simulation workspace. On smaller screens, preserve the ability to inspect status and navigate, but do not pretend the entire control-room layout is equally usable on mobile.
