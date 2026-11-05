// Los juegos de azar del piso 1 de La Timba que no son el blackjack (ese está en `bj.js`): los límites de apuesta de
// cada uno y lo puro de cada juego (tragamonedas, rueda de la fortuna, ruleta, carrera de patos y craps). Sin React
// ni red: el reducer (`game.js`) lo usa dentro de la transacción y recibe el azar por parámetro.

import { NEW_LIMITS, NEW_NAMES, NEW_SPIN_KINDS } from './newgames.js';
import { betScale } from './quota.js';

// Mínimo y máximo de cada juego **el día 1**. Los de tirar muchas veces (tragamonedas, rueda) son de $1 a $60, y los de una
// partida entera (blackjack, craps) tienen un rango más alto. Cada día los dos crecen (`limitsFor`).
export const LIMITS = {
  bj: [36, 360], slots: [1, 60], wheel: [1, 60], roulette: [5, 180], duck: [5, 120], craps: [20, 360],
  ...NEW_LIMITS,
};
export const NAMES = {
  bj: 'Blackjack', slots: 'Tragamonedas', wheel: 'Rueda de la fortuna', roulette: 'Ruleta', duck: 'Carrera de patos', craps: 'Craps',
  ...NEW_NAMES,
};
// Los que se juegan de una tirada: se apuesta, pasa la animación y después se cobra (`spin` y `settle` en el reducer).
export const SPIN_KINDS = ['slots', 'wheel', 'roulette', 'duck', ...NEW_SPIN_KINDS];

// Redondea a dos cifras significativas (64.332 → 64.000) para que los límites sean números lindos.
const pretty = (n) => {
  if (n < 100) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
};

// El mínimo y el máximo de un juego el día `day`: los del día 1 por lo que crecen las cuotas (`betScale`). Así el día 12 las
// apuestas son de miles y hasta de cientos de miles.
export function limitsFor(kind, day = 1) {
  const [lo, hi] = LIMITS[kind];
  const k = betScale(day);
  return [Math.max(lo, pretty(lo * k)), Math.max(hi, pretty(hi * k))];
}

// Lo que se puede apostar ahora: del mínimo al máximo del juego, sin pasarse de la plata que hay. null = no alcanza.
export function betLimits(kind, money, day = 1) {
  const [lo, hi] = limitsFor(kind, day);
  const max = Math.min(hi, Math.max(0, Math.floor(money)));
  return max < lo ? null : { min: lo, max };
}

// Los cuatro botones rápidos: mínimo, 1/4, 1/2 y todo (del máximo del juego, sin pasarse de la plata).
export function quickBet(kind, button, money, day = 1) {
  const lim = betLimits(kind, money, day);
  if (!lim) return 0;
  const [lo, hi] = limitsFor(kind, day);
  const of = { min: lo, q: Math.floor(hi / 4), h: Math.floor(hi / 2), all: hi }[button] ?? lo;
  return Math.max(lim.min, Math.min(lim.max, of));
}

