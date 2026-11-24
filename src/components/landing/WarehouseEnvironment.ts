import * as THREE from "three";

export interface EnvironmentUpdateParams {
  time: number;
  delta: number;
  scrollProgress: number;
}

export class WarehouseEnvironment {
  public group: THREE.Group;
  public pedestalGroup: THREE.Group;
  private fleetRobots: {
    group: THREE.Group;
    basePosition: THREE.Vector3;
    phase: number;
    speed: number;
    color: number;
    lidar: THREE.Mesh;
  }[] = [];
  private routeLineMeshes: THREE.LineSegments[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.group.add(this.pedestalGroup);

    this.buildPedestal();
    this.buildFloor();
    this.buildRouteLines();
    this.buildWarehouseShelving();
    this.buildFleetRobots();
  }

  private buildPedestal() {
    // Stepped industrial graphite pedestal
    const baseGeo = new THREE.CylinderGeometry(1.5, 1.65, 0.16, 48);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1d2327,
      roughness: 0.6,
      metalness: 0.3,
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
      color: 0x14181b,
      roughness: 0.7,
      metalness: 0.4,
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.02;
    pad.receiveShadow = true;
    this.pedestalGroup.add(pad);
  }

  private buildFloor() {
    // Large warehouse floor
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    floorGeo.rotateX(-Math.PI / 2);

    // Create subtle grid texture procedurally
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#E8E4DB";
    ctx.fillRect(0, 0, 512, 512);

    // Grid lines
    ctx.strokeStyle = "rgba(20, 20, 20, 0.06)";
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

    // Grid corner crosshairs
    ctx.strokeStyle = "rgba(64, 200, 232, 0.25)";
    ctx.lineWidth = 1.5;
    for (let x = 64; x < 512; x += 64) {
      for (let y = 64; y < 512; y += 64) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
    }

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(15, 15);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.85,
      metalness: 0.05,
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.16;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private buildRouteLines() {
    // Coordinated illuminated route paths drawn on the floor
    const routePoints = [
      // Route 1 (Cyan)
      new THREE.Vector3(-6, -0.15, -4),
      new THREE.Vector3(-2, -0.15, -4),
      new THREE.Vector3(-2, -0.15, 2),
      new THREE.Vector3(4, -0.15, 2),
      new THREE.Vector3(4, -0.15, -5),

      // Route 2 (Lime)
      new THREE.Vector3(6, -0.15, -6),
      new THREE.Vector3(2, -0.15, -6),
      new THREE.Vector3(2, -0.15, -1),
      new THREE.Vector3(-4, -0.15, -1),
      new THREE.Vector3(-4, -0.15, 5),
    ];

    const cyanRouteGeo = new THREE.BufferGeometry().setFromPoints(routePoints.slice(0, 5));
    const cyanRouteMat = new THREE.LineDashedMaterial({
      color: 0x40c8e8,
      dashSize: 0.35,
      gapSize: 0.2,
      linewidth: 2,
    });
    const cyanLine = new THREE.Line(cyanRouteGeo, cyanRouteMat);
    cyanLine.computeLineDistances();
    this.group.add(cyanLine);

    const limeRouteGeo = new THREE.BufferGeometry().setFromPoints(routePoints.slice(5));
    const limeRouteMat = new THREE.LineDashedMaterial({
      color: 0xb7f34a,
      dashSize: 0.35,
      gapSize: 0.2,
      linewidth: 2,
    });
    const limeLine = new THREE.Line(limeRouteGeo, limeRouteMat);
    limeLine.computeLineDistances();
    this.group.add(limeLine);
  }

  private buildWarehouseShelving() {
    // Distant abstract warehouse shelving racks
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0xb4aba0,
      roughness: 0.6,
      metalness: 0.4,
    });

    const uprightGeo = new THREE.BoxGeometry(0.08, 4.5, 0.08);
    const shelfGeo = new THREE.BoxGeometry(3.8, 0.05, 0.8);

