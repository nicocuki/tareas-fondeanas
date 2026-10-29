// Monopoly: reducer puro, como el de los demás juegos de mesa del sitio. Corre dentro de la transacción
// de la sala (`backend.updateRoom`), así que no lee el reloj ni el azar por su cuenta: los recibe en
// `ctx` ({ now, rand }; `ctx.dice` solo lo usan los tests para fijar los dados).
// Devuelve la sala nueva o `null` si la acción no corresponde.
//
// Cómo se ordena un turno (`room.step`):
//   roll     el jugador de turno tiene que tirar los dados (en la cárcel: pagar, usar la carta o tirar)
//   buy      cayó en una propiedad sin dueño y decide: comprarla o no
//   auction  se está subastando una propiedad (`room.auction`)
//   act      ya tiró y resolvió el casillero: puede administrar (construir, hipotecar, tratar) y terminar
// Si saca dobles, después de resolver el casillero vuelve a `roll` (con `room.doubles` > 0).
// Las deudas pendientes (`room.debts`) frenan todo: nadie tira, compra ni termina el turno hasta pagarlas.
import {
  BUYABLE, CARDS, GO_SALARY, GROUPS, JAIL_BAIL, JAIL_POS, MAX_HOTELS, MAX_HOUSES,
  SQUARES, STATIONS, UTILITIES, groupSquares, houseCost, jailFreeIndex, mortgageFee, mortgageValue, unmortgageCost,
} from './board.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'monopoly';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_LOG = 60;
export const MAX_TRADE_PROPS = 12;

// `auctionChance`: probabilidad (en %) de que, cuando alguien no compra una propiedad, se subaste.
export const DEFAULT_OPTIONS = { startCash: 1500, freeParking: false, auctionChance: 50 };
export const OPTION_VALUES = {
  startCash: [1000, 1500, 2000, 3000],
  freeParking: [false, true],
  auctionChance: [0, 25, 50, 75, 100],
};

// Una sala hecha antes de que existiera `auctionChance` tenía `auctions` (sí o no): se traduce a 100 % o 0 %.
export const auctionChance = (room) => room.options.auctionChance ?? (room.options.auctions === false ? 0 : 100);

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);

export function makeCode(rand = Math.random) {
  return Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, cash: 0, pos: 0, jail: 0, jf: [], out: false, left: false, wins: 0 };
}

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, 0)],
    ...freshGame(),
    createdAt: now,
    updatedAt: now,
  };
}

// Una partida guardada vuelve a abrirse en una sala nueva, en la fase `resume`: queda todo como estaba, pero nadie
// ocupa su lugar hasta que entra y lo toma (`claim`). Quien la abre retoma el lugar `seatId` y es el anfitrión.
export function roomFromSave(saved, seatId, now = Date.now()) {
  const room = structuredClone(saved);
  const seat = room.players.find((p) => p.id === seatId && !p.out) || room.players.find((p) => !p.out);
  room.phase = 'resume';
  room.hostId = seat.id;
  room.players = room.players.map((p) => ({ ...p, by: p.id === seat.id || p.bot ? p.id : null })); // los bots no necesitan que se sienten
  room.trade = null; // un trato a medias no se retoma
  room.card = null;
  delete room.kicked;
  room.createdAt = now;
  room.updatedAt = now;
  return { room, seatId: seat.id };
}

// Todo lo que cambia durante la partida (se rearma al empezar y al volver a la sala de espera).
function freshGame() {
  return {
    turnNo: 0, current: null, step: null, doubles: 0, dice: [0, 0], rollN: 0,
    props: {}, deck: { chance: [], chest: [] }, pot: 0, offer: null,
    debts: [], auction: null, queue: [], trade: null,
    card: null, cardN: 0, log: [], logN: 0, eliminated: [], winner: null,
  };
}

// ─── Consultas ───────────────────────────────────────────────────────────────
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const activePlayers = (room) => room.players.filter((p) => !p.out);
export const ownerOf = (room, pos) => room.props[pos]?.o ?? null;
export const ownedBy = (room, id) => Object.keys(room.props).map(Number).filter((pos) => room.props[pos].o === id).sort((a, b) => a - b);
export const ownsGroup = (room, id, g) => groupSquares(g).every((pos) => ownerOf(room, pos) === id);
export const groupLevels = (room, g) => groupSquares(g).map((pos) => room.props[pos]?.h || 0);
export const groupHasBuildings = (room, g) => groupLevels(room, g).some((h) => h > 0);
export const groupHasMortgage = (room, g) => groupSquares(g).some((pos) => room.props[pos]?.m);
export const housesLeft = (room) => MAX_HOUSES - Object.values(room.props).reduce((n, s) => n + (s.h > 0 && s.h < 5 ? s.h : 0), 0);
export const hotelsLeft = (room) => MAX_HOTELS - Object.values(room.props).filter((s) => s.h === 5).length;
export const debtsOf = (room, id) => room.debts.filter((d) => d.from === id);
export const debtTotal = (room, id) => debtsOf(room, id).reduce((n, d) => n + d.n, 0);

