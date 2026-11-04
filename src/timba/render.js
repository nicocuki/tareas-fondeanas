// Dibujo de La Timba en pixel art: todo con código, sobre un canvas chico que el CSS agranda con
// `image-rendering: pixelated`. Sin estado de juego: reciben lo que hay que mostrar y lo dibujan. Los colores son
// fijos (el casino se ve igual en los dos temas).
//
// Un «pixel» del juego son `Q` unidades del mundo y el canvas se dibuja con escala 1/Q: todo pasa por `R` (rectángulo
// pegado a la grilla), `disc`, `ell`, `tri`, `line` y el texto de 3 × 5 (`txt`), así nunca queda un borde suavizado.
import { GROUND, SCENES, seatPos } from './scenes.js';
import { isRed, rankOf } from './bj.js';

export const Q = 2;
const q = (v) => Math.round(v / Q) * Q;
const INK = '#14101c';
const GOLD = '#f0c33c';
const HEAD = '#e4ebf2';

function mulberry(seed) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ─── Herramientas de pixel ──────────────────────────────────────────────────
function R(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  const x0 = q(x); const y0 = q(y);
  ctx.fillStyle = c;
  ctx.fillRect(x0, y0, Math.max(Q, q(x + w) - x0), Math.max(Q, q(y + h) - y0));
}
// Lo mismo, con medidas en pixeles del juego (para los dibujos hechos a mano): (0, 0) es `ox, oy`.
const P = (ctx, ox, oy, px, py, pw, ph, c) => R(ctx, ox + px * Q, oy + py * Q, pw * Q, ph * Q, c);

function disc(ctx, cx, cy, r, c) {
  const rp = Math.max(1, Math.round(r / Q)); const cxp = Math.round(cx / Q); const cyp = Math.round(cy / Q);
  ctx.fillStyle = c;
  for (let j = -rp; j <= rp; j++) { const w = Math.floor(Math.sqrt(rp * rp + 0.6 - j * j)); ctx.fillRect((cxp - w) * Q, (cyp + j) * Q, (2 * w + 1) * Q, Q); }
}
function ell(ctx, cx, cy, rx, ry, c) {
  const rxp = Math.max(1, Math.round(rx / Q)); const ryp = Math.max(1, Math.round(ry / Q)); const cxp = Math.round(cx / Q); const cyp = Math.round(cy / Q);
  ctx.fillStyle = c;
  for (let j = -ryp; j <= ryp; j++) { const w = Math.floor(rxp * Math.sqrt(Math.max(0, 1 - (j * j) / (ryp * ryp + 0.4))) + 0.3); ctx.fillRect((cxp - w) * Q, (cyp + j) * Q, (2 * w + 1) * Q, Q); }
}
// Triángulo con la punta arriba en (cx, y), de ancho `half * 2` abajo.
function tri(ctx, cx, y, half, h, c) {
  for (let j = 0; j < h; j += Q) R(ctx, cx - half * (j / h), y + j, half * 2 * (j / h) + Q, Q, c);
}
function line(ctx, x0, y0, x1, y1, th, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Q));
  for (let i = 0; i <= n; i++) R(ctx, x0 + ((x1 - x0) * i) / n - th / 2, y0 + ((y1 - y0) * i) / n - th / 2, th, th, c);
}
// Marco con borde oscuro de un pixel.
function box(ctx, x, y, w, h, fill, edge = INK) { R(ctx, x - Q, y - Q, w + 2 * Q, h + 2 * Q, edge); R(ctx, x, y, w, h, fill); }

const shadeCache = new Map();
function shade(c, a) {
  const key = c + a;
  if (shadeCache.has(key)) return shadeCache.get(key);
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  const n = m ? parseInt(m[1], 16) : 0x888888;
  const f = (v) => Math.max(0, Math.min(255, Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a)));
  const out = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

// ─── Letras de 3 × 5 ────────────────────────────────────────────────────────
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110',
  6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010', '$': '011110010011110', '-': '000000111000000',
  ':': '000010000010000', '/': '001001010100100', '+': '000010111010000', '%': '101001010100101', '=': '000111000111000', "'": '010010000000000',
};
const clean = (s) => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const textW = (s, k) => (clean(s).length * 4 - 1) * k * Q;

// `k` = tamaño (pixeles del juego por pixel de la letra). `x, y`: centro (o inicio con align left).
function txt(ctx, s, x, y, k, color, edge = null, align = 'center') {
  const str = clean(s);
  const w = textW(s, k);
  let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  x0 = q(x0); const y0 = q(y - (5 * k * Q) / 2);
  const draw = (ox, oy, c) => {
    ctx.fillStyle = c;
    for (let i = 0; i < str.length; i++) {
      const g = FONT[str[i]];
      if (!g) continue;
      for (let b = 0; b < 15; b++) if (g[b] === '1') ctx.fillRect(x0 + (i * 4 + (b % 3)) * k * Q + ox, y0 + Math.floor(b / 3) * k * Q + oy, k * Q, k * Q);
    }
  };
  if (edge) { const d = Q; for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d]]) draw(ox, oy, edge); }
  draw(0, 0, color);
}

// ─── Personajes (bolitas con traje, como en el original) ─────────────────────
function eyesSide(ctx, ox, oy, f, bob) {
  for (const ex of [f * 1, f * 4]) {
    const x = f > 0 ? ex : ex - 2;
    P(ctx, ox, oy, x, -29 + bob, 2, 3, '#fff');
    P(ctx, ox, oy, x + (f > 0 ? 1 : 0), -28 + bob, 1, 2, INK);
    P(ctx, ox, oy, x - (f > 0 ? 0 : 1), -31 + bob, 3, 1, INK);
  }
}