// ─── Tragamonedas: «La cámara de la momia» ────────────────────────────────────
// Una grilla de 3 × 3 con cuatro símbolos parejos. Cada patrón completo del mismo símbolo paga su multiplicador, y el
// premio de cada patrón se multiplica por el valor de su símbolo (loto 1,75, escarabajo 1,25, ankh 0,75, ojo 0,25).
// Los patrones que salen juntos se suman: el tablero lleno del mismo símbolo es 59 + 20 (X) + 5 (rombo) + 16 (las ocho
// líneas) = 100 veces el valor del símbolo, y con lotos 175 veces la apuesta.
export const SLOT_SYMBOLS = [
  { id: 'lotus', name: 'Loto', value: 1.75 },
  { id: 'scarab', name: 'Escarabajo', value: 1.25 },
  { id: 'ankh', name: 'Ankh', value: 0.75 },
  { id: 'eye', name: 'Ojo de Horus', value: 0.25 },
];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const SLOT_PATTERNS = [
  ...LINES.map((cells) => ({ k: 'line', m: 2, cells })),
  { k: 'diamond', m: 5, cells: [1, 3, 5, 7] },
  { k: 'x', m: 20, cells: [0, 2, 4, 6, 8] },
  { k: 'full', m: 59, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
];
export const spinSlots = (rand) => Array.from({ length: 9 }, () => Math.floor(rand() * SLOT_SYMBOLS.length));

// Qué patrones salieron y cuánto multiplican la apuesta en total.
export function slotsEval(grid) {
  const hits = [];
  let mult = 0;
  for (const p of SLOT_PATTERNS) {
    const sym = grid[p.cells[0]];
    if (p.cells.every((c) => grid[c] === sym)) { hits.push({ ...p, sym }); mult += p.m * SLOT_SYMBOLS[sym].value; }
  }
  return { hits, mult };
}

// ─── Rueda de la fortuna ────────────────────────────────────────────────────
// Los 20 casilleros, en el orden en que están en la rueda (clockwise, desde el que apunta la flecha). `'again'` es
// «gira otra vez». Sin contar los de girar otra vez, el pago promedio da exactamente 1: un juego parejo.
export const WHEEL = ['again', 3, 0.1, 0.5, 0.25, 5, 0.1, 0.25, 2, 0.1, 'again', 3, 0.5, 0.1, 0.25, 0, 0.5, 0.1, 2, 0.25];
export const MAX_RESPINS = 6;
// Devuelve el casillero de cada giro: sigue mientras salga «girar otra vez» (con tope).
export function spinWheel(rand) {
  const spins = [];
  while (spins.length < MAX_RESPINS) {
    const i = Math.floor(rand() * WHEEL.length);
    spins.push(i);
    if (WHEEL[i] !== 'again') return spins;
  }
  const plain = WHEEL.map((v, i) => (v === 'again' ? -1 : i)).filter((i) => i >= 0);
  spins.push(plain[Math.floor(rand() * plain.length)]);
  return spins;
}

// ─── Ruleta (europea: del 0 al 36) ───────────────────────────────────────────
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// El orden de los números alrededor de la rueda.
export const ROULETTE_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3'];
// Las apuestas: un número (`n17`), color, par o impar, mitad (1-18 o 19-36) o docena.
export const isSpot = (spot) => OUTSIDE.includes(spot) || (/^n(\d+)$/.test(spot) && Number(spot.slice(1)) <= 36);
export const spinRoulette = (rand) => Math.floor(rand() * 37);
// Cuánto vuelve por cada $1 apostado, contando lo apostado (0 = perdió): número 36, docena 3, el resto 2. El 0 pierde todo menos el 0.
export function roulettePays(spot, n) {
  if (spot[0] === 'n') return Number(spot.slice(1)) === n ? 36 : 0;
  if (n === 0) return 0;
  switch (spot) {
    case 'red': return colorOf(n) === 'red' ? 2 : 0;
    case 'black': return colorOf(n) === 'black' ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'even': return n % 2 === 0 ? 2 : 0;
    case 'low': return n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'd1': return n <= 12 ? 3 : 0;
    case 'd2': return n >= 13 && n <= 24 ? 3 : 0;
    case 'd3': return n >= 25 ? 3 : 0;
    default: return 0;
  }
}

// ─── Carrera de patos ────────────────────────────────────────────────────────
// Cuatro patos parejos: se elige uno y puede ganar cualquiera. Paga 3,8 veces lo apostado (el 5 % se lo queda la casa).
export const DUCKS = ['Cuki', 'Suti', 'Vitas', 'Gordon'];
export const DUCK_PAY = 3.8;
// Cuánto tarda cada pato en llegar (en ms) y cuál gana (el que llega primero).
export function raceDucks(rand) {
  const times = DUCKS.map(() => 6000 + Math.floor(rand() * 2500));
  return { times, win: times.indexOf(Math.min(...times)) };
}

// ─── Craps (la línea de pase) ────────────────────────────────────────────────
// Primera tirada: 7 u 11 gana, 2, 3 o 12 pierde, y cualquier otro número queda como «punto». Con punto se sigue
// tirando: gana si sale el punto antes que un 7, y pierde si sale el 7. Paga 1 a 1.
export const validDice = (d) => Array.isArray(d) && d.length === 2 && d.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);
export function crapsStep(point, [a, b]) {
  const sum = a + b;
  if (!point) {
    if (sum === 7 || sum === 11) return { point: 0, res: 'win' };
    if (sum === 2 || sum === 3 || sum === 12) return { point: 0, res: 'lose' };
    return { point: sum, res: '' };
  }
  if (sum === point) return { point: 0, res: 'win' };
  if (sum === 7) return { point: 0, res: 'lose' };
  return { point, res: '' };
}