export function currentPlayer(room) {
  return findPlayer(room, room.current);
}

// Cuánto se paga de alquiler por caer en `pos` (0 si no tiene dueño, está hipotecada o no se cobra).
export function rentFor(room, pos, diceTotal = 0) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  if (!st || st.m) return 0;
  if (sq.t === 'street') {
    if (st.h > 0) return sq.rent[st.h];
    return ownsGroup(room, st.o, sq.g) ? sq.rent[0] * 2 : sq.rent[0];
  }
  if (sq.t === 'station') return 25 * 2 ** (STATIONS.filter((s) => ownerOf(room, s) === st.o).length - 1);
  const n = UTILITIES.filter((u) => ownerOf(room, u) === st.o).length;
  return diceTotal * (n >= 2 ? 10 : 4);
}

// Lo que se juntaría vendiendo todo al banco (edificios a la mitad, propiedades hipotecadas).
export function liquidation(room, id) {
  const p = findPlayer(room, id);
  let total = p ? p.cash : 0;
  for (const pos of ownedBy(room, id)) {
    const st = room.props[pos];
    total += Math.floor(houseCost(pos) / 2) * st.h;
    if (!st.m) total += mortgageValue(pos);
  }
  return total;
}

// Lo que vale todo lo que tiene (para el ranking final).
export function netWorth(room, id) {
  const p = findPlayer(room, id);
  let total = p ? p.cash : 0;
  for (const pos of ownedBy(room, id)) {
    const st = room.props[pos];
    total += st.m ? mortgageValue(pos) : SQUARES[pos].price;
    total += houseCost(pos) * st.h;
  }
  return total;
}

// ─── Por qué no se puede hacer algo (o null si se puede) ─────────────────────
// Las usan la interfaz, para avisar antes, y el reducer.
const busy = (room) => (room.auction ? 'Hay una subasta en curso.' : null);

export function buildProblem(room, id, pos) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  if (room.phase !== 'playing' || room.current !== id) return 'Solo se construye en tu turno.';
  if (!['roll', 'act'].includes(room.step)) return 'Primero resolvé lo que está pendiente.';
  if (debtsOf(room, id).length) return 'Primero pagá lo que debés.';
  if (sq.t !== 'street') return 'Solo se construye en las calles.';
  if (!st || st.o !== id) return 'No es tuya.';
  if (!ownsGroup(room, id, sq.g)) return `Necesitás las ${groupSquares(sq.g).length} calles de color ${GROUPS[sq.g].name.toLowerCase()}.`;
  if (groupHasMortgage(room, sq.g)) return 'Hay una calle de ese color hipotecada: levantá la hipoteca primero.';
  if (st.h >= 5) return 'Ya tiene hotel.';
  if (st.h > Math.min(...groupLevels(room, sq.g))) return 'Hay que construir parejo: primero las otras calles del color.';
  if (st.h === 4 ? hotelsLeft(room) < 1 : housesLeft(room) < 1) return st.h === 4 ? 'El banco se quedó sin hoteles.' : 'El banco se quedó sin casas.';
  if (findPlayer(room, id).cash < houseCost(pos)) return `Te faltan $${houseCost(pos) - findPlayer(room, id).cash}.`;
  return null;
}

export function sellBuildingProblem(room, id, pos) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  if (room.phase !== 'playing') return 'La partida no está en curso.';
  if (sq.t !== 'street' || !st || st.o !== id) return 'No es tuya.';
  if (st.h < 1) return 'No tiene edificios.';
  if (st.h < Math.max(...groupLevels(room, sq.g))) return 'Hay que vender parejo: primero la calle que tiene más.';
  if (st.h === 5 && housesLeft(room) < 4) return 'El banco no tiene casas para reemplazar al hotel.';
  return null;
}

export function mortgageProblem(room, id, pos) {
  const st = room.props[pos];
  if (room.phase !== 'playing') return 'La partida no está en curso.';
  if (!st || st.o !== id) return 'No es tuya.';
  if (st.m) return 'Ya está hipotecada.';
  const g = SQUARES[pos].g;
  if (g && groupHasBuildings(room, g)) return 'Primero vendé los edificios de ese color.';
  return null;
}

export function unmortgageProblem(room, id, pos) {
  const st = room.props[pos];
  if (room.phase !== 'playing') return 'La partida no está en curso.';
  if (!st || st.o !== id) return 'No es tuya.';
  if (!st.m) return 'No está hipotecada.';
  if (busy(room)) return busy(room);
  const cost = unmortgageCost(pos);
  const cash = findPlayer(room, id).cash;
  return cash < cost ? `Te faltan $${cost - cash}.` : null;
}

