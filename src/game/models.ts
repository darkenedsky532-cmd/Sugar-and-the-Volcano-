import * as THREE from 'three';
import type { GameMaterialLibrary } from './materials';
import type { MonsterKind, StairBlueprint } from './types';

export interface GirlRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  hairBack: THREE.Group;
  heldKnife: THREE.Group;
  parachute: THREE.Group;
}

export interface MonsterRig {
  root: THREE.Group;
  body: THREE.Group;
  leftLimb: THREE.Object3D;
  rightLimb: THREE.Object3D;
  coreMesh: THREE.Mesh;
  materialsToDispose: THREE.Material[];
}

function makeBoneClip(material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.036, 0.025), material);
  g.add(bar);
  const knobGeo = new THREE.SphereGeometry(0.026, 8, 8);
  const offsets: [number, number][] = [
    [-0.068, 0.018],
    [-0.068, -0.018],
    [0.068, 0.018],
    [0.068, -0.018],
  ];
  offsets.forEach(([ox, oy]) => {
    const knob = new THREE.Mesh(knobGeo, material);
    knob.position.set(ox, oy, 0);
    g.add(knob);
  });
  return g;
}

export function createKnifeModel(mats: GameMaterialLibrary): THREE.Group {
  const knife = new THREE.Group();

  // Extruded beveled dagger blade pointing along +Z
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.032);
  bladeShape.lineTo(0.28, -0.024);
  bladeShape.lineTo(0.39, 0);
  bladeShape.lineTo(0.28, 0.024);
  bladeShape.lineTo(0, 0.032);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  bladeGeo.center();
  const blade = new THREE.Mesh(bladeGeo, mats.knifeBlade);
  blade.rotation.y = -Math.PI / 2;
  blade.position.z = 0.19;
  blade.castShadow = true;
  knife.add(blade);

  // Brass crossguard
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.028, 0.026),
    mats.knifeGuard,
  );
  guard.position.z = 0.0;
  knife.add(guard);

  // Wrapped handle
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.021, 0.14, 10),
    mats.knifeHandle,
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -0.08;
  knife.add(handle);

  // Pommel ring
  const pommel = new THREE.Mesh(
    new THREE.TorusGeometry(0.024, 0.006, 8, 14),
    mats.knifeGuard,
  );
  pommel.position.z = -0.165;
  knife.add(pommel);

  return knife;
}

export function createCandyModel(mats: GameMaterialLibrary): THREE.Group {
  const candy = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 12),
    mats.candyWrapper,
  );
  body.scale.set(1.25, 0.82, 0.82);
  body.castShadow = true;
  candy.add(body);

  [-0.32, 0.32].forEach((x) => {
    const end = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.28, 8),
      mats.candySwirl,
    );
    end.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    end.position.set(x, 0, 0);
    candy.add(end);
  });
  return candy;
}

