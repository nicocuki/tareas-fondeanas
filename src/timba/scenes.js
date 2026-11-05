// Los lugares de La Timba: medidas, obstáculos y qué se puede tocar en cada uno. Sin dibujo ni red (lo usan
// `render.js`, `TimbaGame.jsx` y los tests). Medidas en unidades del mundo.
//
// Hay dos clases de escena:
// - `side` (la sala de espera y la puerta del casino): vista de costado, solo se camina de izquierda a derecha.
// - `top` (el ascensor y los pisos): vista desde arriba, se camina para todos lados.
import { FLOOR_COUNT, casinoOfFloor, floorOfLoc, locOfFloor } from './casinos.js';
import { NAMES } from './games.js';

export const SPEED_SIDE = 190;
export const SPEED_TOP = 160;
export const PLAYER_R = 8;

export const SIDE_H = 360;      // alto que se ve en las escenas de costado
export const GROUND = 300;      // la línea del piso

// Las mesas y máquinas de cada piso, cada una de a un jugador. `x, y, w, h` es lo que ocupan (nadie lo pisa) y el
// jugador se para abajo (`standAt`). Las ids del piso 1 son `bj1`, `slots2`…; las de los demás, `f4-bj1`.
const SIZE = {
  slots: [70, 60], wheel: [110, 60], mwheel: [110, 60],                                  // contra la pared de arriba
  bj: [248, 140], roulette: [220, 110], craps: [220, 110], duck: [200, 110], baccarat: [248, 140],
  crash: [160, 110], penguin: [220, 110], keno: [160, 110], plinko: [140, 150], hilo: [170, 110], mines: [150, 110],
};
const WALL_KINDS = ['slots', 'wheel', 'mwheel'];
// Las mesas grandes se reparten de a una por tipo, en este orden, para que cada fila quede mezclada.
const BIG_ORDER = ['bj', 'roulette', 'craps', 'duck', 'baccarat', 'penguin', 'crash', 'keno', 'plinko', 'hilo', 'mines'];
const ROW0 = 260;                  // la primera fila de mesas grandes…
const ROW_GAP = 380;               // …y lo que baja cada fila siguiente
const BIG_X0 = 200;                // las mesas de una fila se reparten, parejas, desde acá…
const wideOf = (casino) => (casino === 1 ? 1900 : 2500); // el casino 1 es una sala chica; del 2 en adelante son más grandes
const bigX1 = (w) => w - 140;      // …hasta acá
export const MAX_BIG_PER_ROW = 6;  // en la sala chica
const maxPerRow = (w) => (w <= 1900 ? MAX_BIG_PER_ROW : 9);
const rowY = (r) => ROW0 + r * ROW_GAP;

// El piso 1 es el de siempre, armado a mano. Los demás salen de cuántas hay de cada una (`packFloor`).
const FLOOR1 = [
  ...[240, 330, 420, 510].map((x, i) => ({ id: `slots${i + 1}`, kind: 'slots', x, y: 70 })),
  { id: 'wheel1', kind: 'wheel', x: 880, y: 70 },
  { id: 'wheel2', kind: 'wheel', x: 1060, y: 70 },
  { id: 'bj1', kind: 'bj', x: 200, y: 260 },
  { id: 'bj2', kind: 'bj', x: 480, y: 260 },
  { id: 'bj3', kind: 'bj', x: 200, y: 640 },
  { id: 'bj4', kind: 'bj', x: 480, y: 640 },
  { id: 'roulette1', kind: 'roulette', x: 820, y: 300 },
  { id: 'roulette2', kind: 'roulette', x: 1220, y: 300 },
  { id: 'craps1', kind: 'craps', x: 820, y: 640 },
  { id: 'craps2', kind: 'craps', x: 1220, y: 640 },
  { id: 'duck1', kind: 'duck', x: 1560, y: 250 },
  { id: 'duck2', kind: 'duck', x: 1560, y: 640 },
];
// Cuántas de cada una en los otros pisos: el 1.º, 2.º y 3.º piso de cada casino tienen su propio reparto. Del casino 2 en
// adelante se suman los juegos nuevos (`NEW_MIXES`).
const MIXES = [
  { slots: 4, bj: 4, wheel: 2, roulette: 2, craps: 2, duck: 2 },
  { slots: 6, bj: 3, wheel: 3, roulette: 3, craps: 2, duck: 2 },
  { slots: 5, bj: 4, wheel: 2, roulette: 2, craps: 3, duck: 3 },
];
const NEW_MIXES = [
  { crash: 1, penguin: 1, keno: 1, plinko: 1, mwheel: 1, baccarat: 1 },
  { crash: 2, penguin: 1, keno: 1, plinko: 2, mwheel: 1, baccarat: 2 },
  { crash: 1, penguin: 2, keno: 2, plinko: 1, mwheel: 2, baccarat: 1 },
];
const mixFor = (n) => ({ ...MIXES[(n - 1) % 3], ...(casinoOfFloor(n) > 1 ? NEW_MIXES[(n - 1) % 3] : {}) });

