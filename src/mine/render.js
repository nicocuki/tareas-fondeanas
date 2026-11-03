// Cubolandia: todo el dibujo, sin estado de juego. Las texturas se pintan una vez con código (nada de
// imágenes) en un atlas de 16 × 16 por bloque; el canvas es chico y el CSS lo agranda pixelado.
import { B, BLOCKS, ITEMS } from './blocks.js';
import { H, W, at } from './world.js';
import { dayPhase, hash01, lightAt, MOBS } from './sim.js';

export const TILE = 16;
export const VIEW_W = 640; // el ancho del canvas en píxeles del juego (40 bloques)

// ─── Texturas ────────────────────────────────────────────────────────────────
function speck(g, ox, oy, colors, n, seed, size = 1) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash01(i, seed, 11) * (TILE - size + 1)), y = Math.floor(hash01(i, seed, 23) * (TILE - size + 1));
    g.fillStyle = colors[Math.floor(hash01(i, seed, 37) * colors.length)];
    g.fillRect(ox + x, oy + y, size, size);
  }
}
const fill = (g, ox, oy, color, x = 0, y = 0, w = TILE, h = TILE) => { g.fillStyle = color; g.fillRect(ox + x, oy + y, w, h); };

const STONE_BASE = ['#8b8b8b', '#7d7d7d', '#999999'];
function stoneBase(g, ox, oy, seed) { fill(g, ox, oy, '#868686'); speck(g, ox, oy, STONE_BASE, 46, seed, 2); }
function ore(g, ox, oy, seed, colors) {
  stoneBase(g, ox, oy, seed);
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(hash01(i, seed, 71) * 11), y = 1 + Math.floor(hash01(i, seed, 73) * 11);
    fill(g, ox, oy, colors[i % colors.length], x, y, 3, 2);
    fill(g, ox, oy, colors[(i + 1) % colors.length], x + 1, y + 2, 2, 1);
  }
}

