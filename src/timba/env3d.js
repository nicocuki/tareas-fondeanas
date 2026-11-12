// La Timba 3D: los lugares (la calle de la casita, la puerta del casino, el ascensor y los cuatro pisos). Solo dibujo: las
// medidas salen de `scenes.js` (una unidad son `UNIT` metros; `x` del plano es el eje X y `y` es el Z). Cada lugar devuelve
// `{ group, buttons, update(t, st), seats, limo }`; `buttons` son las cosas que se tocan con la mano (la botonera del
// ascensor) y `update` anima lo que se mueve (neones, fuentes, la limusina, las puertas del ascensor).
import * as THREE from 'three';
import { SCENES, UNIT, canStand, heightAt } from './scenes.js';
import {
  FONT, Screen, animateBlob, ball, blob, box, canvasTexture, cyl, fitText, group, labelMaterial, plane, roundRect, toon,
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
// La casita de la sala de espera (9 × 5,4 m, la puerta mira a +z).
function house(W = 9, D = 5.4) {
  const g = new THREE.Group();
  g.add(box(W, 3.4, D, toon(0x8fc4e8), 0, 1.7, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 2.4, 4), toon(0xc8503a));
  roof.position.y = 4.6; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, D / W + 0.1);
  g.add(roof);
  g.add(box(1.2, 2.3, 0.1, toon(0x7a4a2a), 0, 1.15 + 0.45, D / 2 + 0.03), ball(0.06, toon(0xf0c33c), 0.42, 1.6, D / 2 + 0.1, 8));
  for (const x of [-2.8, 2.8]) g.add(box(1.4, 1.1, 0.08, toon(0xffe6a0, { glow: 0.6 }), x, 1.9, D / 2 + 0.03), box(1.55, 0.08, 0.14, toon(0xffffff), x, 1.32, D / 2 + 0.05));
  // el alero del porche con sus postes
  g.add(box(7.6, 0.12, 1.9, toon(0xa8503a), 0, 3.0, D / 2 + 0.9));
  for (const x of [-3.6, 3.6]) g.add(cyl(0.08, 0.08, 2.6, toon(0xf4f0e6), x, 1.75, D / 2 + 1.7, 8));
  return g;
}

// Un rectángulo del plano (en unidades) como piso, a la altura `h`.
function floorRect(r, material, h = 0) {
  const m = plane(r.w * U, r.h * U, material, (r.x + r.w / 2) * U, h, (r.y + r.h / 2) * U);
  m.rotation.x = -R90;
  return m;
}

// Las tarimas, el porche, la terraza y el palco (macizos hasta el piso) y sus escaleras, escalón por escalón. La altura
// por la que se camina sale de `heightAt` (las escaleras son rampas parejas: los escalones son solo dibujo).
function buildLevels(sc, { top, side, step, edge }) {
  const g = new THREE.Group();
  for (const l of sc.levels || []) {
    g.add(box(l.w * U, l.z, l.h * U, side, (l.x + l.w / 2) * U, l.z / 2, (l.y + l.h / 2) * U));
    g.add(floorRect(l, top, l.z + 0.003));
    if (edge) g.add(box(l.w * U + 0.06, 0.06, l.h * U + 0.06, edge, (l.x + l.w / 2) * U, l.z - 0.035, (l.y + l.h / 2) * U)); // un borde dorado, apenas abajo del piso
  }
  for (const st of sc.stairs || []) {
    const n = Math.max(3, Math.round((st.z1 - st.z0) / 0.16));
    for (let i = 0; i < n; i++) {
      const h = st.z0 + ((i + 1) * (st.z1 - st.z0)) / n;
      let r;
      if (st.up === 'n') r = { x: st.x, y: st.y + st.h - ((i + 1) * st.h) / n, w: st.w, h: st.h / n };
      else if (st.up === 's') r = { x: st.x, y: st.y + (i * st.h) / n, w: st.w, h: st.h / n };
      else if (st.up === 'e') r = { x: st.x + (i * st.w) / n, y: st.y, w: st.w / n, h: st.h };
      else r = { x: st.x + st.w - ((i + 1) * st.w) / n, y: st.y, w: st.w / n, h: st.h };
      g.add(box(r.w * U, h, r.h * U, i % 2 ? side : step, (r.x + r.w / 2) * U, h / 2, (r.y + r.h / 2) * U));
    }
  }
  return g;
}

// Una baranda dorada de (x0, z0) a (x1, z1) en metros, a la altura `h`.
function railing(x0, z0, x1, z1, h, material) {
  const g = new THREE.Group();
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) g.add(cyl(0.03, 0.03, 0.95, material, x0 + ((x1 - x0) * i) / n, h + 0.47, z0 + ((z1 - z0) * i) / n, 6));
  const bar = box(len, 0.06, 0.06, material, (x0 + x1) / 2, h + 0.95, (z0 + z1) / 2);
  bar.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  g.add(bar);
  return g;
}

const asphalt = (night) => repeating(night ? 'roadN' : 'road', 256, (c, s) => {
  c.fillStyle = night ? '#2a2a34' : '#3a3a44'; c.fillRect(0, 0, s, s);
  c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 200; i++) c.fillRect((i * 97) % s, (i * 61) % s, 2, 2);
}, 6, 2);
const paving = (key, a, b) => repeating(key, 128, (c, s) => {
  c.fillStyle = a; c.fillRect(0, 0, s, s);
  c.fillStyle = b; c.fillRect(0, 0, s / 2, s / 2); c.fillRect(s / 2, s / 2, s / 2, s / 2);
  c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 3; c.strokeRect(0, 0, s, s);
}, 20, 20);

