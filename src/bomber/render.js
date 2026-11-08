// Bombardero: el dibujo. Pixel art en un canvas chico (16 px por casilla) que el CSS agranda sin
// suavizar. Los sprites se arman con código, sin imágenes. Las coordenadas de las funciones son del
// mundo (casillas, con coma) y acá se pasan a píxeles. Colores fijos, iguales en los dos temas.
import { FLOOR, HARD, PRESSED, SOFT, TILE, hash2, idx } from './map.js';
import { DIRS, FIRE_TIME, FUSE } from './sim.js';

const px = (g, x, y, color, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ─── Texto ──────────────────────────────────────────────────────────────────
const FONT = 'Inter, system-ui, sans-serif';
export function drawText(g, str, x, y, color = '#fff', { align = 'left', shadow = '#14101c', scale = 1 } = {}) {
  const s = String(str);
  g.save();
  g.font = `800 ${8 * scale}px ${FONT}`;
  g.textBaseline = 'top';
  g.textAlign = align;
  g.lineJoin = 'round';
  if (shadow) { g.lineWidth = 2 * scale; g.strokeStyle = shadow; g.strokeText(s, Math.round(x), Math.round(y) - scale); }
  g.fillStyle = color;
  g.fillText(s, Math.round(x), Math.round(y) - scale);
  g.restore();
}

// ─── El tablero ─────────────────────────────────────────────────────────────
// Se pinta una vez en un canvas aparte y se vuelve a pintar solo cuando cambia (un ladrillo roto, un bloque caído).
const GRASS = ['#3f9a3a', '#459f3f'];
export function paintBoard(board) {
  const { W, H, cells } = board;
  const [c, g] = newCanvas(W * TILE, H * TILE);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(W, x, y);
      const sx = x * TILE, sy = y * TILE;
      // Piso: pasto a cuadros con alguna brizna.
      px(g, sx, sy, GRASS[(x + y) % 2], TILE, TILE);
      const r = hash2(x, y, 3);
      if (r < 0.35) { px(g, sx + Math.floor(r * 40) % 12 + 2, sy + Math.floor(r * 300) % 12 + 2, '#2f7f2c', 1, 2); }
      if (r > 0.9) { px(g, sx + Math.floor(r * 90) % 13 + 1, sy + Math.floor(r * 700) % 13 + 1, '#5cb954', 2, 1); }
      const v = cells[i];
      if (v === HARD) drawHard(g, sx, sy, x === 0 || y === 0 || x === W - 1 || y === H - 1);
      else if (v === SOFT) drawSoft(g, sx, sy, hash2(x, y, 9));
      else if (v === PRESSED) drawPressed(g, sx, sy);
      else {
        // Sombra que tiran la pared de arriba y la de la izquierda.
        if (y > 0 && cells[idx(W, x, y - 1)] !== FLOOR) px(g, sx, sy, 'rgba(0,0,0,0.22)', TILE, 3);
        if (x > 0 && cells[idx(W, x - 1, y)] !== FLOOR) px(g, sx, sy, 'rgba(0,0,0,0.16)', 3, TILE);
      }
    }
  }
  return c;
}
// Piedra: bloque gris con bisel, como los pilares del original.
function drawHard(g, sx, sy, border) {
  const base = border ? '#8f949c' : '#a3a8b0';
  px(g, sx, sy, base, TILE, TILE);
  px(g, sx, sy, border ? '#b8bcc3' : '#cdd1d7', TILE, 2);
  px(g, sx, sy, border ? '#b8bcc3' : '#cdd1d7', 2, TILE);
  px(g, sx, sy + TILE - 3, border ? '#5f646c' : '#6c717a', TILE, 3);
  px(g, sx + TILE - 3, sy, border ? '#5f646c' : '#6c717a', 3, TILE);
  px(g, sx + 4, sy + 4, border ? '#9a9fa7' : '#b0b5bd', 8, 8);
  if (border) { px(g, sx + 6, sy + 6, '#7c8189', 2, 2); px(g, sx + 9, sy + 8, '#7c8189', 1, 1); }
}
// Ladrillo: se rompe. Color teja con las juntas claras.
function drawSoft(g, sx, sy, r) {
  px(g, sx, sy, '#b6633a', TILE, TILE);
  px(g, sx, sy, '#d9b48c', TILE, 1);
  px(g, sx, sy + 5, '#d9b48c', TILE, 1);
  px(g, sx, sy + 10, '#d9b48c', TILE, 1);
  px(g, sx, sy + 15, '#7a3d20', TILE, 1);
  px(g, sx + 7, sy + 1, '#d9b48c', 1, 4);
  px(g, sx + 3, sy + 6, '#d9b48c', 1, 4);
  px(g, sx + 11, sy + 6, '#d9b48c', 1, 4);
  px(g, sx + 7, sy + 11, '#d9b48c', 1, 4);
  px(g, sx + 15, sy, '#7a3d20', 1, TILE);
  // Alguna mancha, para que no sean todos iguales.
  if (r < 0.4) px(g, sx + 1 + Math.floor(r * 30), sy + 2, '#c97a4e', 3, 2);
  else if (r > 0.7) px(g, sx + 8, sy + 12, '#9a4f2a', 4, 2);
}
// Bloque que cayó al final: piedra oscura.
function drawPressed(g, sx, sy) {
  px(g, sx, sy, '#5d6270', TILE, TILE);
  px(g, sx, sy, '#80869a', TILE, 2);
  px(g, sx, sy, '#80869a', 2, TILE);
  px(g, sx, sy + TILE - 3, '#3a3e4a', TILE, 3);
  px(g, sx + TILE - 3, sy, '#3a3e4a', 3, TILE);
  px(g, sx + 5, sy + 5, '#6a7080', 6, 6);
}