const PAINT = {
  grass(g, ox, oy, s) {
    fill(g, ox, oy, '#8a5a35'); speck(g, ox, oy, ['#7a4a2b', '#9c6a42', '#6f4527'], 28, s, 2);
    fill(g, ox, oy, '#5da745', 0, 0, TILE, 4);
    speck(g, ox, oy, ['#4f9439', '#74bd58'], 10, s + 3);
    for (let x = 0; x < TILE; x++) if (hash01(x, s, 5) < 0.5) fill(g, ox, oy, '#5da745', x, 4, 1, 1 + Math.floor(hash01(x, s, 9) * 2));
  },
  dirt(g, ox, oy, s) { fill(g, ox, oy, '#8a5a35'); speck(g, ox, oy, ['#7a4a2b', '#9c6a42', '#6f4527', '#a37548'], 34, s, 2); },
  stone(g, ox, oy, s) { stoneBase(g, ox, oy, s); },
  cobble(g, ox, oy, s) {
    fill(g, ox, oy, '#7b7b7b'); speck(g, ox, oy, ['#8d8d8d', '#6a6a6a', '#9b9b9b'], 40, s, 3);
    fill(g, ox, oy, '#5d5d5d', 0, 5, TILE, 1); fill(g, ox, oy, '#5d5d5d', 0, 11, TILE, 1);
    fill(g, ox, oy, '#5d5d5d', 6, 0, 1, 5); fill(g, ox, oy, '#5d5d5d', 11, 6, 1, 5); fill(g, ox, oy, '#5d5d5d', 4, 12, 1, 4);
  },
  sand(g, ox, oy, s) { fill(g, ox, oy, '#e3d29a'); speck(g, ox, oy, ['#d6c485', '#efe0ad', '#cdbb7a'], 30, s, 1); },
  gravel(g, ox, oy, s) { fill(g, ox, oy, '#8a8581'); speck(g, ox, oy, ['#6f6a66', '#a39e99', '#5c5854', '#b7b2ad'], 36, s, 2); },
  log(g, ox, oy, s) {
    fill(g, ox, oy, '#6b4a2a');
    for (const x of [1, 4, 7, 10, 13]) fill(g, ox, oy, x % 2 ? '#523720' : '#7e5833', x, 0, 2, TILE);
    speck(g, ox, oy, ['#4a3019', '#8b6339'], 10, s, 1);
  },
  leaves(g, ox, oy, s) {
    fill(g, ox, oy, '#3d8a3a'); speck(g, ox, oy, ['#2c6a2c', '#52a548', '#265c27', '#62b858'], 42, s, 2);
  },
  planks(g, ox, oy) {
    fill(g, ox, oy, '#b8914f');
    for (const y of [0, 4, 8, 12]) fill(g, ox, oy, '#8e6d36', 0, y + 3, TILE, 1);
    fill(g, ox, oy, '#cba665', 0, 0, TILE, 1); fill(g, ox, oy, '#9c7a40', 5, 4, 1, 3); fill(g, ox, oy, '#9c7a40', 11, 8, 1, 3);
  },
  table(g, ox, oy) {
    fill(g, ox, oy, '#8d5f2c'); fill(g, ox, oy, '#b8914f', 0, 0, TILE, 5);
    fill(g, ox, oy, '#6b4720', 0, 5, TILE, 1); fill(g, ox, oy, '#6b4720', 7, 5, 2, 11);
    fill(g, ox, oy, '#d8d8d8', 2, 1, 4, 2); fill(g, ox, oy, '#7a4a2b', 10, 1, 4, 3); fill(g, ox, oy, '#a37548', 2, 8, 4, 6);
    fill(g, ox, oy, '#cfcfcf', 10, 8, 4, 2);
  },
  furnace(g, ox, oy, s) {
    stoneBase(g, ox, oy, s);
    fill(g, ox, oy, '#555', 0, 0, TILE, 1); fill(g, ox, oy, '#555', 0, 15, TILE, 1); fill(g, ox, oy, '#555', 0, 0, 1, TILE); fill(g, ox, oy, '#555', 15, 0, 1, TILE);
    fill(g, ox, oy, '#222', 3, 3, 10, 5); fill(g, ox, oy, '#222', 3, 10, 10, 4);
    fill(g, ox, oy, '#ff8a1c', 5, 11, 6, 2); fill(g, ox, oy, '#ffd23f', 6, 12, 4, 1);
  },
  coal_ore(g, ox, oy, s) { ore(g, ox, oy, s, ['#1d1d1d', '#2e2e2e']); },
  iron_ore(g, ox, oy, s) { ore(g, ox, oy, s, ['#d8af93', '#c49a7c']); },
  gold_ore(g, ox, oy, s) { ore(g, ox, oy, s, ['#fcee4b', '#e7c93a']); },
  diamond_ore(g, ox, oy, s) { ore(g, ox, oy, s, ['#5decf5', '#9ff6fb']); },
  bedrock(g, ox, oy, s) { fill(g, ox, oy, '#3a3a3a'); speck(g, ox, oy, ['#222', '#555', '#2b2b2b', '#6a6a6a'], 48, s, 2); },
  water(g, ox, oy, s) { fill(g, ox, oy, '#2f66d8'); speck(g, ox, oy, ['#3c78ee', '#2858c0'], 12, s, 2); },
  lava(g, ox, oy, s) { fill(g, ox, oy, '#e8651a'); speck(g, ox, oy, ['#ffb02a', '#ff8a1c', '#c8420e', '#ffd23f'], 26, s, 3); },
  snow(g, ox, oy, s) { fill(g, ox, oy, '#f2f7fb'); speck(g, ox, oy, ['#dce8f2', '#ffffff', '#cfdfee'], 18, s, 2); },
  cactus(g, ox, oy, s) {
    fill(g, ox, oy, '#2f7a35'); fill(g, ox, oy, '#1f5a26', 0, 0, 1, TILE); fill(g, ox, oy, '#1f5a26', 15, 0, 1, TILE);
    fill(g, ox, oy, '#4ca152', 5, 0, 2, TILE); speck(g, ox, oy, ['#d6e8c4'], 6, s, 1);
  },
  sandstone(g, ox, oy, s) {
    fill(g, ox, oy, '#d9c78a'); speck(g, ox, oy, ['#cdb97a', '#e4d49c'], 22, s, 2);
    fill(g, ox, oy, '#bfa965', 0, 5, TILE, 1); fill(g, ox, oy, '#bfa965', 0, 11, TILE, 1);
  },
  flower(g, ox, oy, s) {
    fill(g, ox, oy, '#3f8f3a', 7, 6, 2, 10); fill(g, ox, oy, '#3f8f3a', 5, 10, 2, 2);
    const c = hash01(s, 1, 2) < 0.5 ? '#e0434f' : '#ffd23f';
    fill(g, ox, oy, c, 5, 3, 6, 4); fill(g, ox, oy, '#fff3a0', 7, 4, 2, 2);
  },
  tallgrass(g, ox, oy) {
    for (const [x, h] of [[3, 7], [6, 10], [9, 8], [12, 6]]) { fill(g, ox, oy, '#4f9439', x, 16 - h, 2, h); fill(g, ox, oy, '#74bd58', x, 16 - h, 1, 3); }
  },
};
const VARIANTS = 4;
let atlas = null;
function getAtlas() {
  if (atlas) return atlas;
  atlas = document.createElement('canvas');
  atlas.width = TILE * BLOCKS.length;
  atlas.height = TILE * VARIANTS;
  const g = atlas.getContext('2d');
  for (const b of BLOCKS) {
    const paint = PAINT[b.key];
    if (!paint) continue;
    for (let v = 0; v < VARIANTS; v++) paint(g, b.id * TILE, v * TILE, b.id * 31 + v * 7 + 1);
  }
  return atlas;
}
export function drawTile(g, id, x, y, v = 0) {
  g.drawImage(getAtlas(), id * TILE, (v % VARIANTS) * TILE, TILE, TILE, x, y, TILE, TILE);
}