export function createGirlCharacter(mats: GameMaterialLibrary): GirlRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Legs (bottom-center grounded at y = 0)
  const makeLeg = (xOffset: number): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(xOffset, 0.84, 0);

    const thigh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.34, 6, 10),
      mats.girlSkin,
    );
    thigh.position.y = -0.24;
    thigh.castShadow = true;
    hip.add(thigh);

    const sock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.068, 0.14, 10),
      mats.girlTopAccent,
    );
    sock.position.y = -0.5;
    hip.add(sock);

    const boot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.088, 0.24, 10),
      mats.girlBoots,
    );
    boot.position.y = -0.68;
    boot.castShadow = true;
    hip.add(boot);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.07, 0.23),
      mats.obsidianTrim,
    );
    sole.position.set(0, -0.805, 0.035);
    sole.castShadow = true;
    hip.add(sole);

    return hip;
  };

  const leftLeg = makeLeg(-0.125);
  const rightLeg = makeLeg(0.125);
  body.add(leftLeg, rightLeg);

  // Shorts / waist
  const shorts = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.22, 0.24, 14),
    mats.girlShorts,
  );
  shorts.position.y = 0.88;
  shorts.castShadow = true;
  body.add(shorts);

  // Torso (dark tank top + pink accent trim)
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.165, 0.44, 14),
    mats.girlTop,
  );
  torso.position.y = 1.2;
  torso.castShadow = true;
  body.add(torso);

  const pinkStrap = new THREE.Mesh(
    new THREE.TorusGeometry(0.165, 0.022, 8, 16),
    mats.girlTopAccent,
  );
  pinkStrap.rotation.x = Math.PI / 2 - 0.18;
  pinkStrap.position.y = 1.36;
  body.add(pinkStrap);

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.178, 0.178, 0.05, 14),
    mats.girlTopAccent,
  );
  belt.position.y = 1.0;
  body.add(belt);

  // Arms
  const makeArm = (xOffset: number): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(xOffset, 1.37, 0);

    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.056, 0.36, 6, 10),
      mats.girlSkin,
    );
    arm.position.y = -0.22;
    arm.castShadow = true;
    shoulder.add(arm);

    const wristBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10),
      mats.girlTop,
    );
    wristBand.position.y = -0.38;
    shoulder.add(wristBand);

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 10, 10),
      mats.girlSkin,
    );
    hand.position.y = -0.45;
    shoulder.add(hand);

    return shoulder;
  };

  const leftArm = makeArm(-0.245);
  const rightArm = makeArm(0.245);
  body.add(leftArm, rightArm);

  // Throwing knife held in right hand
  const heldKnife = createKnifeModel(mats);
  heldKnife.scale.setScalar(1.15);
  heldKnife.position.set(0, -0.46, 0.08);
  heldKnife.rotation.x = Math.PI / 2;
  rightArm.add(heldKnife);

  // Head & iconic hair + clips from reference portrait
  const head = new THREE.Group();
  head.position.set(0, 1.48, 0);
  body.add(head);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.075, 0.14, 10),
    mats.girlSkin,
  );
  neck.position.y = 0.04;
  head.add(neck);

  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 16),
    mats.girlSkin,
  );
  skull.scale.set(1.0, 1.04, 0.96);
  skull.position.y = 0.25;
  skull.castShadow = true;
  head.add(skull);

  // Ears
  [-0.23, 0.23].forEach((ex) => {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 8, 8),
      mats.girlSkin,
    );
    ear.scale.set(0.6, 1, 0.7);
    ear.position.set(ex, 0.23, -0.02);
    head.add(ear);
  });

  // Eyes (facing +Z)
  [-0.088, 0.088].forEach((ex) => {
    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.044, 10, 10),
      mats.eyeWhite,
    );
    sclera.scale.set(1.1, 0.8, 0.5);
    sclera.position.set(ex, 0.25, 0.21);
    head.add(sclera);

    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 10),
      mats.eyeIris,
    );
    iris.scale.set(1, 1, 0.55);
    iris.position.set(ex, 0.248, 0.225);
    head.add(iris);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, 0.015, 0.018),
      mats.girlHair,
    );
    brow.position.set(ex, 0.315, 0.222);
    brow.rotation.z = ex < 0 ? -0.14 : 0.14; // Determined expression!
    head.add(brow);
  });

  // Cute lip
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 8),
    mats.girlSkin,
  );
  nose.position.set(0, 0.215, 0.242);
  head.add(nose);

  const lip = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    mats.clipPink,
  );
  lip.scale.set(1.3, 0.55, 0.45);
  lip.position.set(0, 0.155, 0.228);
  head.add(lip);

  // Dark chestnut hair crown + side locks + flowing back hair
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.262, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mats.girlHair,
  );
  hairCap.position.set(0, 0.27, -0.02);
  hairCap.rotation.x = -0.18;
  hairCap.castShadow = true;
  head.add(hairCap);

  // Side framing locks
  [-0.22, 0.22].forEach((hx) => {
    const sideLock = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.068, 0.34, 6, 8),
      mats.girlHair,
    );
    sideLock.position.set(hx, 0.08, 0.04);
    sideLock.rotation.z = hx < 0 ? 0.12 : -0.12;
    sideLock.castShadow = true;
    head.add(sideLock);
  });

  const hairBack = new THREE.Group();
  hairBack.position.set(0, 0.24, -0.16);
  const backSheet = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.54, 0.16),
    mats.girlHair,
  );
  backSheet.position.y = -0.22;
  backSheet.castShadow = true;
  hairBack.add(backSheet);

  const backTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.22, 8),
    mats.girlHair,
  );
  backTip.rotation.x = Math.PI;
  backTip.scale.set(1, 1, 0.45);
  backTip.position.y = -0.58;
  hairBack.add(backTip);
  head.add(hairBack);

  // Signature Lavender & Coral-Pink Bone Hairclips on her bangs!
  const clip1 = makeBoneClip(mats.clipLavender);
  clip1.position.set(-0.035, 0.435, 0.215);
  clip1.rotation.set(-0.42, -0.1, 0.22);
  head.add(clip1);

  const clip2 = makeBoneClip(mats.clipPink);
  clip2.position.set(0.095, 0.395, 0.212);
  clip2.rotation.set(-0.38, 0.25, -0.35);
  head.add(clip2);

  // Parachute Canopy + Suspension Cords
  const parachute = new THREE.Group();
  parachute.position.set(0, 1.35, 0);

  const canopyGeo = new THREE.SphereGeometry(
    1.75,
    24,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.46,
  );
  const canopy = new THREE.Mesh(canopyGeo, mats.parachuteCanopy);
  canopy.position.y = 2.05;
  canopy.scale.set(1.1, 0.72, 1.1);
  canopy.castShadow = true;
  parachute.add(canopy);

  const canopyRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.045, 8, 28),
    mats.obsidianTrim,
  );
  canopyRim.rotation.x = Math.PI / 2;
  canopyRim.position.y = 2.15;
  parachute.add(canopyRim);

  // 8 suspension cords connecting rim to backpack shoulders
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const topX = Math.cos(angle) * 1.82;
    const topZ = Math.sin(angle) * 1.82;
    const botX = Math.cos(angle) * 0.18;
    const botZ = Math.sin(angle) * 0.14;

    const pTop = new THREE.Vector3(topX, 2.18, topZ);
    const pBot = new THREE.Vector3(botX, 0.08, botZ);
    const dist = pTop.distanceTo(pBot);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, dist, 5),
      mats.parachuteCord,
    );
    cord.position.copy(pTop).add(pBot).multiplyScalar(0.5);
    cord.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pTop.clone().sub(pBot).normalize(),
    );
    parachute.add(cord);
  }

  root.add(parachute);

  return {
    root,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    hairBack,
    heldKnife,
    parachute,
  };
}

