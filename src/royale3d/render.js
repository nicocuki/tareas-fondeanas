// Royale 3D: el dibujo con Three.js. Se carga con `import()` recién al entrar a una partida (ver
// Royale3DGame.jsx): no lo importes desde nada que cargue la portada. Estilo «low poly»: caras planas, colores
// lindos, sombras y efectos, todo armado con código (sin modelos ni imágenes). No toca el estado del juego.
import * as THREE from 'three';
import { noise, segDist } from './map.js';
import { RARITIES } from './sim.js';
import {
  TIER_COLORS, animateAvatar, avatarModel, beam, boxGeo, busModel, chestModel, dropModel, drawTag, holdWeapon, itemModel, mat, matFor, rampGeo, ring, texture, weaponModel,
} from './models.js';

const SKY_TOP = new THREE.Color(0x3c8fe0);
const SKY_HORIZON = new THREE.Color(0xcfe6f7);
const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.38).normalize();
const R90 = Math.PI / 2;

// ─── Colores del terreno ─────────────────────────────────────────────────────
const PLACE_TINT = { polvorin: 0xdcc690, judia: 0x86633a, frontera: 0x9d8d6e, penasco: 0x8d9094, arboleada: 0x3f8f3c, muelle: 0xdcc690, villa: 0x9a8d6d, cover: 0x57b04f, puente: 0x5da545, ciudad: 0xa9a49a, barrio: 0x7fbf5a, pueblo: 0xb39d76, fabrica: 0x8f8b84, estacion: 0x9c968c };
const DIRT = new THREE.Color(0xb4925f), ASPHALT = new THREE.Color(0x4a4d52);
const SAND = new THREE.Color(0xe6d49d), GRASS_A = new THREE.Color(0x73c04c), GRASS_B = new THREE.Color(0x4f9a3a), ROCK = new THREE.Color(0x8b8d85), SNOW = new THREE.Color(0xeef3f5), SEABED = new THREE.Color(0x2f7fa6), SHALLOW = new THREE.Color(0x58b6c8);
const tint = new THREE.Color();
const CAR_COLORS = [0xd94141, 0x3f7fd9, 0xf2c94c, 0xf2f2f2, 0x2d9c6a, 0x2b2b2b];
const DEEP = new THREE.Color(0x1a5a85);

export function terrainColor(w, x, z, h, out) {
  const n = noise(w.seed + 55, x / 4.5, z / 4.5), n2 = noise(w.seed + 77, x / 14, z / 14);
  if (h < -0.4) out.copy(SEABED).lerp(SHALLOW, Math.max(0, Math.min(1, (h + 3) / 2.6)));
  else if (h < 0.55) out.copy(SAND).multiplyScalar(0.95 + n * 0.1);
  else if (h < 7.5) out.copy(GRASS_A).lerp(GRASS_B, Math.min(1, n2 * 1.2 + (h - 1) * 0.04)).multiplyScalar(0.92 + n * 0.14);
  else if (h < 12) out.copy(ROCK).lerp(GRASS_B, Math.max(0, (9 - h) / 3)).multiplyScalar(0.9 + n * 0.2);
  else out.copy(SNOW);
  if (h > 0.3) {
    for (const p of w.places) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 0.95) { tint.set(PLACE_TINT[p.id] || 0xffffff); out.lerp(tint, Math.min(1, (p.r * 0.95 - d) / 5) * 0.85); }
    }
    for (const r of w.roads || []) { const d = segDist(x, z, r); if (d < r.w) out.lerp(DIRT, Math.min(1, (r.w - d) / 1.2) * 0.8); }
    for (const st of w.streets || []) if (Math.abs(x - st.x) < st.w / 2 && Math.abs(z - st.z) < st.d / 2) out.copy(ASPHALT);
  }
  return out;
}