// ─── La calle de la casita (sala de espera) ──────────────────────────────────
function buildWait() {
  const sc = SCENES.wait;
  const g = new THREE.Group();
  const L = sc.w * U;
  g.add(sky('#2a1b6e', '#c8507a', '#ffc078'));
  // el jardín, la vereda, el cordón, la calle con su línea amarilla y la vereda de enfrente
  g.add(floorRect({ x: -2000, y: -2000, w: sc.w + 4000, h: 1900 }, toon(0x5aa84a), -0.01));
  g.add(floorRect({ x: -2000, y: -100, w: sc.w + 4000, h: 180 }, toon(0xffffff, { map: paving('walk', '#c8c0b4', '#bcb4a8') }), 0.005));
  g.add(box(L + 60, 0.16, 0.25, toon(0x8a8478), L / 2, 0.08, 80 * U));
  g.add(floorRect({ x: -2000, y: 80, w: sc.w + 4000, h: 900 }, toon(0xffffff, { map: asphalt(false) }), 0.002));
  for (let x = -1800; x < sc.w + 1800; x += 300) g.add(floorRect({ x, y: 520, w: 150, h: 14 }, toon(0xf0d04a), 0.006));
  g.add(floorRect({ x: -2000, y: 980, w: sc.w + 4000, h: 200 }, toon(0xbcb4a8), 0.01));
  // la casa con su porche y escalones, el buzón, la cerca
  const h = house();
  h.position.set((sc.house.x + sc.house.w / 2) * U, 0, (sc.house.y + sc.house.h / 2) * U);
  g.add(h, buildLevels(sc, { top: toon(0xb8906a), side: toon(0x8a6a4a), step: toon(0xa8805a) }));
  g.add(cyl(0.05, 0.05, 1.1, toon(0x6a4a2a), 165 * U, 0.55, -315 * U, 6), box(0.45, 0.32, 0.28, toon(0x4a7ae8), 165 * U, 1.2, -315 * U));
  for (let x = -600; x < sc.w + 600; x += 70) if (x < 200 || x > 800) g.add(box(0.08, 0.9, 0.08, toon(0xf4f0e6), x * U, 0.45, -405 * U));
  g.add(box((sc.w + 1200) * U, 0.06, 0.05, toon(0xf4f0e6), (sc.w / 2) * U, 0.75, -405 * U));
  // la camioneta y la limusina, estacionadas
  const v = van();
  v.position.set((sc.van.x + sc.van.w / 2) * U, 0, (sc.van.y + sc.van.h / 2) * U);
  v.rotation.y = Math.PI;
  g.add(v);
  const l = limo();
  const limoX = (sc.limo.x + sc.limo.w / 2) * U - 0.6;
  l.position.set(limoX, 0, (sc.limo.y + sc.limo.h / 2) * U);
  g.add(l);
  // palmeras, faroles y el barrio
  const palms = [];
  for (const [x, z, hh] of [[60, -250, 7], [1000, -250, 6.5], [1700, -250, 7.5], [2300, -250, 6.8], [600, 1100, 7], [1500, 1100, 6.5]]) { const p = palm(hh, x); p.position.set(x * U, 0, z * U); g.add(p); palms.push(p); }
  for (const x of [1300, 2200]) { const s = streetLamp(); s.position.set(x * U + 0.18, 0, -28 * U); s.rotation.y = -R90; g.add(s); }
  const tints = [0xe8a0b0, 0xa0e0b0, 0xf0d890, 0xb0a0e8];
  for (let i = 0; i < 8; i++) {
    const hb = house();
    hb.position.set((-900 + i * 600) * U, 0, (i % 2 ? 1500 : 1450) * U);
    hb.rotation.y = Math.PI;
    hb.children[0].material = toon(tints[i % 4]);
    g.add(hb);
  }
  for (let i = 0; i < 6; i++) {
    if (i === 2) continue;
    const hb = house(); hb.position.set((-1300 + i * 900) * U, 0, -1000 * U); hb.children[0].material = toon(tints[(i + 1) % 4]); g.add(hb);
  }
  for (let i = 0; i < 9; i++) g.add(box(9, 12 + (i * 7) % 16, 7, toon(0x6a4a8a), -30 + i * 14, 7, 45 + (i % 2) * 8));
  const lights = [new THREE.HemisphereLight(0xffd0e0, 0x6a5a8a, 1.6), new THREE.DirectionalLight(0xffc89a, 1.6)];
  lights[1].position.set(-20, 18, 14);
  return {
    group: g, lights, fog: [0xc8709a, 40, 130], buttons: [], limo: l,
    update(t, st) {
      for (const p of palms) p.userData.top.rotation.z = Math.sin(t * 0.8 + p.userData.sway) * 0.05;
      l.position.x = limoX + (st.limoGo ** 2) * 45;
      l.userData.door.rotation.y = st.limoDoor * 1.1;
    },
  };
}

