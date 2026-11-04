// Arena Royale: los dibujos de las 50 cartas, hechos con formas de canvas (sin imágenes ni emojis).
// Cada carta tiene un dibujo propio que se usa en TODOS lados: en la arena, en la mano, en el mazo y en las salas.
// Estilo de dibujo animado con contorno oscuro, como el juego original; las formas siguen la descripción de docs/ARENA.md.
//
// Se dibuja en coordenadas «de unidad»: el origen son los pies, 1 = el radio de la tropa y el personaje mide ~2,4 hacia
// arriba (y negativo). El que llama aplica la escala (`drawSprite`).
const OUT = '#2b1a14';
const TAU = Math.PI * 2;
const SKIN = '#f6c9a0';
const LW = 0.07;

function P(c, build, fill, lw = LW) {
  c.beginPath();
  build(c);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.strokeStyle = OUT; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
const E = (c, x, y, rx, ry, fill, lw) => P(c, (k) => k.ellipse(x, y, rx, ry, 0, 0, TAU), fill, lw);
const C = (c, x, y, r, fill, lw) => E(c, x, y, r, r, fill, lw);
const R = (c, x, y, w, h, rad, fill, lw) => P(c, (k) => k.roundRect(x, y, w, h, rad), fill, lw);
const G = (c, pts, fill, lw) => P(c, (k) => { k.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) k.lineTo(pts[i][0], pts[i][1]); k.closePath(); }, fill, lw);
const Ln = (c, x1, y1, x2, y2, col, w) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); };
const shine = (c, x, y, rx, ry, rot = -0.5) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.32)'; c.fill(); };

function legs(c, a, col, spread = 0.3, len = 0.55) {
  const w = Math.sin(a.t * 11) * 0.1;
  R(c, -spread - 0.15, -len + w, 0.3, len, 0.12, col);
  R(c, spread - 0.15, -len - w, 0.3, len, 0.12, col);
  E(c, -spread, 0.02 + w * 0.5, 0.22, 0.11, '#3a2418', 0.05);
  E(c, spread, 0.02 - w * 0.5, 0.22, 0.11, '#3a2418', 0.05);
}

function eyes(c, y, r, o = {}) {
  E(c, -r * 0.42, y, r * 0.2, r * 0.26, o.white || '#fff', 0.04);
  E(c, r * 0.42, y, r * 0.2, r * 0.26, o.white || '#fff', 0.04);
  C(c, -r * 0.42, y + 0.02, r * 0.1, o.iris || '#222', 0);
  C(c, r * 0.42, y + 0.02, r * 0.1, o.iris || '#222', 0);
}
const smile = (c, y, r) => P(c, (k) => k.arc(0, y, r * 0.22, 0.25, Math.PI - 0.25), null, 0.05);

function hand(c, x, y, col = SKIN) { C(c, x, y, 0.17, col, 0.05); }

// Arma en la mano derecha; `a.swing` la hace girar al pegar.
function wpn(c, kind, a, k = 1) {
  c.save();
  c.translate(0.92, -0.9);
  c.rotate(a.swing || 0);
  c.scale(k, k);
  switch (kind) {
    case 'sword':
      R(c, -0.08, -1.45, 0.16, 1.15, 0.05, '#e3e9f2'); R(c, -0.32, -0.36, 0.64, 0.13, 0.05, '#d6a931'); R(c, -0.06, -0.28, 0.12, 0.4, 0.04, '#7a4b22'); shine(c, -0.02, -0.95, 0.03, 0.35, 0);
      break;
    case 'dagger': G(c, [[-0.07, -0.25], [0, -0.85], [0.07, -0.25]], '#f1d54a'); R(c, -0.2, -0.28, 0.4, 0.09, 0.03, '#7a4b22'); break;
    case 'bow':
      P(c, (kk) => kk.arc(-0.1, -0.5, 0.95, -1.15, 1.15), null, 0.1); c.strokeStyle = '#a8703a'; c.lineWidth = 0.08; c.stroke();
      Ln(c, 0.3, -1.3, 0.3, 0.3, '#f3efe0', 0.03);
      break;
    case 'rifle':
      R(c, -0.1, -0.2, 0.28, 0.6, 0.06, '#6b4423'); R(c, -0.06, -1.55, 0.14, 1.45, 0.04, '#58504a'); R(c, -0.12, -1.65, 0.26, 0.14, 0.04, '#3a3530');
      break;
    case 'axe':
      R(c, -0.05, -1.7, 0.1, 2.0, 0.04, '#8a5a2b'); G(c, [[0, -1.7], [-0.75, -1.5], [-0.55, -1.05], [0, -1.15]], '#d6dce6'); G(c, [[0, -1.7], [0.75, -1.5], [0.55, -1.05], [0, -1.15]], '#c3cad6');
      break;
    case 'hammer':
      R(c, -0.06, -1.2, 0.12, 1.5, 0.04, '#8a5a2b'); R(c, -0.5, -1.7, 1.0, 0.6, 0.1, '#9aa1ad'); R(c, -0.5, -1.45, 1.0, 0.12, 0.04, '#6e7480');
      break;
    case 'lance':
      R(c, -0.05, -2.3, 0.1, 2.6, 0.04, '#c9a24a'); G(c, [[-0.1, -2.3], [0, -2.9], [0.1, -2.3]], '#dfe5ee'); G(c, [[0.05, -2.2], [0.8, -2.0], [0.05, -1.75]], '#e0443a', 0.05);
      break;
    case 'wand':
      R(c, -0.05, -1.3, 0.1, 1.5, 0.04, '#7a4b22'); C(c, 0, -1.4, 0.24, '#ff9a2e'); C(c, 0, -1.4, 0.12, '#ffe68a', 0);
      break;
    case 'staff':
      R(c, -0.05, -1.7, 0.1, 2.0, 0.04, '#6b4423'); G(c, [[-0.3, -1.85], [-0.05, -1.65], [-0.05, -1.95]], '#8a5a2b', 0.04); G(c, [[0.3, -1.85], [0.05, -1.65], [0.05, -1.95]], '#8a5a2b', 0.04); C(c, 0, -1.95, 0.24, a.head || '#ff9a2e'); C(c, -0.05, -2.0, 0.09, '#fff', 0);
      break;
    case 'spear':
      R(c, -0.04, -2.1, 0.08, 2.4, 0.03, '#8a5a2b'); G(c, [[-0.12, -2.1], [0, -2.65], [0.12, -2.1]], '#dfe5ee');
      break;
    case 'club':
      R(c, -0.07, -1.0, 0.14, 1.3, 0.05, '#7a4b22'); P(c, (k) => { k.moveTo(-0.2, -1.0); k.quadraticCurveTo(-0.55, -1.9, 0, -2.0); k.quadraticCurveTo(0.55, -1.9, 0.2, -1.0); k.closePath(); }, '#9a6a3a');
      C(c, -0.12, -1.6, 0.05, '#c9a24a', 0.02); C(c, 0.14, -1.45, 0.05, '#c9a24a', 0.02);
      break;
    case 'shotgun':
      R(c, -0.1, -0.2, 0.26, 0.55, 0.06, '#6b4423'); R(c, -0.07, -1.25, 0.14, 1.1, 0.04, '#3a3d44'); R(c, -0.22, -1.35, 0.1, 0.4, 0.03, '#2a2c32'); R(c, 0.12, -1.3, 0.1, 0.35, 0.03, '#2a2c32');
      break;
    case 'bomb':
      C(c, 0, -0.7, 0.42, '#2b2b30'); Ln(c, 0.1, -1.08, 0.3, -1.4, '#c9a24a', 0.06); C(c, 0.33, -1.45, 0.09, '#ff9a2e', 0); shine(c, -0.15, -0.85, 0.1, 0.06, -0.6);
      break;
    case 'pick':
      R(c, -0.05, -1.5, 0.1, 1.8, 0.04, '#8a5a2b'); P(c, (k) => { k.moveTo(-0.8, -1.2); k.quadraticCurveTo(0, -1.9, 0.8, -1.2); k.lineTo(0.7, -1.1); k.quadraticCurveTo(0, -1.65, -0.7, -1.1); k.closePath(); }, '#aab2bd');
      break;
    default: break;
  }
  hand(c, 0, 0, a.glove || SKIN);
  c.restore();
}

