// Fondo Kart: la pista y los karts en 3D (Three.js, todo con código, sin imágenes). Se carga con import() recién al
// empezar la carrera: no lo importes desde nada que cargue la portada. Colores fijos, iguales en los dos temas.
//
// `createRenderer(canvas, track, racers)` arma la pista (asfalto, cordones, paredes, el paisaje del tema, cajas de ítems y
// aceleradores) y un kart por corredor con su personaje sentado. `draw(frame)` recibe dónde está cada cosa y qué vistas
// dibujar: una (online) o hasta cuatro (local, pantalla partida).
import * as THREE from 'three';
import { characterModel, seatPose, lambert } from '../wii/character.js';
import { skinById } from '../wii/skins.js';
import { fwd } from './sim.js';

const THEMES = {
  pradera: { sky: 0x8fd3ff, fog: [0x8fd3ff, 120, 380], ground: 0x5cb04a, road: 0x55595f, wall: 0xf2f2f2, wall2: 0xe8423f, light: 1.25 },
  playa: { sky: 0x7ad0ff, fog: [0xaee4ff, 120, 400], ground: 0xf0d58c, road: 0x5c6066, wall: 0x3fa7ff, wall2: 0xffffff, sea: 0x1f9fd9, light: 1.35 },
  desierto: { sky: 0xffc98a, fog: [0xffd7a3, 110, 360], ground: 0xe0a35a, road: 0x6a5a4a, wall: 0xb5651d, wall2: 0xf7d08a, light: 1.4 },
  nieve: { sky: 0xcfe6ff, fog: [0xe8f3ff, 90, 320], ground: 0xf4f8ff, road: 0x6b7480, wall: 0x3a6fd8, wall2: 0xffffff, light: 1.2 },
  lava: { sky: 0x2a0f12, fog: [0x3a1410, 70, 300], ground: null, hemi: 0x5a2a1c, road: 0x3c3a3e, wall: 0x6b6066, wall2: 0xff6a1a, lava: 0xff5a10, light: 0.8 },
  ciudad: { sky: 0x0d0b2a, fog: [0x150f3a, 90, 340], ground: 0x2a2840, road: 0x2e2f3a, wall: 0x14d0c8, wall2: 0xff4fa0, light: 0.75 },
  espacio: { sky: 0x05030f, fog: null, ground: null, road: null, wall: null, light: 0.9 },
};
const MT_COLORS = [0xffffff, 0x4ab4ff, 0xff9a3c, 0xc061ff];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mesh = (geo, color, shadow = true) => { const m = new THREE.Mesh(geo, lambert(color)); m.castShadow = shadow; m.receiveShadow = true; return m; };

