import { describe, expect, it } from "vitest";
import type { Package } from "../../types/simulation";
import type { Result } from "../core/result";
import {
  annotateCustody,
  assignRescuer,
  markRecoveryRequired,
  resumeCustody,
  transferCustody,
  createPackage,
  deliverPackage,
  departWithPackage,
  pickUpPackage,
  releaseReservation,
  reservePackage,
} from "./package-custody";

const fresh = () =>
  createPackage({ id: "PKG-0001", missionId: "M-1001", originStationId: "PK-01", destinationStationId: "DO-01", tick: 0 });

function unwrap(result: Result<Package>): Package {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("package custody", () => {
  it("follows the full lifecycle with an append-only history", () => {
    let pkg = fresh();
    pkg = unwrap(reservePackage(pkg, "R-01", 1));
    pkg = unwrap(pickUpPackage(pkg, "R-01", "PK-01", 5));
    expect(pkg.location).toEqual({ kind: "robot", robotId: "R-01" });
    pkg = unwrap(departWithPackage(pkg, "R-01", 6));
    pkg = unwrap(deliverPackage(pkg, "R-01", "DO-01", 30));
    expect(pkg.state).toBe("delivered");
    expect(pkg.holderRobotId).toBeNull();
    expect(pkg.location).toEqual({ kind: "delivered", stationId: "DO-01" });
    expect(pkg.history.map((h) => h.to)).toEqual(["available", "reserved", "picked-up", "in-transit", "delivered"]);
  });

  it("never lets two robots hold the same package", () => {
    const reserved = unwrap(reservePackage(fresh(), "R-01", 1));
    const second = reservePackage(reserved, "R-02", 2);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("invalid-custody-transition");
    const steal = pickUpPackage(reserved, "R-02", "PK-01", 3);
    expect(steal).toMatchObject({ ok: false, error: { code: "custody-conflict" } });
  });

  it("cannot be picked up twice", () => {
    const picked = unwrap(pickUpPackage(unwrap(reservePackage(fresh(), "R-01", 1)), "R-01", "PK-01", 2));
    expect(pickUpPackage(picked, "R-01", "PK-01", 3)).toMatchObject({
      ok: false,
      error: { code: "invalid-custody-transition" },
    });
  });

  it("requires the robot to be at the origin station to pick up", () => {
    const reserved = unwrap(reservePackage(fresh(), "R-01", 1));
    expect(pickUpPackage(reserved, "R-01", null, 2)).toMatchObject({ ok: false, error: { code: "robot-not-at-station" } });
    expect(pickUpPackage(reserved, "R-01", "PK-02", 2)).toMatchObject({ ok: false, error: { code: "robot-not-at-station" } });
  });

  it("delivers only at the destination and only once", () => {
    let pkg = unwrap(pickUpPackage(unwrap(reservePackage(fresh(), "R-01", 1)), "R-01", "PK-01", 2));
    pkg = unwrap(departWithPackage(pkg, "R-01", 3));
    expect(deliverPackage(pkg, "R-01", "DO-02", 9)).toMatchObject({ ok: false, error: { code: "robot-not-at-station" } });
    expect(deliverPackage(pkg, "R-02", "DO-01", 9)).toMatchObject({ ok: false, error: { code: "custody-conflict" } });
    const delivered = unwrap(deliverPackage(pkg, "R-01", "DO-01", 10));
    const again = deliverPackage(delivered, "R-01", "DO-01", 11);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toMatch(/terminal/);
  });

  it("cannot be delivered before pickup", () => {
    const reserved = unwrap(reservePackage(fresh(), "R-01", 1));
    expect(deliverPackage(reserved, "R-01", "DO-01", 2).ok).toBe(false);
    expect(deliverPackage(fresh(), "R-01", "DO-01", 2).ok).toBe(false);
  });

  it("releases a reservation only by its holder", () => {
    const reserved = unwrap(reservePackage(fresh(), "R-01", 1));
    expect(releaseReservation(reserved, "R-02", 2, "test")).toMatchObject({ ok: false, error: { code: "custody-conflict" } });
    const released = unwrap(releaseReservation(reserved, "R-01", 2, "mission cancelled"));
    expect(released.state).toBe("available");
    expect(released.holderRobotId).toBeNull();
    // A carried package cannot be "released".
    const picked = unwrap(pickUpPackage(reserved, "R-01", "PK-01", 3));
    expect(releaseReservation(picked, "R-01", 4, "x").ok).toBe(false);
  });

  it("annotations keep custody and history intact", () => {
    const picked = unwrap(pickUpPackage(unwrap(reservePackage(fresh(), "R-07", 1)), "R-07", "PK-01", 2));
    const noted = annotateCustody(picked, 20, "R-07", "Holder R-07 failed");
    expect(noted.state).toBe("picked-up");
    expect(noted.holderRobotId).toBe("R-07");
    expect(noted.history).toHaveLength(picked.history.length + 1);
    expect(noted.history.slice(0, -1)).toEqual(picked.history);
  });

  describe("recovery after a holder failure", () => {
    const stranded = () => {
      let pkg = unwrap(reservePackage(fresh(), "R-01", 1));
      pkg = unwrap(pickUpPackage(pkg, "R-01", "PK-01", 3));
      pkg = unwrap(departWithPackage(pkg, "R-01", 4));
      return unwrap(markRecoveryRequired(pkg, "R-01", 9, "motor failure"));
    };

    it("keeps the failed robot as holder and blocks every independent claim", () => {
      const pkg = stranded();
      expect(pkg.state).toBe("recovery-required");
      expect(pkg.holderRobotId).toBe("R-01");
      expect(pkg.location).toEqual({ kind: "robot", robotId: "R-01" });
      expect(reservePackage(pkg, "R-02", 10).ok).toBe(false);
      expect(pickUpPackage(pkg, "R-02", "PK-01", 10).ok).toBe(false);
      expect(deliverPackage(pkg, "R-01", "DO-01", 10).ok).toBe(false);
      expect(markRecoveryRequired(unwrap(reservePackage(fresh(), "R-01", 1)), "R-01", 2, "x").ok).toBe(false);
    });

    it("transfers custody atomically, only to the assigned rescuer", () => {
      const pkg = stranded();
      expect(transferCustody(pkg, "R-01", "R-02", 12, "RC-01").ok).toBe(false); // nobody assigned yet
      const assigned = unwrap(assignRescuer(pkg, "RC-01", "R-02", 11, "R-02 dispatched"));
      expect(transferCustody(assigned, "R-01", "R-03", 12, "RC-01").ok).toBe(false); // wrong robot
      expect(transferCustody(assigned, "R-09", "R-02", 12, "RC-01").ok).toBe(false); // wrong holder
      const moved = unwrap(transferCustody(assigned, "R-01", "R-02", 12, "RC-01"));
      expect(moved).toMatchObject({ state: "in-transit", holderRobotId: "R-02", location: { kind: "robot", robotId: "R-02" }, recovery: null });
      expect(transferCustody(moved, "R-01", "R-02", 13, "RC-01").ok).toBe(false); // exactly once
      expect(unwrap(deliverPackage(moved, "R-02", "DO-01", 20)).state).toBe("delivered");
      expect(moved.history.at(-1)?.note).toContain("R-01 → R-02");
    });

    it("lets a restored holder resume, and a rescuer cannot be the holder", () => {
      const pkg = stranded();
      expect(assignRescuer(pkg, "RC-01", "R-01", 10, "").ok).toBe(false);
      expect(resumeCustody(pkg, "R-02", 15).ok).toBe(false);
      const resumed = unwrap(resumeCustody(pkg, "R-01", 15));
      expect(resumed).toMatchObject({ state: "in-transit", holderRobotId: "R-01", recovery: null });
    });
  });
});
