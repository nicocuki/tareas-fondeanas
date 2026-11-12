// Los lugares de La Timba: medidas, obstáculos y qué se puede tocar en cada uno. Sin dibujo ni red (lo usan
// `render3d.js`, `TimbaGame.jsx` y los tests). Medidas en unidades del mundo: una unidad son `UNIT` metros (1,5 cm), así
// una mesa de blackjack de 248 × 140 mide 3,7 × 2,1 m.
//
// Todo se camina en un plano (`x`, `y`): en los pisos y el ascensor `y` es la profundidad de la sala; en la calle (la sala de
// espera y la puerta del casino) `x` va a lo largo de la vereda e `y` es para el lado de la casa (negativo) o de la calle
// (positivo).
import { FLOOR_COUNT, floorOfLoc, locOfFloor } from './casinos.js';
import { NAMES } from './games.js';

export const UNIT = 0.015;       // metros por unidad
export const SPEED = 170;        // caminando…
export const RUN = 1.7;          // …y corriendo (Shift), por cuánto se multiplica
export const PLAYER_R = 8;

// Las mesas y máquinas de cada piso, cada una de a un jugador. `x, y, w, h` es lo que ocupan (nadie lo pisa) y el
// jugador se para del lado +y (`standAt`). Las ids del piso 1 son `bj1`, `slots2`…; las de los demás, `f4-bj1`.
const SIZE = {
  slots: [70, 60], wheel: [110, 60], mwheel: [110, 60],                                  // contra la pared del fondo
  bj: [248, 140], roulette: [220, 110], craps: [220, 110], duck: [200, 110], baccarat: [248, 140],
  crash: [160, 110], penguin: [220, 110], keno: [160, 110], plinko: [140, 150], hilo: [170, 110], mines: [150, 110],
};
const WALL_KINDS = ['slots', 'wheel', 'mwheel'];
// Las mesas grandes se reparten de a una por tipo, en este orden, para que cada zona quede mezclada.
const BIG_ORDER = ['bj', 'roulette', 'craps', 'duck', 'baccarat', 'penguin', 'crash', 'keno', 'plinko', 'hilo', 'mines'];
// Es un juego en primera persona: las salas son grandes y entre mesa y mesa hay pasillos anchos (6 m entre filas y 5 m
// entre una mesa y la de al lado). Cada mesa ocupa el centro de una celda de `CELL_W` × `ROW_GAP`.
const ROW0 = 430;                  // la primera fila de mesas grandes (lejos de las máquinas de la pared del fondo)
const ROW_GAP = 560;               // lo que baja cada fila siguiente (8,4 m)
const CELL_W = 640;                // el ancho de cada celda (9,6 m)
const CELL_X0 = 560;               // el centro de la primera celda (deja libre la entrada del ascensor)
export const MAX_BIG_PER_ROW = 6;
const wideOf = (floor) => (floor === 1 ? 3200 : 4000);
export const STEP_UP = 0.35;       // el escalón más alto que se sube caminando (en metros); más alto hay que buscar la escalera

// Cuántas de cada una hay en cada piso. Del piso 2 en adelante se suman los juegos nuevos (`NEW_MIXES`).
const MIXES = [
  { slots: 4, bj: 4, wheel: 2, roulette: 2, craps: 2, duck: 2 },
  { slots: 4, bj: 4, wheel: 2, roulette: 2, craps: 2, duck: 2 },
  { slots: 6, bj: 3, wheel: 3, roulette: 3, craps: 2, duck: 2 },
  { slots: 5, bj: 4, wheel: 2, roulette: 2, craps: 3, duck: 3 },
];
const NEW_MIXES = [
  {},
  { crash: 1, penguin: 1, keno: 1, plinko: 1, mwheel: 1, baccarat: 1, hilo: 1, mines: 1 },
  { crash: 2, penguin: 1, keno: 1, plinko: 2, mwheel: 1, baccarat: 2, hilo: 2, mines: 1 },
  { crash: 1, penguin: 2, keno: 2, plinko: 1, mwheel: 2, baccarat: 1, hilo: 1, mines: 2 },
];
const mixFor = (n) => ({ ...MIXES[n - 1], ...NEW_MIXES[n - 1] });