// ─── La puerta del casino (de noche) ─────────────────────────────────────────
// La calle donde deja la limusina, la plaza con la fuente, la escalinata y la terraza con la fachada.
function buildOutside() {
  const sc = SCENES.outside;
  const g = new THREE.Group();
  const L = sc.w * U;
  const door = sc.doorX * U;
  const fz = sc.terrace.y * U; // la fachada
  const tz = sc.terrace.z;
  g.add(sky('#06081c', '#1a1450', '#3a2a6a', true));
  g.add(floorRect({ x: -3000, y: 200, w: sc.w + 6000, h: 1400 }, toon(0xffffff, { map: asphalt(true) }), 0));
  g.add(box(L + 100, 0.16, 0.25, toon(0x6a6478), L / 2, 0.08, 200 * U));
  g.add(floorRect({ x: -3000, y: -1400, w: sc.w + 6000, h: 1600 }, toon(0xffffff, { map: paving('plaza', '#8a7a9a', '#7a6a8a') }), 0.004));
  g.add(floorRect({ x: 1200, y: -700, w: 200, h: 900 }, toon(0xa8242e), 0.008));
  // la escalinata y la terraza de mármol, con barandas doradas
  const gold = toon(0xe8b04a);
  g.add(buildLevels(sc, { top: toon(0xd8d0e4), side: toon(0xb8b0c8), step: toon(0xe8e0f0) }));
  g.add(floorRect({ x: 1200, y: -1300, w: 200, h: 400 }, toon(0xa8242e), tz + 0.01));
  const tx0 = sc.terrace.x * U; const tx1 = (sc.terrace.x + sc.terrace.w) * U; const tf = (sc.terrace.y + sc.terrace.h) * U;
  const s0 = sc.stairs[0].x * U; const s1 = (sc.stairs[0].x + sc.stairs[0].w) * U;
  g.add(railing(tx0, tf, s0, tf, tz, gold), railing(s1, tf, tx1, tf, tz, gold), railing(tx0, fz, tx0, tf, tz, gold), railing(tx1, fz, tx1, tf, tz, gold));
  // la fuente de la plaza
  const fc = { x: (sc.fountain.x + sc.fountain.w / 2) * U, z: (sc.fountain.y + sc.fountain.h / 2) * U };
  const fr = (sc.fountain.w / 2) * U;
  g.add(cyl(fr, fr + 0.1, 0.6, toon(0xd8d0e4), fc.x, 0.3, fc.z, 32), cyl(fr - 0.15, fr - 0.15, 0.02, toon(0x4ab8e8, { glow: 0.5, opacity: 0.85 }), fc.x, 0.58, fc.z, 32));
  g.add(cyl(0.25, 0.35, 1.8, toon(0xd8d0e4), fc.x, 1.2, fc.z, 14), cyl(1.1, 0.6, 0.2, toon(0xd8d0e4), fc.x, 2.1, fc.z, 24));
  const fig = blob(0xe8b04a, { hat: 'top', scale: 0.9 });
  fig.traverse((o) => { if (o.isMesh) o.material = gold; });
  fig.position.set(fc.x, 2.2, fc.z);
  g.add(fig);
  const jets = [];
  for (let i = 0; i < 16; i++) { const j = ball(0.07, toon(0x9ae4ff, { glow: 0.7, opacity: 0.8 }), fc.x, 2.2, fc.z, 6); jets.push(j); g.add(j); }
  // la fachada: una pared enorme con ventanas, columnas doradas, la marquesina y el cartel
  g.add(box(L + 20, 26, 1, toon(0x6a2c7a), door, 13, fz - 0.5));
  const lit = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 18; col++) {
    const x = door - 17 + col * 2; const y = tz + 7 + row * 2.6;
    if (Math.abs(x - door) < 8.5 && y < tz + 13) continue; // ahí van los carteles
    const w = box(1.1, 1.5, 0.06, toon((row + col) % 3 ? 0xffd27a : 0xff9ac8, { glow: 0.9 }), x, y, fz + 0.02);
    lit.push(w);
    g.add(w);
  }
  for (const x of [-6, -3.4, 3.4, 6]) g.add(cyl(0.35, 0.42, 5.4, gold, door + x, tz + 2.7, fz + 1.3, 14), box(1.1, 0.4, 1.1, toon(0xc8923a), door + x, tz + 5.5, fz + 1.3));
  g.add(box(14, 0.6, 3.4, toon(0xa8242e), door, tz + 5.9, fz + 1.6));
  const bulbs = [];
  for (let i = 0; i < 40; i++) { const b = ball(0.08, toon(0xffe6a0, { glow: 1.4 }), door - 7 + i * (14 / 39), tz + 5.55, fz + 3.32, 6); bulbs.push(b); g.add(b); }
  const sign = neonText('LA TIMBA', '#ff3a8a', 14, 4, 150);
  sign.position.set(door, tz + 10, fz + 0.05);
  const sub = neonText('CASINO', '#ffd23a', 6, 1.6, 120);
  sub.position.set(door, tz + 7.4, fz + 0.05);
  g.add(sign, sub);
  // la puerta giratoria de vidrio
  const rev = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2;
    holder.add(box(1.3, 2.8, 0.04, toon(0x9adcf0, { opacity: 0.45 }), 0.65, 1.4, 0));
    rev.add(holder);
  }
  rev.add(cyl(0.06, 0.06, 2.8, gold, 0, 1.4, 0, 8), cyl(1.45, 1.45, 0.24, gold, 0, 2.9, 0, 24));
  rev.position.set(door, tz, fz + 0.4);
  g.add(rev);
  // la limusina de vuelta, palmeras y reflectores
  const l = limo();
  const limoX = (sc.limo.x + sc.limo.w / 2) * U - 0.6;
  l.position.set(limoX, 0, (sc.limo.y + sc.limo.h / 2) * U);
  g.add(l);
  const palms = [];
  for (const [x, z, hh] of [[312, -28, 7], [712, -28, 6.5], [1912, -28, 7.2], [2312, -28, 6.8], [300, -1000, 8], [2300, -1000, 8], [-400, 800, 7], [3000, 800, 7]]) { const p = palm(hh, x); p.position.set(x * U, 0, z * U); g.add(p); palms.push(p); }
  const beams = [];
  for (const sx of [-14, 14]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfa8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.geometry.translate(0, -20, 0);
    beam.rotation.x = Math.PI;
    const holder = new THREE.Group();
    holder.position.set(door + sx, tz, fz + 1);
    holder.add(beam);
    g.add(holder);
    beams.push(holder);
  }
  for (let i = 0; i < 12; i++) g.add(box(9, 18 + (i * 5) % 18, 8, toon(0x1a1438), -30 + i * 10, 10, 40 + (i % 2) * 6));
  const lights = [new THREE.HemisphereLight(0x9a8aff, 0x3a2a4a, 1.8), new THREE.DirectionalLight(0xffb0d8, 1.1), new THREE.PointLight(0xffc06a, 60, 22, 2), new THREE.PointLight(0x6ab8ff, 30, 14, 2)];
  lights[1].position.set(10, 20, 10);
  lights[2].position.set(door, tz + 5, fz + 4);
  lights[3].position.set(fc.x, 3, fc.z);
  return {
    group: g, lights, fog: [0x140c30, 35, 120], buttons: [], limo: l,
    update(t, st) {
      for (const p of palms) p.userData.top.rotation.z = Math.sin(t * 0.7 + p.userData.sway) * 0.04;
      bulbs.forEach((b, i) => { b.visible = (Math.floor(t * 4) + i) % 3 !== 0; });
      sign.material.opacity = 0.85 + Math.sin(t * 13) * 0.08 + (Math.sin(t * 1.3) > 0.97 ? -0.5 : 0);
      rev.rotation.y = t * 0.6;
      beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 0.5 + i * 2) * 0.5; b.rotation.x = Math.cos(t * 0.4 + i) * 0.2; });
      jets.forEach((j, i) => {
        const u = (t * 0.7 + i / 16) % 1; const a = (i / 16) * Math.PI * 2;
        j.position.set(fc.x + Math.cos(a) * u * 1.6, 2.4 + u * 1.2 - u * u * 2.0, fc.z + Math.sin(a) * u * 1.6);
      });
      l.position.x = limoX + (st.limoGo ** 2) * 45;
      l.userData.door.rotation.y = st.limoDoor * 1.1;
      lit.forEach((w, i) => { if ((i * 7 + Math.floor(t * 0.5)) % 29 === 0) w.visible = !w.visible; });
    },
  };
}

