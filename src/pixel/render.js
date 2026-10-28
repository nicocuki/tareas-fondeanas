// Pixel Royale: el dibujo. Todo se pinta en un canvas de baja resolución (384 px de ancho) y la
// página lo agranda sin suavizar (`image-rendering: pixelated`): cada píxel que dibujamos acá es
// un cuadradito de verdad en pantalla. Los sprites se arman con código a mano, sin imágenes.
// Las coordenadas de las funciones son del mundo; `cam` es la esquina de arriba a la izquierda.
import { T, TILE, TILE_HP, hash2, mulberry32, tileAt } from './map.js';
import { RARITY_COLORS, WEAPONS } from './sim.js';

export const VIEW_W = 384;

// ─── Utilidades de píxel ────────────────────────────────────────────────────
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
const px = (g, x, y, color, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

// Un sprite a partir de filas de texto: '.' es transparente y cada letra, un color de la paleta.
function art(rows, pal) {
  const [c, g] = newCanvas(rows[0].length, rows.length);
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) px(g, x, y, pal[row[x]]); });
  return c;
}

// Círculo lleno de píxeles.
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}
// Línea de píxeles (Bresenham).
function pline(g, x0, y0, x1, y1, color, thick = 1) {
  g.fillStyle = color;
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function ring(g, cx, cy, r, color, size = 1) {
  g.fillStyle = color;
  const steps = Math.max(12, Math.ceil(r * 6.3));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), size, size);
  }
}
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ─── Letras de píxel (3 × 5) ────────────────────────────────────────────────
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '.': '000000000000010', ':': '000010000010000', '-': '000000111000000', '+': '000010111010000',
  '!': '010010010000010', '/': '001001010100100', '%': '101001010100101', ' ': '000000000000000',
};
const clean = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const textWidth = (s) => Math.max(0, String(s).length * 4 - 1);
export function drawText(g, str, x, y, color = '#fff', { align = 'left', shadow = '#14101c' } = {}) {
  const s = clean(str);
  const w = textWidth(s);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  for (const ch of s) {
    const gl = GLYPHS[ch];
    if (gl) {
      for (let i = 0; i < 15; i++) {
        if (gl[i] !== '1') continue;
        const gx = cx + (i % 3), gy = y + Math.floor(i / 3);
        if (shadow) px(g, gx, gy + 1, shadow);
        px(g, gx, gy, color);
      }
    }
    cx += 4;
  }
}

// ─── Sprites ────────────────────────────────────────────────────────────────
let ART = null;
const mix = (rng, list) => list[Math.floor(rng() * list.length)];

function groundTile(base, dark, light, seed, extra) {
  const [c, g] = newCanvas(TILE, TILE);
  const rng = mulberry32(seed);
  px(g, 0, 0, base, TILE, TILE);
  for (let i = 0; i < 16; i++) px(g, Math.floor(rng() * TILE), Math.floor(rng() * TILE), rng() < 0.55 ? dark : light);
  extra?.(g, rng);
  return c;
}

