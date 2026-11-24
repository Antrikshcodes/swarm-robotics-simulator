import type { RobotState, StationKind } from "@/types/simulation";

export interface ProjectedLabelPoint {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

export interface RobotLabelMeta {
  readonly state: "failed" | "deadlock" | "waiting" | "selected" | "";
  readonly tag: "FAILED" | "RESTORING" | "DEADLOCK" | "WAIT" | "";
}

/**
 * Convert Three.js clip/NDC coordinates (-1..1) into CSS pixel offsets inside a
 * canvas container of size `width` × `height`, culling labels behind the camera
 * or outside the margin around the viewport.
 */
export function ndcToViewport(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  width: number,
  height: number,
  margin = 64,
): ProjectedLabelPoint {
  if (width <= 0 || height <= 0 || ndcZ < -1 || ndcZ > 1 || Number.isNaN(ndcX) || Number.isNaN(ndcY)) {
    return { x: 0, y: 0, visible: false };
  }
  const x = (ndcX * 0.5 + 0.5) * width;
  const y = (-ndcY * 0.5 + 0.5) * height;
  const visible = x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
  return { x, y, visible };
}

/** Derive visual highlight state and badge tag for a 3D robot label. */
export function robotLabelMeta(
  robot: Pick<RobotState, "status" | "waitClass">,
  selected: boolean,
): RobotLabelMeta {
  const state =
    robot.status === "failed"
      ? "failed"
      : robot.waitClass === "deadlock"
        ? "deadlock"
        : robot.status === "waiting"
          ? "waiting"
          : selected
            ? "selected"
            : "";

  const tag =
    robot.status === "failed"
      ? "FAILED"
      : robot.status === "recovering"
        ? "RESTORING"
        : robot.waitClass === "deadlock"
          ? "DEADLOCK"
          : robot.status === "waiting"
            ? "WAIT"
            : "";

  return { state, tag };
}

/** Accent colour shared between 3D station posts and projected station badges. */
export function stationColorForKind(kind: StationKind): string {
  if (kind === "pickup") return "#40c8e8";
  if (kind === "dropoff") return "#b7f34a";
  return "#c8d2d8";
}