// De costado: `face` es 1 (derecha) o -1.
export function drawBlobSide(ctx, x, y, color, face, phase, name, extra = {}) {
  const f = face >= 0 ? 1 : -1;
  const frame = extra.moving ? Math.floor(phase * 9) % 4 : 0;
  const lo = [0, 1, 0, -1][frame];
  const bob = frame % 2 === 1 ? -1 : 0;
  const ox = q(x); const oy = q(y);
  const dark = shade(color, -0.4);
  ctx.globalAlpha = 0.35; P(ctx, ox, oy, -7, -1, 14, 2, '#000'); ctx.globalAlpha = 1;
  // piernas y zapatos
  P(ctx, ox, oy, -4, -7, 3, 7 - (lo > 0 ? 1 : 0), '#241c34'); P(ctx, ox, oy, 1, -7, 3, 7 - (lo < 0 ? 1 : 0), '#241c34');
  P(ctx, ox, oy, -4 - (f < 0 ? 1 : 0), -1 - (lo > 0 ? 1 : 0), 4, 1, INK); P(ctx, ox, oy, 1 - (f < 0 ? 1 : 0), -1 - (lo < 0 ? 1 : 0), 4, 1, INK);
  // brazos (atrás del cuerpo)
  P(ctx, ox, oy, -9, -17 + bob + lo, 2, 8, dark); P(ctx, ox, oy, -9, -9 + bob + lo, 2, 2, HEAD);
  P(ctx, ox, oy, 7, -17 + bob - lo, 2, 8, dark); P(ctx, ox, oy, 7, -9 + bob - lo, 2, 2, HEAD);
  // saco, camisa y corbata
  P(ctx, ox, oy, -7, -20 + bob, 14, 14, INK);
  P(ctx, ox, oy, -6, -19 + bob, 12, 12, color);
  P(ctx, ox, oy, -6, -19 + bob, 2, 12, dark);
  P(ctx, ox, oy, -2, -19 + bob, 4, 4, '#fff');
  P(ctx, ox, oy, -1, -17 + bob, 2, 9, '#c8283a');
  P(ctx, ox, oy, f * 3 - (f < 0 ? 1 : 0), -13 + bob, 1, 1, GOLD); P(ctx, ox, oy, f * 3 - (f < 0 ? 1 : 0), -10 + bob, 1, 1, GOLD);
  // cabeza
  disc(ctx, ox, oy + (-27 + bob) * Q, 7 * Q, INK);
  disc(ctx, ox, oy + (-27 + bob) * Q, 6 * Q, HEAD);
  eyesSide(ctx, ox, oy, f, bob);
  if (extra.hat) { P(ctx, ox, oy, -8, -35 + bob, 16, 2, extra.hat); P(ctx, ox, oy, -5, -40 + bob, 10, 5, extra.hat); P(ctx, ox, oy, -5, -36 + bob, 10, 1, GOLD); }
  if (name) txt(ctx, name, ox, oy - 46 * Q, 1, '#fff', INK);
}

// Desde arriba: `face` es el ángulo hacia donde mira.
export function drawBlobTop(ctx, x, y, color, face, phase, name, extra = {}) {
  const frame = extra.moving ? Math.floor(phase * 9) % 4 : 0;
  const sw = [0, 1, 0, -1][frame];
  const fx = Math.cos(face); const fy = Math.sin(face);
  const px = -fy; const py = fx;
  const ox = q(x); const oy = q(y);
  const dark = shade(color, -0.4);
  ctx.globalAlpha = 0.35; ell(ctx, ox, oy + 8 * Q, 8 * Q, 3 * Q, '#000'); ctx.globalAlpha = 1;
  // cuerpo con traje
  ell(ctx, ox, oy + 3 * Q, 7 * Q, 6 * Q, INK);
  ell(ctx, ox, oy + 3 * Q, 6 * Q, 5 * Q, color);
  P(ctx, ox, oy, -1, 0, 2, 7, '#c8283a');
  // manos
  for (const s of [-1, 1]) {
    const hx = Math.round(px * 7 * s + fx * 2 * sw * s); const hy = Math.round(py * 7 * s + 2 + fy * 2 * sw * s);
    P(ctx, ox, oy, hx - 1, hy - 1, 3, 3, INK); P(ctx, ox, oy, hx - 1, hy - 1, 2, 2, HEAD);
  }
  // cabeza
  disc(ctx, ox, oy - 3 * Q, 7 * Q, INK);
  disc(ctx, ox, oy - 3 * Q, 6 * Q, HEAD);
  // ojos: adelante, a los lados de la dirección en la que mira
  for (const s of [-1, 1]) {
    const ex = Math.round(fx * 3 + px * 2.6 * s); const ey = Math.round(-3 + fy * 3 + py * 2.6 * s);
    P(ctx, ox, oy, ex - 1, ey - 1, 2, 2, '#fff');
    P(ctx, ox, oy, ex - 1 + Math.round(fx * 0.7 + 0.2), ey - 1 + Math.round(fy * 0.7 + 0.2), 1, 1, INK);
  }
  if (extra.hat) { disc(ctx, ox, oy - 5 * Q, 5 * Q, extra.hat); P(ctx, ox, oy, -4, -5, 8, 1, GOLD); }
  void dark;
  if (name) txt(ctx, name, ox, oy - 17 * Q, 1, '#fff', INK);
}

// La tecla E que se balancea arriba de lo que tenés a mano.
function keycap(ctx, x, y, t, label = 'E') {
  const bob = Math.round(Math.sin(t * 6) * 1.2) * Q;
  const ox = q(x) - 5 * Q; const oy = q(y) + bob;
  P(ctx, ox, oy, 0, 0, 11, 11, INK);
  P(ctx, ox, oy, 1, 1, 9, 8, GOLD);
  P(ctx, ox, oy, 1, 9, 9, 1, '#a8781a');
  txt(ctx, label, ox + 5.5 * Q, oy + 5 * Q, 1, INK);
  P(ctx, ox, oy, 4, 11, 3, 1, INK); P(ctx, ox, oy, 5, 12, 1, 1, INK);
}

