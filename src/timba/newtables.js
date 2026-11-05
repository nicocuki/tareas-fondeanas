// Las mesas de los juegos nuevos (casino 2 en adelante) dentro del reducer de la sala. Los de una tirada (Keno, Plinko, Rueda
// del dinero y Baccarat) pasan por `spin` y `settle` de `game.js` (con `newSpin`); acá están los que se juegan por pasos y se
// pueden retirar: Crash, Penguin Cross, Buscaminas y Mayor o menor. Las reglas y los pagos están en `newgames.js`.
//
// Toda mesa por pasos arranca sin apuesta (`bet` 0); al apostar se descuenta de la caja de todos, y mientras `res` está vacío
// la ronda está en marcha. Al terminar (`res` = win / lose / cash / fall) se anota en `net` de quien juega.
import { betLimits } from './games.js';
import {
  CRASH_MAX, MINES_OPTIONS, MINES_SIZE, PENGUIN_CUBES, PENGUIN_FALL, crashMsAt, crashMultAt, crashPay, crashPoint, drawRank, hiloOdds,
  hiloPay, hiloStepMult, minesPay, penguinPay, pickDistinct,
} from './newgames.js';

// Cuánto de ventaja se le deja a la pantalla del que retira (la pantalla ve el multiplicador con un poco de atraso).
export const CRASH_GRACE_MS = 1200;

// La mesa de un juego por pasos, vacía.
export function newStepTable(kind, base) {
  if (kind === 'crash') return { ...base, point: 0, at: 0, res: '', pay: 0, cash: 0 };
  if (kind === 'penguin') return { ...base, pos: 0, n: 0, at: 0, res: '', pay: 0 };
  if (kind === 'mines') return { ...base, count: 3, mines: [], open: [], res: '', pay: 0 };
  return { ...base, card: 0, prev: 0, m: 1, n: 0, at: 0, res: '', pay: 0 }; // hilo
}

const tableOf = (next, id) => Object.values(next.tb).find((t) => t.by === id) || null;
const running = (t) => t.bet > 0 && !t.res;

// La ronda termina: se cobra lo que corresponda (0 si perdió) y se anota lo ganado o perdido.
function finish(next, t, res, pay, now) {
  t.res = res;
  t.pay = pay;
  t.at = now;
  next.money += pay;
  next.net[t.by] = (next.net[t.by] || 0) + pay - t.bet;
}

// El cohete ya chocó y nadie lo avisó: se da por perdido (se hace antes de cualquier jugada de la mesa).
function crashLostIfDue(next, t, now) {
  if (t.kind === 'crash' && running(t) && now >= t.at + crashMsAt(t.point)) finish(next, t, 'lose', 0, now);
}

// Una apuesta nueva: valida el monto y lo descuenta de la caja de todos.
function takeBet(next, t, amount) {
  if (!Number.isInteger(amount)) return false;
  const lim = betLimits(t.kind, next.money, next.day.n);
  if (!lim || amount < lim.min || amount > lim.max) return false;
  next.money -= amount;
  t.bet = amount;
  return true;
}

// El jugador se levanta o se acaba el día con una ronda en marcha: si ya llevaba algo ganado se cobra; si no, se devuelve.
export function releaseStep(next, t, now) {
  if (!running(t)) return;
  if (t.kind === 'crash') {
    const mult = Math.min(crashMultAt(now - t.at), t.point - 1);
    if (now >= t.at + crashMsAt(t.point) || mult < 100) finish(next, t, 'lose', 0, now);
    else finish(next, t, 'cash', crashPay(t.bet, mult), now);
  } else if (t.kind === 'penguin') {
    if (t.pos > 0) finish(next, t, 'cash', penguinPay(t.bet, t.pos), now);
    else { next.money += t.bet; t.res = 'cash'; t.pay = t.bet; }
  } else if (t.kind === 'mines') {
    if (t.open.length) finish(next, t, 'cash', minesPay(t.bet, t.count, t.open.length), now);
    else { next.money += t.bet; t.res = 'cash'; t.pay = t.bet; }
  } else if (t.kind === 'hilo') {
    if (t.n > 0) finish(next, t, 'cash', hiloPay(t.bet, t.m), now);
    else { next.money += t.bet; t.res = 'cash'; t.pay = t.bet; }
  }
}