// ─── Íconos de ítems ─────────────────────────────────────────────────────────
const MAT_COLOR = { wood: '#b8914f', stone: '#8d8d8d', iron: '#e6e6e6', gold: '#f5d142', diamond: '#4ae0d0', leather: '#9a5a32' };
const icons = new Map();
function paintIcon(g, key) {
  const it = ITEMS[key];
  const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (!it) return;
  if (it.block !== undefined) { g.drawImage(getAtlas(), it.block * TILE, 0, TILE, TILE, 0, 0, TILE, TILE); return; }
  if (it.tool) {
    const mat = MAT_COLOR[it.kind];
    for (let i = 0; i < 11; i++) px('#6b4a2a', 2 + i, 13 - i, 2, 2); // el palo, en diagonal
    if (it.tool === 'pickaxe') { for (let i = 0; i < 9; i++) px(mat, 3 + i, 2 + Math.abs(i - 4) * 0.7 | 0, 2, 2); px(mat, 2, 5, 2, 2); px(mat, 12, 5, 2, 2); }
    else if (it.tool === 'axe') { px(mat, 7, 1, 6, 6); px(mat, 5, 3, 3, 4); px('#00000030', 12, 2, 1, 5); }
    else if (it.tool === 'shovel') { px(mat, 10, 1, 4, 5); px(mat, 9, 3, 2, 2); }
    else { for (let i = 0; i < 10; i++) px(mat, 5 + i, 10 - i, 2, 2); px('#6b4a2a', 3, 11, 4, 2); px('#6b4a2a', 1, 13, 2, 2); }
    return;
  }
  if (it.armor !== undefined) {
    const c = MAT_COLOR[it.kind], d = '#00000040';
    if (it.armor === 0) { px(c, 3, 3, 10, 6); px(c, 3, 9, 3, 3); px(c, 10, 9, 3, 3); px(d, 3, 8, 10, 1); }
    else if (it.armor === 1) { px(c, 3, 2, 10, 12); px(c, 1, 2, 3, 6); px(c, 12, 2, 3, 6); px('#00000000', 6, 2, 4, 3); px(d, 6, 2, 4, 2); }
    else if (it.armor === 2) { px(c, 3, 2, 10, 5); px(c, 3, 7, 4, 7); px(c, 9, 7, 4, 7); px(d, 3, 6, 10, 1); }
    else { px(c, 2, 8, 5, 5); px(c, 9, 8, 5, 5); px(d, 2, 12, 5, 1); px(d, 9, 12, 5, 1); }
    return;
  }
  const dot = (c, x, y, w, h) => px(c, x, y, w, h);
  switch (key) {
    case 'stick': for (let i = 0; i < 11; i++) px('#8a6238', 2 + i, 13 - i, 2, 2); break;
    case 'coal': dot('#222', 3, 4, 10, 8); dot('#3a3a3a', 5, 3, 6, 2); dot('#555', 5, 6, 2, 2); break;
    case 'diamond': dot('#5decf5', 4, 3, 8, 10); dot('#c8fcff', 5, 4, 3, 3); dot('#2bbcc6', 8, 8, 4, 4); break;
    case 'iron_ingot': dot('#e6e6e6', 2, 6, 12, 6); dot('#b9b9b9', 2, 10, 12, 2); dot('#fff', 3, 6, 6, 1); break;
    case 'gold_ingot': dot('#f5d142', 2, 6, 12, 6); dot('#c9a227', 2, 10, 12, 2); dot('#fff3a0', 3, 6, 6, 1); break;
    case 'leather': dot('#9a5a32', 3, 3, 10, 10); dot('#7d4524', 3, 11, 10, 2); dot('#b97a50', 4, 4, 4, 3); break;
    case 'apple': dot('#d4262c', 3, 4, 10, 9); dot('#f06a6f', 4, 5, 3, 3); dot('#6b4a2a', 8, 2, 1, 3); dot('#3f8f3a', 9, 2, 3, 2); break;
    case 'golden_apple': dot('#f5d142', 3, 4, 10, 9); dot('#fff3a0', 4, 5, 3, 3); dot('#6b4a2a', 8, 2, 1, 3); dot('#3f8f3a', 9, 2, 3, 2); break;
    case 'raw_beef': dot('#c4413f', 2, 5, 12, 7); dot('#e7807d', 4, 6, 4, 2); dot('#f1d4c8', 10, 8, 3, 3); break;
    case 'beef': dot('#8a4a23', 2, 5, 12, 7); dot('#b36a35', 4, 6, 4, 2); dot('#f1d4c8', 10, 8, 3, 3); break;
    case 'raw_pork': dot('#e89a9a', 2, 5, 12, 7); dot('#f6c1c1', 4, 6, 4, 2); break;
    case 'pork': dot('#a0643d', 2, 5, 12, 7); dot('#c98b5e', 4, 6, 4, 2); break;
    case 'bucket': case 'water_bucket': case 'lava_bucket':
      dot('#cfcfcf', 3, 4, 10, 9); dot('#9a9a9a', 4, 12, 8, 1); dot('#00000030', 5, 4, 6, 1);
      if (key === 'water_bucket') dot('#2f66d8', 4, 5, 8, 3);
      if (key === 'lava_bucket') dot('#ff8a1c', 4, 5, 8, 3);
      break;
    default: dot('#ff00ff', 4, 4, 8, 8);
  }
}
export function itemIcon(key) {
  let c = icons.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 16;
  paintIcon(c.getContext('2d'), key);
  icons.set(key, c);
  return c;
}
const iconUrls = new Map();
export function itemIconUrl(key) {
  let u = iconUrls.get(key);
  if (!u) { u = itemIcon(key).toDataURL(); iconUrls.set(key, u); }
  return u;
}