// ─── Cosas sueltas ──────────────────────────────────────────────────────────
function palm(ctx, x, base, h, t, seed = 0) {
  const sway = Math.round(Math.sin(t * 1.1 + seed) * 2) * Q;
  const segs = Math.floor(h / (4 * Q));
  for (let i = 0; i < segs; i++) {
    const u = i / segs;
    const cx = x + u * u * 14 + sway * u;
    const y = base - (i + 1) * 4 * Q;
    R(ctx, cx - 3 * Q, y, 6 * Q, 4 * Q, INK);
    R(ctx, cx - 2 * Q, y, 4 * Q, 4 * Q, i % 2 ? '#7a4f36' : '#8a5a3e');
  }
  const tx = x + 14 + sway; const ty = base - segs * 4 * Q;
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    const len = 30 + (k % 2) * 8;
    const ex = tx + Math.cos(a) * len; const ey = ty + Math.sin(a) * len * 0.5 + 18 + Math.abs(Math.cos(a)) * 6 + Math.sin(t * 2 + k) * 1.5;
    const mx = tx + Math.cos(a) * len * 0.5; const my = ty + Math.sin(a) * len * 0.5 - 4;
    line(ctx, tx, ty, mx, my, 5, k % 2 ? '#2f8a3f' : '#3da34c');
    line(ctx, mx, my, ex, ey, 4, k % 2 ? '#2f8a3f' : '#3da34c');
  }
  disc(ctx, tx - 4, ty + 6, 4, '#5a3a22'); disc(ctx, tx + 4, ty + 7, 4, '#5a3a22');
}

function drawStars(ctx, camX, viewW, top, t) {
  const rnd = mulberry(11);
  for (let i = 0; i < 110; i++) {
    const sx = rnd() * 1500; const sy = top + rnd() * (GROUND + 100 - top - 120); const tw = rnd() * 6;
    if (sx < camX - 10 || sx > camX + viewW + 10) continue;
    R(ctx, sx, sy, Q, Q, Math.sin(t * 2 + tw) > 0.4 ? '#fff' : '#9aa0d8');
  }
}

const SKYLINE = (() => {
  const r = mulberry(5);
  return Array.from({ length: 30 }, (_, i) => ({ x: i * 76 + r() * 24, w: 36 + r() * 46, h: 50 + r() * 120, seed: r() }));
})();

function drawSkyline(ctx, color, lit, t) {
  for (const b of SKYLINE) {
    R(ctx, b.x, GROUND - b.h, b.w, b.h + 4, color);
    for (let wy = GROUND - b.h + 8; wy < GROUND - 10; wy += 12) for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 10) {
      const on = (((wx * 7 + wy * 3) | 0) % 5 < 2) !== (Math.sin(t * 0.5 + wx + wy) > 0.97);
      if (on) R(ctx, wx, wy, Q * 2, Q * 2, lit);
    }
  }
  // una torre con aguja, como la de Las Vegas
  tri(ctx, 700, GROUND - 200, 26, 200, color);
  R(ctx, 698, GROUND - 240, Q, 40, color);
}

// Bandas de color con un borde punteado entre una y otra (así se ve el degradado en pixel art).
function drawSkyBands(ctx, camX, viewW, top, bottom, colors) {
  const n = colors.length;
  const bh = Math.ceil((bottom - top) / n / Q) * Q;
  for (let i = 0; i < n; i++) {
    const y = top + i * bh;
    R(ctx, camX - 8, y, viewW + 16, bh + Q, colors[i]);
    if (i < n - 1) for (let x = Math.floor(camX / 8) * 8; x < camX + viewW + 8; x += 8) { R(ctx, x, y + bh - Q, Q, Q, colors[i + 1]); R(ctx, x + 4, y + bh, Q, Q, colors[i]); }
  }
}

// ─── Escenas de costado ─────────────────────────────────────────────────────
function drawHouse(ctx, h, t) {
  const top = GROUND - 112;
  // techo a dos aguas con tejas
  tri(ctx, h.x + h.w / 2, top - 88, h.w / 2 + 24, 90, INK);
  tri(ctx, h.x + h.w / 2, top - 84, h.w / 2 + 20, 86, '#a8363f');
  for (let j = 6; j < 86; j += 12) R(ctx, h.x + h.w / 2 - (h.w / 2 + 20) * (j / 86), top - 84 + j, (h.w + 40) * (j / 86), Q, '#8a2a34');
  box(ctx, h.x + h.w - 90, top - 70, 26, 50, '#b0a68e');
  R(ctx, h.x + h.w - 92, top - 74, 30, 6, '#8a8068');
  // humo
  for (let i = 0; i < 3; i++) { const u = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 0.5 * (1 - u); R(ctx, h.x + h.w - 80 + Math.sin(u * 5) * 6, top - 84 - u * 44, 8 + u * 6, 8 + u * 6, '#e8e4f0'); ctx.globalAlpha = 1; }
  // paredes
  box(ctx, h.x, top, h.w, 112, '#ecdcb6');
  for (let y = top + 12; y < GROUND - 8; y += 14) R(ctx, h.x, y, h.w, Q, '#d8c69c');
  // puerta
  const dx = h.x + h.w * 0.54;
  box(ctx, dx, GROUND - 82, 48, 82, '#5a3a2a');
  R(ctx, dx + 6, GROUND - 74, 14, 30, '#7a5238'); R(ctx, dx + 26, GROUND - 74, 16, 30, '#7a5238');
  R(ctx, dx + 38, GROUND - 40, 4, 4, GOLD);
  // ventanas con luz
  for (const wx of [h.x + 40, h.x + h.w - 110]) {
    box(ctx, wx, top + 28, 56, 46, Math.sin(t * 1.3 + wx) > 0.92 ? '#ffe9a8' : '#ffd36a', '#5a3a2a');
    R(ctx, wx + 26, top + 28, 4, 46, '#5a3a2a'); R(ctx, wx, top + 50, 56, 4, '#5a3a2a');
    R(ctx, wx + 6, top + 34, 12, 12, 'rgba(255,255,255,0.35)');
  }
  R(ctx, h.x - 8, GROUND - 8, h.w + 16, 8, '#b9ab8c');
  box(ctx, h.x + h.w / 2 - 40, top - 28, 80, 16, '#3a1018');
  txt(ctx, 'CASITA', h.x + h.w / 2, top - 20, 2, '#ffe9b0');
}

function wheel(ctx, x, y, r, spin) {
  disc(ctx, x, y, r, INK);
  disc(ctx, x, y, r - 4, '#c3c8d4');
  disc(ctx, x, y, r - 9, '#6a7080');
  const f = Math.floor(spin) % 2;
  if (f) { R(ctx, x - 1, y - r + 5, Q, r * 2 - 10, '#c3c8d4'); R(ctx, x - r + 5, y - 1, r * 2 - 10, Q, '#c3c8d4'); } else { line(ctx, x - r + 6, y - r + 6, x + r - 6, y + r - 6, Q, '#c3c8d4'); line(ctx, x + r - 6, y - r + 6, x - r + 6, y + r - 6, Q, '#c3c8d4'); }
}

