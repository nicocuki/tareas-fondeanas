// Generala: reducer de la sala. Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y
// devuelve null si la acción no vale.
//
// Lo que sale en cada tirada no lo decide el reducer ni un `rand`: lo da la física (`dice.js`), que corre en
// la pantalla del que tira. La acción `roll` trae el gesto (`throw`), qué quedó arriba en cada dado
// (`values`, con 0 para un dado montado) y dónde quedó (`poses`). Las demás pantallas repiten la misma
// tirada a partir del gesto y ven exactamente lo mismo. Como `died` o `finish` en los otros juegos, se
// confía en la pantalla del que juega: entre amigos alcanza.
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { cleanThrow } from './dice.js';

export const GAME_TYPE = 'generala';
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 1;
export const DICE = 5;
export const MAX_ROLLS = 3;
export const SERVED_BONUS = 5;

export const COLORS = ['#e0525a', '#4a9be8', '#5ec46b', '#f0c33c', '#b46bf0', '#f08a3c', '#3fd0c4', '#f07ab8'];

// Las casillas de la planilla, en el orden de siempre. `points` es lo que vale un juego armado (los números
// valen lo que sumen los dados de ese número).
export const CATEGORIES = [
  { id: 'n1', label: '1', name: 'Al 1', hint: 'Suma de los unos' },
  { id: 'n2', label: '2', name: 'Al 2', hint: 'Suma de los dos' },
  { id: 'n3', label: '3', name: 'Al 3', hint: 'Suma de los tres' },
  { id: 'n4', label: '4', name: 'Al 4', hint: 'Suma de los cuatros' },
  { id: 'n5', label: '5', name: 'Al 5', hint: 'Suma de los cincos' },
  { id: 'n6', label: '6', name: 'Al 6', hint: 'Suma de los seis' },
  { id: 'esc', label: 'E', name: 'Escalera', points: 20, hint: '1-2-3-4-5, 2-3-4-5-6 o 3-4-5-6-1' },
  { id: 'full', label: 'F', name: 'Full', points: 30, hint: 'Tres iguales y dos iguales' },
  { id: 'poker', label: 'P', name: 'Póker', points: 40, hint: 'Cuatro iguales' },
  { id: 'gen', label: 'G', name: 'Generala', points: 50, hint: 'Cinco iguales' },
  { id: 'doble', label: 'D', name: 'Generala doble', points: 100, hint: 'Otra generala, con la primera ya anotada' },
];
const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const STRAIGHTS = ['12345', '23456', '13456'];

export const DEFAULT_OPTIONS = { servida: true, doble: true };
export const cleanOptions = (o) => ({ servida: o?.servida !== false, doble: o?.doble !== false });
export const categoriesFor = (room) => CATEGORIES.filter((c) => c.id !== 'doble' || cleanOptions(room?.options).doble);

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const totalOf = (sheet) => Object.values(sheet || {}).reduce((sum, n) => sum + n, 0);
export const isDone = (room, player) => categoriesFor(room).every((c) => player.sheet[c.id] !== undefined);
export const currentPlayer = (room) => (room?.phase === 'playing' && room.turn ? findPlayer(room, room.turn.p) : null);

// ─── Puntos ──────────────────────────────────────────────────────────────────
// Cuánto vale anotar `dice` (cinco valores de 1 a 6) en la casilla `cat`. `served` = salió en la primera
// tirada del turno (5 más en escalera, full y póker). `sheet` es la planilla del que anota: la doble solo
// vale si la generala ya está anotada con puntos.
export function scoreFor(cat, dice, { served = false, sheet = {} } = {}) {
  if (!CATEGORY[cat] || dice.length !== DICE || dice.some((d) => !(d >= 1 && d <= 6))) return 0;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d] += 1;
  const most = Math.max(...counts);
  const bonus = served ? SERVED_BONUS : 0;
  switch (cat) {
    case 'esc': return STRAIGHTS.includes([...dice].sort().join('')) ? 20 + bonus : 0;
    case 'full': return counts.includes(3) && counts.includes(2) ? 30 + bonus : 0;
    case 'poker': return most >= 4 ? 40 + bonus : 0;
    case 'gen': return most === 5 ? 50 : 0;
    case 'doble': return most === 5 && sheet.gen > 0 ? 100 : 0;
    default: { const n = Number(cat.slice(1)); return counts[n] * n; }
  }
}

// ─── Sala ────────────────────────────────────────────────────────────────────
function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, sheet: {} };
}

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    players: [newPlayer(hostId, hostName, avatar, COLORS[0])],
    options: { ...DEFAULT_OPTIONS },
    turn: null,
    last: null,
    winners: [],
    reason: '',
    startedAt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

