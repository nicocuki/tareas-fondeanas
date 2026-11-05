// Los lugares de La Timba: medidas, obstáculos y qué se puede tocar en cada uno. Sin dibujo ni red (lo usan
// `render.js`, `TimbaGame.jsx` y los tests). Medidas en unidades del mundo.
//
// Hay dos clases de escena:
// - `side` (la sala de espera y la puerta del casino): vista de costado, solo se camina de izquierda a derecha.
// - `top` (el ascensor y los pisos): vista desde arriba, se camina para todos lados.
import { NAMES } from './games.js';

export const SPEED_SIDE = 190;
export const SPEED_TOP = 160;
export const PLAYER_R = 8;

export const SIDE_H = 360;      // alto que se ve en las escenas de costado
export const GROUND = 300;      // la línea del piso

// Las mesas y máquinas del piso 1, cada una de a un jugador. `x, y, w, h` es lo que ocupan (nadie lo pisa) y el
// jugador se para abajo (`standAt`). Hay 4 tragamonedas y 4 de blackjack, y 2 de cada uno de los demás.
export const TABLES = [
  ...[240, 330, 420, 510].map((x, i) => ({ id: `slots${i + 1}`, kind: 'slots', x, y: 70, w: 70, h: 60 })),
  { id: 'wheel1', kind: 'wheel', x: 880, y: 70, w: 110, h: 60 },
  { id: 'wheel2', kind: 'wheel', x: 1060, y: 70, w: 110, h: 60 },
  { id: 'bj1', kind: 'bj', x: 200, y: 260, w: 248, h: 140 },
  { id: 'bj2', kind: 'bj', x: 480, y: 260, w: 248, h: 140 },
  { id: 'bj3', kind: 'bj', x: 200, y: 640, w: 248, h: 140 },
  { id: 'bj4', kind: 'bj', x: 480, y: 640, w: 248, h: 140 },
  { id: 'roulette1', kind: 'roulette', x: 820, y: 300, w: 220, h: 110 },
  { id: 'roulette2', kind: 'roulette', x: 1220, y: 300, w: 220, h: 110 },
  { id: 'craps1', kind: 'craps', x: 820, y: 640, w: 220, h: 110 },
  { id: 'craps2', kind: 'craps', x: 1220, y: 640, w: 220, h: 110 },
  { id: 'duck1', kind: 'duck', x: 1560, y: 250, w: 200, h: 110 },
  { id: 'duck2', kind: 'duck', x: 1560, y: 640, w: 200, h: 110 },
];
export const TABLE_BY_ID = Object.fromEntries(TABLES.map((t) => [t.id, t]));
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
  f1: {
    kind: 'top', w: 1900, h: 1000,
    areas: [{ x: 60, y: 70, w: 1780, h: 880 }, { x: 20, y: 440, w: 44, h: 120 }],
    // Las mesas y máquinas (`TABLES`) más las plantas de las esquinas.
    blocks: [
      ...TABLES.map(({ x, y, w, h }) => ({ x, y, w, h })),
      { x: 70, y: 80, w: 40, h: 40 }, { x: 1790, y: 80, w: 40, h: 40 }, { x: 70, y: 890, w: 40, h: 40 }, { x: 1790, y: 890, w: 40, h: 40 },
    ],
    door: { x: 20, y: 440, w: 120 },     // el ascensor, en la pared de la izquierda
    spawn: { x: 120, y: 500 },
  },
};

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
  if (loc === 'f1') {
    // La mesa o máquina más cercana, a menos de 46 del borde.
    let best = null;
    for (const t of TABLES) {
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
  if (loc === 'elevator' && p.y > sc.door.y && p.x > sc.door.x && p.x < sc.door.x + sc.door.w) return floor === 0 ? 'outside' : `f${floor}`;
  if (loc === 'f1' && p.x < 52 && p.y > sc.door.y && p.y < sc.door.y + sc.door.w) return 'elevator';
  return null;
}