// ─── Mundo ───────────────────────────────────────────────────────────────────
export function skyColors(day) {
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const top = lerp([8, 12, 38], [92, 160, 245], day), bot = lerp([22, 28, 62], [160, 205, 255], day);
  return [`rgb(${top})`, `rgb(${bot})`];
}

export function drawSky(g, w, camY, VW, VH, day, phase, time) {
  const [top, bot] = skyColors(day);
  const grad = g.createLinearGradient(0, 0, 0, VH);
  grad.addColorStop(0, top); grad.addColorStop(1, bot);
  g.fillStyle = grad;
  g.fillRect(0, 0, VW, VH);
  // Estrellas de noche.
  if (day < 0.5) {
    g.fillStyle = `rgba(255,255,255,${(0.5 - day) * 1.6})`;
    for (let i = 0; i < 60; i++) g.fillRect(Math.floor(hash01(i, 1, 1) * VW), Math.floor(hash01(i, 2, 2) * VH * 0.7), 1, 1);
  }
  // Sol y luna dan la vuelta al cielo.
  const a = phase * Math.PI * 2;
  const sx = VW / 2 - Math.cos(a) * VW * 0.42, sy = VH * 0.55 - Math.sin(a) * VH * 0.5 - camY * 0.05;
  g.fillStyle = '#ffe58a'; g.fillRect(Math.round(sx) - 6, Math.round(sy) - 6, 12, 12);
  g.fillStyle = '#fff6c8'; g.fillRect(Math.round(sx) - 4, Math.round(sy) - 4, 8, 8);
  const mx = VW / 2 + Math.cos(a) * VW * 0.42, my = VH * 0.55 + Math.sin(a) * VH * 0.5 - camY * 0.05;
  g.fillStyle = '#e8ecf5'; g.fillRect(Math.round(mx) - 5, Math.round(my) - 5, 10, 10);
  // Nubes.
  g.fillStyle = `rgba(255,255,255,${0.25 + day * 0.5})`;
  for (let i = 0; i < 7; i++) {
    const cx = ((hash01(i, 5, 5) * 900 + time * (3 + i)) % (VW + 120)) - 60, cy = 14 + hash01(i, 6, 6) * 60 - camY * 0.08;
    g.fillRect(Math.round(cx), Math.round(cy), 46, 7); g.fillRect(Math.round(cx) + 8, Math.round(cy) - 5, 28, 6);
  }
}