// ─── Tropas ──────────────────────────────────────────────────────────────────
function skeleton(c, a) {
  legs(c, a, '#e6dec2', 0.22, 0.45);
  E(c, 0, -0.85, 0.46, 0.5, '#efe8d2');
  for (let i = 0; i < 3; i++) Ln(c, -0.3, -1.05 + i * 0.2, 0.3, -1.05 + i * 0.2, '#b9b093', 0.05);
  hand(c, -0.55, -0.8, '#efe8d2'); hand(c, 0.55, -0.8, '#efe8d2');
  C(c, 0, -1.6, 0.58, '#f8f3e3');
  E(c, -0.22, -1.65, 0.15, 0.2, OUT, 0); E(c, 0.22, -1.65, 0.15, 0.2, OUT, 0);
  G(c, [[-0.06, -1.45], [0.06, -1.45], [0, -1.35]], OUT, 0);
  Ln(c, -0.25, -1.2, 0.25, -1.2, OUT, 0.05);
  for (let i = -2; i <= 2; i++) Ln(c, i * 0.1, -1.24, i * 0.1, -1.16, OUT, 0.03);
}

function goblin(c, a) {
  legs(c, a, '#6b4a2b', 0.27, 0.45);
  E(c, 0, -0.85, 0.5, 0.5, '#8a6a3e'); R(c, -0.5, -0.68, 1.0, 0.14, 0.05, '#4d3420');
  hand(c, -0.58, -0.8, '#7bb83e');
  G(c, [[-0.45, -1.55], [-1.3, -2.0], [-0.55, -1.2]], '#8ac84a'); G(c, [[0.45, -1.55], [1.3, -2.0], [0.55, -1.2]], '#8ac84a');
  C(c, 0, -1.6, 0.58, '#8ac84a');
  E(c, -0.22, -1.65, 0.17, 0.2, '#fff6a8', 0.04); E(c, 0.22, -1.65, 0.17, 0.2, '#fff6a8', 0.04); C(c, -0.2, -1.65, 0.07, OUT, 0); C(c, 0.24, -1.65, 0.07, OUT, 0);
  G(c, [[-0.2, -1.4], [0.2, -1.4], [0.1, -1.25], [-0.1, -1.25]], '#5a2a20', 0.04); G(c, [[-0.12, -1.4], [-0.06, -1.3], [-0.01, -1.4]], '#fff', 0);
  wpn(c, 'dagger', a, 0.9);
}

function archer(c, a) {
  legs(c, a, '#f1c9a5', 0.25, 0.4);
  P(c, (k) => { k.moveTo(-0.55, -0.2); k.lineTo(-0.38, -1.25); k.lineTo(0.38, -1.25); k.lineTo(0.55, -0.2); k.closePath(); }, '#4aa84b');
  R(c, -0.38, -0.85, 0.76, 0.1, 0.04, '#2f7a30');
  G(c, [[-0.5, -1.2], [0, -0.95], [0.5, -1.2], [0.4, -1.4], [-0.4, -1.4]], '#2f8f3a');
  C(c, 0.55, -1.75, 0.3, '#f26ba8'); // trenza
  C(c, 0, -1.7, 0.56, '#f26ba8');
  C(c, 0, -1.58, 0.5, SKIN);
  P(c, (k) => { k.arc(0, -1.78, 0.56, Math.PI, 0); k.lineTo(0.4, -1.62); k.quadraticCurveTo(0, -1.9, -0.4, -1.62); k.closePath(); }, '#f26ba8');
  eyes(c, -1.58, 0.5, { iris: '#2a6a8a' }); smile(c, -1.62, 0.5);
  wpn(c, 'bow', a, 0.95);
}

function knight(c, a) {
  legs(c, a, '#5a4636', 0.28, 0.45);
  E(c, 0, -0.85, 0.62, 0.58, '#6f8fb8'); R(c, -0.62, -0.7, 1.24, 0.14, 0.05, '#d6a931'); E(c, 0, -0.95, 0.3, 0.3, '#8fb0d8', 0.04);
  hand(c, -0.7, -0.85, '#aab2bd');
  C(c, 0, -1.55, 0.55, SKIN);
  P(c, (k) => { k.arc(0, -1.6, 0.62, Math.PI, 0); k.lineTo(0.62, -1.5); k.lineTo(0.42, -1.5); k.lineTo(0.42, -1.75); k.lineTo(-0.42, -1.75); k.lineTo(-0.42, -1.5); k.lineTo(-0.62, -1.5); k.closePath(); }, '#aab2bd');
  R(c, -0.09, -2.1, 0.18, 0.42, 0.06, '#e0443a', 0.05);
  eyes(c, -1.52, 0.5);
  P(c, (k) => { k.moveTo(-0.5, -1.32); k.quadraticCurveTo(-0.25, -1.5, 0, -1.34); k.quadraticCurveTo(0.25, -1.5, 0.5, -1.32); k.quadraticCurveTo(0.3, -1.12, 0, -1.22); k.quadraticCurveTo(-0.3, -1.12, -0.5, -1.32); }, '#7a4b22', 0.05);
  wpn(c, 'sword', a);
}

function miniPekka(c, a) {
  legs(c, a, '#3d475e', 0.27, 0.45);
  E(c, 0, -0.9, 0.66, 0.62, '#6c7a96'); E(c, 0, -0.95, 0.32, 0.38, '#56627c', 0.04); C(c, 0, -0.95, 0.1, '#ff5fa8', 0);
  C(c, -0.7, -1.05, 0.28, '#8a97b2'); C(c, 0.7, -1.05, 0.28, '#8a97b2');
  G(c, [[-0.5, -1.65], [-0.95, -2.25], [-0.25, -1.9]], '#e4e8ef'); G(c, [[0.5, -1.65], [0.95, -2.25], [0.25, -1.9]], '#e4e8ef');
  C(c, 0, -1.6, 0.6, '#7e8ca8'); R(c, -0.46, -1.78, 0.92, 0.3, 0.08, '#2a2f40');
  C(c, -0.2, -1.64, 0.09, '#ff5fa8', 0); C(c, 0.2, -1.64, 0.09, '#ff5fa8', 0);
  R(c, -0.35, -1.38, 0.7, 0.14, 0.05, '#56627c', 0.04);
  wpn(c, 'sword', { ...a, glove: '#8a97b2' }, 1.25);
}

function musketeer(c, a) {
  legs(c, a, '#3a4a86', 0.25, 0.4);
  P(c, (k) => { k.moveTo(-0.55, -0.2); k.lineTo(-0.38, -1.2); k.lineTo(0.38, -1.2); k.lineTo(0.55, -0.2); k.closePath(); }, '#4a6fd0');
  R(c, -0.4, -0.8, 0.8, 0.1, 0.04, '#d6a931');
  C(c, 0, -1.8, 0.58, '#9b4fd0'); C(c, -0.5, -1.55, 0.2, '#9b4fd0');
  C(c, 0, -1.58, 0.5, SKIN); eyes(c, -1.58, 0.5); smile(c, -1.62, 0.5);
  G(c, [[-0.75, -1.8], [0.75, -1.8], [0.45, -2.0], [0, -2.35], [-0.45, -2.0]], '#3d5fc9'); R(c, -0.78, -1.9, 1.56, 0.14, 0.06, '#2a3f8f');
  P(c, (k) => { k.moveTo(0.35, -2.2); k.quadraticCurveTo(1.0, -2.8, 0.85, -2.1); k.quadraticCurveTo(0.6, -2.3, 0.35, -2.2); }, '#f4f0e0', 0.04);
  wpn(c, 'rifle', a, 0.95);
}

function valkyrie(c, a) {
  legs(c, a, '#e8b894', 0.27, 0.4);
  for (const [x, y, r] of [[-0.6, -1.9, 0.38], [0.6, -1.9, 0.38], [-0.82, -1.55, 0.36], [0.82, -1.55, 0.36], [-0.6, -1.25, 0.32], [0.6, -1.25, 0.32], [0, -2.12, 0.42]]) C(c, x, y, r, '#f08a24');
  P(c, (k) => { k.moveTo(-0.6, -0.2); k.lineTo(-0.45, -1.2); k.lineTo(0.45, -1.2); k.lineTo(0.6, -0.2); k.closePath(); }, '#3a67c4');
  R(c, -0.46, -0.85, 0.92, 0.12, 0.04, '#e8d9a8');
  C(c, 0, -1.62, 0.5, SKIN); eyes(c, -1.62, 0.5, { iris: '#2a6a2a' }); smile(c, -1.66, 0.5);
  P(c, (k) => { k.arc(0, -1.76, 0.5, Math.PI, 0); k.quadraticCurveTo(0, -1.95, -0.5, -1.76); }, '#f08a24');
  wpn(c, 'axe', a, 0.9);
}

function boar(c, a, col) {
  const w = Math.sin(a.t * 12) * 0.08;
  E(c, 0, -0.35, 1.0, 0.55, col); E(c, 0.15, -0.45, 0.5, 0.3, 'rgba(255,255,255,0.12)', 0);
  C(c, 0.85, -0.55, 0.42, col); E(c, 1.15, -0.45, 0.2, 0.15, '#f0a4a4', 0.05); G(c, [[0.75, -0.9], [0.7, -1.2], [0.95, -0.95]], '#e8e0c6', 0.04);
  C(c, 0.95, -0.7, 0.07, OUT, 0);
  R(c, -0.75, -0.1 + w, 0.22, 0.42, 0.08, '#3a2418'); R(c, -0.3, -0.1 - w, 0.22, 0.42, 0.08, '#3a2418'); R(c, 0.35, -0.1 + w, 0.22, 0.42, 0.08, '#3a2418'); R(c, 0.7, -0.1 - w, 0.22, 0.42, 0.08, '#3a2418');
}