// Aviso de dónde cae el próximo bloque: parpadea.
export function drawPressWarning(g, W, cell, time) {
  if (Math.floor(time * 8) % 2) return;
  const sx = (cell % W) * TILE, sy = Math.floor(cell / W) * TILE;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(sx, sy, TILE, 2); g.fillRect(sx, sy + TILE - 2, TILE, 2); g.fillRect(sx, sy, 2, TILE); g.fillRect(sx + TILE - 2, sy, 2, TILE);
}
// Un bloque cayendo desde arriba (solo dibujo, el último medio segundo antes de caer).
export function drawFalling(g, W, cell, k) {
  const sx = (cell % W) * TILE, sy = Math.floor(cell / W) * TILE;
  const lift = Math.round((1 - k) * 40);
  g.save();
  g.globalAlpha = 0.5 + k * 0.5;
  drawPressed(g, sx, sy - lift);
  g.restore();
}

// ─── Ítems ──────────────────────────────────────────────────────────────────
const ITEM_FRAME = { fire: '#e8432c', bomb: '#2c6fe8', speed: '#3fb850', kick: '#f28c28', pierce: '#8b3fe8', remote: '#2cb5c9', vest: '#e8b22c', fullfire: '#e8432c', skull: '#3b3b3b' };
export function drawItem(g, kind, cx, cy, time) {
  const sx = Math.round(cx * TILE) - 7, sy = Math.round(cy * TILE) - 7;
  const bob = Math.floor(time * 3) % 2;
  px(g, sx, sy + 1, '#14101c', 14, 14);
  px(g, sx + 1, sy, ITEM_FRAME[kind] || '#888', 12, 1);
  px(g, sx + 1, sy + 1, '#fff6e8', 12, 12);
  px(g, sx + 1, sy + 1, ITEM_FRAME[kind] || '#888', 12, 1); px(g, sx + 1, sy + 12, ITEM_FRAME[kind] || '#888', 12, 1);
  px(g, sx + 1, sy + 1, ITEM_FRAME[kind] || '#888', 1, 12); px(g, sx + 12, sy + 1, ITEM_FRAME[kind] || '#888', 1, 12);
  const x = sx + 7, y = sy + 7 - bob;
  switch (kind) {
    case 'fire': case 'fullfire': {
      disc(g, x, y + 1, 3, '#ff6a1a'); px(g, x - 1, y - 4, '#ff6a1a', 2, 3); px(g, x - 1, y - 1, '#ffd23f', 2, 4); px(g, x, y + 1, '#fff7a0', 1, 2);
      if (kind === 'fullfire') { px(g, x - 4, y - 1, '#ff6a1a', 1, 4); px(g, x + 3, y - 1, '#ff6a1a', 1, 4); }
      break;
    }
    case 'bomb': disc(g, x, y + 1, 3, '#2b2b36'); px(g, x - 1, y, '#5a5a6e', 1, 1); px(g, x + 1, y - 3, '#8a6a3a', 1, 2); px(g, x + 2, y - 4, '#ffd23f', 1, 1); break;
    case 'speed': px(g, x - 4, y - 2, '#3fb850', 7, 4); px(g, x - 5, y + 1, '#2a2a36', 9, 2); px(g, x - 4, y + 3, '#2a2a36', 2, 1); px(g, x + 1, y + 3, '#2a2a36', 2, 1); px(g, x - 2, y - 3, '#ffffff', 3, 1); break;
    case 'kick': px(g, x - 3, y - 4, '#f28c28', 3, 6); px(g, x - 3, y + 1, '#f28c28', 7, 3); px(g, x + 2, y + 1, '#2a2a36', 3, 3); px(g, x - 3, y + 4, '#2a2a36', 7, 1); break;
    case 'pierce': disc(g, x, y + 1, 3, '#2b2b36'); px(g, x + 3, y, '#8b3fe8', 3, 1); px(g, x + 4, y - 1, '#8b3fe8', 1, 3); px(g, x - 5, y, '#8b3fe8', 2, 1); px(g, x, y + 4, '#8b3fe8', 1, 1); break;
    case 'remote': px(g, x - 4, y - 2, '#2a2a36', 8, 6); px(g, x - 3, y - 1, '#2cb5c9', 2, 2); px(g, x + 1, y - 1, '#e8432c', 2, 2); px(g, x - 2, y + 2, '#c9cdd6', 4, 1); px(g, x + 1, y - 5, '#2a2a36', 1, 3); break;
    case 'vest': px(g, x - 4, y - 3, '#e8b22c', 3, 7); px(g, x + 1, y - 3, '#e8b22c', 3, 7); px(g, x - 4, y, '#e8b22c', 8, 4); px(g, x - 1, y - 3, '#fff6e8', 2, 2); px(g, x - 1, y + 1, '#b57f16', 2, 1); break;
    case 'skull': disc(g, x, y - 1, 3, '#f3f3f3'); px(g, x - 2, y + 2, '#f3f3f3', 5, 2); px(g, x - 2, y - 1, '#14101c', 1, 1); px(g, x + 1, y - 1, '#14101c', 1, 1); px(g, x - 1, y + 3, '#14101c', 1, 1); px(g, x + 1, y + 3, '#14101c', 1, 1); break;
    default: break;
  }
}
// El mismo ítem chiquito, para el HUD (un canvas de 14 × 14).
const icons = new Map();
export function itemIcon(kind) {
  if (!icons.has(kind)) {
    const [c, g] = newCanvas(14, 15);
    drawItem(g, kind, 7 / TILE, 8 / TILE, 0);
    icons.set(kind, c);
  }
  return icons.get(kind);
}

