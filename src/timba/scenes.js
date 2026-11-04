// Los lugares de La Timba: medidas, obstáculos y qué se puede tocar en cada uno. Sin dibujo ni red (lo usan
// `render.js`, `TimbaGame.jsx` y los tests). Medidas en unidades del mundo.
//
// Hay dos clases de escena:
// - `side` (la sala de espera y la puerta del casino): vista de costado, solo se camina de izquierda a derecha.
// - `top` (el ascensor y los pisos): vista desde arriba, se camina para todos lados.
export const SPEED_SIDE = 150;
export const SPEED_TOP = 112;
export const PLAYER_R = 8;

export const SIDE_H = 360;      // alto que se ve en las escenas de costado
export const GROUND = 300;      // la línea del piso

export const SCENES = {
  wait: {
    kind: 'side', w: 2600, min: 40, max: 2560,
    house: { x: 40, w: 470 },
    van: { x: 1000, w: 310 },
    limo: { x: 1760, w: 640 },       // el frente apunta a la derecha; la parte de atrás (la puerta) es la izquierda
    spawn: 290,
  },
  outside: {
    kind: 'side', w: 3300, min: 40, max: 3180,
    limo: { x: 30, w: 640 },
    entrance: { x: 2820, w: 440 },
    doorX: 3090,                     // al pasar esta línea se entra al casino
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
    kind: 'top', w: 1600, h: 1000,
    areas: [{ x: 60, y: 70, w: 1480, h: 870 }, { x: 20, y: 440, w: 44, h: 120 }],
    blocks: [
      { x: 676, y: 425, w: 248, h: 140 },   // la mesa de blackjack (de a uno)
      { x: 190, y: 70, w: 1230, h: 52 },    // los tragamonedas contra la pared de arriba
      { x: 296, y: 296, w: 44, h: 44 }, { x: 1260, y: 296, w: 44, h: 44 },
      { x: 296, y: 700, w: 44, h: 44 }, { x: 1260, y: 700, w: 44, h: 44 },  // columnas
      { x: 70, y: 80, w: 40, h: 40 }, { x: 1490, y: 80, w: 40, h: 40 }, { x: 70, y: 890, w: 40, h: 40 }, { x: 1490, y: 890, w: 40, h: 40 }, // plantas
    ],
    door: { x: 20, y: 440, w: 120 },     // el ascensor, en la pared de la izquierda
    table: { x: 800, y: 495, rx: 110, ry: 62 },
    dealer: { x: 800, y: 440 },
    spawn: { x: 120, y: 500 },
  },
};

export const sceneKey = (loc) => (loc === 'limo' ? 'wait' : loc);

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
// Devuelve { key, label } de lo más cercano al jugador (o null). `E` lo usa.
export function nearby(loc, p) {
  if (loc === 'limo') return { key: 'unboard', label: 'Bajar de la limusina' };
  const sc = SCENES[loc];
  if (!sc) return null;
  if (loc === 'wait') {
    if (Math.abs(p.x - (sc.van.x + sc.van.w / 2)) < 190) return { key: 'van', label: 'Mirar la camioneta' };
    if (p.x > sc.limo.x - 90 && p.x < sc.limo.x + 150) return { key: 'board', label: 'Subir a la limusina' };
  }
  if (loc === 'elevator') {
    if (Math.hypot(p.x - sc.panel.x, p.y - sc.panel.y) < 46) return { key: 'panel', label: 'Usar el panel del ascensor' };
    if (Math.hypot(p.x - sc.npc.x, p.y - sc.npc.y) < 46) return { key: 'npc', label: 'Hablar con el botones' };
  }
  if (loc === 'f1') {
    const t = sc.table;
    // Cerca de la mesa, en cualquier lado (la distancia se mide con la misma forma ovalada).
    if (((p.x - t.x) / (t.rx + 70)) ** 2 + ((p.y - t.y) / (t.ry + 70)) ** 2 < 1) return { key: 'bj', label: 'Jugar al blackjack' };
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

// La mesa es de uno solo: la silla está abajo, mirando al croupier.
export function seatPos() {
  const t = SCENES.f1.table;
  return { x: t.x, y: t.y + t.ry + 26 };
}