function drawVan(ctx, v, t) {
  const y = GROUND;
  // toldo de rayas
  for (let i = 0; i < 8; i++) { R(ctx, v.x + 22 + i * 18, y - 128, 18, 20, i % 2 ? '#fff' : '#d8403a'); R(ctx, v.x + 22 + i * 18, y - 108, 18, 4, i % 2 ? '#d8d4e0' : '#a8282a'); }
  R(ctx, v.x + 20, y - 130, 148, 4, INK);
  box(ctx, v.x, y - 104, v.w, 90, '#f4f0e6');
  R(ctx, v.x, y - 54, v.w, 14, '#2fbf9f');
  // cabina del frente (a la derecha)
  box(ctx, v.x + v.w - 76, y - 104, 76, 90, '#e4dfd2');
  box(ctx, v.x + v.w - 64, y - 94, 52, 34, '#6b86a8');
  R(ctx, v.x + v.w - 60, y - 90, 14, 10, 'rgba(255,255,255,0.4)');
  // ventanilla de venta con mercadería
  box(ctx, v.x + 14, y - 100, 142, 48, '#23202b');
  const colors = ['#e0525a', '#f0c33c', '#4a9be8', '#5ec46b', '#b46bf0'];
  for (let i = 0; i < 5; i++) { const hh = 16 + (i % 2) * 8; box(ctx, v.x + 22 + i * 26, y - 92 + (24 - hh) + 8, 18, hh, colors[i], '#23202b'); }
  R(ctx, v.x + 10, y - 50, 150, 8, '#8a6a46');
  txt(ctx, 'TIENDA', v.x + 86, y - 30, 2, '#1a6b5a', '#f4f0e6');
  wheel(ctx, v.x + 52, y - 12, 18, t * 2);
  wheel(ctx, v.x + v.w - 52, y - 12, 18, t * 2);
  R(ctx, v.x + v.w - 4, y - 40, 6, 8, Math.sin(t * 3) > -0.3 ? '#ffe9a0' : '#c8b46a');
  // lamparitas del toldo
  for (let i = 0; i < 8; i++) R(ctx, v.x + 28 + i * 18, y - 134, 4, 4, (Math.floor(t * 2) + i) % 2 ? '#ffe9a0' : '#a8803a');
}

// La limusina: el frente apunta a la derecha y la parte de atrás (de donde se sube) es la izquierda.
function drawLimo(ctx, l, { door = 1, go = 0, heads = 0, t = 0 }) {
  const x = l.x + go * go * go * 2600;
  const y = GROUND;
  const w = l.w;
  // sombra
  ctx.globalAlpha = 0.35; ell(ctx, x + w / 2, y + 2, w / 2 + 8, 6, '#000'); ctx.globalAlpha = 1;
  // humo del escape cuando arranca
  if (go > 0 && go < 0.95) for (let i = 0; i < 5; i++) { const u = (t * 2 + i / 5) % 1; ctx.globalAlpha = 0.55 * (1 - u); R(ctx, x - 6 - u * 36, y - 14 - u * 16, 8 + u * 8, 8 + u * 8, '#cfd2dc'); ctx.globalAlpha = 1; }
  // carrocería
  box(ctx, x, y - 62, w, 46, '#1c1c2a');
  R(ctx, x + 4, y - 60, w - 8, 4, '#3a3a52');
  R(ctx, x + 2, y - 30, w - 4, 2, '#8a90ac');
  R(ctx, x, y - 62, 4, 4, '#0b0a14'); R(ctx, x + w - 4, y - 62, 4, 4, '#0b0a14');
  // techo y ventanas
  box(ctx, x + 56, y - 82, w - 170, 22, '#232336');
  const nWin = Math.max(3, Math.floor((w - 190) / 52));
  const ww = (w - 190) / nWin;
  for (let i = 0; i < nWin; i++) {
    const wx = x + 62 + i * ww;
    R(ctx, wx, y - 78, ww - 6, 15, '#2f4a9a');
    R(ctx, wx + 2, y - 76, 8, 4, 'rgba(255,255,255,0.35)');
    if (i < heads) { disc(ctx, wx + (ww - 6) / 2, y - 68, 6, HEAD); R(ctx, wx + (ww - 6) / 2 - 4, y - 72, 8, 2, INK); }
  }
  // luces
  R(ctx, x, y - 54, 6, 12, '#e0303a'); R(ctx, x + w - 7, y - 52, 7, 10, '#ffe9a0');
  if (go < 0.95) { ctx.globalAlpha = 0.14; for (let j = 0; j < 60; j += Q) R(ctx, x + w + j, y - 52 - j * 0.25, Q, 24 + j * 0.5, '#ffe9a0'); ctx.globalAlpha = 1; }
  // ruedas
  for (const wx of [x + 78, x + w / 2 + 20, x + w - 90]) wheel(ctx, wx, y - 14, 17, go * 40);
  // la puerta de atrás (el baúl): abierta se levanta
  const ang = -door * 1.0;
  line(ctx, x + 4, y - 62, x + 4 + Math.cos(ang) * 52, y - 62 + Math.sin(ang) * 52, 6, '#2a2a3c');
  line(ctx, x + 4, y - 62, x + 4 + Math.cos(ang) * 52, y - 62 + Math.sin(ang) * 52, 2, '#6a6a88');
  void t;
}

