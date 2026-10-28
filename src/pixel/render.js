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
export function drawText(g, str, x, y, color = '#fff', { align = 'left', shadow = '#14101c', scale = 1 } = {}) {
  const s = clean(str);
  const w = textWidth(s) * scale;
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  for (const ch of s) {
    const gl = GLYPHS[ch];
    if (gl) {
      for (let i = 0; i < 15; i++) {
        if (gl[i] !== '1') continue;
        const gx = cx + (i % 3) * scale, gy = y + Math.floor(i / 3) * scale;
        if (shadow) px(g, gx, gy + scale, shadow, scale, scale);
        px(g, gx, gy, color, scale, scale);
      }
    }
    cx += 4 * scale;
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
  const a = { grass: [], forest: [], sand: [], water: [], shallow: [], floor: [], wall: [], rubble: [], rock: [], tree: [], loot: {}, items: {}, cracks: [], plank: [], field: [], crop: [] };
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
  // Muelle: tablones de madera clara sobre el agua.
  for (let v = 0; v < 2; v++) {
    a.plank.push(groundTile('#c9a066', '#b58a52', '#d9b57c', 800 + v, (g) => {
      for (let x = 0; x < TILE; x += 5) px(g, x + (v ? 2 : 0), 0, '#7e5a30', 1, TILE);
      px(g, 0, 0, '#e2c288', TILE, 1); px(g, 0, 15, '#8b6334', TILE, 1);
    }));
  }
  // Cancha: pasto cortado en franjas, líneas blancas y red del arco.
  for (let v = 0; v < 2; v++) a.field.push(groundTile(v ? '#4fa545' : '#5ab84e', v ? '#479a3d' : '#52ad47', v ? '#58b04b' : '#63c256', 850 + v, null));
  a.line = (() => { const [c, g] = newCanvas(TILE, TILE); g.drawImage(a.field[0], 0, 0); px(g, 0, 6, '#f3f7ee', TILE, 4); return c; })();
  a.lineV = (() => { const [c, g] = newCanvas(TILE, TILE); g.drawImage(a.field[0], 0, 0); px(g, 6, 0, '#f3f7ee', 4, TILE); return c; })();
  a.lineX = (() => { const [c, g] = newCanvas(TILE, TILE); g.drawImage(a.field[0], 0, 0); px(g, 0, 6, '#f3f7ee', TILE, 4); px(g, 6, 0, '#f3f7ee', 4, TILE); return c; })();
  {
    const [c, g] = newCanvas(TILE, TILE);
    g.drawImage(a.field[0], 0, 0);
    px(g, 0, 0, '#2a2e3a', TILE, 2); px(g, 0, 14, '#2a2e3a', TILE, 2);
    for (let i = 0; i < TILE; i += 4) { px(g, i, 2, 'rgba(240,244,250,0.85)', 1, 12); px(g, 0, 2 + i, 'rgba(240,244,250,0.85)', TILE, 1); }
    a.net = c;
  }
  // Chacra: surcos de tierra con plantas de judías (vainas verdes colgando).
  for (let v = 0; v < 2; v++) {
    a.crop.push(groundTile('#8b6b3e', '#7a5c33', '#9c7a4a', 870 + v, (g) => {
      for (let x = 1 + v; x < TILE; x += 4) {
        px(g, x, 3, '#2f8a3a', 2, 9); px(g, x - 1, 5, '#3fa84a', 1, 3); px(g, x + 2, 7, '#3fa84a', 1, 3);
        px(g, x, 8, '#8fd860', 1, 3); px(g, x + 1, 10, '#a6e873');
      }
    }));
  }
  // Cofres: cerrado con brillo dorado (según el valor), y abierto y vacío.
  const chestArt = (open, body, trim) => {
    const [c, g] = newCanvas(14, 12);
    px(g, 0, 11, 'rgba(0,0,0,0.3)', 14, 1);
    px(g, 1, 3, '#2a1a0c', 12, 8);
    px(g, 2, 4, body, 10, 6);
    px(g, 2, 4, shade(body, 0.25), 10, 1);
    px(g, 1, 6, trim, 12, 1); px(g, 6, 5, trim, 2, 4); px(g, 6, 6, '#2a1a0c', 2, 2);
    if (open) { px(g, 2, 1, '#2a1a0c', 10, 3); px(g, 3, 2, shade(body, -0.35), 8, 1); px(g, 2, 4, '#1a0f06', 10, 4); }
    else { px(g, 1, 2, '#2a1a0c', 12, 3); px(g, 2, 2, shade(body, 0.1), 10, 2); px(g, 2, 2, shade(body, 0.35), 10, 1); }
    return c;
  };
  a.chest = [chestArt(false, '#b57434', '#ffd23f'), chestArt(false, '#c98a3a', '#fff0a0'), chestArt(false, '#a85cd6', '#ffe9a0')];
  a.chestOpen = chestArt(true, '#8a5a2a', '#c9a040');
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
        case T.PLANK: spr = a.plank[v & 1]; break;
        case T.FIELD: spr = a.field[(tx + ty) & 1]; break;
        case T.LINE: {
          const l = tileAt(t, tx - 1, ty) === T.LINE || tileAt(t, tx + 1, ty) === T.LINE, vv = tileAt(t, tx, ty - 1) === T.LINE || tileAt(t, tx, ty + 1) === T.LINE;
          spr = l && vv ? a.lineX : vv ? a.lineV : a.line;
          break;
        }
        case T.NET: spr = a.net; break;
        case T.CROP: spr = a.crop[v & 1]; break;
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

// ─── Cofres ─────────────────────────────────────────────────────────────────
const TIER_GLOW = ['#ffd23f', '#ffd23f', '#fff0a0', '#d890ff'];
// Los cofres del mapa (`opened` dice cuáles ya se abrieron) con un brillo dorado que parpadea.
export function drawChests(g, chests, opened, cam, W, H, time, nearId, progress) {
  const a = getArt();
  for (const ch of chests) {
    const x = Math.round(ch.x - cam.x), y = Math.round(ch.y - cam.y);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const open = Boolean(opened[ch.i]);
    const spr = open ? a.chestOpen : a.chest[ch.tier - 1] || a.chest[0];
    if (!open) {
      const glow = TIER_GLOW[ch.tier] || TIER_GLOW[1];
      g.globalAlpha = 0.3 + 0.2 * Math.sin(time * 4 + ch.i);
      ring(g, x, y, 9, glow);
      g.globalAlpha = 1;
      const f = Math.floor(time * 5 + ch.i * 3) % 14;
      if (f < 3) px(g, x + (f - 1) * 4, y - 8 - f, '#ffffff', 1, 1);
    }
    g.drawImage(spr, x - 7, y - 7);
    if (ch.i === nearId) {
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 9.5, y - 9.5, 19, 19);
      if (progress > 0) { px(g, x - 8, y + 10, '#14101c', 17, 4); px(g, x - 7, y + 11, '#ffd23f', Math.round(15 * Math.min(1, progress)), 2); }
    }
  }
}

// El cofre que cae del cielo con paracaídas (o ya aterrizó). `k` va de 0 (arriba) a 1 (en el piso).
export function drawAirdrop(g, d, cam, time, k, opened) {
  const a = getArt();
  const x = Math.round(d.x - cam.x);
  const y = Math.round(d.y - cam.y - (1 - k) * 220 * (1 - k));
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x - 7, Math.round(d.y - cam.y) + 5, 14, 3);
  g.drawImage(opened ? a.chestOpen : a.chest[2], x - 7, y - 7);
  if (k < 1) {
    disc(g, x, y - 26, 12, '#14141c');
    disc(g, x, y - 26, 11, '#ffffff');
    for (let i = -10; i <= 10; i += 5) px(g, x + i - 1, y - 36, '#e0434f', 3, 14);
    g.fillStyle = '#14141c';
    g.fillRect(x - 12, y - 26, 25, 1);
    pline(g, x - 11, y - 25, x - 4, y - 9, '#14141c'); pline(g, x + 11, y - 25, x + 4, y - 9, '#14141c');
  } else if (!opened && Math.floor(time * 2) % 2) {
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

// ─── Bus de batalla, caída y planeador ──────────────────────────────────────
// Vista de arriba, así que la altura se muestra con tres trucos: lo que está alto se dibuja más grande,
// su sombra queda lejos en el piso y pasan nubes por encima del suelo, más rápido que la cámara.
export const heightScale = (z) => 1 + z * 1.6;

// Nubes: manchas fijas del mundo (salen de un hash) que se mueven más rápido que el piso.
export function drawClouds(g, cam, W, H, alpha, seed) {
  if (alpha <= 0.02) return;
  const CELL = 120, par = 1.7;
  const cx0 = Math.floor((cam.x * par) / CELL) - 1, cx1 = Math.floor((cam.x * par + W) / CELL) + 1;
  const cy0 = Math.floor((cam.y * par) / CELL) - 1, cy1 = Math.floor((cam.y * par + H) / CELL) + 1;
  g.globalAlpha = Math.min(0.8, alpha);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const h = hash2(cx, cy, seed);
      if (h < 0.45) continue;
      const x = Math.round(cx * CELL + h * 60 - cam.x * par), y = Math.round(cy * CELL + hash2(cy, cx, seed) * 60 - cam.y * par);
      const r = 10 + Math.floor(h * 14);
      disc(g, x, y + 3, r, 'rgba(120,140,170,0.5)');
      disc(g, x, y, r, '#f4f8ff');
      disc(g, x - r * 0.8, y + 2, Math.round(r * 0.6), '#f4f8ff');
      disc(g, x + r * 0.8, y + 2, Math.round(r * 0.6), '#eaf1fb');
    }
  }
  g.globalAlpha = 1;
}