export function createMonsterModel(kind: MonsterKind): MonsterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const disposables: THREE.Material[] = [];
  const makeMat = (params: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(params);
    disposables.push(m);
    return m;
  };

  const obsidianSkin = makeMat({
    color: kind === 'golem' ? 0x261f24 : kind === 'stalker' ? 0x2f1c2b : 0x331f1e,
    roughness: 0.78,
    metalness: 0.18,
  });

  const magmaCoreMat = makeMat({
    color: kind === 'stalker' ? 0xfb7185 : 0xff6b1a,
    emissive: new THREE.Color(kind === 'stalker' ? 0xe11d48 : 0xff4500),
    emissiveIntensity: 2.3,
    roughness: 0.25,
    metalness: 0.1,
  });

  const hornMat = makeMat({
    color: 0x161216,
    roughness: 0.3,
    metalness: 0.65,
  });

  if (kind === 'imp') {
    const torso = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.46, 0),
      obsidianSkin,
    );
    torso.position.y = 0.68;
    torso.scale.set(0.95, 1.15, 0.85);
    torso.castShadow = true;
    body.add(torso);

    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      magmaCoreMat,
    );
    coreMesh.position.set(0, 0.68, 0.24);
    body.add(coreMesh);

    const head = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      obsidianSkin,
    );
    head.position.set(0, 1.16, 0.08);
    head.castShadow = true;
    body.add(head);

    [-0.14, 0.14].forEach((hx) => {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.34, 6),
        hornMat,
      );
      horn.position.set(hx, 1.44, 0.04);
      horn.rotation.z = hx < 0 ? 0.35 : -0.35;
      horn.rotation.x = -0.2;
      body.add(horn);

      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        magmaCoreMat,
      );
      eye.position.set(hx * 0.75, 1.2, 0.32);
      body.add(eye);
    });

    const leftLimb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.34, 5, 8),
      obsidianSkin,
    );
    leftLimb.position.set(-0.46, 0.72, 0.12);
    leftLimb.rotation.z = 0.35;
    leftLimb.castShadow = true;
    body.add(leftLimb);

    const rightLimb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.34, 5, 8),
      obsidianSkin,
    );
    rightLimb.position.set(0.46, 0.72, 0.12);
    rightLimb.rotation.z = -0.35;
    rightLimb.castShadow = true;
    body.add(rightLimb);

    [-0.18, 0.18].forEach((lx) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.08, 0.42, 7),
        obsidianSkin,
      );
      leg.position.set(lx, 0.21, 0);
      leg.castShadow = true;
      body.add(leg);
    });

    return {
      root,
      body,
      leftLimb,
      rightLimb,
      coreMesh,
      materialsToDispose: disposables,
    };
  }

  if (kind === 'golem') {
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.92, 0.74),
      obsidianSkin,
    );
    chest.position.y = 1.28;
    chest.castShadow = true;
    body.add(chest);

    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      magmaCoreMat,
    );
    coreMesh.position.set(0, 1.28, 0.36);
    body.add(coreMesh);

    const head = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.34, 0),
      obsidianSkin,
    );
    head.position.set(0, 1.88, 0.08);
    head.castShadow = true;
    body.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.08, 0.12),
      magmaCoreMat,
    );
    visor.position.set(0, 1.9, 0.34);
    body.add(visor);

    const makeGolemArm = (x: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.56, 0);
      const pauldron = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.3, 0),
        obsidianSkin,
      );
      pauldron.castShadow = true;
      pivot.add(pauldron);

      const forearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.72, 0.32),
        obsidianSkin,
      );
      forearm.position.y = -0.52;
      forearm.castShadow = true;
      pivot.add(forearm);

      const fistGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.22, 0.24),
        magmaCoreMat,
      );
      fistGlow.position.y = -0.88;
      pivot.add(fistGlow);
      return pivot;
    };

    const leftLimb = makeGolemArm(-0.76);
    const rightLimb = makeGolemArm(0.76);
    body.add(leftLimb, rightLimb);

    [-0.28, 0.28].forEach((lx) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.78, 0.36),
        obsidianSkin,
      );
      leg.position.set(lx, 0.39, 0);
      leg.castShadow = true;
      body.add(leg);
    });

    return {
      root,
      body,
      leftLimb,
      rightLimb,
      coreMesh,
      materialsToDispose: disposables,
    };
  }

  // Winged Cinder Stalker (flapping wings, hovers smoothly)
  const torso = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 1.05, 7),
    obsidianSkin,
  );
  torso.rotation.x = Math.PI / 2;
  torso.position.y = 1.45;
  torso.castShadow = true;
  body.add(torso);

  const coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 10),
    magmaCoreMat,
  );
  coreMesh.position.set(0, 1.45, 0.22);
  body.add(coreMesh);

  [-0.11, 0.11].forEach((ex) => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      magmaCoreMat,
    );
    eye.position.set(ex, 1.54, 0.45);
    body.add(eye);
  });

  const makeWing = (side: number): THREE.Group => {
    const wingPivot = new THREE.Group();
    wingPivot.position.set(side * 0.25, 1.5, 0.05);

    const membrane = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.04, 0.56),
      obsidianSkin,
    );
    membrane.position.x = side * 0.48;
    membrane.castShadow = true;
    wingPivot.add(membrane);

    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.05, 0.07),
      magmaCoreMat,
    );
    vein.position.set(side * 0.45, 0, 0.22);
    wingPivot.add(vein);

    return wingPivot;
  };

  const leftLimb = makeWing(-1);
  const rightLimb = makeWing(1);
  body.add(leftLimb, rightLimb);

  return {
    root,
    body,
    leftLimb,
    rightLimb,
    coreMesh,
    materialsToDispose: disposables,
  };
}