function buildTerrain(w) {
  const half = w.worldR + 16, step = w.kind === 'lobby' ? 1 : 1.5;
  const n = Math.round((half * 2) / step);
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  geo.rotateX(-R90);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = w.height(x, z);
    pos.setY(i, h);
    terrainColor(w, x, z, h, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

// Un dibujo de arriba de toda la isla para el mapa: terreno, lugares y nombres. `size` en píxeles.
export function drawWorldMap(w, size = 360) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const c = new THREE.Color();
  const R = w.worldR;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * 2 * R, z = (py / size - 0.5) * 2 * R;
      const h = w.height(x, z);
      terrainColor(w, x, z, h, c);
      if (h < 0) c.set(0x2a78a8).lerp(DEEP, Math.min(1, -h / 3));
      const shade = 0.88 + Math.max(-0.25, Math.min(0.25, (w.height(x + 1.5, z + 1.5) - h) * -0.35));
      const i = (py * size + px) * 4;
      img.data[i] = Math.min(255, c.r * 255 * shade); img.data[i + 1] = Math.min(255, c.g * 255 * shade); img.data[i + 2] = Math.min(255, c.b * 255 * shade); img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Construcciones y árboles, como manchitas.
  g.fillStyle = 'rgba(40,90,40,0.55)';
  for (const t of w.trees) g.fillRect(((t.x / R) * 0.5 + 0.5) * size - 1, ((t.z / R) * 0.5 + 0.5) * size - 1, 2.4, 2.4);
  g.fillStyle = 'rgba(70,40,20,0.9)';
  for (const s of w.solids) if (s.wall) g.fillRect(((s.x0 / R) * 0.5 + 0.5) * size, ((s.z0 / R) * 0.5 + 0.5) * size, Math.max(1.4, ((s.x1 - s.x0) / R) * 0.5 * size), Math.max(1.4, ((s.z1 - s.z0) / R) * 0.5 * size));
  return cv;
}

// ─── El agua ─────────────────────────────────────────────────────────────────
function makeWater() {
  const geo = new THREE.PlaneGeometry(4000, 4000, 160, 160);
  geo.rotateX(-R90);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uFog: { value: SKY_HORIZON.clone() } },
    vertexShader: `
      uniform float uTime; varying vec3 vWorld; varying vec3 vN;
      float wave(vec2 p, float t) { return sin(p.x * 0.35 + t * 1.2) * 0.09 + sin(p.y * 0.5 - t * 1.6) * 0.07 + sin((p.x + p.y) * 0.9 + t * 2.1) * 0.035; }
      void main() {
        vec3 p = position; float e = 0.6;
        float h = wave(p.xz, uTime);
        p.y += h;
        float hx = wave(p.xz + vec2(e, 0.0), uTime), hz = wave(p.xz + vec2(0.0, e), uTime);
        vN = normalize(vec3(h - hx, e * 0.55, h - hz));
        vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uSun; uniform vec3 uFog; uniform float uTime; varying vec3 vWorld; varying vec3 vN;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(V, vN), 0.0), 3.0);
        vec3 deep = vec3(0.03, 0.30, 0.52), shallow = vec3(0.13, 0.66, 0.78);
        float rad = length(vWorld.xz);
        vec3 col = mix(shallow, deep, smoothstep(40.0, 130.0, rad));
        col = mix(col, vec3(0.7, 0.88, 1.0), fres * 0.55);
        vec3 H = normalize(uSun + V);
        col += vec3(1.0, 0.95, 0.8) * pow(max(dot(vN, H), 0.0), 140.0) * 1.2;
        float foam = smoothstep(0.78, 1.0, sin(rad * 0.05 + uTime * 0.2) * 0.0 + (1.0 - smoothstep(0.0, 8.0, abs(rad - 84.0)))) * 0.0;
        col += foam;
        float d = length(vWorld - cameraPosition);
        col = mix(col, uFog, smoothstep(180.0, 520.0, d));
        gl_FragColor = vec4(col, mix(0.78, 0.96, smoothstep(30.0, 110.0, rad)));
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -0.04;
  mesh.renderOrder = 1;
  return mesh;
}

// ─── El cielo ────────────────────────────────────────────────────────────────
function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: SKY_TOP }, uHor: { value: SKY_HORIZON }, uSun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHor, uTop, pow(h, 0.55));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.86, 0.6) * (pow(s, 600.0) * 3.0 + pow(s, 16.0) * 0.28);
        col = mix(col, uHor * 0.93, smoothstep(0.0, -0.12, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function makeClouds() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x6d7f94 }), count);
  const d = new THREE.Object3D();
  const items = [];
  let i = 0;
  for (let c = 0; c < 26 && i < count; c++) {
    const cx = (noise(3, c * 7.3, 1) - 0.5) * 760, cz = (noise(5, c * 5.1, 9) - 0.5) * 760, cy = 80 + noise(9, c, 3) * 60;
    for (let b = 0; b < 5 && i < count; b++, i++) {
      const s = 9 + noise(11, c + b, 2) * 14;
      d.position.set(cx + (b - 2) * s * 0.9, cy + (b % 2) * 2, cz + (noise(13, c, b) - 0.5) * s);
      d.scale.set(s, s * 0.5, s * 0.8);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      items.push({ x: d.position.x, y: d.position.y, z: d.position.z, sx: s, sy: s * 0.5, sz: s * 0.8 });
    }
  }
  mesh.count = i;
  mesh.userData = { items, d };
  mesh.frustumCulled = false;
  return mesh;
}

// ─── Partículas ──────────────────────────────────────────────────────────────
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 400 };
    this.mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; vC = color; }',
      fragmentShader: 'varying vec4 vC; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.12, d)); }',
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  // Suma `count` partículas. `o`: { x, y, z, spread (posición), speed, up, color (hex), color2, size, grow, life, grav, drag, dx, dy, dz (velocidad base) }
  emit(count, o) {
    const c1 = new THREE.Color(o.color ?? 0xffffff), c2 = new THREE.Color(o.color2 ?? o.color ?? 0xffffff);
    const tmpc = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      const sp = o.spread || 0, sv = o.speed || 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * sp; this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * sp; this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * sp;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * (o.cone ?? 1.2);
      this.vel[i * 3] = (o.dx || 0) + Math.cos(a) * Math.cos(e) * sv * Math.random();
      this.vel[i * 3 + 1] = (o.dy || 0) + (Math.sin(e) * sv + (o.up || 0)) * (0.5 + Math.random() * 0.5);
      this.vel[i * 3 + 2] = (o.dz || 0) + Math.sin(a) * Math.cos(e) * sv * Math.random();
      this.life[i] = this.maxLife[i] = (o.life || 0.6) * (0.7 + Math.random() * 0.6);
      this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 1.2;
      tmpc.copy(c1).lerp(c2, Math.random());
      this.c0.set([tmpc.r, tmpc.g, tmpc.b], i * 3);
      this.s0[i] = (o.size || 0.3) * (0.7 + Math.random() * 0.6); this.grow[i] = o.grow || 0;
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4] = this.c0[i * 3]; this.col[i * 4 + 1] = this.c0[i * 3 + 1]; this.col[i * 4 + 2] = this.c0[i * 3 + 2]; this.col[i * 4 + 3] = Math.min(1, k * 1.6);
      this.size[i] = this.s0[i] * (1 + this.grow[i] * (1 - k));
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
    return alive;
  }
}

// ─── El renderer ─────────────────────────────────────────────────────────────
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), 110, 460);
  const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 700);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x738a52, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -48; sc.right = sc.top = 48; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const sky = makeSky(), water = makeWater(), clouds = makeClouds();
  scene.add(sky, water, clouds);

  const soft = new Particles(1400, false), glow = new Particles(1400, true);
  scene.add(soft.mesh, glow.mesh);

  // La tormenta: una pared violeta que se achica y gira.
  const stormTex = texture('storm').clone();
  stormTex.needsUpdate = true;
  stormTex.repeat.set(10, 1);
  const stormWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 220, 120, 1, true),
    new THREE.MeshBasicMaterial({ map: stormTex, color: 0xb070ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  stormWall.position.y = 60;
  stormWall.renderOrder = 5;
  const stormGround = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 120), new THREE.MeshBasicMaterial({ color: 0xd9a8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  stormGround.rotation.x = -R90;
  stormGround.position.y = 0.4;
  scene.add(stormWall, stormGround);

  let worldGroup = new THREE.Group();
  scene.add(worldGroup);
  let world = null;
  const meshById = new Map();      // sólidos con malla propia
  const treeRefs = new Map();      // árboles: id -> [{ mesh, index }]
  const dummy = new THREE.Object3D();
  const avatars = new Map();
  const chests = new Map(), loots = new Map(), drops = new Map(), projs = new Map();
  const tracers = [], flashes = [], blasts = [];
  let bus = null;
  let ghostMesh = null, ghostKey = '';
  let time = 0, shake = 0;
  let slowFrames = 0, lowQuality = false;
  const glowTex = texture('glow');

  const dust = { 'ground': [0xcdb98a, 0xa8946a], 'water': [0xffffff, 0x9fd8ff], 'wood': [0xb98a54, 0x8a5f2e], 'stone': [0xb9bcc2, 0x8d9096], 'flesh': [0xff5a5f, 0xc02030], 'tree': [0x9a6a3a, 0x3f8f3c], 'sand': [0xe6d49d, 0xcbb78a], 'metal': [0xdde3e8, 0xffe9a0], 'build': [0xe2ba78, 0xb98a54], 'crate': [0xc28b4a, 0x7a4a1e], 'rock': [0xb9bcc2, 0x8d9096], 'floor': [0xb98a54, 0x8a5f2e] };

  function disposeObj(o) {
    o.traverse((c) => { if (c.geometry && !c.userData.shared) c.geometry.dispose(); });
  }

  // ─── El mundo ──────────────────────────────────────────────────────────────
  function setWorld(w) {
    if (worldGroup) { scene.remove(worldGroup); disposeObj(worldGroup); }
    meshById.clear(); treeRefs.clear();
    for (const m of chests.values()) scene.remove(m.group); chests.clear();
    for (const m of loots.values()) scene.remove(m.group); loots.clear();
    for (const m of drops.values()) scene.remove(m.group); drops.clear();
    world = w;
    worldGroup = new THREE.Group();
    worldGroup.add(buildTerrain(w));
    buildSolids(w);
    buildTrees(w);
    buildProps(w);
    scene.add(worldGroup);
    w.onBreak = onBreak;
    water.position.y = -0.04;
  }

  function addSolidMesh(s) {
    let m = null;
    if (s.k === 'box') {
      const ww = s.x1 - s.x0, hh = s.y1 - s.y0, dd = s.z1 - s.z0;
      m = new THREE.Mesh(boxGeo(ww, hh, dd, s.mat === 'crate' ? Math.max(ww, dd, hh) : 2), matFor(s.mat));
      m.position.set((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
      if (s.roof) {
        const g = new THREE.Group();
        g.add(m);
        if (s.gable) {
          const hip = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), mat(s.rc ?? (s.mat === 'stone' ? 0x6c6f78 : 0xb6492f), { flatShading: true }));
          hip.rotation.y = Math.PI / 4;
          const rh = 2.3;
          hip.scale.set((s.ww || ww) / Math.SQRT2, rh, (s.dd || dd) / Math.SQRT2);
          hip.position.set(m.position.x, s.y1 + rh / 2 - 0.02, m.position.z);
          hip.castShadow = hip.receiveShadow = true;
          g.add(hip);
        }
        m = g;
      }
    } else if (s.k === 'ramp') {
      m = new THREE.Mesh(rampGeo(s.x1 - s.x0, s.z1 - s.z0, s.rise), matFor('build'));
      m.position.set((s.x0 + s.x1) / 2, s.y0, (s.z0 + s.z1) / 2);
      m.rotation.y = -s.dir * R90;
    }
    if (!m) return null;
    m.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    worldGroup.add(m);
    meshById.set(s.id, m);
    return m;
  }
  const buildSolids = (w) => { for (const s of w.solids) if (!s.dead && s.k !== 'cyl' && !s.hide) addSolidMesh(s); };

  function buildTrees(w) {
    const pines = w.trees.filter((t) => !t.palm && t.kind === 'pine'), rounds = w.trees.filter((t) => !t.palm && t.kind !== 'pine'), palms = w.trees.filter((t) => t.palm);
    const trunkG = new THREE.CylinderGeometry(0.3, 0.46, 1, 7), coneG = new THREE.ConeGeometry(1, 1, 8), blobG = new THREE.IcosahedronGeometry(1, 1);
    const mk = (geo, count, color) => { const m = new THREE.InstancedMesh(geo, mat(color), Math.max(1, count)); m.castShadow = m.receiveShadow = true; m.userData.shared = true; m.count = count; return m; };
    const trunks = mk(trunkG, w.trees.length, 0x7a5230);
    const c1 = mk(coneG, pines.length, 0xffffff), c2 = mk(coneG, pines.length, 0xffffff), c3 = mk(coneG, pines.length, 0xffffff);
    const blobs = mk(blobG, rounds.length * 2 + palms.length * 3, 0xffffff);
    const color = new THREE.Color();
    let ti = 0, bi = 0;
    const put = (mesh, idx, id, x, y, z, sx, sy, sz, ry = 0) => {
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, 0); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      if (!treeRefs.has(id)) treeRefs.set(id, []);
      treeRefs.get(id).push({ mesh, index: idx });
    };
    const trunk = (t, hh) => { put(trunks, ti, t.id, t.x, t.y + hh / 2 - 0.2, t.z, 1, hh, 1); ti++; };
    pines.forEach((t, i) => {
      trunk(t, t.h * 0.6);
      const base = new THREE.Color(0x2e8a4e).offsetHSL((t.k - 0.5) * 0.04, 0, (t.k - 0.5) * 0.08);
      for (const [mesh, f, rr, hh, sh] of [[c1, 0.34, 2.2, 0.5, 0], [c2, 0.58, 1.75, 0.42, 0.06], [c3, 0.8, 1.2, 0.36, 0.12]]) {
        put(mesh, i, t.id, t.x, t.y + t.h * f + t.h * hh * 0.5, t.z, rr * (0.85 + t.k * 0.3), t.h * hh, rr * (0.85 + t.k * 0.3), t.k * 6);
        mesh.setColorAt(i, color.copy(base).offsetHSL(0, 0, sh));
      }
    });
    rounds.forEach((t) => {
      trunk(t, t.h * 0.55);
      const base = new THREE.Color(0x4aa851).offsetHSL((t.k - 0.5) * 0.06, 0, (t.k - 0.5) * 0.1);
      put(blobs, bi, t.id, t.x, t.y + t.h * 0.72, t.z, 2.3 + t.k, 1.9 + t.k * 0.6, 2.3 + t.k); blobs.setColorAt(bi++, base);
      put(blobs, bi, t.id, t.x + 0.8, t.y + t.h * 0.95, t.z - 0.5, 1.5, 1.3, 1.5); blobs.setColorAt(bi++, color.copy(base).offsetHSL(0, 0, 0.07));
    });
    palms.forEach((t) => {
      trunk(t, t.h);
      for (let k = 0; k < 3; k++) { put(blobs, bi, t.id, t.x + Math.cos(k * 2.1) * 0.9, t.y + t.h + 0.1, t.z + Math.sin(k * 2.1) * 0.9, 1.8, 0.35, 0.7, k * 2.1); blobs.setColorAt(bi++, color.set(0x3fae4a).offsetHSL(0, 0, k * 0.04)); }
    });
    for (const m of [trunks, c1, c2, c3, blobs]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; worldGroup.add(m); }
  }

  function buildProps(w) {
    const rocks = w.props.filter((p) => p.k === 'rock'), bushes = w.props.filter((p) => p.k === 'bush'), flowers = w.props.filter((p) => p.k === 'flowers');
    const mkI = (geo, list, mt, fn) => {
      const m = new THREE.InstancedMesh(geo, mt, Math.max(1, list.length));
      m.userData.shared = true; m.count = list.length; m.castShadow = true; m.receiveShadow = true;
      list.forEach((p, i) => { fn(p, i, m); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      worldGroup.add(m);
      return m;
    };
    const col = new THREE.Color();
    mkI(new THREE.DodecahedronGeometry(1, 0), rocks, mat(0xffffff), (p, i, m) => { dummy.position.set(p.x, p.y + p.h * 0.45, p.z); dummy.scale.set(p.r, p.h * 0.6, p.r); dummy.rotation.set(p.rot, p.rot * 2, 0); m.setColorAt(i, col.set(0x8c8f91).offsetHSL(0, 0, ((p.rot * 7) % 1) * 0.12 - 0.06)); });
    mkI(new THREE.IcosahedronGeometry(0.6, 0), bushes, mat(0xffffff), (p, i, m) => { dummy.position.set(p.x, p.y + 0.3 * p.s, p.z); dummy.scale.set(p.s * 1.2, p.s * 0.8, p.s * 1.2); dummy.rotation.set(0, p.c * 6, 0); m.setColorAt(i, col.set(0x3f9a46).offsetHSL((p.c - 0.5) * 0.05, 0, (p.c - 0.5) * 0.12)); });
    const fc = [0xff6b9a, 0xffd23f, 0xffffff, 0xb07cff];
    mkI(new THREE.IcosahedronGeometry(0.18, 0), flowers, mat(0xffffff), (p, i, m) => { dummy.position.set(p.x, p.y + 0.3, p.z); dummy.scale.set(p.s, p.s, p.s); dummy.rotation.set(0, 0, 0); m.setColorAt(i, col.set(fc[Math.floor(p.c * 4) % 4])); });

    // Chacra: plantitas en filas.
    const crops = w.props.filter((p) => p.k === 'crops');
    if (crops.length) {
      const plants = [];
      for (const c of crops) for (let x = 0; x < c.w; x += 1) plants.push({ x: c.x - c.w / 2 + x + 0.5, z: c.z, y: c.y });
      mkI(new THREE.ConeGeometry(0.35, 0.9, 5), plants, mat(0xffffff), (p, i, m) => { dummy.position.set(p.x, p.y + 0.4, p.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, i, 0); m.setColorAt(i, col.set(i % 5 === 0 ? 0xe7c840 : 0x4faa3f)); });
    }
    // Calles: asfalto con la línea del medio punteada.
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x45484d, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const paint = new THREE.MeshBasicMaterial({ color: 0xf2e6a0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const st of w.streets || []) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(st.w, st.d), asphalt);
      m.rotation.x = -R90; m.position.set(st.x, st.y, st.z); m.receiveShadow = true;
      worldGroup.add(m);
      const along = st.w > st.d, L = Math.max(st.w, st.d);
      if (Math.min(st.w, st.d) < 5) continue;
      for (let t = -L / 2 + 1.5; t < L / 2 - 1; t += 4) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(along ? 2 : 0.25, along ? 0.25 : 2), paint);
        d.rotation.x = -R90; d.position.set(st.x + (along ? t : 0), st.y + 0.01, st.z + (along ? 0 : t));
        worldGroup.add(d);
      }
    }
    for (const p of w.props) {
      if (p.k === 'well') {
        const g = new THREE.Group();
        const ringM = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 1.1, 14), matFor('stone'));
        ringM.position.y = 0.55;
        const water2 = new THREE.Mesh(new THREE.CircleGeometry(1.0, 14), new THREE.MeshBasicMaterial({ color: 0x2b78b5 }));
        water2.rotation.x = -R90; water2.position.y = 1.02;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), mat(0xb6492f));
        roof.rotation.y = Math.PI / 4; roof.position.y = 3.4;
        g.add(ringM, water2, roof);
        for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), matFor('wood')); post.position.set(sx * 1.1, 2.0, 0); g.add(post); }
        g.position.set(p.x, p.y, p.z);
        g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
        worldGroup.add(g);
      } else if (p.k === 'field') {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 308;
        const g = cv.getContext('2d');
        for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#4f9d47' : '#5aae52'; g.fillRect((i * 512) / 12, 0, 512 / 12, 308); }
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.strokeRect(10, 10, 492, 288);
        g.beginPath(); g.moveTo(256, 10); g.lineTo(256, 298); g.stroke();
        g.beginPath(); g.arc(256, 154, 44, 0, Math.PI * 2); g.stroke();
        g.strokeRect(10, 90, 70, 128); g.strokeRect(432, 90, 70, 128);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshLambertMaterial({ map: t }));
        m.rotation.x = -R90; m.position.set(p.x, p.y, p.z); m.receiveShadow = true;
        worldGroup.add(m);
      } else if (p.k === 'goal') {
        const net = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, wireframe: false }));
        net.rotation.y = R90; net.position.set(p.x + p.dir * 1.3, p.y + 1.2, p.z);
        worldGroup.add(net);
      } else if (p.k === 'pier') {
        const len = Math.max(p.x1 - p.x0, p.z1 - p.z0), horiz = p.x1 - p.x0 > p.z1 - p.z0;
        for (let t = 0; t <= len; t += 5) for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.4, 6), matFor('wood'));
          post.position.set(horiz ? p.x0 + t : (p.x0 + p.x1) / 2 + side * 1.5, p.y - 1.3, horiz ? (p.z0 + p.z1) / 2 + side * 1.5 : p.z0 + t);
          post.castShadow = true;
          worldGroup.add(post);
        }
      } else if (p.k === 'bridge') {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6), matFor('wood'));
          post.position.set(p.x + sx * (p.w / 2 - 0.4), p.y - 1.4, p.z + sz * (p.d / 2 - 0.3));
          worldGroup.add(post);
        }
      } else if (p.k === 'car') {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 1.9), mat(CAR_COLORS[p.c % CAR_COLORS.length]));
        body.position.y = 0.65;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 1.7), mat(0x9fc7e0));
        cab.position.set(-0.2, 1.35, 0);
        g.add(body, cab);
        for (const sx of [-1.3, 1.3]) for (const sz of [-0.95, 0.95]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), mat(0x222222)); wh.rotation.x = R90; wh.position.set(sx, 0.38, sz); g.add(wh); }
        g.rotation.y = p.rot ? R90 : 0;
        g.position.set(p.x, p.y, p.z);
        g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        worldGroup.add(g);
      } else if (p.k === 'fountain') {
        const g = new THREE.Group();
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.6, 20), matFor('stone')); basin.position.y = 0.3;
        const pool = new THREE.Mesh(new THREE.CircleGeometry(2.9, 20), new THREE.MeshBasicMaterial({ color: 0x3f9ad6 })); pool.rotation.x = -R90; pool.position.y = 0.58;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 10), matFor('stone')); col.position.y = 1.3;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.6, 0.4, 14), matFor('stone')); bowl.position.y = 2.6;
        g.add(basin, pool, col, bowl); g.position.set(p.x, p.y, p.z);
        g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
        worldGroup.add(g);
      } else if (p.k === 'spire') {
        const m = new THREE.Mesh(new THREE.ConeGeometry(2.3, 4.5, 4), mat(0x5c5f66, { flatShading: true }));
        m.rotation.y = Math.PI / 4; m.position.set(p.x, p.y + 2.25, p.z); m.castShadow = true;
        worldGroup.add(m);
      } else if (p.k === 'chimney') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, p.h + 0.5, 12), matFor('brick'));
        m.position.set(p.x, p.y + p.h / 2 - 0.25, p.z); m.castShadow = true;
        worldGroup.add(m);
      } else if (p.k === 'pump') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), mat(0xd23b3b));
        m.position.set(p.x, p.y + 0.8, p.z); m.castShadow = true;
        worldGroup.add(m);
      } else if (p.k === 'sign') {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 256;
        const g = cv.getContext('2d');
        g.fillStyle = '#7a4a24'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#c28b4a'; g.fillRect(10, 10, 492, 236);
        g.fillStyle = '#3a2410'; g.font = 'bold 50px Inter, sans-serif'; g.textAlign = 'center';
        g.fillText('ISLA DE ESPERA', 256, 100); g.font = 'bold 30px Inter, sans-serif';
        g.fillText('Probá tu arma: acá no duele', 256, 160); g.fillText('Ya sale el bus 🚌', 256, 210);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
        m.position.set(p.x, 3.3, p.z); worldGroup.add(m);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.3, 0.2), matFor('wood')); post.position.set(p.x, 1.65, p.z); worldGroup.add(post);
      }
    }
  }

  // Se rompió un sólido: se saca la malla (o el árbol) y salen astillas.
  function onBreak(s) {
    const m = meshById.get(s.id);
    if (m) { worldGroup.remove(m); meshById.delete(s.id); }
    const refs = treeRefs.get(s.id);
    if (refs) {
      for (const r of refs) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -50, 0); dummy.updateMatrix(); r.mesh.setMatrixAt(r.index, dummy.matrix); r.mesh.instanceMatrix.needsUpdate = true; }
    }
    const cx = s.k === 'cyl' ? s.cx : (s.x0 + s.x1) / 2, cz = s.k === 'cyl' ? s.cz : (s.z0 + s.z1) / 2, cy = (s.y0 + s.y1) / 2;
    const [c1, c2] = dust[s.mat] || dust.wood;
    const big = s.k === 'cyl' ? 20 : Math.min(36, 10 + Math.round(((s.x1 - s.x0) * (s.z1 - s.z0) + (s.y1 - s.y0)) * 1.5));
    soft.emit(big, { x: cx, y: cy, z: cz, spread: s.k === 'cyl' ? 1.2 : 2.6, speed: 5.5, up: 3.5, color: c1, color2: c2, size: 0.38, life: 0.9, grav: 12, drag: 0.8 });
    soft.emit(6, { x: cx, y: cy, z: cz, spread: 1, speed: 2, up: 1, color: 0xcfc6b0, size: 1.1, grow: 1.5, life: 0.9, grav: -0.3, drag: 1.4 });
  }

  // ─── Personajes ────────────────────────────────────────────────────────────
  function setAvatar(id, info) {
    let a = avatars.get(id);
    if (!info || info.dead || info.hidden) { if (a) a.visible = false; return; }
    if (!a) { a = avatarModel(info.color, info.skin || 0); a.traverse((c) => { if (c.isMesh) c.castShadow = true; }); scene.add(a); avatars.set(id, a); }
    a.visible = true;
    a.position.set(info.x, info.y, info.z);
    a.rotation.y = info.yaw;
    holdWeapon(a, info.kind, info.r || 0);
    drawTag(a, info.name, info.hp ?? 100, info.shield ?? 0, info.tagColor);
    a.userData.tag.visible = !info.self;
    animateAvatar(a, info.dt || 0.016, { ...info, t: time });
  }
  const muzzleOf = (id) => {
    const a = avatars.get(id);
    const m = a?.userData.weapon?.userData.muzzle;
    if (!m) return null;
    const v = new THREE.Vector3();
    m.getWorldPosition(v);
    return { x: v.x, y: v.y, z: v.z };
  };
  const handOf = (id) => { const a = avatars.get(id); if (!a) return null; const v = new THREE.Vector3(); a.userData.hand.getWorldPosition(v); return { x: v.x, y: v.y, z: v.z }; };

  // ─── Cofres, objetos del piso, cofres del cielo y proyectiles ─────────────
  function syncChests(list) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c.i);
      let e = chests.get(c.i);
      if (!e) {
        const g = chestModel(c.tier, false);
        g.position.set(c.x, c.y, c.z);
        g.rotation.y = ((c.i * 2654435761) % 628) / 100;
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        scene.add(g);
        e = { group: g, beam: null, open: false, lid: 0 };
        chests.set(c.i, e);
      }
      const want = c.open ? 1 : 0;
      e.lid += (want - e.lid) * 0.2;
      e.group.userData.lid.rotation.x = -e.lid * 1.9;
      if (!c.open && !e.beam && c.tier >= 2) { e.beam = beam(TIER_COLORS[c.tier], 6); e.group.add(e.beam); e.group.add(ring(TIER_COLORS[c.tier], 1.2)); }
      if (c.open && e.beam) { e.group.remove(e.beam); e.beam = null; }
    }
    for (const [i, e] of chests) if (!seen.has(i)) { scene.remove(e.group); chests.delete(i); }
  }

  function syncLoot(list) {
    const seen = new Set();
    for (const it of list) {
      seen.add(it.key);
      let e = loots.get(it.key);
      if (!e) {
        const g = new THREE.Group();
        const color = it.r != null && WEAPON_KINDS.has(it.kind) ? RARITIES[it.r || 0].color : it.kind === 'medkit' ? '#ff5a5f' : it.kind === 'bandage' ? '#ffffff' : it.kind === 'grenade' ? '#7fbf4a' : '#4aa0ff';
        const model = WEAPON_KINDS.has(it.kind) ? weaponModel(it.kind, it.r || 0) : itemModel(it.kind);
        model.scale.setScalar(WEAPON_KINDS.has(it.kind) ? 1.25 : 1.4);
        model.position.y = 0.95;
        g.add(model, beam(color, 4.5), ring(color, 0.8));
        g.position.set(it.x, it.y, it.z);
        scene.add(g);
        e = { group: g, model, phase: Math.random() * 6 };
        loots.set(it.key, e);
      }
    }
    for (const [k, e] of loots) if (!seen.has(k)) { scene.remove(e.group); loots.delete(k); }
  }

  function syncDrops(list) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.i);
      let e = drops.get(d.i);
      if (!e) {
        const g = dropModel();
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const b = beam(0xffc233, 90);
        b.material.opacity = 0.22;
        g.add(b);
        scene.add(g);
        e = { group: g, beam: b, smoke: 0 };
        drops.set(d.i, e);
      }
      e.group.position.set(d.x, d.y, d.z);
      e.group.userData.chute.visible = !d.landed;
      e.group.rotation.y += 0.002;
      e.group.visible = !d.open;
      e.landed = d.landed;
      e.pos = d;
    }
    for (const [i, e] of drops) if (!seen.has(i)) { scene.remove(e.group); drops.delete(i); }
  }

  function syncProjectiles(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let e = projs.get(p.id);
      if (!e) {
        const g = new THREE.Group();
        if (p.kind === 'rocket') {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), mat(0x7b8a5a)); body.rotation.x = R90;
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), mat(0xd04a3a)); tip.rotation.x = -R90; tip.position.z = -0.57;
          g.add(body, tip);
        } else {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(p.kind === 'launcher' ? 0x59623e : 0x4a5d34));
          const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), mat(0xcccccc)); r2.rotation.x = R90;
          g.add(b, r2);
        }
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        scene.add(g);
        e = { group: g };
        projs.set(p.id, e);
      }
      e.group.position.set(p.x, p.y, p.z);
      if (p.kind === 'rocket') { e.group.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz); glow.emit(2, { x: p.x - p.vx * 0.02, y: p.y - p.vy * 0.02, z: p.z - p.vz * 0.02, spread: 0.15, speed: 0.6, color: 0xffb347, color2: 0xff5a1a, size: 0.5, life: 0.35, drag: 2 }); soft.emit(1, { x: p.x, y: p.y, z: p.z, spread: 0.2, speed: 0.3, color: 0xcfcfcf, color2: 0x888888, size: 0.7, grow: 2.2, life: 0.9, drag: 1 }); } else e.group.rotation.set(p.spin || 0, p.spin || 0, 0);
    }
    for (const [id, e] of projs) if (!seen.has(id)) { scene.remove(e.group); projs.delete(id); }
  }

  // ─── Construcción: pieza fantasma y piezas nuevas ─────────────────────────
  function ghost(piece, ok) {
    if (!piece) { if (ghostMesh) ghostMesh.visible = false; return; }
    const d = piece.def;
    const key = `${piece.kind}:${(d.x1 - d.x0).toFixed(2)}:${(d.y1 ?? d.y0 + d.rise) - d.y0}:${(d.z1 - d.z0).toFixed(2)}`;
    if (!ghostMesh || ghostKey !== key) {
      if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.geometry.dispose(); }
      const geo = d.k === 'ramp' ? rampGeo(d.x1 - d.x0, d.z1 - d.z0, d.rise) : new THREE.BoxGeometry(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0);
      ghostMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
      ghostMesh.renderOrder = 8;
      scene.add(ghostMesh);
      ghostKey = key;
    }
    ghostMesh.visible = true;
    ghostMesh.material.color.set(ok ? 0x4ade80 : 0xff5a5f);
    if (d.k === 'ramp') { ghostMesh.position.set((d.x0 + d.x1) / 2, d.y0, (d.z0 + d.z1) / 2); ghostMesh.rotation.y = -d.dir * R90; } else { ghostMesh.position.set((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2); ghostMesh.rotation.y = 0; }
  }

  // ─── Efectos ───────────────────────────────────────────────────────────────
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  function tracer(from, to, o = {}) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: o.color ?? 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (len < 0.5) return;
    const w = o.width || 0.045;
    // La estela es un tramo corto que viaja de la boca al impacto.
    const seg = Math.min(len, o.seg || 14);
    m.userData = { from, to, len, seg, age: 0, life: Math.min(0.22, 0.05 + len / 900), w };
    m.scale.set(w, w, seg);
    m.renderOrder = 7;
    scene.add(m);
    tracers.push(m);
  }
  function muzzleFlash(pos, big = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set(pos.x, pos.y, pos.z);
    s.scale.setScalar(0.9 * big);
    s.userData = { age: 0, life: 0.06, size: 0.9 * big };
    scene.add(s);
    flashes.push(s);
  }
  function impact(pos, kind = 'ground', n = 8) {
    const [c1, c2] = dust[kind] || dust.ground;
    if (kind === 'water') { soft.emit(n, { x: pos.x, y: pos.y, z: pos.z, spread: 0.2, speed: 2.5, up: 4, color: c1, color2: c2, size: 0.3, life: 0.7, grav: 14, drag: 0.5 }); return; }
    soft.emit(n, { x: pos.x, y: pos.y, z: pos.z, spread: 0.2, speed: 3, up: 2.5, color: c1, color2: c2, size: 0.24, life: 0.55, grav: 14, drag: 0.8 });
    if (kind === 'stone' || kind === 'metal' || kind === 'flesh') glow.emit(Math.ceil(n / 2), { x: pos.x, y: pos.y, z: pos.z, spread: 0.1, speed: 5, up: 1.5, color: kind === 'flesh' ? 0xff8a8a : 0xffe39a, size: 0.14, life: 0.3, grav: 10 });
  }
  function explosion(pos, radius = 5) {
    const k = radius / 5;
    glow.emit(40, { x: pos.x, y: pos.y, z: pos.z, spread: 1.2, speed: 11 * k, up: 3, color: 0xffd25a, color2: 0xff5a1a, size: 1.3 * k, grow: -0.4, life: 0.55, drag: 2.2, cone: 3 });
    soft.emit(34, { x: pos.x, y: pos.y + 0.4, z: pos.z, spread: 2, speed: 5 * k, up: 2.2, color: 0x4a4540, color2: 0x8a8580, size: 2 * k, grow: 2, life: 1.6, grav: -0.6, drag: 1.1, cone: 2 });
    soft.emit(36, { x: pos.x, y: pos.y, z: pos.z, spread: 1.4, speed: 12 * k, up: 6, color: 0x7a5a30, color2: 0xcdb98a, size: 0.4, life: 1.0, grav: 16, drag: 0.5, cone: 2.4 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flash.position.set(pos.x, pos.y, pos.z);
    flash.userData = { age: 0, life: 0.35, r: radius };
    scene.add(flash);
    const shock = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 36), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    shock.rotation.x = -R90;
    shock.position.set(pos.x, Math.max(pos.y, world ? world.height(pos.x, pos.z) : 0) + 0.15, pos.z);
    shock.userData = { age: 0, life: 0.45, r: radius * 1.15 };
    scene.add(shock);
    blasts.push(flash, shock);
    shake = Math.max(shake, Math.min(1, radius / 7));
  }
  function bump(amount) { shake = Math.max(shake, amount); }
  const project = (x, y, z, w = canvas.clientWidth, h = canvas.clientHeight) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  };

  // El bus: se pone (o se saca con null).
  function setBus(b) {
    if (!b) { if (bus) { scene.remove(bus); bus = null; } return; }
    if (!bus) { bus = busModel(); bus.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(bus); }
    bus.position.set(b.x, b.y, b.z);
    bus.rotation.y = b.yaw;
  }

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  // `cam`: { pos, yaw, pitch, fov }; `storm`: { x, z, r } o null; `focus`: adónde sigue la sombra.
  function draw(cam, storm, dt, focus) {
    time += dt;
    const t0 = performance.now();
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.rotation.set(cam.pitch, cam.yaw, 0);
    if (shake > 0.001) {
      const s = shake * 0.18;
      camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
      shake *= Math.exp(-6 * dt);
    }
    if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov += (cam.fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
    water.material.uniforms.uTime.value = time;
    water.position.x = Math.round(camera.position.x / 50) * 50; water.position.z = Math.round(camera.position.z / 50) * 50;
    sun.position.set(focus.x + SUN_DIR.x * 120, focus.y + SUN_DIR.y * 120, focus.z + SUN_DIR.z * 120);
    sun.target.position.set(focus.x, focus.y, focus.z);

    // Nubes a la deriva.
    const ci = clouds.userData.items;
    for (let i = 0; i < ci.length; i++) {
      const c = ci[i];
      c.x += dt * 1.6; if (c.x > 420) c.x -= 840;
      dummy.position.set(c.x, c.y, c.z); dummy.scale.set(c.sx, c.sy, c.sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      clouds.setMatrixAt(i, dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;

    if (storm) {
      stormWall.visible = stormGround.visible = true;
      stormWall.position.set(storm.x, 60, storm.z); stormWall.scale.set(storm.r, 1, storm.r);
      stormTex.offset.x = time * 0.03; stormTex.offset.y = Math.sin(time * 0.6) * 0.02;
      stormGround.position.set(storm.x, 0.45, storm.z); stormGround.scale.set(storm.r, storm.r, 1);
    } else stormWall.visible = stormGround.visible = false;

    // Cofres con brillo, objetos que giran y cofres del cielo con humo.
    for (const e of loots.values()) { e.phase += dt * 2; e.model.position.y = 0.95 + Math.sin(e.phase) * 0.12; e.model.rotation.y += dt * 1.5; }
    for (const e of chests.values()) if (e.beam) e.beam.material.opacity = 0.26 + Math.sin(time * 3) * 0.08;
    for (const e of drops.values()) {
      if (e.landed && e.group.visible) { e.smoke -= dt; if (e.smoke <= 0) { e.smoke = 0.12; soft.emit(1, { x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z, spread: 0.3, speed: 0.6, up: 4, color: 0xff7a5a, color2: 0xffd27a, size: 1.4, grow: 2, life: 4, grav: -1, drag: 0.4, cone: 0.3 }); } }
    }
    // Estelas, destellos y explosiones.
    for (let i = tracers.length - 1; i >= 0; i--) {
      const m = tracers[i], u = m.userData;
      u.age += dt;
      const k = u.age / u.life;
      if (k >= 1) { scene.remove(m); m.material.dispose(); tracers.splice(i, 1); continue; }
      const head = Math.min(u.len, u.len * Math.min(1, k * 2.4 + 0.15)), tail = Math.max(0, head - u.seg);
      const hx = u.from.x + ((u.to.x - u.from.x) * head) / u.len, hy = u.from.y + ((u.to.y - u.from.y) * head) / u.len, hz = u.from.z + ((u.to.z - u.from.z) * head) / u.len;
      const tx = u.from.x + ((u.to.x - u.from.x) * tail) / u.len, ty = u.from.y + ((u.to.y - u.from.y) * tail) / u.len, tz = u.from.z + ((u.to.z - u.from.z) * tail) / u.len;
      m.position.set((hx + tx) / 2, (hy + ty) / 2, (hz + tz) / 2);
      m.lookAt(hx, hy, hz);
      m.scale.set(u.w, u.w, Math.max(0.2, head - tail));
      m.material.opacity = 1 - k * k;
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const s = flashes[i];
      s.userData.age += dt;
      const k = s.userData.age / s.userData.life;
      if (k >= 1) { scene.remove(s); s.material.dispose(); flashes.splice(i, 1); continue; }
      s.scale.setScalar(s.userData.size * (1 + k * 0.6)); s.material.opacity = 1 - k;
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const m = blasts[i], u = m.userData;
      u.age += dt;
      const k = u.age / u.life;
      if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); blasts.splice(i, 1); continue; }
      const ease = 1 - (1 - k) * (1 - k);
      m.scale.setScalar(u.r * (0.25 + ease * 0.85));
      m.material.opacity = (1 - k) * 0.85;
    }
    const h = canvas.clientHeight || 450;
    soft.uScale.value = glow.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    soft.update(dt); glow.update(dt);

    renderer.render(scene, camera);

    // Si la compu no da abasto, baja sola la calidad (sombras y resolución).
    const ms = performance.now() - t0;
    if (!lowQuality) {
      slowFrames = ms > 24 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 50) {
        lowQuality = true;
        renderer.shadowMap.enabled = false;
        sun.castShadow = false;
        renderer.setPixelRatio(1);
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
        resize();
      }
    }
  }

  return {
    setWorld, resize, setAvatar, muzzleOf, handOf, syncChests, syncLoot, syncDrops, syncProjectiles, ghost, addSolid: addSolidMesh,
    tracer, muzzleFlash, impact, explosion, bump, project, setBus, draw,
    particles: { soft, glow },
    get lowQuality() { return lowQuality; },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose(); }); });
    },
  };
}

const WEAPON_KINDS = new Set(['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'burst', 'sniper', 'bazooka', 'launcher', 'minigun']);