function drawSide(ctx, view, key, st) {
  const sc = SCENES[key];
  const { camX, w, h } = view;
  const tx = -Math.round(camX / Q);
  const ty = Math.round(h * 0.8 - GROUND / Q);
  ctx.setTransform(1 / Q, 0, 0, 1 / Q, tx, ty);
  const viewW = w * Q;
  const top = -ty * Q - 8;
  const night = key === 'outside';
  const t = st.time;
  if (night) drawSkyBands(ctx, camX, viewW, top, GROUND, ['#050818', '#0a0e2a', '#10143a', '#181a4a', '#241f58', '#33266a', '#4a2a6a']);
  else drawSkyBands(ctx, camX, viewW, top, GROUND, ['#1d1442', '#2a1b5e', '#43246e', '#6a2d78', '#9a3a7a', '#c8507a', '#ee7a6a', '#ff9a6a', '#ffb878', '#ffd08a']);
  if (night) drawStars(ctx, camX, viewW, top, t);
  else {
    const sx = camX * 0.85 + 460;
    disc(ctx, sx, 230, 70, 'rgba(255,190,110,0.28)'); disc(ctx, sx, 230, 46, '#ffb35a'); disc(ctx, sx, 230, 36, '#ffd27a'); disc(ctx, sx, 230, 24, '#fff2b0');
    for (let i = 0; i < 4; i++) R(ctx, sx - 60, 226 + i * 8, 120, Q * (i + 1), '#ff9a6a');
  }
  // nubes que pasan
  if (!night) for (let i = 0; i < 4; i++) { const cx = ((i * 520 + t * 8) % 2200) - 300 + camX * 0.9; R(ctx, cx, 80 + i * 22, 60, 8, 'rgba(255,200,170,0.55)'); R(ctx, cx + 14, 72 + i * 22, 34, 8, 'rgba(255,200,170,0.55)'); }
  // edificios lejanos
  ctx.save(); ctx.translate(Math.round(camX * 0.4 / Q) * Q, 0);
  drawSkyline(ctx, night ? '#161235' : '#4a2a62', night ? '#ffd27a' : '#ffd9a0', t);
  ctx.restore();
  // piso
  R(ctx, camX - 8, GROUND, viewW + 16, 500, night ? '#2b2236' : '#9a6a4e');
  R(ctx, camX - 8, GROUND, viewW + 16, 6, night ? '#4a3a5e' : '#c8906a');
  for (let y = GROUND + 20; y < GROUND + 120; y += 20) for (let x = Math.floor(camX / 40) * 40 + (y % 40 ? 20 : 0); x < camX + viewW + 40; x += 40) R(ctx, x, y, 20, Q, night ? '#1d1628' : '#7a5238');

  if (key === 'wait') {
    for (const px of [500, 880, 1100, 1480]) palm(ctx, px, GROUND, 130 + (px % 40), t, px);
    drawHouse(ctx, sc.house, t);
    drawVan(ctx, sc.van, t);
    drawLimo(ctx, sc.limo, { door: st.limoDoor, go: st.limoGo, heads: st.heads, t });
    for (let x = 0; x < sc.w; x += 80) R(ctx, x, GROUND + 34, 40, Q * 2, 'rgba(255,230,170,0.55)');
  } else {
    drawEntrance(ctx, sc, st);
    drawLimo(ctx, sc.limo, { door: 1, go: 0, heads: 0, t });
  }
  for (const p of [...st.players].sort((a, b) => a.x - b.x)) {
    drawBlobSide(ctx, p.x, GROUND, p.color, p.face || 1, p.phase || 0, p.name, { moving: p.moving, hat: p.hat });
    if (p.me && st.near) keycap(ctx, p.x, GROUND - 52 * Q, t);
  }
}

function drawEntrance(ctx, sc, st) {
  const e = sc.entrance;
  const t = st.time;
  // la torre del casino, con ventanas que se prenden y se apagan
  R(ctx, e.x - 80, -420, e.w + 160, GROUND + 420, '#241a3a');
  const rnd = mulberry(23);
  for (let y = -400; y < GROUND - 180; y += 20) for (let x = e.x - 66; x < e.x + e.w + 66; x += 20) {
    const base = rnd() < 0.55;
    const flick = Math.sin(t * 0.6 + x * 0.13 + y * 0.07) > 0.985;
    R(ctx, x, y, 12, 10, base !== flick ? '#ffe3a0' : '#3a3560');
  }
  for (const lx of [e.x + 30, e.x + e.w - 44]) { R(ctx, lx, -420, 14, GROUND + 420, 'rgba(255,255,255,0.16)'); R(ctx, lx + 4, -420, 6, GROUND + 420, 'rgba(255,255,255,0.32)'); }
  // alfombra roja
  R(ctx, e.x - 230, GROUND - 2, e.w + 300, 30, INK);
  R(ctx, e.x - 228, GROUND, e.w + 296, 26, '#8a1d2a');
  R(ctx, e.x - 228, GROUND + 4, e.w + 296, 2, GOLD); R(ctx, e.x - 228, GROUND + 20, e.w + 296, 2, GOLD);
  // techo rojo con lucecitas
  box(ctx, e.x + 10, GROUND - 236, e.w - 20, 76, '#a8242e');
  for (let i = 0; i < 9; i++) R(ctx, e.x + 22 + i * 46, GROUND - 168, 8, 8, (Math.floor(t * 3) + i) % 2 ? '#ffd27a' : '#c8923a');
  for (let i = 0; i < 8; i++) tri(ctx, e.x + 40 + i * 48, GROUND - 160, 18, 16, '#d8404a');
  // columnas
  for (const cx of [e.x + 30, e.x + e.w - 52]) {
    box(ctx, cx, GROUND - 156, 22, 156, '#f0dcb4');
    R(ctx, cx + 4, GROUND - 156, 4, 156, '#fff4d4'); R(ctx, cx + 14, GROUND - 156, 4, 156, '#d8c08a');
    box(ctx, cx - 6, GROUND - 168, 34, 12, '#e8a23a'); box(ctx, cx - 6, GROUND - 8, 34, 8, '#e8a23a');
  }
  // las puertas de vidrio
  const dx = sc.doorX - 62;
  box(ctx, dx, GROUND - 120, 124, 120, '#2a1a12');
  for (const off of [6, 64]) { R(ctx, dx + off, GROUND - 112, 52, 108, '#2c6b52'); R(ctx, dx + off + 6, GROUND - 106, 10, 90, 'rgba(255,255,255,0.22)'); R(ctx, dx + off + 40, GROUND - 106, 4, 90, 'rgba(255,255,255,0.12)'); }
  R(ctx, dx - 4, GROUND - 126, 132, 8, '#e8a23a');
  for (let i = 0; i < 7; i++) R(ctx, dx + 4 + i * 18, GROUND - 126, 4, 4, (Math.floor(t * 4) + i) % 2 ? '#fff4b0' : '#e8a23a');
  ctx.globalAlpha = 0.12; for (let j = 0; j < 3; j++) R(ctx, dx - 30 - j * 10, GROUND - 100 + j * 18, 190 + j * 20, 24, '#ffdc8c'); ctx.globalAlpha = 1;
  // cartel de neón que parpadea
  const on = Math.sin(t * 7) > -0.88;
  box(ctx, e.x + e.w / 2 - 94, GROUND - 230, 188, 58, '#3a0a18');
  txt(ctx, 'LA TIMBA', e.x + e.w / 2, GROUND - 212, 3, on ? '#ffe9b0' : '#a8803a');
  txt(ctx, 'CASINO', e.x + e.w / 2, GROUND - 184, 1, on ? '#ff8aa0' : '#8a3a4a');
  for (const px of [30, 700, 1340]) palm(ctx, px, GROUND, 120 + (px % 30), t, px);
}