// Un trato: { from, to, give: { cash, props, cards }, take: { cash, props, cards } }.
// `give` es lo que entrega quien lo propone; `take`, lo que recibe. Con `settle` también mira que alcance la plata.
export function tradeProblem(room, t, settle = false) {
  const a = findPlayer(room, t?.from);
  const b = findPlayer(room, t?.to);
  if (!a || !b || a.id === b.id || a.out || b.out) return 'Ese jugador ya no está en la partida.';
  for (const [side, owner] of [[t.give, a], [t.take, b]]) {
    const nums = [side.cash, side.cards, ...side.props];
    if (!nums.every((n) => Number.isInteger(n) && n >= 0)) return 'El trato tiene valores inválidos.';
    if (side.props.length > MAX_TRADE_PROPS || new Set(side.props).size !== side.props.length) return 'El trato tiene propiedades repetidas.';
    if (side.cards > owner.jf.length) return `${owner.name} no tiene tantas cartas de «Salir de la cárcel».`;
    for (const pos of side.props) {
      if (ownerOf(room, pos) !== owner.id) return `${SQUARES[pos]?.name || 'Esa propiedad'} ya no es de ${owner.name}.`;
      const g = SQUARES[pos].g;
      if (g && groupHasBuildings(room, g)) return `${SQUARES[pos].name} no se puede tratar: hay edificios en ese color (hay que venderlos antes).`;
    }
  }
  const empty = (s) => !s.cash && !s.cards && !s.props.length;
  if (empty(t.give) && empty(t.take)) return 'El trato está vacío.';
  if (a.cash < t.give.cash && !settle) return `${a.name} no tiene $${t.give.cash}.`;
  if (settle) {
    const left = (me, out, inn, got) => me.cash - out.cash + inn.cash - tradeFee(room, got);
    if (left(a, t.give, t.take, t.take.props) < 0) return `${a.name} no llega a pagar (incluyendo el 10 % de las hipotecas que recibe).`;
    if (left(b, t.take, t.give, t.give.props) < 0) return `${b.name} no llega a pagar (incluyendo el 10 % de las hipotecas que recibe).`;
  }
  return null;
}

// Quien recibe una propiedad hipotecada le paga al banco el 10 % del valor de la hipoteca.
export const tradeFee = (room, props) => props.reduce((n, pos) => n + (room.props[pos]?.m ? mortgageFee(pos) : 0), 0);

// ─── Armado de la partida ────────────────────────────────────────────────────
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// `logN` cuenta todas las entradas que hubo (la bitácora guarda solo las últimas): así cada pantalla sabe cuáles son nuevas.
const addLog = (room, entry) => {
  room.log = [...room.log, entry].slice(-MAX_LOG);
  room.logN = (room.logN ?? 0) + 1;
};

// ¿Sale la subasta? Con 100 % o 0 % no se tira nada.
const auctionHappens = (room, rand) => {
  const chance = auctionChance(room);
  return chance >= 100 || (chance > 0 && rand() * 100 < chance);
};

// ─── Plata ───────────────────────────────────────────────────────────────────
// `to`: id de un jugador, 'pot' (el pozo del Descanso) o null (el banco). Si no le alcanza el efectivo queda una deuda.
function charge(room, payer, amount, to, why) {
  if (amount <= 0 || payer.out) return;
  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (to === 'pot') room.pot += amount;
    else if (to) findPlayer(room, to).cash += amount;
    addLog(room, { ...why, p: payer.id, o: to && to !== 'pot' ? to : undefined, n: amount });
  } else {
    room.debts = [...room.debts, { from: payer.id, to, n: amount, ...(why.s !== undefined ? { s: why.s } : {}) }];
    addLog(room, { k: 'debt', p: payer.id, o: to && to !== 'pot' ? to : undefined, n: amount });
  }
}

const toWho = (room) => (room.options.freeParking ? 'pot' : null);

// ─── Movimiento ──────────────────────────────────────────────────────────────
function moveTo(room, p, target) {
  if (target < p.pos) { // dio la vuelta: pasa por la Salida
    p.cash += GO_SALARY;
    addLog(room, { k: 'go', p: p.id, n: GO_SALARY });
  }
  p.pos = target;
}

function sendToJail(room, p, why) {
  p.pos = JAIL_POS;
  p.jail = 1;
  room.doubles = 0;
  room.offer = null;
  addLog(room, { k: 'jail', p: p.id, w: why });
}

const nearest = (list, pos) => list.find((s) => s > pos) ?? list[0];

