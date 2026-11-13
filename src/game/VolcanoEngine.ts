import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gameAudio } from './audio';
import { createGameMaterialLibrary, type GameMaterialLibrary } from './materials';
import {
  createCandyModel,
  createExitPortal,
  createGirlCharacter,
  createKnifeModel,
  createMonsterModel,
  createStairStepMesh,
  generateStairBlueprints,
  type GirlRig,
  type MonsterRig,
} from './models';
import type { GamePhase, HudSnapshot, MonsterKind, StairBlueprint } from './types';

// Pre-allocated math helpers (zero GC inside animation loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vMove = new THREE.Vector3();
const _vCamTarget = new THREE.Vector3();
const _vCamDesired = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
const _dummyMat = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();
const _dummyEuler = new THREE.Euler();

const TOTAL_STAIRS = 12;
const ISLAND_RADIUS = 16.2;
const MAX_HP = 100;

interface ActiveKnife {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  life: number;
}

interface ActiveMonster {
  id: number;
  kind: MonsterKind;
  rig: MonsterRig;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  speed: number;
  hitRadius: number;
  damage: number;
  animOffset: number;
  hitFlashTimer: number;
  attackCooldown: number;
}

interface ActiveStair {
  blueprint: StairBlueprint;
  mesh: THREE.Group;
  unlocked: boolean;
  revealProgress: number; // 0 -> 1 animation when forged
  targetY: number;
}

interface ParticleBurst {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class VolcanoEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mats!: GameMaterialLibrary;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private isSoftwareGl = false;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  // Entities
  private girl!: GirlRig;
  private stairs: ActiveStair[] = [];
  private knives: ActiveKnife[] = [];
  private monsters: ActiveMonster[] = [];
  private particles: ParticleBurst[] = [];
  private candies: { mesh: THREE.Group; velocity: THREE.Vector3; life: number }[] = [];
  private exitPortalGroup!: THREE.Group;
  private portalCenter = new THREE.Vector3();
  private portalPlatformTopY = 12;
  private portalBeaconMesh!: THREE.Mesh;
  private spawnVents: THREE.Vector3[] = [];
  private embersPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private magmaLight!: THREE.PointLight;

  // Player state
  private phase: GamePhase = 'title';
  private playerPos = new THREE.Vector3(0, 34, 0);
  private playerVel = new THREE.Vector3();
  private playerYaw = 0;
  private onGround = false;
  private hp = MAX_HP;
  private invulnTimer = 0;
  private damageFlash = 0;

  // Camera state
  private cameraYaw = 0.35;
  private cameraPitch = 0.42;
  private isDraggingCamera = false;
  private isPrimaryDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownPos = { x: 0, y: 0 };

  // Combat & progression
  private stairsBuilt = 0;
  private kills = 0;
  private knifeCooldown = 0;
  private readonly knifeCooldownDuration = 0.28;
  private throwAnimTimer = 0;
  private monsterIdCounter = 1;
  private spawnTimer = 1.0;
  private elapsedSeconds = 0;
  private stairBannerText: string | null = null;
  private stairBannerTimer = 0;

  // Parachute detach animation
  private chuteDetachProgress = 0;
  private chuteDetached = false;

  // Input state
  private keys: Record<string, boolean> = {};
  private virtualJoyX = 0;
  private virtualJoyY = 0;
  private virtualJump = false;
  private virtualCamTurn = 0;
  private lastHudEmit = 0;
  private webglError: string | null = null;

  constructor(container: HTMLElement, onHudUpdate: (s: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

    try {
      this.initRendererAndScene();
      this.buildVolcanoEnvironment();
      this.buildCharacterAndStairs();
      this.bindEvents();
      this.emitHud(true);
      this.startLoop();
    } catch (err) {
      this.webglError =
        err instanceof Error ? err.message : 'Unable to initialize 3D WebGL viewport.';
      this.emitHud(true);
    }
  }

  private detectSoftwareWebGL(): boolean {
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initRendererAndScene() {
    this.isSoftwareGl = this.detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x1b1216);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x1b1216, 0.0115);

    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.2, 220);
    this.camera.position.set(16, 18, 28);