// Dibuja los bloques visibles con la luz de cada casilla. `cam` = esquina de arriba a la izquierda en píxeles.
export function drawWorld(g, w, light, cam, VW, VH, day, time, focus) {
  const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + VW) / TILE), y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(H - 1, Math.ceil((cam.y + VH) / TILE));
  const lava = Math.floor(time * 2) % 2;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = Math.max(0, x0); tx <= Math.min(W - 1, x1); tx++) {
      const id = w.t[ty * W + tx];
      const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
      const underground = ty > w.surf[tx] + 1;
      if (id === B.air || BLOCKS[id].plant) {
        if (underground) { g.fillStyle = '#231e1a'; g.fillRect(px, py, TILE, TILE); }
        if (id !== B.air) drawTile(g, id, px, py, (tx * 7 + ty) & 3);
      } else {
        if (BLOCKS[id].plant === undefined && !BLOCKS[id].fluid) {
          drawTile(g, id, px, py, (tx * 13 + ty * 7) & 3);
        } else if (id === B.water) {
          if (underground) { g.fillStyle = '#231e1a'; g.fillRect(px, py, TILE, TILE); }
          g.globalAlpha = 0.72; drawTile(g, id, px, py, (tx + ty + Math.floor(time * 1.5)) & 3); g.globalAlpha = 1;
          if (at(w, tx, ty - 1) !== B.water) { g.fillStyle = 'rgba(180,215,255,0.55)'; g.fillRect(px, py, TILE, 2); }
        } else drawTile(g, id, px, py, lava + ((tx + ty) & 2));
      }
      // Luz: lo que no ve el sol (ni la antorcha del jugador) queda oscuro.
      const L = lightAt(w, light, tx, ty) / 15;
      let b = Math.pow(L, 1.35) * (0.2 + 0.8 * day);
      // La sombra de un árbol no tiñe el cielo: afuera, el brillo es el del día para todos.
      if (!underground && id === B.air) continue; // el cielo ya se pintó con la hora del día
      if (!underground && BLOCKS[id].plant) b = 0.2 + 0.8 * day;
      if (focus) { const d = Math.hypot(tx + 0.5 - focus.x, ty + 0.5 - focus.y); b = Math.max(b, Math.max(0, 1 - d / 8) * 0.95); }
      if (id === B.lava) b = Math.max(b, 0.8);
      b = Math.max(0.035, Math.min(1, b));
      if (b < 0.995) { g.fillStyle = `rgba(4,6,14,${(1 - b).toFixed(2)})`; g.fillRect(px, py, TILE, TILE); }
    }
  }
}

// El bloque que se está picando y el que apunta el mouse.
export function drawTarget(g, tx, ty, cam, ok, progress) {
  const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
  g.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,90,0.8)';
  g.lineWidth = 1;
  g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  if (progress > 0) {
    const stage = Math.min(9, Math.floor(progress * 10));
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i <= stage; i++) {
      const x = Math.floor(hash01(i, tx, ty) * 14), y = Math.floor(hash01(i, ty, tx) * 14);
      g.fillRect(px + x, py + y, 2, 2 + (i % 3));
    }
  }
}