function hog(c, a) {
  boar(c, a, '#8a5a2b');
  E(c, 0.05, -1.1, 0.45, 0.5, SKIN); R(c, -0.4, -0.78, 0.8, 0.28, 0.08, '#3a67c4', 0.05);
  hand(c, -0.5, -1.1); C(c, 0.05, -1.75, 0.45, SKIN); eyes(c, -1.72, 0.4);
  P(c, (k) => { k.moveTo(-0.15, -2.1); k.lineTo(0, -2.5); k.lineTo(0.15, -2.1); k.lineTo(0.3, -2.4); k.lineTo(0.3, -2.0); k.closePath(); }, '#222', 0.04);
  P(c, (k) => { k.moveTo(-0.3, -1.55); k.quadraticCurveTo(0.05, -1.4, 0.4, -1.55); }, null, 0.05);
  wpn(c, 'hammer', a, 0.85);
}

function dragon(c, a) {
  const f = Math.sin(a.t * 12) * 0.35;
  P(c, (k) => { k.moveTo(-0.3, -1.2); k.quadraticCurveTo(-1.5, -1.7 + f, -1.6, -0.6 + f); k.quadraticCurveTo(-0.9, -0.8, -0.3, -0.7); }, '#2e9a82');
  P(c, (k) => { k.moveTo(0.3, -1.2); k.quadraticCurveTo(1.5, -1.7 - f, 1.6, -0.6 - f); k.quadraticCurveTo(0.9, -0.8, 0.3, -0.7); }, '#2e9a82');
  P(c, (k) => { k.moveTo(-0.3, -0.5); k.quadraticCurveTo(-1.0, -0.1, -0.7, 0.35); k.quadraticCurveTo(-0.5, 0.1, -0.2, -0.3); }, '#52c0a1');
  E(c, 0, -0.95, 0.72, 0.8, '#52c0a1'); E(c, 0, -0.85, 0.42, 0.55, '#ece6b0', 0.04);
  C(c, 0, -1.95, 0.62, '#62d0b1'); E(c, 0, -1.72, 0.34, 0.24, '#8fe0c8', 0.05); C(c, -0.1, -1.7, 0.04, OUT, 0); C(c, 0.1, -1.7, 0.04, OUT, 0);
  E(c, -0.28, -2.05, 0.15, 0.17, '#fff', 0.04); E(c, 0.28, -2.05, 0.15, 0.17, '#fff', 0.04); C(c, -0.27, -2.05, 0.07, OUT, 0); C(c, 0.29, -2.05, 0.07, OUT, 0);
  G(c, [[-0.4, -2.4], [-0.55, -2.85], [-0.15, -2.5]], '#ece6b0', 0.05); G(c, [[0.4, -2.4], [0.55, -2.85], [0.15, -2.5]], '#ece6b0', 0.05);
}

function prince(c, a) {
  const w = Math.sin(a.t * 12) * 0.08;
  E(c, 0, -0.4, 1.0, 0.55, '#9a6a3a'); R(c, -0.7, -0.75, 1.4, 0.35, 0.1, '#e6c44a', 0.05);
  C(c, 0.9, -0.7, 0.4, '#9a6a3a'); E(c, 1.15, -0.55, 0.22, 0.17, '#7a4a22', 0.05); G(c, [[0.85, -1.0], [0.8, -1.35], [1.05, -1.05]], '#9a6a3a', 0.05);
  P(c, (k) => { k.moveTo(0.55, -1.0); k.quadraticCurveTo(0.2, -0.6, -0.1, -0.7); }, null, 0.12);
  R(c, -0.75, -0.1 + w, 0.22, 0.45, 0.08, '#6b4423'); R(c, -0.3, -0.1 - w, 0.22, 0.45, 0.08, '#6b4423'); R(c, 0.35, -0.1 + w, 0.22, 0.45, 0.08, '#6b4423'); R(c, 0.7, -0.1 - w, 0.22, 0.45, 0.08, '#6b4423');
  E(c, 0, -1.2, 0.46, 0.5, '#d6a931'); E(c, 0, -1.2, 0.26, 0.3, '#f2d26a', 0.04); hand(c, -0.5, -1.2, '#e6c44a');
  C(c, 0, -1.82, 0.45, SKIN); eyes(c, -1.8, 0.4);
  P(c, (k) => { k.arc(0, -1.86, 0.5, Math.PI, 0); k.lineTo(0.5, -1.7); k.lineTo(-0.5, -1.7); k.closePath(); }, '#e6c44a');
  G(c, [[-0.5, -1.9], [-0.7, -2.4], [-0.25, -2.0]], '#f4f0e0', 0.05); G(c, [[0.5, -1.9], [0.7, -2.4], [0.25, -2.0]], '#f4f0e0', 0.05);
  wpn(c, 'lance', { ...a, glove: '#e6c44a' }, 0.9);
}

function giant(c, a) {
  legs(c, a, '#4a5a7a', 0.32, 0.5);
  E(c, 0, -0.95, 0.85, 0.7, '#e9984a'); R(c, -0.85, -0.75, 1.7, 0.2, 0.06, '#7a4b22'); R(c, -0.15, -0.76, 0.3, 0.2, 0.05, '#d6a931', 0.04);
  P(c, (k) => { k.moveTo(-0.55, -1.5); k.lineTo(-0.2, -0.8); }, null, 0.14); c.strokeStyle = '#7a4b22'; c.stroke();
  C(c, -1.0, -0.75, 0.38, '#e9984a'); C(c, 1.0, -0.75, 0.38, '#e9984a');
  C(c, 0, -1.75, 0.62, '#f0a45a');
  P(c, (k) => { k.moveTo(-0.62, -1.7); k.quadraticCurveTo(-0.7, -1.1, 0, -1.0); k.quadraticCurveTo(0.7, -1.1, 0.62, -1.7); k.quadraticCurveTo(0, -1.45, -0.62, -1.7); }, '#b3401f');
  E(c, -0.22, -1.82, 0.17, 0.2, '#fff', 0.04); E(c, 0.22, -1.82, 0.17, 0.2, '#fff', 0.04); C(c, -0.2, -1.8, 0.08, OUT, 0); C(c, 0.24, -1.8, 0.08, OUT, 0);
  Ln(c, -0.4, -2.05, -0.1, -1.95, OUT, 0.06); Ln(c, 0.4, -2.05, 0.1, -1.95, OUT, 0.06);
  E(c, 0, -1.55, 0.14, 0.1, '#e07a3a', 0.04);
}

function balloon(c, a) {
  const b = Math.sin(a.t * 4) * 0.06;
  Ln(c, -0.7, -2.0 + b, -0.4, -0.7, '#7a4b22', 0.06); Ln(c, 0.7, -2.0 + b, 0.4, -0.7, '#7a4b22', 0.06);
  R(c, -0.45, -0.75, 0.9, 0.6, 0.1, '#8a5a2b'); R(c, -0.45, -0.55, 0.9, 0.08, 0.02, '#6b4423', 0.03);
  C(c, 0.15, 0.15, 0.28, '#2b2b30'); Ln(c, 0.25, -0.1, 0.4, -0.2, '#c9a24a', 0.05); C(c, 0.42, -0.24, 0.07, '#ff9a2e', 0);
  P(c, (k) => { k.moveTo(0, -3.9 + b); k.bezierCurveTo(1.6, -3.7 + b, 1.5, -2.0 + b, 0.6, -1.9 + b); k.lineTo(-0.6, -1.9 + b); k.bezierCurveTo(-1.5, -2.0 + b, -1.6, -3.7 + b, 0, -3.9 + b); }, '#e0482f');
  P(c, (k) => { k.moveTo(0, -3.9 + b); k.bezierCurveTo(0.6, -3.2 + b, 0.5, -2.4 + b, 0.2, -1.9 + b); }, null, 0.04);
  P(c, (k) => { k.moveTo(0, -3.9 + b); k.bezierCurveTo(-0.6, -3.2 + b, -0.5, -2.4 + b, -0.2, -1.9 + b); }, null, 0.04);
  shine(c, -0.7, -3.2 + b, 0.18, 0.5, 0.3);
  C(c, 0, -2.8 + b, 0.5, '#f4efe0'); E(c, -0.2, -2.85 + b, 0.14, 0.17, OUT, 0); E(c, 0.2, -2.85 + b, 0.14, 0.17, OUT, 0);
  Ln(c, -0.2, -2.55 + b, 0.2, -2.55 + b, OUT, 0.06); for (let i = -1; i <= 1; i++) Ln(c, i * 0.12, -2.6 + b, i * 0.12, -2.5 + b, OUT, 0.04);
}