// Reparte las máquinas chicas en la pared de arriba y las mesas grandes en filas, parejas y sin pisarse. Devuelve las mesas
// y el tamaño de la sala (más filas, más alta).
function packFloor(n, counts) {
  const casino = casinoOfFloor(n);
  const w = wideOf(casino);
  const out = [];
  const add = (kind, i, x, y) => out.push({ id: `f${n}-${kind}${i}`, kind, x, y });
  let x = 240;
  for (const kind of WALL_KINDS) {
    for (let i = 0; i < (counts[kind] || 0); i++) { add(kind, i + 1, x, 70); x += kind === 'slots' ? 90 : 180; }
    if (kind === 'slots') x = Math.max(880, x + 20);
  }
  // las grandes, repartidas de a una por tipo para que cada fila quede mezclada
  const pending = BIG_ORDER.map((kind) => ({ kind, left: counts[kind] || 0, made: 0 }));
  const big = [];
  while (pending.some((p) => p.left > 0)) {
    for (const p of pending) if (p.left > 0) { p.left -= 1; p.made += 1; big.push({ kind: p.kind, i: p.made }); }
  }
  const rows = Math.max(2, Math.ceil(big.length / maxPerRow(w)));
  const perRow = Math.ceil(big.length / rows);
  for (let r = 0; r < rows; r++) {
    const row = big.slice(r * perRow, (r + 1) * perRow);
    if (!row.length) continue;
    const total = row.reduce((sum, t) => sum + SIZE[t.kind][0], 0);
    const gap = row.length > 1 ? (bigX1(w) - BIG_X0 - total) / (row.length - 1) : 0;
    let bx = BIG_X0;
    for (const t of row) { add(t.kind, t.i, Math.round(bx), rowY(r)); bx += SIZE[t.kind][0] + gap; }
  }
  return { tables: out, w, h: 1000 + (rows - 2) * ROW_GAP };
}

const sized = (list) => list.map((t) => ({ ...t, w: SIZE[t.kind][0], h: SIZE[t.kind][1] }));
const FLOORS = Object.fromEntries(Array.from({ length: FLOOR_COUNT }, (_, i) => {
  const n = i + 1;
  const f = n === 1 ? { tables: FLOOR1, w: 1900, h: 1000 } : packFloor(n, mixFor(n));
  return [n, { tables: sized(f.tables), w: f.w, h: f.h }];
}));
// Las mesas de cada piso (1 a 12) y cuánto mide cada sala.
export const FLOOR_TABLES = Object.fromEntries(Object.entries(FLOORS).map(([n, f]) => [n, f.tables]));
export const FLOOR_DIMS = Object.fromEntries(Object.entries(FLOORS).map(([n, f]) => [n, { w: f.w, h: f.h }]));
export const floorTables = (n) => FLOOR_TABLES[n] || [];
export const TABLES = Object.values(FLOOR_TABLES).flat();
export const TABLE_BY_ID = Object.fromEntries(TABLES.map((t) => [t.id, t]));
// En qué piso está cada mesa.
export const FLOOR_OF_TABLE = Object.fromEntries(Object.entries(FLOOR_TABLES).flatMap(([n, list]) => list.map((t) => [t.id, Number(n)])));
// Dónde se para el que juega: abajo de la mesa, mirando hacia ella.
export const standAt = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h + 22 });
export const SEAT_FACE = -Math.PI / 2; // mira hacia arriba, a la mesa

