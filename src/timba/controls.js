// Los botones de las mesas de La Timba, sin dibujo ni red: qué hace cada uno, cuáles se pueden tocar ahora y qué dice el
// cartel de la mesa. Lo usan `TimbaGame.jsx` (al tocar un botón con la mano) y `tables3d.js` (para prender o apagar los
// botones y escribir los carteles); y los tests.
//
// Cada mesa tiene, en el mundo:
// - el teclado de apuesta (`k:1`…`k:9`, `k:0`, `k:000`, `k:C`) y los botones rápidos (`q:min`, `q:q`, `q:h`, `q:all`);
// - los botones del juego (`a:play`, `a:hit`, `a:cash`…, ver `ACTIONS`);
// - y lo que se elige tocando la mesa (`s:` una apuesta de la ruleta, `d:` un pato, `n:` un número del keno, `b:` jugador,
//   banco o empate, `w:` un casillero de la rueda del dinero, `m:` cuántas minas y `c:` un casillero del buscaminas).
//
// Lo que se está escribiendo o eligiendo (`ui`) es de cada pantalla y no viaja: recién al apretar JUGAR se manda la
// acción a la sala, que valida todo otra vez.
import { DUCKS, WHEEL, betLimits, colorOf, isSpot, limitsFor, quickBet } from './games.js';
import { handValue } from './bj.js';
import {
  BACCARAT_SIDES, KENO_MAX_PICK, KENO_N, MINES_OPTIONS, MINES_SIZE, MWHEEL, MWHEEL_SPOTS, PENGUIN_CUBES, STEP_KINDS,
  crashMultAt, handTotal, hiloOdds, minesMult, minesPay, penguinMult, penguinPay,
} from './newgames.js';
import { RESULT_MS, fmtMoney } from './game.js';

export const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '000'];
export const QUICK = [['min', 'MÍN'], ['q', '1/4'], ['h', '1/2'], ['all', 'TODO']];

// Los botones grandes de cada juego: [id, texto, color]. `play` es siempre el principal (también con Enter).
export const ACTIONS = {
  bj: [['double', 'DOBLAR', 'orange'], ['stand', 'PLANTARME', 'red'], ['hit', 'PEDIR', 'blue'], ['play', 'JUGAR', 'green']],
  slots: [['play', 'GIRAR', 'green']],
  wheel: [['play', 'GIRAR', 'green']],
  roulette: [['play', 'JUGAR', 'green']],
  duck: [['play', 'LARGAR', 'green']],
  craps: [['play', 'APOSTAR', 'green'], ['roll', 'TIRAR', 'blue']],
  crash: [['play', 'LANZAR', 'green'], ['cash', 'RETIRAR', 'orange']],
  penguin: [['play', 'APOSTAR', 'green'], ['step', 'SALTAR', 'blue'], ['cash', 'RETIRAR', 'orange']],
  keno: [['play', 'JUGAR', 'green'], ['clear', 'BORRAR', 'red'], ['lucky', 'AL AZAR', 'orange']],
  plinko: [['play', 'SOLTAR', 'green']],
  mwheel: [['play', 'GIRAR', 'green']],
  baccarat: [['play', 'REPARTIR', 'green']],
  hilo: [['hi', 'MAYOR', 'blue'], ['lo', 'MENOR', 'red'], ['play', 'APOSTAR', 'green'], ['cash', 'RETIRAR', 'orange']],
  mines: [['play', 'APOSTAR', 'green'], ['cash', 'RETIRAR', 'orange']],
};