function minion(c, a) {
  const f = Math.sin(a.t * 14) * 0.4;
  P(c, (k) => { k.moveTo(-0.3, -1.0); k.quadraticCurveTo(-1.4, -1.5 + f, -1.5, -0.6 + f); k.quadraticCurveTo(-0.9, -0.9, -0.3, -0.6); }, '#46526f');
  P(c, (k) => { k.moveTo(0.3, -1.0); k.quadraticCurveTo(1.4, -1.5 - f, 1.5, -0.6 - f); k.quadraticCurveTo(0.9, -0.9, 0.3, -0.6); }, '#46526f');
  E(c, 0, -0.85, 0.55, 0.62, '#6b7ba0'); G(c, [[-0.2, -0.3], [0, 0.1], [0.2, -0.3]], '#59678a', 0.05);
  G(c, [[-0.4, -0.45], [-0.5, 0.05], [-0.25, -0.3]], '#e4e8ef', 0.04); G(c, [[0.4, -0.45], [0.5, 0.05], [0.25, -0.3]], '#e4e8ef', 0.04);
  C(c, 0, -1.6, 0.55, '#7d8db3');
  G(c, [[-0.4, -2.0], [-0.55, -2.55], [-0.12, -2.1]], '#e4e8ef', 0.05); G(c, [[0.4, -2.0], [0.55, -2.55], [0.12, -2.1]], '#e4e8ef', 0.05);
  E(c, -0.2, -1.65, 0.16, 0.12, '#fff', 0.04); E(c, 0.2, -1.65, 0.16, 0.12, '#fff', 0.04); C(c, -0.18, -1.64, 0.06, '#c00', 0); C(c, 0.22, -1.64, 0.06, '#c00', 0);
  Ln(c, -0.38, -1.88, -0.05, -1.75, OUT, 0.06); Ln(c, 0.38, -1.88, 0.05, -1.75, OUT, 0.06);
  P(c, (k) => { k.moveTo(-0.22, -1.32); k.lineTo(-0.1, -1.4); k.lineTo(0, -1.3); k.lineTo(0.1, -1.4); k.lineTo(0.22, -1.32); }, null, 0.05);
}

function wizard(c, a) {
  legs(c, a, '#c47a1f', 0.25, 0.35);
  P(c, (k) => { k.moveTo(-0.62, -0.1); k.lineTo(-0.4, -1.25); k.lineTo(0.4, -1.25); k.lineTo(0.62, -0.1); k.closePath(); }, '#f2a22c');
  R(c, -0.42, -0.8, 0.84, 0.12, 0.04, '#7a4b22');
  C(c, 0, -1.62, 0.52, SKIN); eyes(c, -1.62, 0.5);
  P(c, (k) => { k.moveTo(-0.5, -1.5); k.quadraticCurveTo(-0.55, -0.95, 0, -0.9); k.quadraticCurveTo(0.55, -0.95, 0.5, -1.5); k.quadraticCurveTo(0, -1.3, -0.5, -1.5); }, '#f4d26b');
  P(c, (k) => { k.moveTo(-0.3, -1.45); k.quadraticCurveTo(0, -1.58, 0.3, -1.45); }, null, 0.06);
  G(c, [[-0.78, -1.82], [0.78, -1.82], [0.4, -2.0], [0.15, -2.8], [-0.15, -2.8], [-0.4, -2.0]], '#f2a22c'); R(c, -0.82, -1.92, 1.64, 0.15, 0.06, '#c47a1f');
  G(c, [[0.1, -2.7], [0.55, -2.55], [0.2, -2.35]], '#f2a22c', 0.05);
  wpn(c, 'wand', a, 0.9);
}

function pekka(c, a) {
  legs(c, a, '#2a2f45', 0.32, 0.5);
  E(c, 0, -1.0, 0.85, 0.75, '#3c4468'); E(c, 0, -1.05, 0.42, 0.45, '#2b3150', 0.05); C(c, 0, -1.05, 0.12, '#ff5fa8', 0);
  C(c, -0.95, -1.15, 0.36, '#4b547c'); C(c, 0.95, -1.15, 0.36, '#4b547c');
  G(c, [[-0.55, -1.8], [-1.15, -2.55], [-0.3, -2.1]], '#e4e8ef'); G(c, [[0.55, -1.8], [1.15, -2.55], [0.3, -2.1]], '#e4e8ef');
  C(c, 0, -1.8, 0.66, '#4a5380'); R(c, -0.5, -2.0, 1.0, 0.34, 0.08, '#1f2338');
  C(c, -0.22, -1.83, 0.1, '#ff5fa8', 0); C(c, 0.22, -1.83, 0.1, '#ff5fa8', 0);
  R(c, -0.38, -1.5, 0.76, 0.16, 0.05, '#2b3150', 0.04);
  wpn(c, 'sword', { ...a, glove: '#4b547c' }, 1.55);
}

// ─── Edificios ───────────────────────────────────────────────────────────────
function cannon(c, a) {
  R(c, -0.95, -0.5, 1.9, 0.6, 0.15, '#8a5a2b'); R(c, -0.95, -0.28, 1.9, 0.1, 0.02, '#6b4423', 0.03);
  C(c, -0.6, 0.12, 0.3, '#5a3a20'); C(c, 0.6, 0.12, 0.3, '#5a3a20'); C(c, -0.6, 0.12, 0.1, '#c9a24a', 0.03); C(c, 0.6, 0.12, 0.1, '#c9a24a', 0.03);
  c.save(); c.translate(0, -0.75); c.rotate((a.aim ?? -Math.PI / 2) + Math.PI / 2 - Math.PI / 2);
  R(c, 0, -0.32, 1.45, 0.64, 0.12, '#3a3d44'); R(c, 1.2, -0.4, 0.34, 0.8, 0.08, '#2a2c32'); C(c, 0, 0, 0.5, '#4a4d55'); shine(c, 0.5, -0.15, 0.4, 0.07, 0);
  c.restore();
}

function mortar(c, a) {
  R(c, -1.0, -0.4, 2.0, 0.5, 0.1, '#8a5a2b'); R(c, -1.0, -0.2, 2.0, 0.08, 0.02, '#6b4423', 0.03);
  C(c, -0.65, 0.12, 0.26, '#5a3a20'); C(c, 0.65, 0.12, 0.26, '#5a3a20');
  G(c, [[-0.6, -0.35], [-0.38, -1.7], [0.38, -1.7], [0.6, -0.35]], '#7a7468'); E(c, 0, -1.7, 0.38, 0.14, '#2b2824', 0.05);
  R(c, -0.62, -1.0, 1.24, 0.14, 0.04, '#4b463d', 0.04); R(c, -0.5, -1.4, 1.0, 0.1, 0.04, '#4b463d', 0.04);
  C(c, 1.2, -0.12, 0.2, '#9a948a'); C(c, 1.45, -0.05, 0.17, '#8a847a');
}

// ─── Hechizos ────────────────────────────────────────────────────────────────
function fireball(c, a) {
  const f = Math.sin(a.t * 14) * 0.08;
  P(c, (k) => { k.moveTo(-0.9, -0.2); k.bezierCurveTo(-0.4, -0.9, -0.1, -1.4, 0.4, -1.9); k.bezierCurveTo(0.2, -1.2, 0.8, -1.0, 0.9, -0.3); k.closePath(); }, '#e8531e');
  C(c, 0, -0.85, 0.82 + f, '#ff8a1f'); C(c, -0.05, -0.8, 0.55, '#ffc03a', 0.05); C(c, -0.1, -0.78, 0.28, '#fff0a0', 0); shine(c, -0.3, -1.15, 0.2, 0.1, -0.7);
  P(c, (k) => { k.moveTo(-0.7, -0.3); k.quadraticCurveTo(-1.5, 0.1, -1.9, 0.5); k.quadraticCurveTo(-1.0, 0.2, -0.4, -0.1); }, '#ff8a1f', 0.05);
}

function arrows(c) {
  for (const [x, y, rot] of [[-0.55, -1.0, 0.35], [0, -1.15, 0.1], [0.55, -1.0, -0.2]]) {
    c.save(); c.translate(x, y); c.rotate(rot);
    R(c, -0.05, -0.95, 0.1, 1.9, 0.03, '#c9a24a', 0.05); G(c, [[-0.2, 1.05], [0, 0.6], [0.2, 1.05]], '#e8ecf4', 0.05);
    G(c, [[-0.2, -1.0], [0, -0.7], [0, -0.45], [-0.2, -0.65]], '#e0443a', 0.04); G(c, [[0.2, -1.0], [0, -0.7], [0, -0.45], [0.2, -0.65]], '#c63a30', 0.04);
    c.restore();
  }
}