function buildArt() {
  const a = { grass: [], forest: [], sand: [], water: [], shallow: [], floor: [], wall: [], rubble: [], rock: [], tree: [], loot: {}, items: {}, cracks: [] };
  for (let v = 0; v < 4; v++) {
    a.grass.push(groundTile('#58b04b', '#489a3e', '#6cc45a', 100 + v, (g, rng) => {
      if (v === 1) { px(g, 4, 9, '#3e8a35'); px(g, 5, 8, '#3e8a35'); px(g, 5, 9, '#3e8a35'); px(g, 11, 4, '#3e8a35'); px(g, 12, 3, '#3e8a35'); }
      if (v === 2) { const f = mix(rng, ['#ffffff', '#ffe066', '#ff8fb8']); px(g, 9, 6, '#2f7a33'); px(g, 9, 5, f); px(g, 8, 6, f); px(g, 10, 6, f); px(g, 9, 7, f); }
    }));
    a.forest.push(groundTile('#3f8f3c', '#337a33', '#4da448', 200 + v, (g) => { if (v === 3) { px(g, 3, 10, '#2c6a2d'); px(g, 4, 9, '#2c6a2d'); px(g, 4, 10, '#2c6a2d'); } }));
    a.sand.push(groundTile('#e7d08c', '#d6bb72', '#f2e2ab', 300 + v, (g) => { if (v === 2) { px(g, 6, 7, '#b9a35f', 2, 1); px(g, 7, 8, '#b9a35f'); } }));
    for (let f = 0; f < 2; f++) {
      a.water.push(groundTile('#2b5fb4', '#2b5fb4', '#2b5fb4', 400 + v, (g, rng) => {
        for (let i = 0; i < 3; i++) { const x = Math.floor(rng() * 12), y = Math.floor(rng() * 14); px(g, x + f * 2, y, '#3d78d0', 3, 1); if (rng() < 0.4) px(g, x + 1 + f * 2, y - 1, '#6aa2ec', 1, 1); }
      }));
      a.shallow.push(groundTile('#4ea8e4', '#4ea8e4', '#4ea8e4', 500 + v, (g, rng) => {
        for (let i = 0; i < 3; i++) { const x = Math.floor(rng() * 12), y = Math.floor(rng() * 14); px(g, x + f * 3, y, '#76c4f2', 3, 1); if (rng() < 0.5) px(g, x + 1 + f * 3, y + 1, '#b5e4fa', 2, 1); }
      }));
    }
  }
  for (let v = 0; v < 2; v++) {
    a.floor.push(groundTile('#b57f4a', '#a2703f', '#c4915b', 600 + v, (g) => {
      for (let y = 3; y < TILE; y += 4) px(g, 0, y, '#8b5a30', TILE, 1);
      px(g, 2 + v * 8, 1, '#6e4a26'); px(g, 12 - v * 6, 9, '#6e4a26');
    }));
    a.rubble.push(groundTile('#9a7a50', '#7e6240', '#b89a6c', 700 + v, (g, rng) => {
      for (let i = 0; i < 6; i++) px(g, Math.floor(rng() * 13), Math.floor(rng() * 13), mix(rng, ['#6a4a2a', '#c9a874', '#4a3320']), 3, 2);
    }));
  }
  // Pared: ladrillos con el frente más oscuro abajo (para que parezca que tiene altura).
  for (let v = 0; v < 2; v++) {
    const [c, g] = newCanvas(TILE, TILE);
    px(g, 0, 0, '#7c3a28', TILE, TILE);
    for (let row = 0; row < 3; row++) {
      const y = row * 4;
      const off = (row + v) % 2 ? 0 : 4;
      for (let x = -off; x < TILE; x += 8) {
        const x1 = Math.max(0, x), x2 = Math.min(TILE, x + 7);
        if (x2 > x1) { px(g, x1, y, '#b0583d', x2 - x1, 3); px(g, x1, y, '#cc7556', x2 - x1, 1); }
      }
    }
    px(g, 0, 12, '#5a2a1e', TILE, 4);
    px(g, 0, 12, '#3f1c14', TILE, 1);
    a.wall.push(c);
  }
  // Roca: un peñasco gris sobre pasto.
  for (let v = 0; v < 2; v++) {
    const [c, g] = newCanvas(TILE, TILE);
    g.drawImage(a.grass[v], 0, 0);
    disc(g, 8, 9, 7, '#3a3d48');
    disc(g, 8, 8, 6, '#8d93a3');
    disc(g, 6, 6, 3, '#b3b8c6');
    px(g, 10, 11, '#666c7c', 3, 2); px(g, 5, 12, '#666c7c', 3, 1); px(g, 9, 6, '#666c7c'); px(g, 11, 8, '#666c7c');
    if (v) { px(g, 4, 9, '#666c7c', 1, 2); px(g, 12, 6, '#b3b8c6'); }
    a.rock.push(c);
  }
  // Caja de madera (sobre el piso).
  {
    const [c, g] = newCanvas(TILE, TILE);
    g.drawImage(a.floor[0], 0, 0);
    px(g, 1, 1, '#4a2e14', 14, 14);
    px(g, 2, 2, '#c99350', 12, 12);
    px(g, 2, 2, '#dba965', 12, 1);
    px(g, 2, 7, '#a6702f', 12, 2);
    px(g, 7, 2, '#a6702f', 2, 12);
    px(g, 3, 3, '#6e4a26'); px(g, 12, 3, '#6e4a26'); px(g, 3, 12, '#6e4a26'); px(g, 12, 12, '#6e4a26');
    px(g, 2, 13, '#8d5d2a', 12, 1);
    a.crate = c;
  }
  // Árbol: el tronco va en la casilla, la copa se dibuja arriba de todo.
  for (let v = 0; v < 3; v++) {
    const [c, g] = newCanvas(TILE, TILE);
    g.drawImage(a.forest[v], 0, 0);
    px(g, 6, 8, '#4a2e14', 4, 6);
    px(g, 7, 8, '#7a4f26', 2, 5);
    a.tree.push(c);
  }
  {
    const [c, g] = newCanvas(28, 26);
    disc(g, 14, 12, 12, '#1d3d22');
    disc(g, 14, 12, 11, '#2f7a3a');
    disc(g, 9, 14, 6, '#2a6c34'); disc(g, 19, 14, 6, '#2a6c34');
    disc(g, 12, 9, 7, '#3f9a48');
    disc(g, 17, 8, 5, '#47a64f');
    disc(g, 10, 7, 3, '#5cbc5a');
    px(g, 7, 12, '#5cbc5a', 2, 1); px(g, 18, 5, '#7bd36e', 2, 1); px(g, 16, 17, '#235a2c', 4, 1); px(g, 8, 18, '#235a2c', 3, 1);
    a.canopy = c;
  }
  // Grietas por si una casilla perdió vida.
  for (let lvl = 0; lvl < 2; lvl++) {
    const [c, g] = newCanvas(TILE, TILE);
    const dark = 'rgba(20,12,8,0.75)';
    pline(g, 3, 2, 7, 7, dark); pline(g, 7, 7, 6, 12, dark);
    if (lvl) { pline(g, 7, 7, 13, 9, dark); pline(g, 12, 2, 10, 5, dark); pline(g, 3, 13, 5, 10, dark); }
    a.cracks.push(c);
  }

  // Íconos del botín: armas con el color de su rareza y consumibles.
  const gun = (rows, color) => art(rows, { k: '#22202e', g: color, w: '#8a5a2c', s: '#9aa0b0' });
  const SHAPES = {
    pistol: ['.kkkkkkk..', '.kgggggkk.', '.kkkkkkk..', '..kgk.....', '..kgk.....', '..kkk.....'],
    smg: ['kkkkkkkkkkk.', 'kgggggggggkk', 'kkkkkkkkkkk.', '..kgk.kgk...', '..kgk.kgk...', '..kkk.kkk...'],
    shotgun: ['.............', 'kkkkkkkkkkkk.', 'kgggggggggkwk', 'kkkkkkkkkkkwk', '...........k.'],
    rifle: ['kkkkkkkkkkkkkk', 'kgggggggggggkk', 'kkkkkkkkkkkkkk', '.....kgk.kgk..', '.....kkk.kkk..'],
    sniper: ['.....kk.........', 'kkkkkkkkkkkkkkkk', 'kggggggggggggggk', 'kkkkkkkkkkkkkkkk', '........kgk.kk..'],
    bazooka: ['..kkkkkkkkkkkk', 'kkgggggggggggk', 'kkgggggggggggk', '..kkkkkkkkkkkk', '....kgk.......'],
  };
  for (const [name, rows] of Object.entries(SHAPES)) a.loot[name] = gun(rows, RARITY_COLORS[WEAPONS[name].rarity]);
  const P = { k: '#22202e', w: '#f4f1ea', r: '#e0434f', b: '#3f8cff', l: '#a8d0ff', y: '#ffd23f', g: '#4aa24a', G: '#8fd88a' };
  a.loot.bandage = art(['..kkkkk..', '.kwwwwwk.', 'kwwrrrwwk', 'kwwrrrwwk', '.kwwwwwk.', '..kkkkk..'], P);
  a.loot.medkit = art(['kkkkkkkkk', 'kwwwwwwwk', 'kwwwrwwwk', 'kwwrrrwwk', 'kwwwrwwwk', 'kwwwwwwwk', 'kkkkkkkkk'], P);
  a.loot.shield = art(['...kkk...', '...kbk...', '..kkbkk..', '.kbbbbbk.', 'kbbllbbbk', 'kbbllbbbk', '.kbbbbbk.', '..kkkkk..'], P);
  a.loot.grenade = art(['...kk....', '..kyk....', '.kkkkkk..', 'kggggggk.', 'kgGgggggk', 'kgggggggk', '.kggggk..', '..kkkk...'].map((r) => r.slice(0, 9)), P);
  // Iconos grandes para el menú (los mismos, el HUD los dibuja de nuevo en un <canvas>).
  a.box = art([
    '..kkkkkkkkkk..', '.kbbbbbbbbbbk.', 'kbyyyyyyyyyybk', 'kbyyyyyyyyyybk', 'kbbbbbbbbbbbbk', 'kbbyyyyyyyybbk', 'kbbyyyyyyyybbk', 'kbbbbbbbbbbbbk', '.kkkkkkkkkkkk.',
  ], { k: '#14141c', b: '#2d6bd1', y: '#ffd23f' });
  return a;
}
export const getArt = () => (ART ||= buildArt());