    // Mandatory studio environment reflection on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Volcano Lighting Rig (<= 3 shadow casters)
    const hemi = new THREE.HemisphereLight(0x7c93c4, 0xff5722, 0.95);
    this.scene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xffdfb8, 1.9);
    sunKey.position.set(24, 42, 18);
    sunKey.castShadow = !this.isSoftwareGl;
    sunKey.shadow.mapSize.width = 1024;
    sunKey.shadow.mapSize.height = 1024;
    const d = 28;
    sunKey.shadow.camera.left = -d;
    sunKey.shadow.camera.right = d;
    sunKey.shadow.camera.top = d;
    sunKey.shadow.camera.bottom = -d;
    sunKey.shadow.camera.near = 2;
    sunKey.shadow.camera.far = 95;
    sunKey.shadow.bias = -0.0005;
    sunKey.shadow.normalBias = 0.02;
    this.scene.add(sunKey);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rimLight.position.set(-22, 25, -24);
    this.scene.add(rimLight);

    this.magmaLight = new THREE.PointLight(0xff5a18, 3.8, 52, 1.4);
    this.magmaLight.position.set(0, 2.5, 0);
    this.scene.add(this.magmaLight);

    this.mats = createGameMaterialLibrary(this.renderer);
  }

  private buildVolcanoEnvironment() {
    // 1. Central Basalt Arena Island (natural rocky edge, top at y = 0)
    const islandGeo = new THREE.CylinderGeometry(
      ISLAND_RADIUS,
      ISLAND_RADIUS + 2.4,
      3.4,
      36,
      4,
    );
    const posAttr = islandGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const r = Math.hypot(x, z);
      // Organic rock rim while keeping walkable top surface flat near y = 0
      if (y < 1.3 && r > 4) {
        const noise = Math.sin(x * 0.45) * Math.cos(z * 0.45) * 0.65;
        posAttr.setX(i, x + (x / r) * noise);
        posAttr.setZ(i, z + (z / r) * noise);
      }
    }
    islandGeo.computeVertexNormals();
    const island = new THREE.Mesh(islandGeo, this.mats.basaltRock);
    island.position.y = -1.7;
    island.receiveShadow = true;
    this.scene.add(island);

    // 2. Molten Lava Lake surrounding the island
    const lavaGeo = new THREE.PlaneGeometry(130, 130, 48, 48);
    lavaGeo.rotateX(-Math.PI / 2);
    const lavaMesh = new THREE.Mesh(lavaGeo, this.mats.lavaSurface);
    lavaMesh.position.y = -1.35;
    this.scene.add(lavaMesh);

    // 3. Towering Volcano Caldera Wall (natural crater bowl open to sky!)
    const wallSegments = 48;
    const wallHeightSteps = 10;
    const craterInnerR = 23.5;
    const craterOuterR = 44.0;
    const wallPoints: THREE.Vector2[] = [];
    for (let i = 0; i <= wallHeightSteps; i++) {
      const t = i / wallHeightSteps;
      const r = THREE.MathUtils.lerp(craterInnerR, craterOuterR, Math.pow(t, 1.3));
      const y = -2.5 + t * 36.0;
      wallPoints.push(new THREE.Vector2(r, y));
    }
    // Outer slope down to horizon
    wallPoints.push(new THREE.Vector2(66, 18));
    wallPoints.push(new THREE.Vector2(82, -4));

    const calderaGeo = new THREE.LatheGeometry(wallPoints, wallSegments);
    const cPos = calderaGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const x = cPos.getX(i);
      const y = cPos.getY(i);
      const z = cPos.getZ(i);
      const angle = Math.atan2(z, x);
      const ridge =
        Math.sin(angle * 7 + y * 0.12) * 1.45 +
        Math.cos(angle * 13 - y * 0.18) * 0.85;
      const dist = Math.hypot(x, z);
      if (dist > 1) {
        cPos.setX(i, x + (x / dist) * ridge);
        cPos.setZ(i, z + (z / dist) * ridge);
        cPos.setY(i, y + Math.sin(angle * 5) * 0.9);
      }
    }
    calderaGeo.computeVertexNormals();
    const calderaMesh = new THREE.Mesh(calderaGeo, this.mats.volcanoWall);
    calderaMesh.receiveShadow = true;
    this.scene.add(calderaMesh);

    // 4. Instanced Obsidian Spires & Crater Rocks (with per-instance scale & color tint)
    const spireCount = 42;
    const spireGeo = new THREE.DodecahedronGeometry(1.15, 0);
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.2,
    });
    const spires = new THREE.InstancedMesh(spireGeo, spireMat, spireCount);
    spires.castShadow = !this.isSoftwareGl;
    spires.receiveShadow = true;

    const tint = new THREE.Color();
    for (let i = 0; i < spireCount; i++) {
      const angle = (i / spireCount) * Math.PI * 2 + Math.sin(i * 1.7) * 0.12;
      const onRim = i % 3 !== 0;
      const rad = onRim ? 23 + (i % 5) * 2.1 : 14.3 + (i % 2) * 0.8;
      const y = onRim ? 1.5 + (i % 4) * 2.2 : -0.15;
      const s = (onRim ? 1.4 : 0.72) * (0.85 + Math.random() * 0.3);

      _dummyPos.set(Math.cos(angle) * rad, y, Math.sin(angle) * rad);
      _dummyEuler.set(
        (Math.random() - 0.5) * 0.35,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.35,
      );
      _dummyQuat.setFromEuler(_dummyEuler);
      _dummyScale.set(s * 0.9, s * (onRim ? 2.4 : 1.15), s * 0.9);
      _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
      spires.setMatrixAt(i, _dummyMat);

      const shade = 0.18 + Math.random() * 0.14;
      tint.setRGB(shade + 0.04, shade, shade + 0.02);
      spires.setColorAt(i, tint);
    }
    spires.instanceMatrix.needsUpdate = true;
    if (spires.instanceColor) spires.instanceColor.needsUpdate = true;
    spires.computeBoundingSphere();
    this.scene.add(spires);

    // 5. Six Magma Spawn Vents around the island perimeter
    this.spawnVents = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.4;
      const vx = Math.cos(angle) * 12.6;
      const vz = Math.sin(angle) * 12.6;
      this.spawnVents.push(new THREE.Vector3(vx, 0, vz));

      const ventRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.22, 8, 16),
        this.mats.obsidianTrim,
      );
      ventRing.rotation.x = Math.PI / 2;
      ventRing.position.set(vx, 0.06, vz);
      this.scene.add(ventRing);

      const ventGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.8, 16),
        this.mats.stairRune,
      );
      ventGlow.rotation.x = -Math.PI / 2;
      ventGlow.position.set(vx, 0.03, vz);
      this.scene.add(ventGlow);
    }

    // 6. Rising Volcanic Ember Particles
    const emberCount = 240;
    this.emberPositions = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 24;
      this.emberPositions[i * 3] = Math.cos(a) * r;
      this.emberPositions[i * 3 + 1] = Math.random() * 34;
      this.emberPositions[i * 3 + 2] = Math.sin(a) * r;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.emberPositions, 3),
    );
    const emberMat = new THREE.PointsMaterial({
      color: 0xff8c24,
      size: 0.28,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.embersPoints = new THREE.Points(emberGeo, emberMat);
    this.scene.add(this.embersPoints);
  }

  private buildCharacterAndStairs() {
    this.girl = createGirlCharacter(this.mats);
    this.girl.root.position.copy(this.playerPos);
    this.scene.add(this.girl.root);

    // Build all 12 staircase blueprints (initially hidden underground until earned!)
    const blueprints = generateStairBlueprints(TOTAL_STAIRS);
    this.stairs = blueprints.map((bp) => {
      const mesh = createStairStepMesh(bp, this.mats);
      mesh.visible = false;
      mesh.position.y = bp.position[1] - 4.0;
      this.scene.add(mesh);
      return {
        blueprint: bp,
        mesh,
        unlocked: false,
        revealProgress: 0,
        targetY: bp.position[1],
      };
    });

    // Build Summit Escape Portal at the top of the 12th stair
    const lastBp = blueprints[blueprints.length - 1];
    const portal = createExitPortal(lastBp, this.mats);
    this.exitPortalGroup = portal.group;
    this.portalCenter.copy(portal.portalCenter);
    this.portalPlatformTopY = portal.platformTopY;
    this.scene.add(this.exitPortalGroup);

    // Tall vertical beacon beam above the exit portal (brightens when unlocked)
    this.portalBeaconMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.95, 22, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.portalBeaconMesh.position.set(
      this.portalCenter.x,
      this.portalCenter.y + 10,
      this.portalCenter.z,
    );
    this.scene.add(this.portalBeaconMesh);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public startNewRun() {
    gameAudio.unlock();
    this.clearMonstersAndProjectiles();

    this.hp = MAX_HP;
    this.invulnTimer = 0;
    this.damageFlash = 0;
    this.stairsBuilt = 0;
    this.kills = 0;
    this.knifeCooldown = 0;
    this.throwAnimTimer = 0;
    this.elapsedSeconds = 0;
    this.spawnTimer = 0.8;
    this.stairBannerText = null;
    this.stairBannerTimer = 0;

    // Reset stairs
    this.stairs.forEach((s) => {
      s.unlocked = false;
      s.revealProgress = 0;
      s.mesh.visible = false;
      s.mesh.position.y = s.targetY - 4.0;
    });
    (this.portalBeaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.14;

    // Reset girl high above volcano with parachute deployed!
    this.playerPos.set(0, 34, 0);
    this.playerVel.set(0, -6.5, 0);
    this.playerYaw = 0;
    this.onGround = false;
    this.chuteDetached = false;
    this.chuteDetachProgress = 0;
    this.girl.parachute.visible = true;
    this.girl.parachute.position.set(0, 1.35, 0);
    this.girl.parachute.scale.setScalar(1);
    this.girl.heldKnife.visible = true;
    this.girl.root.position.copy(this.playerPos);

    this.cameraYaw = 0.35;
    this.cameraPitch = 0.42;
    this.phase = 'parachuting';

    // Pre-spawn 3 initial monsters inside the crater so she sees danger as she lands!
    this.spawnMonster('imp');
    this.spawnMonster('imp');
    this.spawnMonster('golem');

    this.emitHud(true);
  }

  public togglePause() {
    if (this.phase === 'playing' || this.phase === 'parachuting') {
      this.phase = 'paused';
      this.emitHud(true);
    } else if (this.phase === 'paused') {
      this.phase = this.chuteDetached ? 'playing' : 'parachuting';
      this.clock.getDelta(); // flush large delta
      this.emitHud(true);
    }
  }

  public toggleMute(): boolean {
    const next = !gameAudio.isMuted();
    gameAudio.setMuted(next);
    this.emitHud(true);
    return next;
  }

  public setVirtualJoystick(x: number, y: number) {
    this.virtualJoyX = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualJoyY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setVirtualJump(pressed: boolean) {
    this.virtualJump = pressed;
  }

  public setVirtualCameraTurn(dir: number) {
    this.virtualCamTurn = THREE.MathUtils.clamp(dir, -1, 1);
  }

  public triggerThrowKnife() {
    this.throwKnife();
  }

  private clearMonstersAndProjectiles() {
    this.monsters.forEach((m) => {
      this.scene.remove(m.rig.root);
      m.rig.materialsToDispose.forEach((mat) => mat.dispose());
    });
    this.monsters = [];

    this.knives.forEach((k) => this.scene.remove(k.mesh));
    this.knives = [];

    this.candies.forEach((c) => {
      this.scene.remove(c.mesh);
      c.mesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      });
    });
    this.candies = [];

    this.particles.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    });
    this.particles = [];
  }

  private spawnMonster(forcedKind?: MonsterKind) {
    const vent =
      this.spawnVents[Math.floor(Math.random() * this.spawnVents.length)];
    const kind: MonsterKind =
      forcedKind ??
      (Math.random() < 0.52 ? 'imp' : Math.random() < 0.72 ? 'stalker' : 'golem');

    const rig = createMonsterModel(kind);
    const spawnPos = vent.clone().add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 2.0,
        0,
        (Math.random() - 0.5) * 2.0,
      ),
    );
    rig.root.position.copy(spawnPos);
    this.scene.add(rig.root);

    const maxHp = kind === 'golem' ? 2 : 1;
    const speed = kind === 'imp' ? 4.3 : kind === 'stalker' ? 4.9 : 2.75;
    const hitRadius = kind === 'golem' ? 1.25 : 0.95;
    const damage = kind === 'golem' ? 20 : 12;

    this.monsters.push({
      id: this.monsterIdCounter++,
      kind,
      rig,
      position: spawnPos,
      velocity: new THREE.Vector3(),
      hp: maxHp,
      maxHp,
      speed,
      hitRadius,
      damage,
      animOffset: Math.random() * Math.PI * 2,
      hitFlashTimer: 0,
      attackCooldown: 0.8,
    });

    this.spawnBurst(spawnPos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xff6b1a, 8);
  }

  private spawnBurst(origin: THREE.Vector3, colorHex: number, count: number) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(origin);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 5.5;
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * spd,
          2.2 + Math.random() * 5.2,
          Math.sin(angle) * spd,
        ),
        life: 0.55,
        maxLife: 0.55,
      });
    }
  }

  private throwKnife(clientX?: number, clientY?: number) {
    if (this.phase !== 'playing' && this.phase !== 'parachuting') return;
    if (this.knifeCooldown > 0) return;

    gameAudio.unlock();
    this.knifeCooldown = this.knifeCooldownDuration;
    this.throwAnimTimer = 0.22;
    this.girl.heldKnife.visible = false;

    const handOrigin = this.playerPos
      .clone()
      .add(new THREE.Vector3(0, 1.32, 0));

    // Determine throw direction via pointer raycast + smart monster aim assist
    let aimPoint: THREE.Vector3 | null = null;
    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, this.camera);

      // First check if ray passes close to any monster (generous 3D aim assist!)
      let bestDistToRay = 2.6;
      for (const m of this.monsters) {
        _vA.copy(m.position);
        _vA.y += m.kind === 'stalker' ? 1.45 : m.kind === 'golem' ? 1.15 : 0.78;
        const dRay = _raycaster.ray.distanceToPoint(_vA);
        if (dRay < bestDistToRay) {
          bestDistToRay = dRay;
          aimPoint = _vA.clone();
        }
      }

      if (!aimPoint) {
        _groundPlane.constant = -(this.playerPos.y + 1.0);
        const hit = new THREE.Vector3();
        if (_raycaster.ray.intersectPlane(_groundPlane, hit)) {
          aimPoint = hit;
        }
      }
    } else {
      // Keyboard throw ('F'): auto-target nearest monster within front arc or forward direction
      let bestScore = Infinity;
      for (const m of this.monsters) {
        const d = m.position.distanceTo(this.playerPos);
        if (d < 22 && d < bestScore) {
          bestScore = d;
          aimPoint = m.position
            .clone()
            .add(new THREE.Vector3(0, m.kind === 'stalker' ? 1.45 : 0.95, 0));
        }
      }
    }

    const dir = new THREE.Vector3();
    if (aimPoint) {
      dir.copy(aimPoint).sub(handOrigin);
      if (dir.lengthSq() < 0.01) {
        dir.set(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw));
      } else {
        dir.normalize();
      }
      this.playerYaw = Math.atan2(dir.x, dir.z);
    } else {
      dir.set(Math.sin(this.playerYaw), 0, Math.cos(this.playerYaw)).normalize();
    }

    const knifeMesh = createKnifeModel(this.mats);
    knifeMesh.scale.setScalar(1.35);
    knifeMesh.position.copy(handOrigin).addScaledVector(dir, 0.55);
    knifeMesh.lookAt(knifeMesh.position.clone().add(dir));
    this.scene.add(knifeMesh);

    this.knives.push({
      mesh: knifeMesh,
      velocity: dir.multiplyScalar(38),
      life: 1.4,
    });

    gameAudio.playKnifeThrow();
  }

  private getSurfaceHeightAt(x: number, z: number, currentY: number): number | null {
    let bestY: number | null = null;

    // 1. Central basalt arena floor
    const distFromCenter = Math.hypot(x, z);
    if (distFromCenter <= ISLAND_RADIUS) {
      bestY = 0;
    }

    // 2. Unlocked forged stairs
    for (const s of this.stairs) {
      if (!s.unlocked) continue;
      const bp = s.blueprint;
      const dx = x - bp.position[0];
      const dz = z - bp.position[2];
      const cosR = Math.cos(-bp.rotationY);
      const sinR = Math.sin(-bp.rotationY);
      const localX = dx * cosR - dz * sinR;
      const localZ = dx * sinR + dz * cosR;

      const halfW = bp.width * 0.5 + 0.35;
      const halfD = bp.depth * 0.5 + 0.35;
      if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD) {
        const stepTop = s.mesh.position.y;
        // Only snap onto step if player is near or above step level
        if (currentY >= stepTop - 1.15) {
          if (bestY === null || stepTop > bestY) {
            bestY = stepTop;
          }
        }
      }
    }

    // 3. Summit Exit Platform
    const pDist = Math.hypot(x - this.portalCenter.x, z - this.portalCenter.z);
    if (pDist <= 3.7 && currentY >= this.portalPlatformTopY - 1.3) {
      if (bestY === null || this.portalPlatformTopY > bestY) {
        bestY = this.portalPlatformTopY;
      }
    }

    return bestY;
  }

  private updatePlayer(dt: number, elapsed: number) {
    // Camera yaw via Q/E or Free Fire camera turn buttons
    if (this.keys['KeyQ']) this.cameraYaw += 2.2 * dt;
    if (this.keys['KeyE']) this.cameraYaw -= 2.2 * dt;
    if (this.virtualCamTurn !== 0) {
      this.cameraYaw += this.virtualCamTurn * 2.2 * dt;
    }

    // Movement input relative to camera yaw (keyboard + virtual joystick)
    let inputForward = this.virtualJoyY;
    let inputRight = this.virtualJoyX;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) inputForward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) inputForward -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) inputRight += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) inputRight -= 1;

    _vMove.set(0, 0, 0);
    const inputLen = Math.hypot(inputForward, inputRight);
    if (inputLen > 0.05) {
      const camFwdX = -Math.sin(this.cameraYaw);
      const camFwdZ = -Math.cos(this.cameraYaw);
      const camRightX = Math.cos(this.cameraYaw);
      const camRightZ = -Math.sin(this.cameraYaw);

      _vMove.x = camFwdX * inputForward + camRightX * inputRight;
      _vMove.z = camFwdZ * inputForward + camRightZ * inputRight;
      _vMove.normalize();

      const targetYaw = Math.atan2(_vMove.x, _vMove.z);
      // Smooth yaw interpolation
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * Math.min(1, dt * 14);
    }

    const wantJumpOrDive = Boolean(this.keys['Space'] || this.virtualJump);

    if (this.phase === 'parachuting') {
      const glideSpeed = 9.5;
      this.playerPos.x += _vMove.x * glideSpeed * dt;
      this.playerPos.z += _vMove.z * glideSpeed * dt;

      // Keep inside crater radius
      const r = Math.hypot(this.playerPos.x, this.playerPos.z);
      if (r > 13.5) {
        this.playerPos.x *= 13.5 / r;
        this.playerPos.z *= 13.5 / r;
      }

      const diveBoost = wantJumpOrDive ? -14.5 : -7.6;
      this.playerPos.y += diveBoost * dt;

      // Parachute gentle sway
      this.girl.parachute.rotation.z = Math.sin(elapsed * 2.4) * 0.08 - _vMove.x * 0.1;
      this.girl.parachute.rotation.x = Math.cos(elapsed * 2.0) * 0.06 + _vMove.z * 0.08;
      this.girl.leftLeg.rotation.x = 0.25 + Math.sin(elapsed * 3.5) * 0.12;
      this.girl.rightLeg.rotation.x = -0.15 - Math.sin(elapsed * 3.5) * 0.12;
      this.girl.leftArm.rotation.z = 0.65;
      this.girl.rightArm.rotation.z = -0.65;

      const surfaceY = this.getSurfaceHeightAt(
        this.playerPos.x,
        this.playerPos.z,
        this.playerPos.y,
      );
      if (surfaceY !== null && this.playerPos.y <= surfaceY) {
        this.playerPos.y = surfaceY;
        this.playerVel.y = 0;
        this.onGround = true;
        this.chuteDetached = true;
        this.phase = 'playing';
        this.girl.leftArm.rotation.z = 0;
        this.girl.rightArm.rotation.z = 0;
        this.spawnBurst(this.playerPos.clone(), 0xf59e0b, 14);
        gameAudio.playParachuteLand();
        this.stairBannerText = 'Landed! Throw knives to slay monsters & forge stairs!';
        this.stairBannerTimer = 3.2;
        this.emitHud(true);
      }
    } else if (this.phase === 'playing') {
      // Parachute floats up and vanishes smoothly after landing
      if (this.chuteDetached && this.girl.parachute.visible) {
        this.chuteDetachProgress += dt * 1.4;
        this.girl.parachute.position.y += dt * 7.5;
        this.girl.parachute.scale.setScalar(
          Math.max(0.01, 1 - this.chuteDetachProgress),
        );
        if (this.chuteDetachProgress >= 1) {
          this.girl.parachute.visible = false;
        }
      }

      const moveSpeed = 9.4;
      this.playerPos.x += _vMove.x * moveSpeed * dt;
      this.playerPos.z += _vMove.z * moveSpeed * dt;

      // Clamp to inner volcano wall
      const dist = Math.hypot(this.playerPos.x, this.playerPos.z);
      if (dist > 21.8) {
        this.playerPos.x *= 21.8 / dist;
        this.playerPos.z *= 21.8 / dist;
      }

      // Jump
      if (wantJumpOrDive && this.onGround) {
        this.playerVel.y = 12.2;
        this.onGround = false;
        gameAudio.playJump();
      }

      this.playerVel.y -= 26.5 * dt;
      this.playerPos.y += this.playerVel.y * dt;

      const surfaceY = this.getSurfaceHeightAt(
        this.playerPos.x,
        this.playerPos.z,
        this.playerPos.y,
      );

      if (surfaceY !== null && this.playerPos.y <= surfaceY && this.playerVel.y <= 0) {
        this.playerPos.y = surfaceY;
        this.playerVel.y = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }

      // Lava hazard if falling off island/stairs into molten lake
      if (this.playerPos.y <= -0.95) {
        this.applyPlayerDamage(15);
        // Knock back safely toward central island edge
        const r = Math.hypot(this.playerPos.x, this.playerPos.z) || 1;
        this.playerPos.x = (this.playerPos.x / r) * (ISLAND_RADIUS - 2.0);
        this.playerPos.z = (this.playerPos.z / r) * (ISLAND_RADIUS - 2.0);
        this.playerPos.y = 2.0;
        this.playerVel.y = 7.5;
        this.spawnBurst(this.playerPos.clone(), 0xff4500, 12);
      }

      // Check Victory: All stairs forged AND player reaches Summit Escape Portal!
      if (this.stairsBuilt >= TOTAL_STAIRS) {
        const dPortal = this.playerPos.distanceTo(
          _vA.set(this.portalCenter.x, this.portalPlatformTopY, this.portalCenter.z),
        );
        if (dPortal < 2.35) {
          this.phase = 'victory';
          gameAudio.playVictory();
          this.spawnBurst(this.portalCenter.clone(), 0x38bdf8, 24);
          this.emitHud(true);
        }
      }

      // Character run/idle/throw limb animation
      const moving = _vMove.lengthSq() > 0.01;
      const runCycle = elapsed * 11.5;
      if (!this.onGround) {
        this.girl.leftLeg.rotation.x = 0.35;
        this.girl.rightLeg.rotation.x = -0.3;
      } else if (moving) {
        this.girl.leftLeg.rotation.x = Math.sin(runCycle) * 0.65;
        this.girl.rightLeg.rotation.x = -Math.sin(runCycle) * 0.65;
        this.girl.leftArm.rotation.x = -Math.sin(runCycle) * 0.55;
      } else {
        this.girl.leftLeg.rotation.x = THREE.MathUtils.damp(
          this.girl.leftLeg.rotation.x,
          0,
          10,
          dt,
        );
        this.girl.rightLeg.rotation.x = THREE.MathUtils.damp(
          this.girl.rightLeg.rotation.x,
          0,
          10,
          dt,
        );
        this.girl.leftArm.rotation.x = THREE.MathUtils.damp(
          this.girl.leftArm.rotation.x,
          0,
          10,
          dt,
        );
      }

      if (this.throwAnimTimer > 0) {
        this.throwAnimTimer -= dt;
        this.girl.rightArm.rotation.x = -1.65;
      } else {
        this.girl.rightArm.rotation.x = moving
          ? Math.sin(runCycle) * 0.45
          : THREE.MathUtils.damp(this.girl.rightArm.rotation.x, -0.25, 10, dt);
      }

      this.girl.hairBack.rotation.x = moving ? 0.28 + Math.sin(runCycle * 2) * 0.08 : 0.06;
    }

    // Infinite knife regeneration in her hand
    if (this.knifeCooldown > 0) {
      this.knifeCooldown = Math.max(0, this.knifeCooldown - dt);
      if (this.knifeCooldown === 0 && !this.girl.heldKnife.visible) {
        this.girl.heldKnife.visible = true;
        this.girl.heldKnife.scale.setScalar(0.15);
        gameAudio.playKnifeReturn();
      }
    }
    if (this.girl.heldKnife.visible && this.girl.heldKnife.scale.x < 1.15) {
      const nextScale = Math.min(1.15, this.girl.heldKnife.scale.x + dt * 7.5);
      this.girl.heldKnife.scale.setScalar(nextScale);
    }

    this.girl.root.position.copy(this.playerPos);
    this.girl.root.rotation.y = this.playerYaw;
  }

  private applyPlayerDamage(amount: number) {
    if (this.invulnTimer > 0 || this.phase !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.9;
    this.damageFlash = 1.0;
    gameAudio.playPlayerHurt();

    if (this.hp <= 0) {
      this.phase = 'gameover';
      this.emitHud(true);
    }
  }

  private updateKnives(dt: number) {
    for (let i = this.knives.length - 1; i >= 0; i--) {
      const k = this.knives[i];
      k.life -= dt;
      k.mesh.position.addScaledVector(k.velocity, dt);
      k.mesh.rotateX(dt * 24);

      let hitSomething = false;

      // Check monster hits
      for (let j = this.monsters.length - 1; j >= 0; j--) {
        const m = this.monsters[j];
        _vA.copy(m.position);
        _vA.y += m.kind === 'stalker' ? 1.45 : m.kind === 'golem' ? 1.15 : 0.78;
        if (k.mesh.position.distanceTo(_vA) <= m.hitRadius + 0.35) {
          hitSomething = true;
          m.hp -= 1;
          m.hitFlashTimer = 0.16;
          const killed = m.hp <= 0;
          gameAudio.playMonsterHit(killed);
          this.spawnBurst(_vA.clone(), killed ? 0xfbbf24 : 0xff6b1a, killed ? 14 : 6);

          if (killed) {
            this.scene.remove(m.rig.root);
            m.rig.materialsToDispose.forEach((mat) => mat.dispose());
            this.monsters.splice(j, 1);
            this.onMonsterKilled(_vA.clone());
          } else {
            // Knockback heavy golem slightly
            _vB.copy(k.velocity).setY(0).normalize();
            m.position.addScaledVector(_vB, 0.85);
          }
          break;
        }
      }

      if (hitSomething || k.life <= 0) {
        this.scene.remove(k.mesh);
        this.knives.splice(i, 1);
      }
    }
  }

  private onMonsterKilled(killPos: THREE.Vector3) {
    this.kills += 1;

    // Give them a candy and shout HAVE THIS!
    const candyMesh = createCandyModel(this.mats);
    candyMesh.position.copy(killPos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(candyMesh);
    this.candies.push({
      mesh: candyMesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 3.8, (Math.random() - 0.5) * 2),
      life: 1.8,
    });
    gameAudio.playCandyDrop();
    gameAudio.playLoudHaveThis();

    if (this.stairsBuilt < TOTAL_STAIRS) {
      const stair = this.stairs[this.stairsBuilt];
      stair.unlocked = true;
      stair.mesh.visible = true;
      stair.revealProgress = 0;
      this.stairsBuilt += 1;
      gameAudio.playStairForged(this.stairsBuilt);

      this.spawnBurst(
        new THREE.Vector3(
          stair.blueprint.position[0],
          stair.blueprint.position[1] + 0.4,
          stair.blueprint.position[2],
        ),
        0xfbbf24,
        14,
      );

      if (this.stairsBuilt === TOTAL_STAIRS) {
        this.stairBannerText =
          'HAVE THIS! — All 12 Stairs Forged! Climb to Summit Portal!';
        (this.portalBeaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
      } else {
        this.stairBannerText = `HAVE THIS! — Stair ${this.stairsBuilt} of ${TOTAL_STAIRS} Forged!`;
      }
      this.stairBannerTimer = 3.2;
    } else {
      // Bonus healing ember if all stairs already forged
      this.hp = Math.min(MAX_HP, this.hp + 8);
      this.stairBannerText = 'HAVE THIS! — Summit Portal Open, Escape Now!';
      this.stairBannerTimer = 2.5;
    }

    this.emitHud(true);
  }

  private updateMonsters(dt: number, elapsed: number) {
    // Respawn monsters continuously inside the volcano!
    const targetCap = Math.min(7, 4 + Math.floor(this.stairsBuilt / 3));
    if (this.phase === 'playing' || this.phase === 'parachuting') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.monsters.length < targetCap) {
        this.spawnMonster();
        this.spawnTimer = 2.2;
      } else if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.4;
      }
    }

    for (const m of this.monsters) {
      if (m.attackCooldown > 0) m.attackCooldown -= dt;
      if (m.hitFlashTimer > 0) {
        m.hitFlashTimer -= dt;
        m.rig.coreMesh.scale.setScalar(1.35);
      } else {
        m.rig.coreMesh.scale.setScalar(1.0);
      }

      // Chase player
      _vA.copy(this.playerPos).sub(m.position);
      const flatDist = Math.hypot(_vA.x, _vA.z);
      if (flatDist > 0.25) {
        _vA.y = 0;
        _vA.normalize();
        const chaseFactor = this.phase === 'playing' ? 1.0 : 0.35;
        m.position.x += _vA.x * m.speed * chaseFactor * dt;
        m.position.z += _vA.z * m.speed * chaseFactor * dt;
        m.rig.root.rotation.y = Math.atan2(_vA.x, _vA.z);
      }

      // Keep ground monsters on the basalt arena; flying stalkers can swoop up toward stairs!
      if (m.kind === 'stalker') {
        const targetY =
          this.phase === 'playing'
            ? THREE.MathUtils.clamp(this.playerPos.y, 0.4, 12.5)
            : 1.5;
        m.position.y = THREE.MathUtils.damp(m.position.y, targetY, 2.2, dt);
        m.rig.body.position.y = Math.sin(elapsed * 4.5 + m.animOffset) * 0.28;
        m.rig.leftLimb.rotation.z = Math.sin(elapsed * 12 + m.animOffset) * 0.55;
        m.rig.rightLimb.rotation.z = -Math.sin(elapsed * 12 + m.animOffset) * 0.55;
      } else {
        const r = Math.hypot(m.position.x, m.position.z);
        if (r > ISLAND_RADIUS - 0.8) {
          m.position.x *= (ISLAND_RADIUS - 0.8) / r;
          m.position.z *= (ISLAND_RADIUS - 0.8) / r;
        }
        m.position.y = 0;
        const hop = Math.abs(Math.sin(elapsed * 7 + m.animOffset));
        m.rig.body.position.y = m.kind === 'imp' ? hop * 0.22 : hop * 0.08;
        m.rig.leftLimb.rotation.x = Math.sin(elapsed * 7 + m.animOffset) * 0.45;
        m.rig.rightLimb.rotation.x = -Math.sin(elapsed * 7 + m.animOffset) * 0.45;
      }

      m.rig.root.position.copy(m.position);

      // Melee contact damage
      if (this.phase === 'playing' && m.attackCooldown <= 0) {
        const verticalGap = Math.abs(this.playerPos.y - m.position.y);
        if (flatDist < m.hitRadius + 0.52 && verticalGap < 1.65) {
          m.attackCooldown = 1.05;
          this.applyPlayerDamage(m.damage);
        }
      }
    }
  }

  private updateStairsAndParticles(dt: number, elapsed: number) {
    // Animate newly forged stairs rising smoothly from volcanic depths
    for (const s of this.stairs) {
      if (s.unlocked && s.revealProgress < 1) {
        s.revealProgress = Math.min(1, s.revealProgress + dt * 2.8);
        const eased = 1 - Math.pow(1 - s.revealProgress, 3);
        s.mesh.position.y = THREE.MathUtils.lerp(s.targetY - 4.0, s.targetY, eased);
      }
    }

    // Pulse lava light & portal rotation
    this.mats.lavaUniforms.uTime.value = elapsed;
    const lavaMap = this.mats.lavaSurface.map;
    if (lavaMap) {
      lavaMap.offset.x = elapsed * 0.018;
      lavaMap.offset.y = elapsed * 0.012;
    }
    this.magmaLight.intensity = 3.5 + Math.sin(elapsed * 3.1) * 0.6;
    this.exitPortalGroup.children[3].rotation.z = elapsed * 1.4;

    // Rising volcano embers
    for (let i = 0; i < this.emberPositions.length; i += 3) {
      this.emberPositions[i + 1] += dt * 2.8;
      this.emberPositions[i] += Math.sin(elapsed + i) * dt * 0.4;
      if (this.emberPositions[i + 1] > 35) {
        this.emberPositions[i + 1] = -0.5;
      }
    }
    this.embersPoints.geometry.attributes.position.needsUpdate = true;

    // Burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        p.life / p.maxLife,
      );
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }

    // Active candies given to defeated monsters
    for (let i = this.candies.length - 1; i >= 0; i--) {
      const c = this.candies[i];
      c.life -= dt;
      c.velocity.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.velocity, dt);
      c.mesh.rotation.y += dt * 4.0;
      c.mesh.rotation.z += dt * 2.5;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        c.mesh.traverse((child) => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        });
        this.candies.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number, elapsed: number) {
    if (this.phase === 'title') {
      const orbitA = elapsed * 0.22;
      this.camera.position.set(
        Math.cos(orbitA) * 24,
        15 + Math.sin(elapsed * 0.4) * 2,
        Math.sin(orbitA) * 24,
      );
      this.camera.lookAt(0, 3.5, 0);
      return;
    }

    const camDist = this.phase === 'parachuting' ? 10.5 : 8.6;
    const lookHeight = this.phase === 'parachuting' ? 1.4 : 1.55;

    _vCamTarget.set(
      this.playerPos.x,
      this.playerPos.y + lookHeight,
      this.playerPos.z,
    );

    const horizDist = Math.cos(this.cameraPitch) * camDist;
    const vertDist = Math.sin(this.cameraPitch) * camDist;

    _vCamDesired.set(
      _vCamTarget.x + Math.sin(this.cameraYaw) * horizDist,
      _vCamTarget.y + vertDist,
      _vCamTarget.z + Math.cos(this.cameraYaw) * horizDist,
    );

    const dampFactor = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(_vCamDesired, dampFactor);
    this.camera.lookAt(_vCamTarget);
  }

  private emitHud(force = false) {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 70) return;
    this.lastHudEmit = now;

    this.onHudUpdate({
      phase: this.phase,
      hp: Math.ceil(this.hp),
      maxHp: MAX_HP,
      stairsBuilt: this.stairsBuilt,
      totalStairs: TOTAL_STAIRS,
      kills: this.kills,
      knifeReady: this.knifeCooldown <= 0,
      knifeChargeProgress:
        1 - this.knifeCooldown / this.knifeCooldownDuration,
      altitude: Math.max(0, Math.round(this.playerPos.y * 10) / 10),
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      damageFlash: this.damageFlash,
      stairBannerText: this.stairBannerTimer > 0 ? this.stairBannerText : null,
      portalUnlocked: this.stairsBuilt >= TOTAL_STAIRS,
      activeMonsters: this.monsters.length,
      muted: gameAudio.isMuted(),
      webglError: this.webglError,
    });
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;

      const rawDelta = this.clock.getDelta();
      const dt = Math.min(rawDelta, 0.05);
      const elapsed = this.clock.elapsedTime;

      if (this.phase !== 'paused') {
        if (this.phase === 'playing' || this.phase === 'parachuting') {
          this.elapsedSeconds += dt;
        }
        if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
        if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
        if (this.stairBannerTimer > 0) {
          this.stairBannerTimer = Math.max(0, this.stairBannerTimer - dt);
        }

        if (
          this.phase === 'parachuting' ||
          this.phase === 'playing'
        ) {
          this.updatePlayer(dt, elapsed);
          this.updateKnives(dt);
          this.updateMonsters(dt, elapsed);
        }
        this.updateStairsAndParticles(dt, elapsed);
        this.updateCamera(dt, elapsed);
        this.emitHud(false);
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'KeyF') {
      this.throwKnife();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      this.togglePause();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      this.isDraggingCamera = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }
    if (e.button === 0) {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.isDraggingCamera = false;
      this.isPrimaryDragging = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const primaryDragMoved =
      this.isPrimaryDragging &&
      Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      ) >= 10;

    if (this.isDraggingCamera || primaryDragMoved || (e.buttons & 2) !== 0) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.cameraYaw -= dx * 0.007;
      this.cameraPitch = THREE.MathUtils.clamp(
        this.cameraPitch + dy * 0.005,
        0.16,
        1.05,
      );
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      this.isDraggingCamera = false;
      return;
    }
    if (e.button === 0) {
      const dragDist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (dragDist < 10 && this.isPrimaryDragging) {
        this.throwKnife(e.clientX, e.clientY);
      }
      this.isDraggingCamera = false;
      this.isPrimaryDragging = false;
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.webglError = 'WebGL rendering context was interrupted.';
    this.emitHud(true);
  };

  private onContextRestored = () => {
    this.webglError = null;
    this.emitHud(true);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('contextmenu', this.onContextMenu);
      canvas.removeEventListener('webglcontextlost', this.onContextLost);
      canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.clearMonstersAndProjectiles();
      this.mats.dispose();
      this.envRT?.dispose();
      this.renderer.dispose();
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
    }
  }
}
