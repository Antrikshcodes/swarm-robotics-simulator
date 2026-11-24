import type { CustodyRecord, Package, PackageState } from "../../types/simulation";
import { err, ok, type Result } from "../core/result";

/**
 * Authoritative package custody.
 *
 *   available ──reserve──▶ reserved ──pick up──▶ picked-up ──depart──▶ in-transit ──deliver──▶ delivered
 *        ▲                    │
 *        └──────release───────┘
 *
 * Every function is pure: it returns a new Package or an explicit error and
 * appends to an append-only history. Invariants enforced here:
 *  - exactly one holder at a time (reservation and carriage are exclusive)
 *  - a package is picked up at most once
 *  - delivery is terminal, and only at the package's destination
 *  - only the holding robot may pick up, move or deliver the package
 */

const ALLOWED: Record<PackageState, readonly PackageState[]> = {
  available: ["reserved"],
  reserved: ["available", "picked-up"],
  "picked-up": ["in-transit", "delivered"],
  "in-transit": ["delivered"],
  delivered: [],
};

export function canTransition(from: PackageState, to: PackageState): boolean {
  return ALLOWED[from].includes(to);
}

function record(pkg: Package, to: PackageState, tick: number, robotId: string | null, note: string): CustodyRecord {
  return { tick, from: pkg.state, to, robotId, note };
}

function guard(pkg: Package, to: PackageState): Result<never> | null {
  if (canTransition(pkg.state, to)) return null;
  return err(
    "invalid-custody-transition",
    `${pkg.id}: cannot move from "${pkg.state}" to "${to}"${pkg.state === "delivered" ? " — delivery is terminal" : ""}`,
  );
}

function requireHolder(pkg: Package, robotId: string): Result<never> | null {
  if (pkg.holderRobotId === robotId) return null;
  return err(
    "custody-conflict",
    `${pkg.id} is held by ${pkg.holderRobotId ?? "no robot"}, not ${robotId}`,
  );
}

export function createPackage(params: {
  id: string;
  missionId: string;
  originStationId: string;
  destinationStationId: string;
  tick: number;
}): Package {
  return {
    id: params.id,
    missionId: params.missionId,
    state: "available",
    originStationId: params.originStationId,
    destinationStationId: params.destinationStationId,
    holderRobotId: null,
    location: { kind: "station", stationId: params.originStationId },
    history: [
      { tick: params.tick, from: null, to: "available", robotId: null, note: `Registered at ${params.originStationId}` },
    ],
  };
}

export function reservePackage(pkg: Package, robotId: string, tick: number): Result<Package> {
  const bad = guard(pkg, "reserved");
  if (bad) return bad;
  if (pkg.holderRobotId !== null) {
    return err("custody-conflict", `${pkg.id} is already held by ${pkg.holderRobotId}`);
  }
  return ok({
    ...pkg,
    state: "reserved",
    holderRobotId: robotId,
    history: [...pkg.history, record(pkg, "reserved", tick, robotId, `Reserved for ${robotId}`)],
  });
}

export function releaseReservation(pkg: Package, robotId: string, tick: number, reason: string): Result<Package> {
  const bad = guard(pkg, "available") ?? requireHolder(pkg, robotId);
  if (bad) return bad;
  return ok({
    ...pkg,
    state: "available",
    holderRobotId: null,
    history: [...pkg.history, record(pkg, "available", tick, robotId, `Released by ${robotId}: ${reason}`)],
  });
}

export function pickUpPackage(pkg: Package, robotId: string, robotStationId: string | null, tick: number): Result<Package> {
  const bad = guard(pkg, "picked-up") ?? requireHolder(pkg, robotId);
  if (bad) return bad;
  if (robotStationId !== pkg.originStationId) {
    return err("robot-not-at-station", `${robotId} must be at ${pkg.originStationId} to pick up ${pkg.id}`);
  }
  return ok({
    ...pkg,
    state: "picked-up",
    location: { kind: "robot", robotId },
    history: [...pkg.history, record(pkg, "picked-up", tick, robotId, `Picked up by ${robotId} at ${pkg.originStationId}`)],
  });
}

export function departWithPackage(pkg: Package, robotId: string, tick: number): Result<Package> {
  const bad = guard(pkg, "in-transit") ?? requireHolder(pkg, robotId);
  if (bad) return bad;
  return ok({
    ...pkg,
    state: "in-transit",
    history: [...pkg.history, record(pkg, "in-transit", tick, robotId, `In transit with ${robotId}`)],
  });
}

export function deliverPackage(pkg: Package, robotId: string, atStationId: string | null, tick: number): Result<Package> {
  const bad = guard(pkg, "delivered") ?? requireHolder(pkg, robotId);
  if (bad) return bad;
  if (atStationId !== pkg.destinationStationId) {
    return err(
      "robot-not-at-station",
      `${pkg.id} can only be delivered at ${pkg.destinationStationId}${atStationId ? `, not ${atStationId}` : ""}`,
    );
  }
  return ok({
    ...pkg,
    state: "delivered",
    holderRobotId: null,
    location: { kind: "delivered", stationId: atStationId },
    history: [...pkg.history, record(pkg, "delivered", tick, robotId, `Delivered by ${robotId} to ${atStationId}`)],
  });
}

/** Append an audit note without changing custody (e.g. holder failed). */
export function annotateCustody(pkg: Package, tick: number, robotId: string | null, note: string): Package {
  return { ...pkg, history: [...pkg.history, { tick, from: pkg.state, to: pkg.state, robotId, note }] };
}
