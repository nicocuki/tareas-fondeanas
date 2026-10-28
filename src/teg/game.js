// T.E.G.: reducer puro, como el de los demás juegos de mesa del sitio. Corre dentro de la transacción de la sala
// (`backend.updateRoom`), así que no lee el reloj ni el azar por su cuenta: los recibe en `ctx` ({ now, rand };
// `ctx.dice` = { a: [...], d: [...] } lo usan solo los tests para fijar los dados).
// Devuelve la sala nueva o `null` si la acción no corresponde.
//
// Cómo se ordena la partida (`room.stage`):
//   setup1, setup2   todos ponen a la vez los ejércitos iniciales (5 y después 3), cada uno en sus países
//   reinforce        el jugador de turno cobra sus refuerzos (países, continentes, canje de cartas) y los reparte
//   attack           ataca con dados desde sus países; al conquistar pasa ejércitos (`room.pending`)
//   regroup          mueve ejércitos entre países propios vecinos (los que llegan no se vuelven a mover)
// Al terminar el turno, si conquistó algún país, roba una carta.
//
// `room.own[c]` y `room.arm[c]` son el dueño (posición en `room.players`) y los ejércitos de cada país.
import {
  ARMY_COLORS, CARD_COUNT, COMMON_OBJECTIVE, CONTINENTS, COUNTRIES, COUNTRY_COUNT, OBJECTIVES, areNeighbors, cardSymbol, countriesOf,
  objectiveById,
} from './board.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'teg';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_LOG = 50;
export const SETUP_ARMIES = [5, 3];   // primera y segunda vuelta de ejércitos iniciales
export const MAX_DICE = 3;
export const FORCED_TRADE = 5;        // con tantas cartas en la mano hay que canjear antes de seguir
export const COMMON_TOTAL = 30;       // con esta cantidad de países se gana siempre

export const DEFAULT_OPTIONS = { goal: 'secret' };
export const OPTION_VALUES = { goal: ['secret', 'conquer30'] };

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);

export function makeCode(rand = Math.random) {
  return Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, cards: [], obj: '', pend: 0, out: false, left: false, by: -1, wins: 0 };
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

function freshGame() {
  return {
    stage: null, current: 0, turnNo: 0, own: [], arm: [], deck: [], discard: [], tradeN: 0,
    reinf: 0, conq: false, pending: null, locked: {}, last: null, rollN: 0,
    log: [], eliminated: [], winner: null,
  };
}

// ─── Consultas ───────────────────────────────────────────────────────────────
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const indexOfPlayer = (room, id) => room.players.findIndex((p) => p.id === id);
export const inGame = (p) => !p.out && !p.left;
export const ownedBy = (room, i) => room.own.flatMap((o, c) => (o === i ? [c] : []));
export const countOf = (room, i) => room.own.reduce((n, o) => n + (o === i ? 1 : 0), 0);
export const armiesOf = (room, i) => room.own.reduce((n, o, c) => n + (o === i ? room.arm[c] : 0), 0);
export const ownsContinent = (room, i, key) => countriesOf(key).every((c) => room.own[c] === i);
export const ownedIn = (room, i, key) => countriesOf(key).filter((c) => room.own[c] === i).length;
export const playerOfColor = (room, color) => room.players.findIndex((p) => p.color === color);

// Refuerzos de cada turno: la mitad de los países (mínimo 3) más el bonus de cada continente completo.
export function reinforcements(room, i) {
  const base = Math.max(3, Math.floor(countOf(room, i) / 2));
  return base + Object.entries(CONTINENTS).reduce((n, [key, c]) => n + (ownsContinent(room, i, key) ? c.bonus : 0), 0);
}

// Cuántos ejércitos de `c` se pueden mover en el reagrupe: siempre queda uno, y los que llegaron en este reagrupe no se mueven de nuevo.
export const movable = (room, c) => Math.max(0, room.arm[c] - 1 - (room.locked[c] || 0));