export const SCENES = {
  wait: {
    kind: 'side', w: 1500, min: 40, max: 1460,
    house: { x: 40, w: 400 },
    van: { x: 560, w: 260 },
    limo: { x: 960, w: 520 },        // el frente apunta a la derecha; la parte de atrás (la puerta) es la izquierda
    spawn: 250,
  },
  outside: {
    kind: 'side', w: 1400, min: 40, max: 1360,
    limo: { x: 30, w: 520 },
    entrance: { x: 880, w: 440 },
    doorX: 1100,                     // al pasar esta línea se entra al casino
    spawn: 70,                       // salen por la parte de atrás de la limusina, a la izquierda
  },
  elevator: {
    kind: 'top', w: 300, h: 250,
    areas: [{ x: 30, y: 30, w: 240, h: 192 }, { x: 128, y: 218, w: 44, h: 30 }],
    blocks: [{ x: 46, y: 46, w: 26, h: 26 }],
    door: { x: 128, y: 232, w: 44 },     // al pisar esto desde adentro se sale al piso
    panel: { x: 238, y: 44 },
    npc: { x: 59, y: 59 },
    spawn: { x: 150, y: 190 },
  },
};

// Lo que adorna cada casino (también son obstáculos): cuanto más avanzás, más lujo. Esquinas, vasos y estatuas de 40 × 40
// y fuentes más grandes; nada de esto tapa un lugar donde se para un jugador (hay un test que lo revisa).
const corners = (kind, w, h) => [[70, 80], [w - 110, 80], [70, h - 110], [w - 110, h - 110]].map(([x, y]) => ({ kind, x, y, w: 40, h: 40 }));
export function decorFor(casino, w, h) {
  const low = (kind, k) => ({ kind, x: Math.round(w * k), y: h - 110, w: 40, h: 40 }); // contra la pared de abajo
  if (casino === 2) return [...corners('column', w, h), low('vase', 0.37), low('vase', 0.61)];
  if (casino === 3) return [...corners('statue', w, h), { kind: 'fountain', x: Math.round(w * 0.26), y: h - 150, w: 120, h: 90 }, { kind: 'fountain', x: Math.round(w * 0.67), y: h - 150, w: 120, h: 90 }];
  if (casino === 4) return [...corners('statue', w, h), { kind: 'fountain', x: Math.round(w / 2 - 70), y: 450, w: 140, h: 130 }, low('statue', 0.37), low('statue', 0.61)];
  return corners('plant', w, h);
}
export const DECOR = Object.fromEntries([1, 2, 3, 4].map((c) => [c, decorFor(c, wideOf(c), 1000)]));

// Un piso de juego: la sala con el ascensor en la pared de la izquierda, las mesas del piso y la decoración de su casino.
function floorScene(n) {
  const casino = casinoOfFloor(n);
  const { w, h } = FLOOR_DIMS[n];
  const tables = floorTables(n);
  const decor = decorFor(casino, w, h);
  return {
    kind: 'top', w, h, casino, floor: n, tables, decor,
    areas: [{ x: 60, y: 70, w: w - 120, h: h - 120 }, { x: 20, y: h / 2 - 60, w: 44, h: 120 }],
    blocks: [...tables, ...decor].map(({ x, y, w: bw, h: bh }) => ({ x, y, w: bw, h: bh })),
    door: { x: 20, y: h / 2 - 60, w: 120 },     // el ascensor, en la pared de la izquierda
    spawn: { x: 120, y: h / 2 },
  };
}
for (let n = 1; n <= FLOOR_COUNT; n++) SCENES[`f${n}`] = floorScene(n);

// Dentro de la limusina (`limo` en la sala de espera, `back` en la puerta del casino) se ve la escena de afuera.
export const sceneKey = (loc) => (loc === 'limo' ? 'wait' : loc === 'back' ? 'outside' : loc);

// Dónde aparece un jugador al entrar a una escena (`i` = su número, para que no se amontonen).
export function spawnPoint(loc, i = 0) {
  const sc = SCENES[sceneKey(loc)];
  if (!sc) return { x: 0, y: 0 };
  if (sc.kind === 'side') return { x: sc.spawn + (i % 4) * 22, y: GROUND };
  return { x: sc.spawn.x + ((i % 4) - 1.5) * 18, y: sc.spawn.y - Math.floor(i / 4) * 18 };
}