// Un ícono del botín (arma o consumible) como canvas.
export const lootIcon = (kind) => getArt().loot[kind];

// ─── El mundo ───────────────────────────────────────────────────────────────
export function drawGround(g, t, cam, W, H, time) {
  const a = getArt();
  const x0 = Math.floor(cam.x / TILE), x1 = Math.floor((cam.x + W) / TILE);
  const y0 = Math.floor(cam.y / TILE), y1 = Math.floor((cam.y + H) / TILE);
  const frame = Math.floor(time * 1.6);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const kind = tileAt(t, tx, ty);
      const h = hash2(tx, ty, t.seed);
      const v = Math.floor(h * 4);
      let spr;
      switch (kind) {
        case T.DEEP: spr = a.water[v * 2 + ((frame + Math.floor(h * 7)) & 1)]; break;
        case T.SHALLOW: spr = a.shallow[v * 2 + ((frame + Math.floor(h * 7)) & 1)]; break;
        case T.SAND: spr = a.sand[v]; break;
        case T.GRASS: spr = a.grass[v]; break;
        case T.FOREST: spr = a.forest[v]; break;
        case T.FLOOR: spr = a.floor[v & 1]; break;
        case T.WALL: spr = a.wall[v & 1]; break;
        case T.TREE: spr = a.tree[v % 3]; break;
        case T.ROCK: spr = a.rock[v & 1]; break;
        case T.CRATE: spr = a.crate; break;
        default: spr = a.rubble[v & 1];
      }
      const sx = tx * TILE - cam.x, sy = ty * TILE - cam.y;
      g.drawImage(spr, sx, sy);
      const max = TILE_HP[kind];
      if (max && t.hp.size) {
        const hp = t.hp.get(ty * t.N + tx);
        if (hp !== undefined) g.drawImage(a.cracks[hp < max * 0.4 ? 1 : 0], sx, sy);
      }
    }
  }
}

