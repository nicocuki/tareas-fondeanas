// Bombardero: el movimiento, las bombas, el fuego, la patada y las calaveras. Lógica pura: todo lo que
// necesita (tablero, bombas, hora) entra por parámetro, así se prueba con valores fijos y todas las
// pantallas calculan lo mismo a partir de los mismos eventos.
//
// Las posiciones van en casillas (números con coma): el centro de la casilla (x, y) es (x + 0,5, y + 0,5).
import { FLOOR, HARD, PRESSED, SOFT, ITEMS, idx, itemAt } from './map.js';

export const STEP = 1 / 60;
export const FUSE = 2.4;          // segundos hasta que explota una bomba
export const SHORT_FUSE = 1.0;    // con la enfermedad de la mecha corta
export const FIRE_TIME = 0.55;    // cuánto dura el fuego
export const KICK_SPEED = 7;      // casillas por segundo de una bomba pateada
export const HALF = 0.36;         // mitad del lado de la caja de choque del jugador
export const VEST_TIME = 10;      // segundos de chaleco
export const SKULL_TIME = 12;     // segundos de enfermedad
export const CONTAGION_GAP = 1;   // después de curarse, un segundo sin contagiarse
export const BASE = { fire: 2, bombs: 1, speed: 0 };
export const MAX_FIRE = 9;
export const MAX_BOMBS = 8;
export const MAX_SPEED = 6;
export const COUNTDOWN_MS = 3500;  // «¿Listos?» antes de cada ronda
export const HURRY_S = 45;         // cuántos segundos antes del final empiezan a caer los bloques
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // arriba, derecha, abajo, izquierda

export const speedFor = (level) => 3.2 + Math.min(MAX_SPEED, level) * 0.55; // casillas por segundo

// Las enfermedades de la calavera: una al azar al agarrarla, y se contagian al tocarse.
export const SKULLS = {
  slow: { name: 'Lentitud', info: 'Caminás arrastrándote.' },
  fast: { name: 'Taquicardia', info: 'Caminás tan rápido que no te controlás.' },
  reverse: { name: 'Controles al revés', info: 'Las teclas van para el lado contrario.' },
  nobomb: { name: 'Sin bombas', info: 'No podés poner bombas.' },
  autobomb: { name: 'Bombas sueltas', info: 'Ponés bombas sin parar, quieras o no.' },
  shortfuse: { name: 'Mecha corta', info: 'Tus bombas explotan enseguida.' },
  tinyfire: { name: 'Fuego chiquito', info: 'Tus bombas apenas explotan.' },
};
export const SKULL_LIST = Object.keys(SKULLS);

// ─── Lo que tiene cada uno ──────────────────────────────────────────────────
// Sale de lo que la sala anotó que agarró (`took`: casilla → jugador) y de la semilla: no viaja por la red.
export function statsFor(seed, took, playerId, skulls = true) {
  const s = { fire: BASE.fire, bombs: BASE.bombs, speed: BASE.speed, kick: false, pierce: false, remote: false, full: false };
  for (const [cell, who] of Object.entries(took || {})) {
    if (who !== playerId) continue;
    const kind = itemAt(seed, Number(cell), skulls);
    if (kind === 'fire') s.fire += 1;
    else if (kind === 'bomb') s.bombs += 1;
    else if (kind === 'speed') s.speed += 1;
    else if (kind === 'kick') s.kick = true;
    else if (kind === 'pierce') s.pierce = true;
    else if (kind === 'remote') s.remote = true;
    else if (kind === 'fullfire') s.full = true;
  }
  s.fire = s.full ? MAX_FIRE : Math.min(MAX_FIRE, s.fire);
  s.bombs = Math.min(MAX_BOMBS, s.bombs);
  s.speed = Math.min(MAX_SPEED, s.speed);
  return s;
}

// Lo que vale ahora, con la enfermedad que tenga.
export function effective(stats, p, now) {
  const sick = p.skull && now < p.skullUntil ? p.skull : null;
  return {
    fire: sick === 'tinyfire' ? 1 : stats.fire,
    bombs: sick === 'nobomb' ? 0 : stats.bombs,
    speed: sick === 'slow' ? 1.6 : sick === 'fast' ? 9 : speedFor(stats.speed),
    fuse: sick === 'shortfuse' ? SHORT_FUSE : FUSE,
    reverse: sick === 'reverse',
    auto: sick === 'autobomb',
    kick: stats.kick, pierce: stats.pierce, remote: stats.remote, sick,
  };
}

// ─── El jugador ─────────────────────────────────────────────────────────────
export function newPlayer(cx, cy) {
  return { x: cx + 0.5, y: cy + 0.5, dir: 2, moving: false, dead: false, onBomb: null, walked: 0, vestUntil: 0, skull: null, skullUntil: 0, curedAt: 0, axis: 'x' };
}
export const cellOf = (W, p) => idx(W, Math.floor(p.x), Math.floor(p.y));

