import * as THREE from "three";
import { CELL, frameOf, gridToWorld, worldExtent, type GridFrame } from "./grid-to-world";

/**
 * Camera framing for the 3D Simulation Studio. Pure maths (no React, no
 * renderer) so it can be unit-tested: every preset is solved so the whole
 * warehouse volume — floor plus racking height — fits the viewport for any
 * layout size and aspect ratio.
 */

export const CAMERA_FOV = 40;
/** Tallest static geometry (full-height racking / columns) in world units. */
export const SCENE_HEIGHT = 2.6;

export type FixedPreset = "isometric" | "overview" | "top";

export interface Pose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

export interface Box3Like {
  readonly min: { x: number; y: number; z: number };
  readonly max: { x: number; y: number; z: number };
}

const UP = new THREE.Vector3(0, 1, 0);

function corners(box: Box3Like): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/**
 * Smallest camera distance along `dir` (unit vector from target towards the
 * camera) at which every point projects inside the frustum, with `margin`
 * (> 1) breathing room. Closed form per point: with camera basis (r, u) and
 * depth D − v·dir, the point fits when |v·r| ≤ tanH·depth and |v·u| ≤ tanV·depth.
 */
export function fitDistance(dir: THREE.Vector3, target: THREE.Vector3, points: readonly THREE.Vector3[], fovDeg: number, aspect: number, margin = 1.08): number {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)) / margin;
  const tanH = tanV * aspect;
  const { right, up } = basis(dir);
  let d = 0;
  const v = new THREE.Vector3();
  for (const p of points) {
    v.copy(p).sub(target);
    const along = v.dot(dir);
    d = Math.max(d, Math.abs(v.dot(right)) / tanH + along, Math.abs(v.dot(up)) / tanV + along);
  }
  return d;
}

const DIRECTIONS: Record<FixedPreset, THREE.Vector3> = {
  // Elevated three-quarter view from the south-east: shows rack height and aisle depth.
  isometric: new THREE.Vector3(0.5, 0.72, 0.62).normalize(),
  // Steeper, square-on to the south wall: the whole floor plan with some depth.
  overview: new THREE.Vector3(0, 0.84, 0.54).normalize(),
  // Plan view (tiny z offset keeps "north up" stable for lookAt).
  top: new THREE.Vector3(0, 1, 0.001).normalize(),
};

export function warehouseBox(frame: GridFrame, height = SCENE_HEIGHT): Box3Like {
  const { halfX, halfZ } = worldExtent(frame);
  return { min: { x: -halfX, y: 0, z: -halfZ }, max: { x: halfX, y: height, z: halfZ } };
}

/** Pose for a fixed preset that frames the whole warehouse at this viewport aspect. */
export function presetPose(preset: FixedPreset, frame: GridFrame, aspect = 1.6, sceneHeight = SCENE_HEIGHT): Pose {
  const dir = DIRECTIONS[preset];
  const box = warehouseBox(frame, preset === "top" ? 0 : sceneHeight);
  // Aim slightly above the floor for oblique views so racks and floor share the frame.
  const target = new THREE.Vector3(0, preset === "top" ? 0 : sceneHeight * 0.25, 0);
  const pts = corners(box);
  const margin = preset === "top" ? 1.06 : 1.08;
  let distance = fitDistance(dir, target, pts, CAMERA_FOV, Math.max(0.3, aspect), margin);
  // Perspective makes the near edge of the warehouse project larger than the far edge, so
  // re-centre the target on the projected extents and refit (converges in a few passes).
  for (let i = 0; i < 4; i += 1) {
    const { right, up } = basis(dir);
    const cam = target.clone().add(dir.clone().multiplyScalar(distance));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const p of pts) {
      v.copy(p).sub(cam);
      const depth = -v.dot(dir);
      const sx = v.dot(right) / depth;
      const sy = v.dot(up) / depth;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    target.addScaledVector(right, ((minX + maxX) / 2) * distance).addScaledVector(up, ((minY + maxY) / 2) * distance);
    distance = fitDistance(dir, target, pts, CAMERA_FOV, Math.max(0.3, aspect), margin);
  }
  return { position: target.clone().add(dir.clone().multiplyScalar(distance)), target };
}

function basis(dir: THREE.Vector3) {
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, UP);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: new THREE.Vector3().crossVectors(right, forward).normalize() };
}

/**
 * Pose that frames a grid rectangle (a rack block, station or cell) from the
 * current viewing direction, never closer than `minDistance`.
 */
export function regionPose(
  layout: { width: number; height: number },
  bounds: { x0: number; y0: number; x1: number; y1: number },
  currentDir: THREE.Vector3,
  aspect: number,
  height = SCENE_HEIGHT,
  minDistance = 4.5,
): Pose {
  const frame = frameOf(layout);
  const a = gridToWorld(frame, bounds.x0, bounds.y0);
  const b = gridToWorld(frame, bounds.x1, bounds.y1);
  const box: Box3Like = {
    min: { x: a.x - CELL / 2, y: 0, z: a.z - CELL / 2 },
    max: { x: b.x + CELL / 2, y: height, z: b.z + CELL / 2 },
  };
  const dir = currentDir.clone().normalize();
  // Keep a readable elevation (never skim the floor).
  if (dir.y < 0.5) dir.set(dir.x, 0.5, dir.z).normalize();
  const target = new THREE.Vector3((box.min.x + box.max.x) / 2, height * 0.3, (box.min.z + box.max.z) / 2);
  const distance = Math.max(minDistance, fitDistance(dir, target, corners(box), CAMERA_FOV, Math.max(0.3, aspect), 2.3));
  return { position: target.clone().add(dir.multiplyScalar(distance)), target };
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Camera position part-way through a transition: the orbit target moves in a
 * straight line while the camera's offset from it is interpolated in
 * spherical coordinates, so the camera arcs around the scene instead of
 * cutting through it.
 */
export function interpolatePose(from: Pose, to: Pose, k: number, out: { position: THREE.Vector3; target: THREE.Vector3 }): void {
  out.target.lerpVectors(from.target, to.target, k);
  const a = new THREE.Spherical().setFromVector3(from.position.clone().sub(from.target));
  const b = new THREE.Spherical().setFromVector3(to.position.clone().sub(to.target));
  let dTheta = b.theta - a.theta;
  if (dTheta > Math.PI) dTheta -= Math.PI * 2;
  if (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const s = new THREE.Spherical(
    // Interpolate distance geometrically: zooms feel even at any scale.
    a.radius * (b.radius / Math.max(1e-6, a.radius)) ** k,
    a.phi + (b.phi - a.phi) * k,
    a.theta + dTheta * k,
  );
  out.position.setFromSpherical(s).add(out.target);
}