// ─── Bombas y fuego ─────────────────────────────────────────────────────────
export function drawBomb(g, cx, cy, age, fuse, remote, time) {
  const left = remote ? 1 : Math.max(0, fuse - age);
  // Late cada vez más rápido cuando le queda poco.
  const beat = remote ? Math.sin(time * 4) * 0.5 + 0.5 : (Math.sin(age * (6 + (1 - left / FUSE) * 14)) * 0.5 + 0.5);
  const r = 5 + Math.round(beat);
  const x = Math.round(cx * TILE), y = Math.round(cy * TILE) + 1;
  px(g, x - 5, y + 5, 'rgba(0,0,0,0.3)', 11, 2);
  disc(g, x, y, r + 1, '#14101c');
  disc(g, x, y, r, remote ? '#3a3a52' : '#2b2b36');
  px(g, x - 2, y - 2, '#6a6a80', 2, 1); px(g, x - 3, y - 1, '#6a6a80', 1, 2);
  // Mecha con chispa (el control remoto tiene una antena).
  px(g, x + 1, y - r - 2, '#a07a3a', 1, 3);
  if (remote) { px(g, x + 1, y - r - 4, '#c9cdd6', 1, 2); px(g, x, y - r - 5, '#e8432c', 3, 1); }
  else { const spark = Math.floor(time * 20) % 2; px(g, x + 1 - spark, y - r - 3, spark ? '#ffd23f' : '#ff6a1a', 2, 2); px(g, x + 1, y - r - 3, '#fff7a0', 1, 1); }
}