const overlaps = (a, b, m = 0) => a.x - m < b.x + b.w && b.x - m < a.x + a.w && a.y - m < b.y + b.h && b.y - m < a.y + a.h;
const rect = (x, y, w, h) => ({ x, y, w, h });

// Lo del medio de cada piso, en una tarima con escaleras adelante y atrás: la barra (1), el escenario con el piano (2),
// las dos fuentes (3) y el salón VIP con la fuente grande (4). El piso 4 tiene además el palco VIP, a 2,4 m, contra la
// pared de enfrente, con una escalera en cada punta.
const DAIS_W = 820; const DAIS_H = 560; const STAIR_W = 260; const STAIR_D = 130;
function centerpiece(n, w, h) {
  const z = { 1: 0.5, 2: 0.9, 3: 0.45, 4: 0.6 }[n];
  const dx = Math.round(w / 2 - DAIS_W / 2); const dy = Math.round(h / 2 - DAIS_H / 2);
  const dais = { ...rect(dx, dy, DAIS_W, DAIS_H), z };
  const sx = Math.round(w / 2 - STAIR_W / 2);
  const stairs = [
    { ...rect(sx, dy + DAIS_H, STAIR_W, STAIR_D), z0: 0, z1: z, up: 'n' },
    { ...rect(sx, dy - STAIR_D, STAIR_W, STAIR_D), z0: 0, z1: z, up: 's' },
  ];
  const levels = [dais];
  const decor = [];
  const cx = w / 2; const cy = h / 2;
  if (n === 1) decor.push({ kind: 'bar', ...rect(cx - 220, cy - 110, 440, 220) });
  if (n === 2) decor.push({ kind: 'piano', ...rect(cx - 90, cy - 170, 180, 120) }, { kind: 'column', ...rect(dx + 40, dy + 40, 40, 40) }, { kind: 'column', ...rect(dx + DAIS_W - 80, dy + 40, 40, 40) });
  if (n === 3) decor.push({ kind: 'fountain', ...rect(cx - 330, cy - 75, 150, 150) }, { kind: 'fountain', ...rect(cx + 180, cy - 75, 150, 150) }, { kind: 'statue', ...rect(cx - 20, cy - 20, 40, 40) });
  if (n === 4) {
    decor.push({ kind: 'fountain', ...rect(cx - 140, cy - 110, 280, 220) });
    // el palco VIP, contra la pared de enfrente (lo de abajo es macizo)
    const bw = 1500; const bx = Math.round(w / 2 - bw / 2);
    levels.push({ ...rect(bx, h - 470, bw, 420), z: 2.4, balcony: true });
    stairs.push({ ...rect(bx - 520, h - 300, 520, 250), z0: 0, z1: 2.4, up: 'e' }, { ...rect(bx + bw, h - 300, 520, 250), z0: 0, z1: 2.4, up: 'w' });
    decor.push({ kind: 'sofa', ...rect(bx + 300, h - 200, 260, 90) }, { kind: 'sofa', ...rect(bx + bw - 560, h - 200, 260, 90) }, { kind: 'statue', ...rect(bx + bw / 2 - 30, h - 220, 60, 60) });
  }
  return { levels, stairs, decor };
}

// Los adornos de las esquinas y las paredes: cuanto más alto el piso, más lujo.
function wallDecor(n, w, h) {
  const corner = { 1: 'plant', 2: 'column', 3: 'statue', 4: 'statue' }[n];
  const out = [[90, 120], [w - 130, 120], [90, h - 130], [w - 130, h - 130]].map(([x, y]) => ({ kind: corner, ...rect(x, y, 40, 40) }));
  const side = { 1: 'plant', 2: 'vase', 3: 'plant', 4: 'vase' }[n];
  for (const y of [h * 0.25, h * 0.75]) out.push({ kind: side, ...rect(w - 130, Math.round(y), 40, 40) });
  return out;
}