const freeColor = (room) => COLORS.find((c) => !room.players.some((p) => p.color === c)) || COLORS[room.players.length % COLORS.length];

// Un turno nuevo: los cinco dados en el cubilete. `rollN` no vuelve a 0 en toda la partida: con eso cada
// pantalla sabe qué tirada ya mostró y dos clics seguidos no tiran dos veces (`seen`).
function newTurn(playerId, n, rollN) {
  return { n, p: playerId, rolls: 0, rollN, dice: [0, 0, 0, 0, 0], held: [0, 0, 0, 0, 0], poses: [null, null, null, null, null], thrown: [], throw: null, cocked: false };
}

const active = (room) => room.players.filter((p) => !p.left);

function finish(next, winners, reason, now) {
  next.phase = 'ended';
  next.winners = winners;
  next.reason = reason;
  next.endedAt = now;
}

// Le toca al que sigue con casillas libres; si no queda nadie, gana el que más sumó.
function advance(next, now) {
  const order = next.players;
  const from = order.findIndex((p) => p.id === next.turn.p);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(from + k) % order.length];
    if (!p.left && !isDone(next, p)) { next.turn = newTurn(p.id, next.turn.n + 1, next.turn.rollN); return; }
  }
  finishByPoints(next, 'puntos', now);
}

// Gana el que más sumó entre los que siguen jugando (si empatan, ganan todos los empatados).
function finishByPoints(next, reason, now) {
  const playing = active(next);
  const best = Math.max(0, ...playing.map((p) => totalOf(p.sheet)));
  finish(next, playing.filter((p) => totalOf(p.sheet) === best).map((p) => p.id), reason, now);
}

// El orden del final: primero los que ganaron (con la generala servida gana el que la sacó, sume lo que sume),
// después por puntos. Cada uno lleva su puesto; los empatados comparten puesto.
export function ranking(room) {
  const wins = (p) => (room.winners?.includes(p.id) ? 1 : 0);
  const list = [...room.players].sort((a, b) => wins(b) - wins(a) || totalOf(b.sheet) - totalOf(a.sheet));
  let place = 0;
  return list.map((p, i) => {
    const prev = list[i - 1];
    if (!prev || wins(prev) !== wins(p) || totalOf(prev.sheet) !== totalOf(p.sheet)) place = i + 1;
    return { ...p, total: totalOf(p.sheet), place };
  });
}

function removePlayer(next, id, now) {
  const me = findPlayer(next, id);
  if (next.phase === 'playing') {
    // En plena partida queda en la planilla, marcado: su turno se saltea.
    me.left = true;
    if (!active(next).length) finish(next, [], 'vacía', now);
    else if (next.turn.p === id) advance(next, now);
  } else {
    next.players = next.players.filter((p) => p.id !== id);
    next.winners = next.winners.filter((w) => w !== id);
  }
  if (next.hostId === id) next.hostId = (active(next)[0] || next.players[0])?.id || '';
}

const isPose = (p) => Array.isArray(p) && p.length === 7 && p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100);
const round4 = (n) => Math.round(n * 10000) / 10000;

// Por qué no se puede tirar ahora (o null si se puede). Lo usan el reducer y los botones.
export function rollProblem(room, playerId) {
  const t = room?.turn;
  if (room?.phase !== 'playing' || !t) return 'La partida no está en juego.';
  if (t.p !== playerId) return 'No es tu turno.';
  if (t.cocked) return null;
  if (t.rolls >= MAX_ROLLS) return 'Ya usaste las tres tiradas: anotá en la planilla.';
  if (t.rolls > 0 && t.held.every(Boolean)) return 'Guardaste los cinco dados: soltá alguno o anotá.';
  return null;
}

// Por qué no se pueden apartar dados ahora (o null si se puede): entre tirada y tirada, mientras queden intentos.
export function holdProblem(room, playerId) {
  const t = room?.turn;
  if (room?.phase !== 'playing' || !t) return 'La partida no está en juego.';
  if (t.p !== playerId) return 'No es tu turno.';
  if (t.rolls < 1) return 'Primero tirá los dados.';
  if (t.cocked) return 'Hay un dado montado: tirá de nuevo.';
  if (t.rolls >= MAX_ROLLS) return 'Ya no quedan tiradas.';
  return null;
}

// Los dados que salen del cubilete en la próxima tirada: los que no están guardados (o, si quedó uno
// montado, los mismos de recién).
export function diceToThrow(room) {
  const t = room.turn;
  if (t.cocked) return [...t.thrown];
  return [0, 1, 2, 3, 4].filter((i) => !t.held[i]);
}