// Las apuestas de afuera de la ruleta: [apuesta, texto, paga].
export const ROULETTE_OUTSIDE = [['low', '1-18', 2], ['even', 'PAR', 2], ['red', 'ROJO', 2], ['black', 'NEGRO', 2], ['odd', 'IMPAR', 2], ['high', '19-36', 2], ['d1', '1ª 12', 3], ['d2', '2ª 12', 3], ['d3', '3ª 12', 3]];
export const spotLabel = (spot) => (spot[0] === 'n' ? `el ${spot.slice(1)}` : ROULETTE_OUTSIDE.find((o) => o[0] === spot)?.[1] ?? spot);
export const MWHEEL_NAMES = { 1: '1', 2: '2', 5: '5', 10: '10', 20: '20', joker: 'COMODÍN', logo: 'LOGO' };
export const SIDE_NAMES = { player: 'JUGADOR', banker: 'BANCO', tie: 'EMPATE' };
export const fmtX = (n) => `×${String(Math.round(n * 100) / 100).replace('.', ',')}`;
export const fmtMult = (m) => `${(m / 100).toFixed(2)}x`;
export const wheelLabel = (v) => (v === 'again' ? 'OTRA VEZ' : `${String(v).replace('.', ',')}x`);
const signed = (pay, bet) => (pay >= bet ? `+${fmtMoney(pay - bet)}` : `−${fmtMoney(bet - pay)}`);

// Lo que cada pantalla lleva de cada mesa: la apuesta que se escribe y lo elegido.
export function newUi(kind, day = 1) {
  return { amount: limitsFor(kind, day)[0], typed: false, spot: 'red', pick: 0, picks: [], side: 'player', mspot: '1', mines: 3 };
}

const STEP_SET = new Set(STEP_KINDS);

// En qué anda la mesa: `canBet` (se puede escribir y apostar), `busy` (hay una ronda o una animación en marcha) y, en los de una
// tirada, cuánto va de la animación (`elapsed`, en ms) y si terminó (`shown`). `t` puede ser null: nadie juega ahí.
export function phaseOf(kind, t, room, now) {
  const over = room.day.over;
  if (!t) return { canBet: !over, busy: false, played: false, elapsed: 0, shown: false };
  if (kind === 'bj') {
    const canBet = !over && ((t.phase === 'bet' && !t.ready) || (t.phase === 'result' && now >= t.resultAt + RESULT_MS));
    return { canBet, busy: t.phase === 'play', played: t.n > 0, elapsed: 0, shown: t.phase === 'result' };
  }
  if (kind === 'craps') {
    const busy = t.bet > 0 && !t.res;
    return { canBet: !over && !busy, busy, played: t.bet > 0, elapsed: 0, shown: Boolean(t.res) };
  }
  if (STEP_SET.has(kind)) {
    let busy = t.bet > 0 && !t.res;
    if (kind === 'crash' && busy && crashMultAt(now - t.at) >= t.point) busy = false; // ya chocó: falta que se anote
    return { canBet: !over && !busy && !(kind === 'crash' && t.bet > 0 && !t.res), busy, played: t.bet > 0, elapsed: now - t.at, shown: Boolean(t.res) };
  }
  // de una tirada
  const played = t.bet > 0;
  const pending = played && !t.paid;
  const elapsed = pending ? now - t.at : played ? Infinity : 0;
  const running = pending && elapsed < t.ms;
  return { canBet: !over && !pending, busy: pending, running, played, elapsed, shown: played && !running };
}

// ¿Se puede tocar este botón ahora? (`btn` sin el prefijo de la mesa: `k:7`, `a:hit`, `s:red`…)
export function isEnabled(btn, ui, { kind, t, room, now }) {
  const ph = phaseOf(kind, t, room, now);
  const [type, val] = splitBtn(btn);
  if (type === 'k' || type === 'q') return ph.canBet;
  if (type === 's' || type === 'd' || type === 'n' || type === 'b' || type === 'w' || type === 'm') return ph.canBet;
  if (type === 'c') return Boolean(kind === 'mines' && t && ph.busy && !t.open.includes(Number(val)));
  if (type !== 'a') return false;
  const running = Boolean(t && ph.busy);
  switch (val) {
    case 'play': return ph.canBet && (kind !== 'keno' || ui.picks.length > 0);
    case 'hit': case 'stand': return Boolean(kind === 'bj' && t && t.phase === 'play' && t.st === 'play');
    case 'double': return Boolean(kind === 'bj' && t && t.phase === 'play' && t.st === 'play' && t.hand.length === 2 && room.money >= t.bet);
    case 'roll': return kind === 'craps' && running;
    case 'cash':
      if (!running) return false;
      if (kind === 'crash') return true;
      if (kind === 'penguin') return t.pos >= 1;
      if (kind === 'mines') return t.open.length > 0;
      if (kind === 'hilo') return t.n > 0;
      return false;
    case 'step': return kind === 'penguin' && running;
    case 'hi': case 'lo': return kind === 'hilo' && running && hiloOdds(t.card, val) > 0;
    case 'clear': case 'lucky': return kind === 'keno' && ph.canBet;
    default: return false;
  }
}