function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ─── La pista ────────────────────────────────────────────────────────────────
// Una cinta a lo largo de las muestras: de −half a +half. `color(i, side)` da el color de cada vértice.
function ribbon(track, from, to, y, color) {
  const S = track.samples, n = S.length;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const sm = S[i % n];
    for (const [side, lat] of [[0, from], [1, to]]) {
      pos.push(sm.x + sm.nx * lat, y, sm.z + sm.nz * lat);
      c.set(color(i, side)); col.push(c.r, c.g, c.b);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Una pared: cinta vertical a `lat` del centro, de `h` de alto.
function wallStrip(track, lat, h, colorA, colorB) {
  const S = track.samples, n = S.length;
  const pos = [], col = [], idx = [];
  const a = new THREE.Color(colorA), b = new THREE.Color(colorB);
  for (let i = 0; i <= n; i++) {
    const sm = S[i % n], c = Math.floor(i / 4) % 2 ? a : b;
    const x = sm.x + sm.nx * lat, z = sm.z + sm.nz * lat;
    pos.push(x, 0, z, x, h, z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

function buildTrack(scene, track) {
  const th = THEMES[track.theme] || THEMES.pradera;
  const half = track.half;
  const space = track.theme === 'espacio';
  const vmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Asfalto (en el espacio, un arcoíris).
  const rainbow = [0xff3b5c, 0xff9a3c, 0xffe14a, 0x45e08a, 0x3fa7ff, 0xb061ff];
  const road = new THREE.Mesh(ribbon(track, -half, half, 0.02, (i, side) => (space ? rainbow[(Math.floor(i / 6) + side * 3) % 6] : th.road)), space ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide }) : vmat);
  road.receiveShadow = true; scene.add(road);
  // Cordones rojos y blancos a los dos lados, y una línea punteada al medio.
  const curbA = space ? 0xffffff : 0xe8423f, curbB = space ? 0x9fd8ff : 0xffffff;
  for (const sg of [-1, 1]) {
    const g = ribbon(track, sg > 0 ? half - 0.1 : -half - 1.1, sg > 0 ? half + 1.1 : -half + 0.1, 0.04, (i) => (Math.floor(i / 2) % 2 ? curbA : curbB));
    const m = new THREE.Mesh(g, space ? new THREE.MeshBasicMaterial({ vertexColors: true }) : vmat); m.receiveShadow = true; scene.add(m);
  }
  if (!space) {
    const dash = new THREE.Mesh(ribbon(track, -0.15, 0.15, 0.03, (i) => (Math.floor(i / 3) % 2 ? th.road : 0xd8d8d8)), vmat); scene.add(dash);
  }
  // Banquina, paredes, lava o nada.
  if (track.edge === 'wall') {
    for (const sg of [-1, 1]) scene.add(wallStrip(track, sg * (half + track.wallAt + 0.3), 1.1, th.wall, th.wall2));
  }
  if (th.ground != null) {
    const ground = mesh(new THREE.PlaneGeometry(1400, 1400), th.ground, false); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  }
  if (track.theme === 'lava') {
    // El camino flota sobre un mar de lava: el borde del asfalto es una plataforma de piedra.
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: th.lava })); lava.rotation.x = -Math.PI / 2; lava.position.y = -1.5; scene.add(lava);
    for (const sg of [-1, 1]) scene.add(wallStrip(track, sg * (half + 1.2), -1.6, 0x3a3236, 0x2b2427));
    const rock = new THREE.Mesh(ribbon(track, -half - 1.2, half + 1.2, -0.01, () => 0x2f2a2c), vmat); scene.add(rock);
  }
  if (track.theme === 'playa') {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: th.sea })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.01, 0); sea.position.z = 0;
    sea.geometry.translate(0, -900, 0); scene.add(sea); // el mar arranca al sur de la pista
  }
  // Línea de largada a cuadros.
  const s0 = track.samples[0];
  const chk = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const start = new THREE.Mesh(new THREE.PlaneGeometry(track.width + 2, 2.4), new THREE.MeshLambertMaterial({ map: chk }));
  start.rotation.x = -Math.PI / 2; start.rotation.z = Math.atan2(s0.tx, s0.tz) + Math.PI / 2;
  start.position.set(s0.x, 0.05, s0.z); scene.add(start);
  // Arco de largada.
  for (const sg of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.6, 6, 0.6), 0x222222); p.position.set(s0.x + s0.nx * sg * (half + 1.5), 3, s0.z + s0.nz * sg * (half + 1.5)); scene.add(p); }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 3.6, 1.4, 0.3), new THREE.MeshLambertMaterial({ map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#e8423f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 44px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FONDO KART', w / 2, h / 2 + 2); }) }));
  banner.position.set(s0.x, 6, s0.z); banner.rotation.y = Math.atan2(s0.nx, s0.nz) + Math.PI / 2; scene.add(banner);
  // Aceleradores: flechas amarillas en el piso.
  const arrow = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ff9a1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14a';
    for (const y of [10, 60]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 14, y + 46); g.lineTo(w / 2, y + 30); g.lineTo(14, y + 46); g.closePath(); g.fill(); }
  });
  for (const p of track.pads) {
    const sm = track.samples[p.i];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 1.6, p.r * 2), new THREE.MeshBasicMaterial({ map: arrow }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(sm.tx, sm.tz) + Math.PI;
    m.position.set(p.x, 0.06, p.z); scene.add(m);
  }
  scenery(scene, track, th);
}