// Arma un piso: las máquinas contra la pared del fondo, la tarima del medio y las mesas grandes en celdas con pasillos
// anchos, sin pisar la tarima, sus escaleras ni el palco. Si no entran, la sala se alarga una fila más.
function packFloor(n) {
  const counts = mixFor(n);
  const w = wideOf(n);
  const id = (kind, i) => (n === 1 ? `${kind}${i}` : `f${n}-${kind}${i}`);
  const big = [];
  const pending = BIG_ORDER.map((kind) => ({ kind, left: counts[kind] || 0, made: 0 }));
  while (pending.some((p) => p.left > 0)) {
    for (const p of pending) if (p.left > 0) { p.left -= 1; p.made += 1; big.push({ kind: p.kind, i: p.made }); }
  }
  for (let h = 2400; ; h += ROW_GAP / 2) {
    const center = centerpiece(n, w, h);
    const keepOut = [...center.levels, ...center.stairs];
    const cells = [];
    for (let y = ROW0; y + 140 + 22 + 260 < h; y += ROW_GAP) {
      for (let cx = CELL_X0; cx + 170 < w - 150; cx += CELL_W) {
        const cell = rect(cx - 170, y - 60, 340, 280); // la mesa más grande, con lugar para el croupier y el jugador
        if (!keepOut.some((k) => overlaps(cell, k, 140))) cells.push({ cx, y });
      }
    }
    if (cells.length < big.length) continue;
    // las máquinas van contra la pared del fondo y las mesas en las celdas, fila por fila
    const out = [];
    let x = 520;
    for (const kind of WALL_KINDS) {
      for (let i = 0; i < (counts[kind] || 0); i++) { out.push({ id: id(kind, i + 1), kind, x, y: 70 }); x += kind === 'slots' ? 150 : 290; }
    }
    big.forEach((t, k) => {
      const c = cells[k];
      const [tw] = SIZE[t.kind];
      out.push({ id: id(t.kind, t.i), kind: t.kind, x: Math.round(c.cx - tw / 2), y: c.y });
    });
    return { tables: out, w, h, ...center, decor: [...wallDecor(n, w, h), ...center.decor] };
  }
}

const sized = (list) => list.map((t) => ({ ...t, w: SIZE[t.kind][0], h: SIZE[t.kind][1] }));
const FLOORS = Object.fromEntries(Array.from({ length: FLOOR_COUNT }, (_, i) => {
  const f = packFloor(i + 1);
  return [i + 1, { ...f, tables: sized(f.tables) }];
}));
// Las mesas de cada piso (1 a 4) y cuánto mide cada sala.
export const FLOOR_TABLES = Object.fromEntries(Object.entries(FLOORS).map(([n, f]) => [n, f.tables]));
export const FLOOR_DIMS = Object.fromEntries(Object.entries(FLOORS).map(([n, f]) => [n, { w: f.w, h: f.h }]));
export const floorTables = (n) => FLOOR_TABLES[n] || [];
export const TABLES = Object.values(FLOOR_TABLES).flat();
export const TABLE_BY_ID = Object.fromEntries(TABLES.map((t) => [t.id, t]));
// En qué piso está cada mesa.
export const FLOOR_OF_TABLE = Object.fromEntries(Object.entries(FLOOR_TABLES).flatMap(([n, list]) => list.map((t) => [t.id, Number(n)])));
// Dónde se para el que juega: del lado +y, mirando hacia la mesa.
export const standAt = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h + 22 });
// Los adornos de cada piso (también son obstáculos).
export const DECOR = Object.fromEntries(Object.entries(FLOORS).map(([n, f]) => [n, f.decor]));

// ─── La calle de la casita (sala de espera) ──────────────────────────────────
// Atrás la casa con su porche (con escalones), el jardín, la vereda y la calle, donde están estacionadas la camioneta y
// la limusina. Se camina por todo: el jardín, la vereda y la calle.
const WAIT = {
  kind: 'street', w: 2400,
  house: rect(200, -760, 600, 360),
  porch: { ...rect(250, -400, 500, 110), z: 0.45 },
  van: rect(900, 200, 260, 130),
  limo: rect(1500, 200, 520, 135),     // el frente apunta a +x; la puerta de atrás está del lado de la vereda
  areas: [rect(40, -400, 2320, 1040)],
  spawn: { x: 520, y: -170 },
};
WAIT.levels = [WAIT.porch];
WAIT.stairs = [{ ...rect(420, -290, 160, 70), z0: 0, z1: 0.45, up: 'n' }];
WAIT.blocks = [WAIT.van, WAIT.limo, rect(150, -330, 30, 30), rect(1300, -40, 24, 24), rect(2200, -40, 24, 24)];
WAIT.limoDoor = { x: WAIT.limo.x + 90, y: WAIT.limo.y - 20 };