// Canje de cartas: 4, 7, 10 ejércitos y de ahí de a 5 más. El contador es de toda la partida.
export const tradeValue = (n) => (n < 3 ? [4, 7, 10][n] : 10 + 5 * (n - 2));

// Tres cartas sirven si son del mismo símbolo o de tres símbolos distintos; el comodín vale por cualquiera.
export function validSet(cards) {
  if (cards.length !== 3 || new Set(cards).size !== 3 || cards.some((c) => !Number.isInteger(c) || c < 0 || c >= CARD_COUNT)) return false;
  const symbols = cards.map(cardSymbol).filter((s) => s !== 'wild');
  if (symbols.length < cards.length) return true; // con un comodín siempre cierra
  const kinds = new Set(symbols).size;
  return kinds === 1 || kinds === 3;
}

export function tradeProblem(room, i, cards) {
  const p = room.players[i];
  if (room.phase !== 'playing' || room.current !== i || room.stage !== 'reinforce') return 'Solo se canjea en tu turno, antes de atacar.';
  if (!Array.isArray(cards) || !validSet(cards)) return 'Tienen que ser 3 cartas del mismo símbolo, o 3 símbolos distintos (el comodín vale por cualquiera).';
  if (!cards.every((c) => p.cards.includes(c))) return 'No tenés esas cartas.';
  return null;
}

// ¿Se cumplió el objetivo de `i`? Y cuánto le falta (para mostrárselo).
export function objectiveProgress(room, i) {
  const p = room.players[i];
  const o = objectiveById(p.obj);
  const lines = [];
  if (o.destroy !== undefined) {
    const t = room.players[playerOfColor(room, o.destroy)];
    return { done: Boolean(t?.out && t.by === i), lines: [{ label: `Ejército ${ARMY_COLORS[o.destroy].name.toLowerCase()} destruido por vos`, have: t?.out && t.by === i ? 1 : 0, need: 1 }] };
  }
  if (o.total !== undefined) {
    const mine = ownedBy(room, i).filter((c) => !o.armies || room.arm[c] >= o.armies);
    return { done: mine.length >= o.total, lines: [{ label: o.armies ? `Países con ${o.armies} o más ejércitos` : 'Países', have: mine.length, need: o.total }] };
  }
  for (const key of o.all) lines.push({ label: CONTINENTS[key].name, have: ownedIn(room, i, key), need: countriesOf(key).length });
  for (const [key, need] of Object.entries(o.some)) lines.push({ label: `Países de ${CONTINENTS[key].name}`, have: Math.min(need, ownedIn(room, i, key)), need });
  return { done: lines.every((l) => l.have >= l.need), lines };
}

export const attackProblem = (room, i, from, to) => {
  if (room.phase !== 'playing' || room.current !== i || room.stage !== 'attack') return 'Solo se ataca en tu turno, en la fase de ataque.';
  if (room.pending) return 'Primero pasá ejércitos al país que conquistaste.';
  if (!Number.isInteger(from) || !Number.isInteger(to) || !COUNTRIES[from] || !COUNTRIES[to]) return 'País inválido.';
  if (room.own[from] !== i) return 'El país de origen no es tuyo.';
  if (room.own[to] === i) return 'No podés atacar un país tuyo.';
  if (!areNeighbors(from, to)) return 'Tienen que ser países vecinos.';
  if (room.arm[from] < 2) return 'Hace falta al menos 1 ejército más que el que se queda.';
  return null;
};

// ─── Utilidades ──────────────────────────────────────────────────────────────
function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const addLog = (room, entry) => { room.log = [...room.log, entry].slice(-MAX_LOG); };
const rollDice = (rand, n) => Array.from({ length: n }, () => 1 + Math.floor(rand() * 6)).sort((a, b) => b - a);