// ─── El ascensor ─────────────────────────────────────────────────────────────
// Bronce y madera, alfombra roja, el botones en la esquina y la botonera con los pisos en la pared de la derecha.
function buildElevator(st0) {
  const sc = SCENES.elevator;
  const g = new THREE.Group();
  const a0 = sc.areas[0];
  const x0 = a0.x * U; const x1 = (a0.x + a0.w) * U; const z0 = a0.y * U; const z1 = (a0.y + a0.h) * U; const H = 3.3;
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  const wood = toon(0x6a3a22);
  const panelW = toon(0x7a4a2a);
  const brass = toon(0xd8a83a);
  g.add(floorRect({ x: a0.x, y: a0.y, w: a0.w, h: a0.h }, toon(0x9a1a2a), 0.001));
  const ceil = plane(x1 - x0, z1 - z0, toon(0x2a1a14), cx, H, cz);
  ceil.rotation.x = R90;
  g.add(ceil);
  const wall = (w, x, z, ry) => { const p = plane(w, H, wood, x, H / 2, z); p.rotation.y = ry; g.add(p); return p; };
  wall(x1 - x0, cx, z0, 0);
  wall(z1 - z0, x0, cz, R90);
  wall(z1 - z0, x1, cz, -R90);
  const doorL = sc.door.x * U; const doorR = (sc.door.x + sc.door.w) * U;
  for (const [a, b] of [[x0, doorL], [doorR, x1]]) { const p = plane(b - a, H, wood, (a + b) / 2, H / 2, z1); p.rotation.y = Math.PI; g.add(p); }
  const top = plane(doorR - doorL, H - 2.5, wood, (doorL + doorR) / 2, 2.5 + (H - 2.5) / 2, z1);
  top.rotation.y = Math.PI;
  g.add(top);
  // paneles de madera más clara y pasamanos
  for (let i = 0; i < 4; i++) g.add(box((x1 - x0) / 4 - 0.25, 1.6, 0.02, panelW, x0 + (i + 0.5) * ((x1 - x0) / 4), 1.4, z0 + 0.02));
  g.add(box(x1 - x0 - 0.2, 0.05, 0.05, brass, cx, 0.95, z0 + 0.1), box(0.05, 0.05, z1 - z0 - 0.2, brass, x0 + 0.1, 0.95, cz));
  const mirror = plane(2.2, 1.5, toon(0x9ab4c8, { glow: 0.25 }), cx, 1.7, z0 + 0.04);
  g.add(box(2.3, 1.6, 0.02, brass, cx, 1.7, z0 + 0.02), mirror);
  for (let i = 0; i < 3; i++) g.add(ball(0.13, toon(0xfff0c0, { glow: 1.2 }), x0 + (i + 1) * ((x1 - x0) / 4), H - 0.08, cz, 10));
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
  const doors = [];
  for (const s of [-1, 1]) { const d = box((doorR - doorL) / 2, 2.5, 0.06, brass, (doorL + doorR) / 2 + s * (doorR - doorL) / 4, 1.25, z1 + 0.04); doors.push({ m: d, s, base: d.position.x }); g.add(d); }
  const display = new Screen(0.7, 0.3, 256, 110);
  display.mesh.position.set((doorL + doorR) / 2, 2.8, z1 - 0.02);
  display.mesh.rotation.y = Math.PI;
  g.add(display.mesh);
  const npc = blob(0x8a4ae8, { hat: 'cap' });
  npc.position.set(sc.npc.x * U, 0, sc.npc.y * U);
  npc.rotation.y = Math.atan2(cx - npc.position.x, cz + 0.6 - npc.position.z);
  g.add(npc);
  // la botonera
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
  const lights = [new THREE.HemisphereLight(0xffe6c0, 0x5a2a1a, 1.4), new THREE.PointLight(0xffd8a0, 10, 8, 2), new THREE.DirectionalLight(0xfff0d0, 0.6)];
  lights[1].position.set(cx, H - 0.3, cz);
  lights[2].position.set(cx + 1, H, cz + 2);
  return {
    group: g, lights, fog: null, buttons, npc, initial: st0,
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
  };
}

