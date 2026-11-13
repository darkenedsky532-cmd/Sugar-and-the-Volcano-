import * as THREE from 'three';

export interface GameMaterialLibrary {
  basaltRock: THREE.MeshStandardMaterial;
  volcanoWall: THREE.MeshStandardMaterial;
  obsidianTrim: THREE.MeshStandardMaterial;
  lavaSurface: THREE.MeshStandardMaterial;
  stairStep: THREE.MeshStandardMaterial;
  stairRune: THREE.MeshStandardMaterial;
  portalStone: THREE.MeshStandardMaterial;
  portalRing: THREE.MeshStandardMaterial;
  knifeBlade: THREE.MeshPhysicalMaterial;
  knifeGuard: THREE.MeshStandardMaterial;
  knifeHandle: THREE.MeshStandardMaterial;
  parachuteCanopy: THREE.MeshStandardMaterial;
  parachuteCord: THREE.MeshStandardMaterial;
  girlSkin: THREE.MeshStandardMaterial;
  girlHair: THREE.MeshStandardMaterial;
  girlTop: THREE.MeshStandardMaterial;
  girlTopAccent: THREE.MeshStandardMaterial;
  girlShorts: THREE.MeshStandardMaterial;
  girlBoots: THREE.MeshStandardMaterial;
  clipLavender: THREE.MeshStandardMaterial;
  clipPink: THREE.MeshStandardMaterial;
  candyWrapper: THREE.MeshPhysicalMaterial;
  candySwirl: THREE.MeshStandardMaterial;
  eyeWhite: THREE.MeshStandardMaterial;
  eyeIris: THREE.MeshStandardMaterial;
  lavaUniforms: { uTime: { value: number } };
  dispose: () => void;
}

