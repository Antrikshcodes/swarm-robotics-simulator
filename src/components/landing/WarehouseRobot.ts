import * as THREE from "three";

export type RobotExpression = "neutral" | "scanning" | "welcome" | "alert";

export interface RobotUpdateParams {
  time: number;
  delta: number;
  scrollProgress: number;
  pointer: { x: number; y: number };
  expression?: RobotExpression;
  lidarSpeedMultiplier?: number;
}

export class WarehouseRobot {
  public group: THREE.Group;
  private chassisGroup: THREE.Group;
  private wheels: THREE.Mesh[] = [];
  private lidarTurret!: THREE.Group;
  private lidarBeam!: THREE.Mesh;
  private eyeCanvas: HTMLCanvasElement;
  private eyeContext: CanvasRenderingContext2D;
  private eyeTexture: THREE.CanvasTexture;
  private eyeMaterial: THREE.MeshBasicMaterial;

  // Eye animation state
  private blinkProgress = 0;
  private isBlinking = false;
  private nextBlinkTime = 2.5;
  private lookX = 0;
  private lookY = 0;
  private currentExpression: RobotExpression = "neutral";

  // Suspension / bobbing
  private idleBobOffset = 0;

  constructor() {
    this.group = new THREE.Group();
    this.chassisGroup = new THREE.Group();
    this.group.add(this.chassisGroup);

    // 1. Initialize Face Canvas Texture
    this.eyeCanvas = document.createElement("canvas");
    this.eyeCanvas.width = 512;
    this.eyeCanvas.height = 256;
    this.eyeContext = this.eyeCanvas.getContext("2d")!;
    this.eyeTexture = new THREE.CanvasTexture(this.eyeCanvas);
    this.eyeTexture.colorSpace = THREE.SRGBColorSpace;
    this.eyeMaterial = new THREE.MeshBasicMaterial({
      map: this.eyeTexture,
      transparent: true,
      toneMapped: false,
    });

    // 2. Build Robot Components
    this.buildChassis();
    this.buildUpperShell();
    this.buildFrontDisplay();
    this.buildWheels();
    this.buildLidar();
    this.buildSensorsAndLights();
    this.buildCargoBay();

    // Initial eye render
    this.drawEyes(0, 0, 1, "neutral");
  }

  private buildChassis() {
    // Lower graphite chassis body
    const chassisGeo = new THREE.BoxGeometry(1.2, 0.22, 1.6);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x20272b,
      roughness: 0.55,
      metalness: 0.4,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.24;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.chassisGroup.add(chassis);

    // Bumper guard rim
    const bumperGeo = new THREE.BoxGeometry(1.26, 0.12, 1.68);
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x14181a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.y = 0.18;
    bumper.castShadow = true;
    this.chassisGroup.add(bumper);

    // Cyan underglow line on chassis
    const underglowGeo = new THREE.BoxGeometry(1.18, 0.02, 1.58);
    const underglowMat = new THREE.MeshBasicMaterial({
      color: 0x40c8e8,
      transparent: true,
      opacity: 0.8,
    });
    const underglow = new THREE.Mesh(underglowGeo, underglowMat);
    underglow.position.y = 0.12;
    this.chassisGroup.add(underglow);
  }

