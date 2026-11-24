import * as THREE from "three";

export interface EnvironmentUpdateParams {
  time: number;
  delta: number;
  scrollProgress: number;
  /** Animate idle motion (fleet patrol, LiDAR spin). Off for reduced motion / low tier. */
  animate: boolean;
}

/**
 * Centre of the narrow-aisle demonstration (scene 04): behind and to the right
 * of the hero robot, so the scene-04 camera frames it without the hero robot in
 * shot. The lime navigation path runs straight through it as the aisle lane.
 */
export const CONFLICT_AISLE_CENTER = new THREE.Vector3(2.6, 0, -5.4);

/** Scroll window in which the narrow aisle is raised (scene 03 → scene 05). */
const AISLE_VISIBLE = { from: 0.4, to: 0.6 } as const;

/**
 * Open industrial warehouse around the hero robot: floor grid, cyan/lime
 * navigation paths, background racking (instanced), a pedestal, a fleet
 * patrolling the back of the hall and the scene-04 narrow aisle.
 */
export class WarehouseEnvironment {
  public group: THREE.Group;
  public pedestalGroup: THREE.Group;
  public conflictAisleGroup: THREE.Group;

  private fleetRobots: {
    group: THREE.Group;
    base: THREE.Vector3;
    radius: { x: number; z: number };
    phase: number;
    speed: number;
    lidar: THREE.Object3D | null;
  }[] = [];

  private conflictBotA!: THREE.Group;
  private conflictBotB!: THREE.Group;
  private conflictBeaconB!: THREE.MeshBasicMaterial;
  private conflictPhase = -1;
  private aisleRise = 0;
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.conflictAisleGroup = new THREE.Group();
    this.conflictAisleGroup.position.copy(CONFLICT_AISLE_CENTER);

    this.group.add(this.pedestalGroup);
    this.group.add(this.conflictAisleGroup);