// La explosión: una cruz. El centro es una bola y cada brazo una barra con punta, con el núcleo
// amarillo claro, el medio naranja y el borde rojo. Crece y se apaga con la edad.
export function drawFire(g, W, c, arms, age) {
  const k = age / FIRE_TIME;
  const grow = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
  const thick = Math.max(2, Math.round(13 * grow));
  const x0 = (c % W) * TILE + 8, y0 = Math.floor(c / W) * TILE + 8;
  const layers = [['#ff3b1a', 0], ['#ff8c1a', -4], ['#ffe14a', -8], ['#fff9c4', -11]];
  for (const [color, d] of layers) {
    const t = thick + d;
    if (t <= 0) continue;
    const h = Math.floor(t / 2);
    // Centro.
    disc(g, x0, y0, h + 1, color);
    DIRS.forEach(([dx, dy], dir) => {
      const len = arms[dir];
      if (!len) return;
      const flick = (Math.floor(age * 30 + dir) % 2) * (d < -2 ? 1 : 0);
      if (dx) {
        const x1 = x0 + dx * (len * TILE - 3), xa = Math.min(x0, x1), xb = Math.max(x0, x1);
        px(g, xa, y0 - h, color, xb - xa, t);
        disc(g, x1, y0, h + flick, color);
      } else {
        const y1 = y0 + dy * (len * TILE - 3), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
        px(g, x0 - h, ya, color, t, yb - ya);
        disc(g, x0, y1, h + flick, color);
      }
    });
  }
}

// Un ladrillo rompiéndose: se desarma en pedacitos (solo dibujo).
export function drawBreaking(g, W, cell, k) {
  const sx = (cell % W) * TILE, sy = Math.floor(cell / W) * TILE;
  g.save();
  g.globalAlpha = 1 - k;
  for (let i = 0; i < 6; i++) {
    const r = hash2(cell, i, 5);
    const ox = Math.round((r - 0.5) * 2 * k * 10), oy = Math.round(-k * 10 + k * k * 24 + (r * 6 - 3));
    px(g, sx + 2 + (i % 3) * 5 + ox, sy + 3 + Math.floor(i / 3) * 6 + oy, i % 2 ? '#b6633a' : '#d9b48c', 3, 3);
  }
  g.restore();
}