// ¿La casilla (x, y) frena al jugador `p`? Las bombas frenan, salvo la que tiene abajo (hasta que la deja).
export function blocked(board, bombs, p, x, y) {
  const { W, H } = board;
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const i = idx(W, x, y);
  const c = board.cells[i];
  if (c !== FLOOR) return true;
  if (bombs.has(i) && p.onBomb !== i) return true;
  return false;
}
function boxBlocked(board, bombs, p, x, y) {
  const h = HALF - 0.001;
  return blocked(board, bombs, p, Math.floor(x - h), Math.floor(y - h)) || blocked(board, bombs, p, Math.floor(x + h), Math.floor(y - h))
    || blocked(board, bombs, p, Math.floor(x - h), Math.floor(y + h)) || blocked(board, bombs, p, Math.floor(x + h), Math.floor(y + h));
}

// Mueve al jugador. `ax`, `ay` ∈ {-1, 0, 1}: Bomberman se mueve en una sola dirección a la vez. Mientras
// camina se va acomodando al centro del pasillo (como en el original), y eso mismo lo ayuda a doblar: si
// apretó un poco antes de la esquina, se corre hasta el pasillo y pasa. Devuelve la dirección de una
// bomba que está empujando (para patearla) o -1.
export function stepPlayer(p, ax, ay, dt, board, bombs, speed) {
  if (ax && ay) { if (p.axis === 'x') ay = 0; else ax = 0; } else if (ax) p.axis = 'x'; else if (ay) p.axis = 'y';
  p.moving = Boolean(ax || ay);
  if (!p.moving) return -1;
  p.dir = ay < 0 ? 0 : ax > 0 ? 1 : ay > 0 ? 2 : 3;
  const dist = speed * dt;
  const x0 = p.x, y0 = p.y;
  if (ax) {
    const nx = p.x + ax * dist;
    if (!boxBlocked(board, bombs, p, nx, p.y)) p.x = nx;
    else p.x = ax > 0 ? Math.floor(nx + HALF) - HALF : Math.ceil(nx - HALF) + HALF; // pegado a lo que lo frena
    p.y += align(p.y, dist);
  } else {
    const ny = p.y + ay * dist;
    if (!boxBlocked(board, bombs, p, p.x, ny)) p.y = ny;
    else p.y = ay > 0 ? Math.floor(ny + HALF) - HALF : Math.ceil(ny - HALF) + HALF;
    p.x += align(p.x, dist);
  }
  p.walked += Math.hypot(p.x - x0, p.y - y0);
  // Al salir de la casilla de la bomba que tenía abajo, vuelve a ser sólida para él.
  if (p.onBomb !== null) {
    const bx = p.onBomb % board.W + 0.5, by = Math.floor(p.onBomb / board.W) + 0.5;
    if (Math.abs(p.x - bx) >= HALF + 0.5 || Math.abs(p.y - by) >= HALF + 0.5 || !bombs.has(p.onBomb)) p.onBomb = null;
  }
  return pushing(p, board, bombs, ax, ay);
}

// Acomodarse al centro del pasillo: cuánto moverse en la perpendicular (a lo sumo `dist`).
const align = (v, dist) => { const off = Math.floor(v) + 0.5 - v; return Math.sign(off) * Math.min(Math.abs(off), dist); };

// ¿Está empujando de frente una bomba (pegado a ella y centrado en el pasillo)? Devuelve la dirección o -1.
function pushing(p, board, bombs, ax, ay) {
  const W = board.W;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  const i = idx(W, cx + ax, cy + ay);
  if (!bombs.has(i) || board.cells[i] !== FLOOR || p.onBomb === i) return -1;
  const off = ax ? p.y - (cy + 0.5) : p.x - (cx + 0.5);
  const gap = ax ? Math.abs(cx + ax + 0.5 - p.x) : Math.abs(cy + ay + 0.5 - p.y);
  if (Math.abs(off) > 0.25 || gap > HALF + 0.5 + 0.02) return -1;
  return ay < 0 ? 0 : ax > 0 ? 1 : ay > 0 ? 2 : 3;
}

// ─── Bombas ─────────────────────────────────────────────────────────────────
// `bombs` es un Map casilla → bomba. Una bomba: { k, c, by, t (cuándo se puso), fuse, fire, pierce, remote, slide }.
export function newBomb(k, c, by, t, eff) {
  return { k, c, by, t, fuse: eff.remote ? Infinity : eff.fuse, fire: eff.fire, pierce: eff.pierce, remote: eff.remote, slide: null, x: 0, y: 0 };
}
export const bombsOf = (bombs, id) => [...bombs.values()].filter((b) => b.by === id);

// ¿Puede poner una bomba acá? (La casilla libre y sin bomba, y no se pasó de las que puede tener.)
export function canPlace(board, bombs, p, eff, mine) {
  if (p.dead || eff.bombs <= 0 || mine >= eff.bombs) return false;
  const i = cellOf(board.W, p);
  return board.cells[i] === FLOOR && !bombs.has(i);
}

// Patear: la bomba empieza a deslizarse en la dirección `d` si la casilla siguiente está libre.
export function kickBomb(board, bombs, b, d) {
  const W = board.W;
  const [dx, dy] = DIRS[d];
  const x = b.c % W + dx, y = Math.floor(b.c / W) + dy;
  if (board.cells[idx(W, x, y)] !== FLOOR || bombs.has(idx(W, x, y))) return false;
  b.slide = { d, x: b.c % W + 0.5, y: Math.floor(b.c / W) + 0.5 };
  return true;
}