// Atiende las acciones de los juegos por pasos. Devuelve `undefined` si la acción no es de acá, `null` si no vale y `true`
// si se aplicó (el reducer sigue con lo suyo).
export function applyStepAction(next, me, action, { now, rand, playing }) {
  const type = action.type;
  const kindOf = { crashLaunch: 'crash', crashCash: 'crash', crashEnd: 'crash', penguinBet: 'penguin', penguinStep: 'penguin', penguinCash: 'penguin', minesBet: 'mines', minesPick: 'mines', minesCash: 'mines', hiloBet: 'hilo', hiloGuess: 'hilo', hiloCash: 'hilo' }[type];
  if (!kindOf) return undefined;
  const t = me ? tableOf(next, me.id) : null;
  if (!playing || !t || t.kind !== kindOf) return null;
  if (type === 'crashEnd') {
    // La pantalla vio que el cohete chocó: se anota la pérdida (si ya se había anotado, no hace falta nada).
    const was = running(t);
    crashLostIfDue(next, t, now);
    return was && !running(t) ? true : null;
  }
  crashLostIfDue(next, t, now);
  const isBet = type === 'crashLaunch' || type === 'penguinBet' || type === 'minesBet' || type === 'hiloBet';
  if (isBet) {
    if (next.day.over || running(t)) return null;
  } else if (!running(t)) return null;

  switch (type) {
    // ── Crash: al lanzar queda decidido dónde choca; retirar es avisar hasta qué multiplicador llegó (en centésimos).
    case 'crashLaunch': {
      if (!takeBet(next, t, action.amount)) return null;
      Object.assign(t, { at: now, point: crashPoint(rand), res: '', pay: 0, cash: 0 });
      return true;
    }
    case 'crashCash': {
      const mult = action.mult;
      if (!Number.isInteger(mult) || mult < 100 || mult > CRASH_MAX) return null;
      if (mult > crashMultAt(now - t.at + CRASH_GRACE_MS) || mult >= t.point) return null;
      t.cash = mult;
      finish(next, t, 'win', crashPay(t.bet, mult), now);
      return true;
    }

    // ── Penguin Cross: cada salto tiene 1/2 de caer; cada uno bien dado multiplica por 1,5.
    case 'penguinBet': {
      if (!takeBet(next, t, action.amount)) return null;
      Object.assign(t, { pos: 0, n: 0, at: now, res: '', pay: 0, fell: false });
      return true;
    }
    case 'penguinStep': {
      t.at = now;
      t.n += 1;
      if (rand() < PENGUIN_FALL) { t.fell = true; finish(next, t, 'fall', 0, now); return true; }
      t.fell = false;
      t.pos += 1;
      if (t.pos >= PENGUIN_CUBES - 1) finish(next, t, 'win', penguinPay(t.bet, t.pos), now); // llegó al último cubo: cobra solo
      return true;
    }
    case 'penguinCash': {
      if (t.pos < 1) return null;
      finish(next, t, 'cash', penguinPay(t.bet, t.pos), now);
      return true;
    }

    // ── Buscaminas: 5 × 5 con 1, 3, 5 o 10 minas.
    case 'minesBet': {
      if (!MINES_OPTIONS.includes(action.mines)) return null;
      if (!takeBet(next, t, action.amount)) return null;
      Object.assign(t, { count: action.mines, mines: pickDistinct(MINES_SIZE, action.mines, rand), open: [], res: '', pay: 0, hit: -1 });
      return true;
    }
    case 'minesPick': {
      const i = action.i;
      if (!Number.isInteger(i) || i < 0 || i >= MINES_SIZE || t.open.includes(i)) return null;
      if (t.mines.includes(i)) { t.hit = i; finish(next, t, 'lose', 0, now); return true; }
      t.open.push(i);
      if (t.open.length >= MINES_SIZE - t.count) finish(next, t, 'win', minesPay(t.bet, t.count, t.open.length), now); // destapó todo lo seguro
      return true;
    }
    case 'minesCash': {
      if (!t.open.length) return null;
      finish(next, t, 'cash', minesPay(t.bet, t.count, t.open.length), now);
      return true;
    }

    // ── Mayor o menor: se adivina si la carta que sigue es mayor o menor que la de ahora.
    case 'hiloBet': {
      if (!takeBet(next, t, action.amount)) return null;
      Object.assign(t, { card: drawRank(rand), prev: 0, m: 1, n: 0, at: now, res: '', pay: 0 });
      return true;
    }
    case 'hiloGuess': {
      if (action.dir !== 'hi' && action.dir !== 'lo') return null;
      if (hiloOdds(t.card, action.dir) <= 0) return null;
      const card = drawRank(rand);
      const won = action.dir === 'hi' ? card > t.card : card < t.card;
      const step = hiloStepMult(t.card, action.dir);
      t.prev = t.card;
      t.card = card;
      t.at = now;
      if (!won) { finish(next, t, 'lose', 0, now); return true; }
      t.m = Math.round(t.m * step * 1e6) / 1e6;
      t.n += 1;
      return true;
    }
    case 'hiloCash': {
      if (t.n < 1) return null;
      finish(next, t, 'cash', hiloPay(t.bet, t.m), now);
      return true;
    }
    default:
      return null;
  }
}