function drawCard(room, p, kind, ctx, depth) {
  const deck = room.deck[kind];
  const idx = deck.shift();
  const card = CARDS[kind][idx];
  room.cardN += 1;
  room.card = { d: kind, i: idx, p: p.id, n: room.cardN };
  addLog(room, { k: 'card', p: p.id, d: kind, i: idx });
  if (card.t === 'jailfree') p.jf = [...p.jf, kind];
  else deck.push(idx);
  const others = () => room.players.filter((o) => !o.out && o.id !== p.id);
  switch (card.t) {
    case 'cash':
      if (card.n > 0) p.cash += card.n;
      else charge(room, p, -card.n, toWho(room), { k: 'cardpay' });
      break;
    case 'goto':
      moveTo(room, p, card.to);
      land(room, p, ctx, {}, depth + 1);
      break;
    case 'nearest':
      moveTo(room, p, nearest(card.k === 'station' ? STATIONS : UTILITIES, p.pos));
      land(room, p, ctx, { nearest: card.k }, depth + 1);
      break;
    case 'back':
      p.pos = (p.pos - card.n + 40) % 40;
      land(room, p, ctx, {}, depth + 1);
      break;
    case 'jail':
      sendToJail(room, p, 'card');
      break;
    case 'repairs': {
      const mine = ownedBy(room, p.id).map((pos) => room.props[pos].h);
      const houses = mine.filter((h) => h > 0 && h < 5).reduce((n, h) => n + h, 0);
      const hotels = mine.filter((h) => h === 5).length;
      charge(room, p, houses * card.house + hotels * card.hotel, toWho(room), { k: 'cardpay' });
      break;
    }
    case 'eachPay':
      for (const o of others()) charge(room, p, card.n, o.id, { k: 'cardpay' });
      break;
    case 'eachGet':
      for (const o of others()) charge(room, o, card.n, p.id, { k: 'cardpay' });
      break;
    default:
  }
}

// Qué pasa al caer en el casillero donde está `p`. `o.total`: lo que sacó con los dados (para las compañías).
function land(room, p, ctx, o = {}, depth = 0) {
  const pos = p.pos;
  const sq = SQUARES[pos];
  addLog(room, { k: 'at', p: p.id, s: pos });
  switch (sq.t) {
    case 'parking':
      if (room.options.freeParking && room.pot > 0) {
        p.cash += room.pot;
        addLog(room, { k: 'pot', p: p.id, n: room.pot });
        room.pot = 0;
      }
      return;
    case 'gotojail':
      sendToJail(room, p, 'square');
      return;
    case 'tax':
      charge(room, p, sq.price, toWho(room), { k: 'tax', s: pos });
      return;
    case 'chance':
    case 'chest':
      if (depth < 4) drawCard(room, p, sq.t, ctx, depth);
      return;
    default:
  }
  if (!BUYABLE.includes(sq.t)) return;
  const st = room.props[pos];
  if (!st) { room.offer = pos; return; }
  if (st.o === p.id) return;
  if (st.m) { addLog(room, { k: 'nomortgage', p: p.id, o: st.o, s: pos }); return; }
  let rent;
  let dice;
  if (o.nearest === 'utility') {
    const rand = ctx.rand ?? Math.random;
    dice = 2 + Math.floor(rand() * 6) + Math.floor(rand() * 6);
    rent = dice * 10;
  } else if (o.nearest === 'station') {
    rent = rentFor(room, pos) * 2;
  } else {
    rent = rentFor(room, pos, o.total || 0);
    if (sq.t === 'utility') dice = o.total;
  }
  charge(room, p, rent, st.o, { k: 'rent', s: pos, ...(dice ? { d: dice } : {}) });
}

// Después de resolver el casillero: ¿decide una compra, tira otra vez o administra?
const restStep = (room) => (room.doubles > 0 ? 'roll' : 'act');
function afterLanding(room) {
  room.step = room.offer !== null ? 'buy' : restStep(room);
}

// ─── Turnos ──────────────────────────────────────────────────────────────────
// Los que siguen en juego, empezando por el que viene después de `fromId`.
function orderFrom(room, fromId) {
  const n = room.players.length;
  const start = room.players.findIndex((p) => p.id === fromId);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const p = room.players[(start + k + n) % n];
    if (!p.out) out.push(p.id);
  }
  return out;
}

function nextTurn(room) {
  room.current = orderFrom(room, room.current)[0] || room.current;
  room.step = 'roll';
  room.doubles = 0;
  room.offer = null;
  room.turnNo += 1;
}

function checkWin(room) {
  const alive = activePlayers(room);
  if (alive.length > 1) return false;
  room.phase = 'ended';
  room.winner = alive[0]?.id || null;
  room.step = null;
  room.offer = null;
  room.auction = null;
  room.queue = [];
  room.trade = null;
  room.debts = [];
  const w = findPlayer(room, room.winner);
  if (w) w.wins = (w.wins || 0) + 1;
  if (w) addLog(room, { k: 'win', p: w.id });
  return true;
}

