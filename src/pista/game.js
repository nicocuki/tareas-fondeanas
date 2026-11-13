// Pista Loca: reducer de la sala. Tres rondas eliminatorias (carrera, supervivencia y final) con robotitos.
// Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo de a una vez: quién corre cada ronda, quién llegó (y en qué orden), quién se cayó y quién pasa a la
// siguiente. El movimiento va en vivo por otro lado (PistaGame.jsx): cada pantalla mueve a su robot y avisa
// `finish` (llegó a la meta) o `fall` (se cayó en la supervivencia).
import { COURSES, ROUND_KINDS } from './courses.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'pista';
export const MAX_PLAYERS = 16;
export const MIN_PLAYERS = 1;   // solo se puede practicar
export const COUNTDOWN_MS = 4000;
export const ROUND_END_MS = 6000;

export const COLORS = ['#ff5a5f', '#4aa0ff', '#5ed36b', '#ffd23f', '#c46bff', '#ff9a3c', '#3fe0d0', '#ff7ac8', '#a5e04a', '#e9edf2', '#8d6e63', '#26a69a', '#ec407a', '#7e57c2', '#ffa726', '#78909c'];

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return { gameType: GAME_TYPE, phase: 'lobby', hostId, options: {}, players: [newPlayer(hostId, hostName, avatar, 0)], round: null, n: 0, winner: null, createdAt: now, updatedAt: now };
}
function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, wins: 0 };
}
const freeColor = (room) => { for (let c = 0; c < COLORS.length; c++) if (!room.players.some((p) => p.color === c)) return c; return room.players.length % COLORS.length; };

export function startProblem(room) {
  if (room.players.length < MIN_PLAYERS) return 'Hace falta al menos un jugador.';
  return null;
}

// Cuántos pasan: en la carrera, el 60 %; en la supervivencia, la mitad. Con dos o menos no se elimina a nadie antes de la final.
export function quotaFor(kind, n) {
  if (kind === 'final') return 1;
  if (n <= 2) return n;
  return kind === 'race' ? Math.ceil(n * 0.6) : Math.ceil(n / 2);
}

function newRound(next, kindIndex, players, now) {
  let i = kindIndex;
  // Con dos o menos, la supervivencia no elimina a nadie: se pasa directo a la final.
  if (ROUND_KINDS[i] === 'survive' && players.length <= 2) i += 1;
  const kind = ROUND_KINDS[i];
  next.n += 1;
  next.round = {
    n: next.n, i, kind, players: [...players], quota: quotaFor(kind, players.length),
    startsAt: now + COUNTDOWN_MS, endsAt: now + COUNTDOWN_MS + COURSES[kind].seconds * 1000,
    done: [], out: [], result: null, nextAt: 0,
  };
  next.phase = 'playing';
}

// Termina la ronda: quién pasa y quién queda afuera. Si era la final (o queda uno solo), hay ganador.
function endRound(next, now) {
  const r = next.round;
  let qualified;
  if (r.kind === 'survive') {
    qualified = r.players.filter((id) => !r.out.includes(id));
    if (!qualified.length) qualified = r.out.slice(-r.quota); // se cayeron todos: pasan los últimos en caer
  } else {
    qualified = r.done.slice(0, r.kind === 'final' ? 1 : r.quota);
    if (!qualified.length && r.kind !== 'final') qualified = [...r.players]; // no llegó nadie: siguen todos
  }
  r.result = { qualified, eliminated: r.players.filter((id) => !qualified.includes(id)) };
  r.nextAt = now + ROUND_END_MS;
  next.phase = 'roundEnd';
  if (r.kind === 'final' || qualified.length <= 1 || (r.i >= ROUND_KINDS.length - 1)) {
    next.winner = qualified[0] || null;
    r.last = true;
    const w = findPlayer(next, next.winner);
    if (w) w.wins += 1;
  }
}

function checkRound(next, now) {
  const r = next.round;
  if (next.phase !== 'playing') return;
  const left = r.players.filter((id) => !r.out.includes(id) && !r.done.includes(id));
  if (r.kind === 'race' && (r.done.length >= r.quota || !left.length)) endRound(next, now);
  else if (r.kind === 'final' && (r.done.length >= 1 || !r.players.length)) endRound(next, now);
  else if (r.kind === 'survive' && r.players.length - r.out.length <= Math.min(r.quota, r.players.length - 1)) endRound(next, now);
  else if (r.kind === 'survive' && r.players.length === r.out.length) endRound(next, now);
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  if (action.type === 'kick') {
    const target = kickTarget(room, action);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left && left !== room ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
  const now = ctx.now ?? Date.now();
  const next = JSON.parse(JSON.stringify(room));
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const r = next.round;
  const thisRound = r && action.round === r.n;
  const racing = r && r.players.includes(action.playerId);

  switch (action.type) {
    case 'join': {
      if (me) { me.name = cleanName(action.name) || me.name; if (action.avatar) me.avatar = action.avatar; break; }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next))); // si hay partida, mira hasta la próxima
      break;
    }
    case 'leave': {
      if (!me) return null;
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) break;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      if (r && (next.phase === 'playing' || next.phase === 'roundEnd')) {
        r.players = r.players.filter((id) => id !== me.id);
        r.done = r.done.filter((id) => id !== me.id);
        r.out = r.out.filter((id) => id !== me.id);
        if (r.result) r.result.qualified = r.result.qualified.filter((id) => id !== me.id);
        if (next.phase === 'playing') { if (!r.players.length) { next.phase = 'final'; next.winner = null; } else checkRound(next, now); }
      }
      break;
    }
    case 'start': {
      if (!host || !['lobby', 'final'].includes(next.phase) || startProblem(next)) return null;
      next.winner = null;
      newRound(next, 0, next.players.map((p) => p.id), now);
      break;
    }
    // Llegó a la meta (carrera o final).
    case 'finish': {
      if (next.phase !== 'playing' || !thisRound || !racing || r.kind === 'survive' || now < r.startsAt || r.done.includes(me.id)) return null;
      r.done.push(me.id);
      checkRound(next, now);
      break;
    }
    // Se cayó en la supervivencia: queda afuera.
    case 'fall': {
      if (next.phase !== 'playing' || !thisRound || !racing || r.kind !== 'survive' || now < r.startsAt || r.out.includes(me.id)) return null;
      r.out.push(me.id);
      checkRound(next, now);
      break;
    }
    // Cualquier pantalla: se acabó el tiempo de la ronda, o la pausa entre rondas.
    case 'tick': {
      if (!thisRound) return null;
      if (next.phase === 'playing' && now >= r.endsAt) { endRound(next, now); break; }
      if (next.phase === 'roundEnd' && now >= r.nextAt) {
        if (r.last) { next.phase = 'final'; break; }
        newRound(next, r.i + 1, r.result.qualified, now);
        break;
      }
      return null;
    }
    case 'toLobby': {
      if (!host || next.phase !== 'final') return null;
      next.phase = 'lobby';
      next.round = null;
      break;
    }
    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}
