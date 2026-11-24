import * as THREE from "three";

export interface EnvironmentUpdateParams {
  time: number;
  delta: number;
  scrollProgress: number;
}

export class WarehouseEnvironment {
  public group: THREE.Group;
  public pedestalGroup: THREE.Group;
  public conflictAisleGroup: THREE.Group;

  private fleetRobots: {
    group: THREE.Group;
    basePosition: THREE.Vector3;
    phase: number;
    speed: number;
    color: number;
    lidar: THREE.Mesh;
  }[] = [];

  // Dedicated robots for Scene 04: Narrow-Aisle Conflict demonstration
  private conflictBotA!: THREE.Group; // SW-02
  private conflictBotB!: THREE.Group; // SW-03
  private conflictBeaconA!: THREE.Mesh;
  private conflictBeaconB!: THREE.Mesh;

  constructor() {
    this.group = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.conflictAisleGroup = new THREE.Group();

    this.group.add(this.pedestalGroup);
    this.group.add(this.conflictAisleGroup);

    this.buildPedestal();
    this.buildFloor();
    this.buildRouteLines();
    this.buildWarehouseShelving();
    this.buildConflictAisle();
    this.buildFleetRobots();
  }

  private buildPedestal() {
    // Stepped dark industrial graphite/carbon pedestal
    const baseGeo = new THREE.CylinderGeometry(1.5, 1.65, 0.16, 48);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x10161a,
      roughness: 0.5,
      metalness: 0.6,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.08;
    base.receiveShadow = true;
    base.castShadow = true;
    this.pedestalGroup.add(base);

    // Glowing cyan recessed LED ring
    const ringGeo = new THREE.TorusGeometry(1.48, 0.015, 16, 64);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x40c8e8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.005;
    this.pedestalGroup.add(ring);

    // Upper beveled pedestal pad
    const padGeo = new THREE.CylinderGeometry(1.4, 1.48, 0.04, 48);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x080b0d,
      roughness: 0.65,
      metalness: 0.5,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.02;
    pad.receiveShadow = true;
    this.pedestalGroup.add(pad);
  }

  private buildFloor() {
    // Large dark warehouse floor
    const floorGeo = new THREE.PlaneGeometry(70, 70);
    floorGeo.rotateX(-Math.PI / 2);

    // Procedural dark floor grid with glowing cyan crosshairs
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    // Deep black base
    ctx.fillStyle = "#080B0D";
    ctx.fillRect(0, 0, 512, 512);

    // Low-opacity thin grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Cyan technical intersection crosshairs
    ctx.strokeStyle = "rgba(64, 200, 232, 0.35)";
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

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(16, 16);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.8,
      metalness: 0.25,
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.16;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private buildRouteLines() {
    // Coordinated illuminated laser route tracks on dark floor
    const routePointsA = [
      new THREE.Vector3(-7, -0.15, -5),
      new THREE.Vector3(-2.5, -0.15, -5),
      new THREE.Vector3(-2.5, -0.15, 2),
      new THREE.Vector3(4.5, -0.15, 2),
      new THREE.Vector3(4.5, -0.15, -6),
    ];

    const cyanRouteGeo = new THREE.BufferGeometry().setFromPoints(routePointsA);
    const cyanRouteMat = new THREE.LineDashedMaterial({
      color: 0x40c8e8,
      dashSize: 0.4,
      gapSize: 0.2,
      linewidth: 2,
    });
    const cyanLine = new THREE.Line(cyanRouteGeo, cyanRouteMat);
    cyanLine.computeLineDistances();
    this.group.add(cyanLine);

    const routePointsB = [
      new THREE.Vector3(7, -0.15, -7),
      new THREE.Vector3(2.5, -0.15, -7),
      new THREE.Vector3(2.5, -0.15, -1.5),
      new THREE.Vector3(-4.5, -0.15, -1.5),
      new THREE.Vector3(-4.5, -0.15, 6),
    ];

    const limeRouteGeo = new THREE.BufferGeometry().setFromPoints(routePointsB);
    const limeRouteMat = new THREE.LineDashedMaterial({
      color: 0xb7f34a,
      dashSize: 0.4,
      gapSize: 0.2,
      linewidth: 2,
    });
    const limeLine = new THREE.Line(limeRouteGeo, limeRouteMat);
    limeLine.computeLineDistances();
    this.group.add(limeLine);
  }

  private buildWarehouseShelving() {
    // Dark industrial steel storage racks
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0x151d22,
      roughness: 0.5,
      metalness: 0.6,
    });

    const uprightGeo = new THREE.BoxGeometry(0.08, 4.5, 0.08);
    const shelfGeo = new THREE.BoxGeometry(3.8, 0.05, 0.8);