// Copas de los árboles: van encima de los jugadores.
export function drawCanopies(g, t, cam, W, H) {
  const a = getArt();
  const x0 = Math.floor(cam.x / TILE) - 1, x1 = Math.floor((cam.x + W) / TILE) + 1;
  const y0 = Math.floor(cam.y / TILE) - 1, y1 = Math.floor((cam.y + H) / TILE) + 2;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(t, tx, ty) !== T.TREE) continue;
      const sx = tx * TILE - cam.x + TILE / 2 - 14, sy = ty * TILE - cam.y + TILE / 2 - 15;
      g.fillStyle = 'rgba(10,30,15,0.22)';
      g.fillRect(sx + 6, sy + 22, 16, 3);
      g.drawImage(a.canopy, sx, sy);
    }
  }
}

// ─── Botín y cajas ──────────────────────────────────────────────────────────
export function drawLoot(g, items, cam, W, H, time, nearId) {
  const a = getArt();
  for (const it of items) {
    const x = Math.round(it.x - cam.x), y = Math.round(it.y - cam.y);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const icon = a.loot[it.kind];
    const rar = WEAPONS[it.kind] ? WEAPONS[it.kind].rarity : 1;
    const color = RARITY_COLORS[rar];
    const bob = Math.round(Math.sin(time * 3 + it.i) * 1);
    // Un brillo del color de la rareza abajo.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x - 5, y + 4, 10, 2);
    g.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4 + it.i);
    ring(g, x, y, 7, color);
    g.globalAlpha = 1;
    g.drawImage(icon, Math.round(x - icon.width / 2), Math.round(y - icon.height / 2 + bob));
    if (rar >= 2 && Math.floor(time * 3 + it.i) % 3 === 0) px(g, x + 5, y - 6 + bob, color, 1, 1);
    if (it.i === nearId) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 8.5, y - 8.5, 17, 17); }
  }
}

