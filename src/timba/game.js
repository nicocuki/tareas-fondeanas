// La Timba: reducer de la sala. Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y
// devuelve null si la acción no vale.
//
// Acá va lo que se comparte y se decide de a uno: la plata y los tickets (de todos), el día y su reloj, dónde
// está cada jugador (`loc`), el ascensor, los viajes y la mesa de blackjack. Dónde está parado cada uno
// y para qué lado mira va en tiempo real (TimbaGame.jsx): cada pantalla es dueña de su jugador.
//
// Los lugares (`loc`): `wait` (la casita, la camioneta y la limusina de la sala de espera), `limo` (arriba de la
// limusina, esperando salir), `outside` (la puerta del casino), `elevator` y `f1` (el piso 1; los pisos
// que sigan serán `f2`…). Cada jugador pasa de uno a otro con `loc`, y los viajes (limusina, ascensor) los
// arrancan cuando están todos adentro.
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { RESHUFFLE_UNDER, betLimits, dealerPlay, freshDeck, handValue, isNatural, payoutFor } from './bj.js';

export const GAME_TYPE = 'timba';
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 1;

export const START_MONEY = 1000;
export const START_TICKETS = 15;
export const START_QUOTA = 1200;
export const DAY_MS = 5 * 60 * 1000; // lo que dura cada día en el casino
export const LIMO_MS = 5200;         // la limusina cierra la puerta y se va
export const ELEV_MS = 2600;         // el ascensor sube o baja
export const HOME_MS = 4500;         // la vuelta a casa al terminar el día
export const RESULT_MS = 2200;       // cuánto se ven los resultados de una mano antes de poder apostar de nuevo

export const COLORS = ['#e0525a', '#4a9be8', '#5ec46b', '#f0c33c', '#b46bf0', '#f08a3c', '#3fd0c4', '#f07ab8'];

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const nextQuota = (q) => Math.round((q * 1.5) / 50) * 50;
export const locOfFloor = (n) => (n === 0 ? 'outside' : `f${n}`);
export const floorOfLoc = (loc) => (/^f(\d+)$/.exec(loc) ? Number(/^f(\d+)$/.exec(loc)[1]) : null);

export const newBj = () => ({ phase: 'bet', n: 0, seats: [], dealer: [], deck: [], resultAt: 0 });

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
    floors: 1,
    day: { n: 1, quota: START_QUOTA, endsAt: 0, over: false, last: null },
    elev: { floor: 0 },
    trip: null,
    bj: newBj(),
    net: {},
    createdAt: now,
    updatedAt: now,
  };
}

const freeColor = (room) => COLORS.find((c) => !room.players.some((p) => p.color === c)) || COLORS[room.players.length % COLORS.length];

function resetRun(next) {
  Object.assign(next, {
    run: (next.run || 0) + 1, money: START_MONEY, tickets: START_TICKETS, floors: 1, trip: null,
    day: { n: 1, quota: START_QUOTA, endsAt: 0, over: false, last: null }, elev: { floor: 0 }, bj: newBj(), net: {},
  });
  for (const p of next.players) p.loc = 'wait';
}

export const allAt = (room, loc) => room.players.length > 0 && room.players.every((p) => p.loc === loc);

function startTrip(next, kind, to, now) {
  next.trip = { kind, to, at: now, ms: kind === 'limo' ? LIMO_MS : kind === 'home' ? HOME_MS : ELEV_MS };
}

// ─── Blackjack ───────────────────────────────────────────────────────────────
const seatOf = (room, id) => room.bj.seats.find((s) => s.id === id);

function draw(bj, rand) {
  if (!bj.deck.length) bj.deck = freshDeck(rand);
  return bj.deck.pop();
}

function dealRound(next, now, rand) {
  const bj = next.bj;
  if (bj.deck.length < RESHUFFLE_UNDER) bj.deck = freshDeck(rand);
  bj.n += 1;
  bj.phase = 'play';
  bj.dealer = [draw(bj, rand), draw(bj, rand)];
  for (const s of bj.seats) {
    s.hand = [draw(bj, rand), draw(bj, rand)];
    s.st = isNatural(s.hand) ? 'stand' : 'play';
  }
  finishIfDone(next, now, rand);
}

