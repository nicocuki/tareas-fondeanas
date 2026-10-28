// Pixel Royale: el mapa. Lógica pura (sin React, sin red, sin Math.random): la misma semilla arma la
// misma isla en todas las pantallas. Una grilla de casillas de 16 px: agua, arena, pasto, bosque,
// casas con paredes, árboles, rocas y cajas. Árboles, cajas y paredes se rompen a tiros.
export const TILE = 16;

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, FLOOR: 5, WALL: 6, TREE: 7, ROCK: 8, CRATE: 9, RUBBLE: 10 };
const SOLID = [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0];          // no se camina (agua profunda incluida)
const BLOCKS_SHOT = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0];    // frena las balas (sobre el agua pasan)
export const TILE_HP = { [T.TREE]: 40, [T.CRATE]: 30, [T.WALL]: 110 };

// Los dos mapas: uno grande para 10 jugadores y uno chico para 5.
export const MAPS = {
  grande: { id: 'grande', name: 'Isla Grande', emoji: '🏝️', size: 100, buildings: 15, scatter: 46, noise: 0.055, zoneTime: 1, players: 10 },
  chica: { id: 'chica', name: 'Isla Chica', emoji: '⛱️', size: 60, buildings: 6, scatter: 20, noise: 0.09, zoneTime: 0.7, players: 5 },
};
export const MAP_IDS = Object.keys(MAPS);

// ─── Azar determinístico ────────────────────────────────────────────────────
export function mulberry32(a) {
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2, y * 2, s + 7) * 0.3 + vnoise(x * 4, y * 4, s + 13) * 0.15;

// ─── Consultas ──────────────────────────────────────────────────────────────
export const tileAt = (t, tx, ty) => (tx < 0 || ty < 0 || tx >= t.N || ty >= t.N ? T.DEEP : t.tiles[ty * t.N + tx]);
export const isSolid = (t, tx, ty) => SOLID[tileAt(t, tx, ty)] === 1;
export const blocksShot = (t, tx, ty) => BLOCKS_SHOT[tileAt(t, tx, ty)] === 1;
export const isWalkable = (t, tx, ty) => !isSolid(t, tx, ty) && tileAt(t, tx, ty) !== T.SHALLOW;

// ¿Un círculo (jugador) pisa alguna casilla sólida?
export function circleBlocked(t, x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(t, tx, ty)) continue;
      const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Mueve un círculo por ejes separados: así se desliza por las paredes.
export function moveCircle(t, p, dx, dy, r) {
  if (dx && !circleBlocked(t, p.x + dx, p.y, r)) p.x += dx;
  if (dy && !circleBlocked(t, p.x, p.y + dy, r)) p.y += dy;
}

// Le saca vida a una casilla rompible. Devuelve true si la rompió.
export function damageTile(t, tx, ty, amount) {
  const kind = tileAt(t, tx, ty);
  const max = TILE_HP[kind];
  if (!max) return false;
  const i = ty * t.N + tx;
  const hp = (t.hp.get(i) ?? max) - amount;
  if (hp <= 0) {
    t.hp.delete(i);
    t.tiles[i] = T.RUBBLE;
    return true;
  }
  t.hp.set(i, hp);
  return false;
}

// La casilla caminable más cercana a un punto del mundo (en píxeles).
export function nearestWalkable(t, x, y) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r < t.N; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx, ty = cy + dy;
        if (isWalkable(t, tx, ty) && clearAround(t, tx, ty)) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
    }
  }
  return { x: t.N * TILE / 2, y: t.N * TILE / 2 };
}
// Que no haya nada sólido pegado: si no, alguien aparece trabado entre árboles.
function clearAround(t, tx, ty) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolid(t, tx + dx, ty + dy)) return false;
  return true;
}