export const splitBtn = (btn) => { const i = btn.indexOf(':'); return [btn.slice(0, i), btn.slice(i + 1)]; };

// La apuesta escrita, revisada: devuelve `{ amount }` o `{ toast, ui? }` si no vale.
function takeBet(kind, ui, room) {
  const day = room.day.n;
  const lim = betLimits(kind, room.money, day);
  const range = limitsFor(kind, day);
  if (!lim) return { toast: `Con menos de ${fmtMoney(range[0])} en la caja no se puede apostar.` };
  if (ui.amount < lim.min) return { toast: `La apuesta mínima es ${fmtMoney(lim.min)}.` };
  if (ui.amount > lim.max) return { toast: `La apuesta máxima es ${fmtMoney(lim.max)}.`, ui: { ...ui, amount: lim.max, typed: false } };
  return { amount: ui.amount };
}

// Apretar un botón: devuelve `{ ui, action?, toast?, roll? }`. `action` es lo que se manda a la sala (sin `playerId`);
// `roll` avisa que hay que tirar los dados del craps (los tira la pantalla). `rand` solo lo usa «al azar» del keno.
export function press(btn, ui, { kind, t, room, now, rand = Math.random }) {
  const ctx = { kind, t, room, now };
  if (!isEnabled(btn, ui, ctx)) return { ui };
  const [type, val] = splitBtn(btn);
  const day = room.day.n;
  if (type === 'k') {
    if (val === 'C') return { ui: { ...ui, amount: 0, typed: false } };
    return { ui: { ...ui, amount: Math.min(999999999999, Number((ui.typed ? String(ui.amount) : '') + val) || 0), typed: true } };
  }
  if (type === 'q') return { ui: { ...ui, amount: quickBet(kind, val, room.money, day), typed: false } };
  if (type === 's') return isSpot(val) ? { ui: { ...ui, spot: val } } : { ui };
  if (type === 'd') return { ui: { ...ui, pick: Number(val) } };
  if (type === 'b') return { ui: { ...ui, side: val } };
  if (type === 'w') return { ui: { ...ui, mspot: val } };
  if (type === 'm') return { ui: { ...ui, mines: Number(val) } };
  if (type === 'n') {
    const n = Number(val);
    if (ui.picks.includes(n)) return { ui: { ...ui, picks: ui.picks.filter((x) => x !== n) } };
    if (ui.picks.length >= KENO_MAX_PICK) return { ui, toast: `Se eligen hasta ${KENO_MAX_PICK} números.` };
    return { ui: { ...ui, picks: [...ui.picks, n] } };
  }
  if (type === 'c') return { ui, action: { type: 'minesPick', i: Number(val) } };

  switch (val) {
    case 'clear': return { ui: { ...ui, picks: [] } };
    case 'lucky': {
      const pool = Array.from({ length: KENO_N }, (_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return { ui: { ...ui, picks: pool.slice(0, ui.picks.length || 5) } };
    }
    case 'hit': return { ui, action: { type: 'bjHit' } };
    case 'stand': return { ui, action: { type: 'bjStand' } };
    case 'double': return { ui, action: { type: 'bjDouble' } };
    case 'roll': return { ui, roll: true };
    case 'step': return { ui, action: { type: 'penguinStep' } };
    case 'hi': case 'lo': return { ui, action: { type: 'hiloGuess', dir: val } };
    case 'cash': {
      if (kind === 'crash') {
        const mult = Math.min(crashMultAt(now - t.at), t.point - 1);
        return mult >= 100 ? { ui, action: { type: 'crashCash', mult } } : { ui };
      }
      return { ui, action: { type: `${kind}Cash` } };
    }
    case 'play': {
      const bet = takeBet(kind, ui, room);
      if (!bet.amount) return { ui: bet.ui || ui, toast: bet.toast };
      const amount = bet.amount;
      const typed = { ...ui, typed: false };
      if (kind === 'bj') return { ui: typed, action: { type: 'bjBet', amount } };
      if (kind === 'craps') return { ui: typed, action: { type: 'crapsBet', amount } };
      if (kind === 'crash') return { ui: typed, action: { type: 'crashLaunch', amount } };
      if (kind === 'penguin') return { ui: typed, action: { type: 'penguinBet', amount } };
      if (kind === 'mines') return { ui: typed, action: { type: 'minesBet', amount, mines: ui.mines } };
      if (kind === 'hilo') return { ui: typed, action: { type: 'hiloBet', amount } };
      if (kind === 'roulette') return { ui: typed, action: { type: 'spin', amount, spot: ui.spot } };
      if (kind === 'duck') return { ui: typed, action: { type: 'spin', amount, pick: ui.pick } };
      if (kind === 'keno') return { ui: typed, action: { type: 'spin', amount, picks: ui.picks } };
      if (kind === 'baccarat') return { ui: typed, action: { type: 'spin', amount, side: ui.side } };
      if (kind === 'mwheel') return { ui: typed, action: { type: 'spin', amount, spot: ui.mspot } };
      return { ui: typed, action: { type: 'spin', amount } };
    }
    default: return { ui };
  }
}

// Enter (o el botón principal): JUGAR si se puede apostar; si no, lo que sigue en la ronda (tirar, saltar o retirar).
export function mainButton(kind, ui, ctx) {
  if (isEnabled('a:play', ui, ctx)) return 'a:play';
  for (const b of ['a:roll', 'a:step', 'a:cash']) if (isEnabled(b, ui, ctx)) return b;
  return 'a:play';
}

// Lo que dice el cartel de la mesa: `{ text, tone }` (tone: '', 'win', 'lose', 'push'). `who` es el nombre del que juega si
// no soy yo (la mesa de otro).
export function statusOf(ui, { kind, t, room, now }, who = '') {
  const ph = phaseOf(kind, t, room, now);
  if (room.day.over && !(t && ph.busy)) return { text: 'Se terminó el día', tone: '' };
  if (!t) return { text: idleText(kind), tone: '' };
  const head = who ? `${who}: ` : '';
  const res = (text, tone) => ({ text: head + text, tone });
  const win = (pay, bet) => (pay > bet ? 'win' : pay === bet ? 'push' : 'lose');
  switch (kind) {
    case 'bj': {
      if (t.phase === 'play' && t.st === 'play') return res(`Tenés ${handValue(t.hand).total}: pedí, plantate o doblá`, '');
      if (t.phase === 'play') return res('Juega el croupier…', '');
      if (t.phase === 'result') {
        const label = { win: '¡GANASTE!', bj: '¡BLACKJACK!', push: 'EMPATE', lose: 'PERDISTE', bust: 'TE PASASTE' }[t.res];
        return res(`${label} ${t.res === 'push' ? 'apuesta devuelta' : signed(t.pay, t.bet)}`, t.res === 'push' ? 'push' : t.pay > t.bet ? 'win' : 'lose');
      }
      return res(idleText(kind), '');
    }
    case 'craps': {
      if (t.res) return res(`${t.res === 'win' ? '¡GANASTE!' : 'PERDISTE'} Salió ${t.dice[0] + t.dice[1]} · ${signed(t.pay, t.bet)}`, t.res === 'win' ? 'win' : 'lose');
      if (ph.busy && t.point) return res(`Punto ${t.point}: ganás si sale el ${t.point}, perdés con 7`, '');
      if (ph.busy) return res('¡Tirá los dados! 7 u 11 gana, 2, 3 o 12 pierde', '');
      return res(idleText(kind), '');
    }
    case 'crash': {
      if (ph.busy) return res('¡Despegó! Retirá antes de que choque', '');
      if (t.res === 'win') return res(`¡RETIRASTE! a ${fmtMult(t.cash)} · +${fmtMoney(t.pay - t.bet)}`, 'win');
      if (t.bet > 0) return res(`¡CHOCÓ! a ${fmtMult(t.point)} · −${fmtMoney(t.bet)}`, 'lose');
      return res(idleText(kind), '');
    }
    case 'penguin': {
      if (ph.busy) return res(t.pos ? `Cubo ${t.pos + 1} de ${PENGUIN_CUBES} · llevás ${fmtMoney(penguinPay(t.bet, t.pos))}` : 'Apostaste: ¡hacelo saltar!', '');
      if (t.res === 'fall') return res(`¡AL AGUA! · −${fmtMoney(t.bet)}`, 'lose');
      if (t.res === 'win') return res(`¡CRUZÓ TODO! ${fmtX(penguinMult(t.pos))} · ${signed(t.pay, t.bet)}`, 'win');
      if (t.res === 'cash') return res(`¡RETIRASTE! ${fmtX(penguinMult(t.pos))} · ${signed(t.pay, t.bet)}`, win(t.pay, t.bet));
      return res(idleText(kind), '');
    }
    case 'mines': {
      const safe = t.open?.length || 0;
      if (ph.busy) return res(safe ? `Llevás ${fmtMoney(minesPay(t.bet, t.count, safe))} (${fmtX(minesMult(t.count, safe))})` : 'Destapá un casillero. ¡Cuidado con las minas!', '');
      if (t.res === 'lose') return res(`¡BOOM! Pisaste una mina · −${fmtMoney(t.bet)}`, 'lose');
      if (t.res === 'win') return res(`¡LIMPIASTE EL TABLERO! ${signed(t.pay, t.bet)}`, 'win');
      if (t.res === 'cash') return res(`¡RETIRASTE! ${signed(t.pay, t.bet)}`, win(t.pay, t.bet));
      return res(idleText(kind), '');
    }
    case 'hilo': {
      if (ph.busy) return res(t.n ? `Llevás ${fmtMoney(Math.floor(t.bet * t.m))} (${fmtX(t.m)}). ¿Mayor, menor o retirás?` : '¿La que sigue es mayor o menor?', '');
      if (t.res === 'lose') return res(`Perdiste · −${fmtMoney(t.bet)}`, 'lose');
      if (t.res === 'cash') return res(`¡RETIRASTE! ${fmtX(t.m)} · ${signed(t.pay, t.bet)}`, 'win');
      return res(idleText(kind), '');
    }
    default: break;
  }
  // de una tirada
  if (ph.running) return res({ slots: 'Girando…', wheel: 'Girando…', roulette: 'No va más…', duck: '¡Largaron!', keno: 'Saliendo los números…', plinko: 'Cae la bolita…', mwheel: 'Girando…', baccarat: 'Repartiendo…' }[kind] || '…', '');
  if (!ph.played) return res(idleText(kind), '');
  const tone = win(t.pay, t.bet);
  const money = signed(t.pay, t.bet);
  switch (kind) {
    case 'slots': return res(t.pay ? `¡PREMIO! ${money}` : `Nada esta vez · ${money}`, tone);
    case 'wheel': return res(`${wheelLabel(WHEEL[t.spins[t.spins.length - 1]])} · ${money}`, tone);
    case 'roulette': return res(`Salió el ${t.n} (${{ red: 'rojo', black: 'negro', green: 'verde' }[colorOf(t.n)]}) · ${money}`, tone);
    case 'duck': return res(`Ganó ${DUCKS[t.win]} · ${money}`, tone);
    case 'keno': return res(`${t.hits} ${t.hits === 1 ? 'acierto' : 'aciertos'} · ${money}`, tone);
    case 'plinko': return res(`${fmtX(t.pay / Math.max(1, t.bet))} · ${money}`, tone);
    case 'mwheel': return res(`Salió ${MWHEEL_NAMES[MWHEEL[t.seg]]} · ${money}`, tone);
    case 'baccarat': return res(`${{ player: 'Jugador', banker: 'Banco', tie: 'Empate' }[t.res]} ${handTotal(t.p)} a ${handTotal(t.b)} · ${money}`, tone);
    default: return res(money, tone);
  }
}

function idleText(kind) {
  return {
    bj: 'Escribí tu apuesta y tocá JUGAR',
    slots: 'Escribí tu apuesta y tocá GIRAR',
    wheel: 'Escribí tu apuesta y tocá GIRAR',
    roulette: 'Elegí en el paño, apostá y tocá JUGAR',
    duck: 'Elegí un pato, apostá y tocá LARGAR',
    craps: 'Apostá a la línea de pase y tirá',
    crash: 'Apostá y tocá LANZAR',
    penguin: 'Apostá y hacé saltar al pingüino',
    keno: 'Elegí de 1 a 10 números y tocá JUGAR',
    plinko: 'Apostá y tocá SOLTAR',
    mwheel: 'Elegí un casillero, apostá y tocá GIRAR',
    baccarat: 'Elegí jugador, banco o empate y tocá REPARTIR',
    hilo: 'Apostá: sale una carta y adivinás',
    mines: 'Elegí cuántas minas, apostá y tocá APOSTAR',
  }[kind] || 'Apostá y jugá';
}

// Lo que muestra la pantalla del teclado: la apuesta escrita, o la que está en juego.
export function shownAmount(ui, { kind, t, room, now }) {
  const ph = phaseOf(kind, t, room, now);
  if (t && !ph.canBet && t.bet > 0) return t.bet;
  return ui.amount;
}

// Lo que se puede elegir en cada juego (para armar las mesas y para los tests).
export const CHOICES = {
  roulette: [...Array.from({ length: 37 }, (_, n) => `s:n${n}`), ...ROULETTE_OUTSIDE.map(([s]) => `s:${s}`)],
  duck: DUCKS.map((_, i) => `d:${i}`),
  keno: Array.from({ length: KENO_N }, (_, i) => `n:${i}`),
  baccarat: BACCARAT_SIDES.map((s) => `b:${s}`),
  mwheel: MWHEEL_SPOTS.map((s) => `w:${s}`),
  mines: [...MINES_OPTIONS.map((m) => `m:${m}`), ...Array.from({ length: MINES_SIZE }, (_, i) => `c:${i}`)],
};

// ¿Está elegido? (para pintar marcado lo que eligió cada uno). En una ronda en marcha manda lo de la sala.
export function isPicked(btn, ui, { kind, t, room, now }) {
  const [type, val] = splitBtn(btn);
  const ph = phaseOf(kind, t, room, now);
  const live = t && (ph.busy || ph.shown) && t.bet > 0;
  if (type === 's') return (live && t.spot ? t.spot : ui.spot) === val;
  if (type === 'd') return (live && Number.isInteger(t.pick) ? t.pick : ui.pick) === Number(val);
  if (type === 'n') return (live && t.picks ? t.picks : ui.picks).includes(Number(val));
  if (type === 'b') return (live && t.side ? t.side : ui.side) === val;
  if (type === 'w') return (live && t.spot ? t.spot : ui.mspot) === val;
  if (type === 'm') return (live && t.count ? t.count : ui.mines) === Number(val);
  return false;
}

// Lo que se gana o se pierde en la ronda que terminó, para mostrarlo flotando arriba de la mesa: `{ text, tone }` o null
// mientras se juega (o si nadie jugó).
export function resultOf({ kind, t, room, now }) {
  if (!t || !(t.bet > 0)) return null;
  const ph = phaseOf(kind, t, room, now);
  if (!ph.shown || ph.busy) return null;
  const delta = (t.pay || 0) - t.bet;
  if (delta > 0) return { text: `+${fmtMoney(delta)}`, tone: 'win' };
  if (delta < 0) return { text: `−${fmtMoney(-delta)}`, tone: 'lose' };
  return { text: 'EMPATE', tone: 'push' };
}