// ─── El paisaje ──────────────────────────────────────────────────────────────
function clearOf(track, x, z, gap) {
  const S = track.samples;
  for (let i = 0; i < S.length; i += 3) if ((S[i].x - x) ** 2 + (S[i].z - z) ** 2 < gap * gap) return false;
  return true;
}
function scenery(scene, track, th) {
  const r = rng(track.index * 977 + 13);
  const gap = track.half + (track.wallAt || 2) + 4;
  const put = (count, build, minR = gap, spread = 110) => {
    let tries = 0, placed = 0;
    while (placed < count && tries++ < count * 12) {
      const sm = track.samples[Math.floor(r() * track.count)];
      const side = r() < 0.5 ? -1 : 1, d = minR + r() * spread;
      const x = sm.x + sm.nx * side * d, z = sm.z + sm.nz * side * d;
      if (!clearOf(track, x, z, minR)) continue;
      const o = build(r); o.position.x = x; o.position.z = z; o.rotation.y = r() * Math.PI * 2; scene.add(o); placed++;
    }
  };
  const tree = (trunk, leaf, h = 4) => () => { const g = new THREE.Group(); const t = mesh(new THREE.CylinderGeometry(0.35, 0.5, h * 0.5, 7), trunk); t.position.y = h * 0.25; g.add(t); const l = mesh(new THREE.SphereGeometry(h * 0.38, 9, 7), leaf); l.position.y = h * 0.7; g.add(l); return g; };
  const pine = (leaf) => (rr) => { const g = new THREE.Group(); const h = 5 + rr() * 4; const t = mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 6), 0x6b4423); t.position.y = 0.7; g.add(t); for (let k = 0; k < 3; k++) { const c = mesh(new THREE.ConeGeometry(h * 0.35 - k * 0.5, h * 0.45, 8), leaf); c.position.y = 1.4 + k * h * 0.22; g.add(c); } return g; };
  switch (track.theme) {
    case 'pradera':
      put(90, (rr) => tree(0x7a4a26, rr() < 0.5 ? 0x3e9a3a : 0x52b847, 4 + rr() * 3)());
      put(50, () => { const b = mesh(new THREE.SphereGeometry(1.2, 8, 6), 0x3f9440); b.scale.y = 0.6; return b; }, gap - 2, 40);
      put(30, () => { const g = new THREE.Group(); for (const [c, x] of [[0xff6f91, 0], [0xffe14a, 0.6], [0xffffff, -0.5]]) { const f = mesh(new THREE.SphereGeometry(0.25, 6, 5), c, false); f.position.set(x, 0.3, x * 0.7); g.add(f); } return g; }, gap - 3, 20);
      break;
    case 'playa':
      put(60, (rr) => { const g = new THREE.Group(); const h = 6 + rr() * 3; const t = mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), 0x9a6b3a); t.position.y = h / 2; t.rotation.z = 0.15; g.add(t); for (let k = 0; k < 6; k++) { const l = mesh(new THREE.BoxGeometry(0.4, 0.08, 3.2), 0x2f9e3a); l.position.set(Math.sin(k) * 1.2 + 0.6, h, Math.cos(k) * 1.2); l.rotation.set(0.35, k, 0); g.add(l); } return g; });
      put(25, (rr) => { const g = new THREE.Group(); const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), 0xffffff); pole.position.y = 1.3; g.add(pole); const top = mesh(new THREE.ConeGeometry(1.6, 0.8, 10), [0xff4f6a, 0x3fa7ff, 0xffe14a][Math.floor(rr() * 3)]); top.position.y = 2.6; g.add(top); return g; }, gap - 2, 30);
      break;
    case 'desierto':
      put(70, (rr) => { const g = new THREE.Group(); const h = 3 + rr() * 3; const c = mesh(new THREE.CapsuleGeometry(0.45, h, 4, 8), 0x3f8a3a); c.position.y = h / 2 + 0.4; g.add(c); for (const sx of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 6), 0x3f8a3a); a.position.set(sx * 0.8, h * 0.6, 0); g.add(a); } return g; });
      put(40, (rr) => { const m = mesh(new THREE.DodecahedronGeometry(2 + rr() * 5, 0), rr() < 0.5 ? 0xb5651d : 0xc8783a); m.position.y = 1; m.scale.y = 0.7 + rr(); return m; }, gap + 4, 140);
      break;
    case 'nieve':
      put(110, pine(0x2f6f4a));
      put(30, () => { const g = new THREE.Group(); for (const [r0, y] of [[0.9, 0.9], [0.65, 2.1], [0.45, 3]]) { const b = mesh(new THREE.SphereGeometry(r0, 10, 8), 0xffffff); b.position.y = y; g.add(b); } const n = mesh(new THREE.ConeGeometry(0.1, 0.5, 6), 0xff8a1a); n.rotation.x = Math.PI / 2; n.position.set(0, 3, -0.45); g.add(n); return g; }, gap - 2, 30);
      break;
    case 'lava':
      put(40, (rr) => { const m = mesh(new THREE.ConeGeometry(2 + rr() * 3, 6 + rr() * 10, 7), 0x3a2a2a); m.position.y = -1; return m; }, gap + 6, 120);
      put(16, () => { const g = new THREE.Group(); const t = mesh(new THREE.BoxGeometry(5, 14, 5), 0x4a4046); t.position.y = 6; g.add(t); const top = mesh(new THREE.ConeGeometry(4, 5, 4), 0x8a2a2a); top.position.y = 15.5; top.rotation.y = Math.PI / 4; g.add(top); return g; }, gap + 8, 80);
      break;
    case 'ciudad':
      put(90, (rr) => { const g = new THREE.Group(); const h = 10 + rr() * 35, w = 6 + rr() * 8; const b = mesh(new THREE.BoxGeometry(w, h, w), [0x1d1b3a, 0x262347, 0x17233b][Math.floor(rr() * 3)]); b.position.y = h / 2; g.add(b); const win = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h * 0.8, w * 0.3), new THREE.MeshBasicMaterial({ color: [0x14d0c8, 0xff4fa0, 0xffe14a][Math.floor(rr() * 3)] })); win.position.y = h * 0.5; win.scale.set(1, 1, 0.05); g.add(win); return g; }, gap + 2, 90);
      put(40, () => { const g = new THREE.Group(); const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), 0x444444); p.position.y = 2.5; g.add(p); const l = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a0 })); l.position.y = 5; g.add(l); return g; }, gap - 1, 6);
      break;
    case 'espacio': {
      const geo = new THREE.BufferGeometry(); const pts = [];
      for (let i = 0; i < 1500; i++) { const a = r() * Math.PI * 2, b = r() * Math.PI - Math.PI / 2, d = 400 + r() * 300; pts.push(Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d, Math.sin(a) * Math.cos(b) * d); }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));
      for (const [c, x, y, z, s] of [[0xff8a5c, -260, 60, -300, 60], [0x7a8cff, 300, 120, 200, 40], [0x45e08a, 100, -80, -400, 25]]) { const p = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 16), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 })); p.position.set(x, y, z); scene.add(p); }
      break;
    }
    default:
  }
}