// ─── Escenas desde arriba ───────────────────────────────────────────────────
let carpetPattern; let wallPattern; let metalPattern;
function patterns(ctx) {
  if (carpetPattern) return;
  // Cada pixel del juego son Q × Q pixeles de la imagen, así en el canvas chico queda de a uno.
  const mk = (n, draw) => {
    const c = document.createElement('canvas'); c.width = n * Q; c.height = n * Q;
    const g = c.getContext('2d');
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const col = draw(x, y); if (col) { g.fillStyle = col; g.fillRect(x * Q, y * Q, Q, Q); } }
    return ctx.createPattern(c, 'repeat');
  };
  carpetPattern = mk(24, (x, y) => {
    const dc = Math.abs(x - 12) + Math.abs(y - 12);
    const dk = Math.min(x + y, 24 - x + y, x + 24 - y, 48 - x - y);
    if (dc === 0 || dk === 0) return '#c8a050';
    if (dc === 7) return '#6a3470';
    if (dk === 5) return '#8a4a2a';
    if (dc === 3 || dk === 2) return '#1f2a58';
    return '#141a3a';
  });
  wallPattern = mk(24, (x, y) => ((y % 12 < 1 || (y < 12 ? x % 24 === 0 : x % 24 === 12)) ? '#2a2014' : (x + y) % 7 === 0 ? '#7a6638' : '#6a5630'));
  metalPattern = mk(20, (x, y) => ((x < 10) === (y < 10) ? '#a4acba' : '#8a92a2'));
}

// Cartas de 9 × 12 pixeles.
const SUITS = {
  '♥': ['01010', '11111', '11111', '01110', '00100'],
  '♦': ['00100', '01110', '11111', '01110', '00100'],
  '♠': ['00100', '01110', '11111', '11111', '00100'],
  '♣': ['01110', '01110', '11111', '11111', '00100'],
};
function suitChar(c) { return ['♠', '♥', '♦', '♣'][Math.floor(c / 13) % 4]; }
function drawCard(ctx, x, y, c, hidden, sx = 1) {
  const ox = q(x); const oy = q(y);
  if (sx < 1) { // dándose vuelta: se achica de costado
    const w = Math.max(1, Math.round(9 * sx));
    P(ctx, ox, oy, Math.round((9 - w) / 2), 0, w, 12, INK); P(ctx, ox, oy, Math.round((9 - w) / 2), 1, w, 10, '#e8e4f0');
    return;
  }
  P(ctx, ox, oy, 0, 0, 9, 12, INK);
  if (hidden) {
    P(ctx, ox, oy, 1, 1, 7, 10, '#a8242e');
    for (let j = 0; j < 5; j++) P(ctx, ox, oy, 2 + (j % 2), 2 + j * 2, 1, 1, '#f4e6b0');
    P(ctx, ox, oy, 4, 2, 1, 8, '#f4e6b0'); P(ctx, ox, oy, 2, 5, 5, 2, '#d8404a');
    return;
  }
  P(ctx, ox, oy, 1, 1, 7, 10, '#fff');
  const col = isRed(c) ? '#d8303a' : INK;
  const rk = rankOf(c);
  txt(ctx, rk, ox + (rk.length === 2 ? 1 : 3) * Q, oy + 3.5 * Q, 1, col, null, 'left');
  SUITS[suitChar(c)].forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '1') P(ctx, ox, oy, 2 + i, 6 + j, 1, 1, col); });
}

// Cuándo se vio cada carta por primera vez (para repartirlas una por una) y cuándo se dio vuelta la del croupier.
const cardSeen = new Map();
let revealAt = new Map();
function seenAt(id, t, delay) {
  if (!cardSeen.has(id)) cardSeen.set(id, t + delay);
  return cardSeen.get(id);
}
const ease = (u) => 1 - (1 - u) * (1 - u);