// ─── Movimiento ──────────────────────────────────────────────────────────────
export function stepSide(p, dir, dt, scene) {
  const sc = SCENES[scene];
  p.x = Math.max(sc.min, Math.min(sc.max, p.x + dir * SPEED_SIDE * dt));
  p.y = GROUND;
  p.moving = dir !== 0;
  if (dir) p.face = dir;
}

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const hitsRect = (r, x, y, rad) => x > r.x - rad && x < r.x + r.w + rad && y > r.y - rad && y < r.y + r.h + rad;

// ¿Entra el círculo del jugador en ese lugar? Cuatro puntos del borde y el centro tienen que estar en alguna zona
// caminable y el círculo no puede tocar ningún obstáculo.
export function canStand(scene, x, y) {
  const sc = SCENES[scene];
  const r = PLAYER_R;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (!sc.areas.some((a) => inRect(a, x + dx, y + dy))) return false;
  }
  return !sc.blocks.some((b) => hitsRect(b, x, y, r - 1));
}

// Se mueve primero en x y después en y: así se desliza por las paredes.
export function stepTop(p, dx, dy, dt, scene) {
  const len = Math.hypot(dx, dy);
  p.moving = len > 0;
  if (!len) return;
  const vx = (dx / len) * SPEED_TOP * dt;
  const vy = (dy / len) * SPEED_TOP * dt;
  if (canStand(scene, p.x + vx, p.y)) p.x += vx;
  if (canStand(scene, p.x, p.y + vy)) p.y += vy;
  p.face = Math.atan2(dy, dx);
}

// ─── Qué se puede tocar ──────────────────────────────────────────────────────
// Devuelve { key, label } de lo más cercano al jugador (o null). `E` lo usa. `ctx.home`: ya se entró al casino, así
// que desde la puerta se puede subir a la limusina para volver.
export function nearby(loc, p, ctx = {}) {
  if (loc === 'limo') return { key: 'unboard', label: 'Bajar de la limusina' };
  if (loc === 'back') return { key: 'unboardBack', label: 'Bajar de la limusina' };
  const sc = SCENES[loc];
  if (!sc) return null;
  if (loc === 'wait') {
    if (Math.abs(p.x - (sc.van.x + sc.van.w / 2)) < 170) return { key: 'van', label: 'Mirar la camioneta' };
    if (p.x > sc.limo.x - 90 && p.x < sc.limo.x + 150) return { key: 'board', label: 'Subir a la limusina' };
  }
  if (loc === 'outside' && ctx.home && p.x < sc.limo.x + sc.limo.w + 40) return { key: 'boardBack', label: 'Subir a la limusina y volver a casa' };
  if (loc === 'elevator') {
    if (Math.hypot(p.x - sc.panel.x, p.y - sc.panel.y) < 46) return { key: 'panel', label: 'Usar el panel del ascensor' };
    if (Math.hypot(p.x - sc.npc.x, p.y - sc.npc.y) < 46) return { key: 'npc', label: 'Hablar con el botones' };
  }
  if (floorOfLoc(loc) !== null) {
    // La mesa o máquina más cercana, a menos de 46 del borde.
    let best = null;
    for (const t of sc.tables) {
      const d = Math.hypot(Math.max(t.x - p.x, 0, p.x - (t.x + t.w)), Math.max(t.y - p.y, 0, p.y - (t.y + t.h)));
      if (d < 46 && (!best || d < best.d)) best = { d, t };
    }
    if (best) return { key: `t:${best.t.id}`, label: `Jugar: ${NAMES[best.t.kind]}` };
  }
  return null;
}

// ¿Pisó la puerta? (entrar al casino, al ascensor o salir de él.) Devuelve el lugar al que va, o null.
export function doorFor(loc, p, floor) {
  const sc = SCENES[loc];
  if (loc === 'outside' && p.x >= sc.doorX) return 'elevator';
  if (loc === 'elevator' && p.y > sc.door.y && p.x > sc.door.x && p.x < sc.door.x + sc.door.w) return locOfFloor(floor);
  if (floorOfLoc(loc) !== null && p.x < 52 && p.y > sc.door.y && p.y < sc.door.y + sc.door.w) return 'elevator';
  return null;
}