// Cuando nadie tiene que decidir nada, juega el croupier y se pagan las manos.
function finishIfDone(next, now, rand) {
  const bj = next.bj;
  if (bj.phase !== 'play' || bj.seats.some((s) => s.st === 'play')) return;
  const live = bj.seats.filter((s) => s.st !== 'bust');
  if (live.length) dealerPlay(bj.dealer, () => draw(bj, rand));
  for (const s of bj.seats) {
    const pay = payoutFor(s.bet, s.hand, bj.dealer, s.st === 'bust');
    next.money += pay;
    next.net[s.id] = (next.net[s.id] || 0) + pay - s.bet;
    s.pay = pay;
    s.res = pay > s.bet ? 'win' : pay === s.bet ? 'push' : 'lose';
    if (s.st === 'bust') s.res = 'bust';
    else if (isNatural(s.hand) && s.res === 'win') s.res = 'bj';
  }
  bj.phase = 'result';
  bj.resultAt = now;
  bj.seats = bj.seats.filter((s) => !s.gone);
}

function resetTable(bj) {
  bj.phase = 'bet';
  bj.dealer = [];
  for (const s of bj.seats) Object.assign(s, { bet: 0, ready: false, hand: [], st: 'idle', dbl: false, pay: 0, res: '' });
}

// El jugador deja la silla (cierra la mesa, se va de la sala o se acaba el día).
function leaveSeat(next, id, now, rand) {
  const bj = next.bj;
  const seat = seatOf(next, id);
  if (!seat) return;
  if (bj.phase === 'play' && seat.st === 'play') { seat.gone = true; seat.st = 'stand'; finishIfDone(next, now, rand); return; }
  if (bj.phase === 'play') { seat.gone = true; return; }
  if (bj.phase === 'bet' && seat.ready) next.money += seat.bet;
  bj.seats = bj.seats.filter((s) => s.id !== id);
  if (bj.phase === 'bet' && bj.seats.length && bj.seats.every((s) => s.ready)) dealRound(next, now, rand);
}

// Se acaba el día: se juega lo que esté en marcha y se levanta a todos de la mesa.
function closeTable(next, now, rand) {
  const bj = next.bj;
  if (bj.phase === 'bet') for (const s of bj.seats) if (s.ready) next.money += s.bet;
  if (bj.phase === 'play') {
    for (const s of bj.seats) if (s.st === 'play') s.st = 'stand';
    finishIfDone(next, now, rand);
  }
  next.bj = { ...newBj(), deck: next.bj.deck };
}

