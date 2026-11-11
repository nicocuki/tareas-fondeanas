// Royale 3D: los modelos armados con código (sin archivos): armas, personajes, cofres, objetos del piso, el bus y
// el cofre del cielo. Todo con formas simples y colores lisos (estilo «low poly»). Se carga con `import()` junto con render.js.
import * as THREE from 'three';
import { RARITIES, WEAPONS } from './sim.js';

const matCache = new Map();
export function mat(color, o = {}) {
  const k = `${color}|${JSON.stringify(o)}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...o }); matCache.set(k, m); }
  return m;
}
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

// ─── Texturas ────────────────────────────────────────────────────────────────
// Pintadas en un canvas chico y repetidas: madera, piedra, tablones y cajas.
const texCache = {};
function canvasTex(size, draw, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
export function texture(name) {
  if (texCache[name]) return texCache[name];
  const draw = {
    wood: (g, s) => {
      g.fillStyle = '#b98a54'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a77a47' : '#c19259'; g.fillRect(0, (i * s) / 8, s, s / 8); g.fillStyle = 'rgba(60,35,15,0.55)'; g.fillRect(0, (i * s) / 8, s, 2); }
      g.fillStyle = 'rgba(70,40,15,0.35)';
      for (let i = 0; i < 18; i++) g.fillRect(((i * 37) % s), ((i * 53) % s), 10 + (i % 4) * 6, 2);
    },
    floor: (g, s) => {
      g.fillStyle = '#9b6e3e'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#8e6335' : '#a87a47'; g.fillRect((i * s) / 6, 0, s / 6, s); g.fillStyle = 'rgba(40,22,8,0.6)'; g.fillRect((i * s) / 6, 0, 2, s); }
    },
    stone: (g, s) => {
      g.fillStyle = '#8d9096'; g.fillRect(0, 0, s, s);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const off = r % 2 ? s / 6 : 0;
        g.fillStyle = (r + c) % 2 ? '#7f8288' : '#9a9da3';
        g.fillRect(((c * s) / 3 + off) % s, (r * s) / 4, s / 3 - 2, s / 4 - 2);
      }
    },
    crate: (g, s) => {
      g.fillStyle = '#c28b4a'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#6e4218'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
      g.lineWidth = 5; g.beginPath(); g.moveTo(6, 6); g.lineTo(s - 6, s - 6); g.moveTo(s - 6, 6); g.lineTo(6, s - 6); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 1; i < 5; i++) g.fillRect(0, (i * s) / 5, s, 2);
    },
    sand: (g, s) => {
      g.fillStyle = '#cbb78a'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#bda878' : '#d6c398'; g.fillRect(0, (i * s) / 6, s, s / 6 - 2); }
    },
    metal: (g, s) => {
      g.fillStyle = '#aeb6bd'; g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 4; i++) g.fillRect((i * s) / 4, 0, 3, s);
    },
    build: (g, s) => {
      g.fillStyle = '#d9b06c'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#cfa35c' : '#e2ba78'; g.fillRect(0, (i * s) / 4, s, s / 4); g.fillStyle = 'rgba(80,50,15,0.6)'; g.fillRect(0, (i * s) / 4, s, 3); }
      g.strokeStyle = 'rgba(80,50,15,0.8)'; g.lineWidth = 5; g.strokeRect(2, 2, s - 4, s - 4);
    },
    stripes: (g, s) => {
      g.fillStyle = '#e63946'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#ffffff'; for (let i = 0; i < 8; i += 2) g.fillRect((i * s) / 8, 0, s / 8, s);
    },
    glow: (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    },
    storm: (g, s) => {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 14; i++) {
        const y = (i * s) / 14, h = 8 + (i % 4) * 8;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, 'rgba(190,120,255,0)'); gr.addColorStop(0.5, `rgba(190,120,255,${0.25 + (i % 3) * 0.12})`); gr.addColorStop(1, 'rgba(190,120,255,0)');
        g.fillStyle = gr; g.fillRect(0, y, s, h);
      }
      g.fillStyle = 'rgba(210,160,255,0.2)'; for (let i = 0; i < 24; i++) g.fillRect((i * s) / 24, 0, 3, s);
    },
  }[name];
  texCache[name] = canvasTex(name === 'glow' ? 64 : 128, draw, name !== 'glow');
  return texCache[name];
}
const TEX_OF_MAT = { wood: 'wood', floor: 'floor', stone: 'stone', crate: 'crate', sand: 'sand', metal: 'metal', build: 'build' };
const matFor = (m) => {
  const name = TEX_OF_MAT[m] || 'wood';
  return mat(0xffffff, { map: texture(name), flatShading: false });
};
export { matFor };

// Una caja con las coordenadas de textura repetidas según su tamaño (cada `tile` metros, una vez).
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
  }
  return g;
}

// Una rampa: una cuña que sube hacia +x (se gira después según `dir`).
export function rampGeo(len, width, rise) {
  const hx = len / 2, hz = width / 2;
  const v = [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, rise, -hz], [-hx, 0, hz], [hx, 0, hz], [hx, rise, hz],
  ];
  const idx = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 3, 5, 0, 5, 2];
  const pos = [], uv = [];
  for (const i of idx) { pos.push(...v[i]); uv.push(v[i][0] / 2 + hx, v[i][2] / 2 + hz); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ─── Armas ───────────────────────────────────────────────────────────────────
const METAL = 0x2c3037, DARK = 0x1c1f24, WOODC = 0x7a4a24, STEEL = 0x8e969e;

function add(g, geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, l, seg = 8) => new THREE.CylinderGeometry(r, r, l, seg);
const R90 = Math.PI / 2;

// El arma apunta hacia -z. `muzzle` es un punto en la boca del caño. La franja de color marca la rareza.
export function weaponModel(kind, rarity = 0) {
  const g = new THREE.Group();
  const accent = new THREE.Color(RARITIES[rarity]?.color || '#c9ccd6');
  const acc = basic(accent);
  let len = 0.6;
  switch (kind) {
    case 'pistol':
      add(g, box(0.07, 0.1, 0.3), METAL, 0, 0, -0.1); add(g, box(0.06, 0.16, 0.08), DARK, 0, -0.12, 0.02); add(g, box(0.075, 0.02, 0.2), acc, 0, 0.055, -0.1); len = 0.3; break;
    case 'revolver':
      add(g, box(0.07, 0.12, 0.22), METAL, 0, 0, 0); add(g, cyl(0.06, 0.12, 8), STEEL, 0, 0.01, -0.12, R90, 0, 0); add(g, box(0.05, 0.06, 0.28), STEEL, 0, 0.03, -0.3); add(g, box(0.06, 0.2, 0.08), WOODC, 0, -0.15, 0.1, -0.3, 0, 0); add(g, box(0.075, 0.02, 0.2), acc, 0, 0.1, 0); len = 0.46; break;
    case 'smg':
      add(g, box(0.09, 0.13, 0.4), METAL, 0, 0, -0.1); add(g, box(0.06, 0.26, 0.07), DARK, 0, -0.2, -0.08); add(g, cyl(0.025, 0.25, 6), STEEL, 0, 0.02, -0.4, R90, 0, 0); add(g, box(0.05, 0.1, 0.22), METAL, 0, -0.02, 0.28); add(g, box(0.095, 0.02, 0.3), acc, 0, 0.075, -0.1); len = 0.52; break;
    case 'shotgun':
      add(g, box(0.08, 0.1, 0.34), METAL, 0, 0, 0); add(g, cyl(0.032, 0.8, 8), STEEL, 0, 0.03, -0.55, R90, 0, 0); add(g, cyl(0.032, 0.7, 8), STEEL, 0, -0.03, -0.5, R90, 0, 0); add(g, box(0.09, 0.08, 0.22), WOODC, 0, -0.03, -0.42); add(g, box(0.07, 0.14, 0.3), WOODC, 0, -0.02, 0.3, 0.15, 0, 0); add(g, box(0.085, 0.02, 0.3), acc, 0, 0.065, 0); len = 0.95; break;
    case 'rifle':
      add(g, box(0.08, 0.12, 0.55), METAL, 0, 0, 0); add(g, cyl(0.025, 0.4, 6), STEEL, 0, 0.02, -0.5, R90, 0, 0); add(g, box(0.07, 0.14, 0.3), DARK, 0, -0.01, 0.4); add(g, box(0.06, 0.26, 0.09), DARK, 0, -0.2, -0.04, 0.18, 0, 0); add(g, box(0.05, 0.06, 0.2), STEEL, 0, 0.11, -0.05); add(g, box(0.085, 0.02, 0.4), acc, 0, 0.07, 0.05); len = 0.72; break;
    case 'burst':
      add(g, box(0.09, 0.13, 0.5), 0x40454c, 0, 0, 0); add(g, cyl(0.03, 0.35, 6), STEEL, 0, 0.02, -0.42, R90, 0, 0); add(g, box(0.07, 0.12, 0.26), DARK, 0, -0.01, 0.38); add(g, box(0.06, 0.2, 0.08), DARK, 0, -0.17, -0.1); add(g, box(0.05, 0.07, 0.3), 0x16181c, 0, 0.1, -0.02); add(g, box(0.1, 0.025, 0.4), acc, 0, 0.075, 0.02); add(g, cyl(0.03, 0.2, 6), METAL, 0, -0.06, -0.3, R90, 0, 0); len = 0.62; break;
    case 'sniper':
      add(g, box(0.08, 0.12, 0.6), 0x2f3a2c, 0, 0, 0); add(g, cyl(0.022, 0.9, 6), STEEL, 0, 0.02, -0.75, R90, 0, 0); add(g, box(0.07, 0.14, 0.34), 0x2f3a2c, 0, -0.01, 0.46); add(g, cyl(0.05, 0.34, 10), DARK, 0, 0.13, -0.05, R90, 0, 0); add(g, cyl(0.065, 0.06, 10), 0x6fb3ff, 0, 0.13, -0.24, R90, 0, 0); add(g, box(0.04, 0.2, 0.04), METAL, -0.06, -0.12, -0.55, 0.3, 0, 0.3); add(g, box(0.04, 0.2, 0.04), METAL, 0.06, -0.12, -0.55, 0.3, 0, -0.3); add(g, box(0.085, 0.02, 0.5), acc, 0, 0.07, 0.05); len = 1.2; break;
    case 'bazooka':
      add(g, cyl(0.13, 1.1, 12), 0x4b5a3a, 0, 0.08, -0.3, R90, 0, 0); add(g, cyl(0.18, 0.18, 12), 0x30382a, 0, 0.08, -0.88, R90, 0, 0); add(g, cyl(0.09, 0.3, 10), METAL, 0, 0.08, 0.35, R90, 0, 0); add(g, box(0.06, 0.18, 0.08), DARK, 0, -0.1, -0.1); add(g, box(0.05, 0.1, 0.3), METAL, 0, 0.25, -0.2); add(g, cyl(0.135, 0.06, 12), acc, 0, 0.08, -0.55, R90, 0, 0); len = 0.9; break;
    case 'launcher':
      add(g, box(0.1, 0.16, 0.42), METAL, 0, 0, 0); add(g, cyl(0.1, 0.22, 10), 0x55603f, 0, 0.0, -0.2, R90, 0, 0); add(g, cyl(0.05, 0.5, 8), STEEL, 0, 0.03, -0.55, R90, 0, 0); add(g, box(0.06, 0.2, 0.08), DARK, 0, -0.17, 0.08, 0.2, 0, 0); add(g, box(0.07, 0.12, 0.26), DARK, 0, -0.02, 0.36); add(g, cyl(0.1, 0.04, 10), acc, 0, 0.0, -0.32, R90, 0, 0); len = 0.8; break;
    case 'minigun':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, cyl(0.022, 0.8, 6), STEEL, Math.cos(a) * 0.07, Math.sin(a) * 0.07, -0.55, R90, 0, 0); }
      add(g, box(0.2, 0.2, 0.4), 0x3a3f47, 0, 0, 0); add(g, cyl(0.1, 0.1, 10), METAL, 0, 0, -0.2, R90, 0, 0); add(g, box(0.1, 0.1, 0.18), acc, 0, 0.16, 0); add(g, box(0.06, 0.22, 0.08), DARK, 0, -0.22, -0.05); add(g, box(0.2, 0.2, 0.18), 0x2a2e34, 0, -0.1, 0.3); len = 0.95; break;
    case 'pickaxe':
      add(g, cyl(0.025, 0.85, 6), WOODC, 0, 0, -0.1, R90, 0, 0); add(g, box(0.05, 0.05, 0.55), 0xd04a3a, 0, 0, -0.55, 0, 0, 0); add(g, box(0.05, 0.22, 0.05), 0xd04a3a, 0, -0.11, -0.52); add(g, box(0.05, 0.22, 0.05), 0xd04a3a, 0, 0.11, -0.52); len = 0.8; break;
    default: add(g, box(0.1, 0.1, 0.4), METAL, 0, 0, 0);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -len);
  g.add(muzzle);
  g.userData = { muzzle, len, kind };
  return g;
}

// ─── Objetos del piso ────────────────────────────────────────────────────────
export function itemModel(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'bandage': add(g, cyl(0.16, 0.2, 14), 0xf4f1e8, 0, 0, 0, R90, 0, 0); add(g, cyl(0.17, 0.05, 14), 0xe63946, 0, 0, 0, R90, 0, 0); break;
    case 'medkit': add(g, box(0.5, 0.36, 0.3), 0xf4f4f4, 0, 0, 0); add(g, box(0.26, 0.06, 0.04), 0xe63946, 0, 0, 0.16); add(g, box(0.06, 0.26, 0.04), 0xe63946, 0, 0, 0.16); add(g, box(0.18, 0.06, 0.2), 0x888888, 0, 0.2, 0); break;
    case 'shield': add(g, cyl(0.12, 0.28, 10), basic(0x4aa0ff), 0, 0, 0); add(g, new THREE.SphereGeometry(0.17, 10, 8), basic(0x7cc0ff), 0, 0.2, 0); add(g, cyl(0.06, 0.1, 8), 0xdddddd, 0, 0.38, 0); break;
    case 'bigshield': add(g, cyl(0.18, 0.36, 10), basic(0x2f7bff), 0, 0, 0); add(g, new THREE.SphereGeometry(0.24, 10, 8), basic(0x5fa0ff), 0, 0.28, 0); add(g, cyl(0.08, 0.12, 8), 0xdddddd, 0, 0.52, 0); break;
    case 'grenade': add(g, new THREE.SphereGeometry(0.17, 10, 8), 0x4a5d34, 0, 0, 0); add(g, cyl(0.06, 0.1, 8), 0x888888, 0, 0.18, 0); add(g, new THREE.TorusGeometry(0.07, 0.015, 6, 10), 0xcccccc, 0.1, 0.22, 0); break;
    default: add(g, box(0.3, 0.3, 0.3), 0xffffff, 0, 0, 0);
  }
  return g;
}

// Un rayo de luz del color de la rareza, de abajo hacia arriba (como en Fortnite).
const beamGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 14, 1, true);
export function beam(color, height = 5) {
  const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.scale.set(1, height, 1);
  m.position.y = height / 2;
  m.renderOrder = 4;
  return m;
}
export function ring(color, r = 0.9) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -R90;
  m.position.y = 0.06;
  m.renderOrder = 3;
  return m;
}

// ─── Cofres ──────────────────────────────────────────────────────────────────
export const TIER_COLORS = { 1: 0xc9873f, 2: 0x59a8ff, 3: 0xffc233 };
export function chestModel(tier, big = false) {
  const g = new THREE.Group();
  const body = TIER_COLORS[tier] || TIER_COLORS[1];
  const dark = tier === 3 ? 0x8a5a10 : tier === 2 ? 0x2a4f80 : 0x6b3d14;
  const metal = tier === 3 ? 0xffe27a : 0xcfd6dc;
  add(g, box(1.0, 0.55, 0.62), mat(body), 0, 0.275, 0);
  add(g, box(1.04, 0.1, 0.66), dark, 0, 0.1, 0);
  add(g, box(0.1, 0.6, 0.66), metal, -0.33, 0.28, 0); add(g, box(0.1, 0.6, 0.66), metal, 0.33, 0.28, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.55, -0.31);
  add(lid, box(1.0, 0.2, 0.62), mat(body), 0, 0.1, 0.31);
  add(lid, new THREE.CylinderGeometry(0.31, 0.31, 1.0, 12, 1, false, 0, Math.PI), mat(dark), 0, 0.2, 0.31, 0, 0, R90).rotation.set(0, 0, R90);
  add(lid, box(0.12, 0.14, 0.04), metal, 0, 0.1, 0.63);
  g.add(lid);
  if (big) g.scale.setScalar(1.35);
  g.userData = { lid, tier, glow: null };
  return g;
}

// ─── El bus de batalla ───────────────────────────────────────────────────────
export function busModel() {
  const g = new THREE.Group();
  const body = (c) => basic(c);
  add(g, box(3.4, 2.4, 9), body(0x3f86ff), 0, 0, 0);
  add(g, box(3.5, 0.5, 9.1), body(0xffd23f), 0, 0.9, 0);
  add(g, box(3.2, 1.0, 3), body(0xbfe6ff), 0, 0.6, -3.3);
  for (let i = 0; i < 4; i++) add(g, box(3.45, 0.8, 1.1), body(0xbfe6ff), 0, 0.5, -0.4 + i * 1.5 - 0.4);
  for (const [x, z] of [[-1.7, -3], [1.7, -3], [-1.7, 3], [1.7, 3]]) add(g, cyl(0.7, 0.5, 12), body(0x22252b), x, -1.3, z, 0, 0, R90);
  const balloon = add(g, new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ map: texture('stripes') }), 0, 11, 0);
  balloon.scale.set(5, 4, 7.5);
  for (const [x, z] of [[-1.4, -3], [1.4, -3], [-1.4, 3], [1.4, 3]]) { const l = add(g, cyl(0.06, 7, 4), body(0x333333), x * 1.4, 5, z); l.rotation.set(z > 0 ? -0.1 : 0.1, 0, x > 0 ? 0.12 : -0.12); }
  add(g, box(0.25, 3, 0.25), body(0x444444), 0, 1.9, 4.6);
  add(g, box(2.2, 0.3, 0.8), body(0xffd23f), 0, 3.2, 4.7);
  g.scale.setScalar(1.6);
  return g;
}

// ─── El cofre del cielo ──────────────────────────────────────────────────────
export function dropModel() {
  const g = new THREE.Group();
  const crate = add(g, box(1.5, 1.5, 1.5), mat(0xffffff, { map: texture('crate'), flatShading: false }), 0, 0.75, 0);
  add(g, box(1.55, 0.2, 1.55), 0xe63946, 0, 1.5, 0); add(g, box(1.55, 0.2, 1.55), 0xe63946, 0, 0.05, 0);
  const chute = new THREE.Group();
  const dome = add(chute, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, R90), mat(0xffffff, { map: texture('stripes'), side: THREE.DoubleSide }), 0, 0, 0);
  dome.scale.set(3.4, 2.2, 3.4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 3.3, z = Math.sin(a) * 3.3, len = Math.hypot(x, z, 4.6);
    const l = add(chute, cyl(0.03, len, 4), 0xffffff, x / 2, -2.3, z / 2);
    l.lookAt(0, -4.6, 0); l.rotateX(R90);
  }
  chute.position.y = 6.2;
  g.add(chute);
  g.userData = { chute, crate };
  return g;
}

// ─── El personaje ────────────────────────────────────────────────────────────
const SKIN = [0xf1c9a0, 0xd9a577, 0x9b6a45, 0xffd9b8];
export function avatarModel(color, skinIdx = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();   // todo lo que se inclina (caída libre)
  root.add(body);
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.55);
  const jeans = 0x2d3a52;

  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.13], [legR, 0.13]]) {
    leg.position.set(x, 0.8, 0);
    add(leg, box(0.2, 0.8, 0.22), jeans, 0, -0.4, 0);
    add(leg, box(0.22, 0.14, 0.32), 0x1a1a1f, 0, -0.76, -0.04);
    body.add(leg);
  }
  const torso = add(body, box(0.52, 0.64, 0.3), mat(c), 0, 1.12, 0);
  add(body, box(0.54, 0.16, 0.32), mat(dark), 0, 0.84, 0);
  add(body, box(0.34, 0.5, 0.18), 0x3c3f46, 0, 1.15, 0.22); // mochila
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  add(head, new THREE.SphereGeometry(0.22, 12, 10), SKIN[skinIdx % SKIN.length], 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.235, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(c), 0, 0.02, 0);   // gorra
  add(head, box(0.3, 0.04, 0.2), mat(dark), 0, 0.03, -0.2);                                                // visera
  add(head, box(0.05, 0.07, 0.04), 0x15171c, -0.08, -0.01, -0.2); add(head, box(0.05, 0.07, 0.04), 0x15171c, 0.08, -0.01, -0.2);
  body.add(head);
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.36], [armR, 0.36]]) {
    arm.position.set(x, 1.4, 0);
    add(arm, box(0.15, 0.6, 0.15), mat(c), 0, -0.28, 0);
    add(arm, box(0.13, 0.13, 0.13), SKIN[skinIdx % SKIN.length], 0, -0.62, 0);
    body.add(arm);
  }
  const hand = new THREE.Object3D();
  hand.position.set(0, -0.62, 0);
  armR.add(hand);

  const glider = new THREE.Group();
  const dome = add(glider, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, R90), mat(0xffffff, { map: texture('stripes'), side: THREE.DoubleSide, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25) }), 0, 0, 0);
  dome.scale.set(2.6, 1.3, 2.6);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(Math.cos(a) * 2.5, 0.05, Math.sin(a) * 2.5, 0, -1.7, 0); }
  lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  glider.add(lines);
  glider.position.y = 3.3;
  glider.visible = false;
  root.add(glider);

  const tagCv = document.createElement('canvas');
  tagCv.width = 256; tagCv.height = 80;
  const tagTex = new THREE.CanvasTexture(tagCv);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, transparent: true }));
  tag.scale.set(2.3, 0.72, 1);
  tag.position.y = 2.45;
  tag.renderOrder = 10;
  root.add(tag);

  root.userData = { body, legL, legR, armL, armR, head, torso, hand, glider, tag, tagCv, tagTex, tagKey: '', weapon: null, weaponKey: '', phase: Math.random() * 6, tilt: 0, lean: 0 };
  return root;
}

// Dibuja el cartel de arriba del personaje: el nombre y la vida (y el escudo).
export function drawTag(av, name, hp, shield, color) {
  const u = av.userData;
  const key = `${name}|${Math.ceil(hp)}|${Math.ceil(shield)}`;
  if (u.tagKey === key) return;
  u.tagKey = key;
  const g = u.tagCv.getContext('2d');
  g.clearRect(0, 0, 256, 80);
  g.font = 'bold 30px Inter, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(name, 128, 20);
  g.fillStyle = color || '#fff';
  g.fillText(name, 128, 20);
  const bar = (y, v, c) => {
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(28, y, 200, 12);
    g.fillStyle = c; g.fillRect(30, y + 2, Math.max(0, Math.min(1, v / 100)) * 196, 8);
  };
  bar(46, shield, '#4aa0ff');
  bar(62, hp, hp > 50 ? '#4ade80' : hp > 25 ? '#ffd23f' : '#ff5a5f');
  u.tagTex.needsUpdate = true;
}

// Cambia el arma de la mano si hace falta.
export function holdWeapon(av, kind, rarity) {
  const u = av.userData;
  const key = kind ? `${kind}:${rarity}` : '';
  if (u.weaponKey === key) return;
  u.weaponKey = key;
  if (u.weapon) { u.hand.remove(u.weapon); u.weapon = null; }
  if (!kind) return;
  const m = weaponModel(kind, rarity);
  m.rotation.x = -R90;
  m.position.set(0, -0.02, -0.04);
  u.hand.add(m);
  u.weapon = m;
}

// Anima al personaje. `st`: { mode, moving, speed, pitch, kind (arma en la mano), cast, recoil, t }
export function animateAvatar(av, dt, st) {
  const u = av.userData;
  const mode = st.mode;
  u.glider.visible = mode === 'glide';
  const speed = st.moving ? st.speed : 0;
  u.phase += dt * (3 + speed * 1.55);
  const swing = st.moving ? Math.sin(u.phase) * Math.min(1, 0.45 + speed * 0.1) : 0;
  const lean = mode === 'fall' ? -1.25 : mode === 'glide' ? 0 : 0;
  u.lean += (lean - u.lean) * Math.min(1, dt * 7);
  u.body.rotation.x = u.lean;
  u.body.position.y = mode === 'fall' ? 0.3 : mode === 'glide' ? 0.15 : 0;
  const armed = st.kind && mode === 'ground';
  const aimArm = Math.PI / 2 + (st.pitch || 0) * 0.9;
  if (mode === 'fall') {
    u.legL.rotation.x = 0.3 + Math.sin(st.t * 14) * 0.15; u.legR.rotation.x = 0.3 - Math.sin(st.t * 14) * 0.15;
    u.armL.rotation.set(0, 0, 1.3); u.armR.rotation.set(0, 0, -1.3);
  } else if (mode === 'glide') {
    u.legL.rotation.x = 0.1; u.legR.rotation.x = -0.1;
    u.armL.rotation.set(Math.PI - 0.2, 0, 0.3); u.armR.rotation.set(Math.PI - 0.2, 0, -0.3);
  } else {
    u.legL.rotation.x = swing * 0.9; u.legR.rotation.x = -swing * 0.9;
    if (armed && st.kind !== 'pickaxe') {
      const recoil = (st.recoil || 0) * 0.35;
      u.armR.rotation.set(aimArm + recoil, 0, -0.08);
      u.armL.rotation.set(aimArm - 0.15 + recoil, 0, 0.55);
    } else if (st.kind === 'pickaxe' && mode === 'ground') {
      u.armR.rotation.set(0.9 + (st.swing || 0) * -2.1 + swing * 0.2, 0, -0.1);
      u.armL.rotation.set(-swing * 0.8, 0, 0.05);
    } else {
      u.armL.rotation.set(-swing * 0.8, 0, 0.05); u.armR.rotation.set(swing * 0.8, 0, -0.05);
    }
    if (st.cast) { u.armR.rotation.set(1.9, 0, 0); u.armL.rotation.set(1.9, 0, 0); }
  }
  u.head.rotation.x = mode === 'ground' ? -(st.pitch || 0) * 0.4 : 0;
  if (u.weapon) u.weapon.visible = mode === 'ground' && !st.cast;
}
