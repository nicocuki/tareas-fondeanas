// La Timba 3D: los lugares (la calle de la casita, la puerta del casino, el ascensor y los cuatro pisos). Solo dibujo: las
// medidas salen de `scenes.js` (una unidad son `UNIT` metros; `x` del plano es el eje X y `y` es el Z). Cada lugar devuelve
// `{ group, buttons, update(t, st), seats, limo }`; `buttons` son las cosas que se tocan con la mano (la botonera del
// ascensor) y `update` anima lo que se mueve (neones, fuentes, la limusina, las puertas del ascensor).
import * as THREE from 'three';
import { SCENES, UNIT } from './scenes.js';
import {
  FONT, Screen, ball, blob, box, canvasTexture, cyl, fitText, group, labelMaterial, plane, roundRect, toon,
} from './models3d.js';

const U = UNIT;
const R90 = Math.PI / 2;

// ─── Texturas que se repiten ─────────────────────────────────────────────────
const texCache = new Map();
function repeating(key, size, draw, rx = 1, ry = 1) {
  const rkey = `${key}|${rx.toFixed(2)}|${ry.toFixed(2)}`;
  let tex = texCache.get(rkey);
  if (tex) return tex;
  let base = texCache.get(key);
  if (!base) {
    base = canvasTexture(size, size, draw);
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    texCache.set(key, base);
  }
  tex = base.clone();
  tex.needsUpdate = true;
  tex.repeat.set(rx, ry);
  texCache.set(rkey, tex);
  return tex;
}

// La alfombra de cada piso (copia la del original: azul con ojos naranjas) y la de los demás pisos, más lujosas.
function carpet(theme) {
  return (g, s) => {
    if (theme === 1) {
      g.fillStyle = '#1b2563'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#16204f';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 97) % s, (i * 151) % s, 70, 0, Math.PI * 2); g.fill(); }
      const eye = (x, y, r) => {
        g.fillStyle = '#c8301e'; g.beginPath(); g.ellipse(x, y, r * 1.5, r, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f08a2a'; g.beginPath(); g.ellipse(x, y, r * 1.2, r * 0.78, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff4dc'; g.beginPath(); g.ellipse(x, y, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a1020'; g.beginPath(); g.arc(x + r * 0.12, y, r * 0.28, 0, Math.PI * 2); g.fill();
      };
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) eye(col * s / 4 + (row % 2 ? s / 8 : 0) + 30, row * s / 4 + 34, 22);
      g.strokeStyle = '#f08a2a'; g.lineWidth = 7;
      for (let row = 0; row < 4; row++) { g.beginPath(); for (let x = 0; x <= s; x += 16) g.lineTo(x, row * s / 4 + 96 + Math.sin(x / 26) * 10); g.stroke(); }
    } else if (theme === 2) {
      g.fillStyle = '#5a0f22'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c8923a'; g.lineWidth = 5;
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const x = col * s / 4 + s / 8; const y = row * s / 4 + s / 8;
        g.beginPath(); g.moveTo(x, y - 44); g.quadraticCurveTo(x + 44, y, x, y + 44); g.quadraticCurveTo(x - 44, y, x, y - 44); g.stroke();
        g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#3a0814'; g.lineWidth = 10; g.strokeRect(0, 0, s, s);
    } else if (theme === 3) {
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        g.fillStyle = (row + col) % 2 ? '#e8e4dc' : '#bdb6aa';
        g.fillRect(col * s / 2, row * s / 2, s / 2, s / 2);
      }
      g.strokeStyle = 'rgba(120,110,100,0.4)'; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo((i * 71) % s, 0); g.bezierCurveTo((i * 131) % s, s / 3, (i * 53) % s, s / 2, (i * 97) % s, s); g.stroke(); }
      g.strokeStyle = '#8a7a5a'; g.lineWidth = 4; g.strokeRect(0, 0, s / 2, s / 2); g.strokeRect(s / 2, s / 2, s / 2, s / 2);
    } else {
      g.fillStyle = '#121014'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(90,80,90,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, (i * 83) % s); g.bezierCurveTo(s / 3, (i * 37) % s, s / 2, (i * 151) % s, s, (i * 61) % s); g.stroke(); }
      g.strokeStyle = '#d8a83a'; g.lineWidth = 6;
      g.strokeRect(10, 10, s - 20, s - 20);
      g.beginPath(); g.moveTo(s / 2, 10); g.lineTo(s - 10, s / 2); g.lineTo(s / 2, s - 10); g.lineTo(10, s / 2); g.closePath(); g.stroke();
    }
  };
}
function wallpaper(theme) {
  return (g, s) => {
    if (theme === 1) {
      g.fillStyle = '#6a3a2a'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#c8902a';
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const x = col * s / 8; const y = row * s / 8;
        g.fillRect(x + ((row % 2) ? 16 : 0), y, 16, 20);
        g.fillRect(x + ((row % 2) ? 0 : 16), y + 22, 16, 18);
      }
      g.fillStyle = 'rgba(40,10,40,0.25)'; g.fillRect(0, 0, s, s);
    } else if (theme === 2) {
      g.fillStyle = '#6e1028'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#7e1830' : '#5e0c20'; g.fillRect(i * s / 8, 0, s / 8, s); }
      g.fillStyle = '#c8923a'; for (let i = 0; i < 8; i++) g.fillRect(i * s / 8, 0, 3, s);
    } else if (theme === 3) {
      g.fillStyle = '#efe6d2'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c8b48a'; g.lineWidth = 8; g.strokeRect(24, 24, s - 48, s - 48);
      g.strokeStyle = '#ddd0b4'; g.lineWidth = 3; g.strokeRect(46, 46, s - 92, s - 92);
    } else {
      g.fillStyle = '#16121a'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#d8a83a'; g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const x = i * s / 4 + s / 8;
        g.beginPath(); g.moveTo(x, s); g.lineTo(x, s * 0.35); g.lineTo(x - 30, s * 0.2); g.moveTo(x, s * 0.35); g.lineTo(x + 30, s * 0.2); g.stroke();
        g.beginPath(); g.arc(x, s * 0.12, 18, 0, Math.PI * 2); g.stroke();
      }
    }
  };
}