function makeBasaltTexture(maxAniso: number): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  ctx.fillStyle = '#252124';
  ctx.fillRect(0, 0, size, size);

  // Cracked volcanic stone grain
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 4;
    const shade = 26 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${shade + 4}, ${shade}, ${shade + 2})`;
    ctx.fillRect(x, y, r, r);
  }

  // Subtle mineral veins
  ctx.strokeStyle = 'rgba(255, 110, 45, 0.08)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 18; c++) {
    let px = Math.random() * size;
    let py = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let s = 0; s < 6; s++) {
      px += (Math.random() - 0.5) * 90;
      py += (Math.random() - 0.5) * 90;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2400; i++) {
    const v = 140 + Math.floor(Math.random() * 110);
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(Math.random() * size, Math.random() * size, 5, 5);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(4, 4);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAniso;

  return { map, roughnessMap };
}

function makeLavaTexture(maxAniso: number): {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
} {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    20,
    size / 2,
    size / 2,
    size * 0.7,
  );
  grad.addColorStop(0, '#ff9f1c');
  grad.addColorStop(0.5, '#e8481d');
  grad.addColorStop(1, '#7a190a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Molten swirling cells
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 10 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
    if (i % 3 === 0) {
      g.addColorStop(0, 'rgba(255, 224, 110, 0.85)');
      g.addColorStop(0.5, 'rgba(255, 102, 24, 0.5)');
      g.addColorStop(1, 'rgba(80, 12, 5, 0)');
    } else {
      g.addColorStop(0, 'rgba(42, 14, 12, 0.82)');
      g.addColorStop(0.7, 'rgba(95, 22, 12, 0.45)');
      g.addColorStop(1, 'rgba(255, 90, 20, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const emissiveMap = new THREE.CanvasTexture(canvas);
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.set(6, 6);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = maxAniso;

  return { map, emissiveMap };
}

function makeParachuteTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const stripes = 8;
  const sw = size / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f43f5e' : '#f8fafc';
    ctx.fillRect(i * sw, 0, sw + 1, size);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.fillRect(i * sw, 0, 3, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createGameMaterialLibrary(
  renderer: THREE.WebGLRenderer,
): GameMaterialLibrary {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const basaltTex = makeBasaltTexture(maxAniso);
  textures.push(basaltTex.map, basaltTex.roughnessMap);

  const lavaTex = makeLavaTexture(maxAniso);
  textures.push(lavaTex.map, lavaTex.emissiveMap);

  const chuteTex = makeParachuteTexture(maxAniso);
  textures.push(chuteTex);

  const lavaUniforms = { uTime: { value: 0 } };

  const basaltRock = trackMat(
    new THREE.MeshStandardMaterial({
      map: basaltTex.map,
      roughnessMap: basaltTex.roughnessMap,
      color: 0x574c4f,
      roughness: 0.88,
      metalness: 0.08,
    }),
  );

  const volcanoWall = trackMat(
    new THREE.MeshStandardMaterial({
      map: basaltTex.map,
      roughnessMap: basaltTex.roughnessMap,
      color: 0x3b3033,
      roughness: 0.94,
      metalness: 0.05,
    }),
  );

  const obsidianTrim = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c181d,
      roughness: 0.34,
      metalness: 0.55,
    }),
  );

  const lavaSurface = trackMat(
    new THREE.MeshStandardMaterial({
      map: lavaTex.map,
      emissiveMap: lavaTex.emissiveMap,
      emissive: new THREE.Color(0xff5a18),
      emissiveIntensity: 2.1,
      roughness: 0.38,
      metalness: 0.12,
    }),
  );

  lavaSurface.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = lavaUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float wave = sin(position.x * 0.28 + uTime * 1.6) * cos(position.z * 0.25 + uTime * 1.2);
         transformed.y += wave * 0.16;`,
      );
  };

  const stairStep = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x29252e,
      roughness: 0.42,
      metalness: 0.48,
    }),
  );

  const stairRune = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: new THREE.Color(0xf59e0b),
      emissiveIntensity: 1.9,
      roughness: 0.25,
      metalness: 0.7,
    }),
  );

  const portalStone = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x332d38,
      roughness: 0.65,
      metalness: 0.3,
    }),
  );

  const portalRing = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.8,
    }),
  );

  const knifeBlade = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.16,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    }),
  );

  const knifeGuard = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.28,
    }),
  );

  const knifeHandle = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e1b22,
      metalness: 0.1,
      roughness: 0.82,
    }),
  );

  const parachuteCanopy = trackMat(
    new THREE.MeshStandardMaterial({
      map: chuteTex,
      roughness: 0.72,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );

  const parachuteCord = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.6,
      metalness: 0.2,
    }),
  );

  // Girl Protagonist materials faithful to uploaded character art
  const girlSkin = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4cbb8,
      roughness: 0.62,
      metalness: 0.02,
    }),
  );

  const girlHair = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4f362d,
      roughness: 0.56,
      metalness: 0.08,
    }),
  );

  const girlTop = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x26262e,
      roughness: 0.78,
      metalness: 0.05,
    }),
  );

  const girlTopAccent = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf2b5c4,
      roughness: 0.7,
      metalness: 0.05,
    }),
  );

  const girlShorts = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1c1e26,
      roughness: 0.82,
      metalness: 0.06,
    }),
  );

  const girlBoots = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b2c2a,
      roughness: 0.45,
      metalness: 0.25,
    }),
  );

  const clipLavender = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb8b4e3,
      roughness: 0.28,
      metalness: 0.15,
    }),
  );

  const clipPink = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe8798a,
      roughness: 0.28,
      metalness: 0.15,
    }),
  );

  const candyWrapper = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf43f5e,
      roughness: 0.2,
      metalness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    }),
  );

  const candySwirl = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.3,
      metalness: 0.1,
    }),
  );

  const eyeWhite = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.0,
    }),
  );

  const eyeIris = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b5553,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );

  return {
    basaltRock,
    volcanoWall,
    obsidianTrim,
    lavaSurface,
    stairStep,
    stairRune,
    portalStone,
    portalRing,
    knifeBlade,
    knifeGuard,
    knifeHandle,
    parachuteCanopy,
    parachuteCord,
    girlSkin,
    girlHair,
    girlTop,
    girlTopAccent,
    girlShorts,
    girlBoots,
    clipLavender,
    clipPink,
    candyWrapper,
    candySwirl,
    eyeWhite,
    eyeIris,
    lavaUniforms,
    dispose: () => {
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