    const rackPositions = [
      [-7, -0.16, -6],
      [-7, -0.16, -1],
      [-7, -0.16, 4],
      [7, -0.16, -6],
      [7, -0.16, -1],
      [7, -0.16, 4],
      [0, -0.16, -10],
      [-5, -0.16, -10],
      [5, -0.16, -10],
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

        // Abstract cargo pallets
        const palletGeo = new THREE.BoxGeometry(0.7, 0.4, 0.6);
        const palletMat = new THREE.MeshStandardMaterial({
          color: 0x9e9589,
          roughness: 0.8,
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

  private buildFleetRobots() {
    // 3 secondary coordinated fleet robots (SW-02, SW-03, SW-04)
    const fleetData = [
      { id: "SW-02", color: 0x40c8e8, pos: new THREE.Vector3(-3.5, -0.05, -3), phase: 0, speed: 0.7 },
      { id: "SW-03", color: 0xb7f34a, pos: new THREE.Vector3(3.8, -0.05, -2), phase: Math.PI * 0.6, speed: 0.6 },
      { id: "SW-04", color: 0xf5b942, pos: new THREE.Vector3(-1.5, -0.05, 4), phase: Math.PI * 1.3, speed: 0.8 },
    ];

    fleetData.forEach((item) => {
      const botGroup = new THREE.Group();
      botGroup.scale.set(0.55, 0.55, 0.55);
      botGroup.position.copy(item.pos);

      // Chassis
      const chassisGeo = new THREE.BoxGeometry(1.1, 0.3, 1.4);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x22282c,
        roughness: 0.5,
        metalness: 0.3,
      });
      const chassis = new THREE.Mesh(chassisGeo, chassisMat);
      chassis.position.y = 0.2;
      chassis.castShadow = true;
      botGroup.add(chassis);

      // Shell
      const shellGeo = new THREE.BoxGeometry(1.0, 0.3, 1.3);
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0xe8e4dc,
        roughness: 0.35,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.y = 0.45;
      shell.castShadow = true;
      botGroup.add(shell);

      // Mini LiDAR
      const lidarGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
      const lidarMat = new THREE.MeshBasicMaterial({ color: item.color });
      const lidar = new THREE.Mesh(lidarGeo, lidarMat);
      lidar.position.set(0, 0.65, 0.3);
      botGroup.add(lidar);

      // LED eye strip
      const eyeGeo = new THREE.PlaneGeometry(0.5, 0.12);
      const eyeMat = new THREE.MeshBasicMaterial({ color: item.color });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(0, 0.45, -0.66);
      eye.rotation.y = Math.PI;
      botGroup.add(eye);

      this.group.add(botGroup);
      this.fleetRobots.push({
        group: botGroup,
        basePosition: item.pos.clone(),
        phase: item.phase,
        speed: item.speed,
        color: item.color,
        lidar,
      });
    });
  }

  public update(params: EnvironmentUpdateParams) {
    const { time, delta, scrollProgress } = params;

    // Pedestal responds to scroll (descends slightly as we transition deeper into warehouse floor)
    const targetPedestalY = scrollProgress > 0.15 ? -0.4 : 0;
    this.pedestalGroup.position.y += (targetPedestalY - this.pedestalGroup.position.y) * 0.05;

    // Animate coordinated secondary fleet robots smoothly along warehouse paths
    this.fleetRobots.forEach((bot, index) => {
      // Rotating LiDAR
      bot.lidar.rotation.y += delta * 4;

      // Closed loop warehouse patrol animation
      const patrolRadiusX = 2.4 + index * 0.5;
      const patrolRadiusZ = 1.8 + index * 0.4;
      const currentAngle = time * bot.speed + bot.phase;

      // Figure-8 or elliptical patrol path
      const targetX = bot.basePosition.x + Math.sin(currentAngle) * patrolRadiusX;
      const targetZ = bot.basePosition.z + Math.cos(currentAngle * 0.5) * patrolRadiusZ;

      // Facing orientation calculation
      const dx = targetX - bot.group.position.x;
      const dz = targetZ - bot.group.position.z;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        const targetRotY = Math.atan2(dx, dz) + Math.PI;
        bot.group.rotation.y += (targetRotY - bot.group.rotation.y) * 0.1;
      }

      bot.group.position.x = targetX;
      bot.group.position.z = targetZ;
      bot.group.position.y = -0.05 + Math.sin(time * 3 + index) * 0.01; // subtle suspension vibration
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