function drawTable(ctx, sc, st) {
  const t = sc.table;
  const time = st.time;
  const bj = st.bj;
  // sombra, madera y paño
  ctx.globalAlpha = 0.35; ell(ctx, t.x + 4, t.y + 10, t.rx + 20, t.ry + 18, '#000'); ctx.globalAlpha = 1;
  ell(ctx, t.x, t.y, t.rx + 14, t.ry + 12, INK);
  ell(ctx, t.x, t.y, t.rx + 12, t.ry + 10, '#5a3420');
  ell(ctx, t.x, t.y, t.rx + 6, t.ry + 4, '#7a4a2c');
  ell(ctx, t.x, t.y, t.rx, t.ry, '#176a44');
  ell(ctx, t.x, t.y, t.rx - 10, t.ry - 8, '#1f7a4e');
  // línea de apuesta (media luna)
  for (let a = 0.15; a < Math.PI - 0.1; a += 0.06) R(ctx, t.x + Math.cos(a) * (t.rx - 22), t.y + Math.sin(a) * (t.ry - 16), Q, Q, 'rgba(244,230,176,0.7)');
  txt(ctx, 'BLACKJACK', t.x, t.y - 14, 2, '#f4e6b0', '#0c3a26');
  txt(ctx, 'PAGA 3 A 2', t.x, t.y + 2, 1, '#d8e8c8');
  // la caja de cartas (el «zapato»)
  const shoe = { x: t.x + t.rx - 30, y: t.y - t.ry + 14 };
  box(ctx, shoe.x, shoe.y, 22, 14, '#2a2a3c'); R(ctx, shoe.x + 2, shoe.y + 2, 18, 4, '#a8242e'); R(ctx, shoe.x + 2, shoe.y + 8, 18, 2, '#3a3a52');

  const seat = bj.seats[0];
  const px = t.x;
  const py = t.y + t.ry - 28;
  // cartas con la animación de repartir
  const place = (id, delay, tx, ty, c, hidden, flipId) => {
    const seen = seenAt(id, time, delay);
    const u = Math.max(0, Math.min(1, (time - seen) / 0.3));
    if (time < seen) return;
    const k = ease(u);
    const x = shoe.x + (tx - shoe.x) * k; const y = shoe.y + (ty - shoe.y) * k - Math.sin(u * Math.PI) * 14;
    let sx = 1; let hid = hidden;
    if (flipId) {
      if (!revealAt.has(flipId) && !hidden) revealAt.set(flipId, time);
      const ra = revealAt.get(flipId);
      if (ra !== undefined && !hidden) { const fu = Math.min(1, (time - ra) / 0.36); if (fu < 1) { hid = fu < 0.5; sx = Math.abs(Math.cos(fu * Math.PI)); } }
    }
    drawCard(ctx, x, y, c, hid, sx);
  };
  const n = bj.n;
  bj.dealer.forEach((c, k) => {
    const id = `${n}:d:${k}`;
    const delay = k === 0 ? 0.3 : k === 1 ? 0.9 : 0.45 + (k - 2) * 0.5;
    place(id, delay, t.x - 5 * Q - (bj.dealer.length - 1) * 5.5 * Q + k * 11 * Q + 0, t.y - 64, c, k === 1 && bj.phase === 'play', k === 1 ? `${n}:flip` : null);
  });
  if (seat) {
    ell(ctx, px, py + 16, 14, 9, 'rgba(255,230,150,0.0)');
    seat.hand.forEach((c, k) => place(`${n}:p:${k}`, k === 0 ? 0 : k === 1 ? 0.6 : 0, px - 5 * Q - (seat.hand.length - 1) * 4 * Q + k * 8 * Q, py - 26, c, false, null));
  }
  // el lugar de apuesta y las fichas
  const spotY = py + 18;
  for (let a = 0; a < 16; a++) R(ctx, px + Math.cos((a / 16) * Math.PI * 2) * 13, spotY + Math.sin((a / 16) * Math.PI * 2) * 7, Q, Q, seat ? 'rgba(255,230,150,0.9)' : 'rgba(255,240,200,0.3)');
  if (seat?.bet) {
    const chips = Math.min(5, Math.max(1, Math.ceil(seat.bet / 72)));
    for (let i = 0; i < chips; i++) {
      const drop = Math.max(0, 1 - Math.min(1, (time - seenAt(`${n}:chips`, time, 0)) * 5 - i * 0.2));
      const cy = spotY - i * 3 - drop * 30;
      ell(ctx, px, cy + 2, 10, 6, INK); ell(ctx, px, cy, 10, 6, '#d8403a'); ell(ctx, px, cy, 6, 3, '#f4e6b0'); ell(ctx, px, cy, 4, 2, '#d8403a');
    }
  }
  // limpiar lo viejo
  if (cardSeen.size > 60) { for (const k of [...cardSeen.keys()].slice(0, 30)) cardSeen.delete(k); }
  if (revealAt.size > 20) revealAt = new Map();
}

function slotMachine(ctx, x, y, w, h, t, i) {
  box(ctx, x + 2, y, w - 4, h, '#2a2a46');
  R(ctx, x + 4, y + 2, w - 8, 6, [GOLD, '#e0525a', '#4a9be8', '#5ec46b'][(Math.floor(t * 3) + i) % 4]);
  box(ctx, x + 8, y + 12, w - 16, 18, '#f4f0e6');
  for (let r = 0; r < 3; r++) {
    const sym = Math.floor(t * (6 + r * 1.7) + i * 3 + r) % 4;
    const cx = x + 12 + r * ((w - 24) / 3);
    R(ctx, cx, y + 16, 8, 10, '#fff');
    R(ctx, cx + 2, y + 18, 4, 6, ['#d8303a', '#f0c33c', '#2f8a3f', '#4a6be8'][sym]);
  }
  R(ctx, x + 6, y + h - 8, w - 12, 4, GOLD);
  R(ctx, x + w - 6, y + 14, 2, 14, '#b0b4c4'); disc(ctx, x + w - 5, y + 12, 3, '#d8303a');
}