export function drawGhostBlock(g, id, tx, ty, cam, ok) {
  g.globalAlpha = ok ? 0.5 : 0.25;
  const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
  drawTile(g, id, px, py, 0);
  g.globalAlpha = 1;
}

// ─── Personajes ──────────────────────────────────────────────────────────────
const SKIN = '#e8b98a';
function limb(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }

// Un jugador de costado. e: { x, y (pies, en bloques) }; o: { color, face, walked, sneak, armor, held, name, hurt, dead, swing }
export function drawPlayer(g, e, cam, o) {
  const sx = Math.round(e.x * TILE - cam.x), sy = Math.round(e.y * TILE - cam.y);
  const sneak = o.sneak;
  const dir = o.face >= 0 ? 1 : -1;
  const swing = Math.sin((o.walked || 0) * 3.4) * (o.moving ? 1 : 0);
  const tilt = sneak ? 2 : 0;
  const armor = o.armor || [];
  const mat = (i) => { const it = ITEMS[armor[i]]; return it ? MAT_COLOR[it.kind] : null; };
  const shirt = o.color || '#4aa0ff';
  g.save();
  g.translate(sx, sy);
  if (o.hurt) g.globalAlpha = 0.55;
  if (o.dead) { g.rotate(Math.PI / 2 * dir); }
  const bodyTop = -20 + (sneak ? 3 : 0);
  // Piernas.
  for (const s of [-1, 1]) {
    const lx = -2 + s * swing * 3 * 0.9;
    limb(g, lx, -9, 4, 9, s < 0 ? '#2d3a8c' : '#25317a');
    if (mat(2)) limb(g, lx, -9, 4, 6, mat(2));
    if (mat(3)) limb(g, lx, -3, 4, 3, mat(3));
  }
  // Cuerpo.
  limb(g, -3 + tilt * 0.5 * dir, bodyTop, 6, 12, shirt);
  if (mat(1)) { limb(g, -3 + tilt * 0.5 * dir, bodyTop, 6, 10, mat(1)); limb(g, -2 + tilt * 0.5 * dir, bodyTop + 1, 4, 2, 'rgba(255,255,255,0.25)'); }
  // Cabeza.
  const hx = -4 + tilt * dir, hy = bodyTop - 8;
  limb(g, hx, hy, 8, 8, SKIN);
  limb(g, hx + (dir > 0 ? 5 : 1), hy + 3, 2, 2, '#2b2b2b'); // ojo
  limb(g, hx, hy, 8, 2, '#5b3a1e'); // pelo
  if (mat(0)) { limb(g, hx - 1, hy - 1, 10, 4, mat(0)); limb(g, hx - 1, hy + 3, 2, 3, mat(0)); limb(g, hx + 7, hy + 3, 2, 3, mat(0)); }
  // Brazo con el ítem en la mano.
  const armSwing = o.swing > 0 ? -1.2 * Math.sin(o.swing * Math.PI) : -swing * 0.5;
  g.save();
  g.translate(dir * 1 + tilt * 0.5 * dir, bodyTop + 2);
  g.rotate(armSwing * dir + 0.2);
  limb(g, -1.5, 0, 3, 9, SKIN);
  if (mat(1)) limb(g, -1.5, 0, 3, 4, mat(1));
  if (o.held) {
    g.save();
    g.translate(dir * 4, 9);
    g.scale(dir, 1);
    g.rotate(-0.5);
    g.drawImage(itemIcon(o.held), -6, -11, 12, 12);
    g.restore();
  }
  g.restore();
  g.restore();
  if (o.name) drawTag(g, o.name, sx, sy - 34 + (sneak ? 3 : 0), o.color, o.hp);
}

export function drawTag(g, name, x, y, color, hp) {
  g.font = '600 6px Inter, sans-serif';
  g.textAlign = 'center';
  const wd = g.measureText(name).width + 6;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(Math.round(x - wd / 2), y - 6, Math.ceil(wd), 8);
  g.fillStyle = color || '#fff';
  g.fillText(name, x, y);
  if (hp !== undefined) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 10, y + 3, 20, 2);
    g.fillStyle = '#e0434f'; g.fillRect(x - 10, y + 3, Math.max(0, Math.min(20, hp)), 2);
  }
}

