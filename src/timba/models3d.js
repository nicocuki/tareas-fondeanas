// La Timba 3D: piezas comunes del dibujo (materiales, textos, personajes, manos, cartas). Todo armado con código, sin
// modelos ni imágenes. Se carga con `import()` junto con `render3d.js`: no lo importes desde nada que cargue la portada.
//
// El estilo copia el de Gamble With Your Friends: colores planos con sombreado de dibujito (`MeshToonMaterial` con tres
// tonos), personajes porotos con ojos saltones y letras gordas (Lilita One).
import * as THREE from 'three';

export const FONT = '"Lilita One", "Nunito", system-ui, sans-serif';
export const DIGITS = '"Pixelify Sans", "VT323", ui-monospace, monospace';

// ─── Materiales ──────────────────────────────────────────────────────────────
let ramp = null;
function gradient() {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}
const mats = new Map();
// Un material de dibujito, compartido por color. `glow`: brilla solo (neones, pantallas, lamparitas).
export function toon(color, { glow = 0, map = null, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  const key = `${color}|${glow}|${map?.uuid || ''}|${side}|${opacity}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(), map, side, transparent: transparent || opacity < 1, opacity });
    if (glow) { m.emissive = new THREE.Color(color); m.emissiveIntensity = glow; if (map) m.emissiveMap = map; }
    mats.set(key, m);
  }
  return m;
}
// ─── Geometrías compartidas ──────────────────────────────────────────────────
const geos = new Map();
const geo = (key, make) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
export const boxGeo = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cylGeo = (rt, rb, h, seg = 20) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const sphereGeo = (r, seg = 16) => geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))));
export const planeGeo = (w, h) => geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
export const torusGeo = (r, t, seg = 24) => geo(`t${r},${t},${seg}`, () => new THREE.TorusGeometry(r, t, 8, seg));

// Atajos para armar: una caja, un cilindro o un plano ya ubicados.
export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  return m;
}
export function ball(r, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(sphereGeo(r, seg), material);
  m.position.set(x, y, z);
  return m;
}
export function plane(w, h, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(planeGeo(w, h), material);
  m.position.set(x, y, z);
  return m;
}
export const group = (...children) => { const g = new THREE.Group(); for (const c of children) if (c) g.add(c); return g; };

// ─── Texturas de canvas ──────────────────────────────────────────────────────
export function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw?.(g, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
// Un texto que entra en el ancho: achica la letra si hace falta.
export function fitText(g, text, x, y, maxW, size, { font = FONT, color = '#fff', stroke = '', strokeW = 0, align = 'center', weight = '' } = {}) {
  let s = size;
  g.textAlign = align;
  g.textBaseline = 'middle';
  do { g.font = `${weight} ${s}px ${font}`; s -= 2; } while (g.measureText(text).width > maxW && s > 8);
  if (stroke) { g.lineJoin = 'round'; g.lineWidth = strokeW; g.strokeStyle = stroke; g.strokeText(text, x, y); }
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// Las etiquetas de los botones (una por texto y color, compartidas por todas las mesas).
const labels = new Map();
export function labelMaterial(text, bg, fg = '#fff', { w = 256, h = 128, size = 64, font = FONT } = {}) {
  const key = `${text}|${bg}|${fg}|${w}|${h}|${size}|${font}`;
  let m = labels.get(key);
  if (!m) {
    const tex = canvasTexture(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, 0, w, h * 0.22);
      fitText(g, text, w / 2, h / 2 + 4, w - 18, size, { color: fg, stroke: 'rgba(0,0,0,0.35)', strokeW: 6, font });
    });
    m = toon(0xffffff, { map: tex });
    labels.set(key, m);
  }
  return m;
}

// Una pantalla que se vuelve a dibujar solo cuando cambia lo que muestra (`sig`). `draw(g, w, h)`.
export class Screen {
  constructor(w, h, pw, ph, { glow = true } = {}) {
    this.tex = canvasTexture(pw, ph);
    this.g = this.tex.image.getContext('2d');
    this.pw = pw; this.ph = ph;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow ? new THREE.MeshBasicMaterial({ map: this.tex }) : new THREE.MeshToonMaterial({ map: this.tex, gradientMap: gradient() }));
    this.mesh.userData.screen = this;
    this.sig = null;
  }
  draw(sig, fn) {
    if (sig === this.sig) return;
    this.sig = sig;
    this.g.clearRect(0, 0, this.pw, this.ph);
    fn(this.g, this.pw, this.ph);
    this.tex.needsUpdate = true;
  }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ─── Cartas ──────────────────────────────────────────────────────────────────
const CARD_W = 0.13;
const CARD_H = 0.18;
export const CARD = { w: CARD_W, h: CARD_H };
const cardMats = new Map();
// La cara de una carta: `rank` (texto) y `suit` (símbolo o ''), roja o negra. `back` es el dorso.
export function cardMaterial(rank, suit = '', red = false) {
  const key = `${rank}|${suit}|${red}`;
  let m = cardMats.get(key);
  if (m) return m;
  const tex = canvasTexture(128, 178, (g, w, h) => {
    if (rank === 'back') {
      g.fillStyle = '#fff'; roundRect(g, 0, 0, w, h, 12); g.fill();
      g.fillStyle = '#b8242e'; roundRect(g, 8, 8, w - 16, h - 16, 8); g.fill();
      g.strokeStyle = '#ffd27a'; g.lineWidth = 3;
      for (let i = -h; i < w + h; i += 14) { g.beginPath(); g.moveTo(i, 8); g.lineTo(i + h, h - 8); g.stroke(); }
      g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(w / 2, h / 2, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b8242e'; fitText(g, 'T', w / 2, h / 2 + 3, 40, 34, { color: '#b8242e' });
      return;
    }
    g.fillStyle = '#fbf8f0'; roundRect(g, 0, 0, w, h, 12); g.fill();
    g.strokeStyle = '#d8d0c0'; g.lineWidth = 3; roundRect(g, 2, 2, w - 4, h - 4, 11); g.stroke();
    const c = red ? '#d0242e' : '#1a1622';
    fitText(g, rank, 26, 28, 44, 34, { color: c });
    if (suit) fitText(g, suit, 26, 58, 40, 28, { color: c, font: 'serif' });
    fitText(g, suit || rank, w / 2, h / 2 + 14, w - 20, suit ? 76 : 70, { color: c, font: suit ? 'serif' : FONT });
  });
  m = toon(0xffffff, { map: tex });
  cardMats.set(key, m);
  return m;
}
// Una carta como objeto: dos caras (la de adelante mira para arriba con `rotation.x = -π/2`). Se da vuelta con `flip`.
export function cardMesh() {
  const g = new THREE.Group();
  const front = new THREE.Mesh(planeGeo(CARD_W, CARD_H), cardMaterial('A', '♠'));
  const back = new THREE.Mesh(planeGeo(CARD_W, CARD_H), cardMaterial('back'));
  front.rotation.x = -Math.PI / 2;
  back.rotation.x = Math.PI / 2;
  front.position.y = 0.002; back.position.y = 0.001;
  g.add(front, back);
  g.userData = { front, back };
  return g;
}

// ─── Personajes ──────────────────────────────────────────────────────────────
const SKIN_EYE = 0xffffff;
// Un poroto con ojos saltones (los jugadores, el croupier, el botones). `hat`: 'top' (galera), 'cap' (gorrita de botones),
// 'fez' o nada. `bow`: moño de croupier. Mide ~1,45 m; los pies en el origen y mira para +z.
export function blob(color, { hat = '', bow = false, scale = 1 } = {}) {
  const g = new THREE.Group();
  const body = toon(color);
  const dark = toon(new THREE.Color(color).multiplyScalar(0.6).getHex());
  const trunk = cyl(0.3, 0.34, 0.8, body, 0, 0.5, 0);
  const head = ball(0.31, body, 0, 0.92, 0, 20);
  const base = cyl(0.34, 0.3, 0.12, dark, 0, 0.06, 0);
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const eye = ball(0.12, toon(SKIN_EYE), s * 0.12, 0, 0, 16);
    eye.scale.set(1, 1.15, 0.6);
    const pupil = ball(0.055, toon(0x14101c), s * 0.12 + s * 0.012, -0.01, 0.07, 12);
    eyes.add(eye, pupil);
  }
  eyes.position.set(0, 0.98, 0.25);
  const nose = ball(0.06, toon(new THREE.Color(color).lerp(new THREE.Color(0xff8a8a), 0.5).getHex()), 0, 0.84, 0.31, 10);
  g.add(trunk, head, base, eyes, nose);
  if (bow) {
    const b = toon(0x14101c);
    g.add(box(0.2, 0.08, 0.04, b, 0, 0.66, 0.31), box(0.06, 0.06, 0.05, toon(0xc8303a), 0, 0.66, 0.33));
    g.add(box(0.5, 0.36, 0.02, toon(0xf4f0e6), 0, 0.42, 0.33));
  }
  if (hat === 'top') {
    const h = toon(0x1a1622);
    g.add(cyl(0.36, 0.36, 0.03, h, 0, 1.2, 0), cyl(0.22, 0.24, 0.32, h, 0, 1.37, 0), cyl(0.245, 0.245, 0.06, toon(0xc8303a), 0, 1.25, 0));
  } else if (hat === 'cap') {
    g.add(cyl(0.2, 0.22, 0.16, toon(0xc8303a), 0, 1.24, 0), cyl(0.21, 0.21, 0.03, toon(0xf0c33c), 0, 1.19, 0));
  } else if (hat === 'fez') {
    g.add(cyl(0.15, 0.2, 0.22, toon(0xb8242e), 0, 1.27, 0));
  }
  g.scale.setScalar(scale);
  g.userData = { trunk, head, eyes };
  return g;
}

// Hace caminar o respirar al poroto (solo dibujo). `moving`: si camina; `t`: el reloj.
export function animateBlob(g, t, moving, phase = 0) {
  const u = g.userData;
  if (!u.trunk) return;
  const k = moving ? Math.sin((t + phase) * 11) : Math.sin((t + phase) * 2) * 0.25;
  const bob = moving ? Math.abs(k) * 0.06 : k * 0.012;
  u.trunk.position.y = 0.5 + bob;
  u.head.position.y = 0.92 + bob * 1.2;
  u.eyes.position.y = 0.98 + bob * 1.2;
  g.rotation.z = moving ? k * 0.05 : 0;
}

// El cartel con el nombre arriba de cada jugador.
export function nameTag(name, color) {
  const tex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(12,8,24,0.72)'; roundRect(g, 4, 6, w - 8, h - 12, 18); g.fill();
    g.fillStyle = color; g.fillRect(16, 22, 12, 20);
    fitText(g, name, w / 2 + 8, h / 2 + 2, w - 56, 34, { color: '#fff' });
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(0.9, 0.225, 1);
  return s;
}

// Una sombra redonda debajo de cada personaje (sin sombras de verdad, que cuestan mucho).
let blobShadowTex = null;
export function blobShadow(r = 0.42) {
  if (!blobShadowTex) {
    blobShadowTex = canvasTexture(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
      grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    });
  }
  const m = new THREE.Mesh(planeGeo(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobShadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

// ─── Las manos (primera persona) ─────────────────────────────────────────────
// Dos manos de dibujito, gorditas, abajo de la pantalla. La derecha es la que aprieta los botones (`poke`).
export function hands(color) {
  const skin = toon(new THREE.Color(color).lerp(new THREE.Color(0xd8dcf4), 0.55).getHex());
  const make = (side) => {
    const h = new THREE.Group();
    const palm = ball(0.07, skin, 0, 0, 0, 14);
    palm.scale.set(1.05, 0.7, 1.25);
    h.add(palm);
    // el índice estirado (el que aprieta) y los otros doblados
    const index = cyl(0.018, 0.02, 0.09, skin, side * 0.03, 0.01, -0.1, 10);
    index.rotation.x = Math.PI / 2;
    h.add(index, ball(0.02, skin, side * 0.03, 0.01, -0.145, 10));
    for (let i = 0; i < 3; i++) h.add(ball(0.026, skin, side * (0.005 - i * 0.025), -0.012, -0.075, 10));
    const thumb = ball(0.024, skin, side * 0.075, 0.01, -0.03, 10);
    thumb.scale.set(1, 1, 1.5);
    h.add(thumb, cyl(0.045, 0.05, 0.14, toon(new THREE.Color(color).getHex()), 0, -0.01, 0.12, 12));
    h.children[h.children.length - 1].rotation.x = Math.PI / 2;
    return h;
  };
  const left = make(-1);
  const right = make(1);
  const g = new THREE.Group();
  g.add(left, right);
  g.userData = { left, right };
  return g;
}

// Una nube de partículas simple (humo, monedas, confeti): cada una con su velocidad, se apaga sola.
export class Burst {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
  }
  coins(pos, n = 24, colors = [0xf0c33c, 0xffe27a, 0x5aff7a]) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(cylGeo(0.035, 0.035, 0.01, 10), toon(colors[i % colors.length], { glow: 0.3 }));
      m.position.copy(pos);
      const a = (i / n) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), 2 + Math.random() * 1.6, Math.sin(a) * (0.6 + Math.random()));
      this.scene.add(m);
      this.parts.push({ m, v, life: 1.4, spin: (Math.random() - 0.5) * 20 });
    }
  }
  step(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      p.v.y -= 6 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin * dt;
      p.m.rotation.z += p.spin * 0.7 * dt;
      if (p.life < 0.3) p.m.scale.setScalar(Math.max(0.01, p.life / 0.3));
    }
    for (const p of this.parts.filter((q) => q.life <= 0)) this.scene.remove(p.m);
    this.parts = this.parts.filter((q) => q.life > 0);
  }
  clear() { for (const p of this.parts) this.scene.remove(p.m); this.parts = []; }
}