function drawFloor(ctx, view, key, st) {
  const sc = SCENES[key];
  const t = st.time;
  R(ctx, -40, -40, sc.w + 80, sc.h + 80, '#1c1410');
  ctx.fillStyle = wallPattern; ctx.fillRect(0, 0, sc.w, sc.h);
  for (const a of sc.areas) {
    R(ctx, a.x - 6, a.y - 6, a.w + 12, a.h + 12, INK);
    R(ctx, a.x - 4, a.y - 4, a.w + 8, a.h + 8, GOLD);
    ctx.fillStyle = carpetPattern; ctx.fillRect(q(a.x), q(a.y), q(a.w), q(a.h));
  }
  // luces de colores que se mueven por el piso (puntitos con transparencia)
  for (const [lx, ly, c] of [[400, 300, '140,100,255'], [1200, 300, '255,140,70'], [400, 760, '255,140,70'], [1200, 760, '140,100,255'], [800, 500, '90,210,255']]) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + lx);
    for (let k = 4; k >= 1; k--) { ctx.globalAlpha = 0.045 + pulse * 0.02; disc(ctx, lx, ly, k * 50, `rgb(${c})`); }
    ctx.globalAlpha = 1;
  }
  // tragamonedas contra la pared de arriba (de adorno por ahora)
  const strip = sc.blocks[1];
  for (let x = strip.x, i = 0; x + 70 <= strip.x + strip.w; x += 72, i++) slotMachine(ctx, x, strip.y, 70, strip.h, t, i);
  // columnas
  for (const b of [sc.blocks[2], sc.blocks[3], sc.blocks[4], sc.blocks[5]]) {
    ctx.globalAlpha = 0.3; disc(ctx, b.x + 24, b.y + 28, 24, '#000'); ctx.globalAlpha = 1;
    disc(ctx, b.x + 22, b.y + 22, 23, INK); disc(ctx, b.x + 22, b.y + 22, 21, '#f0dcb4'); disc(ctx, b.x + 22, b.y + 22, 13, '#e0c690'); disc(ctx, b.x + 22, b.y + 22, 7, '#f6e8c4');
    R(ctx, b.x + 8, b.y + 10, 6, 4, '#fff');
  }
  // plantas que se mecen
  for (const b of sc.blocks.slice(6)) {
    const c = { x: b.x + 20, y: b.y + 20 };
    disc(ctx, c.x, c.y, 19, INK); disc(ctx, c.x, c.y, 17, '#8a4a2a'); disc(ctx, c.x, c.y, 11, '#5a3a22');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.sin(t * 1.2 + k) * 0.08;
      line(ctx, c.x, c.y, c.x + Math.cos(a) * 17, c.y + Math.sin(a) * 17, 6, k % 2 ? '#2f8a3f' : '#3da34c');
    }
    disc(ctx, c.x, c.y, 4, '#6ac05a');
  }
  // el ascensor, en la pared de la izquierda
  const d = sc.door;
  box(ctx, 20, d.y, 44, d.w, '#c8a05a');
  R(ctx, 24, d.y + 6, 18, d.w - 12, '#aab2c2'); R(ctx, 42, d.y + 6, 18, d.w - 12, '#8e96a6'); R(ctx, 40, d.y + 6, 2, d.w - 12, INK);
  box(ctx, 14, d.y - 22, 56, 14, INK);
  txt(ctx, 'ASCENSOR', 42, d.y - 15, 1, '#f4e6b0');
  R(ctx, 40, d.y - 8, 4, 4, (Math.floor(t * 2) % 2) ? '#5aff7a' : '#2a7a3a');
  drawTable(ctx, sc, st);
  // el croupier
  drawBlobTop(ctx, sc.dealer.x, sc.dealer.y, '#7a1f2a', Math.PI / 2, 0, 'Croupier', { hat: INK });
}

function drawElevatorScene(ctx, view, st) {
  const sc = SCENES.elevator;
  const t = st.time;
  R(ctx, -80, -80, sc.w + 160, sc.h + 200, '#14101c');
  box(ctx, 10, 10, 280, 238, '#d8c079');
  ctx.fillStyle = metalPattern; ctx.fillRect(30, 30, 240, 192);
  R(ctx, 30, 30, 240, 192, 'rgba(255,240,200,0.0)');
  // reflejo que cruza el piso
  const sx = 30 + ((t * 40) % 360) - 60;
  ctx.globalAlpha = 0.16; for (let i = 0; i < 4; i++) R(ctx, sx + i * 8, 30, 6, 192, '#fff'); ctx.globalAlpha = 1;
  // espejo de atrás
  R(ctx, 34, 14, 232, 16, '#7ab4d4'); R(ctx, 40, 16, 40, 4, '#c8e8f8'); R(ctx, 120, 22, 60, 4, '#a8d4ec');
  R(ctx, 28, 28, 244, 4, GOLD); R(ctx, 28, 220, 244, 4, GOLD); R(ctx, 28, 28, 4, 196, GOLD); R(ctx, 268, 28, 4, 196, GOLD);
  // indicador del piso
  box(ctx, 126, 4, 48, 18, INK);
  txt(ctx, st.floorLabel, 150, 13, 2, '#5aff7a');
  // la puerta que se abre y se cierra
  const open = st.doorOpen;
  const gap = Math.round(44 * open);
  R(ctx, 128, 222, 44, 28, '#4a3a22');
  R(ctx, 128, 218, 22 - gap / 2, 10, '#c8a05a'); R(ctx, 150 + gap / 2, 218, 22 - gap / 2, 10, '#c8a05a');
  tri(ctx, 150, 236, 6, 8, open > 0.5 ? '#5aff7a' : '#e0525a');
  // el panel de botones
  const pn = sc.panel;
  box(ctx, pn.x - 12, pn.y - 14, 24, 34, '#2c2838');
  for (let i = 0; i < 6; i++) R(ctx, pn.x - 6 + (i % 2) * 8, pn.y - 8 + Math.floor(i / 2) * 9, 5, 5, i === 0 ? ((Math.floor(t * 2) % 2) ? '#ff9a3a' : '#a85a1a') : i < 3 ? GOLD : '#c8c8d0');
  // el botones, con su carrito
  box(ctx, 40, 78, 38, 14, '#b88a3a'); R(ctx, 40, 86, 38, 2, '#7a5a1a');
  R(ctx, 44, 70, 14, 8, '#4a9be8'); R(ctx, 60, 72, 12, 6, '#e0525a');
  disc(ctx, 46, 96, 3, INK); disc(ctx, 72, 96, 3, INK);
  drawBlobTop(ctx, sc.npc.x, sc.npc.y, '#a8242e', Math.PI / 2, 0, 'Botones', { hat: '#a8242e' });
}

function drawTop(ctx, view, key, st) {
  patterns(ctx);
  const { w, h, cx, cy } = view;
  const shake = Math.round(st.shake || 0);
  ctx.setTransform(1 / Q, 0, 0, 1 / Q, Math.round(w / 2 - cx / Q) + shake, Math.round(h / 2 - cy / Q) + (shake ? 1 : 0));
  if (key === 'elevator') drawElevatorScene(ctx, view, st); else drawFloor(ctx, view, key, st);
  for (const p of [...st.players].sort((a, b) => a.y - b.y)) {
    drawBlobTop(ctx, p.x, p.y, p.color, p.face ?? Math.PI / 2, p.phase || 0, p.name, { moving: p.moving, hat: p.hat });
    if (p.me && st.near) keycap(ctx, p.x, p.y - 26 * Q, st.time);
  }
}

// Dibuja la escena `key`. `view` trae el tamaño del canvas (en pixeles del juego) y la cámara; `st` lo que cambia
// (ver TimbaGame.jsx).
export function drawScene(ctx, view, key, st) {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, view.w, view.h);
  if (SCENES[key].kind === 'side') drawSide(ctx, view, key, st); else drawTop(ctx, view, key, st);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export { seatPos };