export function drawMob(g, m, cam, hurt) {
  const def = MOBS[m.kind];
  const sx = Math.round(m.x * TILE - cam.x), sy = Math.round(m.y * TILE - cam.y);
  const dir = m.face >= 0 ? 1 : -1;
  const walk = Math.sin((m.walked || 0) * 4);
  g.save();
  g.translate(sx, sy);
  g.scale(dir, 1);
  if (hurt) g.globalAlpha = 0.6;
  if (m.kind === 'zombie') {
    limb(g, -2 + walk * 2, -9, 4, 9, '#2d3a8c'); limb(g, -2 - walk * 2, -9, 4, 9, '#25317a');
    limb(g, -3, -20, 6, 12, '#2aa5a5');
    limb(g, 0, -19, 9, 3, '#4e8a3a'); // brazos estirados
    limb(g, -4, -28, 8, 8, '#4e8a3a'); limb(g, 1, -25, 2, 2, '#1c2b14'); limb(g, -4, -28, 8, 2, '#33581f');
  } else if (m.kind === 'cow') {
    const c = '#4b3a2e';
    limb(g, -9, -8, 3, 8, c); limb(g, -3, -8, 3, 8, '#3d2f25'); limb(g, 3, -8, 3, 8, c); limb(g, 6, -8, 3, 8, '#3d2f25');
    limb(g, -10, -16, 20, 9, '#5a4636'); limb(g, -6, -15, 5, 4, '#ece6dc'); limb(g, 3, -12, 6, 4, '#ece6dc');
    limb(g, 8, -19, 7, 7, '#5a4636'); limb(g, 13, -16, 3, 3, '#d9c3a8'); limb(g, 11, -17, 1, 1, '#111'); limb(g, 9, -21, 2, 3, '#e8e0d0');
  } else {
    const c = '#e8a0a8';
    limb(g, -7, -5, 3, 5, '#d58a92'); limb(g, 4, -5, 3, 5, '#d58a92');
    limb(g, -8, -11, 16, 8, c); limb(g, 6, -12, 6, 6, c); limb(g, 11, -9, 3, 3, '#f4c0c6'); limb(g, 9, -11, 1, 1, '#111');
  }
  g.restore();
  if (m.hp < def.hp) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(sx - 8, sy - def.h * TILE - 8, 16, 2); g.fillStyle = '#e0434f'; g.fillRect(sx - 8, sy - def.h * TILE - 8, Math.max(0, 16 * m.hp / def.hp), 2); }
}

export function drawDrop(g, it, cam, time) {
  const bob = Math.sin(time * 3 + it.x * 3) * 1.2;
  const px = Math.round(it.x * TILE - cam.x - 4), py = Math.round(it.y * TILE - cam.y - 9 + bob);
  g.drawImage(itemIcon(it.i), px, py, 8, 8);
  if (it.n > 1) { g.fillStyle = '#fff'; g.font = '700 5px Inter, sans-serif'; g.textAlign = 'right'; g.fillText(String(it.n), px + 9, py + 9); }
}

// ─── Partículas y textos flotantes ───────────────────────────────────────────
export function burst(list, x, y, o = {}) {
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 1.5), age: 0, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.7), c: o.colors ? o.colors[i % o.colors.length] : '#fff', s: o.size ?? 2 });
  }
}
export function drawParticles(g, list, cam, dt) {
  for (const p of list) {
    p.age += dt; p.vy += 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    g.globalAlpha = Math.max(0, 1 - p.age / p.life);
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x * TILE - cam.x), Math.round(p.y * TILE - cam.y), p.s, p.s);
  }
  g.globalAlpha = 1;
}
export function drawFloaters(g, list, cam, dt) {
  g.font = '700 7px Inter, sans-serif';
  g.textAlign = 'center';
  for (const f of list) {
    f.age += dt;
    g.globalAlpha = Math.max(0, 1 - f.age / 0.9);
    g.fillStyle = '#000'; g.fillText(f.text, Math.round(f.x * TILE - cam.x) + 1, Math.round((f.y - f.age * 1.2) * TILE - cam.y) + 1);
    g.fillStyle = f.color; g.fillText(f.text, Math.round(f.x * TILE - cam.x), Math.round((f.y - f.age * 1.2) * TILE - cam.y));
  }
  g.globalAlpha = 1;
}

export { dayPhase };
