// Royale 3D (beta): reducer de la sala, mismo patrón que Pixel Royale y Bombardero. Corre en la
// transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo de a una vez: quién juega, la semilla de la isla, quién murió (y por quién) y quién ganó.
// El movimiento y los tiros van en tiempo real por otro lado (Royale3DGame.jsx): cada pantalla es
// dueña de su jugador y avisa acá cuando muere.
import { COUNTDOWN_MS } from './sim.js';
import { STORM_SPEEDS } from './map.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'royale3d';
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export const COLORS = ['#e23b3b', '#3b7be2', '#3fb850', '#f2c230', '#b04ae0', '#ff8c2a', '#2cc4c4', '#f0f0f0'];
export const COLOR_NAMES = ['Rojo', 'Azul', 'Verde', 'Amarillo', 'Violeta', 'Naranja', 'Turquesa', 'Blanco'];

export const DEFAULT_OPTIONS = { storm: 'normal' };
export const OPTION_VALUES = { storm: Object.keys(STORM_SPEEDS) };

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);
export const alive = (room) => inGame(room).filter((p) => p.alive);
export const stormSpeed = (room) => STORM_SPEEDS[room.match?.storm || room.options.storm] || 1;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, 0)],
    match: null,
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, alive: false, kills: 0 };
}

const freeColor = (room) => { for (let c = 0; c < COLORS.length; c++) if (!room.players.some((p) => p.color === c)) return c; return room.players.length % COLORS.length; };

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startProblem(room) {
  if (room.players.length < MIN_PLAYERS) return `Hacen falta al menos ${MIN_PLAYERS} jugadores.`;
  if (room.players.length > MAX_PLAYERS) return `Son hasta ${MAX_PLAYERS}.`;
  return null;
}

function newMatch(next, now, rand) {
  for (const p of next.players) Object.assign(p, { inGame: true, alive: true, kills: 0 });
  next.match = {
    n: (next.match?.n || 0) + 1,
    seed: Math.floor(rand() * 2 ** 31),
    storm: next.options.storm,
    startsAt: now + COUNTDOWN_MS,
    order: shuffle(next.players.map((p) => p.id), rand), // en qué lugar de la isla aparece cada uno
    size: next.players.length,
    deaths: [],   // { id, by, w } en el orden en que fueron cayendo
    winner: null,
  };
  next.phase = 'playing';
}

function kill(room, target, byId, how) {
  target.alive = false;
  const killer = byId && byId !== target.id ? findPlayer(room, byId) : null;
  room.match.deaths.push({ id: target.id, by: killer?.inGame ? killer.id : null, w: how === 'storm' ? 'storm' : killer?.inGame ? 'player' : 'other' });
  if (killer?.inGame) killer.kills += 1;
}

// Si queda uno (o ninguno) en pie, se terminó.
function checkEnd(room) {
  if (room.phase !== 'playing' || alive(room).length > 1) return;
  const left = alive(room)[0];
  room.match.winner = left?.id || room.match.deaths.at(-1)?.id || null; // si caen juntos, gana el último en caer
  room.phase = 'final';
}

// Puestos: el ganador primero y después los demás, del último en caer al primero.
export function ranking(room) {
  const order = [...(room.match?.deaths || [])].reverse().map((d) => d.id);
  const ids = [room.match?.winner, ...order].filter((id, i, a) => id && a.indexOf(id) === i);
  const rest = room.players.filter((p) => !ids.includes(p.id)).map((p) => p.id);
  return [...ids, ...rest].map((id) => findPlayer(room, id)).filter(Boolean);
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
  const rand = ctx.rand ?? Math.random;
  const next = JSON.parse(JSON.stringify(room));
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const sameMatch = next.match && action.match === next.match.n;

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        break;
      }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next)));
      break;
    }

    case 'leave': {
      if (!me) return null;
      if (next.phase === 'playing' && me.inGame && me.alive) kill(next, me, null);
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) break;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      checkEnd(next);
      break;
    }

    case 'setOptions': {
      if (!host || next.phase !== 'lobby') return null;
      for (const [k, v] of Object.entries(action.options || {})) {
        if (!OPTION_VALUES[k]?.includes(v)) return null;
        next.options[k] = v;
      }
      break;
    }

    case 'start': {
      if (!host || !['lobby', 'final'].includes(next.phase) || startProblem(next)) return null;
      newMatch(next, now, rand);
      break;
    }

    // Lo manda cada pantalla por su jugador (`by`: quién lo mató; `w: 'storm'` si lo mató la tormenta); el anfitrión, por alguien que dejó de mandar fotos.
    case 'died': {
      const target = action.target ? (host ? findPlayer(next, action.target) : null) : me;
      if (next.phase !== 'playing' || !sameMatch || !target?.inGame || !target.alive || now < next.match.startsAt) return null;
      kill(next, target, action.by, action.w);
      checkEnd(next);
      break;
    }

    case 'toLobby': {
      if (!host || next.phase !== 'final') return null;
      next.phase = 'lobby';
      for (const p of next.players) Object.assign(p, { inGame: false, alive: false });
      break;
    }

    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}