// ─── Los karts ───────────────────────────────────────────────────────────────
function kartModel(skinId) {
  const s = skinById(skinId);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshLambertMaterial({ color: s.shirt });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.5), paint); chassis.position.y = 0.42; chassis.castShadow = true; body.add(chassis);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), paint); nose.position.set(0, 0.5, -1.35); nose.rotation.x = 0.25; nose.castShadow = true; body.add(nose);
  const bumper = mesh(new THREE.BoxGeometry(1.7, 0.22, 0.25), 0x222222); bumper.position.set(0, 0.32, -1.7); body.add(bumper);
  const seat = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.25), 0x1d1d1d); seat.position.set(0, 0.85, 0.65); body.add(seat);
  const engine = mesh(new THREE.BoxGeometry(1.0, 0.45, 0.6), 0x555a60); engine.position.set(0, 0.75, 1.1); body.add(engine);
  const pipes = [];
  for (const sx of [-0.3, 0.3]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), 0x999999); p.rotation.x = Math.PI / 2; p.position.set(sx, 0.75, 1.45); body.add(p); pipes.push(p); }
  const wheelSt = mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 14), 0x222222); wheelSt.position.set(0, 1.05, -0.35); wheelSt.rotation.x = -0.9; body.add(wheelSt);
  const wheels = [];
  for (const [x, z, r] of [[-0.85, -0.95, 0.32], [0.85, -0.95, 0.32], [-0.85, 0.95, 0.4], [0.85, 0.95, 0.4]]) {
    const w = new THREE.Group(); w.position.set(x, r, z);
    const tire = mesh(new THREE.CylinderGeometry(r, r, 0.38, 14), 0x1b1b1b); tire.rotation.z = Math.PI / 2; w.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.4, 10), 0xd8d8d8); hub.rotation.z = Math.PI / 2; w.add(hub);
    body.add(w); wheels.push(w);
  }
  const driver = characterModel(skinId);
  driver.scale.setScalar(0.72); driver.position.set(0, 0.42, 0.35); seatPose(driver);
  body.add(driver);
  // Llamas del turbo y chispas del derrape.
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffa63c, transparent: true, opacity: 0.85 });
  const flames = pipes.map((p) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), flameM); f.rotation.x = -Math.PI / 2; f.position.set(p.position.x, 0.75, 2.0); body.add(f); return f; });
  const sparkM = new THREE.MeshBasicMaterial({ color: 0x4ab4ff, transparent: true, opacity: 0.9 });
  const sparks = [-0.85, 0.85].map((x) => { const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), sparkM); sp.position.set(x, 0.2, 1.3); body.add(sp); return sp; });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; root.add(shadow);
  root.userData = { body, paint, base: new THREE.Color(s.shirt), wheels, driver, flames, flameM, sparks, sparkM, shadow, spinA: 0, roll: 0 };
  return root;
}

function makeTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 30px Inter, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(15,20,40,0.82)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 52, 12); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1); s.position.y = 2.6; s.renderOrder = 10;
  return s;
}

// ─── Ítems en la pista ───────────────────────────────────────────────────────
function shellModel(color) {
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color); dome.position.y = 0.15; g.add(dome);
  const rim = mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 16), 0xffffff); rim.rotation.x = Math.PI / 2; rim.position.y = 0.15; g.add(rim);
  return g;
}
function shotModel(w) {
  if (w === 'verde') return shellModel(0x2fb84a);
  if (w === 'rojo') return shellModel(0xe8323a);
  if (w === 'azul') { const g = shellModel(0x2f6fff); for (const sx of [-1, 1]) { const wing = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), 0xffffff); wing.position.set(sx * 0.8, 0.4, 0); wing.rotation.z = sx * 0.3; g.add(wing); } return g; }
  if (w === 'banana') { const g = new THREE.Group(); const b = mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 14, Math.PI * 1.1), 0xffd93a); b.rotation.set(0, 0, Math.PI * 0.95); b.position.y = 0.45; g.add(b); return g; }
  if (w === 'bomba') { const g = new THREE.Group(); const b = mesh(new THREE.SphereGeometry(0.6, 14, 10), 0x1b1b1b); b.position.y = 0.6; g.add(b); const f = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5), 0xc8a060); f.position.y = 1.3; g.add(f); const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f })); sp.position.y = 1.5; g.add(sp); return g; }
  return mesh(new THREE.SphereGeometry(0.5, 8, 6), 0xffffff);
}