// ─── La puerta del casino ────────────────────────────────────────────────────
// La limusina deja en la calle de abajo; de ahí una plaza con una fuente, una escalinata de 1,2 m y la terraza con la
// fachada y la puerta giratoria.
const OUTSIDE = {
  kind: 'street', w: 2600,
  limo: rect(200, 300, 520, 135),
  fountain: rect(1150, -460, 300, 300),
  terrace: { ...rect(560, -1300, 1480, 400), z: 1.2 },
  doorX: 1300,
  areas: [rect(40, -1290, 2520, 1880)],
  spawn: { x: 820, y: 240 },
};
OUTSIDE.levels = [OUTSIDE.terrace];
OUTSIDE.stairs = [{ ...rect(1000, -900, 600, 200), z0: 0, z1: 1.2, up: 'n' }];
OUTSIDE.blocks = [OUTSIDE.limo, OUTSIDE.fountain, rect(560, -905, 440, 10), rect(1600, -905, 440, 10), rect(555, -1300, 10, 400), rect(2035, -1300, 10, 400),
  ...[300, 700, 1900, 2300].map((x) => rect(x, -40, 24, 24))];
OUTSIDE.limoDoor = { x: OUTSIDE.limo.x + 90, y: OUTSIDE.limo.y - 20 };

export const SCENES = {
  wait: WAIT,
  outside: OUTSIDE,
  elevator: {
    kind: 'room', w: 420, h: 360,
    areas: [rect(40, 40, 340, 260), rect(150, 296, 120, 40)],
    blocks: [rect(64, 64, 32, 32)],
    door: { x: 150, y: 310, w: 120 },    // al pisar esto desde adentro se sale al piso
    panel: { x: 380, y: 130 },           // la botonera, en la pared de la derecha
    npc: { x: 80, y: 80 },
    spawn: { x: 210, y: 200 },
    levels: [], stairs: [],
  },
};

// Un piso de juego: la sala con el ascensor en la pared de la izquierda, las mesas, la tarima, el palco y los adornos.
function floorScene(n) {
  const f = FLOORS[n];
  const { w, h } = f;
  const dy = h / 2 - 90;
  return {
    kind: 'room', w, h, look: n, floor: n, tables: f.tables, decor: f.decor, levels: f.levels, stairs: f.stairs,
    areas: [rect(60, 70, w - 120, h - 120), rect(20, dy, 44, 180)],
    blocks: [...f.tables, ...f.decor].map(({ x, y, w: bw, h: bh }) => rect(x, y, bw, bh)),
    door: { x: 20, y: dy, w: 180 },     // el ascensor, en la pared de la izquierda
    spawn: { x: 140, y: h / 2 },
  };
}
for (let n = 1; n <= FLOOR_COUNT; n++) SCENES[`f${n}`] = floorScene(n);

// Dentro de la limusina (`limo` en la sala de espera, `back` en la puerta del casino) se está en la escena de afuera.
export const sceneKey = (loc) => (loc === 'limo' ? 'wait' : loc === 'back' ? 'outside' : loc);

// Dónde aparece un jugador al entrar a una escena (`i` = su número, para que no se amontonen).
export function spawnPoint(loc, i = 0) {
  const sc = SCENES[sceneKey(loc)];
  if (!sc) return { x: 0, y: 0 };
  return { x: sc.spawn.x + ((i % 4) - 1.5) * 26, y: sc.spawn.y - Math.floor(i / 4) * 26 };
}