function zap(c, a) {
  const f = (Math.sin(a.t * 18) + 1) * 0.04;
  C(c, 0, -1.0, 1.0 + f, 'rgba(120,200,255,0.35)', 0.05);
  G(c, [[0.25, -2.1], [-0.55, -0.95], [-0.05, -0.95], [-0.3, 0.1], [0.6, -1.2], [0.1, -1.2]], '#8fd8ff', 0.07);
  G(c, [[0.18, -1.8], [-0.3, -1.0], [0.05, -1.0], [-0.1, -0.35], [0.35, -1.15], [0.05, -1.15]], '#f4fcff', 0);
}

// ─── Cartas nuevas: personajes armados con piezas ────────────────────────────
function hat(c, o) {
  const col = o.hatCol || '#aab2bd';
  switch (o.hat) {
    case 'helmet':
    case 'horns':
      P(c, (k) => { k.arc(0, -1.6, 0.62, Math.PI, 0); k.lineTo(0.62, -1.5); k.lineTo(0.42, -1.5); k.lineTo(0.42, -1.75); k.lineTo(-0.42, -1.75); k.lineTo(-0.42, -1.5); k.lineTo(-0.62, -1.5); k.closePath(); }, col);
      if (o.hat === 'horns') { G(c, [[-0.55, -1.95], [-1.0, -2.55], [-0.3, -2.15]], '#f4f0e0', 0.05); G(c, [[0.55, -1.95], [1.0, -2.55], [0.3, -2.15]], '#f4f0e0', 0.05); }
      if (o.plume) R(c, -0.09, -2.35, 0.18, 0.5, 0.06, o.plume, 0.05);
      if (o.lamp) C(c, 0, -2.0, 0.14, '#fff6a8', 0.04);
      break;
    case 'hood':
      P(c, (k) => { k.arc(0, -1.65, 0.68, Math.PI, 0); k.arc(0, -1.62, 0.5, 0, Math.PI, true); k.closePath(); }, col);
      R(c, -0.72, -1.7, 0.24, 0.7, 0.08, col); R(c, 0.48, -1.7, 0.24, 0.7, 0.08, col);
      break;
    case 'witch':
      E(c, 0, -1.95, 0.85, 0.2, col, 0.06);
      P(c, (k) => { k.moveTo(-0.48, -2.0); k.quadraticCurveTo(-0.3, -2.7, 0.25, -3.1); k.quadraticCurveTo(0.2, -2.5, 0.48, -2.0); k.closePath(); }, col);
      R(c, -0.46, -2.15, 0.92, 0.14, 0.04, o.band || '#d6a931', 0.04);
      break;
    case 'cap':
      P(c, (k) => { k.arc(0, -1.68, 0.56, Math.PI, 0); k.closePath(); }, col);
      R(c, 0.1, -1.74, 0.75, 0.13, 0.05, col);
      break;
    case 'bandana':
      P(c, (k) => { k.arc(0, -1.68, 0.56, Math.PI, 0); k.lineTo(0.56, -1.8); k.lineTo(-0.56, -1.8); k.closePath(); }, col);
      G(c, [[-0.5, -1.85], [-0.95, -1.7], [-0.55, -1.6]], col, 0.05);
      break;
    case 'crown':
      G(c, [[-0.4, -2.05], [-0.45, -2.5], [-0.2, -2.28], [0, -2.55], [0.2, -2.28], [0.45, -2.5], [0.4, -2.05]], '#f5c518');
      C(c, 0, -2.2, 0.07, '#e0443a', 0);
      break;
    default:
      if (o.hair) P(c, (k) => { k.arc(0, -1.78, 0.56, Math.PI, 0); k.lineTo(0.4, -1.62); k.quadraticCurveTo(0, -1.9, -0.4, -1.62); k.closePath(); }, o.hair);
  }
}

// Un personaje de cuerpo entero: `o` dice cómo se viste (cuerpo, pelo, sombrero, arma...).
function person(c, a, o) {
  legs(c, a, o.pants || '#5a4636', 0.26, 0.42);
  P(c, (k) => { k.moveTo(-0.58, -0.2); k.lineTo(-0.4, -1.2); k.lineTo(0.4, -1.2); k.lineTo(0.58, -0.2); k.closePath(); }, o.body);
  if (o.belt) R(c, -0.42, -0.8, 0.84, 0.11, 0.04, o.belt);
  if (o.chest) E(c, 0, -0.95, 0.28, 0.28, o.chest, 0.04);
  hand(c, -0.62, -0.85, o.glove || o.skin || SKIN);
  if (o.shield) { C(c, -0.8, -0.95, 0.44, o.shield); C(c, -0.8, -0.95, 0.17, '#e8d9a8', 0.04); }
  if (o.hairBack) C(c, 0, -1.75, 0.6, o.hairBack);
  C(c, 0, -1.6, 0.52, o.skin || SKIN);
  eyes(c, -1.6, 0.5, { iris: o.iris });
  smile(c, -1.64, 0.5);
  if (o.tusks) { G(c, [[-0.2, -1.4], [-0.3, -1.1], [-0.08, -1.38]], '#f4f0e0', 0.04); G(c, [[0.2, -1.4], [0.3, -1.1], [0.08, -1.38]], '#f4f0e0', 0.04); }
  if (o.beard) P(c, (k) => { k.moveTo(-0.5, -1.5); k.quadraticCurveTo(-0.55, -0.95, 0, -0.9); k.quadraticCurveTo(0.55, -0.95, 0.5, -1.5); k.quadraticCurveTo(0, -1.3, -0.5, -1.5); }, o.beard);
  hat(c, o);
  if (o.weapon) wpn(c, o.weapon, { ...a, glove: o.glove, head: o.head }, o.wk || 1);
}

const barbarian = (c, a) => person(c, a, { body: '#c98a45', pants: '#6b4423', belt: '#7a4b22', hat: 'horns', hatCol: '#c9a24a', beard: '#f2d04a', weapon: 'sword', wk: 0.9 });
const witch = (c, a) => person(c, a, { body: '#6b3fa0', pants: '#3a1f5e', skin: '#b8d99a', hairBack: '#222', hat: 'witch', hatCol: '#3a1f5e', band: '#b86ce0', weapon: 'staff', head: '#b86ce0' });
const executioner = (c, a) => person(c, a, { body: '#5a4040', pants: '#2a2a30', belt: '#2a2a30', hat: 'hood', hatCol: '#2a2a30', weapon: 'axe', wk: 0.85 });
const megaKnight = (c, a) => person(c, a, { body: '#3d4f7a', pants: '#2a3556', belt: '#d6a931', chest: '#5a74b0', hat: 'helmet', hatCol: '#7a8698', plume: '#e0443a', weapon: 'hammer', wk: 1.1, glove: '#7a8698' });
const bandit = (c, a) => person(c, a, { body: '#2f2f3a', pants: '#1f1f28', belt: '#c0392b', hairBack: '#5a2a1a', hat: 'bandana', hatCol: '#c0392b', weapon: 'dagger', wk: 1.25 });
const hunter = (c, a) => person(c, a, { body: '#5f7a3a', pants: '#3f4a2a', belt: '#7a4b22', beard: '#7a4b22', hat: 'cap', hatCol: '#4a3a20', weapon: 'shotgun' });
const bomber = (c, a) => person(c, a, { body: '#4a6aa8', pants: '#2a3a68', skin: '#cfe2f2', hat: 'cap', hatCol: '#2a2a2a', weapon: 'bomb', glove: '#cfe2f2' });
const gladiator = (c, a) => person(c, a, { body: '#a2552a', pants: '#6b4423', belt: '#6b4423', shield: '#c9a24a', hat: 'helmet', hatCol: '#c9a24a', plume: '#e0443a', weapon: 'sword', wk: 0.9 });
const iceWizard = (c, a) => person(c, a, { body: '#4aa8d8', pants: '#2a6a98', skin: '#e8f4ff', beard: '#f4faff', hat: 'witch', hatCol: '#2e7fb8', band: '#f4faff', weapon: 'staff', head: '#bfeaff' });
const spearman = (c, a) => person(c, a, { body: '#8a6a3e', pants: '#4d3420', skin: '#8ac84a', hat: 'bandana', hatCol: '#c44', weapon: 'spear', wk: 0.9 });
const ogre = (c, a) => person(c, a, { body: '#7a5a3a', pants: '#4d3420', belt: '#3a2418', skin: '#7bb83e', glove: '#7bb83e', tusks: true, hair: '#2a2a20', weapon: 'club', wk: 1.1 });
const electroWizard = (c, a) => person(c, a, { body: '#3a4fb5', pants: '#22307a', hair: '#f4e04a', hat: 'cap', hatCol: '#f4e04a', weapon: 'staff', head: '#7fe8ff', belt: '#7fe8ff' });
const princess = (c, a) => person(c, a, { body: '#e86fb0', pants: '#a83a7a', hairBack: '#f2c14e', hat: 'crown', weapon: 'bow', wk: 0.95 });
const miner = (c, a) => person(c, a, { body: '#6b5b4b', pants: '#3f342a', belt: '#d6a931', beard: '#7a4b22', hat: 'helmet', hatCol: '#e6c43a', lamp: true, weapon: 'pick' });