function nextActive(room, from) {
  const n = room.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (from + k) % n;
    if (inGame(room.players[j])) return j;
  }
  return from;
}

function startTurn(room) {
  room.stage = 'reinforce';
  room.reinf = reinforcements(room, room.current);
  room.conq = false;
  room.pending = null;
  room.locked = {};
  room.turnNo += 1;
}

function drawCard(room, i) {
  if (!room.deck.length) { room.deck = room.discard; room.discard = []; }
  const card = room.deck.shift();
  if (card !== undefined) room.players[i].cards = [...room.players[i].cards, card];
}

// Pasa de la primera tanda de ejércitos iniciales a la segunda, y de ahí al primer turno.
function advanceSetup(room, rand) {
  if (room.players.some((p) => inGame(p) && p.pend > 0)) return;
  if (room.stage === 'setup1') {
    room.stage = 'setup2';
    for (const p of room.players) p.pend = inGame(p) ? SETUP_ARMIES[1] : 0;
    return;
  }
  room.current = nextActive(room, room.players.length - 1);
  startTurn(room);
}

// ─── Objetivos y victoria ────────────────────────────────────────────────────
function goalMet(room, i) {
  if (countOf(room, i) >= COMMON_TOTAL) return true;
  return room.options.goal === 'secret' && objectiveProgress(room, i).done;
}

function declareWinner(room, i) {
  room.phase = 'ended';
  room.stage = null;
  room.pending = null;
  room.winner = room.players[i].id;
  room.players[i].wins += 1;
  addLog(room, { k: 'win', p: i });
}

// Si queda un solo jugador en pie (los demás se fueron o los eliminaron), gana.
function lastStanding(room) {
  const alive = room.players.map((p, i) => (inGame(p) ? i : -1)).filter((i) => i >= 0);
  if (alive.length > 1) return false;
  if (alive.length === 1) declareWinner(room, alive[0]);
  else room.phase = 'ended';
  return true;
}

function eliminate(room, victim, killer) {
  const v = room.players[victim];
  v.out = true;
  v.by = killer;
  room.eliminated = [...room.eliminated, v.id];
  room.players[killer].cards = [...room.players[killer].cards, ...v.cards];
  v.cards = [];
  addLog(room, { k: 'elim', p: killer, v: victim });
  // Los que tenían que destruir a ese color y no fueron ellos: pasan a ocupar 30 países.
  for (const [i, p] of room.players.entries()) {
    if (i === killer || !inGame(p)) continue;
    const o = objectiveById(p.obj);
    if (o.destroy !== undefined && playerOfColor(room, o.destroy) === victim) p.obj = COMMON_OBJECTIVE.id;
  }
}

// ─── Combate ─────────────────────────────────────────────────────────────────
// Una tirada: el atacante con `dice` dados y el defensor con hasta 3. Se comparan de mayor a menor y los empates los gana el defensor.
function battle(room, from, to, dice, ctx) {
  const a = ctx.dice?.a || rollDice(ctx.rand, dice);
  const d = ctx.dice?.d || rollDice(ctx.rand, Math.min(MAX_DICE, room.arm[to]));
  let al = 0;
  let dl = 0;
  for (let k = 0; k < Math.min(a.length, d.length); k++) {
    if (a[k] > d[k]) dl += 1;
    else al += 1;
  }
  room.arm[from] -= al;
  room.arm[to] -= dl;
  return { a, d, al, dl };
}

// Si el país cayó: queda del atacante, sin ejércitos hasta que pase algunos (`pending`).
function conquer(room, from, to, dice) {
  const me = room.current;
  const victim = room.own[to];
  room.own[to] = me;
  room.conq = true;
  room.pending = { from, to, min: Math.min(dice, room.arm[from] - 1), max: room.arm[from] - 1 };
  addLog(room, { k: 'conquer', p: me, f: from, t: to, v: victim });
  if (!room.own.includes(victim)) eliminate(room, victim, me);
}

