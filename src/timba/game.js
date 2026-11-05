// La Timba: reducer de la sala. Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y
// devuelve null si la acción no vale.
//
// Acá va lo que se comparte y se decide de a uno: la plata y los tickets (de todos), el día y su reloj, dónde
// está cada jugador (`loc`), el ascensor, los viajes y las mesas del casino (`room.tb`). Dónde está parado cada uno
// y para qué lado mira va en tiempo real (TimbaGame.jsx): cada pantalla es dueña de su jugador.
//
// Los lugares (`loc`): `wait` (la casita, la camioneta y la limusina de la sala de espera), `limo` (arriba de la
// limusina, esperando salir), `outside` (la puerta del casino), `back` (arriba de la limusina de la puerta del
// casino, esperando para volver a casa), `elevator` y `f1`…`f4` (los pisos de juego: se abren de a uno cada 3 días, ver `casinos.js`). Cada
// jugador pasa de uno a otro con `loc`, y los viajes (limusina, ascensor) los arrancan cuando están todos adentro.
//
// Las mesas: `room.tb[id]` existe solo mientras alguien juega ahí (cada una es de uno solo). Tiene `kind`, `by` (quién
// juega) y lo del juego. El blackjack y el craps se juegan por pasos; la tragamonedas, la rueda, la ruleta y los patos
// se juegan de una tirada: `spin` descuenta la apuesta y deja el resultado a la vista (con `at` y `ms` para la
// animación), y `settle` cobra cuando terminó. Si el jugador se va antes, se cobra al toque.
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { RESHUFFLE_UNDER, dealerPlay, freshDeck, handValue, isNatural, payoutFor } from './bj.js';
import {
  DUCK_PAY, SPIN_KINDS, WHEEL, betLimits, crapsStep, isSpot, raceDucks, roulettePays, slotsEval, spinRoulette, spinSlots, spinWheel, validDice,
} from './games.js';
import { floorOfLoc, floorsOfDay, locOfFloor } from './casinos.js';
import { TOTAL_DAYS, quotaFor } from './quota.js';
import { NEW_SPIN_KINDS, STEP_KINDS, newSpin } from './newgames.js';
import { applyStepAction, newStepTable, releaseStep } from './newtables.js';
import { FLOOR_OF_TABLE, TABLE_BY_ID } from './scenes.js';

export const GAME_TYPE = 'timba';
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 1;

export const START_MONEY = 1000;
export const START_TICKETS = 15;
export const START_QUOTA = quotaFor(1, START_MONEY); // $1.200 (ver quota.js)
export const DAY_MS = 5 * 60 * 1000; // lo que dura cada día en el casino
export const LIMO_MS = 5200;         // la limusina cierra la puerta y se va
export const ELEV_MS = 2600;         // el ascensor sube o baja
export const HOME_MS = 4500;         // la vuelta a casa al terminar el día
export const RESULT_MS = 2200;       // cuánto se ven los resultados de una mano antes de poder apostar de nuevo
export const SLOTS_MS = 2800;        // lo que tarda en girar la tragamonedas
export const WHEEL_SPIN_MS = 4200;   // cada giro de la rueda de la fortuna
export const ROULETTE_MS = 7000;     // lo que tarda la bolita de la ruleta en frenar
export const DUCK_END_MS = 1200;     // después de que llega el último pato

export const COLORS = ['#e0525a', '#4a9be8', '#5ec46b', '#f0c33c', '#b46bf0', '#f08a3c', '#3fd0c4', '#f07ab8'];

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;


function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, loc: 'wait' };
}

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    players: [newPlayer(hostId, hostName, avatar, COLORS[0])],
    run: 0,
    money: START_MONEY,
    tickets: START_TICKETS,
    day: { n: 1, quota: START_QUOTA, endsAt: 0, over: false, last: null },
    elev: { floor: 0 },
    trip: null,
    tb: {},
    net: {},
    createdAt: now,
    updatedAt: now,
  };
}

const freeColor = (room) => COLORS.find((c) => !room.players.some((p) => p.color === c)) || COLORS[room.players.length % COLORS.length];