  private buildUpperShell() {
    // Off-white rounded matte upper shell
    const shellGeo = new THREE.BoxGeometry(1.14, 0.38, 1.52);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xeee7dd,
      roughness: 0.32,
      metalness: 0.06,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = 0.52;
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.chassisGroup.add(shell);

    // Chamfered top crown
    const crownGeo = new THREE.BoxGeometry(1.04, 0.08, 1.4);
    const crown = new THREE.Mesh(crownGeo, shellMat);
    crown.position.y = 0.73;
    crown.castShadow = true;
    this.chassisGroup.add(crown);

    // Fine seam line between shell panels
    const seamGeo = new THREE.BoxGeometry(1.15, 0.015, 0.015);
    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x9c968c,
      roughness: 0.9,
    });
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.position.set(0, 0.6, 0.1);
    this.chassisGroup.add(seam);
  }

  private buildFrontDisplay() {
    // Beveled screen bezel (Front faces -Z)
    const bezelGeo = new THREE.BoxGeometry(0.78, 0.3, 0.06);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x121619,
      roughness: 0.2,
      metalness: 0.8,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.set(0, 0.52, -0.77);
    this.chassisGroup.add(bezel);

    // Glossy black active display screen with dynamic eye texture
    const screenGeo = new THREE.PlaneGeometry(0.72, 0.26);
    const screen = new THREE.Mesh(screenGeo, this.eyeMaterial);
    screen.position.set(0, 0.52, -0.801);
    screen.rotation.y = Math.PI; // Face outwards to front
    this.chassisGroup.add(screen);
  }

  private buildWheels() {
    const wheelRadius = 0.18;
    const wheelWidth = 0.1;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    wheelGeo.rotateZ(Math.PI / 2);

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1b1f22,
      roughness: 0.85,
      metalness: 0.1,
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x5a656c,
      roughness: 0.3,
      metalness: 0.7,
    });

    const positions = [
      [-0.62, 0.18, -0.5], // Front Left
      [0.62, 0.18, -0.5],  // Front Right
      [-0.62, 0.18, 0.5],  // Rear Left
      [0.62, 0.18, 0.5],   // Rear Right
    ];

    positions.forEach(([x, y, z]) => {
      const wheelAssembly = new THREE.Group();
      wheelAssembly.position.set(x, y, z);

      // Tire
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      wheelAssembly.add(tire);

      // Hub rim
      const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, wheelWidth + 0.01, 16);
      hubGeo.rotateZ(Math.PI / 2);
      const hub = new THREE.Mesh(hubGeo, rimMat);
      wheelAssembly.add(hub);

      // Center cyan accent cap
      const capGeo = new THREE.CylinderGeometry(0.04, 0.04, wheelWidth + 0.02, 12);
      capGeo.rotateZ(Math.PI / 2);
      const capMat = new THREE.MeshBasicMaterial({ color: 0x40c8e8 });
      const cap = new THREE.Mesh(capGeo, capMat);
      wheelAssembly.add(cap);

      this.wheels.push(tire);
      this.chassisGroup.add(wheelAssembly);
    });
  }

  private buildLidar() {
    this.lidarTurret = new THREE.Group();
    this.lidarTurret.position.set(0, 0.81, 0.35); // Upper rear deck

    // Static base
    const baseGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.08, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x242a2e,
      roughness: 0.5,
      metalness: 0.5,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.04;
    this.lidarTurret.add(base);

    // Rotating head
    const headGroup = new THREE.Group();
    headGroup.name = "rotatingHead";
    headGroup.position.y = 0.12;

    const headGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.12, 24);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x181c1f,
      roughness: 0.25,
      metalness: 0.8,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.castShadow = true;
    headGroup.add(head);

    // Laser aperture slot
    const slotGeo = new THREE.BoxGeometry(0.14, 0.03, 0.06);
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x40c8e8 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, 0, 0.1);
    headGroup.add(slot);

    // Scanning fan beam (translucent)
    const beamGeo = new THREE.ConeGeometry(1.6, 0.05, 32, 1, true, 0, Math.PI / 3);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x40c8e8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.lidarBeam = new THREE.Mesh(beamGeo, beamMat);
    this.lidarBeam.position.set(0, 0, 0.8);
    headGroup.add(this.lidarBeam);

    this.lidarTurret.add(headGroup);
    this.chassisGroup.add(this.lidarTurret);
  }

  private buildSensorsAndLights() {
    // Front navigation ultrasonic sensor pods (2 lenses)
    const sensorGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16);
    sensorGeo.rotateX(Math.PI / 2);
    const sensorMat = new THREE.MeshStandardMaterial({
      color: 0x222a2f,
      roughness: 0.2,
      metalness: 0.8,
    });

    [-0.26, 0.26].forEach((x) => {
      const sensor = new THREE.Mesh(sensorGeo, sensorMat);
      sensor.position.set(x, 0.24, -0.84);
      this.chassisGroup.add(sensor);

      // Inner optic dot
      const opticGeo = new THREE.CircleGeometry(0.018, 12);
      const opticMat = new THREE.MeshBasicMaterial({ color: 0x40c8e8 });
      const optic = new THREE.Mesh(opticGeo, opticMat);
      optic.position.set(x, 0.24, -0.862);
      optic.rotation.y = Math.PI;
      this.chassisGroup.add(optic);
    });

    // Side emergency stop & status modules
    const eStopBaseGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
    const eStopBaseMat = new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.4 });
    const eStop = new THREE.Mesh(eStopBaseGeo, eStopBaseMat);
    eStop.position.set(0.48, 0.73, 0.55);
    this.chassisGroup.add(eStop);

    const buttonGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16);
    const buttonMat = new THREE.MeshStandardMaterial({ color: 0xf06464, roughness: 0.3 });
    const button = new THREE.Mesh(buttonGeo, buttonMat);
    button.position.set(0.48, 0.75, 0.55);
    this.chassisGroup.add(button);

    // Front corner status LEDs (Lime / Cyan)
    const ledGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const ledMatLeft = new THREE.MeshBasicMaterial({ color: 0xb7f34a });
    const ledMatRight = new THREE.MeshBasicMaterial({ color: 0x40c8e8 });

    const leftLed = new THREE.Mesh(ledGeo, ledMatLeft);
    leftLed.position.set(-0.52, 0.65, -0.74);
    this.chassisGroup.add(leftLed);

    const rightLed = new THREE.Mesh(ledGeo, ledMatRight);
    rightLed.position.set(0.52, 0.65, -0.74);
    this.chassisGroup.add(rightLed);
  }

  private buildCargoBay() {
    // Recessed cargo tray on rear deck
    const trayGeo = new THREE.BoxGeometry(0.85, 0.02, 0.65);
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x192024,
      roughness: 0.9,
      metalness: 0.1,
    });
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.set(0, 0.74, -0.2);
    this.chassisGroup.add(tray);

    // Cargo package on the platform
    const packageGeo = new THREE.BoxGeometry(0.65, 0.32, 0.48);
    const packageMat = new THREE.MeshStandardMaterial({
      color: 0x26333a,
      roughness: 0.45,
      metalness: 0.2,
    });
    const cargo = new THREE.Mesh(packageGeo, packageMat);
    cargo.position.set(0, 0.91, -0.2);
    cargo.castShadow = true;
    this.chassisGroup.add(cargo);

    // Package warning strip / branding
    const bandGeo = new THREE.BoxGeometry(0.66, 0.05, 0.49);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xb7f34a });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, 0.91, -0.2);
    this.chassisGroup.add(band);
  }

  private drawEyes(offsetX: number, offsetY: number, eyeOpen: number, expression: RobotExpression) {
    const ctx = this.eyeContext;
    const w = this.eyeCanvas.width;
    const h = this.eyeCanvas.height;

    // Clear background to deep glossy black
    ctx.fillStyle = "#0c1013";
    ctx.fillRect(0, 0, w, h);

    // Subtle technical grid pattern on display
    ctx.strokeStyle = "rgba(64, 200, 232, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const eyeWidth = 56;
    const eyeHeight = 90 * Math.max(0.08, eyeOpen);
    const eyeSpacing = 110;
    const centerX = w / 2 + offsetX * 35;
    const centerY = h / 2 + offsetY * 20;

    const leftX = centerX - eyeSpacing / 2 - eyeWidth / 2;
    const rightX = centerX + eyeSpacing / 2 - eyeWidth / 2;
    const eyeY = centerY - eyeHeight / 2;

    const eyeColor = expression === "alert" ? "#F5B942" : expression === "welcome" ? "#B7F34A" : "#40C8E8";
    const glowColor = expression === "alert" ? "rgba(245, 185, 66, 0.5)" : expression === "welcome" ? "rgba(183, 243, 74, 0.6)" : "rgba(64, 200, 232, 0.6)";

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = expression === "welcome" ? 28 : 18;
    ctx.fillStyle = eyeColor;

    if (expression === "welcome" && eyeOpen > 0.4) {
      // Friendly curved happy eyes: ^ ^
      [leftX + eyeWidth / 2, rightX + eyeWidth / 2].forEach((x) => {
        ctx.beginPath();
        ctx.lineWidth = 18;
        ctx.lineCap = "round";
        ctx.strokeStyle = eyeColor;
        ctx.arc(x, centerY + 12, 34, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      });
    } else {
      // Rounded pill eyes
      const radius = Math.min(eyeWidth / 2, eyeHeight / 2);

      [leftX, rightX].forEach((x) => {
        ctx.beginPath();
        ctx.roundRect(x, eyeY, eyeWidth, eyeHeight, radius);
        ctx.fill();

        // Inner pupil highlight for realism
        if (eyeOpen > 0.6) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x + eyeWidth * 0.65, eyeY + eyeHeight * 0.35, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = eyeColor;
        }
      });
    }

    // Scanning line effect when in scanning mode
    if (expression === "scanning") {
      const scanY = (Date.now() / 15) % h;
      ctx.strokeStyle = "rgba(64, 200, 232, 0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(w, scanY);
      ctx.stroke();
    }

    ctx.restore();
    this.eyeTexture.needsUpdate = true;
  }

  public update(params: RobotUpdateParams) {
    const { time, delta, scrollProgress, pointer, expression = "neutral", lidarSpeedMultiplier = 1 } = params;

    // 1. Idle Suspension Bobbing & Breathing
    this.idleBobOffset = Math.sin(time * 2.2) * 0.022;
    this.chassisGroup.position.y = this.idleBobOffset;

    // 2. Chassis tilt and yaw toward pointer
    const targetChassisYaw = pointer.x * 0.28;
    const targetChassisPitch = -pointer.y * 0.12;
    this.chassisGroup.rotation.y += (targetChassisYaw - this.chassisGroup.rotation.y) * 0.08;
    this.chassisGroup.rotation.x += (targetChassisPitch - this.chassisGroup.rotation.x) * 0.08;

    // 3. Rotating LiDAR
    const head = this.lidarTurret.getObjectByName("rotatingHead");
    if (head) {
      const lidarSpeed = (2.2 + scrollProgress * 1.5) * lidarSpeedMultiplier;
      head.rotation.y += delta * lidarSpeed;
    }

    // 4. Subtle wheel spin matching movement / idle hum
    const wheelSpin = delta * (0.8 + scrollProgress * 2.0);
    this.wheels.forEach((wheel) => {
      wheel.rotation.x += wheelSpin;
    });

    // 5. Blinking and Eye Tracking
    this.lookX += (pointer.x - this.lookX) * 0.1;
    this.lookY += (-pointer.y - this.lookY) * 0.1;

    if (time > this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.nextBlinkTime = time + 3.2 + Math.random() * 2.5;
    }

    let eyeOpen = 1;
    if (this.isBlinking) {
      this.blinkProgress += delta * 10;
      if (this.blinkProgress < 1) {
        eyeOpen = 1 - Math.sin(this.blinkProgress * Math.PI);
      } else {
        this.isBlinking = false;
        eyeOpen = 1;
      }
    }

    // Draw updated eyes
    this.currentExpression = expression;
    this.drawEyes(this.lookX, this.lookY, eyeOpen, expression);
  }

  public dispose() {
    this.eyeTexture.dispose();
    this.eyeMaterial.dispose();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
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