export function generateStairBlueprints(totalStairs: number): StairBlueprint[] {
  // Spiral ascending staircase climbing from caldera floor (r=8.5, y=0.95)
  // up along the inner volcano rim to the sunlit Escape Rim Terrace (r=18.2, y=11.4)
  const steps: StairBlueprint[] = [];
  for (let i = 0; i < totalStairs; i++) {
    const t = i / (totalStairs - 1);
    const angle = -Math.PI * 0.65 + t * Math.PI * 1.42;
    const radius = 8.4 + t * 9.8;
    const y = 0.95 + i * 0.95;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Face tangent direction along ascending spiral
    const nextAngle = angle + 0.08;
    const nextR = radius + 0.45;
    const dx = Math.cos(nextAngle) * nextR - x;
    const dz = Math.sin(nextAngle) * nextR - z;
    const rotationY = Math.atan2(dx, dz);

    steps.push({
      index: i,
      position: [x, y, z],
      rotationY,
      width: 3.6,
      depth: 2.75,
      thickness: 0.46,
    });
  }
  return steps;
}

export function createStairStepMesh(
  bp: StairBlueprint,
  mats: GameMaterialLibrary,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(bp.position[0], bp.position[1], bp.position[2]);
  g.rotation.y = bp.rotationY;

  // Main basalt slab (top surface at local y = 0)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(bp.width, bp.thickness, bp.depth),
    mats.stairStep,
  );
  slab.position.y = -bp.thickness / 2;
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);

  // Glowing golden-amber edge runes on left and right sides
  [-bp.width / 2 + 0.14, bp.width / 2 - 0.14].forEach((sx) => {
    const rune = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, bp.depth * 0.88),
      mats.stairRune,
    );
    rune.position.set(sx, -0.02, 0);
    g.add(rune);
  });

  // Under-support corbel bracket
  const support = new THREE.Mesh(
    new THREE.ConeGeometry(bp.width * 0.36, 1.35, 4),
    mats.obsidianTrim,
  );
  support.rotation.x = Math.PI;
  support.rotation.y = Math.PI / 4;
  support.position.y = -bp.thickness - 0.65;
  g.add(support);

  return g;
}

