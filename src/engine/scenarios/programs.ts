import type { GridPoint } from "../../types/simulation";
import type { ProgramStep } from "../scenario";

/**
 * Helpers for authoring scripted dock-to-dock loops.
 *
 * A dock loop runs east along `stationRow` from the pickup station at
 * x = 0 to the drop-off station at x = width - 1, then returns west along
 * `returnRow` using the lanes at x = 1 and x = width - 2.
 */
export interface DockLoopSpec {
  readonly width: number;
  readonly stationRow: number;
  readonly returnRow: number;
  readonly pickup: string;
  readonly dropoff: string;
  readonly load: number;
  readonly unload: number;
}

const p = (x: number, y: number): GridPoint => ({ x, y });

function outbound(spec: DockLoopSpec): ProgramStep[] {
  return [
    { op: "load", station: spec.pickup, ticks: spec.load },
    { op: "travel", via: [p(spec.width - 1, spec.stationRow)] },
    { op: "unload", station: spec.dropoff, ticks: spec.unload },
  ];
}

/** Loop starting at the pickup station. */
export function dockLoop(spec: DockLoopSpec): { start: GridPoint; program: ProgramStep[] } {
  const east = spec.width - 2;
  return {
    start: p(0, spec.stationRow),
    program: [
      ...outbound(spec),
      {
        op: "travel",
        via: [
          p(east, spec.stationRow),
          p(east, spec.returnRow),
          p(1, spec.returnRow),
          p(1, spec.stationRow),
          p(0, spec.stationRow),
        ],
      },
    ],
  };
}

/**
 * Same loop, but the robot starts part-way along the return lane at
 * `startX`. Lets two robots share one loop with a fixed spacing.
 */
export function dockLoopFromReturnLane(
  spec: DockLoopSpec,
  startX: number,
): { start: GridPoint; program: ProgramStep[] } {
  const east = spec.width - 2;
  return {
    start: p(startX, spec.returnRow),
    program: [
      { op: "travel", via: [p(1, spec.returnRow), p(1, spec.stationRow), p(0, spec.stationRow)] },
      ...outbound(spec),
      {
        op: "travel",
        via: [p(east, spec.stationRow), p(east, spec.returnRow), p(startX, spec.returnRow)],
      },
    ],
  };
}