// ─── Un piso del casino ──────────────────────────────────────────────────────
const THEME = {
  1: { ceil: 0x2a1650, glow: 0x6a5aff, glow2: 0xb46bf0, light: 0xb8a8ff, trim: 0xc8923a, dais: 0x6a3a22, daisTop: 0x8a1a2a, neon: ['#ffd23a', '#ff3a8a', '#3ad8ff'] },
  2: { ceil: 0x2a0a18, glow: 0xc8306a, glow2: 0x9a3a8a, light: 0xffb0c0, trim: 0xd8a83a, dais: 0x3a1a12, daisTop: 0x5a2a1a, neon: ['#ff4a6a', '#ffd23a', '#ff8a3a'] },
  3: { ceil: 0xe8e0d0, glow: 0xfff0c8, glow2: 0x9adcff, light: 0xfff4e0, trim: 0xb8a070, dais: 0xd8d0c4, daisTop: 0xf0ece4, neon: ['#3ad8ff', '#ffd23a', '#ffffff'] },
  4: { ceil: 0x14100a, glow: 0x8a6a1a, glow2: 0x3a2a12, light: 0xffe0a0, trim: 0xe8b84a, dais: 0x1a1414, daisTop: 0x2a2220, neon: ['#ffd23a', '#ffe8a0', '#ff6a3a'] },
};