// El bus: un colectivo azul colgado de un globo a rayas, con su sombra lejos en el piso.
export function drawBus(g, bus, route, cam, time, riders) {
  const sx = Math.round(bus.x - cam.x), sy = Math.round(bus.y - cam.y);
  g.save();
  // Sombra en el piso, desplazada: la altura se nota de un vistazo.
  g.translate(sx + 22, sy + 30);
  g.rotate(route.ang);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(-18, -8, 36, 16);
  g.restore();
  g.save();
  g.translate(sx, sy);
  g.rotate(route.ang);
  // Carrocería (la parte de adelante va hacia +x).
  px(g, -19, -9, '#14141c', 38, 18);
  px(g, -18, -8, '#2f6fd8', 36, 16);
  px(g, -18, -8, '#5b94f0', 36, 3);
  px(g, -18, 5, '#1d4ea0', 36, 3);
  px(g, 10, -7, '#bfe4ff', 7, 14);     // parabrisas
  px(g, 10, -7, '#ffffff', 2, 14);
  for (let i = 0; i < 4; i++) px(g, -15 + i * 6, -6, '#bfe4ff', 4, 4);
  px(g, -18, -1, '#ffd23f', 28, 2);    // franja amarilla
  px(g, -19, 9, '#14141c', 4, 2); px(g, 12, 9, '#14141c', 4, 2); px(g, -19, -11, '#14141c', 4, 2); px(g, 12, -11, '#14141c', 4, 2);
  // Pasajeros: cabecitas del color de cada uno en el techo.
  riders.slice(0, 10).forEach((color, i) => { px(g, -16 + (i % 5) * 5, i < 5 ? 0 : -5, '#14101c', 4, 4); px(g, -15 + (i % 5) * 5, i < 5 ? 1 : -4, color, 2, 2); });
  g.restore();
  // Globo: se ve encima, un poco corrido hacia arriba de la pantalla.
  const bx = sx, by = sy - 26;
  const sway = Math.round(Math.sin(time * 2) * 1);
  pline(g, sx - 12, sy - 6, bx - 14 + sway, by + 10, '#14101c');
  pline(g, sx + 12, sy - 6, bx + 14 + sway, by + 10, '#14101c');
  disc(g, bx + sway, by, 22, '#14141c');
  disc(g, bx + sway, by, 21, '#ffffff');
  for (let i = -18; i <= 18; i += 9) {
    g.save();
    g.beginPath(); g.arc(bx + sway, by, 21, 0, Math.PI * 2); g.clip();
    px(g, bx + sway + i - 2, by - 22, '#e0434f', 5, 44);
    g.restore();
  }
  disc(g, bx + sway - 7, by - 8, 5, 'rgba(255,255,255,0.55)');
  drawText(g, 'BUS', bx + sway, by - 2, '#14101c', { align: 'center', shadow: null, scale: 2 });
}