function attackOnce(room, from, to, dice, ctx) {
  const result = battle(room, from, to, dice, ctx);
  room.rollN += 1;
  room.last = { n: room.rollN, f: from, t: to, ...result, rounds: 1, tl: result.al, td: result.dl, won: false };
  if (room.arm[to] <= 0) { conquer(room, from, to, dice); room.last.won = true; }
  return result;
}

// ─── El reducer ──────────────────────────────────────────────────────────────
export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'playing', 'ended']);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left && left !== room ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const c = { ...ctx, now, rand };
  const next = structuredClone(room);
  next.updatedAt = now;
  const mi = indexOfPlayer(next, action.playerId);
  const me = next.players[mi];
  const live = next.phase === 'playing' && me && inGame(me);
  const myTurn = live && next.current === mi;
  const country = (n) => Number.isInteger(n) && n >= 0 && n < COUNTRY_COUNT;

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        return next;
      }
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
        if (next.players.length && next.hostId === me.id) next.hostId = next.players[0].id;
        return next;
      }
      // En plena partida el que se va deja sus países sin jugar (siguen ahí, para conquistar) y se salta su turno.
      const wasCurrent = next.phase === 'playing' && next.current === mi && inGame(me);
      me.left = true;
      me.pend = 0;
      addLog(next, { k: 'left', p: mi });
      if (next.hostId === me.id) {
        const heir = next.players.find((p) => !p.left && p.id !== me.id);
        if (heir) next.hostId = heir.id;
      }
      if (next.phase !== 'playing') return next;
      if (lastStanding(next)) return next;
      if (next.stage === 'setup1' || next.stage === 'setup2') advanceSetup(next, rand);
      else if (wasCurrent) { next.current = nextActive(next, mi); startTurn(next); }
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
      if (next.hostId !== action.playerId || next.phase === 'playing') return null;
      next.players = next.players.filter((p) => !p.left);
      if (next.players.length < MIN_PLAYERS) return null;
      Object.assign(next, freshGame());
      next.players = shuffle(next.players, rand);
      const n = next.players.length;
      for (const p of next.players) Object.assign(p, { cards: [], obj: COMMON_OBJECTIVE.id, pend: SETUP_ARMIES[0], out: false, by: -1 });
      // Los países se reparten al azar entre todos; cada uno arranca con un ejército.
      next.own = new Array(COUNTRY_COUNT);
      next.arm = new Array(COUNTRY_COUNT).fill(1);
      shuffle(COUNTRIES.map((_, i) => i), rand).forEach((country_, k) => { next.own[country_] = k % n; });
      // Un objetivo secreto distinto para cada uno; para destruir a un color tiene que haber alguien de ese color.
      if (next.options.goal === 'secret') {
        const colors = next.players.map((p) => p.color);
        const pool = shuffle(OBJECTIVES.filter((o) => o.destroy === undefined || colors.includes(o.destroy)), rand);
        next.players.forEach((p, i) => {
          const pick = pool.find((o) => o.destroy === undefined || o.destroy !== p.color);
          pool.splice(pool.indexOf(pick), 1);
          next.players[i].obj = pick.id;
        });
      }
      next.deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i), rand);
      next.phase = 'playing';
      next.stage = 'setup1';
      next.startedAt = now;
      return next;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId || next.phase === 'lobby') return null;
      next.players = next.players.filter((p) => !p.left);
      Object.assign(next, freshGame());
      for (const p of next.players) Object.assign(p, { cards: [], obj: '', pend: 0, out: false, by: -1 });
      next.phase = 'lobby';
      return next;
    }

    // ─── Poner ejércitos (al empezar, todos a la vez; después, en los refuerzos de tu turno) ───
    case 'place': {
      const n = action.n;
      if (!live || !country(action.c) || !Number.isInteger(n) || n < 1 || next.own[action.c] !== mi) return null;
      if (next.stage === 'setup1' || next.stage === 'setup2') {
        if (me.pend < n) return null;
        me.pend -= n;
        next.arm[action.c] += n;
        advanceSetup(next, rand);
        return next;
      }
      if (!myTurn || next.stage !== 'reinforce' || next.reinf < n || me.cards.length >= FORCED_TRADE) return null;
      next.reinf -= n;
      next.arm[action.c] += n;
      return next;
    }

    case 'trade': {
      if (!live || tradeProblem(next, mi, action.cards)) return null;
      const armies = tradeValue(next.tradeN);
      next.tradeN += 1;
      next.reinf += armies;
      me.cards = me.cards.filter((card) => !action.cards.includes(card));
      next.discard = [...next.discard, ...action.cards];
      let bonus = 0;
      for (const card of action.cards) {
        if (card < COUNTRY_COUNT && next.own[card] === mi) { next.arm[card] += 2; bonus += 2; }
      }
      addLog(next, { k: 'trade', p: mi, n: armies, b: bonus });
      return next;
    }

    case 'toAttack': {
      if (!myTurn || next.stage !== 'reinforce' || next.reinf > 0 || me.cards.length >= FORCED_TRADE) return null;
      next.stage = 'attack';
      return next;
    }

    // ─── Atacar ──────────────────────────────────────────────────────────────
    case 'attack': {
      if (!live || attackProblem(next, mi, action.from, action.to)) return null;
      if (action.seen !== next.rollN) return null; // dos clics seguidos no tiran dos veces
      const dice = action.dice;
      if (!Number.isInteger(dice) || dice < 1 || dice > MAX_DICE || dice > next.arm[action.from] - 1) return null;
      attackOnce(next, action.from, action.to, dice, c);
      return next;
    }

    // Ataca con todo lo que puede, tirada tras tirada, hasta conquistar o quedarse con un solo ejército.
    case 'blitz': {
      if (!live || attackProblem(next, mi, action.from, action.to) || action.seen !== next.rollN) return null;
      let rounds = 0;
      let tl = 0;
      let td = 0;
      let dice = 0;
      while (!next.pending && next.arm[action.from] > 1 && rounds < 500) {
        dice = Math.min(MAX_DICE, next.arm[action.from] - 1);
        const r = attackOnce(next, action.from, action.to, dice, c);
        rounds += 1;
        tl += r.al;
        td += r.dl;
        if (ctx.dice) break;
      }
      Object.assign(next.last, { rounds, tl, td });
      return next;
    }

    case 'occupy': {
      const pend = next.pending;
      if (!myTurn || !pend || !Number.isInteger(action.n) || action.n < pend.min || action.n > pend.max) return null;
      next.arm[pend.from] -= action.n;
      next.arm[pend.to] += action.n;
      next.pending = null;
      if (goalMet(next, mi)) declareWinner(next, mi);
      else lastStanding(next);
      return next;
    }

    case 'toRegroup': {
      if (!myTurn || next.stage !== 'attack' || next.pending) return null;
      next.stage = 'regroup';
      return next;
    }

    case 'move': {
      const { from, to, n } = action;
      if (!myTurn || next.stage !== 'regroup' || !country(from) || !country(to)) return null;
      if (next.own[from] !== mi || next.own[to] !== mi || !areNeighbors(from, to)) return null;
      if (!Number.isInteger(n) || n < 1 || n > movable(next, from)) return null;
      next.arm[from] -= n;
      next.arm[to] += n;
      next.locked[to] = (next.locked[to] || 0) + n;
      return next;
    }

    case 'endTurn': {
      if (!myTurn || !['attack', 'regroup'].includes(next.stage) || next.pending || action.turn !== next.turnNo) return null;
      if (next.conq) drawCard(next, mi);
      next.current = nextActive(next, mi);
      startTurn(next);
      return next;
    }

    default:
      return null;
  }
}