function decorModel(d, n, sceneKey) {
  const g = new THREE.Group();
  const cx = (d.x + d.w / 2) * U; const cz = (d.y + d.h / 2) * U;
  g.position.set(cx, heightAt(sceneKey, d.x + d.w / 2, d.y + d.h / 2), cz);
  const gold = toon(0xe8b84a);
  if (d.kind === 'plant') {
    g.add(cyl(0.3, 0.24, 0.55, toon(0xc8603a), 0, 0.27, 0, 12));
    for (let i = 0; i < 7; i++) { const l = ball(0.26, toon(i % 2 ? 0x2f9a4a : 0x3fba5a), Math.cos(i) * 0.18, 0.8 + (i % 3) * 0.3, Math.sin(i) * 0.18, 8); l.scale.set(0.8, 1.5, 0.8); g.add(l); }
  } else if (d.kind === 'column') {
    g.add(cyl(0.3, 0.34, 6.6, toon(0x8a1a2e), 0, 3.3, 0, 16), box(0.85, 0.3, 0.85, gold, 0, 0.15, 0), box(0.85, 0.35, 0.85, gold, 0, 6.6, 0));
    for (let i = 0; i < 4; i++) g.add(cyl(0.36, 0.36, 0.06, gold, 0, 1.2 + i * 1.4, 0, 16));
  } else if (d.kind === 'vase') {
    g.add(cyl(0.18, 0.28, 0.3, toon(0x2a5aa8), 0, 0.15, 0, 14), cyl(0.32, 0.18, 0.6, toon(0x2a5aa8), 0, 0.6, 0, 14), cyl(0.15, 0.32, 0.3, toon(0x2a5aa8), 0, 1.05, 0, 14), cyl(0.2, 0.15, 0.12, gold, 0, 1.26, 0, 14));
    for (let i = 0; i < 5; i++) g.add(ball(0.09, toon([0xff4a6a, 0xffd23a, 0xff9ac8][i % 3]), Math.cos(i * 1.3) * 0.18, 1.45 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.18, 8));
  } else if (d.kind === 'statue') {
    const stone = n === 4 ? gold : toon(0xf0ece4);
    const s = Math.min(d.w, d.h) / 40;
    g.add(box(0.6 * s, 0.9, 0.6 * s, toon(n === 4 ? 0x1a1414 : 0xd8d0c4), 0, 0.45, 0));
    const fig = blob(0xf0ece4, { hat: n === 4 ? 'top' : '', scale: 0.85 * s });
    fig.traverse((o) => { if (o.isMesh) o.material = stone; });
    fig.position.y = 0.9;
    g.add(fig);
  } else if (d.kind === 'fountain') {
    const w = d.w * U; const dd = d.h * U; const m = Math.min(w, dd);
    const rim = toon(n === 4 ? 0xe8b84a : 0xe8e4dc);
    const basin = cyl(m / 2, m / 2 + 0.05, 0.6, rim, 0, 0.3, 0, 32);
    basin.scale.set(w / m, 1, dd / m);
    const water = cyl(m / 2 - 0.1, m / 2 - 0.1, 0.02, toon(0x4ab8e8, { glow: 0.35, opacity: 0.85 }), 0, 0.56, 0, 32);
    water.scale.copy(basin.scale);
    g.add(basin, water, cyl(0.14, 0.2, 1.6, rim, 0, 1.0, 0, 12), cyl(0.7, 0.35, 0.14, rim, 0, 1.8, 0, 20), cyl(0.1, 0.14, 0.7, rim, 0, 2.2, 0, 10));
    const jets = [];
    for (let i = 0; i < 10; i++) { const j = ball(0.06, toon(0x9ae4ff, { glow: 0.6, opacity: 0.8 }), 0, 1.9, 0, 6); jets.push(j); g.add(j); }
    g.userData.jets = jets;
    g.userData.spread = m * 0.45;
  } else if (d.kind === 'bar') {
    // una barra con forma de pastilla, el barman en el medio, botellas y banquetas alrededor
    const w = d.w * U; const dd = d.h * U;
    const wood = toon(0x5a2a1a);
    g.add(box(w - dd, 1.1, dd, wood, 0, 0.55, 0), cyl(dd / 2, dd / 2, 1.1, wood, -(w - dd) / 2, 0.55, 0, 20), cyl(dd / 2, dd / 2, 1.1, wood, (w - dd) / 2, 0.55, 0, 20));
    g.add(box(w - dd, 0.06, dd + 0.12, gold, 0, 1.13, 0), cyl(dd / 2 + 0.06, dd / 2 + 0.06, 0.06, gold, -(w - dd) / 2, 1.13, 0, 20), cyl(dd / 2 + 0.06, dd / 2 + 0.06, 0.06, gold, (w - dd) / 2, 1.13, 0, 20));
    g.add(box(w * 0.5, 1.3, 0.35, toon(0x2a1a14), 0, 1.75, 0));
    for (let i = 0; i < 14; i++) g.add(cyl(0.04, 0.05, 0.28, toon([0x3ec85a, 0xc8303a, 0xf0c33c, 0x6ab4ff][i % 4], { glow: 0.3, opacity: 0.9 }), -w * 0.22 + i * (w * 0.44 / 13), 2.0 + (i % 2) * 0.35, 0.2, 8));
    const barman = blob(0x3a8a6a, { bow: true });
    barman.position.set(0.9, 0, 0);
    barman.rotation.y = 0.4;
    g.add(barman);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const sx = Math.cos(a) * (w / 2 + 0.55); const sz = Math.sin(a) * (dd / 2 + 0.55);
      g.add(cyl(0.2, 0.2, 0.08, toon(0xc8303a), sx, 0.75, sz, 14), cyl(0.04, 0.06, 0.72, toon(0x8a8a9a), sx, 0.36, sz, 8));
    }
    const sign = neonText('BAR', '#3ad8ff', 2.4, 0.9, 140);
    sign.position.set(0, 3.0, 0.2);
    g.add(sign);
  } else if (d.kind === 'piano') {
    // un piano de cola con su pianista y un reflector
    const black = toon(0x14101c);
    g.add(box(1.6, 0.35, 1.1, black, 0, 0.9, 0), box(1.6, 0.04, 1.1, black, 0, 1.4, -0.35));
    g.children[g.children.length - 1].rotation.x = 0.5;
    for (const [x, z] of [[-0.7, -0.45], [0.7, -0.45], [0, 0.45]]) g.add(cyl(0.05, 0.05, 0.75, black, x, 0.37, z, 8));
    g.add(box(1.4, 0.05, 0.18, toon(0xf4f0e6), 0, 1.0, 0.6));
    const pianist = blob(0xf08ab8, { hat: 'top', bow: true });
    pianist.position.set(0, 0, 1.2);
    pianist.rotation.y = Math.PI;
    g.add(pianist);
    const spot = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    spot.position.set(0, 3.0, 0.4);
    g.add(spot);
  } else if (d.kind === 'sofa') {
    const velvet = toon(0x6a1a5a);
    const w = d.w * U; const dd = d.h * U;
    g.add(box(w, 0.45, dd, velvet, 0, 0.22, 0), box(w, 0.6, 0.25, velvet, 0, 0.6, dd / 2 - 0.12), box(0.25, 0.4, dd, velvet, -w / 2 + 0.12, 0.5, 0), box(0.25, 0.4, dd, velvet, w / 2 - 0.12, 0.5, 0));
  }
  return g;
}