// Un jugador en el aire visto desde arriba: brazos abiertos en caída libre; con el planeador, una
// vela grande encima. Cuanto más alto, más grande, y su sombra queda lejos en el piso.
export function drawAirPlayer(g, p, cam, color, z, glide, o = {}) {
  const k = heightScale(z);
  const gx = Math.round(p.x - cam.x), gy = Math.round(p.y - cam.y);
  // Sombra en el piso.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  const sr = Math.max(3, Math.round(4 * (1 + z * 0.5)));
  disc(g, gx + Math.round(z * 14), gy + Math.round(z * 18), sr, 'rgba(0,0,0,0.3)');
  g.save();
  g.translate(gx, gy - Math.round(z * 20));
  g.scale(k, k);
  if (glide) {
    // Planeador: una vela de listones del color del jugador y los cordones hasta el personaje.
    pline(g, -8, -4, -2, 1, '#14101c'); pline(g, 8, -4, 2, 1, '#14101c');
    disc(g, 0, -7, 9, '#14101c');
    disc(g, 0, -7, 8, color);
    for (let i = -6; i <= 6; i += 4) px(g, i - 1, -14, '#ffffff', 2, 14);
    disc(g, -3, -10, 3, 'rgba(255,255,255,0.35)');
  } else {
    // Caída libre: brazos y piernas abiertos en cruz.
    px(g, -6, -1, '#14101c', 13, 3); px(g, -1, -6, '#14101c', 3, 13);
    px(g, -5, 0, color, 11, 1); px(g, 0, -5, color, 1, 11);
    px(g, -6, -6, '#f2cda4', 2, 2); px(g, 5, -6, '#f2cda4', 2, 2);
  }
  disc(g, 0, 0, 4, '#17121f');
  disc(g, 0, 0, 3, color);
  disc(g, 0, -1, 2, '#f2cda4');
  px(g, -2, -3, shade(color, -0.45), 4, 2);
  g.restore();
  if (o.name) drawText(g, o.name, gx, gy - Math.round(z * 20) - Math.round(14 * k), '#ffffff', { align: 'center' });
}