// Una bomba que se desliza avanza hasta que la casilla siguiente está ocupada; ahí se acomoda en el
// centro. Cambia `bombs` cuando pasa de una casilla a otra. Devuelve true si se movió de casilla.
export function slideBomb(board, bombs, b, dt) {
  if (!b.slide) return false;
  const W = board.W;
  const [dx, dy] = DIRS[b.slide.d];
  const cx = b.c % W + 0.5, cy = Math.floor(b.c / W) + 0.5;
  const along = dx ? (b.slide.x - cx) * dx : (b.slide.y - cy) * dy; // cuánto pasó del centro, hacia adelante
  let moved = false;
  if (along >= 0) {
    const nx = b.c % W + dx, ny = Math.floor(b.c / W) + dy;
    const ni = idx(W, nx, ny);
    if (board.cells[ni] !== FLOOR || bombs.has(ni)) { b.slide = null; return false; }
  }
  b.slide.x += dx * KICK_SPEED * dt;
  b.slide.y += dy * KICK_SPEED * dt;
  const after = dx ? (b.slide.x - cx) * dx : (b.slide.y - cy) * dy;
  if (after >= 0.5) {
    const ni = idx(W, b.c % W + dx, Math.floor(b.c / W) + dy);
    bombs.delete(b.c);
    b.c = ni;
    bombs.set(ni, b);
    moved = true;
  }
  return moved;
}
// Dónde dibujarla (en casillas).
export const bombPos = (W, b) => (b.slide ? { x: b.slide.x, y: b.slide.y } : { x: b.c % W + 0.5, y: Math.floor(b.c / W) + 0.5 });

// ─── Fuego ──────────────────────────────────────────────────────────────────
// Hasta dónde llega la explosión de una bomba en `c` con alcance `fire`: para cada dirección, cuántas
// casillas. El fuego frena en la piedra; rompe el primer ladrillo y frena ahí (con la perforante sigue);
// frena en un ítem a la vista (y lo quema) y en otra bomba (que explota en cadena).
// `items(i)` dice si en la casilla hay un ítem a la vista. Devuelve { arms, broke, bombs }.
export function blastArms(board, bombs, c, fire, pierce, items = () => false) {
  const { W, H } = board;
  const x0 = c % W, y0 = Math.floor(c / W);
  const arms = [0, 0, 0, 0];
  const broke = [];
  const hit = [];
  DIRS.forEach(([dx, dy], d) => {
    for (let k = 1; k <= fire; k++) {
      const x = x0 + dx * k, y = y0 + dy * k;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i = idx(W, x, y);
      const cell = board.cells[i];
      if (cell === HARD || cell === PRESSED) break;
      arms[d] = k;
      if (cell === SOFT) { broke.push(i); if (!pierce) break; continue; }
      if (bombs.has(i)) { hit.push(i); break; }
      if (items(i)) break;
    }
  });
  return { arms, broke, bombs: hit };
}

// Las casillas que cubre una explosión: el centro y cada brazo.
export function blastCells(W, c, arms) {
  const out = [c];
  DIRS.forEach(([dx, dy], d) => { for (let k = 1; k <= arms[d]; k++) out.push(c + dx * k + dy * k * W); });
  return out;
}

// ─── Final de la ronda: caen bloques ────────────────────────────────────────
// Cuántos bloques del espiral ya cayeron a los `elapsed` segundos de ronda. Caen parejo durante los
// últimos HURRY_S segundos, así al terminar el tiempo está todo tapado.
export function pressedCount(elapsed, totalS, order) {
  const start = totalS - HURRY_S;
  if (elapsed < start) return 0;
  return Math.min(order.length, Math.floor(((elapsed - start) / HURRY_S) * order.length));
}
// Cuándo cae el bloque número `n` (segundos de ronda).
export const pressTime = (n, totalS, order) => totalS - HURRY_S + ((n + 1) / order.length) * HURRY_S;

// ─── Ítems ──────────────────────────────────────────────────────────────────
export const itemName = (kind) => ITEMS[kind]?.name || kind;
export const skullName = (kind) => SKULLS[kind]?.name || kind;

// ─── Casillas en una tira de bits ───────────────────────────────────────────
// Los ladrillos rotos y los ítems quemados viajan enteros en cada foto (un base64 de ~40 letras), así
// el que perdió una foto, o entró después, se pone al día solo.
export function packCells(set, total) {
  const bytes = new Uint8Array(Math.ceil(total / 8));
  for (const i of set) if (i >= 0 && i < total) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function unpackCells(str) {
  const out = [];
  let bin;
  try { bin = atob(String(str || '')); } catch { return out; }
  for (let j = 0; j < bin.length; j++) {
    const b = bin.charCodeAt(j);
    if (!b) continue;
    for (let k = 0; k < 8; k++) if (b & (1 << k)) out.push(j * 8 + k);
  }
  return out;
}
