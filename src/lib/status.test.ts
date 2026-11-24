import { describe, expect, it } from "vitest";
import {
  DEADLOCK_STATUS,
  FAILURE_STATUS,
  FAILURE_TYPE,
  MISSION_STATE,
  PACKAGE_STATE,
  PLAYBACK,
  RECOVERY_OUTCOME,
  RECOVERY_TASK_STATUS,
  RESCUE_OUTCOME,
  ROBOT_ACTION,
  ROBOT_STATUS,
  SEVERITY,
  STATION_KIND,
  TONE_DOT,
  TONE_SOFT,
  TONE_TEXT,
  TONE_VAR,
  WAIT_CLASS,
  type Tone,
} from "./status";

describe("lib/status dictionaries", () => {
  it("provides consistent signal classes for every semantic tone", () => {
    const tones: Tone[] = ["lime", "cyan", "amber", "red", "neutral"];
    for (const tone of tones) {
      expect(TONE_TEXT[tone]).toBeTruthy();
      expect(TONE_DOT[tone]).toBeTruthy();
      expect(TONE_SOFT[tone]).toBeTruthy();
      expect(TONE_VAR[tone]).toMatch(/^--swarm-/);
    }
  });

  it("covers all robot, mission, package, deadlock, and recovery enum values", () => {
    expect(Object.keys(ROBOT_STATUS)).toHaveLength(9);
    expect(Object.keys(ROBOT_ACTION)).toHaveLength(13);
    expect(Object.keys(MISSION_STATE)).toHaveLength(10);
    expect(Object.keys(PACKAGE_STATE)).toHaveLength(6);
    expect(Object.keys(WAIT_CLASS)).toHaveLength(6);
    expect(Object.keys(DEADLOCK_STATUS)).toHaveLength(4);
    expect(Object.keys(RECOVERY_OUTCOME)).toHaveLength(7);
    expect(Object.keys(SEVERITY)).toHaveLength(4);
    expect(Object.keys(PLAYBACK)).toHaveLength(3);
    expect(Object.keys(STATION_KIND)).toHaveLength(3);
    expect(Object.keys(FAILURE_TYPE)).toHaveLength(5);
    expect(Object.keys(FAILURE_STATUS)).toHaveLength(3);
    expect(Object.keys(RECOVERY_TASK_STATUS)).toHaveLength(6);
    expect(Object.keys(RESCUE_OUTCOME)).toHaveLength(6);
  });
});