// Rayitas de viento mientras te caés: pasan hacia arriba de la pantalla.
export function drawWind(g, W, H, time, fast) {
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 14; i++) {
    const h = hash2(i, 3, 7);
    const sp = (fast ? 260 : 120) * (0.7 + h * 0.6);
    const y = (((time * sp + h * 1000) % (H + 40)) - 20);
    const len = fast ? 10 + Math.floor(h * 12) : 5 + Math.floor(h * 6);
    g.fillRect(Math.round(hash2(i, 9, 3) * W), Math.round(H - y), 1, len);
  }
}

// La ruta del bus, en el mundo: rayitas blancas hacia adelante.
export function drawRoute(g, route, bus, cam, W, H) {
  g.fillStyle = 'rgba(255,255,255,0.55)';
  const step = 18;
  for (let d = Math.ceil(bus.d / step) * step; d < route.len; d += step) {
    const x = Math.round(route.x0 + route.dx * d - cam.x), y = Math.round(route.y0 + route.dy * d - cam.y);
    if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
    g.fillRect(x, y, 2, 2);
  }
}

// Los nombres de los lugares, sobre el piso. `big` los agranda (desde el aire se leen de lejos).
export function drawPlaceLabels(g, t, cam, W, H, big) {
  const scale = big ? 2 : 1;
  for (const p of t.places) {
    const x = Math.round((p.x + p.w / 2) * TILE - cam.x), y = Math.round(p.y * TILE - cam.y - 6 * scale);
    if (x < -120 || x > W + 120 || y < -20 || y > H + 20) continue;
    drawText(g, p.name, x, y, '#ffffff', { align: 'center', scale });
  }
}

