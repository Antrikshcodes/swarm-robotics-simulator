import type { SimulationSnapshot } from "../types/simulation";
import { isActiveMission } from "./missions/mission-lifecycle";
import { cellKindAt, inBounds, isTraversableKind, manhattan, pointKey, samePoint } from "./world/layout";

/**
 * Safety invariants from SIMULATION_RULES.md, checked against a snapshot.
 * Returns human-readable violations (empty = healthy). The engine runs this
 * after every tick outside production builds and throws on any violation.
 */
export function checkInvariants(snapshot: SimulationSnapshot): string[] {
  const v: string[] = [];
  const { layout, robots, packages, missions } = snapshot;
  const robotById = new Map(robots.map((r) => [r.id, r]));
  const packageById = new Map(packages.map((p) => [p.id, p]));

  // --- Occupancy and movement
  const occupied = new Map<string, string>();
  for (const r of robots) {
    if (!inBounds(layout, r.position)) v.push(`${r.id} is outside the warehouse at (${r.position.x}, ${r.position.y})`);
    else if (!isTraversableKind(cellKindAt(layout, r.position)!)) v.push(`${r.id} is inside a non-traversable cell`);
    const key = pointKey(r.position);
    const other = occupied.get(key);
    if (other) v.push(`${other} and ${r.id} occupy the same cell ${key}`);
    occupied.set(key, r.id);
    if (manhattan(r.previousPosition, r.position) > 1) v.push(`${r.id} moved more than one cell in a tick`);
    if (r.battery < 0 || r.battery > 100) v.push(`${r.id} battery out of range: ${r.battery}`);
  }
  for (let i = 0; i < robots.length; i += 1) {
    for (let j = i + 1; j < robots.length; j += 1) {
      const a = robots[i];
      const b = robots[j];
      if (
        !samePoint(a.position, a.previousPosition) &&
        samePoint(a.position, b.previousPosition) &&
        samePoint(b.position, a.previousPosition)
      ) {
        v.push(`${a.id} and ${b.id} swapped cells (head-on edge traversal)`);
      }
    }
  }

  // --- Package custody
  for (const pkg of packages) {
    const carried = pkg.state === "picked-up" || pkg.state === "in-transit";
    if (pkg.state === "available" && pkg.holderRobotId !== null) v.push(`${pkg.id} is available but held by ${pkg.holderRobotId}`);
    if ((pkg.state === "reserved" || carried) && pkg.holderRobotId === null) v.push(`${pkg.id} is ${pkg.state} with no holder`);
    if (pkg.holderRobotId !== null && !robotById.has(pkg.holderRobotId)) v.push(`${pkg.id} held by unknown robot ${pkg.holderRobotId}`);
    if (carried) {
      const holder = robotById.get(pkg.holderRobotId ?? "");
      if (holder && holder.packageId !== pkg.id) v.push(`${pkg.id} is carried by ${holder.id} but the robot does not hold it`);
      if (pkg.location.kind !== "robot" || pkg.location.robotId !== pkg.holderRobotId) v.push(`${pkg.id} location disagrees with holder`);
    }
    if (pkg.state === "delivered") {
      if (pkg.holderRobotId !== null) v.push(`${pkg.id} is delivered but still held`);
      if (pkg.location.kind !== "delivered" || pkg.location.stationId !== pkg.destinationStationId) {
        v.push(`${pkg.id} delivered somewhere other than ${pkg.destinationStationId}`);
      }
    }
  }
  const carriers = new Map<string, string>();
  for (const r of robots) {
    if (!r.packageId) continue;
    const pkg = packageById.get(r.packageId);
    if (!pkg) v.push(`${r.id} carries unknown package ${r.packageId}`);
    else if (pkg.holderRobotId !== r.id || (pkg.state !== "picked-up" && pkg.state !== "in-transit")) {
      v.push(`${r.id} claims ${r.packageId} but custody says ${pkg.state}/${pkg.holderRobotId ?? "none"}`);
    }
    const other = carriers.get(r.packageId);
    if (other) v.push(`${r.packageId} carried by both ${other} and ${r.id}`);
    carriers.set(r.packageId, r.id);
  }

  // --- Missions
  const activeByRobot = new Map<string, string>();
  for (const m of missions) {
    const pkg = packageById.get(m.packageId);
    if (m.state === "completed") {
      if (!pkg) v.push(`${m.id} completed but its package ${m.packageId} is missing`);
      else if (pkg.state !== "delivered" || pkg.location.kind !== "delivered" || pkg.location.stationId !== m.dropoffStationId) {
        v.push(`${m.id} completed but ${m.packageId} was not delivered to ${m.dropoffStationId}`);
      }
    }
    if (isActiveMission(m.state)) {
      if (!m.robotId) v.push(`${m.id} is ${m.state} without a robot`);
      else {
        const robot = robotById.get(m.robotId);
        if (!robot) v.push(`${m.id} assigned to unknown robot ${m.robotId}`);
        else if (robot.missionId !== m.id) v.push(`${m.id} assigned to ${m.robotId}, which is working on ${robot.missionId ?? "nothing"}`);
        const other = activeByRobot.get(m.robotId);
        if (other) v.push(`${m.robotId} has two active missions: ${other}, ${m.id}`);
        activeByRobot.set(m.robotId, m.id);
      }
    }
  }
  for (const r of robots) {
    if (!r.missionId) continue;
    const m = missions.find((x) => x.id === r.missionId);
    if (!m) v.push(`${r.id} references unknown mission ${r.missionId}`);
    else if (m.robotId !== r.id) v.push(`${r.id} references ${m.id}, which belongs to ${m.robotId ?? "nobody"}`);
    else if (!isActiveMission(m.state) && !(r.status === "failed" && m.state === "recovery-required")) {
      v.push(`${r.id} still references ${m.state} mission ${m.id}`);
    }
  }

  return v;
}
