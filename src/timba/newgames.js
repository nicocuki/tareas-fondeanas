// Los juegos del casino 2 en adelante: reglas y pagos puros (Crash, Penguin Cross, Keno, Plinko, Rueda del dinero, Baccarat,
// Mayor o menor y Buscaminas). Sin React ni red: el reducer (`newtables.js`) los usa dentro de la transacción y recibe el azar
// por parámetro. Crash y Penguin Cross son las reglas que dio Nico; en los demás los números (pagos, tamaños) son nuestros,
// con la casa quedándose cerca del 5 %. Si en la wiki son distintos, se corrigen acá.

// Los que se juegan de una tirada (se apuesta, pasa la animación y se cobra: `spin` y `settle`) y los que se juegan por
// pasos (se puede retirar la plata antes de perder).
export const NEW_SPIN_KINDS = ['keno', 'plinko', 'mwheel', 'baccarat'];
export const STEP_KINDS = ['crash', 'penguin', 'mines', 'hilo'];
export const NEW_KINDS = [...STEP_KINDS, ...NEW_SPIN_KINDS];

export const RTP = 0.95; // lo que vuelve en promedio: la casa se queda el 5 %

// Mínimo y máximo de apuesta del día 1 (cada día crecen: `limitsFor` en `games.js`).
export const NEW_LIMITS = {
  crash: [5, 120], penguin: [5, 120], mines: [5, 120], hilo: [5, 120], keno: [2, 60], plinko: [2, 60], mwheel: [2, 100], baccarat: [10, 240],
};
export const NEW_NAMES = {
  crash: 'Crash', penguin: 'Cruce del pingüino', mines: 'Buscaminas', hilo: 'Mayor o menor', keno: 'Keno', plinko: 'Plinko', mwheel: 'Rueda del dinero', baccarat: 'Baccarat',
};