function buildFloor(n) {
  const key = `f${n}`;
  const sc = SCENES[key];
  const th = THEME[n];
  const g = new THREE.Group();
  const H = 7;
  const x0 = 56 * U; const x1 = (sc.w - 56) * U; const z0 = 66 * U; const z1 = (sc.h - 46) * U;
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  // piso, techo y paredes
  const floorTex = repeating(`carpet${n}`, 512, carpet(n), (x1 - x0) / (n === 3 ? 3 : 4), (z1 - z0) / (n === 3 ? 3 : 4));
  const fl = plane(x1 - x0 + 0.4, z1 - z0 + 0.4, toon(0xffffff, { map: floorTex }), cx, 0, cz);
  fl.rotation.x = -R90;
  const ce = plane(x1 - x0, z1 - z0, toon(th.ceil), cx, H, cz);
  ce.rotation.x = R90;
  g.add(fl, ce);
  const wallTex = (len) => repeating(`wall${n}`, 256, wallpaper(n), len / 2.4, H / 2.4);
  const dz0 = sc.door.y * U; const dz1 = (sc.door.y + sc.door.w) * U;
  const wall = (len, x, z, ry) => { const p = plane(len, H, toon(0xffffff, { map: wallTex(len) }), x, H / 2, z); p.rotation.y = ry; g.add(p); return p; };
  wall(x1 - x0, cx, z0, 0);
  wall(x1 - x0, cx, z1, Math.PI);
  wall(z1 - z0, x1, cz, -R90);
  wall(dz0 - z0, x0, (z0 + dz0) / 2, R90);
  wall(z1 - dz1, x0, (dz1 + z1) / 2, R90);
  const lintel = plane(dz1 - dz0, H - 2.8, toon(0xffffff, { map: wallTex(dz1 - dz0) }), x0, 2.8 + (H - 2.8) / 2, (dz0 + dz1) / 2);
  lintel.rotation.y = R90;
  g.add(lintel);
  // zócalo de madera hasta 1,2 m, moldura y pilastras cada tanto
  const trim = toon(th.trim);
  const wains = toon(n === 3 ? 0xc8b48a : 0x3a1a14);
  for (const [len, x, z, ry] of [[x1 - x0, cx, z0 + 0.03, 0], [x1 - x0, cx, z1 - 0.03, 0], [z1 - z0, x0 + 0.03, cz, R90], [z1 - z0, x1 - 0.03, cz, R90]]) {
    const b = box(len, 1.2, 0.05, wains, x, 0.6, z); b.rotation.y = ry; g.add(b);
    const t1 = box(len, 0.08, 0.08, trim, x, 1.22, z); t1.rotation.y = ry; g.add(t1);
    const m = box(len, 0.2, 0.1, trim, x, H - 0.4, z); m.rotation.y = ry; g.add(m);
  }
  for (let x = x0 + 4; x < x1 - 2; x += 6) for (const z of [z0 + 0.1, z1 - 0.1]) g.add(box(0.5, H - 0.6, 0.15, trim, x, (H - 0.6) / 2, z));
  // el ascensor: un nicho en la pared de la izquierda con puertas doradas y el número del piso arriba
  const nx0 = 20 * U;
  const nf = plane(x0 - nx0, dz1 - dz0, toon(0x9a1a2a), (x0 + nx0) / 2, 0.005, (dz0 + dz1) / 2);
  nf.rotation.x = -R90;
  g.add(nf);
  for (const z of [dz0, dz1]) { const s = plane(x0 - nx0, 2.8, toon(0x2a1a14), (x0 + nx0) / 2, 1.4, z); s.rotation.y = z === dz0 ? 0 : Math.PI; g.add(s); }
  for (const s of [-1, 1]) g.add(box(0.06, 2.6, (dz1 - dz0) / 2 - 0.05, toon(0xd8a83a), nx0, 1.3, (dz0 + dz1) / 2 + s * (dz1 - dz0) / 4));
  g.add(box(0.12, 0.3, dz1 - dz0 + 0.4, trim, x0 + 0.02, 2.95, (dz0 + dz1) / 2));
  const lbl = plane(0.9, 0.38, labelMaterial(`PISO ${n}`, '#1a0a08', '#ffb03a', { w: 256, h: 110, size: 60, font: '"Pixelify Sans", monospace' }), x0 + 0.09, 3.45, (dz0 + dz1) / 2);
  lbl.rotation.y = R90;
  const asc = plane(0.6, 0.32, labelMaterial('ASCENSOR', '#2a1a14', '#ffe6a0', { w: 256, h: 128, size: 54 }), x0 + 0.09, 2.0, dz1 + 0.5);
  asc.rotation.y = R90;
  g.add(lbl, asc);
  // el techo: paneles que brillan (azul y violeta, como en el original), una cúpula sobre la tarima y lámparas
  const glowA = toon(th.glow, { glow: 1 });
  const glowB = toon(th.glow2, { glow: 1 });
  const cols = Math.max(3, Math.round((x1 - x0) / 7));
  const rows = Math.max(3, Math.round((z1 - z0) / 7));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const p = plane((x1 - x0) / cols - 1.4, (z1 - z0) / rows - 1.4, (i + j) % 2 ? glowA : glowB, x0 + (i + 0.5) * (x1 - x0) / cols, H - 0.02, z0 + (j + 0.5) * (z1 - z0) / rows);
    p.rotation.x = R90;
    g.add(p);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: th.glow2, side: THREE.BackSide }));
  dome.scale.set(1, 0.4, 0.8);
  dome.position.set(cx, H - 0.05, cz);
  g.add(dome);
  const chandelier = new THREE.Group();
  chandelier.position.set(cx, H - 0.2, cz);
  const big = n >= 3 ? 1.8 : 1.3;
  chandelier.add(cyl(0.05, 0.05, 1.2, toon(0xe8b84a), 0, -0.6, 0, 8), cyl(big, big * 0.6, 0.35, toon(0xe8b84a, { glow: 0.3 }), 0, -1.3, 0, 28));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 6), toon(0xfff2c0, { glow: 1.1 }));
    c.position.set(Math.cos(a) * big * 0.85, -1.75, Math.sin(a) * big * 0.85);
    c.rotation.x = Math.PI;
    chandelier.add(c);
  }
  g.add(chandelier);
  // la tarima del medio (y el palco del piso 4), con escaleras
  g.add(buildLevels(sc, { top: toon(th.daisTop), side: toon(th.dais), step: toon(new THREE.Color(th.dais).multiplyScalar(1.25).getHex()), edge: trim }));
  for (const l of sc.levels) if (l.balcony) g.add(railing(l.x * U, l.y * U, (l.x + l.w) * U, l.y * U, l.z, toon(0xe8b84a)));
  // decoración (también son obstáculos en `scenes.js`)
  const fountains = [];
  for (const d of sc.decor) { const m = decorModel(d, n, key); g.add(m); if (m.userData.jets) fountains.push(m); }
  // gente del casino paseando por los pasillos (solo dibujo: no son obstáculos)
  const crowd = [];
  const tints = [0xe0525a, 0x4a9be8, 0x5ec46b, 0xf0c33c, 0xb46bf0, 0xf08a3c, 0x3fd0c4, 0xf07ab8];
  let seed = n * 97;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 60 && crowd.length < 10 + n * 2; i++) {
    const x = 300 + rnd() * (sc.w - 500); const y = 300 + rnd() * (sc.h - 500);
    if (heightAt(key, x, y) > 0 || !canStand(key, x, y) || sc.tables.some((t) => x > t.x - 90 && x < t.x + t.w + 90 && y > t.y - 90 && y < t.y + t.h + 90)) continue;
    const npc = blob(tints[Math.floor(rnd() * tints.length)], { hat: ['', 'top', 'fez', ''][Math.floor(rnd() * 4)] });
    npc.add(cyl(0.05, 0.04, 0.14, toon([0xff6a9a, 0x6ad4ff, 0xffe27a][i % 3], { glow: 0.4, opacity: 0.85 }), 0.36, 0.75, 0.15, 8));
    npc.position.set(x * U, 0, y * U);
    npc.rotation.y = rnd() * Math.PI * 2;
    npc.userData.phase = rnd() * 6;
    npc.userData.walk = { x0: x, y0: y, a: rnd() * Math.PI * 2, r: 60 + rnd() * 120 };
    g.add(npc);
    crowd.push(npc);
  }
  // carteles de neón y cuadros en las paredes
  const neons = [];
  const crown = neonCrown(th.neon[0], 4);
  crown.position.set(x1 - 0.22, 4.6, cz - 6);
  crown.rotation.y = -R90;
  const word = neonText(['LA TIMBA', 'TERCIOPELO', 'MÁRMOL', 'DORADO'][n - 1], th.neon[1], 7, 2, 130);
  word.position.set(cx, 4.9, z1 - 0.22);
  word.rotation.y = Math.PI;
  const lucky = neonText(['¡SUERTE!', '$$$', '★ VIP ★', '♛ VIP ♛'][n - 1], th.neon[2], 4.4, 1.5, 120);
  lucky.position.set(x1 - 0.22, 4.6, cz + 6);
  lucky.rotation.y = -R90;
  const welcome = neonText('BIENVENIDOS', th.neon[0], 6, 1.6, 120);
  welcome.position.set(cx, 5.0, z0 + 0.22);
  g.add(crown, word, lucky, welcome);
  neons.push(crown, word, lucky, welcome);
  for (const [x, z, ry] of [[cx - (x1 - x0) * 0.32, z1 - 0.06, Math.PI], [cx + (x1 - x0) * 0.32, z1 - 0.06, Math.PI], [x0 + 0.06, z0 + 4, R90], [x0 + 0.06, z1 - 4, R90]]) {
    const p = portrait(1.6, 2, ['#2a3a8a', '#4a0a1a', '#8a7a5a', '#1a1414'][n - 1], ['#e0525a', '#4a9be8', '#5ec46b', '#f0c33c'][n - 1]);
    p.position.set(x, 3, z);
    p.rotation.y = ry;
    g.add(p);
  }
  if (n === 2) {
    for (let x = x0 + 4; x < x1 - 4; x += 6) for (const s of [-1, 1]) g.add(box(0.7, H - 0.6, 0.14, toon(0x8a0a24), x + 3 + s * 0.5, (H - 0.6) / 2, z1 - 0.2));
  }
  // luces: una general, una que marca el sombreado de dibujito y unas pocas lámparas (cada luz cuesta)
  const lights = [new THREE.HemisphereLight(th.light, 0x2a1a2a, n === 3 ? 1.3 : 1.2), new THREE.DirectionalLight(0xffffff, 0.9)];
  lights[1].position.set(cx + 8, H + 8, cz + 14);
  lights[1].target.position.set(cx, 0, cz);
  lights.push(lights[1].target);
  const chand = new THREE.PointLight(0xffe6b0, 40, 22, 2);
  chand.position.set(cx, H - 2.2, cz);
  lights.push(chand);
  for (const [fx, fz] of [[0.2, 0.25], [0.8, 0.25], [0.5, 0.85]]) {
    const l = new THREE.PointLight(th.glow2, 20, 22, 2);
    l.position.set(x0 + (x1 - x0) * fx, H - 1, z0 + (z1 - z0) * fz);
    lights.push(l);
  }
  return {
    group: g, lights, fog: null, buttons: [],
    update(t) {
      neons.forEach((m, i) => { m.material.opacity = 0.85 + Math.sin(t * (9 + i * 3)) * 0.07 + (Math.sin(t * 0.9 + i * 2) > 0.985 ? -0.6 : 0); });
      for (const f of fountains) f.userData.jets.forEach((j, i) => {
        const u = ((t * 0.9 + i / 10) % 1);
        const a = (i / 10) * Math.PI * 2;
        const r = f.userData.spread;
        j.position.set(Math.cos(a) * u * r, 2.0 + u * 0.8 - u * u * 1.6, Math.sin(a) * u * r);
      });
      chandelier.rotation.y = Math.sin(t * 0.3) * 0.05;
      // la gente da vueltas despacito alrededor de su lugar (si se choca algo, se queda quieta mirando)
      for (const p of crowd) {
        const w = p.userData.walk;
        const a = w.a + t * 0.12;
        const x = w.x0 + Math.cos(a) * w.r; const y = w.y0 + Math.sin(a) * w.r;
        const free = canStand(key, x, y) && heightAt(key, x, y) === 0;
        if (free) { p.position.set(x * U, 0, y * U); p.rotation.y = -a; }
        animateBlob(p, t, free, p.userData.phase);
      }
    },
  };
}

// El lugar que corresponde a cada escena (`sceneKey` de scenes.js).
export function buildPlace(key, st) {
  if (key === 'wait') return buildWait();
  if (key === 'outside') return buildOutside();
  if (key === 'elevator') return buildElevator(st);
  return buildFloor(Number(key.slice(1)));
}