    this.buildPedestal();
    this.buildFloor();
    this.buildRouteLines();
    this.buildWarehouseShelving();
    this.buildConflictAisle();
    this.buildFleetRobots();
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private buildPedestal() {
    // Compact pedestal: just wider than the robot footprint so it never reaches the text column.
    const base = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.12, 1.22, 0.14, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1b252b, roughness: 0.45, metalness: 0.55 })),
    );
    base.position.y = -0.09;
    base.receiveShadow = true;
    this.pedestalGroup.add(base);

    const ringGeo = this.track(new THREE.TorusGeometry(1.1, 0.012, 12, 72));
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, this.track(new THREE.MeshBasicMaterial({ color: 0x40c8e8 })));
    ring.position.y = -0.015;
    this.pedestalGroup.add(ring);

    const pad = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.04, 1.1, 0.03, 48)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x141c21, roughness: 0.6, metalness: 0.4 })),
    );
    pad.position.y = -0.005;
    pad.receiveShadow = true;
    this.pedestalGroup.add(pad);
  }

  private buildFloor() {
    const floorGeo = this.track(new THREE.PlaneGeometry(70, 70));
    floorGeo.rotateX(-Math.PI / 2);

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0c1215";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, 512);
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(512, i + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(64, 200, 232, 0.3)";
    ctx.lineWidth = 1.5;
    for (let x = 64; x < 512; x += 64) {
      for (let y = 64; y < 512; y += 64) {
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }
    }

    const floorTexture = this.track(new THREE.CanvasTexture(canvas));
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(16, 16);
    floorTexture.anisotropy = 4;
    floorTexture.colorSpace = THREE.SRGBColorSpace;

    const floor = new THREE.Mesh(floorGeo, this.track(new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.82, metalness: 0.15 })));
    floor.position.y = -0.16;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private buildRouteLines() {
    const route = (points: [number, number][], color: number) => {
      const geo = this.track(new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, -0.145, z))));
      const line = new THREE.Line(geo, this.track(new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.22, transparent: true, opacity: 0.85 })));
      line.computeLineDistances();
      this.group.add(line);
    };
    // Navigation paths run around (never through) the pedestal.
    route([[-9, -4.6], [-1.8, -4.6], [-1.8, 2.4], [5.2, 2.4], [5.2, -7]], 0x40c8e8);
    route([[9, -8.2], [2.6, -8.2], [2.6, -3.1], [-5.6, -3.1], [-5.6, 6]], 0xb7f34a);
  }

  /** Background racking as three instanced meshes (uprights, beams, pallets) instead of ~150 meshes. */
  private buildWarehouseShelving() {
    const rackPositions: [number, number][] = [
      [-8.2, -7],
      [-8.2, -2],
      [-8.2, 3],
      [8.2, -7],
      [8.2, -2],
      [8.2, 3],
      [-5, -12],
      [0, -12],
      [5, -12],
    ];
    const levels = [0.75, 2.1, 3.45];
    const palletSlots = [-1.15, 0, 1.15];

    const uprightMat = this.track(new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.45, metalness: 0.7 }));
    const beamMat = this.track(new THREE.MeshStandardMaterial({ color: 0x2f6f86, roughness: 0.5, metalness: 0.6 }));
    const palletMat = this.track(new THREE.MeshStandardMaterial({ color: 0x8a7354, roughness: 0.9, metalness: 0.02 }));

    const uprights = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(0.08, 4.3, 0.08)), uprightMat, rackPositions.length * 4);
    const beams = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(3.9, 0.07, 0.9)), beamMat, rackPositions.length * levels.length);
    const pallets = new THREE.InstancedMesh(
      this.track(new THREE.BoxGeometry(0.8, 0.5, 0.7)),
      palletMat,
      rackPositions.length * levels.length * palletSlots.length,
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let u = 0;
    let b = 0;
    let k = 0;
    rackPositions.forEach(([rx, rz], rackIndex) => {
      // Side racks run along Z (rotated); back racks run along X.
      const sideways = Math.abs(rx) > 6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sideways ? Math.PI / 2 : 0);
      const along = (offset: number) => (sideways ? [rx, rz + offset] : [rx + offset, rz]);
      for (const end of [-1.9, 1.9]) {
        for (const side of [-0.4, 0.4]) {
          const [ax, az] = along(end);
          p.set(ax + (sideways ? side : 0), 2.0, az + (sideways ? 0 : side));
          uprights.setMatrixAt(u++, m.compose(p, q, s));
        }
      }
      levels.forEach((y, levelIndex) => {
        p.set(rx, y - 0.16, rz);
        beams.setMatrixAt(b++, m.compose(p, q, s));
        palletSlots.forEach((slot, slotIndex) => {
          // Leave a few gaps so the racks read as real storage, not a solid block.
          const empty = (rackIndex + levelIndex * 2 + slotIndex) % 5 === 0;
          const [px, pz] = along(slot);
          p.set(px, y + 0.13, pz);
          const scale = empty ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : s;
          pallets.setMatrixAt(k++, m.compose(p, q, scale));
        });
      });
    });
    for (const mesh of [uprights, beams, pallets]) {
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }

  private buildConflictAisle() {
    // Two low rack ends forming a one-robot passage. Raised only during scene 04,
    // located away from the hero robot so they never frame or hide it.
    // Low, light rack ends with a thin amber safety edge: they read as aisle boundaries, not walls.
    const barrierMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6a7a83, roughness: 0.55, metalness: 0.4 }));
    const stripeMat = this.track(new THREE.MeshBasicMaterial({ color: 0xd9a441 }));
    const barrierGeo = this.track(new THREE.BoxGeometry(0.16, 0.55, 3.2));
    const stripeGeo = this.track(new THREE.BoxGeometry(0.05, 0.02, 3.2));
    for (const x of [-0.62, 0.62]) {
      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(x, 0.115, 0);
      barrier.receiveShadow = true;
      this.conflictAisleGroup.add(barrier);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(x, 0.4, 0);
      this.conflictAisleGroup.add(stripe);
    }

    this.conflictBotA = this.createMiniBot(0x40c8e8);
    this.conflictBotB = this.createMiniBot(0xf5b942);
    this.conflictBeaconB = (this.conflictBotB.getObjectByName("beacon") as THREE.Mesh).material as THREE.MeshBasicMaterial;
    this.conflictAisleGroup.add(this.conflictBotA, this.conflictBotB);
    this.conflictBotA.position.set(0, -0.1, -3.2);
    this.conflictBotB.position.set(0.75, -0.1, 2.5);
    this.conflictAisleGroup.scale.y = 0.001;
    this.conflictAisleGroup.visible = false;
  }

  private createMiniBot(color: number): THREE.Group {
    const bot = new THREE.Group();
    bot.scale.setScalar(0.5);

    const chassis = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(1.1, 0.28, 1.4)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1f2a30, roughness: 0.5, metalness: 0.4 })),
    );
    chassis.position.y = 0.2;
    bot.add(chassis);

    const shell = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(1.0, 0.32, 1.3)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xd0d5da, roughness: 0.3 })),
    );
    shell.position.y = 0.48;
    bot.add(shell);

    const lidar = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16)), this.track(new THREE.MeshBasicMaterial({ color })));
    lidar.name = "lidar";
    lidar.position.set(0, 0.68, 0.3);
    bot.add(lidar);

    const beacon = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.06, 12, 12)), this.track(new THREE.MeshBasicMaterial({ color })));
    beacon.name = "beacon";
    beacon.position.set(0, 0.8, -0.3);
    bot.add(beacon);
    return bot;
  }

  private buildFleetRobots() {
    // The fleet patrols the back of the hall, behind and beside the hero robot.
    const fleet = [
      { color: 0x40c8e8, base: [-5.2, -6.6], radius: { x: 2.2, z: 1.1 }, phase: 0, speed: 0.55 },
      { color: 0xb7f34a, base: [6.6, -8.4], radius: { x: 1.0, z: 0.9 }, phase: Math.PI * 0.7, speed: 0.5 },
      { color: 0x40c8e8, base: [5.6, 0.6], radius: { x: 1.0, z: 2.0 }, phase: Math.PI * 1.4, speed: 0.6 },
    ];
    for (const f of fleet) {
      const bot = this.createMiniBot(f.color);
      const base = new THREE.Vector3(f.base[0], -0.05, f.base[1]);
      bot.position.copy(base);
      this.group.add(bot);
      this.fleetRobots.push({ group: bot, base, radius: f.radius, phase: f.phase, speed: f.speed, lidar: bot.getObjectByName("lidar") ?? null });
    }
  }

  public update({ time, delta, scrollProgress, animate }: EnvironmentUpdateParams) {
    const ease = 1 - Math.exp(-delta * 5);

    // Pedestal sinks into the floor once the hero is left behind.
    const pedestalTarget = scrollProgress > 0.12 ? -0.4 : 0;
    this.pedestalGroup.position.y += (pedestalTarget - this.pedestalGroup.position.y) * ease;

    // Narrow aisle rises from the floor only around scene 04.
    const inAisleScene = scrollProgress >= AISLE_VISIBLE.from && scrollProgress <= AISLE_VISIBLE.to;
    this.aisleRise += ((inAisleScene ? 1 : 0) - this.aisleRise) * ease;
    this.conflictAisleGroup.visible = this.aisleRise > 0.01;
    this.conflictAisleGroup.scale.y = Math.max(0.001, this.aisleRise);

    if (this.conflictAisleGroup.visible) this.animateConflict(animate ? time : 0);

    if (!animate) return;
    this.fleetRobots.forEach((bot, index) => {
      if (bot.lidar) bot.lidar.rotation.y += delta * 4;
      const angle = time * bot.speed + bot.phase;
      const x = bot.base.x + Math.sin(angle) * bot.radius.x;
      const z = bot.base.z + Math.cos(angle * 0.5) * bot.radius.z;
      const dx = x - bot.group.position.x;
      const dz = z - bot.group.position.z;
      if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
        const heading = Math.atan2(dx, dz) + Math.PI;
        let turn = heading - bot.group.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        bot.group.rotation.y += turn * ease;
      }
      bot.group.position.set(x, -0.05 + Math.sin(time * 3 + index) * 0.01, z);
    });
  }

  /** Six-second loop: A approaches, B yields to a holding cell, A passes, B resumes. */
  private animateConflict(time: number) {
    const t = (time * 0.6) % 6;
    const a = this.conflictBotA.position;
    const b = this.conflictBotB.position;
    let phase: number;
    if (t < 2.5) {
      phase = 0;
      a.set(0, -0.1, -3.0 + t);
      const y = Math.min(t / 2, 1);
      b.set(y * 0.95, -0.1, 3.0 - y * 1.2);
      this.conflictBotB.rotation.y = Math.PI - y * 0.4;
    } else if (t < 4.2) {
      phase = 1;
      a.set(0, -0.1, -0.5 + (t - 2.5) * 1.8);
      b.set(0.95, -0.1, 1.8);
    } else {
      phase = 2;
      a.set(0, -0.1, 2.56 + (t - 4.2) * 0.8);
      b.set(Math.max(0, 0.95 - (t - 4.2) * 1.5), -0.1, 1.8 - (t - 4.2) * 1.8);
      this.conflictBotB.rotation.y = Math.PI;
    }
    if (phase !== this.conflictPhase) {
      this.conflictPhase = phase;
      this.conflictBeaconB.color.setHex(phase === 2 ? 0xb7f34a : 0xf5b942);
    }
  }

  public dispose() {
    for (const resource of this.disposables) resource.dispose();
    this.disposables.length = 0;
  }
}