export function createRenderer(canvas, track, racers) {
  const th = THEMES[track.theme] || THEMES.pradera;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(th.sky);
  if (th.fog) scene.fog = new THREE.Fog(...th.fog);
  scene.add(new THREE.HemisphereLight(0xffffff, th.ground ?? th.hemi ?? 0x222244, th.light));
  const sun = new THREE.DirectionalLight(track.theme === 'lava' ? 0xffb080 : 0xffffff, track.theme === 'ciudad' ? 0.9 : 1.5);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  scene.add(sun, sun.target);
  buildTrack(scene, track);

  // Cajas de ítems: cubo transparente que gira, con «?».
  const qTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff5ad1'); gr.addColorStop(0.5, '#ffe14a'); gr.addColorStop(1, '#4ab4ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 92px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 6); });
  const boxMat = new THREE.MeshLambertMaterial({ map: qTex, transparent: true, opacity: 0.85, emissive: 0x332244 });
  const boxes = track.boxes.map((b) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), boxMat); m.position.set(b.x, 1.3, b.z); m.castShadow = true; scene.add(m); return m; });

  const karts = new Map();
  for (const r of racers) {
    const m = kartModel(r.skin);
    m.userData.tag = makeTag(r.name, r.bot ? '#cfd6e6' : '#ffe14a');
    m.add(m.userData.tag);
    scene.add(m); karts.set(r.id, m);
  }
  const shots = new Map();
  const booms = [];
  const cams = [0, 1, 2, 3].map(() => ({ cam: new THREE.PerspectiveCamera(68, 1, 0.3, 900), pos: null, look: new THREE.Vector3() }));

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  let lastT = performance.now() / 1000;
  // frame: { karts: [{ id, x, z, y, yaw, steer, drift, mt, boost, star, spin, shrink, fall }], shots: [{ key, w, x, y, z, yaw }],
  //          boxes: [bool], booms: [{ key, x, z, r }], views: [id], layout }
  function draw(f) {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
    for (const k of f.karts) {
      const m = karts.get(k.id); if (!m) continue;
      const u = m.userData;
      m.visible = !(k.fall > 0 && k.fall < 1.0);
      u.tag.visible = !f.views.includes(k.id); // el nombre propio no tapa la pista
      m.position.set(k.x, k.fall > 0 ? -(1.3 - k.fall) * 6 : k.y, k.z);
      m.rotation.y = k.yaw + (k.drift ? k.drift * 0.32 : 0);
      u.spinA = k.spin > 0 ? u.spinA + dt * 14 : 0;
      u.body.rotation.y = u.spinA;
      u.body.rotation.z = (k.drift ? -k.drift * 0.12 : -k.steer * 0.05);
      u.body.scale.setScalar(k.shrink > 0 ? 0.55 : 1);
      u.roll += (k.speed || 0) * dt * 2.5;
      u.wheels.forEach((w, i) => { w.rotation.x = -u.roll; if (i < 2) w.rotation.y = -k.steer * 0.45; });
      seatPose(u.driver, k.steer, k.drift);
      const boosting = k.boost > 0;
      u.flames.forEach((fl) => { fl.visible = boosting; fl.scale.set(1, 0.7 + Math.random() * 0.6, 1); });
      u.flameM.color.setHex(k.mt === 3 ? 0xc061ff : 0xffa63c);
      const showSparks = k.drift && k.mt > 0;
      u.sparks.forEach((sp) => { sp.visible = showSparks; sp.rotation.set(Math.random() * 6, Math.random() * 6, 0); sp.scale.setScalar(0.6 + Math.random() * 0.8); });
      u.sparkM.color.setHex(MT_COLORS[k.mt] || 0xffffff);
      if (k.star > 0) u.paint.color.setHSL((now * 3) % 1, 1, 0.55); else u.paint.color.copy(u.base);
      u.shadow.scale.setScalar(1 / (1 + Math.max(0, k.y) * 0.2));
      u.shadow.position.y = 0.03 - Math.max(0, k.y);
    }
    // Proyectiles.
    const seen = new Set();
    for (const p of f.shots) {
      seen.add(p.key);
      let m = shots.get(p.key);
      if (!m) { m = shotModel(p.w); scene.add(m); shots.set(p.key, m); }
      m.position.set(p.x, p.y - 0.4, p.z);
      m.rotation.y = p.w === 'banana' ? 0 : now * 8;
    }
    for (const [key, m] of shots) if (!seen.has(key)) { scene.remove(m); shots.delete(key); }
    f.boxes.forEach((on, i) => { const b = boxes[i]; b.visible = on; b.rotation.set(now * 0.7, now * 1.1, 0); b.position.y = 1.3 + Math.sin(now * 2 + i) * 0.15; });
    // Explosiones: una esfera que crece y se desvanece.
    for (const b of f.booms) {
      if (booms.some((x) => x.key === b.key)) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: b.color || 0xffa63c, transparent: true, opacity: 0.8 }));
      m.position.set(b.x, 1, b.z); scene.add(m); booms.push({ key: b.key, m, age: 0, r: b.r });
    }
    for (let i = booms.length - 1; i >= 0; i--) {
      const b = booms[i]; b.age += dt;
      b.m.scale.setScalar(b.r * Math.min(1, b.age * 4)); b.m.material.opacity = Math.max(0, 0.8 - b.age * 1.4);
      if (b.age > 0.6) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); booms.splice(i, 1); }
    }

    // Vistas: 1 entera, 2 lado a lado, 3 o 4 en cuadrícula.
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    const n = f.views.length;
    const cols = n > 1 ? 2 : 1, rows = n > 2 ? 2 : 1;
    renderer.setScissorTest(n > 1);
    if (n > 2) { renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setClearColor(0x000000); renderer.clear(); }
    f.views.forEach((id, k) => {
      const kart = f.karts.find((x) => x.id === id) || f.karts[0];
      const c = cams[k];
      const vw = w / cols, vh = h / rows;
      const vx = (k % cols) * vw, vy = (rows - 1 - Math.floor(k / cols)) * vh;
      if (kart) {
        const [fx, fz] = fwd(kart.yaw);
        const back = kart.fall > 0 ? 0 : 1;
        const want = new THREE.Vector3(kart.x - fx * 7.5 * back, Math.max(0, kart.y) + 3.4, kart.z - fz * 7.5 * back);
        if (!c.pos || c.pos.distanceTo(want) > 40) c.pos = want.clone();
        c.pos.lerp(want, Math.min(1, dt * 7));
        c.look.lerp(new THREE.Vector3(kart.x + fx * 5, Math.max(0, kart.y) + 1.1, kart.z + fz * 5), Math.min(1, dt * 10));
        c.cam.position.copy(c.pos); c.cam.lookAt(c.look);
        c.cam.fov = 68 + (kart.boost > 0 ? 8 : 0);
        if (k === 0) { sun.position.set(kart.x + 30, 60, kart.z + 20); sun.target.position.set(kart.x, 0, kart.z); }
      }
      c.cam.aspect = vw / vh; c.cam.updateProjectionMatrix();
      renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
      renderer.render(scene, c.cam);
    });
  }
  return {
    draw,
    resize,
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