// ─── Jugadores que entran, salen o se van ───────────────────────────────────
function removePlayer(next, id, now, rand) {
  leaveSeat(next, id, now, rand);
  next.players = next.players.filter((p) => p.id !== id);
  if (!next.players.length) return;
  if (next.hostId === id) next.hostId = next.players[0].id;
  // Si ya estaban todos arriba de la limusina menos el que se fue, se van.
  if (next.phase === 'playing' && !next.trip && !next.day.over && allAt(next, 'limo')) startTrip(next, 'limo', 'outside', now);
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

    // Cambiar de lugar caminando (subir a la limusina, entrar al casino, salir del ascensor…).
    case 'loc': {
      if (!playing || !me || next.trip) return null;
      const to = action.to;
      const from = me.loc;
      const here = locOfFloor(next.elev.floor); // donde está parado el ascensor
      const ok = (from === 'wait' && to === 'limo' && !next.day.over)
        || (from === 'limo' && to === 'wait')
        || (from === here && to === 'elevator')                    // entrar al ascensor, desde la puerta del casino o desde un piso
        || (from === 'elevator' && to === here && !next.day.over); // salir; con el día terminado la puerta no abre
      if (!ok) return null;
      if (floorOfLoc(from) !== null) leaveSeat(next, me.id, now, rand);
      me.loc = to;
      if (to === 'limo' && allAt(next, 'limo')) startTrip(next, 'limo', 'outside', now);
      break;
    }

    // El panel del ascensor: todos adentro y el viaje es de todos. Con el día terminado solo se puede ir al lobby.
    case 'floor': {
      const to = action.to;
      if (!playing || !me || next.trip || !allAt(next, 'elevator')) return null;
      if (!Number.isInteger(to) || to < 0 || to > next.floors) return null;
      if (next.day.over) {
        if (to !== 0) return null;
        startTrip(next, 'home', 'wait', now);
      } else {
        if (to === next.elev.floor) return null;
        startTrip(next, 'elev', to, now);
      }
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
          next.day.endsAt = now + DAY_MS;
        } else if (t.kind === 'elev') {
          next.elev.floor = t.to;
        } else {
          // De vuelta en casa: si juntaron la cuota, sigue otro día con una cuota más alta; si no, se terminó.
          const { money, day } = next;
          if (money >= day.quota) {
            const quota = nextQuota(day.quota);
            next.day = { n: day.n + 1, quota, endsAt: 0, over: false, last: { n: day.n, money, quota: day.quota, next: quota } };
            next.elev.floor = 0;
            for (const p of next.players) p.loc = 'wait';
          } else {
            next.day.last = { n: day.n, money, quota: day.quota, lost: true };
            next.phase = 'ended';
          }
        }
      } else if (next.day.endsAt && !next.day.over && now >= next.day.endsAt) {
        closeTable(next, now, rand);
        next.day.over = true;
        for (const p of next.players) p.loc = 'elevator';
      } else return null;
      break;
    }

    // Blackjack
    case 'bjSit': {
      const bj = next.bj;
      if (!playing || !me || me.loc !== 'f1' || next.day.over || bj.phase === 'play') return null;
      if (seatOf(next, me.id)) break;
      if (bj.seats.length) return null; // la mesa es de uno solo: si hay alguien jugando, está ocupada
      bj.seats.push({ id: me.id, bet: 0, ready: false, hand: [], st: 'idle', dbl: false, pay: 0, res: '', gone: false });
      break;
    }

    case 'bjLeave': {
      const seat = me && seatOf(next, me.id);
      if (!playing || !seat) return null;
      if (next.bj.phase === 'play' && seat.st === 'play') return null; // en medio de una mano no se puede
      leaveSeat(next, me.id, now, rand);
      break;
    }

    // Apostar y confirmar con JUGAR: la mano arranca cuando todos los sentados confirmaron.
    case 'bjBet': {
      const bj = next.bj;
      const seat = me && seatOf(next, me.id);
      const amount = action.amount;
      if (!playing || !seat || next.day.over || !Number.isInteger(amount)) return null;
      if (bj.phase === 'result') {
        if (now < bj.resultAt + RESULT_MS) return null;
        resetTable(bj);
      }
      if (bj.phase !== 'bet' || seat.ready) return null;
      const lim = betLimits(next.money);
      if (!lim || amount < lim.min || amount > lim.max) return null;
      next.money -= amount;
      seat.bet = amount;
      seat.ready = true;
      if (bj.seats.every((s) => s.ready)) dealRound(next, now, rand);
      break;
    }

    case 'bjHit':
    case 'bjStand':
    case 'bjDouble': {
      const bj = next.bj;
      const seat = me && seatOf(next, me.id);
      if (!playing || !seat || bj.phase !== 'play' || seat.st !== 'play') return null;
      if (action.type === 'bjStand') seat.st = 'stand';
      else {
        if (action.type === 'bjDouble') {
          if (seat.hand.length !== 2 || next.money < seat.bet) return null;
          next.money -= seat.bet;
          seat.bet *= 2;
          seat.dbl = true;
        }
        seat.hand.push(draw(bj, rand));
        const total = handValue(seat.hand).total;
        if (total > 21) seat.st = 'bust';
        else if (total === 21 || seat.dbl) seat.st = 'stand';
      }
      finishIfDone(next, now, rand);
      break;
    }

    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}

// Para la pantalla: qué falta para que se muestre cada cosa.
export const dayLeftMs = (room, now) => (room.day.endsAt && !room.day.over ? Math.max(0, room.day.endsAt - now) : 0);
export const fmtClock = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const fmtMoney = (n) => {
  const v = Math.round(n);
  if (Math.abs(v) < 1000) return `$${v}`;
  const k = v / 1000;
  return `$${Number.isInteger(k) ? k : k.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}K`;
};