// Una caja que cae en paracaídas (o ya aterrizó). `k` va de 0 (arriba) a 1 (en el piso).
export function drawAirdrop(g, d, cam, time, k) {
  const a = getArt();
  const x = Math.round(d.x - cam.x);
  const y = Math.round(d.y - cam.y - (1 - k) * 220 * (1 - k));
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x - 7, Math.round(d.y - cam.y) + 5, 14, 3);
  g.drawImage(a.box, x - 7, y - 9);
  if (k < 1) {
    disc(g, x, y - 26, 12, '#14141c');
    disc(g, x, y - 26, 11, '#ffffff');
    for (let i = -10; i <= 10; i += 5) px(g, x + i - 1, y - 36, '#e0434f', 3, 14);
    g.fillStyle = '#14141c';
    g.fillRect(x - 12, y - 26, 25, 1);
    pline(g, x - 11, y - 25, x - 4, y - 9, '#14141c'); pline(g, x + 11, y - 25, x + 4, y - 9, '#14141c');
  } else if (Math.floor(time * 2) % 2) {
    ring(g, x, y - 2, 11, '#ffd23f');
  }
}

// ─── Jugadores ──────────────────────────────────────────────────────────────
// Un personaje visto desde arriba: hombros del color del jugador, cabeza, brazos y el arma apuntando.
export function drawPlayer(g, p, cam, color, o = {}) {
  const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
  const ang = o.angle ?? 0;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const body = o.hurt ? '#ffffff' : color;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(sx - 5, sy + 4, 11, 3);
  // Pies que se alternan al caminar.
  const stride = Math.round(Math.sin((o.walked || 0) * 0.5) * 2);
  px(g, sx - 3, sy + 3 + stride, '#2a2230', 2, 2);
  px(g, sx + 2, sy + 3 - stride, '#2a2230', 2, 2);
  // Arma.
  const wp = WEAPONS[o.weapon];
  if (wp && !o.casting) {
    const len = wp.len + 3;
    const gx = Math.round(sx + cos * 3), gy = Math.round(sy + sin * 3);
    const ex = Math.round(sx + cos * len), ey = Math.round(sy + sin * len);
    pline(g, gx, gy, ex, ey, '#14101c', 3);
    pline(g, gx, gy, ex, ey, wp.rarity >= 3 ? '#c46bff' : '#8b92a6', 1);
    px(g, Math.round(sx + cos * (len + 0.5)) - 1, Math.round(sy + sin * (len + 0.5)) - 1, '#14101c', 3, 3);
  }
  // Hombros y cabeza.
  disc(g, sx, sy, 5, '#17121f');
  disc(g, sx, sy, 4, body);
  disc(g, sx - 1, sy - 1, 2, o.hurt ? '#ffffff' : shade(color, 0.28));
  const hx = Math.round(sx + cos * 1), hy = Math.round(sy + sin * 1 - 1);
  disc(g, hx, hy, 3, '#17121f');
  disc(g, hx, hy, 2, o.hurt ? '#ffffff' : '#f2cda4');
  px(g, hx - 2 + (cos > 0.3 ? 1 : 0), hy - 2, shade(color, -0.45), 4, 2); // gorrita del color del equipo
  if (!o.casting) {
    const ex1 = Math.round(hx + cos * 1.5 - sin * 1), ey1 = Math.round(hy + sin * 1.5 + cos * 1);
    const ex2 = Math.round(hx + cos * 1.5 + sin * 1), ey2 = Math.round(hy + sin * 1.5 - cos * 1);
    px(g, ex1, ey1, '#17121f'); px(g, ex2, ey2, '#17121f');
  }
  // Manos.
  px(g, Math.round(sx + cos * 4 - sin * 2) - 1, Math.round(sy + sin * 4 + cos * 2) - 1, '#f2cda4', 2, 2);
  // Escudo: un aro azul.
  if (o.shield > 0) { g.globalAlpha = 0.35 + o.shield / 160; ring(g, sx, sy, 8, '#5ab4ff'); g.globalAlpha = 1; }
  // Curándose: aro que se llena.
  if (o.cast != null) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(sx - 7, sy - 14, 15, 3);
    px(g, sx - 6, sy - 13, o.castColor || '#5ed36b', Math.round(13 * o.cast), 1);
  }
  if (o.name) {
    const y = sy - (o.cast != null ? 22 : 17);
    drawText(g, o.name, sx, y, '#ffffff', { align: 'center' });
    if (o.hp != null) {
      px(g, sx - 8, y + 7, '#14101c', 17, 3);
      px(g, sx - 7, y + 8, o.hp > 35 ? '#5ed36b' : '#ff5a5f', Math.round(15 * Math.max(0, o.hp) / 100), 1);
    }
  }
}