// ─── El personaje ───────────────────────────────────────────────────────────
// El bombardero clásico: casco blanco redondo con visera, antena con bolita, cuerpo del color de cada
// uno, guantes y botas. Mira hacia `dir` (0 arriba, 1 derecha, 2 abajo, 3 izquierda).
export function drawBomber(g, cx, cy, color, dir, walked, o = {}) {
  const x = Math.round(cx * TILE), y = Math.round(cy * TILE) + 3; // (x, y) son los pies
  const step = o.moving ? Math.round(Math.sin(walked * 6) * 1.5) : 0;
  const helmet = o.hurt ? '#ffffff' : '#f4f4f8';
  const body = o.hurt ? '#ffffff' : color;
  const dark = shade(color, -0.4);
  const visor = o.sick ? '#7a2bb3' : '#2b3f8f';
  if (o.vest) { g.save(); g.globalAlpha = 0.5 + Math.sin(walked * 20 + (o.time || 0) * 14) * 0.3; disc(g, x, y - 7, 10, '#ffe66b'); g.restore(); }
  px(g, x - 5, y - 1, 'rgba(0,0,0,0.3)', 11, 2);
  // Botas.
  px(g, x - 4, y - 3 + Math.max(0, step), '#14101c', 3, 3); px(g, x + 1, y - 3 + Math.max(0, -step), '#14101c', 3, 3);
  px(g, x - 4, y - 3 + Math.max(0, step), dark, 3, 1); px(g, x + 1, y - 3 + Math.max(0, -step), dark, 3, 1);
  // Cuerpo.
  px(g, x - 4, y - 9, '#14101c', 8, 7);
  px(g, x - 3, y - 8, body, 6, 5);
  px(g, x - 2, y - 7, shade(color, 0.25), 2, 2);
  px(g, x - 3, y - 4, dark, 6, 1);
  // Cinturón y hebilla.
  px(g, x - 3, y - 5, '#14101c', 6, 1); px(g, x - 1, y - 5, '#ffd23f', 2, 1);
  // Guantes (adelante de él según adónde mira).
  const gl = dir === 1 ? [x + 4, x - 6] : dir === 3 ? [x - 6, x + 4] : [x - 6, x + 4];
  px(g, gl[0], y - 7 + Math.max(0, -step), '#14101c', 3, 3); px(g, gl[1], y - 7 + Math.max(0, step), '#14101c', 3, 3);
  px(g, gl[0] + 1, y - 6 + Math.max(0, -step), '#ffffff', 1, 1); px(g, gl[1] + 1, y - 6 + Math.max(0, step), '#ffffff', 1, 1);
  // Casco.
  disc(g, x, y - 13, 6, '#14101c');
  disc(g, x, y - 13, 5, helmet);
  px(g, x - 2, y - 17, '#ffffff', 4, 1);
  // Visera: una franja oscura con dos ojos (o hacia un costado, si mira de lado; o nada, si mira arriba).
  if (dir !== 0) {
    const vx = dir === 1 ? x - 1 : dir === 3 ? x - 5 : x - 4;
    const vw = dir === 2 ? 9 : 7;
    px(g, vx, y - 13, visor, vw, 3);
    if (dir === 2) { px(g, x - 3, y - 12, '#ffffff', 2, 1); px(g, x + 2, y - 12, '#ffffff', 2, 1); }
    else px(g, dir === 1 ? x + 3 : x - 4, y - 12, '#ffffff', 2, 1);
  } else px(g, x - 2, y - 11, shade('#f4f4f8', -0.15), 5, 1);
  // Antena con bolita del color.
  px(g, x, y - 20, '#14101c', 1, 2); px(g, x - 1, y - 22, '#14101c', 3, 3); px(g, x, y - 21, body, 1, 1);
  // Enfermo: le salen burbujitas verdes.
  if (o.sick) { const t = o.time || 0; for (let i = 0; i < 3; i++) { const f = (t * 1.3 + i * 0.37) % 1; px(g, x - 7 + i * 6 + Math.round(Math.sin(t * 5 + i) * 1.5), y - 10 - Math.round(f * 14), '#8ef08a', 2, 2); } }
  if (o.name) drawText(g, o.name, x, y - 32, '#ffffff', { align: 'center' });
}

// Muerte: el bombardero gira, se achica y sube como un angelito. `k` va de 0 a 1.
export function drawDying(g, cx, cy, color, k) {
  const x = Math.round(cx * TILE), y = Math.round(cy * TILE) - Math.round(k * 10);
  if (k < 0.5) {
    const r = Math.round(6 - k * 6);
    disc(g, x, y - 8, r + 1, '#14101c'); disc(g, x, y - 8, r, k * 10 % 1 > 0.5 ? '#ffffff' : color);
    return;
  }
  // Angelito: aro y alitas.
  g.save(); g.globalAlpha = Math.max(0, 1 - (k - 0.5) * 2);
  disc(g, x, y - 10, 4, '#ffffff');
  px(g, x - 3, y - 17, '#ffd23f', 6, 1);
  px(g, x - 8, y - 11, '#ffffff', 3, 2); px(g, x + 6, y - 11, '#ffffff', 3, 2);
  g.restore();
}

// ─── Partículas ─────────────────────────────────────────────────────────────
export function burst(list, x, y, { n = 8, speed = 1.5, life = 0.5, colors = ['#fff'], gravity = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), age: 0, color: colors[Math.floor(Math.random() * colors.length)], gravity });
  }
}
export function drawParticles(g, list, dt) {
  for (const q of list) {
    q.age += dt;
    q.vy += q.gravity * dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    g.globalAlpha = Math.max(0, 1 - q.age / q.life);
    px(g, Math.round(q.x * TILE), Math.round(q.y * TILE), q.color, 2, 2);
  }
  g.globalAlpha = 1;
}