// Mezcla parcial: elige `n` números distintos de 0 a `size - 1` (Fisher-Yates con el azar que llega por parámetro).
export function pickDistinct(size, n, rand) {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (size - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ─── Crash ───────────────────────────────────────────────────────────────────
// El cohete sube 0,01 por paso a 60 pasos por segundo (empieza en 1x) y en cualquier momento puede chocar: de 1x a 100x.
// Todo va en centésimos (100 = 1,00x). Cómo se elige dónde choca: la distribución típica de crash, con muchos choques bajos y
// pocos altos (la chance de llegar a `x` es 0,95 / x), así retirar a cualquier número rinde 0,95 en promedio.
export const CRASH_STEPS_PER_S = 60;
export const CRASH_MAX = 10000;
export const crashMultAt = (ms) => 100 + Math.floor(Math.max(0, ms) * 3 / 50);        // 60 pasos por segundo
export const crashMsAt = (mult) => Math.ceil(((mult - 100) * 50) / 3);                 // cuánto tarda en llegar a `mult`
export function crashPoint(rand) {
  const c = Math.floor((RTP / (1 - rand())) * 100);
  return Math.max(100, Math.min(CRASH_MAX, c));
}
export const crashPay = (bet, mult) => Math.floor((bet * mult) / 100);

// ─── Penguin Cross ───────────────────────────────────────────────────────────
// 9 cubos de hielo contando el primero (donde ya está el pingüino): son 8 saltos y cada uno tiene 1/3 de que el pingüino
// caiga al agua. Cada salto bien dado multiplica por 1,5 lo apostado.
export const PENGUIN_CUBES = 9;
export const PENGUIN_FALL = 1 / 3; // pedido de Nico: 1 de 3 de caer (2 de 3 de avanzar)
export const PENGUIN_STEP = 1.5;
export const penguinMult = (pos) => PENGUIN_STEP ** pos;
export const penguinPay = (bet, pos) => Math.floor(bet * penguinMult(pos));

// ─── Buscaminas ──────────────────────────────────────────────────────────────
// Una grilla de 5 × 5 con 1, 3, 5 o 10 minas escondidas: cada casillero sin mina que se destapa sube el multiplicador, y se
// puede retirar en cualquier momento. Una mina se lleva todo.
export const MINES_SIZE = 25;
export const MINES_OPTIONS = [1, 3, 5, 10];
export const minesMult = (mines, safe) => {
  let m = RTP;
  for (let i = 0; i < safe; i++) m *= (MINES_SIZE - i) / (MINES_SIZE - mines - i);
  return m;
};
export const minesPay = (bet, mines, safe) => Math.floor(bet * minesMult(mines, safe) + 1e-9);

// ─── Mayor o menor ───────────────────────────────────────────────────────────
// Sale una carta de 1 (As) a 13 (K); se adivina si la que sigue es mayor o menor (si sale igual, se pierde). Cada acierto
// multiplica por 0,95 / chance de acertar: arriesgar más paga más. Se puede retirar después del primer acierto.
export const hiloOdds = (card, dir) => (dir === 'hi' ? (13 - card) / 13 : (card - 1) / 13);
export const hiloStepMult = (card, dir) => { const p = hiloOdds(card, dir); return p > 0 ? RTP / p : 0; };
export const drawRank = (rand) => 1 + Math.floor(rand() * 13);
export const hiloPay = (bet, mult) => Math.floor(bet * mult + 1e-9);

// ─── Keno ────────────────────────────────────────────────────────────────────
// 40 números: se eligen de 1 a 10 y salen 10. Cuantos más aciertos, más paga; el pago de cada cantidad de aciertos sale de
// repartir lo que vuelve (0,95) entre las cantidades que pagan (desde la mitad de lo elegido), con tope de 1.000×.
export const KENO_N = 40;
export const KENO_DRAW = 10;
export const KENO_MAX_PICK = 10;
export const KENO_CAP = 1000;
const comb = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
// Chance de acertar exactamente `h` eligiendo `n`.
export const kenoOdds = (n, h) => (comb(n, h) * comb(KENO_N - n, KENO_DRAW - h)) / comb(KENO_N, KENO_DRAW);
export const KENO_PAYS = Array.from({ length: KENO_MAX_PICK + 1 }, (_, n) => {
  if (n === 0) return [];
  const from = Math.max(1, Math.ceil(n / 2));
  const weights = Array.from({ length: n + 1 }, (_, h) => (h >= from ? 0.6 ** (h - from) : 0));
  const pays = Array(n + 1).fill(0);
  // Los que llegarían al tope se quedan en el tope y lo que sobra de RTP se reparte entre los demás.
  const capped = new Set();
  for (let round = 0; round <= n; round++) {
    const spent = [...capped].reduce((sum, h) => sum + KENO_CAP * kenoOdds(n, h), 0);
    const free = weights.reduce((sum, w, h) => sum + (w && !capped.has(h) ? w : 0), 0);
    let grew = false;
    weights.forEach((w, h) => {
      if (!w) return;
      if (capped.has(h)) { pays[h] = KENO_CAP; return; }
      pays[h] = (RTP - spent) * (w / free) / kenoOdds(n, h);
      if (pays[h] > KENO_CAP) { capped.add(h); grew = true; }
    });
    if (!grew) break;
  }
  return pays.map((p) => Math.round(Math.min(KENO_CAP, p) * 100) / 100);
});
export const kenoMult = (n, hits) => KENO_PAYS[n]?.[hits] || 0;
export const kenoRtp = (n) => KENO_PAYS[n].reduce((sum, pay, h) => sum + pay * kenoOdds(n, h), 0);

// ─── Plinko ──────────────────────────────────────────────────────────────────
// La bolita baja por 8 filas de clavos y en cada una va para la izquierda o la derecha: cae en uno de 9 casilleros, y los
// de las puntas pagan más (pago promedio 0,958).
export const PLINKO_ROWS = 8;
export const PLINKO_MULTS = [9, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 9];
export const dropBall = (rand) => Array.from({ length: PLINKO_ROWS }, () => (rand() < 0.5 ? 0 : 1));
export const plinkoBin = (path) => path.reduce((a, b) => a + b, 0);

// ─── Rueda del dinero ────────────────────────────────────────────────────────
// 54 casilleros: 24 del 1, 15 del 2, 7 del 5, 4 del 10, 2 del 20, un comodín y un logo. Se apuesta a uno; si sale, paga.
export const MWHEEL_COUNTS = { 1: 24, 2: 15, 5: 7, 10: 4, 20: 2, joker: 1, logo: 1 };
export const MWHEEL_PAYS = { 1: 2.1, 2: 3.4, 5: 7, 10: 12.6, 20: 25, joker: 50, logo: 50 };
export const MWHEEL_SPOTS = Object.keys(MWHEEL_COUNTS);
// Los casilleros en el orden de la rueda: los raros bien repartidos y el resto rellenando.
export const MWHEEL = (() => {
  const total = Object.values(MWHEEL_COUNTS).reduce((a, b) => a + b, 0);
  const slots = Array(total).fill(null);
  const order = ['joker', 'logo', '20', '10', '5', '2', '1'];
  order.forEach((spot, k) => {
    const c = MWHEEL_COUNTS[spot];
    for (let i = 0; i < c; i++) {
      let at = Math.floor(((i + 0.5) * total) / c + (k * 7)) % total;
      while (slots[at] !== null) at = (at + 1) % total;
      slots[at] = spot;
    }
  });
  return slots;
})();
export const isMwheelSpot = (spot) => MWHEEL_SPOTS.includes(String(spot));
export const spinMwheel = (rand) => Math.floor(rand() * MWHEEL.length);

// ─── Baccarat (punto banco) ──────────────────────────────────────────────────
// Se apuesta a «jugador», «banco» o «empate»; gana la mano que más se acerca a 9 (cuentan los últimos dígitos de la suma:
// el 10 y las figuras valen 0). Jugador paga 1 a 1, banco 0,95 a 1 y empate 8 a 1 (con empate, jugador y banco se devuelven).
export const BACCARAT_SIDES = ['player', 'banker', 'tie'];
export const cardValue = (rank) => (rank >= 10 ? 0 : rank);
export const handTotal = (hand) => hand.reduce((a, r) => a + cardValue(r), 0) % 10;
export function dealBaccarat(rand) {
  const p = [drawRank(rand), drawRank(rand)];
  const b = [drawRank(rand), drawRank(rand)];
  if (handTotal(p) < 8 && handTotal(b) < 8) {
    let third = null;
    if (handTotal(p) <= 5) { third = drawRank(rand); p.push(third); }
    const bt = handTotal(b);
    const pv = third === null ? null : cardValue(third);
    let draws;
    if (pv === null) draws = bt <= 5;
    else if (bt <= 2) draws = true;
    else if (bt === 3) draws = pv !== 8;
    else if (bt === 4) draws = pv >= 2 && pv <= 7;
    else if (bt === 5) draws = pv >= 4 && pv <= 7;
    else if (bt === 6) draws = pv === 6 || pv === 7;
    else draws = false;
    if (draws) b.push(drawRank(rand));
  }
  const pt = handTotal(p);
  const bt = handTotal(b);
  return { p, b, res: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}
// Cuánto vuelve por cada $1 apostado, contando lo apostado (0 = perdió).
export function baccaratMult(side, res) {
  if (side === 'tie') return res === 'tie' ? 9 : 0;
  if (res === 'tie') return 1;
  if (res !== side) return 0;
  return side === 'player' ? 2 : 1.95;
}

// ─── De una tirada: armar el resultado ───────────────────────────────────────
// Devuelve null si la jugada no vale, o `{ state, mult, ms }`: lo que se anota en la mesa, cuánto multiplica la apuesta y
// cuánto dura la animación. El reducer cobra `mult` al terminar (`settle`).
export const NEW_SPIN_MS = { keno: 3600, plinko: 3800, mwheel: 5200, baccarat: 3600 };
export function newSpin(kind, action, rand) {
  if (kind === 'keno') {
    const picks = action.picks;
    if (!Array.isArray(picks) || picks.length < 1 || picks.length > KENO_MAX_PICK) return null;
    if (!picks.every((n) => Number.isInteger(n) && n >= 0 && n < KENO_N) || new Set(picks).size !== picks.length) return null;
    const draw = pickDistinct(KENO_N, KENO_DRAW, rand);
    const hits = picks.filter((n) => draw.includes(n)).length;
    return { state: { picks: [...picks].sort((a, b) => a - b), draw, hits }, mult: kenoMult(picks.length, hits), ms: NEW_SPIN_MS.keno };
  }
  if (kind === 'plinko') {
    const path = dropBall(rand);
    const bin = plinkoBin(path);
    return { state: { path, bin }, mult: PLINKO_MULTS[bin], ms: NEW_SPIN_MS.plinko };
  }
  if (kind === 'mwheel') {
    if (!isMwheelSpot(action.spot)) return null;
    const seg = spinMwheel(rand);
    const spot = String(action.spot);
    return { state: { spot, seg }, mult: MWHEEL[seg] === spot ? MWHEEL_PAYS[spot] : 0, ms: NEW_SPIN_MS.mwheel };
  }
  if (kind === 'baccarat') {
    if (!BACCARAT_SIDES.includes(action.side)) return null;
    const hand = dealBaccarat(rand);
    return { state: { side: action.side, p: hand.p, b: hand.b, res: hand.res }, mult: baccaratMult(action.side, hand.res), ms: NEW_SPIN_MS.baccarat };
  }
  return null;
}