export function drawDead(g, p, cam, color) {
  const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
  disc(g, sx, sy, 4, 'rgba(0,0,0,0.35)');
  px(g, sx - 3, sy - 3, '#e9edf2', 2, 2); px(g, sx + 1, sy - 3, '#e9edf2', 2, 2); px(g, sx - 3, sy + 1, '#e9edf2', 2, 2); px(g, sx + 1, sy + 1, '#e9edf2', 2, 2);
  px(g, sx - 1, sy - 1, color, 2, 2);
}

// ─── Balas, granadas, partículas ────────────────────────────────────────────
const TRACER = { pistol: '#fff2a8', smg: '#ffe27a', shotgun: '#ffc46b', rifle: '#a8f0ff', sniper: '#ffffff', bazooka: '#ff9a3c' };
export function drawBullet(g, b, cam) {
  const x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
  if (b.w === 'bazooka') {
    disc(g, x, y, 2, '#14101c'); disc(g, x, y, 1, '#ff9a3c'); px(g, x, y, '#fff3a0');
    return;
  }
  const len = b.w === 'sniper' ? 0.04 : 0.025;
  const tx = Math.round(x - b.vx * len), ty = Math.round(y - b.vy * len);
  pline(g, tx, ty, x, y, TRACER[b.w] || '#fff', 1);
  px(g, x, y, '#ffffff');
}
export function drawGrenade(g, gr, cam) {
  const x = Math.round(gr.x - cam.x), y = Math.round(gr.y - cam.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x - 3, y + 3, 7, 2);
  disc(g, x, y, 3, '#14101c'); disc(g, x, y, 2, gr.fuse < 0.5 && Math.floor(gr.fuse * 14) % 2 ? '#ff5a5f' : '#4aa24a');
  px(g, x - 1, y - 1, '#8fd88a');
}