// ─── Subastas ────────────────────────────────────────────────────────────────
// Por turnos: cada uno sube la oferta o se baja. Gana el último que queda con la oferta más alta.
// Que salga o no la subasta depende de `auctionChance` (ver `auctionHappens`).
function startAuction(room, pos, resume, afterId) {
  const order = orderFrom(room, afterId);
  room.auction = { pos, bid: 0, bidder: null, order, active: [...order], turn: order[0], resume };
  room.step = 'auction';
  const chance = auctionChance(room);
  addLog(room, { k: 'auction', s: pos, ...(chance < 100 ? { c: chance } : {}) });
}

function nextBidder(a, afterId) {
  const n = a.order.length;
  const start = a.order.indexOf(afterId);
  for (let k = 1; k <= n; k++) {
    const id = a.order[(start + k + n) % n];
    if (a.active.includes(id) && id !== a.bidder) return id;
  }
  return null;
}

function endAuction(room, sold) {
  const a = room.auction;
  room.auction = null;
  if (sold) {
    const w = findPlayer(room, a.bidder);
    w.cash -= a.bid;
    room.props[a.pos] = { o: w.id, h: 0, m: 0 };
    addLog(room, { k: 'sold', p: w.id, s: a.pos, n: a.bid });
  } else {
    addLog(room, { k: 'unsold', s: a.pos });
  }
  const next = room.queue.shift();
  if (next !== undefined) startAuction(room, next, a.resume, room.current);
  else room.step = a.resume;
}

// Se llama después de cualquier cambio en la subasta (una oferta, alguien que se baja, alguien que se va).
function settleAuction(room) {
  const a = room.auction;
  if (!a) return;
  a.active = a.active.filter((id) => !findPlayer(room, id)?.out);
  if (a.bidder && !a.active.includes(a.bidder)) { a.bidder = null; a.bid = 0; }
  if (!a.active.length) { endAuction(room, false); return; }
  if (a.bidder && a.active.length === 1) { endAuction(room, true); return; }
  if (!a.active.includes(a.turn) || a.turn === a.bidder) a.turn = nextBidder(a, a.turn);
}

// ─── Quiebra ─────────────────────────────────────────────────────────────────
// `creditor`: el jugador al que se le debe (se queda con todo) o null (todo vuelve al banco, y se subasta).
// Si el banco se queda con las propiedades, cada una sale a subasta con la misma probabilidad que al no comprar.
function eliminate(room, p, creditor, why, rand = Math.random) {
  // Los edificios se venden al banco a la mitad; la plata pasa a engrosar lo que se entrega.
  for (const pos of ownedBy(room, p.id)) {
    const st = room.props[pos];
    p.cash += Math.floor(houseCost(pos) / 2) * st.h;
    st.h = 0;
  }
  const wasCurrent = room.current === p.id;
  const mine = ownedBy(room, p.id);
  if (creditor) {
    creditor.cash += p.cash;
    creditor.jf = [...creditor.jf, ...p.jf];
    for (const pos of mine) {
      room.props[pos].o = creditor.id;
      if (room.props[pos].m) { // el nuevo dueño paga el 10 % de la hipoteca (si no le alcanza, paga lo que tenga)
        const fee = Math.min(creditor.cash, mortgageFee(pos));
        creditor.cash -= fee;
      }
    }
  } else {
    for (const kind of p.jf) room.deck[kind].push(jailFreeIndex(kind));
    for (const pos of mine) {
      delete room.props[pos];
      if (auctionHappens(room, rand)) room.queue.push(pos);
    }
  }
  p.cash = 0;
  p.jf = [];
  p.out = true;
  p.jail = 0;
  room.eliminated = [...room.eliminated, p.id];
  addLog(room, { k: 'bankrupt', p: p.id, o: creditor?.id, w: why });
  room.debts = room.debts
    .filter((d) => d.from !== p.id)
    .flatMap((d) => (d.to === p.id ? (creditor ? [{ ...d, to: creditor.id }] : []) : [d]));
  if (room.trade && (room.trade.from === p.id || room.trade.to === p.id)) room.trade = null;
  if (checkWin(room)) return;
  if (wasCurrent) {
    nextTurn(room);
    if (room.auction) room.auction.resume = 'roll';
  }
  if (room.auction) settleAuction(room);
  if (room.step !== 'auction' && room.queue.length) startAuction(room, room.queue.shift(), room.step, p.id);
  if (room.hostId === p.id) {
    const heir = room.players.find((o) => !o.out && !o.left && !o.bot) || room.players.find((o) => !o.left && !o.bot);
    if (heir) room.hostId = heir.id;
  }
}