// Un letrero de neón (texto o dibujo con brillo) sobre fondo transparente.
function neon(draw, w, h, pw = 512, ph = 256) {
  const tex = canvasTexture(pw, ph, (g) => { g.shadowBlur = 24; draw(g, pw, ph); g.shadowBlur = 12; draw(g, pw, ph); });
  const m = plane(w, h, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  return m;
}
const neonText = (text, color, w, h, size = 120) => neon((g, pw, ph) => {
  g.shadowColor = color;
  fitText(g, text, pw / 2, ph / 2, pw - 30, size, { color: '#fff8f0', stroke: color, strokeW: 10 });
}, w, h);
const neonCrown = (color, w) => neon((g, pw, ph) => {
  g.shadowColor = color; g.strokeStyle = color; g.lineWidth = 14; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(90, 200); g.lineTo(70, 70); g.lineTo(170, 150); g.lineTo(256, 40); g.lineTo(342, 150); g.lineTo(442, 70); g.lineTo(422, 200); g.closePath(); g.stroke();
  g.strokeStyle = '#fff8e0'; g.lineWidth = 4; g.stroke();
}, w, w / 2);

// Un cuadro en la pared: un poroto muy elegante (el dueño del casino, «Don Timba»).
function portrait(w, h, bg, color) {
  const tex = canvasTexture(256, 320, (g, pw, ph) => {
    g.fillStyle = bg; g.fillRect(0, 0, pw, ph);
    g.fillStyle = color; roundRect(g, 70, 90, 116, 260, 58); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(106, 150, 22, 26, 0, 0, Math.PI * 2); g.ellipse(150, 150, 22, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#14101c'; g.beginPath(); g.arc(110, 154, 10, 0, Math.PI * 2); g.arc(146, 154, 10, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1622'; g.fillRect(80, 40, 96, 56); g.fillRect(60, 90, 136, 10);
    g.fillStyle = '#8a5a2a'; g.fillRect(150, 196, 60, 10); g.fillStyle = '#ff7a3a'; g.fillRect(206, 196, 8, 10);
    g.font = `italic 34px ${FONT}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('Don Timba', pw / 2, 300);
  });
  return group(box(w + 0.16, h + 0.16, 0.06, toon(0xd8a83a), 0, 0, -0.03), plane(w, h, toon(0xffffff, { map: tex }), 0, 0, 0.005));
}

// ─── Cosas sueltas ───────────────────────────────────────────────────────────
function palm(h = 6, sway = 0) {
  const g = new THREE.Group();
  const trunk = toon(0x8a6040);
  for (let i = 0; i < 8; i++) {
    const seg = cyl(0.17 - i * 0.008, 0.2 - i * 0.008, h / 8 + 0.02, trunk, Math.sin(i * 0.35) * 0.25, (i + 0.5) * (h / 8), 0, 8);
    g.add(seg);
  }
  const top = new THREE.Group();
  top.position.set(Math.sin(8 * 0.35) * 0.25, h, 0);
  const leaf = toon(0x2f9a4a);
  for (let i = 0; i < 7; i++) {
    const l = box(2.4, 0.05, 0.5, leaf, 1.1, -0.25, 0);
    l.rotation.z = -0.35;
    const holder = new THREE.Group();
    holder.rotation.y = (i / 7) * Math.PI * 2;
    holder.add(l);
    top.add(holder);
  }
  top.add(ball(0.3, toon(0x6a4a2a), 0, -0.1, 0, 8));
  g.add(top);
  g.userData = { top, sway };
  return g;
}

function streetLamp() {
  return group(cyl(0.07, 0.09, 4, toon(0x2a2a34), 0, 2, 0, 8), box(0.9, 0.08, 0.1, toon(0x2a2a34), 0.4, 4, 0), ball(0.2, toon(0xfff0c0, { glow: 1.2 }), 0.8, 3.85, 0, 10));
}

function sky(top, mid, bottom, stars = false) {
  const tex = canvasTexture(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, top); grd.addColorStop(0.55, mid); grd.addColorStop(1, bottom);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
  const g = group(m);
  if (stars) {
    const pts = [];
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2; const e = 0.15 + Math.random() * 1.3;
      pts.push(Math.cos(a) * Math.cos(e) * 130, Math.sin(e) * 130, Math.sin(a) * Math.cos(e) * 130);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, fog: false })));
  }
  return g;
}

// ─── La limusina ─────────────────────────────────────────────────────────────
// Larga y negra, hueca por dentro: las paredes son tablas finas (se ven de los dos lados), con ventanas oscuras, asientos
// de cuero a los costados y luces violetas en el techo. El frente mira a +x. `seats` son los lugares de adentro.
export function limo(len = 7.8) {
  const g = new THREE.Group();
  const paint = toon(0x18161e);
  const chrome = toon(0xd8dce8);
  const glass = toon(0x1a2440, { opacity: 0.45 });
  const W = 2.0; const floorY = 0.38; const roofY = 1.55; const beltY = 0.95;
  // chasis y piso
  g.add(box(len, 0.22, W, paint, 0, floorY - 0.1, 0));
  // paredes de abajo (hasta la cintura) y techo
  for (const s of [-1, 1]) {
    g.add(box(len, beltY - floorY, 0.06, paint, 0, (floorY + beltY) / 2, s * W / 2));
    g.add(box(len - 0.4, roofY - beltY, 0.03, glass, -0.2, (beltY + roofY) / 2, s * W / 2));
    for (const x of [-len / 2 + 0.3, -len / 6, len / 6, len / 2 - 1.6]) g.add(box(0.1, roofY - beltY, 0.07, paint, x, (beltY + roofY) / 2, s * W / 2));
    g.add(box(len, 0.04, 0.07, chrome, 0, beltY, s * (W / 2 + 0.01)));
  }
  g.add(box(len - 1.4, 0.06, W, paint, -0.7, roofY, 0));
  g.add(box(1.4, 0.06, W, glass, len / 2 - 0.7, roofY - 0.05, 0));
  // la trompa, el baúl, el parabrisas
  g.add(box(1.5, 0.45, W, paint, len / 2 + 0.55, floorY + 0.2, 0));
  g.add(box(0.06, roofY - beltY, W - 0.1, glass, len / 2 - 0.15, (beltY + roofY) / 2, 0));
  g.add(box(0.06, beltY - floorY + (roofY - beltY), W, paint, -len / 2, (floorY + roofY) / 2, 0));
  g.add(box(0.06, 0.4, W - 0.2, chrome, len / 2 + 1.3, floorY + 0.15, 0));
  for (const s of [-1, 1]) g.add(ball(0.12, toon(0xfff4c0, { glow: 1 }), len / 2 + 1.3, floorY + 0.25, s * 0.7, 10));
  for (const s of [-1, 1]) g.add(box(0.06, 0.12, 0.3, toon(0xff3040, { glow: 1 }), -len / 2 - 0.03, floorY + 0.35, s * 0.7));
  // ruedas
  for (const x of [len / 2 + 0.3, -len / 2 + 0.9]) for (const s of [-1, 1]) {
    const w = cyl(0.36, 0.36, 0.26, toon(0x101014), x, 0.36, s * (W / 2 - 0.05), 16);
    w.rotation.x = R90;
    const hub = cyl(0.2, 0.2, 0.28, chrome, x, 0.36, s * (W / 2 - 0.05), 12);
    hub.rotation.x = R90;
    g.add(w, hub);
  }
  // adentro: piso, asientos de cuero en U, luces violetas y un barcito
  g.add(box(len - 0.4, 0.02, W - 0.12, toon(0x2a1a3a), -0.2, floorY + 0.02, 0));
  const leather = toon(0xd8c8a8);
  for (const s of [-1, 1]) {
    g.add(box(len - 2.4, 0.22, 0.5, leather, -0.6, floorY + 0.22, s * (W / 2 - 0.3)));
    g.add(box(len - 2.4, 0.4, 0.12, leather, -0.6, floorY + 0.5, s * (W / 2 - 0.1)));
  }
  g.add(box(0.5, 0.22, W - 0.2, leather, -len / 2 + 0.3, floorY + 0.22, 0), box(0.12, 0.4, W - 0.2, leather, -len / 2 + 0.1, floorY + 0.5, 0));
  g.add(box(0.6, 0.5, 0.9, toon(0x4a2a1a), len / 2 - 1.9, floorY + 0.25, 0));
  for (let i = 0; i < 3; i++) g.add(cyl(0.04, 0.04, 0.2, toon([0x6ad4ff, 0xff6a9a, 0xffe27a][i], { glow: 0.6, opacity: 0.8 }), len / 2 - 1.9, floorY + 0.6, -0.25 + i * 0.25, 8));
  for (const s of [-1, 1]) g.add(box(len - 1.8, 0.03, 0.05, toon(0xb46bf0, { glow: 1.4 }), -0.5, roofY - 0.05, s * 0.75));
  // la puerta de atrás (donde se sube)
  const door = box(0.9, 0.55, 0.07, toon(0x22202a), -len / 2 + 1.2, (floorY + beltY) / 2 + 0.05, -W / 2 - 0.03);
  g.add(door, box(0.18, 0.04, 0.04, chrome, -len / 2 + 1.5, beltY - 0.12, -W / 2 - 0.07));
  // dónde se sienta cada uno (en metros, relativos al centro de la limusina)
  const seats = [];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    seats.push({ x: -len / 2 + 1.2 + Math.floor(i / 2) * 1.05, z: side * (W / 2 - 0.36), yaw: side > 0 ? 0 : Math.PI });
  }
  g.userData = { seats, door, eyeY: floorY + 0.75 };
  return g;
}

// La camioneta de la tienda (todavía vacía).
function van() {
  const g = new THREE.Group();
  const paint = toon(0xf0e0b0);
  g.add(box(3.8, 1.8, 1.9, paint, 0, 1.25, 0));
  g.add(box(0.9, 1.1, 1.9, paint, 2.3, 0.9, 0));
  g.add(box(0.05, 0.6, 1.6, toon(0x2a3a5a, { opacity: 0.7 }), 2.76, 1.25, 0));
  g.add(box(3.84, 0.14, 1.94, toon(0xe0525a), 0, 0.75, 0));
  const sign = canvasTexture(512, 192, (c, w, h) => {
    c.fillStyle = '#e0525a'; roundRect(c, 0, 0, w, h, 30); c.fill();
    fitText(c, 'TIENDA', w / 2, 70, w - 40, 90, { color: '#fff', stroke: '#7a1a2a', strokeW: 10 });
    fitText(c, 'items con tickets dorados', w / 2, 150, w - 40, 40, { color: '#ffe27a' });
  });
  g.add(plane(2.4, 0.9, toon(0xffffff, { map: sign }), 0, 1.45, -0.96));
  g.children[g.children.length - 1].rotation.y = Math.PI;
  g.add(box(1.6, 0.06, 0.6, toon(0xc8303a), -0.4, 2.0, -1.2));
  for (const x of [1.9, -1.2]) for (const s of [-1, 1]) {
    const w = cyl(0.4, 0.4, 0.3, toon(0x101014), x, 0.4, s * 0.85, 14);
    w.rotation.x = R90;
    g.add(w);
  }
  return g;
}

// La casita de la sala de espera.
function house() {
  const g = new THREE.Group();
  const W = 5.8; const D = 4.5;
  g.add(box(W, 3, D, toon(0x8fc4e8), 0, 1.5, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.9, 4), toon(0xc8503a));
  roof.position.y = 3.9; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8);
  g.add(roof);
  g.add(box(1.1, 2.1, 0.1, toon(0x7a4a2a), 0.6, 1.05, D / 2 + 0.03));
  g.add(ball(0.06, toon(0xf0c33c), 1.0, 1.05, D / 2 + 0.1, 8));
  for (const x of [-1.7, 2.1]) g.add(box(1.1, 0.9, 0.08, toon(0xffe6a0, { glow: 0.6 }), x, 1.7, D / 2 + 0.03), box(1.25, 0.08, 0.12, toon(0xffffff), x, 1.22, D / 2 + 0.05));
  g.add(box(W + 0.3, 0.2, 1.4, toon(0xa88a6a), 0, 0.1, D / 2 + 0.7));
  g.add(cyl(0.05, 0.05, 1.1, toon(0x6a4a2a), -2.6, 0.55, D / 2 + 1.6, 6), box(0.4, 0.3, 0.25, toon(0x4a7ae8), -2.6, 1.2, D / 2 + 1.6));
  return g;
}

function ground(len, { night }) {
  const g = new THREE.Group();
  const road = repeating('road', 256, (c, s) => {
    c.fillStyle = night ? '#2a2a34' : '#3a3a44'; c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 200; i++) c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    c.fillStyle = '#f0d04a'; c.fillRect(0, s / 2 - 5, s / 2, 10);
  }, len / 4, 1);
  const r = plane(len + 80, 8, toon(0xffffff, { map: road }), len / 2, 0, 5.3);
  r.rotation.x = -R90;
  const walk = repeating('walk', 128, (c, s) => {
    c.fillStyle = '#bcb4a8'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#9a9488'; c.lineWidth = 4; c.strokeRect(0, 0, s, s);
  }, (len + 80) / 1.5, 3.2 / 1.5);
  const w = plane(len + 80, 3.2, toon(0xffffff, { map: walk }), len / 2, 0.08, -0.1);
  w.rotation.x = -R90;
  const curb = box(len + 80, 0.16, 0.25, toon(0x8a8478), len / 2, 0.08, 1.4);
  const grass = plane(len + 80, 40, toon(night ? 0x2a4a3a : 0x5aa84a), len / 2, -0.01, -21.5);
  grass.rotation.x = -R90;
  const far = plane(len + 120, 60, toon(night ? 0x1c1c26 : 0x4a8a3a), len / 2, -0.02, 38);
  far.rotation.x = -R90;
  g.add(r, w, curb, grass, far);
  return g;
}

// ─── La calle de la casita (sala de espera) ──────────────────────────────────
function buildWait() {
  const sc = SCENES.wait;
  const g = new THREE.Group();
  const len = sc.w * U;
  g.add(sky('#2a1b6e', '#c8507a', '#ffc078'));
  g.add(ground(len, { night: false }));
  const h = house();
  h.position.set((sc.house.x + sc.house.w / 2) * U, 0, -4.1);
  g.add(h);
  const v = van();
  v.position.set((sc.van.x + sc.van.w / 2) * U, 0, 2.7);
  v.rotation.y = Math.PI;
  g.add(v);
  const l = limo();
  const limoX = (sc.limo.x + sc.limo.w / 2) * U - 0.6;
  l.position.set(limoX, 0, 2.7);
  g.add(l);
  // casas y árboles atrás, palmeras y faroles
  const palms = [];
  for (const [x, z, hh] of [[-1, -3, 6], [8, -2.4, 7], [13.5, -2.6, 6.5], [21.5, -2.8, 7.2], [24, 4.8, 6]]) { const p = palm(hh, x); p.position.set(x, 0, z); g.add(p); palms.push(p); }
  for (const x of [4, 11, 18]) { const s = streetLamp(); s.position.set(x, 0, 1.25); s.rotation.y = -R90; g.add(s); }
  const tints = [0xe8a0b0, 0xa0e0b0, 0xf0d890, 0xb0a0e8];
  for (let i = 0; i < 7; i++) {
    const hb = house();
    hb.scale.setScalar(0.9);
    hb.position.set(-14 + i * 7.5, 0, -14 - (i % 2) * 3);
    hb.children[0].material = toon(tints[i % 4]);
    g.add(hb);
  }
  for (let i = 0; i < 9; i++) g.add(box(6 + (i % 3) * 3, 10 + (i * 7) % 14, 5, toon(0x6a4a8a), -20 + i * 7, 6, 30 + (i % 2) * 6));
  const lights = [
    new THREE.HemisphereLight(0xffd0e0, 0x6a5a8a, 1.6),
    new THREE.DirectionalLight(0xffc89a, 1.6),
  ];
  lights[1].position.set(-20, 18, 14);
  return {
    group: g, lights, fog: [0xc8709a, 30, 110], buttons: [], limo: l,
    update(t, st) {
      for (const p of palms) p.userData.top.rotation.z = Math.sin(t * 0.8 + p.userData.sway) * 0.05;
      l.position.x = limoX + (st.limoGo ** 2) * 40;
      l.userData.door.position.z = -1.03 - (st.limoDoor > 0.5 ? 0.0 : 0);
      l.userData.door.rotation.y = st.limoDoor * 1.1;
    },
  };
}

// ─── La puerta del casino (de noche) ─────────────────────────────────────────
function buildOutside() {
  const sc = SCENES.outside;
  const g = new THREE.Group();
  const len = sc.w * U;
  g.add(sky('#06081c', '#1a1450', '#3a2a6a', true));
  g.add(ground(len, { night: true }));
  const e0 = sc.entrance.x * U; const e1 = (sc.entrance.x + sc.entrance.w) * U;
  const door = sc.doorX * U;
  // el edificio: una pared enorme con ventanas, columnas doradas, la marquesina y el cartel
  const facade = toon(0x6a2c7a);
  g.add(box(30, 18, 1, facade, door, 9, -3.2));
  const lit = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) {
    const x = door - 13 + col * 2; const y = 6 + row * 2.4;
    if (Math.abs(x - door) < 4 && y < 9) continue;
    const w = box(1.1, 1.4, 0.06, toon((row + col) % 3 ? 0xffd27a : 0xff9ac8, { glow: 0.9 }), x, y, -2.68);
    lit.push(w);
    g.add(w);
  }
  for (const x of [e0 + 0.6, e0 + 2.1, e1 - 2.1, e1 - 0.6]) g.add(cyl(0.25, 0.3, 4.6, toon(0xe8b04a), x, 2.3, -2.2, 14), box(0.8, 0.3, 0.8, toon(0xc8923a), x, 4.7, -2.2));
  const marquee = box(e1 - e0 + 1.2, 0.5, 2.2, toon(0xa8242e), door, 4.9, -1.5);
  g.add(marquee);
  const bulbs = [];
  for (let i = 0; i < 26; i++) { const b = ball(0.07, toon(0xffe6a0, { glow: 1.4 }), e0 - 0.4 + i * ((e1 - e0 + 0.8) / 25), 4.62, -0.42, 6); bulbs.push(b); g.add(b); }
  const sign = neonText('LA TIMBA', '#ff3a8a', 8, 2.4, 150);
  sign.position.set(door, 7.2, -2.6);
  const sub = neonText('CASINO', '#ffd23a', 3.6, 1, 120);
  sub.position.set(door, 5.7, -2.6);
  g.add(sign, sub);
  // la puerta giratoria de vidrio
  const rev = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const wing = box(1.2, 2.6, 0.04, toon(0x9adcf0, { opacity: 0.45 }), 0.6, 1.3, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2;
    holder.add(wing);
    rev.add(holder);
  }
  rev.add(cyl(0.06, 0.06, 2.6, toon(0xe8b04a), 0, 1.3, 0, 8), cyl(1.35, 1.35, 0.2, toon(0xe8b04a), 0, 2.7, 0, 24));
  rev.position.set(door, 0, -2.25);
  g.add(rev);
  // la alfombra roja con sus postes y cordones
  const rug = plane(1.8, 3.4, toon(0xb8242e), door, 0.1, -0.9);
  rug.rotation.x = -R90;
  g.add(rug);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(cyl(0.05, 0.08, 0.95, toon(0xe8b04a), door + s * 1.1, 0.5, 0.4 - i * 1.0, 8), ball(0.08, toon(0xe8b04a), door + s * 1.1, 1.0, 0.4 - i * 1.0, 8));
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const rope = cyl(0.025, 0.025, 1.0, toon(0x8a1d2a), door + s * 1.1, 0.85, -0.1 - i, 6); rope.rotation.x = R90; g.add(rope); }
  // la limusina de vuelta, palmeras y reflectores
  const l = limo();
  const limoX = (sc.limo.x + sc.limo.w / 2) * U - 0.6;
  l.position.set(limoX, 0, 2.7);
  g.add(l);
  const palms = [];
  for (const [x, z, hh] of [[0.5, -2.2, 6.5], [10.5, -2.2, 7], [20.8, -2.2, 6.8], [9, 9, 6]]) { const p = palm(hh, x); p.position.set(x, 0, z); g.add(p); palms.push(p); }
  for (const x of [3, 9]) { const s = streetLamp(); s.position.set(x, 0, 1.25); s.rotation.y = -R90; g.add(s); }
  const beams = [];
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfa8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.geometry.translate(0, -15, 0);
    const holder = new THREE.Group();
    holder.position.set(door + s * 9, 0.5, -4);
    beam.rotation.x = Math.PI;
    holder.add(beam);
    g.add(holder);
    beams.push(holder);
  }
  for (let i = 0; i < 10; i++) g.add(box(7, 14 + (i * 5) % 16, 6, toon(0x1a1438), -18 + i * 8, 8, 28 + (i % 2) * 5));
  const lights = [new THREE.HemisphereLight(0x9a8aff, 0x3a2a4a, 1.8), new THREE.DirectionalLight(0xffb0d8, 1.1), new THREE.PointLight(0xffc06a, 40, 16, 2), new THREE.PointLight(0xff6ab8, 25, 14, 2)];
  lights[1].position.set(10, 14, 10);
  lights[2].position.set(door, 4, 0);
  lights[3].position.set(e0 - 3, 4, 0);
  return {
    group: g, lights, fog: [0x140c30, 25, 90], buttons: [], limo: l,
    update(t, st) {
      for (const p of palms) p.userData.top.rotation.z = Math.sin(t * 0.7 + p.userData.sway) * 0.04;
      bulbs.forEach((b, i) => { b.visible = (Math.floor(t * 4) + i) % 3 !== 0; });
      sign.material.opacity = 0.85 + Math.sin(t * 13) * 0.08 + (Math.sin(t * 1.3) > 0.97 ? -0.5 : 0);
      rev.rotation.y = t * 0.6;
      beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.5 + i * 2) * 0.5; b.rotation.x = Math.cos(t * 0.4 + i) * 0.2; });
      l.position.x = limoX + (st.limoGo ** 2) * 40;
      l.userData.door.rotation.y = st.limoDoor * 1.1;
      lit.forEach((w, i) => { if ((i * 7 + Math.floor(t * 0.5)) % 23 === 0) w.visible = !w.visible; });
    },
  };
}

// ─── El ascensor ─────────────────────────────────────────────────────────────
// Bronce y madera, alfombra roja, el botones en la esquina y la botonera con los pisos en la pared de la derecha.
function buildElevator(st0) {
  const sc = SCENES.elevator;
  const g = new THREE.Group();
  const x0 = 30 * U; const x1 = 270 * U; const z0 = 30 * U; const z1 = 222 * U; const H = 2.9;
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  const wood = toon(0x6a3a22);
  const brass = toon(0xd8a83a);
  const rug = plane(x1 - x0, z1 - z0, toon(0x9a1a2a), cx, 0.001, cz);
  rug.rotation.x = -R90;
  const ceil = plane(x1 - x0, z1 - z0, toon(0x2a1a14), cx, H, cz);
  ceil.rotation.x = R90;
  g.add(rug, ceil);
  // paredes (por dentro) con paneles
  const wall = (w, x, z, ry) => { const p = plane(w, H, wood, x, H / 2, z); p.rotation.y = ry; g.add(p); return p; };
  wall(x1 - x0, cx, z0, 0);
  wall(z1 - z0, x0, cz, R90);
  wall(z1 - z0, x1, cz, -R90);
  const doorL = sc.door.x * U; const doorR = (sc.door.x + sc.door.w) * U;
  for (const [a, b] of [[x0, doorL], [doorR, x1]]) { const p = plane(b - a, H, wood, (a + b) / 2, H / 2, z1); p.rotation.y = Math.PI; g.add(p); }
  const top = plane(doorR - doorL, H - 2.3, wood, (doorL + doorR) / 2, 2.3 + (H - 2.3) / 2, z1);
  top.rotation.y = Math.PI;
  g.add(top);
  // pasamanos y espejo
  g.add(box(x1 - x0 - 0.2, 0.05, 0.05, brass, cx, 0.95, z0 + 0.08));
  g.add(box(0.05, 0.05, z1 - z0 - 0.2, brass, x0 + 0.08, 0.95, cz));
  const mirror = plane(1.8, 1.4, toon(0x9ab4c8, { glow: 0.25 }), cx, 1.6, z0 + 0.025);
  g.add(mirror, box(1.9, 1.5, 0.02, brass, cx, 1.6, z0 + 0.005));
  for (let i = 0; i < 3; i++) g.add(ball(0.12, toon(0xfff0c0, { glow: 1.2 }), cx - 1 + i, H - 0.08, cz, 10));
  // las puertas (de afuera hacia el piso), que se abren hacia los costados
  const doors = [];
  for (const s of [-1, 1]) { const d = box((doorR - doorL) / 2, 2.3, 0.06, brass, (doorL + doorR) / 2 + s * (doorR - doorL) / 4, 1.15, z1 + 0.04); doors.push({ m: d, s, base: d.position.x }); g.add(d); }
  // del otro lado de la puerta: el pasillo del piso donde está parado el ascensor, con su cartel
  const hall = new THREE.Group();
  const hz = z1 + 0.1; const hd = 3;
  const hf = plane(doorR - doorL + 2, hd, toon(0x9a1a2a), (doorL + doorR) / 2, 0.002, hz + hd / 2);
  hf.rotation.x = -R90;
  const hb = plane(doorR - doorL + 2, H, toon(0x6a2c7a), (doorL + doorR) / 2, H / 2, hz + hd);
  hb.rotation.y = Math.PI;
  hall.add(hf, hb);
  for (const s of [-1, 1]) { const w = plane(hd, H, toon(0x4a1c5a), (doorL + doorR) / 2 + s * (doorR - doorL + 2) / 2, H / 2, hz + hd / 2); w.rotation.y = -s * R90; hall.add(w); }
  const hallSign = new Screen(1.6, 0.6, 400, 150);
  hallSign.mesh.position.set((doorL + doorR) / 2, 1.9, hz + hd - 0.02);
  hallSign.mesh.rotation.y = Math.PI;
  hall.add(hallSign.mesh, ball(0.15, toon(0xffe6a0, { glow: 1.2 }), (doorL + doorR) / 2, H - 0.3, hz + hd / 2, 10));
  g.add(hall);
  // el número del piso arriba de la puerta
  const display = new Screen(0.7, 0.3, 256, 110);
  display.mesh.position.set((doorL + doorR) / 2, 2.55, z1 - 0.02);
  display.mesh.rotation.y = Math.PI;
  g.add(display.mesh);
  // el botones
  const npc = blob(0x8a4ae8, { hat: 'cap' });
  npc.position.set(sc.npc.x * U, 0, sc.npc.y * U);
  npc.rotation.y = Math.atan2(cx - npc.position.x, cz + 0.6 - npc.position.z);
  g.add(npc);
  // la botonera: una placa de bronce con los botones de los pisos (L abajo) en la pared de la derecha
  const panel = new THREE.Group();
  panel.position.set(x1 - 0.02, 1.4, sc.panel.y * U);
  panel.rotation.y = -R90;
  panel.add(box(0.42, 0.95, 0.03, brass, 0, 0, 0));
  const buttons = [];
  [0, 1, 2, 3, 4].forEach((f, i) => {
    const b = cyl(0.06, 0.06, 0.04, labelMaterial(f === 0 ? 'L' : String(f), '#f4ead0', '#3a2a12', { w: 128, h: 128, size: 80 }), 0, -0.34 + i * 0.17, 0.03, 18);
    b.rotation.x = R90;
    b.userData.btn = { scope: 'elev', id: `floor:${f}`, label: f === 0 ? 'PLANTA BAJA' : `PISO ${f}` };
    b.userData.rest = b.position.z;
    panel.add(b);
    buttons.push(b);
  });
  const help = new Screen(0.4, 0.16, 256, 100);
  help.mesh.position.set(0, 0.6, 0.02);
  panel.add(help.mesh);
  g.add(panel);
  const lights = [new THREE.HemisphereLight(0xffe6c0, 0x5a2a1a, 1.4), new THREE.PointLight(0xffd8a0, 8, 6, 2), new THREE.DirectionalLight(0xfff0d0, 0.6)];
  lights[1].position.set(cx, H - 0.3, cz);
  lights[2].position.set(cx + 1, H, cz + 2);
  return {
    group: g, lights, fog: null, buttons, npc,
    update(t, st) {
      for (const d of doors) d.m.position.x = d.base + d.s * (doorR - doorL) * 0.48 * st.doorOpen;
      hallSign.draw(`${st.elevFloor}`, (c, w, h) => {
        c.fillStyle = '#1a0a1a'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#f0c33c'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
        fitText(c, st.elevFloor === 0 ? 'SALIDA A LA CALLE' : `PISO ${st.elevFloor} · CASINO`, w / 2, h / 2 + 4, w - 40, 60, { color: '#ffe6a0' });
      });
      display.draw(`${st.floorLabel}|${st.moving}|${Math.floor(t * 2) % 2}`, (c, w, h) => {
        c.fillStyle = '#1a0a08'; c.fillRect(0, 0, w, h);
        fitText(c, st.floorLabel, w / 2, h / 2 + 4, w - 20, 84, { font: '"Pixelify Sans", monospace', color: '#ffb03a' });
        if (st.moving) { c.fillStyle = '#ffb03a'; c.beginPath(); const up = st.goingUp; c.moveTo(30, up ? 70 : 40); c.lineTo(50, up ? 40 : 70); c.lineTo(70, up ? 70 : 40); c.fill(); }
      });
      help.draw(st.allIn ? 'ok' : `w${st.missing}`, (c, w, h) => {
        c.fillStyle = '#2a1a0a'; c.fillRect(0, 0, w, h);
        fitText(c, st.allIn ? 'TOCÁ UN PISO' : `FALTAN ${st.missing}`, w / 2, h / 2 + 4, w - 16, 52, { font: '"Pixelify Sans", monospace', color: st.allIn ? '#7aff8a' : '#ff8a6a' });
      });
      for (const b of buttons) {
        const f = Number(b.userData.btn.id.split(':')[1]);
        const lit = f === st.elevFloor || f === st.tripTo;
        b.material = labelMaterial(f === 0 ? 'L' : String(f), lit ? '#ffd23a' : st.floors.includes(f) ? '#f4ead0' : '#6a6050', '#3a2a12', { w: 128, h: 128, size: 80 });
      }
      npc.rotation.z = Math.sin(t * 1.5) * 0.02;
    },
    initial: st0,
  };
}

// ─── Un piso del casino ──────────────────────────────────────────────────────
const THEME = {
  1: { ceil: 0x2a1650, glow: 0x6a5aff, glow2: 0xb46bf0, light: 0xb8a8ff, trim: 0xc8923a, neon: ['#ffd23a', '#ff3a8a', '#3ad8ff'] },
  2: { ceil: 0x2a0a18, glow: 0xc8306a, glow2: 0x9a3a8a, light: 0xffb0c0, trim: 0xd8a83a, neon: ['#ff4a6a', '#ffd23a', '#ff8a3a'] },
  3: { ceil: 0xe8e0d0, glow: 0xfff0c8, glow2: 0x9adcff, light: 0xfff4e0, trim: 0xb8a070, neon: ['#3ad8ff', '#ffd23a', '#ffffff'] },
  4: { ceil: 0x14100a, glow: 0x8a6a1a, glow2: 0x3a2a12, light: 0xffe0a0, trim: 0xe8b84a, neon: ['#ffd23a', '#ffe8a0', '#ff6a3a'] },
};

function decorModel(d, n) {
  const g = new THREE.Group();
  const cx = (d.x + d.w / 2) * U; const cz = (d.y + d.h / 2) * U;
  g.position.set(cx, 0, cz);
  const gold = toon(0xe8b84a);
  if (d.kind === 'plant') {
    g.add(cyl(0.28, 0.22, 0.5, toon(0xc8603a), 0, 0.25, 0, 12));
    for (let i = 0; i < 6; i++) { const l = ball(0.22, toon(i % 2 ? 0x2f9a4a : 0x3fba5a), Math.cos(i) * 0.15, 0.7 + (i % 3) * 0.25, Math.sin(i) * 0.15, 8); l.scale.set(0.8, 1.5, 0.8); g.add(l); }
  } else if (d.kind === 'column') {
    g.add(cyl(0.28, 0.32, 4.2, toon(0x8a1a2e), 0, 2.1, 0, 16), box(0.8, 0.25, 0.8, gold, 0, 0.12, 0), box(0.8, 0.3, 0.8, gold, 0, 4.05, 0));
    for (let i = 0; i < 3; i++) g.add(cyl(0.34, 0.34, 0.06, gold, 0, 1 + i * 1.1, 0, 16));
  } else if (d.kind === 'vase') {
    g.add(cyl(0.18, 0.28, 0.3, toon(0x2a5aa8), 0, 0.15, 0, 14), cyl(0.32, 0.18, 0.6, toon(0x2a5aa8), 0, 0.6, 0, 14), cyl(0.15, 0.32, 0.3, toon(0x2a5aa8), 0, 1.05, 0, 14), cyl(0.2, 0.15, 0.12, gold, 0, 1.26, 0, 14));
    for (let i = 0; i < 5; i++) g.add(ball(0.09, toon([0xff4a6a, 0xffd23a, 0xff9ac8][i % 3]), Math.cos(i * 1.3) * 0.18, 1.45 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.18, 8));
  } else if (d.kind === 'statue') {
    const stone = n === 4 ? gold : toon(0xf0ece4);
    g.add(box(0.6, 0.9, 0.6, toon(n === 4 ? 0x1a1414 : 0xd8d0c4), 0, 0.45, 0));
    const fig = blob(0xf0ece4, { hat: n === 4 ? 'top' : '', scale: 0.85 });
    fig.traverse((o) => { if (o.isMesh) o.material = stone; });
    fig.position.y = 0.9;
    g.add(fig);
  } else if (d.kind === 'fountain') {
    const w = d.w * U; const dd = d.h * U;
    const rim = toon(n === 4 ? 0xe8b84a : 0xe8e4dc);
    const basin = cyl(Math.min(w, dd) / 2, Math.min(w, dd) / 2 + 0.05, 0.55, rim, 0, 0.27, 0, 28);
    basin.scale.set(w / Math.min(w, dd), 1, dd / Math.min(w, dd));
    const water = cyl(Math.min(w, dd) / 2 - 0.08, Math.min(w, dd) / 2 - 0.08, 0.02, toon(0x4ab8e8, { glow: 0.35, opacity: 0.85 }), 0, 0.5, 0, 28);
    water.scale.copy(basin.scale);
    g.add(basin, water, cyl(0.12, 0.16, 1.4, rim, 0, 0.9, 0, 12), cyl(0.5, 0.3, 0.12, rim, 0, 1.6, 0, 18));
    const jets = [];
    for (let i = 0; i < 8; i++) { const j = ball(0.05, toon(0x9ae4ff, { glow: 0.6, opacity: 0.8 }), 0, 1.7, 0, 6); jets.push(j); g.add(j); }
    g.userData.jets = jets;
  }
  return g;
}

function buildFloor(n) {
  const sc = SCENES[`f${n}`];
  const th = THEME[n];
  const g = new THREE.Group();
  const W = sc.w * U; const D = sc.h * U; const H = 4.4;
  const x0 = 56 * U; const x1 = (sc.w - 56) * U; const z0 = 66 * U; const z1 = (sc.h - 46) * U;
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  // piso, techo y paredes
  const floorTex = repeating(`carpet${n}`, 512, carpet(n), (x1 - x0) / (n === 3 ? 3 : 4), (z1 - z0) / (n === 3 ? 3 : 4));
  const fl = plane(x1 - x0 + 0.4, z1 - z0 + 0.4, toon(0xffffff, { map: floorTex }), cx, 0, cz);
  fl.rotation.x = -R90;
  const ce = plane(x1 - x0, z1 - z0, toon(th.ceil), cx, H, cz);
  ce.rotation.x = R90;
  g.add(fl, ce);
  const wallTex = (len) => repeating(`wall${n}`, 256, wallpaper(n), len / 2.2, H / 2.2);
  const doorZ0 = (sc.h / 2 - 60) * U; const doorZ1 = (sc.h / 2 + 60) * U;
  const wall = (len, x, z, ry) => { const p = plane(len, H, toon(0xffffff, { map: wallTex(len) }), x, H / 2, z); p.rotation.y = ry; g.add(p); return p; };
  wall(x1 - x0, cx, z0, 0);
  const back = wall(x1 - x0, cx, z1, Math.PI);
  wall(z1 - z0, x1, cz, -R90);
  wall(doorZ0 - z0, x0, (z0 + doorZ0) / 2, R90);
  wall(z1 - doorZ1, x0, (doorZ1 + z1) / 2, R90);
  const lintel = plane(doorZ1 - doorZ0, H - 2.5, toon(0xffffff, { map: wallTex(doorZ1 - doorZ0) }), x0, 2.5 + (H - 2.5) / 2, (doorZ0 + doorZ1) / 2);
  lintel.rotation.y = R90;
  g.add(lintel);
  // zócalo y moldura
  const trim = toon(th.trim);
  for (const [len, x, z, ry] of [[x1 - x0, cx, z0 + 0.03, 0], [x1 - x0, cx, z1 - 0.03, 0], [z1 - z0, x0 + 0.03, cz, R90], [z1 - z0, x1 - 0.03, cz, R90]]) {
    const b = box(len, 0.22, 0.06, toon(0x2a1a14), x, 0.11, z); b.rotation.y = ry; g.add(b);
    const m = box(len, 0.14, 0.08, trim, x, H - 0.3, z); m.rotation.y = ry; g.add(m);
  }
  // el ascensor: un nicho en la pared de la izquierda con puertas doradas y el número del piso arriba
  const niche = toon(0x2a1a14);
  const nx0 = 20 * U;
  const nf = plane(x0 - nx0, doorZ1 - doorZ0, toon(0x9a1a2a), (x0 + nx0) / 2, 0.005, (doorZ0 + doorZ1) / 2);
  nf.rotation.x = -R90;
  g.add(nf);
  for (const z of [doorZ0, doorZ1]) { const s = plane(x0 - nx0, 2.5, niche, (x0 + nx0) / 2, 1.25, z); s.rotation.y = z === doorZ0 ? 0 : Math.PI; g.add(s); }
  for (const s of [-1, 1]) g.add(box(0.06, 2.3, (doorZ1 - doorZ0) / 2 - 0.05, toon(0xd8a83a), nx0, 1.15, (doorZ0 + doorZ1) / 2 + s * (doorZ1 - doorZ0) / 4));
  g.add(box(0.1, 0.25, doorZ1 - doorZ0 + 0.3, toon(th.trim), x0 + 0.02, 2.6, (doorZ0 + doorZ1) / 2));
  const lbl = plane(0.8, 0.34, labelMaterial(`PISO ${n}`, '#1a0a08', '#ffb03a', { w: 256, h: 110, size: 60, font: '"Pixelify Sans", monospace' }), x0 + 0.08, 3.0, (doorZ0 + doorZ1) / 2);
  lbl.rotation.y = R90;
  g.add(lbl, plane(0.5, 0.3, labelMaterial('ASCENSOR', '#2a1a14', '#ffe6a0', { w: 256, h: 128, size: 54 }), x0 + 0.08, 2.0, doorZ1 + 0.45));
  g.children[g.children.length - 1].rotation.y = R90;
  // el techo: paneles que brillan (azul y violeta, como en el original) y lámparas
  const glowA = toon(th.glow, { glow: 1 });
  const glowB = toon(th.glow2, { glow: 1 });
  const cols = Math.max(2, Math.round((x1 - x0) / 6));
  const rows = Math.max(2, Math.round((z1 - z0) / 5));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const p = plane((x1 - x0) / cols - 0.9, (z1 - z0) / rows - 0.9, (i + j) % 2 ? glowA : glowB, x0 + (i + 0.5) * (x1 - x0) / cols, H - 0.02, z0 + (j + 0.5) * (z1 - z0) / rows);
    p.rotation.x = R90;
    g.add(p);
  }
  // decoración del casino (también son obstáculos en `scenes.js`)
  const fountains = [];
  for (const d of sc.decor) { const m = decorModel(d, n); g.add(m); if (m.userData.jets) fountains.push(m); }
  // carteles de neón y cuadros en las paredes
  const neons = [];
  const crown = neonCrown(th.neon[0], 2.6);
  crown.position.set(x1 - 0.05, 3.1, cz - 2);
  crown.rotation.y = -R90;
  const word = neonText(['LA TIMBA', 'TERCIOPELO', 'MÁRMOL', 'DORADO'][n - 1], th.neon[1], 4.2, 1.2, 130);
  word.position.set(cx, 3.35, z1 - 0.05);
  word.rotation.y = Math.PI;
  const lucky = neonText(['¡SUERTE!', '$$$', '★ VIP ★', '♛ VIP ♛'][n - 1], th.neon[2], 2.6, 0.9, 120);
  lucky.position.set(x1 - 0.05, 3.2, cz + 3);
  lucky.rotation.y = -R90;
  g.add(crown, word, lucky);
  neons.push(crown, word, lucky);
  for (const [x, z, ry] of [[cx - (x1 - x0) * 0.3, z1 - 0.04, Math.PI], [cx + (x1 - x0) * 0.3, z1 - 0.04, Math.PI], [x0 + 0.04, z0 + 2.2, R90]]) {
    const p = portrait(1.2, 1.5, ['#2a3a8a', '#4a0a1a', '#8a7a5a', '#1a1414'][n - 1], ['#e0525a', '#4a9be8', '#5ec46b', '#f0c33c'][n - 1]);
    p.position.set(x, 2.3, z);
    p.rotation.y = ry;
    g.add(p);
  }
  // cortinas en el piso de terciopelo, araña dorada en el piso 4 y el palco VIP
  if (n === 2) {
    for (let i = 0; i < 6; i++) {
      const x = x0 + 2 + i * (x1 - x0 - 4) / 5;
      for (const s of [-1, 1]) { const c = box(0.5, H - 0.4, 0.12, toon(0x8a0a24), x + s * 0.4, (H - 0.4) / 2, z1 - 0.12); g.add(c); }
      g.add(box(1.5, 0.2, 0.2, toon(0xd8a83a), x, H - 0.35, z1 - 0.15));
    }
  }
  let chandelier = null;
  if (n === 3 || n === 4) {
    chandelier = new THREE.Group();
    chandelier.position.set(cx, H - 0.2, cz);
    chandelier.add(cyl(0.05, 0.05, 0.6, toon(0xe8b84a), 0, -0.3, 0, 8), cyl(1.4, 0.9, 0.3, toon(0xe8b84a, { glow: 0.3 }), 0, -0.7, 0, 24));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      chandelier.add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), toon(0xfff2c0, { glow: 1.1 })));
      chandelier.children[chandelier.children.length - 1].position.set(Math.cos(a) * 1.2, -1.05, Math.sin(a) * 1.2);
      chandelier.children[chandelier.children.length - 1].rotation.x = Math.PI;
    }
    g.add(chandelier);
  }
  if (n === 4) {
    const vip = new THREE.Group();
    vip.position.set(cx, 0, z0 + 0.6);
    vip.add(box(8, 0.2, 1.1, toon(0x1a1414), 0, 2.6, 0), box(8, 0.08, 0.08, toon(0xe8b84a), 0, 3.5, 0.55));
    for (let i = 0; i <= 10; i++) vip.add(cyl(0.03, 0.03, 0.9, toon(0xe8b84a), -4 + i * 0.8, 3.05, 0.55, 6));
    vip.add(plane(2, 0.6, labelMaterial('PALCO VIP', '#1a1414', '#ffd23a', { w: 256, h: 80, size: 54 }), 0, 4.0, 0.2));
    g.add(vip);
  }
  // luces: una general, una que marca el sombreado de dibujito y unas pocas lámparas (cada luz cuesta)
  const lights = [new THREE.HemisphereLight(th.light, 0x2a1a2a, n === 3 ? 1.3 : 1.15), new THREE.DirectionalLight(0xffffff, 0.9)];
  lights[1].position.set(cx + 6, H + 6, cz + 10);
  lights[1].target.position.set(cx, 0, cz);
  lights.push(lights[1].target);
  const spots = Math.min(4, Math.max(2, Math.round((x1 - x0) / 10)));
  for (let i = 0; i < spots; i++) {
    const l = new THREE.PointLight(th.glow2, 14, 16, 2);
    l.position.set(x0 + (i + 0.5) * (x1 - x0) / spots, H - 0.6, cz);
    lights.push(l);
  }
  return {
    group: g, lights, fog: null, buttons: [],
    update(t) {
      neons.forEach((m, i) => { m.material.opacity = 0.85 + Math.sin(t * (9 + i * 3)) * 0.07 + (Math.sin(t * 0.9 + i * 2) > 0.985 ? -0.6 : 0); });
      for (const f of fountains) f.userData.jets.forEach((j, i) => {
        const u = ((t * 0.9 + i / 8) % 1);
        const a = (i / 8) * Math.PI * 2;
        j.position.set(Math.cos(a) * u * 0.55, 1.7 + u * 0.7 - u * u * 1.2, Math.sin(a) * u * 0.55);
      });
      if (chandelier) chandelier.rotation.y = Math.sin(t * 0.3) * 0.05;
      back.visible = true;
    },
  };
}

// El lugar que corresponde a cada escena (`sceneKey` de scenes.js).
export function buildPlace(key, st) {
  if (key === 'wait') return buildWait();
  if (key === 'outside') return buildOutside();
  if (key === 'elevator') return buildElevator(st);
  const n = Number(key.slice(1));
  return buildFloor(n);
}