function gianSkeleton(c, a) {
  c.save(); c.scale(1.2, 1.2); skeleton(c, a); c.restore();
  C(c, -1.0, -1.45, 0.52, '#2b2b30'); Ln(c, -0.85, -1.9, -0.65, -2.2, '#c9a24a', 0.07); C(c, -0.62, -2.25, 0.09, '#ff9a2e', 0);
  shine(c, -1.2, -1.65, 0.12, 0.2, 0.4);
}

function golem(c, a) {
  const w = Math.sin(a.t * 6) * 0.05;
  R(c, -0.75, -0.55 + w, 0.65, 0.6, 0.15, '#7d8088'); R(c, 0.1, -0.55 - w, 0.65, 0.6, 0.15, '#7d8088');
  E(c, 0, -1.25, 1.0, 0.85, '#969aa3'); E(c, -0.2, -1.4, 0.55, 0.4, 'rgba(255,255,255,0.12)', 0);
  Ln(c, -0.5, -1.0, -0.2, -1.5, '#6b6f78', 0.05); Ln(c, 0.4, -0.9, 0.7, -1.4, '#6b6f78', 0.05);
  P(c, (k) => { k.moveTo(-0.5, -1.7); k.quadraticCurveTo(-0.2, -1.95, 0.1, -1.7); k.quadraticCurveTo(-0.2, -1.6, -0.5, -1.7); }, '#6aa84f', 0.04);
  C(c, -1.1, -1.0, 0.42, '#858992'); C(c, 1.1, -1.0, 0.42, '#858992');
  R(c, -0.52, -2.35, 1.04, 0.85, 0.2, '#a3a7b0');
  R(c, -0.38, -2.15, 0.76, 0.14, 0.04, '#3a3d44', 0.03);
  C(c, -0.2, -2.0, 0.1, '#ff8a1f', 0); C(c, 0.2, -2.0, 0.1, '#ff8a1f', 0);
  Ln(c, -0.25, -1.75, 0.25, -1.75, OUT, 0.06);
}

function lavaHound(c, a) {
  const f = Math.sin(a.t * 9) * 0.3;
  P(c, (k) => { k.moveTo(-0.4, -1.3); k.quadraticCurveTo(-1.8, -1.8 + f, -1.9, -0.5 + f); k.quadraticCurveTo(-1.0, -0.8, -0.4, -0.7); }, '#5a2a24');
  P(c, (k) => { k.moveTo(0.4, -1.3); k.quadraticCurveTo(1.8, -1.8 - f, 1.9, -0.5 - f); k.quadraticCurveTo(1.0, -0.8, 0.4, -0.7); }, '#5a2a24');
  E(c, 0, -0.95, 0.8, 0.85, '#3a2a30');
  Ln(c, -0.4, -0.7, -0.2, -1.1, '#ff6a1a', 0.07); Ln(c, 0.3, -0.6, 0.5, -1.0, '#ff6a1a', 0.07); Ln(c, 0, -1.2, 0.1, -1.5, '#ff6a1a', 0.06);
  for (const [x, y, r] of [[-0.62, -1.75, 0.38], [0.62, -1.75, 0.38], [0, -2.15, 0.45]]) {
    C(c, x, y, r, '#4a3a40'); G(c, [[x - r * 0.7, y - r * 0.6], [x - r * 0.9, y - r * 1.5], [x - r * 0.2, y - r * 0.9]], '#2a1f24', 0.04); G(c, [[x + r * 0.7, y - r * 0.6], [x + r * 0.9, y - r * 1.5], [x + r * 0.2, y - r * 0.9]], '#2a1f24', 0.04);
    C(c, x - r * 0.35, y, r * 0.16, '#ff8a1f', 0); C(c, x + r * 0.35, y, r * 0.16, '#ff8a1f', 0);
    Ln(c, x - r * 0.4, y + r * 0.45, x + r * 0.4, y + r * 0.45, '#ff6a1a', 0.05);
  }
}

function ram(c, a) {
  const w = Math.sin(a.t * 12) * 0.07;
  R(c, -1.1, -0.1, 0.2, 0.45 + w, 0.06, '#3a2418'); R(c, -0.5, -0.1, 0.2, 0.45 - w, 0.06, '#3a2418'); R(c, 0.3, -0.1, 0.2, 0.45 + w, 0.06, '#3a2418'); R(c, 0.8, -0.1, 0.2, 0.45 - w, 0.06, '#3a2418');
  R(c, -1.15, -0.95, 2.3, 0.2, 0.06, '#9a6a3a'); R(c, -1.15, -1.1, 2.3, 0.14, 0.04, '#7a4b22', 0.04);
  R(c, -1.0, -0.8, 0.12, 0.7, 0.03, '#7a4b22'); R(c, 0.9, -0.8, 0.12, 0.7, 0.03, '#7a4b22');
  R(c, -1.0, -0.65, 2.1, 0.5, 0.14, '#b88048'); R(c, -0.95, -0.4, 2.0, 0.07, 0.02, '#8a5a2b', 0.03);
  G(c, [[0.95, -0.7], [1.55, -0.55], [1.55, -0.28], [0.95, -0.15]], '#9aa1ad'); R(c, 0.92, -0.72, 0.1, 0.6, 0.03, '#6e7480', 0.04);
  C(c, 1.45, -0.42, 0.1, '#d6dce6', 0.03);
  R(c, -0.95, -1.35, 0.2, 0.3, 0.05, '#7a4b22'); R(c, -0.2, -1.35, 0.2, 0.3, 0.05, '#7a4b22');
  G(c, [[-1.2, -1.0], [-0.1, -1.55], [1.0, -1.0]], '#c0392b');
}

function bat(c, a) {
  const f = Math.sin(a.t * 16) * 0.5;
  P(c, (k) => { k.moveTo(-0.3, -1.0); k.quadraticCurveTo(-1.5, -1.75 + f, -1.75, -0.6 + f); k.lineTo(-1.25, -0.85); k.lineTo(-0.95, -0.45); k.lineTo(-0.55, -0.65); k.closePath(); }, '#4a3a66');
  P(c, (k) => { k.moveTo(0.3, -1.0); k.quadraticCurveTo(1.5, -1.75 - f, 1.75, -0.6 - f); k.lineTo(1.25, -0.85); k.lineTo(0.95, -0.45); k.lineTo(0.55, -0.65); k.closePath(); }, '#4a3a66');
  E(c, 0, -0.95, 0.52, 0.6, '#6b5590');
  G(c, [[-0.4, -1.45], [-0.5, -1.95], [-0.12, -1.6]], '#6b5590', 0.05); G(c, [[0.4, -1.45], [0.5, -1.95], [0.12, -1.6]], '#6b5590', 0.05);
  E(c, 0, -1.3, 0.42, 0.38, '#7d68a8');
  C(c, -0.17, -1.35, 0.1, '#ffe24a', 0.03); C(c, 0.17, -1.35, 0.1, '#ffe24a', 0.03); C(c, -0.17, -1.34, 0.04, OUT, 0); C(c, 0.17, -1.34, 0.04, OUT, 0);
  G(c, [[-0.14, -1.12], [-0.08, -0.9], [-0.02, -1.12]], '#fff', 0.03); G(c, [[0.14, -1.12], [0.08, -0.9], [0.02, -1.12]], '#fff', 0.03);
}

function gargoyle(c, a) {
  const f = Math.sin(a.t * 12) * 0.35;
  P(c, (k) => { k.moveTo(-0.3, -1.0); k.quadraticCurveTo(-1.3, -1.5 + f, -1.4, -0.6 + f); k.quadraticCurveTo(-0.9, -0.9, -0.3, -0.6); }, '#6e727c');
  P(c, (k) => { k.moveTo(0.3, -1.0); k.quadraticCurveTo(1.3, -1.5 - f, 1.4, -0.6 - f); k.quadraticCurveTo(0.9, -0.9, 0.3, -0.6); }, '#6e727c');
  E(c, 0, -0.85, 0.55, 0.62, '#9096a2'); Ln(c, -0.25, -0.9, 0.2, -0.7, '#6e727c', 0.05);
  C(c, 0, -1.55, 0.55, '#a3a9b5');
  G(c, [[-0.4, -1.95], [-0.55, -2.5], [-0.12, -2.05]], '#6e727c', 0.05); G(c, [[0.4, -1.95], [0.55, -2.5], [0.12, -2.05]], '#6e727c', 0.05);
  C(c, -0.2, -1.6, 0.12, '#ff4a3a', 0.03); C(c, 0.2, -1.6, 0.12, '#ff4a3a', 0.03);
  Ln(c, -0.25, -1.3, 0.25, -1.3, OUT, 0.06); G(c, [[-0.14, -1.3], [-0.08, -1.12], [-0.02, -1.3]], '#fff', 0.03); G(c, [[0.14, -1.3], [0.08, -1.12], [0.02, -1.3]], '#fff', 0.03);
}