function resetRun(next) {
  Object.assign(next, {
    run: (next.run || 0) + 1, money: START_MONEY, tickets: START_TICKETS, trip: null,
    day: { n: 1, quota: START_QUOTA, endsAt: 0, over: false, last: null }, elev: { floor: 0 }, tb: {}, net: {},
  });
  for (const p of next.players) p.loc = 'wait';
}

export const allAt = (room, loc) => room.players.length > 0 && room.players.every((p) => p.loc === loc);

function startTrip(next, kind, to, now) {
  next.trip = { kind, to, at: now, ms: kind === 'limo' ? LIMO_MS : kind === 'home' ? HOME_MS : ELEV_MS };
}

// ─── Mesas ───────────────────────────────────────────────────────────────────
const SPIN_SET = new Set(SPIN_KINDS);
// La mesa donde está sentado un jugador: [id, estado] (o [null, null]).
export function tableOfPlayer(room, id) {
  for (const [tid, t] of Object.entries(room.tb)) if (t.by === id) return [tid, t];
  return [null, null];
}

function newTable(kind, by) {
  const base = { kind, by, bet: 0 };
  if (kind === 'bj') return { ...base, phase: 'bet', n: 0, ready: false, hand: [], dealer: [], deck: [], st: 'idle', dbl: false, pay: 0, res: '', resultAt: 0 };
  if (kind === 'craps') return { ...base, point: 0, dice: [], n: 0, res: '', pay: 0 };
  if (STEP_KINDS.includes(kind)) return newStepTable(kind, base);
  return { ...base, pay: 0, at: 0, ms: 0, paid: true };
}

// Lo que se juega de una tirada: cobra el premio y lo anota.
function settleSpin(next, t) {
  next.money += t.pay;
  next.net[t.by] = (next.net[t.by] || 0) + t.pay - t.bet;
  t.paid = true;
}

// El jugador deja la mesa (se levanta, se va de la sala o se acaba el día): lo que esté en marcha se juega o se devuelve.
function releaseTable(next, tid, now, rand) {
  const t = next.tb[tid];
  if (!t) return;
  if (t.kind === 'bj') {
    if (t.phase === 'bet' && t.ready) next.money += t.bet;
    else if (t.phase === 'play') { if (t.st === 'play') t.st = 'stand'; finishIfDone(next, t, now, rand); }
  } else if (t.kind === 'craps') {
    if (t.bet && !t.res) next.money += t.bet;
  } else if (STEP_KINDS.includes(t.kind)) releaseStep(next, t, now);
  else if (!t.paid) settleSpin(next, t);
  delete next.tb[tid];
}

function leaveTable(next, id, now, rand) {
  const [tid] = tableOfPlayer(next, id);
  if (tid) releaseTable(next, tid, now, rand);
}

// Se acaba el día: se levanta a todos.
function closeTables(next, now, rand) {
  for (const tid of Object.keys(next.tb)) releaseTable(next, tid, now, rand);
}

// ─── Blackjack ───────────────────────────────────────────────────────────────
function draw(t, rand) {
  if (!t.deck.length) t.deck = freshDeck(rand);
  return t.deck.pop();
}

function dealRound(next, t, now, rand) {
  if (t.deck.length < RESHUFFLE_UNDER) t.deck = freshDeck(rand);
  t.n += 1;
  t.phase = 'play';
  t.dealer = [draw(t, rand), draw(t, rand)];
  t.hand = [draw(t, rand), draw(t, rand)];
  t.st = isNatural(t.hand) ? 'stand' : 'play';
  finishIfDone(next, t, now, rand);
}

// Cuando el jugador no tiene que decidir nada, juega el croupier y se paga la mano.
function finishIfDone(next, t, now, rand) {
  if (t.phase !== 'play' || t.st === 'play') return;
  if (t.st !== 'bust') dealerPlay(t.dealer, () => draw(t, rand));
  const pay = payoutFor(t.bet, t.hand, t.dealer, t.st === 'bust');
  next.money += pay;
  next.net[t.by] = (next.net[t.by] || 0) + pay - t.bet;
  t.pay = pay;
  t.res = pay > t.bet ? 'win' : pay === t.bet ? 'push' : 'lose';
  if (t.st === 'bust') t.res = 'bust';
  else if (isNatural(t.hand) && t.res === 'win') t.res = 'bj';
  t.phase = 'result';
  t.resultAt = now;
}