// ─── Alturas ─────────────────────────────────────────────────────────────────
// A qué altura (en metros) está el piso en (x, y): las tarimas, el porche y la terraza son planos y las escaleras suben
// parejo hacia `up` (n: hacia -y, s: hacia +y, e: hacia +x, w: hacia -x).
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function heightAt(scene, x, y) {
  const sc = SCENES[scene];
  if (!sc) return 0;
  let z = 0;
  for (const l of sc.levels || []) if (inRect(l, x, y)) z = Math.max(z, l.z);
  for (const st of sc.stairs || []) {
    if (!inRect(st, x, y)) continue;
    const u = { n: (st.y + st.h - y) / st.h, s: (y - st.y) / st.h, e: (x - st.x) / st.w, w: (st.x + st.w - x) / st.w }[st.up];
    z = Math.max(z, st.z0 + (st.z1 - st.z0) * Math.max(0, Math.min(1, u)));
  }
  return z;
}

// ─── Movimiento ──────────────────────────────────────────────────────────────
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

// ¿Se puede pasar de (x0, y0) a (x1, y1)? Además de entrar, no se puede subir un escalón más alto que `STEP_UP` (el borde de
// una tarima es una pared desde abajo); bajar sí (se salta).
export const canStep = (scene, x0, y0, x1, y1) => canStand(scene, x1, y1) && heightAt(scene, x1, y1) - heightAt(scene, x0, y0) <= STEP_UP;

// Camina en la dirección (dx, dy) del plano, a `speed` unidades por segundo. Se mueve primero en x y después en y: así se
// desliza por las paredes.
export function stepWalk(p, dx, dy, dt, scene, speed = SPEED) {
  const len = Math.hypot(dx, dy);
  p.moving = len > 0;
  if (!len) return;
  const vx = (dx / len) * speed * dt;
  const vy = (dy / len) * speed * dt;
  if (canStep(scene, p.x, p.y, p.x + vx, p.y)) p.x += vx;
  if (canStep(scene, p.x, p.y, p.x, p.y + vy)) p.y += vy;
}

// ─── Qué se puede tocar ──────────────────────────────────────────────────────
// Lo que se toca por cercanía (las mesas y la botonera se tocan con la mano, mirándolas): subir y bajar de la limusina,
// la camioneta y el botones. Devuelve { key, label } o null. `ctx.home`: ya arrancó el día, así que desde la puerta del
// casino se puede subir a la limusina para volver.
const distRect = (r, p) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
export function nearby(loc, p, ctx = {}) {
  if (loc === 'limo') return { key: 'unboard', label: 'Bajar de la limusina' };
  if (loc === 'back') return { key: 'unboardBack', label: 'Bajar de la limusina' };
  const sc = SCENES[loc];
  if (!sc) return null;
  if (loc === 'wait') {
    if (Math.hypot(p.x - sc.limoDoor.x, p.y - sc.limoDoor.y) < 130) return { key: 'board', label: 'Subir a la limusina' };
    if (distRect(sc.van, p) < 90) return { key: 'van', label: 'Mirar la camioneta' };
  }
  if (loc === 'outside' && ctx.home && Math.hypot(p.x - sc.limoDoor.x, p.y - sc.limoDoor.y) < 130) return { key: 'boardBack', label: 'Subir a la limusina y volver a casa' };
  if (loc === 'elevator' && Math.hypot(p.x - sc.npc.x, p.y - sc.npc.y) < 60) return { key: 'npc', label: 'Hablar con el botones' };
  return null;
}

// La mesa o máquina más cercana del piso, a menos de `reach` del borde (o null). Las mesas se juegan tocando sus botones;
// con esto se sabe en cuál está parado cada uno.
export function nearTable(loc, p, reach = 46) {
  const sc = SCENES[loc];
  if (!sc?.tables) return null;
  let best = null;
  for (const t of sc.tables) {
    const d = distRect(t, p);
    if (d < reach && (!best || d < best.d)) best = { d, t };
  }
  return best ? best.t : null;
}

// ¿Pisó la puerta? (entrar al casino, al ascensor o salir de él.) Devuelve el lugar al que va, o null.
export function doorFor(loc, p, floor) {
  const sc = SCENES[loc];
  if (loc === 'outside' && p.y < -1220 && Math.abs(p.x - sc.doorX) < 90) return 'elevator';
  if (loc === 'elevator' && p.y > sc.door.y && p.x > sc.door.x && p.x < sc.door.x + sc.door.w) return locOfFloor(floor);
  if (floorOfLoc(loc) !== null && p.x < 52 && p.y > sc.door.y && p.y < sc.door.y + sc.door.w) return 'elevator';
  return null;
}