// Por qué no se puede anotar en esa casilla (o null si se puede).
export function scoreProblem(room, playerId, cat) {
  const t = room?.turn;
  if (room?.phase !== 'playing' || !t) return 'La partida no está en juego.';
  if (t.p !== playerId) return 'No es tu turno.';
  if (!categoriesFor(room).some((c) => c.id === cat)) return 'Esa casilla no se juega.';
  if (t.rolls < 1) return 'Primero tirá los dados.';
  if (t.cocked) return 'Hay un dado montado: tirá de nuevo.';
  if (findPlayer(room, playerId).sheet[cat] !== undefined) return 'Esa casilla ya está anotada.';
  return null;
}

// Lo que se anotaría ahora en cada casilla libre del que juega: { casilla: puntos }.
export function preview(room) {
  const t = room?.turn;
  const me = currentPlayer(room);
  if (!me || t.rolls < 1 || t.cocked) return {};
  const out = {};
  for (const c of categoriesFor(room)) {
    if (me.sheet[c.id] === undefined) out[c.id] = scoreFor(c.id, t.dice, { served: t.rolls === 1, sheet: me.sheet });
  }
  return out;
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE || !action) return null;
  // El anfitrión saca a alguien: es su `leave`, y con esa pantalla no puede volver a entrar.
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'playing', 'ended']);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = JSON.parse(JSON.stringify(room));
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const t = next.turn;

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
      if (!me || me.left) return null;
      removePlayer(next, me.id, now);
      break;
    }

    case 'setOptions': {
      if (!host || next.phase !== 'lobby') return null;
      next.options = cleanOptions({ ...next.options, ...action.options });
      break;
    }

    case 'start': {
      if (!host || !['lobby', 'ended'].includes(next.phase)) return null;
      next.players = next.players.filter((p) => !p.left);
      if (next.players.length < MIN_PLAYERS) return null;
      for (const p of next.players) p.sheet = {};
      next.options = cleanOptions(next.options);
      next.phase = 'playing';
      next.winners = [];
      next.reason = '';
      next.last = null;
      next.startedAt = now;
      // Arranca uno al azar; después se sigue en ronda.
      const first = next.players[Math.floor(rand() * next.players.length) % next.players.length];
      next.turn = newTurn(first.id, 1, (room.turn?.rollN || 0));
      break;
    }

    case 'toLobby': {
      if (!host || next.phase !== 'ended') return null;
      next.players = next.players.filter((p) => !p.left);
      for (const p of next.players) p.sheet = {};
      next.phase = 'lobby';
      next.turn = null;
      next.last = null;
      next.winners = [];
      next.reason = '';
      break;
    }

    // El anfitrión corta la partida: se termina ahí, con lo que cada uno lleva anotado.
    case 'endGame': {
      if (!host || next.phase !== 'playing') return null;
      finishByPoints(next, 'cortada', now);
      break;
    }

    // Apartar un dado en el estante (o devolverlo a la bandeja) entre tirada y tirada.
    case 'hold': {
      const i = action.i;
      if (holdProblem(next, action.playerId) || action.turn !== t.n || action.seen !== t.rollN) return null;
      if (!Number.isInteger(i) || i < 0 || i >= DICE || !t.dice[i]) return null;
      t.held[i] = t.held[i] ? 0 : 1;
      break;
    }

    case 'roll': {
      if (rollProblem(next, action.playerId) || action.seen !== t.rollN) return null;
      const thrown = diceToThrow(next);
      const gesture = cleanThrow(action.throw);
      const { values, poses } = action;
      if (!gesture || !Array.isArray(values) || !Array.isArray(poses) || values.length !== thrown.length || poses.length !== thrown.length) return null;
      if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 6) || !poses.every(isPose)) return null;
      thrown.forEach((i, k) => {
        t.dice[i] = values[k];
        t.poses[i] = poses[k].map(round4);
      });
      t.thrown = thrown;
      t.throw = gesture;
      t.rollN += 1;
      // Con un dado montado la tirada no vale: no gasta intento y se tiran de nuevo esos mismos dados.
      t.cocked = values.includes(0);
      if (!t.cocked) t.rolls += 1;
      break;
    }

    case 'score': {
      const cat = action.cat;
      if (scoreProblem(next, action.playerId, cat) || action.turn !== t.n) return null;
      const served = t.rolls === 1;
      const pts = scoreFor(cat, t.dice, { served, sheet: me.sheet });
      me.sheet[cat] = pts;
      next.last = { n: t.n, p: me.id, cat, pts, served: served && pts > 0 && cat !== 'doble' && Boolean(CATEGORY[cat].points) };
      // Generala servida: gana la partida ahí mismo (si la sala juega con esa regla).
      if (cat === 'gen' && pts > 0 && served && next.options.servida) finish(next, [me.id], 'servida', now);
      else advance(next, now);
      break;
    }

    default:
      return null;
  }

  next.updatedAt = now;
  return next;
}
