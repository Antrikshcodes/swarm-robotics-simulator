import type {
  EventSeverity,
  MissionState,
  PackageState,
  RobotAction,
  RobotStatus,
  StationKind,
} from "@/types/simulation";
import type { PlaybackStatus } from "@/store/simulation-store";

/** Semantic tones map 1:1 onto the design-system signal colours. */
export type Tone = "lime" | "cyan" | "amber" | "red" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  lime: "text-lime",
  cyan: "text-cyan",
  amber: "text-amber",
  red: "text-danger",
  neutral: "text-text-secondary",
};

export const TONE_DOT: Record<Tone, string> = {
  lime: "bg-lime",
  cyan: "bg-cyan",
  amber: "bg-amber",
  red: "bg-danger",
  neutral: "bg-text-dim",
};

export const TONE_SOFT: Record<Tone, string> = {
  lime: "bg-lime/10 text-lime ring-lime/25",
  cyan: "bg-cyan/10 text-cyan ring-cyan/25",
  amber: "bg-amber/10 text-amber ring-amber/25",
  red: "bg-danger/10 text-danger ring-danger/25",
  neutral: "bg-white/[0.04] text-text-secondary ring-white/10",
};

/** CSS custom property for a tone, for canvas use. */
export const TONE_VAR: Record<Tone, string> = {
  lime: "--swarm-lime",
  cyan: "--swarm-cyan",
  amber: "--swarm-amber",
  red: "--swarm-red",
  neutral: "--swarm-text-secondary",
};

export const ROBOT_STATUS: Record<RobotStatus, { label: string; tone: Tone }> = {
  moving: { label: "Moving", tone: "cyan" },
  carrying: { label: "Carrying", tone: "cyan" },
  loading: { label: "Loading", tone: "cyan" },
  unloading: { label: "Unloading", tone: "cyan" },
  waiting: { label: "Waiting", tone: "amber" },
  charging: { label: "Charging", tone: "lime" },
  idle: { label: "Idle", tone: "neutral" },
  failed: { label: "Failed", tone: "red" },
  recovering: { label: "Recovering", tone: "amber" },
};

export const ROBOT_ACTION: Record<RobotAction, string> = {
  none: "No task",
  "travel-to-pickup": "Travelling to pickup",
  "travel-to-dropoff": "Travelling to drop-off",
  "return-home": "Returning home",
  "travel-to-charger": "Heading to charger",
  yielding: "Yielding (deadlock recovery)",
  loading: "Loading",
  unloading: "Unloading",
  charging: "Charging",
  halted: "Halted",
};

export const MISSION_STATE: Record<MissionState, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  assigned: { label: "Assigned", tone: "cyan" },
  "to-pickup": { label: "To pickup", tone: "cyan" },
  "picking-up": { label: "Picking up", tone: "cyan" },
  carrying: { label: "Carrying", tone: "lime" },
  "to-dropoff": { label: "To drop-off", tone: "lime" },
  "dropping-off": { label: "Dropping off", tone: "lime" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  "recovery-required": { label: "Recovery required", tone: "red" },
};

export const PACKAGE_STATE: Record<PackageState, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "neutral" },
  reserved: { label: "Reserved", tone: "cyan" },
  "picked-up": { label: "Picked up", tone: "lime" },
  "in-transit": { label: "In transit", tone: "lime" },
  delivered: { label: "Delivered", tone: "neutral" },
};

export const SEVERITY: Record<EventSeverity, { label: string; tone: Tone }> = {
  info: { label: "Info", tone: "neutral" },
  success: { label: "Success", tone: "lime" },
  warning: { label: "Warning", tone: "amber" },
  critical: { label: "Critical", tone: "red" },
};

export const PLAYBACK: Record<PlaybackStatus, { label: string; tone: Tone }> = {
  ready: { label: "Ready", tone: "neutral" },
  running: { label: "Running", tone: "lime" },
  paused: { label: "Paused", tone: "amber" },
};

export const STATION_KIND: Record<StationKind, { short: string; label: string }> = {
  pickup: { short: "PK", label: "Pickup" },
  dropoff: { short: "DO", label: "Drop-off" },
  charger: { short: "CH", label: "Charger" },
};