// ─── Jugadores que entran, salen o se van ───────────────────────────────────
function removePlayer(next, id, now, rand) {
  leaveTable(next, id, now, rand);
  next.players = next.players.filter((p) => p.id !== id);
  if (!next.players.length) return;
  if (next.hostId === id) next.hostId = next.players[0].id;
  // Si ya estaban todos arriba de la limusina menos el que se fue, se van.
  if (next.phase !== 'playing' || next.trip) return;
  if (!next.day.over && allAt(next, 'limo')) startTrip(next, 'limo', 'outside', now);
  else if (allAt(next, 'back')) startTrip(next, 'home', 'wait', now);
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  // El anfitrión saca a alguien: es su `leave`, y con esa pantalla no puede volver a entrar.
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'playing', 'ended']);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left && left !== room ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = JSON.parse(JSON.stringify(room));
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const playing = next.phase === 'playing';

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        break;
      }
      if (next.phase !== 'lobby' || next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next)));
      break;
    }

    case 'leave': {
      if (!me) return null;
      removePlayer(next, me.id, now, rand);
      break;
    }

    // Lo manda el anfitrión por alguien que dejó de mandar señales (pestaña cerrada sin salir).
    case 'gone': {
      const target = findPlayer(next, action.target);
      if (!host || !playing || !target || target.id === action.playerId) return null;
      removePlayer(next, target.id, now, rand);
      break;
    }

    case 'start': {
      if (!host || !['lobby', 'ended'].includes(next.phase) || next.players.length < MIN_PLAYERS) return null;
      resetRun(next);
      next.phase = 'playing';
      break;
    }

    case 'toLobby': {
      if (!host || next.phase !== 'ended') return null;
      next.phase = 'lobby';
      break;
    }

    // Cambiar de lugar caminando (subir a la limusina, entrar al casino, salir del ascensor…). Una vez que arrancó el
    // día (se viajó a un piso de juego), desde la puerta del casino también se puede subir a la limusina para volver.
    case 'loc': {
      if (!playing || !me || next.trip) return null;
      const to = action.to;
      const from = me.loc;
      const here = locOfFloor(next.elev.floor); // donde está parado el ascensor
      const ok = (from === 'wait' && to === 'limo' && !next.day.over)
        || (from === 'limo' && to === 'wait')
        || (from === 'outside' && to === 'back' && next.day.endsAt > 0)
        || (from === 'back' && to === 'outside')
        || (from === here && to === 'elevator')                                          // entrar al ascensor, desde la puerta del casino o desde un piso
        || (from === 'elevator' && to === here && (!next.day.over || here === 'outside')); // salir; con el día terminado solo se abre en el lobby
      if (!ok) return null;
      if (floorOfLoc(from) !== null) leaveTable(next, me.id, now, rand);
      me.loc = to;
      if (to === 'limo' && allAt(next, 'limo')) startTrip(next, 'limo', 'outside', now);
      if (to === 'back' && allAt(next, 'back')) startTrip(next, 'home', 'wait', now);
      break;
    }

    // El panel del ascensor: todos adentro y el viaje es de todos. Con el día terminado solo se puede ir al lobby.
    case 'floor': {
      const to = action.to;
      if (!playing || !me || next.trip || !allAt(next, 'elevator')) return null;
      if (!Number.isInteger(to) || (to !== 0 && !floorsOfDay(next.day.n).includes(to)) || to === next.elev.floor) return null; // solo los pisos que ya se ganaron
      if (next.day.over && to !== 0) return null;
      if (!next.day.endsAt && to > 0) next.day.endsAt = now + DAY_MS; // el día arranca con el primer viaje a un piso de juego
      startTrip(next, 'elev', to, now);
      break;
    }

    // La pantalla que ve el reloj en cero lo manda: termina el viaje o el día. La transacción deja pasar al primero.
    case 'tick': {
      if (!playing) return null;
      const t = next.trip;
      if (t) {
        if (now < t.at + t.ms) return null;
        next.trip = null;
        if (t.kind === 'limo') {
          for (const p of next.players) p.loc = 'outside';
          next.elev.floor = 0;
        } else if (t.kind === 'elev') {
          next.elev.floor = t.to;
        } else {
          // De vuelta en casa: si juntaron la cuota, sigue otro día (la cuota nueva sale de la plata que hay ahora en la
          // caja); si era el último día, ganaron; si no la juntaron, se terminó (game over).
          const { money, day } = next;
          if (money >= day.quota && day.n >= TOTAL_DAYS) {
            next.day.last = { n: day.n, money, quota: day.quota, won: true };
            next.phase = 'ended';
          } else if (money >= day.quota) {
            const quota = quotaFor(day.n + 1, money);
            next.day = { n: day.n + 1, quota, endsAt: 0, over: false, last: { n: day.n, money, quota: day.quota, next: quota } };
            next.elev.floor = 0;
            for (const p of next.players) p.loc = 'wait';
          } else {
            next.day.last = { n: day.n, money, quota: day.quota, lost: true };
            next.phase = 'ended';
          }
        }
      } else if (next.day.endsAt && !next.day.over && now >= next.day.endsAt) {
        closeTables(next, now, rand);
        next.day.over = true;
        for (const p of next.players) if (floorOfLoc(p.loc) !== null) p.loc = 'elevator'; // los que siguen adentro vuelven al ascensor
      } else return null;
      break;
    }

    // Sentarse en una mesa o máquina: es de uno solo, así que si hay alguien jugando está ocupada.
    case 'sit': {
      const spot = TABLE_BY_ID[action.table];
      if (!playing || !me || !spot || me.loc !== locOfFloor(FLOOR_OF_TABLE[spot.id]) || next.day.over) return null;
      const [mine] = tableOfPlayer(next, me.id);
      if (mine === spot.id) break;
      if (mine || next.tb[spot.id]) return null;
      next.tb[spot.id] = newTable(spot.kind, me.id);
      break;
    }

    // Levantarse: en medio de una mano de blackjack no se puede.
    case 'stand': {
      const [tid, t] = tableOfPlayer(next, me?.id);
      if (!playing || !t) return null;
      if (t.kind === 'bj' && t.phase === 'play' && t.st === 'play') return null;
      releaseTable(next, tid, now, rand);
      break;
    }

    // Blackjack: apostar y confirmar con JUGAR reparte.
    case 'bjBet': {
      const [, t] = tableOfPlayer(next, me?.id);
      const amount = action.amount;
      if (!playing || t?.kind !== 'bj' || next.day.over || !Number.isInteger(amount)) return null;
      if (t.phase === 'result') {
        if (now < t.resultAt + RESULT_MS) return null;
        Object.assign(t, { phase: 'bet', dealer: [], bet: 0, ready: false, hand: [], st: 'idle', dbl: false, pay: 0, res: '' });
      }
      if (t.phase !== 'bet' || t.ready) return null;
      const lim = betLimits('bj', next.money, next.day.n);
      if (!lim || amount < lim.min || amount > lim.max) return null;
      next.money -= amount;
      t.bet = amount;
      t.ready = true;
      dealRound(next, t, now, rand);
      break;
    }

    case 'bjHit':
    case 'bjStand':
    case 'bjDouble': {
      const [, t] = tableOfPlayer(next, me?.id);
      if (!playing || t?.kind !== 'bj' || t.phase !== 'play' || t.st !== 'play') return null;
      if (action.type === 'bjStand') t.st = 'stand';
      else {
        if (action.type === 'bjDouble') {
          if (t.hand.length !== 2 || next.money < t.bet) return null;
          next.money -= t.bet;
          t.bet *= 2;
          t.dbl = true;
        }
        t.hand.push(draw(t, rand));
        const total = handValue(t.hand).total;
        if (total > 21) t.st = 'bust';
        else if (total === 21 || t.dbl) t.st = 'stand';
      }
      finishIfDone(next, t, now, rand);
      break;
    }

    // Tragamonedas, rueda, ruleta y patos: se apuesta y el resultado queda a la vista mientras pasa la animación.
    case 'spin': {
      const [, t] = tableOfPlayer(next, me?.id);
      const amount = action.amount;
      if (!playing || !t || !SPIN_SET.has(t.kind) || next.day.over || !t.paid || !Number.isInteger(amount)) return null;
      const lim = betLimits(t.kind, next.money, next.day.n);
      if (!lim || amount < lim.min || amount > lim.max) return null;
      if (t.kind === 'roulette' && !isSpot(action.spot)) return null;
      if (t.kind === 'duck' && !(Number.isInteger(action.pick) && action.pick >= 0 && action.pick < 4)) return null;
      const ext = NEW_SPIN_KINDS.includes(t.kind) ? newSpin(t.kind, action, rand) : undefined;
      if (ext === null) return null;
      next.money -= amount;
      Object.assign(t, { bet: amount, paid: false, at: now, pay: 0 });
      if (ext) {
        Object.assign(t, ext.state);
        t.pay = Math.floor(amount * ext.mult + 1e-9);
        t.ms = ext.ms;
      } else if (t.kind === 'slots') {
        t.grid = spinSlots(rand);
        t.pay = Math.round(amount * slotsEval(t.grid).mult);
        t.ms = SLOTS_MS;
      } else if (t.kind === 'wheel') {
        t.spins = spinWheel(rand);
        t.pay = Math.round(amount * WHEEL[t.spins[t.spins.length - 1]]);
        t.ms = t.spins.length * WHEEL_SPIN_MS + 600;
      } else if (t.kind === 'roulette') {
        t.spot = action.spot;
        t.n = spinRoulette(rand);
        t.pay = amount * roulettePays(t.spot, t.n);
        t.ms = ROULETTE_MS;
      } else {
        const race = raceDucks(rand);
        Object.assign(t, { pick: action.pick, times: race.times, win: race.win });
        t.pay = race.win === t.pick ? Math.floor(amount * DUCK_PAY) : 0;
        t.ms = Math.max(...race.times) + DUCK_END_MS;
      }
      break;
    }

    // Cobrar el premio cuando terminó la animación.
    case 'settle': {
      const [, t] = tableOfPlayer(next, me?.id);
      if (!playing || !t || !SPIN_SET.has(t.kind) || t.paid || now < t.at + t.ms) return null;
      settleSpin(next, t);
      break;
    }

    // Craps: se apuesta a la línea de pase y se tira hasta que se decide. Los dados los tira la pantalla (física en 3D) y
    // avisa cómo cayeron.
    case 'crapsBet': {
      const [, t] = tableOfPlayer(next, me?.id);
      const amount = action.amount;
      if (!playing || t?.kind !== 'craps' || next.day.over || !Number.isInteger(amount) || (t.bet && !t.res)) return null;
      const lim = betLimits('craps', next.money, next.day.n);
      if (!lim || amount < lim.min || amount > lim.max) return null;
      next.money -= amount;
      Object.assign(t, { bet: amount, point: 0, dice: [], res: '', pay: 0 });
      break;
    }

    case 'crapsRoll': {
      const [, t] = tableOfPlayer(next, me?.id);
      if (!playing || t?.kind !== 'craps' || !t.bet || t.res || !validDice(action.dice)) return null;
      const step = crapsStep(t.point, action.dice);
      t.dice = action.dice;
      t.n += 1;
      t.point = step.point;
      if (step.res) {
        t.res = step.res;
        t.pay = step.res === 'win' ? t.bet * 2 : 0;
        next.money += t.pay;
        next.net[t.by] = (next.net[t.by] || 0) + t.pay - t.bet;
      }
      break;
    }

    default: {
      // Los juegos por pasos del piso 2 en adelante (Crash, Penguin Cross, Buscaminas y Mayor o menor).
      const done = applyStepAction(next, me, action, { now, rand, playing });
      if (!done) return null;
    }
  }
  next.updatedAt = now;
  return next;
}

// Para la pantalla: qué falta para que se muestre cada cosa.
export const dayLeftMs = (room, now) => (room.day.endsAt && !room.day.over ? Math.max(0, room.day.endsAt - now) : 0);
export const fmtClock = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const fmtMoney = (n) => {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a < 1000) return `$${v}`;
  const [div, unit] = a >= 999995000 ? [1e9, 'B'] : a >= 999995 ? [1e6, 'M'] : [1e3, 'K'];
  const k = v / div;
  return `$${Number.isInteger(k) ? k : k.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}${unit}`;
};