    const rackPositions = [
      [-7.5, -0.16, -6],
      [-7.5, -0.16, -1],
      [-7.5, -0.16, 4],
      [7.5, -0.16, -6],
      [7.5, -0.16, -1],
      [7.5, -0.16, 4],
      [0, -0.16, -11],
      [-5.5, -0.16, -11],
      [5.5, -0.16, -11],
    ];

    rackPositions.forEach(([rx, ry, rz]) => {
      const rack = new THREE.Group();
      rack.position.set(rx, ry, rz);

      // 4 uprights
      [-1.8, 1.8].forEach((x) => {
        [-0.35, 0.35].forEach((z) => {
          const up = new THREE.Mesh(uprightGeo, rackMat);
          up.position.set(x, 2.25, z);
          rack.add(up);
        });
      });

      // 3 horizontal shelf tiers
      [0.8, 2.2, 3.6].forEach((y) => {
        const shelf = new THREE.Mesh(shelfGeo, rackMat);
        shelf.position.set(0, y, 0);
        rack.add(shelf);

        // Pallet boxes with dark industrial styling
        const palletGeo = new THREE.BoxGeometry(0.7, 0.4, 0.6);
        const palletMat = new THREE.MeshStandardMaterial({
          color: 0x1a242a,
          roughness: 0.6,
          metalness: 0.3,
        });

        [-1.0, 0.1, 1.1].forEach((px) => {
          const pallet = new THREE.Mesh(palletGeo, palletMat);
          pallet.position.set(px, y + 0.22, 0);
          rack.add(pallet);
        });
      });

      this.group.add(rack);
    });
  }

  private buildConflictAisle() {
    // Narrow aisle physical barriers for Scene 04
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x162026,
      roughness: 0.6,
      metalness: 0.5,
    });

    const aisleRacks = [
      { pos: [-1.2, 0.5, 0], size: [0.3, 1.2, 3.6] },
      { pos: [1.2, 0.5, 0], size: [0.3, 1.2, 3.6] },
    ];

    aisleRacks.forEach((item) => {
      const geo = new THREE.BoxGeometry(item.size[0], item.size[1], item.size[2]);
      const mesh = new THREE.Mesh(geo, barrierMat);
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.conflictAisleGroup.add(mesh);

      // Warning hazard stripe on top of barrier
      const stripeGeo = new THREE.BoxGeometry(item.size[0] + 0.02, 0.02, item.size[2]);
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5b942 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(item.pos[0], item.size[1] + 0.01, item.pos[2]);
      this.conflictAisleGroup.add(stripe);
    });

    // 2 robots for Scene 04 Narrow Aisle conflict:
    this.conflictBotA = this.createMiniBot(0x40c8e8);
    this.conflictBeaconA = this.conflictBotA.getObjectByName("beacon") as THREE.Mesh;
    this.conflictAisleGroup.add(this.conflictBotA);

    this.conflictBotB = this.createMiniBot(0xf5b942);
    this.conflictBeaconB = this.conflictBotB.getObjectByName("beacon") as THREE.Mesh;
    this.conflictAisleGroup.add(this.conflictBotB);

    // Initial positions
    this.conflictBotA.position.set(0, 0, -3.2); // Approaching from -Z
    this.conflictBotB.position.set(0, 0, 3.2);  // Approaching from +Z
  }

  private createMiniBot(color: number): THREE.Group {
    const bot = new THREE.Group();
    bot.scale.set(0.5, 0.5, 0.5);

    // Dark chassis
    const chassisGeo = new THREE.BoxGeometry(1.1, 0.28, 1.4);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x121a1e,
      roughness: 0.5,
      metalness: 0.4,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.2;
    chassis.castShadow = true;
    bot.add(chassis);

    // Shell
    const shellGeo = new THREE.BoxGeometry(1.0, 0.32, 1.3);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd0d5da,
      roughness: 0.3,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 0.48;
    shell.castShadow = true;
    bot.add(shell);

    // Rotating mini LiDAR
    const lidarGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
    const lidarMat = new THREE.MeshBasicMaterial({ color });
    const lidar = new THREE.Mesh(lidarGeo, lidarMat);
    lidar.name = "lidar";
    lidar.position.set(0, 0.68, 0.3);
    bot.add(lidar);

    // Status beacon
    const beaconGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.name = "beacon";
    beacon.position.set(0, 0.8, -0.3);
    bot.add(beacon);

    return bot;
  }

  private buildFleetRobots() {
    // Fleet robots for Scene 03 & 05
    const fleetData = [
      { id: "SW-04", color: 0x40c8e8, pos: new THREE.Vector3(-4.5, -0.05, -3.5), phase: 0, speed: 0.75 },
      { id: "SW-05", color: 0xb7f34a, pos: new THREE.Vector3(4.2, -0.05, -2.5), phase: Math.PI * 0.7, speed: 0.65 },
      { id: "SW-06", color: 0x40c8e8, pos: new THREE.Vector3(-2.5, -0.05, 4.5), phase: Math.PI * 1.4, speed: 0.85 },
    ];

    fleetData.forEach((item) => {
      const bot = this.createMiniBot(item.color);
      bot.position.copy(item.pos);
      this.group.add(bot);

      const lidar = bot.getObjectByName("lidar") as THREE.Mesh;
      this.fleetRobots.push({
        group: bot,
        basePosition: item.pos.clone(),
        phase: item.phase,
        speed: item.speed,
        color: item.color,
        lidar: lidar || bot,
      });
    });
  }

  public update(params: EnvironmentUpdateParams) {
    const { time, delta, scrollProgress } = params;

    // Pedestal responds to scroll (descends into floor when scrolling past hero)
    const targetPedestalY = scrollProgress > 0.12 ? -0.45 : 0;
    this.pedestalGroup.position.y += (targetPedestalY - this.pedestalGroup.position.y) * 0.05;

    // SCENE 04: Narrow-Aisle Conflict Animation
    // Conflict is active around scrollProgress 0.38 to 0.64
    const inConflictSection = scrollProgress >= 0.36 && scrollProgress <= 0.64;

    if (inConflictSection) {
      // Loop cycle for conflict demo
      const cycleTime = (time * 0.6) % 6; // 6-second repeatable cycle

      if (cycleTime < 2.5) {
        // Phase 1: Both approach
        // Bot A drives forward from -3.0 to -0.5
        this.conflictBotA.position.z = -3.0 + cycleTime * 1.0;
        this.conflictBotA.position.x = 0;
        this.conflictBotA.rotation.y = 0;

        // Bot B approaches to 1.5, detects conflict and starts yielding to holding position [0.75, 0, 1.8]
        const yieldProgress = Math.min(cycleTime / 2.0, 1);
        this.conflictBotB.position.z = 3.0 - yieldProgress * 1.2;
        this.conflictBotB.position.x = yieldProgress * 0.75;
        this.conflictBotB.rotation.y = Math.PI - yieldProgress * 0.4;

        (this.conflictBeaconA.material as THREE.MeshBasicMaterial).color.setHex(0x40c8e8);
        (this.conflictBeaconB.material as THREE.MeshBasicMaterial).color.setHex(0xf5b942);
      } else if (cycleTime < 4.2) {
        // Phase 2: Bot A passes through narrow aisle safely while Bot B holds
        this.conflictBotA.position.z = -0.5 + (cycleTime - 2.5) * 1.8;
        this.conflictBotA.position.x = 0;

        this.conflictBotB.position.set(0.75, 0, 1.8);
        (this.conflictBeaconB.material as THREE.MeshBasicMaterial).color.setHex(0xf5b942);
      } else {
        // Phase 3: Bot A has cleared; Bot B resumes passage through narrow aisle
        this.conflictBotA.position.z = 2.5 + (cycleTime - 4.2) * 0.8;
        this.conflictBotB.position.x = Math.max(0, 0.75 - (cycleTime - 4.2) * 1.5);
        this.conflictBotB.position.z = 1.8 - (cycleTime - 4.2) * 1.8;
        this.conflictBotB.rotation.y = Math.PI;

        (this.conflictBeaconB.material as THREE.MeshBasicMaterial).color.setHex(0xb7f34a);
      }
    } else {
      // Idle patrol positions outside conflict section
      this.conflictBotA.position.set(0, 0, -3.2);
      this.conflictBotB.position.set(0.75, 0, 2.5);
    }

    // SCENE 03 & 05: Animate Secondary Fleet Patrol
    this.fleetRobots.forEach((bot, index) => {
      if (bot.lidar) {
        bot.lidar.rotation.y += delta * 4;
      }

      const patrolRadiusX = 2.6 + index * 0.6;
      const patrolRadiusZ = 2.0 + index * 0.5;
      const currentAngle = time * bot.speed + bot.phase;

      const targetX = bot.basePosition.x + Math.sin(currentAngle) * patrolRadiusX;
      const targetZ = bot.basePosition.z + Math.cos(currentAngle * 0.5) * patrolRadiusZ;

      const dx = targetX - bot.group.position.x;
      const dz = targetZ - bot.group.position.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        const targetRotY = Math.atan2(dx, dz) + Math.PI;
        bot.group.rotation.y += (targetRotY - bot.group.rotation.y) * 0.08;
      }

      bot.group.position.x = targetX;
      bot.group.position.z = targetZ;
      bot.group.position.y = -0.05 + Math.sin(time * 3 + index) * 0.01;
    });
  }

  public dispose() {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  }
}