function transferHost(room, leaverId) {
  if (room.hostId !== leaverId) return;
  const heir = room.players.find((o) => !o.out && !o.left && !o.bot && o.id !== leaverId) || room.players.find((o) => !o.left && !o.bot && o.id !== leaverId);
  if (heir) room.hostId = heir.id;
}

// ─── El reducer ──────────────────────────────────────────────────────────────
const DICE_SIDES = 6;
const POS_ACTIONS = ['build', 'sellBuilding', 'mortgage', 'unmortgage'];
const isTurn = (room, id, ...steps) => room.phase === 'playing' && room.current === id && steps.includes(room.step) && !room.debts.length;

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  // El anfitrión saca a alguien (también en plena partida: sirve para el que se fue sin avisar).
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'playing', 'ended', 'resume']);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left && left !== room ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = structuredClone(room);
  next.updatedAt = now;
  const me = findPlayer(next, action.playerId);
  const c = { ...ctx, now, rand };
  const live = next.phase === 'playing' && me && !me.out;
  if (POS_ACTIONS.includes(action.type) && !SQUARES[action.pos]) return null;

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        return next;
      }
      if (next.phase === 'resume') return next; // entra mirando y después elige su lugar (`claim`)
      if (next.phase !== 'lobby' || next.players.length >= MAX_PLAYERS) return null;
      const name = cleanName(action.name);
      if (!name) return null;
      const used = new Set(next.players.map((p) => p.color));
      let color = 0;
      while (used.has(color)) color += 1;
      next.players.push(newPlayer(action.playerId, name, action.avatar, color));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      if (next.phase === 'lobby') {
        next.players = next.players.filter((p) => p.id !== me.id);
        if (next.players.length && next.hostId === me.id) next.hostId = (next.players.find((p) => !p.bot) || next.players[0]).id;
        return next;
      }
      if (next.phase === 'resume') { // solo suelta su lugar, que lo puede tomar otro
        me.by = null;
        if (next.hostId === me.id) next.hostId = next.players.find((p) => p.by && p.id !== me.id)?.id ?? me.id;
        return next;
      }
      // En plena partida el que se va quiebra contra el banco; queda anotado para el ranking.
      transferHost(next, me.id);
      me.left = true;
      if (next.phase === 'playing' && !me.out) eliminate(next, me, null, 'left', rand);
      return next;
    }

    // ─── Retomar una partida guardada ────────────────────────────────────────
    // Cada uno que entra a la sala nueva elige quién era (`seat`) y pasa a usar ese lugar. Mientras tanto nadie juega.
    case 'claim': {
      const seat = findPlayer(next, action.seat);
      if (next.phase !== 'resume' || !seat || seat.out || seat.by || me || next.players.some((p) => p.by === action.playerId)) return null;
      if (!next.players.some((p) => p.by)) next.hostId = seat.id; // el primero en llegar manda
      seat.by = action.playerId;
      return next;
    }

    case 'resumeStart': {
      if (next.phase !== 'resume' || next.hostId !== action.playerId) return null;
      const seated = next.players.filter((p) => !p.out && p.by);
      if (seated.length < MIN_PLAYERS) return null;
      next.phase = 'playing';
      addLog(next, { k: 'resumed' });
      // Los lugares que nadie tomó quiebran contra el banco, como si se hubieran ido.
      for (const p of next.players.filter((o) => !o.out && !o.by)) {
        p.left = true;
        eliminate(next, p, null, 'left', rand);
      }
      return next;
    }

    // Un bot es un jugador más que mueve la pantalla del anfitrión (ver bots.js). El id y el nombre los pone quien lo agrega.
    case 'addBot': {
      if (next.phase !== 'lobby' || next.hostId !== action.playerId || next.players.length >= MAX_PLAYERS) return null;
      const name = cleanName(action.name);
      const id = String(action.botId || '');
      if (!name || !/^bot-[a-z0-9]{3,10}$/.test(id) || findPlayer(next, id)) return null;
      const used = new Set(next.players.map((p) => p.color));
      let color = 0;
      while (used.has(color)) color += 1;
      next.players.push({ ...newPlayer(id, name, '🤖', color), bot: true });
      return next;
    }

    case 'setOptions': {
      if (next.phase !== 'lobby' || next.hostId !== action.playerId) return null;
      for (const [key, value] of Object.entries(action.options || {})) {
        if (OPTION_VALUES[key]?.includes(value)) next.options[key] = value;
      }
      return next;
    }

    case 'start': {
      if (next.hostId !== action.playerId || next.phase === 'playing' || next.phase === 'resume') return null;
      next.players = next.players.filter((p) => !p.left);
      if (next.players.length < MIN_PLAYERS) return null;
      Object.assign(next, freshGame());
      next.saveId = String(now); // con esto se reconoce la partida en el guardado, aunque cambie de sala
      next.players = shuffle(next.players, rand);
      for (const p of next.players) Object.assign(p, { cash: next.options.startCash, pos: 0, jail: 0, jf: [], out: false });
      next.deck = {
        chance: shuffle(CARDS.chance.map((_, i) => i), rand),
        chest: shuffle(CARDS.chest.map((_, i) => i), rand),
      };
      next.phase = 'playing';
      next.current = next.players[0].id;
      next.step = 'roll';
      next.turnNo = 1;
      next.startedAt = now;
      return next;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId || next.phase === 'lobby') return null;
      next.players = next.players.filter((p) => !p.left);
      Object.assign(next, freshGame());
      for (const p of next.players) Object.assign(p, { cash: 0, pos: 0, jail: 0, jf: [], out: false });
      next.phase = 'lobby';
      return next;
    }

    // ─── Tirar, comprar, terminar ────────────────────────────────────────────
    case 'roll': {
      if (!live || !isTurn(next, me.id, 'roll') || action.seen !== next.rollN) return null;
      const dice = ctx.dice || [1 + Math.floor(rand() * DICE_SIDES), 1 + Math.floor(rand() * DICE_SIDES)];
      const total = dice[0] + dice[1];
      const double = dice[0] === dice[1];
      next.dice = dice;
      next.rollN += 1;
      addLog(next, { k: 'roll', p: me.id, d: dice });
      const walk = () => { moveTo(next, me, (me.pos + total) % 40); land(next, me, c, { total }); afterLanding(next); };
      if (me.jail > 0) {
        next.doubles = 0; // salir de la cárcel con dobles no da otra tirada
        if (double) {
          me.jail = 0;
          addLog(next, { k: 'freed', p: me.id, w: 'doubles' });
          walk();
        } else if (me.jail >= 3) {
          me.jail = 0;
          addLog(next, { k: 'freed', p: me.id, w: 'turns' });
          charge(next, me, JAIL_BAIL, null, { k: 'bail' });
          walk();
        } else {
          me.jail += 1;
          addLog(next, { k: 'stay', p: me.id });
          next.step = 'act';
        }
        return next;
      }
      if (double) {
        next.doubles += 1;
        if (next.doubles >= 3) {
          sendToJail(next, me, 'triple');
          afterLanding(next);
          return next;
        }
      } else {
        next.doubles = 0;
      }
      walk();
      return next;
    }

    case 'payBail': {
      if (!live || !isTurn(next, me.id, 'roll') || me.jail < 1 || me.cash < JAIL_BAIL) return null;
      me.cash -= JAIL_BAIL;
      me.jail = 0;
      addLog(next, { k: 'freed', p: me.id, w: 'bail', n: JAIL_BAIL });
      return next;
    }

    case 'useCard': {
      if (!live || !isTurn(next, me.id, 'roll') || me.jail < 1 || !me.jf.length) return null;
      const kind = me.jf[me.jf.length - 1];
      me.jf = me.jf.slice(0, -1);
      next.deck[kind].push(jailFreeIndex(kind));
      me.jail = 0;
      addLog(next, { k: 'freed', p: me.id, w: 'card' });
      return next;
    }

    case 'buy': {
      if (!live || !isTurn(next, me.id, 'buy') || next.offer === null) return null;
      const pos = next.offer;
      const price = SQUARES[pos].price;
      if (me.cash < price) return null;
      me.cash -= price;
      next.props[pos] = { o: me.id, h: 0, m: 0 };
      next.offer = null;
      addLog(next, { k: 'buy', p: me.id, s: pos, n: price });
      next.step = restStep(next);
      return next;
    }

    case 'declineBuy': {
      if (!live || !isTurn(next, me.id, 'buy') || next.offer === null) return null;
      const pos = next.offer;
      next.offer = null;
      if (auctionHappens(next, rand)) {
        startAuction(next, pos, restStep(next), me.id);
      } else {
        addLog(next, { k: 'noauction', s: pos, c: auctionChance(next) });
        next.step = restStep(next);
      }
      return next;
    }

    case 'endTurn': {
      if (!live || !isTurn(next, me.id, 'act') || action.turn !== next.turnNo) return null;
      nextTurn(next);
      return next;
    }

    // ─── Subasta ─────────────────────────────────────────────────────────────
    case 'bid': {
      const a = next.auction;
      const amount = action.amount;
      if (!live || next.step !== 'auction' || !a || a.turn !== me.id) return null;
      if (!Number.isInteger(amount) || amount <= a.bid || amount > me.cash) return null;
      a.bid = amount;
      a.bidder = me.id;
      addLog(next, { k: 'bid', p: me.id, s: a.pos, n: amount });
      a.turn = nextBidder(a, me.id) || me.id;
      settleAuction(next);
      return next;
    }

    case 'passBid': {
      const a = next.auction;
      if (!live || next.step !== 'auction' || !a || a.turn !== me.id) return null;
      a.active = a.active.filter((id) => id !== me.id);
      addLog(next, { k: 'drop', p: me.id, s: a.pos });
      a.turn = nextBidder(a, me.id) || a.turn;
      settleAuction(next);
      return next;
    }

    // ─── Administrar propiedades ─────────────────────────────────────────────
    case 'build': {
      if (!live || buildProblem(next, me.id, action.pos)) return null;
      const st = next.props[action.pos];
      me.cash -= houseCost(action.pos);
      st.h += 1;
      addLog(next, { k: 'build', p: me.id, s: action.pos, h: st.h });
      return next;
    }

    case 'sellBuilding': {
      if (!live || sellBuildingProblem(next, me.id, action.pos)) return null;
      const st = next.props[action.pos];
      me.cash += Math.floor(houseCost(action.pos) / 2);
      st.h -= 1;
      addLog(next, { k: 'sellb', p: me.id, s: action.pos, h: st.h });
      return next;
    }

    case 'mortgage': {
      if (!live || mortgageProblem(next, me.id, action.pos)) return null;
      next.props[action.pos].m = 1;
      me.cash += mortgageValue(action.pos);
      addLog(next, { k: 'mortgage', p: me.id, s: action.pos });
      return next;
    }

    case 'unmortgage': {
      if (!live || unmortgageProblem(next, me.id, action.pos)) return null;
      next.props[action.pos].m = 0;
      me.cash -= unmortgageCost(action.pos);
      addLog(next, { k: 'unmortgage', p: me.id, s: action.pos });
      return next;
    }

    // ─── Tratos ──────────────────────────────────────────────────────────────
    case 'tradeOffer': {
      const side = (s) => ({ cash: s?.cash ?? 0, cards: s?.cards ?? 0, props: [...(s?.props || [])] });
      const trade = { from: me?.id, to: action.to, give: side(action.give), take: side(action.take) };
      if (!live || next.trade || next.auction) return null;
      if (tradeProblem(next, trade)) return null;
      next.trade = trade;
      addLog(next, { k: 'offer', p: trade.from, o: trade.to });
      return next;
    }

    case 'tradeCancel': {
      if (!live || !next.trade || next.trade.from !== me.id) return null;
      next.trade = null;
      return next;
    }

    case 'tradeDecline': {
      if (!live || !next.trade || next.trade.to !== me.id) return null;
      addLog(next, { k: 'refused', p: me.id, o: next.trade.from });
      next.trade = null;
      return next;
    }

    case 'tradeAccept': {
      const t = next.trade;
      if (!live || !t || t.to !== me.id || next.auction) return null;
      if (tradeProblem(next, t, true)) return null;
      const a = findPlayer(next, t.from);
      const b = me;
      const feeA = tradeFee(next, t.take.props);
      const feeB = tradeFee(next, t.give.props);
      a.cash += t.take.cash - t.give.cash - feeA;
      b.cash += t.give.cash - t.take.cash - feeB;
      for (const pos of t.give.props) next.props[pos].o = b.id;
      for (const pos of t.take.props) next.props[pos].o = a.id;
      const moveCards = (from, to, n) => { to.jf = [...to.jf, ...from.jf.slice(from.jf.length - n)]; from.jf = from.jf.slice(0, from.jf.length - n); };
      moveCards(a, b, t.give.cards);
      moveCards(b, a, t.take.cards);
      next.trade = null;
      addLog(next, { k: 'traded', p: a.id, o: b.id });
      return next;
    }

    // ─── Deudas y quiebra ────────────────────────────────────────────────────
    case 'payDebt': {
      const d = live && next.debts.find((x) => x.from === me.id);
      if (!d || me.cash < d.n) return null;
      me.cash -= d.n;
      if (d.to === 'pot') next.pot += d.n;
      else if (d.to) findPlayer(next, d.to).cash += d.n;
      next.debts = next.debts.filter((x) => x !== d);
      addLog(next, { k: 'paid', p: me.id, o: d.to && d.to !== 'pot' ? d.to : undefined, n: d.n, ...(d.s !== undefined ? { s: d.s } : {}) });
      return next;
    }

    case 'bankrupt': {
      if (!live || !debtsOf(next, me.id).length) return null;
      if (liquidation(next, me.id) >= debtTotal(next, me.id)) return null; // todavía puede pagar: que venda o hipoteque
      const first = debtsOf(next, me.id)[0];
      const creditor = first.to && first.to !== 'pot' ? findPlayer(next, first.to) : null;
      eliminate(next, me, creditor && !creditor.out ? creditor : null, 'debt', rand);
      return next;
    }

    default:
      return null;
  }
}