// ─── Edificios nuevos ────────────────────────────────────────────────────────
function bombTower(c, a) {
  R(c, -0.85, -0.2, 1.7, 0.3, 0.1, '#7d766a');
  R(c, -0.65, -1.9, 1.3, 1.8, 0.12, '#a39d90');
  for (let i = 0; i < 4; i++) Ln(c, -0.65, -0.4 - i * 0.4, 0.65, -0.4 - i * 0.4, '#8a8478', 0.04);
  R(c, -0.8, -2.15, 1.6, 0.4, 0.08, '#8f897d');
  for (let i = -1; i <= 1; i++) R(c, i * 0.5 - 0.18, -2.45, 0.36, 0.32, 0.04, '#b9b3a6');
  E(c, 0, -0.95, 0.2, 0.3, '#3a2e28', 0.05);
  const b = Math.sin(a.t * 5) * 0.04;
  C(c, 0, -2.85 + b, 0.38, '#2b2b30'); Ln(c, 0.15, -3.15 + b, 0.35, -3.4 + b, '#c9a24a', 0.06); C(c, 0.38, -3.45 + b, 0.08, '#ff9a2e', 0); shine(c, -0.12, -3.0 + b, 0.1, 0.06, -0.6);
}

function tomb(c, a) {
  E(c, 0, -0.1, 1.15, 0.38, '#6b5a44');
  P(c, (k) => { k.moveTo(-0.65, -0.1); k.lineTo(-0.65, -1.5); k.quadraticCurveTo(0, -2.3, 0.65, -1.5); k.lineTo(0.65, -0.1); k.closePath(); }, '#9a9a9f');
  R(c, -0.1, -1.7, 0.2, 0.8, 0.04, '#6e6e74', 0.04); R(c, -0.38, -1.4, 0.76, 0.2, 0.04, '#6e6e74', 0.04);
  C(c, -0.2, -0.55, 0.16, '#efe8d2', 0.04); C(c, 0.2, -0.55, 0.16, '#efe8d2', 0.04); E(c, 0, -0.35, 0.3, 0.14, '#efe8d2', 0.04);
  const w = Math.sin(a.t * 3) * 0.05;
  C(c, 0.95, -0.2 + w, 0.18, '#efe8d2', 0.04); Ln(c, 0.95, -0.2, 1.05, 0.05, '#efe8d2', 0.08);
  E(c, -0.9, 0.05, 0.3, 0.14, '#4d3c2b', 0.04);
}

function hut(c, a) {
  R(c, -1.0, -1.3, 2.0, 1.4, 0.1, '#b88048'); for (let i = 0; i < 4; i++) Ln(c, -1.0, -1.0 + i * 0.3, 1.0, -1.0 + i * 0.3, '#8a5a2b', 0.05);
  G(c, [[-1.3, -1.25], [0, -2.6], [1.3, -1.25]], '#a8442f'); for (let i = 0; i < 3; i++) Ln(c, -1.0 + i * 0.18 + i * 0.3, -1.3, -0.35 + i * 0.35, -2.1, '#7a2d1f', 0.05);
  P(c, (k) => { k.moveTo(-0.38, 0.1); k.lineTo(-0.38, -0.6); k.quadraticCurveTo(0, -1.0, 0.38, -0.6); k.lineTo(0.38, 0.1); k.closePath(); }, '#2a1f18', 0.05);
  C(c, 0, -0.35, 0.22, '#8ac84a', 0.04); C(c, -0.08, -0.38, 0.05, '#fff6a8', 0); C(c, 0.08, -0.38, 0.05, '#fff6a8', 0);
  R(c, 0.55, -2.4, 0.3, 0.7, 0.04, '#7d766a');
  const s = (a.t * 0.8) % 1; C(c, 0.7 + s * 0.2, -2.6 - s * 0.8, 0.14 + s * 0.12, `rgba(230,230,230,${0.7 - s * 0.6})`, 0);
}

function tesla(c, a) {
  R(c, -0.85, -0.45, 1.7, 0.5, 0.12, '#5a5f6b'); R(c, -0.6, -0.9, 1.2, 0.5, 0.1, '#7a8090');
  C(c, 0, -0.65, 0.14, '#7fe8ff', 0.04);
  R(c, -0.12, -2.3, 0.24, 1.5, 0.05, '#9aa1ad');
  for (const y of [-1.1, -1.5, -1.9]) R(c, -0.38 + (y + 1.1) * 0.05, y, 0.76 - (y + 1.1) * 0.1, 0.1, 0.04, '#c9a24a', 0.04);
  const f = (Math.sin(a.t * 20) + 1) / 2;
  C(c, 0, -2.5, 0.34 + f * 0.04, '#7fe8ff'); C(c, 0, -2.5, 0.16, '#fff', 0);
  c.strokeStyle = '#bff4ff'; c.lineWidth = 0.06; c.lineCap = 'round';
  for (const [dx, dy] of [[-0.9, -0.4], [0.8, -0.6], [0.2, -1.0]]) { c.beginPath(); c.moveTo(0, -2.5); c.lineTo(dx * 0.5, -2.5 + dy * 0.4 - 0.2); c.lineTo(dx, -2.5 + dy); c.stroke(); }
}

// ─── Hechizos nuevos ─────────────────────────────────────────────────────────
function poison(c, a) {
  const f = Math.sin(a.t * 5) * 0.06;
  C(c, -0.6, -0.6, 0.55 + f, 'rgba(110,200,70,0.55)', 0.04); C(c, 0.6, -0.6, 0.5 - f, 'rgba(110,200,70,0.55)', 0.04); C(c, 0, -1.1, 0.7 + f, 'rgba(130,220,80,0.6)', 0.04);
  R(c, -0.38, -1.5, 0.76, 0.85, 0.3, '#78d44a'); R(c, -0.2, -2.0, 0.4, 0.5, 0.06, '#d8e6c8'); R(c, -0.26, -2.18, 0.52, 0.2, 0.05, '#a8703a');
  C(c, -0.12, -1.1, 0.12, '#d8f8b8', 0.03); C(c, 0.16, -0.95, 0.08, '#d8f8b8', 0.03);
  E(c, 0, -0.45, 0.2, 0.17, '#efe8d2', 0.04); E(c, -0.08, -0.47, 0.05, 0.06, OUT, 0); E(c, 0.08, -0.47, 0.05, 0.06, OUT, 0);
}

function hail(c, a) {
  C(c, 0, -1.0, 1.0, 'rgba(160,220,255,0.35)', 0.05);
  for (const [x, y, s, r] of [[0, -1.0, 1, 0], [-0.7, -0.6, 0.6, 0.5], [0.7, -0.5, 0.6, -0.5], [0.4, -1.6, 0.5, 0.3]]) {
    c.save(); c.translate(x, y); c.rotate(r); c.scale(s, s);
    G(c, [[0, -0.9], [0.3, -0.2], [0.2, 0.6], [0, 0.9], [-0.2, 0.6], [-0.3, -0.2]], '#bfeaff'); Ln(c, 0, -0.7, 0, 0.7, '#fff', 0.05);
    c.restore();
  }
  Ln(c, -0.7, -1.0, 0.7, -1.0, '#fff', 0.05); Ln(c, -0.35, -1.6, 0.35, -0.4, '#fff', 0.04); Ln(c, 0.35, -1.6, -0.35, -0.4, '#fff', 0.04);
}