export function createExitPortal(
  lastStair: StairBlueprint,
  mats: GameMaterialLibrary,
): { group: THREE.Group; portalCenter: THREE.Vector3; platformTopY: number } {
  const dirX = Math.sin(lastStair.rotationY);
  const dirZ = Math.cos(lastStair.rotationY);
  const platformCenter = new THREE.Vector3(
    lastStair.position[0] + dirX * 3.8,
    lastStair.position[1] + 0.55,
    lastStair.position[2] + dirZ * 3.8,
  );

  const group = new THREE.Group();
  group.position.copy(platformCenter);
  group.rotation.y = lastStair.rotationY;

  // Summit rock balcony platform
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 2.8, 1.2, 10),
    mats.basaltRock,
  );
  deck.position.y = -0.6;
  deck.receiveShadow = true;
  deck.castShadow = true;
  group.add(deck);

  // Twin obsidian archway pillars
  [-1.7, 1.7].forEach((px) => {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 3.8, 0.75),
      mats.portalStone,
    );
    pillar.position.set(px, 1.9, 0.3);
    pillar.castShadow = true;
    group.add(pillar);
  });

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.65, 0.9),
    mats.portalStone,
  );
  lintel.position.set(0, 3.9, 0.3);
  lintel.castShadow = true;
  group.add(lintel);

  // Glowing Sky-Escape Ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.14, 12, 32),
    mats.portalRing,
  );
  ring.position.set(0, 2.0, 0.3);
  group.add(ring);

  return {
    group,
    portalCenter: platformCenter.clone().add(new THREE.Vector3(0, 1.8, 0)),
    platformTopY: platformCenter.y,
  };
}