// ─── Minimapa ───────────────────────────────────────────────────────────────
export const MINI = 52;
const MINI_COLORS = ['#1d3f80', '#3a86c4', '#d9c47e', '#4a9a43', '#2f7a33', '#8a5a3a', '#6b3a2a', '#2f7a33', '#777b88', '#8a5a3a', '#8a5a3a', '#c9a066', '#5ab84e', '#f3f7ee', '#e9edf2', '#8b6b3e'];
// El mapa pintado en un canvas de `size` × `size` (el chico va al costado, el grande para elegir dónde caer).
export function buildMinimap(t, size = MINI) {
  const [c, g] = newCanvas(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = tileAt(t, Math.floor((x / size) * t.N), Math.floor((y / size) * t.N));
      px(g, x, y, MINI_COLORS[kind]);
    }
  }
  return c;
}
function route2(g, route, x0, y0, k) {
  g.fillStyle = '#ffffff';
  const n = Math.floor(route.len / 14);
  for (let i = 0; i < n; i += 2) px(g, Math.round(x0 + (route.x0 + route.dx * i * 14) * k), Math.round(y0 + (route.y0 + route.dy * i * 14) * k), '#ffffff');
}
export function drawMinimap(g, mini, t, me, z, drops, time, extra = {}) {
  const x0 = 5, y0 = 5, k = MINI / t.W;
  px(g, x0 - 2, y0 - 2, '#14101c', MINI + 4, MINI + 4);
  px(g, x0 - 1, y0 - 1, '#e9edf2', MINI + 2, MINI + 2);
  g.drawImage(mini, x0, y0);
  g.save();
  g.beginPath(); g.rect(x0, y0, MINI, MINI); g.clip();
  ring(g, x0 + z.cx * k, y0 + z.cy * k, z.r * k, '#ff8cff');
  if (z.state === 'wait') ring(g, x0 + z.next.cx * k, y0 + z.next.cy * k, z.next.r * k, '#ffffff');
  if (extra.route) route2(g, extra.route, x0, y0, k);
  if (extra.bus) px(g, Math.round(x0 + extra.bus.x * k) - 1, Math.round(y0 + extra.bus.y * k) - 1, '#5b94f0', 3, 3);
  for (const d of drops) px(g, Math.round(x0 + d.x * k) - 1, Math.round(y0 + d.y * k) - 1, '#ffd23f', 3, 3);
  if (me && Math.floor(time * 3) % 2 === 0) px(g, Math.round(x0 + me.x * k) - 1, Math.round(y0 + me.y * k) - 1, '#ff3b4f', 3, 3);
  g.restore();
}

// El mapa grande con los nombres de los lugares (tecla M, y al subir al bus para elegir dónde caer).
export function drawBigMap(g, big, t, me, z, o, time, W, H) {
  const size = big.width;
  const x0 = o.corner ? 6 : Math.round((W - size) / 2), y0 = o.corner ? 6 : Math.round((H - size) / 2);
  const k = size / t.W;
  px(g, x0 - 3, y0 - 3, '#14101c', size + 6, size + 6);
  px(g, x0 - 2, y0 - 2, '#e9edf2', size + 4, size + 4);
  g.drawImage(big, x0, y0);
  g.save();
  g.beginPath(); g.rect(x0, y0, size, size); g.clip();
  ring(g, x0 + z.cx * k, y0 + z.cy * k, z.r * k, '#ff8cff');
  if (o.route) route2(g, o.route, x0, y0, k);
  for (const p of t.places) px(g, Math.round(x0 + p.cx * TILE * k) - 1, Math.round(y0 + p.cy * TILE * k) - 1, '#ffd23f', 3, 3);
  if (o.bus) { px(g, Math.round(x0 + o.bus.x * k) - 3, Math.round(y0 + o.bus.y * k) - 3, '#14101c', 7, 7); px(g, Math.round(x0 + o.bus.x * k) - 2, Math.round(y0 + o.bus.y * k) - 2, '#5b94f0', 5, 5); }
  if (me && Math.floor(time * 3) % 2 === 0) px(g, Math.round(x0 + me.x * k) - 1, Math.round(y0 + me.y * k) - 1, '#ff3b4f', 3, 3);
  g.restore();
  for (const p of t.places) {
    const lx = Math.round(x0 + p.cx * TILE * k), ly = Math.round(y0 + p.cy * TILE * k) + 3;
    // Los nombres largos van en dos renglones para que no se pisen.
    const words = p.name.split(' ');
    let lines = [p.name];
    if (p.name.length > 14 && words.length > 1) {
      let best = 1;
      for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - p.name.length / 2) < Math.abs(words.slice(0, best).join(' ').length - p.name.length / 2)) best = i;
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    lines.forEach((line, n) => {
      const w = textWidth(line);
      drawText(g, line, Math.max(x0 + w / 2 + 1, Math.min(x0 + size - w / 2 - 1, lx)), ly + n * 6, '#ffffff', { align: 'center' });
    });
  }
}
