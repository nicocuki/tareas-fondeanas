// Pixel Royale: el mapa. Lógica pura (sin React, sin red, sin Math.random): la misma semilla arma la
// misma isla en todas las pantallas. Una grilla de casillas de 16 px: agua, arena, pasto, bosque,
// casas con paredes, árboles, rocas y cajas. Árboles, cajas y paredes se rompen a tiros.
import { PLACE_DEFS } from './places.js';

export const TILE = 16;

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, FLOOR: 5, WALL: 6, TREE: 7, ROCK: 8, CRATE: 9, RUBBLE: 10, PLANK: 11, FIELD: 12, LINE: 13, NET: 14, CROP: 15, BWALL: 16, BFLOOR: 17 };
const SOLID = [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0];          // no se camina (agua profunda incluida)
const BLOCKS_SHOT = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0];    // frena las balas (sobre el agua pasan)
export const TILE_HP = { [T.TREE]: 40, [T.CRATE]: 30, [T.WALL]: 110, [T.BWALL]: 90, [T.BFLOOR]: 40 };

// Los dos mapas: uno grande para 10 jugadores y uno chico para 5.
export const MAPS = {
  grande: { id: 'grande', name: 'Isla Grande', emoji: '🏝️', size: 100, buildings: 6, scatter: 22, noise: 0.055, zoneTime: 1, players: 10 },
  chica: { id: 'chica', name: 'Isla Chica', emoji: '⛱️', size: 60, buildings: 2, scatter: 8, noise: 0.09, zoneTime: 0.7, players: 5 },
  // La isla de espera de antes de subir al bus: no se elige, es siempre la misma chiquita.
  espera: { id: 'espera', name: 'Isla de espera', emoji: '🏖️', size: 28, buildings: 0, scatter: 0, noise: 0.14, zoneTime: 1, players: 0, hidden: true },
};
export const MAP_IDS = Object.keys(MAPS).filter((id) => !MAPS[id].hidden);

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
    // Lo construido vuelve a lo que había debajo (pasto, arena, agua…); lo demás deja escombros.
    t.tiles[i] = t.under?.get(i) ?? T.RUBBLE;
    t.under?.delete(i);
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
  const t = { N, W: N * TILE, H: N * TILE, tiles, hp: new Map(), under: new Map(), cfg, seed, buildings: [], places: [], chests: [], plan: null };
  const land = (x, y) => tileAt(t, x, y) >= T.SAND;
  const busy = new Uint8Array(N * N); // lugares y casas (con un margen)

  // Herramientas que usan los lugares con nombre (places.js).
  const set = (x, y, kind) => { if (x > 0 && y > 0 && x < N - 1 && y < N - 1) tiles[y * N + x] = kind; };
  const ctx = {
    T, rng, set, get: (x, y) => tileAt(t, x, y),
    fill: (x, y, w, h, kind) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, kind); },
    ellipse: (cx, cy, rx, ry, fn) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
          if (d <= 1) fn(x, y, d);
        }
      }
    },
    // Tierra firme a la fuerza: pasto adentro y una orilla de arena donde había agua.
    land: (cx, cy, rx, ry) => ctx.ellipse(cx, cy, rx, ry, (x, y, d) => { if (tileAt(t, x, y) < T.SAND) set(x, y, d <= 0.8 ? T.GRASS : T.SAND); }),
    chest: (tx, ty, tier = 1) => {
      if (isSolid(t, tx, ty) || t.chests.some((ch) => ch.tx === tx && ch.ty === ty) || tx < 1 || ty < 1 || tx >= N - 1 || ty >= N - 1) return false;
      t.chests.push({ i: t.chests.length, tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tier });
      return true;
    },
    // Una casa de paredes con una o dos puertas de dos casillas, piso de madera y cofres adentro.
    house: (bx, by, w, h, o = {}) => {
      for (let y = by; y < by + h; y++) {
        for (let x = bx; x < bx + w; x++) set(x, y, x === bx || y === by || x === bx + w - 1 || y === by + h - 1 ? T.WALL : T.FLOOR);
      }
      const first = Math.floor(rng() * 4);
      const sides = [first, (first + 1 + Math.floor(rng() * 3)) % 4];
      for (const side of sides) {
        const horizontal = side < 2;
        const len = horizontal ? w : h;
        const at = 1 + Math.floor(rng() * Math.max(1, len - 3));
        for (let k = 0; k < 2; k++) {
          const x = horizontal ? bx + at + k : side === 2 ? bx : bx + w - 1;
          const y = horizontal ? (side === 0 ? by : by + h - 1) : by + at + k;
          set(x, y, T.FLOOR);
        }
      }
      if (o.crates !== false) {
        for (const [cx, cy] of [[bx + 1, by + 1], [bx + w - 2, by + 1], [bx + 1, by + h - 2], [bx + w - 2, by + h - 2]]) {
          if (rng() < 0.45 && tiles[cy * N + cx] === T.FLOOR) tiles[cy * N + cx] = T.CRATE;
        }
      }
      for (let n = 0, tries = 0; n < (o.chests ?? 0) && tries < 30; tries++) {
        const tx = bx + 1 + Math.floor(rng() * (w - 2)), ty = by + 1 + Math.floor(rng() * (h - 2));
        if (tileAt(t, tx, ty) === T.FLOOR && ctx.chest(tx, ty, o.tier ?? 1)) n++;
      }
      t.buildings.push({ x: bx, y: by, w, h });
    },
  };

  // Lugares con nombre: primero se les abre camino de tierra hasta el centro, después se estampan.
  const spots = PLACE_DEFS.filter((d) => d.pos[mapId]).map((d) => {
    const k = d.k[mapId] ?? 1;
    const [cx, cy] = d.pos[mapId];
    return { d, k, cx, cy, w: Math.max(3, Math.round(d.size[0] * k)), h: Math.max(3, Math.round(d.size[1] * k)) };
  });
  for (const s of spots) {
    if (s.d.center) continue;
    const [ax, ay] = s.d.anchor ? s.d.anchor(s.cx, s.cy, s.k) : [s.cx, s.cy];
    const steps = Math.max(1, Math.ceil(Math.hypot(ax - c, ay - c)));
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(ax + ((c - ax) * i) / steps), py = Math.round(ay + ((c - ay) * i) / steps);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(t, px + dx, py + dy) < T.SAND) set(px + dx, py + dy, T.SAND);
    }
  }
  for (const s of spots) {
    s.d.stamp(ctx, s.cx, s.cy, s.k);
    const place = { id: s.d.id, name: s.d.name, cx: s.cx, cy: s.cy, x: s.cx - (s.w >> 1), y: s.cy - (s.h >> 1), w: s.w, h: s.h };
    t.places.push(place);
    for (let y = place.y - 3; y < place.y + place.h + 3; y++) for (let x = place.x - 3; x < place.x + place.w + 3; x++) if (x >= 0 && y >= 0 && x < N && y < N) busy[y * N + x] = 1;
  }

  // Casas sueltas en los huecos que dejan los lugares.
  let loose = 0;
  for (let tries = 0; tries < 600 && loose < cfg.buildings; tries++) {
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
    ctx.house(bx, by, w, h, { chests: 2, tier: 1 });
    loose++;
  }

  // Bosques, árboles sueltos y rocas.
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

  // Cofres perdidos por el campo (solo hay cofres: nada tirado en el piso).
  for (let k = 0, tries = 0; k < cfg.scatter && tries < 4000; tries++) {
    const tx = 2 + Math.floor(rng() * (N - 4)), ty = 2 + Math.floor(rng() * (N - 4));
    const tile = tileAt(t, tx, ty);
    if (tile !== T.GRASS && tile !== T.FOREST && tile !== T.SAND) continue;
    if (t.chests.some((ch) => Math.hypot(ch.tx - tx, ch.ty - ty) < 4)) continue;
    if (ctx.chest(tx, ty, 1)) k++;
  }
  if (mapId === 'espera') {
    // La isla de espera: unas palmeras y cajas, sin zona.
    for (let n = 0, tries = 0; n < 10 && tries < 200; tries++) {
      const x = 3 + Math.floor(rng() * (N - 6)), y = 3 + Math.floor(rng() * (N - 6));
      if (tileAt(t, x, y) === T.GRASS && Math.hypot(x - c, y - c) > 4) { tiles[y * N + x] = n % 3 ? T.TREE : T.CRATE; n++; }
    }
  }
  // Red de seguridad: un cofre que quedó encerrado entre árboles o rocas no sirve.
  const reach = reachable(t);
  t.chests = t.chests.filter((ch) => reach[ch.ty * N + ch.tx]).map((ch, i) => ({ ...ch, i }));
  t.plan = zonePlan(t, seed);
  return t;
}

// Casillas a las que se llega a pie desde el centro de la isla (a lo ancho y a lo alto).
export function reachable(t) {
  const N = t.N, seen = new Uint8Array(N * N), c = N >> 1;
  let start = null;
  for (let r = 0; r < N && !start; r++) {
    for (let dy = -r; dy <= r && !start; dy++) for (let dx = -r; dx <= r; dx++) if (!isSolid(t, c + dx, c + dy)) { start = [c + dx, c + dy]; break; }
  }
  const stack = start ? [start] : [];
  if (start) seen[start[1] * N + start[0]] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, ny = y + b;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[ny * N + nx] || isSolid(t, nx, ny)) continue;
      seen[ny * N + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  return seen;
}

// ¿En qué lugar con nombre está este punto del mundo (en píxeles)? null si en ninguno.
export function placeAt(t, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (const p of t.places) if (tx >= p.x - 1 && tx <= p.x + p.w && ty >= p.y - 1 && ty <= p.y + p.h) return p;
  return null;
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