function rocket(c, a) {
  c.save(); c.rotate(-0.55); c.translate(0, -1.0);
  const f = Math.sin(a.t * 20) * 0.1;
  P(c, (k) => { k.moveTo(-0.3, 0.8); k.quadraticCurveTo(0, 1.9 + f, 0.3, 0.8); k.closePath(); }, '#ff8a1f'); P(c, (k) => { k.moveTo(-0.15, 0.8); k.quadraticCurveTo(0, 1.4 + f, 0.15, 0.8); k.closePath(); }, '#ffe08a', 0);
  G(c, [[-0.4, 0.2], [-0.85, 0.95], [-0.35, 0.75]], '#e0443a'); G(c, [[0.4, 0.2], [0.85, 0.95], [0.35, 0.75]], '#e0443a');
  P(c, (k) => { k.moveTo(-0.4, 0.8); k.lineTo(-0.4, -0.5); k.quadraticCurveTo(0, -1.9, 0.4, -0.5); k.lineTo(0.4, 0.8); k.closePath(); }, '#e8ecf4');
  P(c, (k) => { k.moveTo(-0.4, -0.5); k.quadraticCurveTo(0, -1.9, 0.4, -0.5); k.closePath(); }, '#e0443a');
  R(c, -0.4, 0.1, 0.8, 0.14, 0.02, '#e0443a', 0.04); C(c, 0, -0.1, 0.18, '#7fb8ff', 0.05);
  c.restore();
}

function heal(c, a) {
  const f = (Math.sin(a.t * 5) + 1) * 0.04;
  C(c, 0, -1.0, 1.0 + f, 'rgba(120,255,160,0.35)', 0.05);
  G(c, [[-0.25, -1.9], [0.25, -1.9], [0.25, -1.25], [0.9, -1.25], [0.9, -0.75], [0.25, -0.75], [0.25, -0.1], [-0.25, -0.1], [-0.25, -0.75], [-0.9, -0.75], [-0.9, -1.25], [-0.25, -1.25]], '#5ee08a', 0.07);
  G(c, [[-0.15, -1.7], [0.15, -1.7], [0.15, -1.05], [0.7, -1.05], [0.7, -0.95], [0.15, -0.95], [0.15, -0.3], [-0.15, -0.3]], 'rgba(255,255,255,0.4)', 0);
  C(c, -1.0, -1.7, 0.1, '#bfffd0', 0.03); C(c, 0.95, -0.4, 0.08, '#bfffd0', 0.03);
}

function barrel(c, a) {
  const w = Math.sin(a.t * 4) * 0.05;
  E(c, 0, -1.0, 0.82, 1.0, '#b88048'); E(c, 0, -1.0, 0.82, 1.0, null, 0.07);
  for (const y of [-1.6, -0.4]) P(c, (k) => { k.ellipse(0, y, 0.72, 0.16, 0, 0, TAU); }, '#6e7480', 0.05);
  Ln(c, -0.3, -1.9, -0.3, -0.1, '#8a5a2b', 0.05); Ln(c, 0.3, -1.9, 0.3, -0.1, '#8a5a2b', 0.05);
  E(c, 0, -1.0, 0.45, 0.4, '#8a5a2b', 0.05);
  C(c, 0, -2.0 + w, 0.4, '#8ac84a'); G(c, [[-0.35, -2.1], [-0.9, -2.4], [-0.45, -1.8]], '#8ac84a', 0.05); G(c, [[0.35, -2.1], [0.9, -2.4], [0.45, -1.8]], '#8ac84a', 0.05);
  C(c, -0.14, -2.05 + w, 0.1, '#fff6a8', 0.03); C(c, 0.14, -2.05 + w, 0.1, '#fff6a8', 0.03);
}

function logRoll(c, a) {
  const r = (a.t * 3) % TAU;
  R(c, -1.3, -1.25, 2.6, 1.3, 0.2, '#a8703a'); R(c, -1.3, -0.8, 2.6, 0.08, 0.02, '#7a4b22', 0.03); R(c, -1.3, -1.45 + 0.0, 2.6, 0.05, 0.02, '#c28a52', 0.0);
  E(c, 1.3, -0.6, 0.38, 0.66, '#d6a26a'); E(c, 1.3, -0.6, 0.38, 0.66, null, 0.06); E(c, 1.3, -0.6, 0.22, 0.4, null, 0.04); E(c, 1.3, -0.6, 0.08, 0.14, '#8a5a2b', 0.03);
  Ln(c, -0.5 + Math.cos(r) * 0.1, -1.1, -0.5, -0.2, '#7a4b22', 0.04); Ln(c, 0.4, -1.15, 0.4 + Math.sin(r) * 0.05, -0.15, '#7a4b22', 0.04);
  G(c, [[-1.0, -1.25], [-0.85, -1.6], [-0.6, -1.25]], '#6aa84f', 0.04);
}

export const SPRITES = {
  esqueletos: skeleton, duendes: goblin, arqueras: archer, caballero: knight, flechas: arrows, 'mini-pekka': miniPekka,
  mosquetera: musketeer, valquiria: valkyrie, 'bola-de-fuego': fireball, montapuercos: hog, 'bebe-dragon': dragon,
  principe: prince, gigante: giant, globo: balloon, esbirros: minion, canon: cannon, descarga: zap, mago: wizard,
  mortero: mortar, pekka,
  murcielagos: bat, barbaros: barbarian, 'gigante-esqueleto': gianSkeleton, golem, golemita: golem, bruja: witch, verdugo: executioner,
  'mega-caballero': megaKnight, bandida: bandit, cazador: hunter, bombardero: bomber, 'sabueso-de-lava': lavaHound, gladiador: gladiator,
  'mago-de-hielo': iceWizard, ariete: ram, lanceros: spearman, ogro: ogre, gargolas: gargoyle, electromago: electroWizard, princesa: princess,
  minero: miner, 'torre-bomba': bombTower, tumba: tomb, cabana: hut, tesla, veneno: poison, granizo: hail, cohete: rocket, curacion: heal,
  barril: barrel, tronco: logRoll,
};

// Dibuja la carta `id` con los pies en (x, y) y radio `r` en píxeles. `a`: { t (segundos), swing (radianes), aim (radianes, edificios) }.
export function drawSprite(ctx, id, x, y, r, a = {}) {
  const fn = SPRITES[id];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  fn(ctx, { t: 0, swing: 0, aim: -Math.PI / 2, ...a });
  ctx.restore();
}

// ─── Arte de la carta (mano, mazo, salas) ────────────────────────────────────
export const RARITY = {
  common: { frame: '#8fb0d0', glow: '#cfe3f5', back: ['#bfe0ff', '#6aa4dc'] },
  rare: { frame: '#f0a03c', glow: '#ffd89a', back: ['#ffe2a8', '#e89a3c'] },
  epic: { frame: '#b45be0', glow: '#e3b8ff', back: ['#ecc8ff', '#a255d0'] },
};

const ART_SCALE = { globo: 0.62, gigante: 0.82, pekka: 0.8, 'bebe-dragon': 0.88, esbirros: 0.85, principe: 0.8, hog: 0.85, montapuercos: 0.85, mortero: 0.9, canon: 0.95, 'mini-pekka': 0.95, valquiria: 0.92,
  golem: 0.75, 'gigante-esqueleto': 0.8, 'sabueso-de-lava': 0.8, 'mega-caballero': 0.85, ogro: 0.9, ariete: 0.85, 'torre-bomba': 0.8, tesla: 0.85, cabana: 0.8, tumba: 0.9, minero: 0.9, golemita: 0.9 };
const ART_GROUP = { esqueletos: [[-0.8, 0.1], [0.8, 0.1], [0, -0.35]], duendes: [[-0.85, 0.1], [0.85, 0.1], [0, -0.35]], arqueras: [[-0.7, 0], [0.7, 0]], esbirros: [[-0.9, 0.15], [0.9, 0.15], [0, -0.45]],
  murcielagos: [[-0.9, 0.15], [0.9, 0.15], [0, -0.45]], lanceros: [[-0.85, 0.1], [0.85, 0.1], [0, -0.35]],
  barbaros: [[-0.8, 0.1], [0.8, 0.1], [-0.4, -0.4], [0.4, -0.4]], gargolas: [[-0.8, 0.1], [0.8, 0.1], [-0.4, -0.4], [0.4, -0.4]] };

export function drawCardArt(ctx, card, w, h, t = 0) {
  const rar = RARITY[card.rarity] || RARITY.common;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rar.back[0]); grad.addColorStop(1, rar.back[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  const rays = ctx.createRadialGradient(w / 2, h * 0.55, 2, w / 2, h * 0.55, w * 0.75);
  rays.addColorStop(0, 'rgba(255,255,255,0.55)'); rays.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rays; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.86, w * 0.36, h * 0.07, 0, 0, TAU); ctx.fill();
  const k = (ART_SCALE[card.id] || 1) * h * 0.26;
  const group = ART_GROUP[card.id];
  if (group) {
    for (const [dx, dy] of [...group].sort((p, q) => p[1] - q[1])) drawSprite(ctx, card.id, w / 2 + dx * k * 0.9, h * 0.84 + dy * k, k * 0.82, { t });
  } else if (card.kind === 'spell') {
    drawSprite(ctx, card.id, w / 2, h * 0.9, h * 0.34, { t });
  } else {
    drawSprite(ctx, card.id, w / 2, h * 0.86, k, { t });
  }
}
