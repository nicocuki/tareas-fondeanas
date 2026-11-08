// Bombardero: el tablero. Sale entero de la semilla, igual en todas las pantallas (nada de Math.random()).
//
// Es la grilla clásica de Bomberman: un borde de piedra, pilares indestructibles en las casillas pares
// (así siempre quedan pasillos) y ladrillos que se rompen repartidos por el resto, menos alrededor de
// donde aparece cada jugador. Debajo de algunos ladrillos hay un ítem, que también sale de la semilla.
export const TILE = 16;

export const FLOOR = 0;   // piso: se camina
export const HARD = 1;    // pilar o borde: no se rompe
export const SOFT = 2;    // ladrillo: lo rompe el fuego
export const PRESSED = 3; // bloque que cayó al final de la ronda («¡Apurate!»)

// Tableros: el chico para hasta 4 (el de siempre, 13 × 11 por dentro) y el grande para hasta 8.
export const BOARDS = {
  small: { W: 15, H: 13, max: 4 },
  big: { W: 19, H: 15, max: 8 },
};
export const boardFor = (count) => (count <= BOARDS.small.max ? BOARDS.small : BOARDS.big);

const SOFT_CHANCE = 0.8;   // qué parte del piso libre lleva ladrillo
const ITEM_CHANCE = 0.4;   // qué parte de los ladrillos esconde un ítem

// Los ítems que puede haber debajo de un ladrillo, con su peso en el sorteo.
export const ITEMS = {
  fire: { name: 'Más fuego', info: 'La explosión llega una casilla más lejos.', w: 30 },
  bomb: { name: 'Más bombas', info: 'Podés tener una bomba más puesta a la vez.', w: 30 },
  speed: { name: 'Patines', info: 'Caminás más rápido.', w: 15 },
  kick: { name: 'Patada', info: 'Caminá contra una bomba para patearla: se desliza hasta chocar.', w: 9 },
  pierce: { name: 'Bomba perforante', info: 'El fuego atraviesa los ladrillos en vez de frenar en el primero.', w: 5 },
  remote: { name: 'Control remoto', info: 'Tus bombas no explotan solas: las hacés explotar vos con E.', w: 5 },
  vest: { name: 'Chaleco', info: 'Diez segundos sin que el fuego te haga nada.', w: 4 },
  fullfire: { name: 'Fuego máximo', info: 'La explosión llega lo más lejos posible.', w: 2 },
  skull: { name: 'Calavera', info: 'Una enfermedad al azar por un rato. Se contagia al tocarse.', w: 6 },
};
export const ITEM_LIST = Object.keys(ITEMS);
const TOTAL_W = ITEM_LIST.reduce((s, k) => s + ITEMS[k].w, 0);

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

// ─── Dónde aparece cada uno ─────────────────────────────────────────────────
// Primero las cuatro esquinas; en el tablero grande, también el medio de cada lado.
export function spawnCells(board) {
  const { W, H } = board;
  const pts = [[1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2]];
  if (board.max > 4) {
    const mx = W >> 1, my = H >> 1; // 19 → 9 y 15 → 7: impares, así caen en un pasillo
    pts.push([mx, 1], [mx, H - 2], [1, my], [W - 2, my]);
  }
  return pts.map(([x, y]) => ({ x, y }));
}

// ─── El tablero ─────────────────────────────────────────────────────────────
export const idx = (W, x, y) => y * W + x;
export const isBorder = (W, H, x, y) => x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1;
export const isPillar = (x, y) => x % 2 === 0 && y % 2 === 0;

// `count` jugadores: elige el tablero y reparte los ladrillos. Devuelve { W, H, cells, spawns, seed }.
export function makeBoard(seed, count) {
  const board = boardFor(count);
  const { W, H } = board;
  const cells = new Uint8Array(W * H);
  const spawns = spawnCells(board);
  const safe = new Set();
  for (const s of spawns) {
    // La casilla donde aparece y dos más en cada dirección libre: así nadie arranca encerrado.
    safe.add(idx(W, s.x, s.y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= 2; k++) {
        const x = s.x + dx * k, y = s.y + dy * k;
        if (!isBorder(W, H, x, y) && !isPillar(x, y)) safe.add(idx(W, x, y));
      }
    }
  }
  const rng = mulberry32(seed ^ 0x5bd1e995);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(W, x, y);
      if (isBorder(W, H, x, y) || isPillar(x, y)) cells[i] = HARD;
      else if (!safe.has(i) && rng() < SOFT_CHANCE) cells[i] = SOFT;
    }
  }
  return { W, H, cells, spawns, seed, max: board.max };
}

// Qué ítem hay debajo del ladrillo de la casilla `i` (o null). Sale de la semilla: todas las pantallas
// ven lo mismo. Sin calaveras (`skulls: false`), la calavera pasa a ser fuego.
export function itemAt(seed, i, skulls = true) {
  if (hash2(i, 17, seed) >= ITEM_CHANCE) return null;
  let r = hash2(i, 29, seed) * TOTAL_W;
  for (const k of ITEM_LIST) {
    r -= ITEMS[k].w;
    if (r < 0) return k === 'skull' && !skulls ? 'fire' : k;
  }
  return 'fire';
}

// El orden en que caen los bloques al final de la ronda: un espiral desde la esquina de arriba a la
// izquierda hacia adentro, sin los pilares (ya son de piedra).
export function pressOrder(W, H) {
  const out = [];
  let x0 = 1, y0 = 1, x1 = W - 2, y1 = H - 2;
  const push = (x, y) => { if (!isPillar(x, y)) out.push(idx(W, x, y)); };
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) push(x, y0);
    for (let y = y0 + 1; y <= y1; y++) push(x1, y);
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) push(x, y1);
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) push(x0, y);
    x0++; y0++; x1--; y1--;
  }
  return out;
}