// ─── Armado del mapa ────────────────────────────────────────────────────────
export function makeMap(mapId, seed) {
  const cfg = MAPS[mapId] || MAPS.grande;
  const N = cfg.size;
  const tiles = new Uint8Array(N * N);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const c = (N - 1) / 2;
  const sc = cfg.noise;

  // Isla: una mancha redonda deformada con ruido.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - c, y - c) / (N / 2);
      const h = 1.05 - Math.pow(d, 1.7) * 1.15 + (fbm(x * sc, y * sc, seed) - 0.5) * 0.7;
      tiles[y * N + x] = h < 0.18 ? T.DEEP : h < 0.3 ? T.SHALLOW : h < 0.4 ? T.SAND : T.GRASS;
    }
  }
  const t = { N, W: N * TILE, H: N * TILE, tiles, hp: new Map(), cfg, seed, buildings: [], plan: null };
  const land = (x, y) => tileAt(t, x, y) >= T.SAND;
  const busy = new Uint8Array(N * N); // casas (con un margen)

  // Casas: rectángulos de pared con una o dos puertas, piso de madera y unas cajas en las esquinas.
  const wanted = cfg.buildings;
  for (let tries = 0; tries < 600 && t.buildings.length < wanted; tries++) {
    const w = 5 + Math.floor(rng() * 4), h = 5 + Math.floor(rng() * 3);
    const bx = 3 + Math.floor(rng() * (N - w - 6)), by = 3 + Math.floor(rng() * (N - h - 6));
    let ok = true;
    for (let y = by - 2; y < by + h + 2 && ok; y++) {
      for (let x = bx - 2; x < bx + w + 2; x++) {
        if (!land(x, y) || tileAt(t, x, y) === T.SAND || busy[y * N + x]) { ok = false; break; }
      }
    }
    if (!ok) continue;
    for (let y = by - 2; y < by + h + 2; y++) for (let x = bx - 2; x < bx + w + 2; x++) busy[y * N + x] = 1;
    for (let y = by; y < by + h; y++) {
      for (let x = bx; x < bx + w; x++) {
        const edge = x === bx || y === by || x === bx + w - 1 || y === by + h - 1;
        tiles[y * N + x] = edge ? T.WALL : T.FLOOR;
      }
    }
    // Puertas de dos casillas en dos lados distintos.
    const first = Math.floor(rng() * 4);
    const sides = [first, (first + 1 + Math.floor(rng() * 3)) % 4];
    for (const side of sides) {
      const horizontal = side < 2;
      const len = horizontal ? w : h;
      const at = 1 + Math.floor(rng() * (len - 3));
      for (let k = 0; k < 2; k++) {
        const x = horizontal ? bx + at + k : side === 2 ? bx : bx + w - 1;
        const y = horizontal ? (side === 0 ? by : by + h - 1) : by + at + k;
        tiles[y * N + x] = T.FLOOR;
      }
    }
    for (const [cx, cy] of [[bx + 1, by + 1], [bx + w - 2, by + 1], [bx + 1, by + h - 2], [bx + w - 2, by + h - 2]]) {
      if (rng() < 0.45 && tiles[cy * N + cx] === T.FLOOR) tiles[cy * N + cx] = T.CRATE;
    }
    t.buildings.push({ x: bx, y: by, w, h });
  }

  // Bosques, árboles sueltos, rocas y alguna caja tirada.
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (busy[i] || tiles[i] === T.FLOOR || tiles[i] === T.WALL) continue;
      const kind = tiles[i];
      if (kind !== T.GRASS && kind !== T.SAND) continue;
      if (kind === T.GRASS) {
        const forest = fbm(x * sc * 1.8 + 50, y * sc * 1.8 + 50, seed + 99);
        if (forest > 0.58) { tiles[i] = T.FOREST; if (rng() < 0.36) tiles[i] = T.TREE; continue; }
        if (rng() < 0.03) { tiles[i] = T.TREE; continue; }
      }
      const rocky = fbm(x * sc * 2.2, y * sc * 2.2, seed + 5);
      if (rocky > 0.66 && rng() < 0.4) tiles[i] = T.ROCK;
      else if (kind === T.GRASS && rng() < 0.004) tiles[i] = T.CRATE;
    }
  }
  t.plan = zonePlan(t, seed);
  return t;
}

// ─── La zona (la tormenta que se achica) ────────────────────────────────────
// Cada fase espera, achica el círculo y deja otro más chico adentro. `dps` es el daño por segundo
// a los que quedan afuera.
export const PHASES = [
  { wait: 45, shrink: 30, r: 0.62, dps: 1.5 },
  { wait: 35, shrink: 25, r: 0.4, dps: 2.5 },
  { wait: 30, shrink: 20, r: 0.24, dps: 4 },
  { wait: 25, shrink: 18, r: 0.12, dps: 6 },
  { wait: 20, shrink: 15, r: 0.03, dps: 9 },
];

function zonePlan(t, seed) {
  const rng = mulberry32(seed ^ 0x3c6ef372);
  const R0 = t.W / 2 * 0.95;
  const plan = [];
  let prev = { cx: t.W / 2, cy: t.H / 2, r: R0 };
  for (const ph of PHASES) {
    const r = R0 * ph.r;
    const a = rng() * Math.PI * 2;
    const d = rng() * Math.max(0, prev.r - r) * 0.85;
    prev = { cx: prev.cx + Math.cos(a) * d, cy: prev.cy + Math.sin(a) * d, r };
    plan.push(prev);
  }
  return plan;
}

// Dónde está la zona `elapsed` segundos después de empezar. `speed` la apura (1 = normal).
export function zoneAt(t, elapsed, speed = 1) {
  const ts = t.cfg.zoneTime / speed;
  let cur = { cx: t.W / 2, cy: t.H / 2, r: t.W / 2 * 0.95 };
  let time = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const ph = PHASES[i], target = t.plan[i];
    const wait = ph.wait * ts, shrink = ph.shrink * ts;
    if (elapsed < time + wait) return { ...cur, state: 'wait', left: time + wait - elapsed, next: target, phase: i, dps: i > 0 ? PHASES[i - 1].dps : 1 };
    if (elapsed < time + wait + shrink) {
      const k = (elapsed - time - wait) / shrink;
      return {
        cx: cur.cx + (target.cx - cur.cx) * k, cy: cur.cy + (target.cy - cur.cy) * k, r: cur.r + (target.r - cur.r) * k,
        state: 'shrink', left: time + wait + shrink - elapsed, next: target, phase: i, dps: ph.dps,
      };
    }
    time += wait + shrink;
    cur = target;
  }
  return { ...cur, state: 'final', left: 0, next: cur, phase: PHASES.length, dps: PHASES[PHASES.length - 1].dps };
}