export function burst(list, x, y, { n = 8, speed = 60, life = 0.5, colors = ['#fff'], size = 1, gravity = 0, angle = null, arc = Math.PI * 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = (angle ?? 0) + (Math.random() - 0.5) * arc;
    const s = speed * (0.4 + Math.random() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), age: 0, color: colors[Math.floor(Math.random() * colors.length)], size, gravity });
  }
}
export function drawParticles(g, list, cam, dt) {
  for (const q of list) {
    q.age += dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= 0.94; q.vy = q.vy * 0.94 + q.gravity * dt;
    g.globalAlpha = Math.max(0, 1 - q.age / q.life);
    px(g, Math.round(q.x - cam.x), Math.round(q.y - cam.y), q.color, q.size, q.size);
  }
  g.globalAlpha = 1;
}
export function drawExplosions(g, list, cam, dt) {
  for (const e of list) {
    e.age += dt;
    const k = Math.min(1, e.age / 0.4);
    const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    const r = Math.round(e.r * (0.35 + 0.65 * Math.sqrt(k)));
    g.globalAlpha = 1 - k * 0.8;
    disc(g, x, y, r, '#ffd23f');
    disc(g, x, y, Math.round(r * 0.75), '#ff9a3c');
    disc(g, x, y, Math.round(r * 0.45), '#fff3a0');
    ring(g, x, y, r + 1, '#ff5a2a');
    g.globalAlpha = 1;
  }
}
export function drawFloaters(g, list, cam, dt) {
  for (const f of list) {
    f.age += dt;
    drawText(g, f.text, f.x - cam.x, f.y - cam.y - f.age * 22, f.color, { align: 'center' });
  }
}

// ─── Zona ───────────────────────────────────────────────────────────────────
// Lo de afuera de la zona, tapado fila por fila (así el borde queda en píxeles y no suavizado).
export function drawZone(g, z, cam, W, H, time) {
  const fill = 'rgba(150,30,210,0.4)';
  const edge = time % 0.6 < 0.3 ? '#ff8cff' : '#e060ff';
  let prevDx = 0;
  for (let y = 0; y < H; y++) {
    const dy = cam.y + y + 0.5 - z.cy;
    if (Math.abs(dy) >= z.r) { px(g, 0, y, fill, W, 1); prevDx = 0; continue; }
    const dx = Math.sqrt(z.r * z.r - dy * dy);
    const left = Math.round(z.cx - dx - cam.x), right = Math.round(z.cx + dx - cam.x);
    if (left > 0) px(g, 0, y, fill, Math.min(W, left), 1);
    if (right < W) px(g, Math.max(0, right), y, fill, W - Math.max(0, right), 1);
    // Borde: cubre el salto entre una fila y la siguiente.
    const span = Math.max(2, Math.round(Math.abs(dx - prevDx)) + 1);
    px(g, left - 1, y, edge, Math.min(span, 40), 1);
    px(g, right - Math.min(span, 40) + 1, y, edge, Math.min(span, 40), 1);
    prevDx = dx;
  }
}

// ─── Minimapa ───────────────────────────────────────────────────────────────
export const MINI = 52;
const MINI_COLORS = ['#1d3f80', '#3a86c4', '#d9c47e', '#4a9a43', '#2f7a33', '#8a5a3a', '#6b3a2a', '#2f7a33', '#777b88', '#8a5a3a', '#8a5a3a'];
export function buildMinimap(t) {
  const [c, g] = newCanvas(MINI, MINI);
  for (let y = 0; y < MINI; y++) {
    for (let x = 0; x < MINI; x++) {
      const kind = tileAt(t, Math.floor((x / MINI) * t.N), Math.floor((y / MINI) * t.N));
      px(g, x, y, MINI_COLORS[kind]);
    }
  }
  return c;
}
export function drawMinimap(g, mini, t, me, z, drops, time) {
  const x0 = 5, y0 = 5, k = MINI / t.W;
  px(g, x0 - 2, y0 - 2, '#14101c', MINI + 4, MINI + 4);
  px(g, x0 - 1, y0 - 1, '#e9edf2', MINI + 2, MINI + 2);
  g.drawImage(mini, x0, y0);
  g.save();
  g.beginPath(); g.rect(x0, y0, MINI, MINI); g.clip();
  ring(g, x0 + z.cx * k, y0 + z.cy * k, z.r * k, '#ff8cff');
  if (z.state === 'wait') ring(g, x0 + z.next.cx * k, y0 + z.next.cy * k, z.next.r * k, '#ffffff');
  for (const d of drops) px(g, Math.round(x0 + d.x * k) - 1, Math.round(y0 + d.y * k) - 1, '#ffd23f', 3, 3);
  if (me && Math.floor(time * 3) % 2 === 0) px(g, Math.round(x0 + me.x * k) - 1, Math.round(y0 + me.y * k) - 1, '#ff3b4f', 3, 3);
  g.restore();
}
