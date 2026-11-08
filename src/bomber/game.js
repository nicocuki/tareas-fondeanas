// Bombardero: reducer de la sala, mismo patrón que Pixel Royale. Corre en la transacción de
// `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo de a una vez: quién juega, la semilla de cada ronda, quién murió (y por quién), qué
// ítems se agarraron (y quién) y las rondas ganadas. El movimiento, las bombas y el fuego van en
// tiempo real por otro lado (BomberGame.jsx): cada pantalla es dueña de su jugador y avisa acá
// cuando muere o agarra algo.
import { BOARDS, boardFor, itemAt } from './map.js';
import { COUNTDOWN_MS } from './sim.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'bomber';
export const MAX_PLAYERS = BOARDS.big.max;
export const MIN_PLAYERS = 2;
export const GRACE_MS = 700;        // después de la anteúltima muerte, por si el último cae en el mismo fuego (empate)
export const ROUND_END_MS = 4500;   // cuánto se muestra quién ganó la ronda

export const COLORS = ['#f0f0f0', '#3b3b3b', '#e23b3b', '#3b7be2', '#3fb850', '#f2c230', '#b04ae0', '#ff8c2a'];
export const COLOR_NAMES = ['Blanco', 'Negro', 'Rojo', 'Azul', 'Verde', 'Amarillo', 'Violeta', 'Naranja'];

export const DEFAULT_OPTIONS = { wins: 3, minutes: 2, skulls: true };
export const OPTION_VALUES = { wins: [1, 2, 3, 5], minutes: [2, 3, 5], skulls: [true, false] };

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);
export const alive = (room) => inGame(room).filter((p) => p.alive);
export const roundSeconds = (room) => (room.match?.minutes || room.options.minutes) * 60;

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
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, alive: false, wins: 0, kills: 0 };
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

// Arma una ronda nueva con todos los que están en la sala.
function newRound(next, now, rand, round) {
  for (const p of next.players) Object.assign(p, { inGame: true, alive: true });
  const prev = next.match;
  next.match = {
    n: round === 1 ? (prev?.n || 0) + 1 : prev.n,
    round,
    seed: Math.floor(rand() * 2 ** 31),
    minutes: next.options.minutes,
    skulls: next.options.skulls,
    startsAt: now + COUNTDOWN_MS,
    order: shuffle(next.players.map((p) => p.id), rand), // en qué lugar del tablero aparece cada uno
    size: next.players.length,
    deaths: [],
    took: {},
    endsAt: 0,       // cuando queda uno (o ninguno): la hora en que se decide la ronda
    winner: null,    // quién ganó la ronda (null: empate)
    champion: null,  // quién ganó la partida
  };
  next.phase = 'playing';
}

function kill(room, target, byId, how) {
  target.alive = false;
  const valid = byId && findPlayer(room, byId)?.inGame;
  room.match.deaths.push({ id: target.id, by: valid ? byId : null, w: how === 'press' ? 'press' : valid ? (byId === target.id ? 'self' : 'bomb') : 'bomb' });
  if (valid && byId !== target.id) findPlayer(room, byId).kills += 1;
}

// Si queda uno (o ninguno) vivo, la ronda se decide enseguida… con un respiro por si el último cae en el mismo fuego.
function checkRound(room, now) {
  if (room.phase !== 'playing' || room.match.endsAt) return;
  if (alive(room).length <= 1) room.match.endsAt = now + GRACE_MS;
}

// Cierra la ronda: gana el que queda, o nadie.
function endRound(next, now) {
  const left = alive(next);
  const winner = left.length === 1 ? left[0] : null;
  if (winner) winner.wins += 1;
  next.match.winner = winner?.id || null;
  next.match.endsAt = now;
  next.phase = 'roundEnd';
}

export function ranking(room) {
  return [...room.players].sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.name.localeCompare(b.name));
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
  const sameRound = next.match && action.match === next.match.n && action.round === next.match.round;

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        break;
      }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      // El que entra con la partida empezada mira esta ronda y juega la que viene.
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next)));
      break;
    }

    case 'leave': {
      if (!me) return null;
      if (next.phase === 'playing' && me.inGame && me.alive) kill(next, me, null);
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) break;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      if (next.phase === 'playing') checkRound(next, now);
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
      for (const p of next.players) Object.assign(p, { wins: 0, kills: 0 });
      newRound(next, now, rand, 1);
      break;
    }

    // Lo manda cada pantalla por su jugador (con `by`: el dueño de la bomba, puede ser uno mismo; `w: 'press'`
    // si lo aplastó un bloque); el anfitrión, por alguien que dejó de mandar fotos.
    case 'died': {
      const target = action.target ? (host ? findPlayer(next, action.target) : null) : me;
      if (next.phase !== 'playing' || !sameRound || !target?.inGame || !target.alive || now < next.match.startsAt) return null;
      kill(next, target, action.by, action.w);
      checkRound(next, now);
      break;
    }

    // Un ítem: se lo lleva el primero que pisa la casilla (la transacción deja pasar a uno).
    case 'take': {
      const c = action.c;
      if (next.phase !== 'playing' || !sameRound || !me?.alive || !Number.isInteger(c)) return null;
      const { W, H } = boardFor(next.match.size);
      if (c < 0 || c >= W * H || !itemAt(next.match.seed, c, next.match.skulls) || next.match.took[c]) return null;
      next.match.took[c] = me.id;
      break;
    }

    // El reloj: lo manda cualquier pantalla cuando ve que hay algo que cerrar. Idempotente: si no hay nada, null.
    case 'tick': {
      const m = next.match;
      if (!m || !sameRound) return null;
      if (next.phase === 'playing') {
        const timeUp = now >= m.startsAt + roundSeconds(next) * 1000;
        if (!(m.endsAt && now >= m.endsAt) && !timeUp) return null;
        endRound(next, now);
        break;
      }
      if (next.phase === 'roundEnd') {
        if (now < m.endsAt + ROUND_END_MS) return null;
        const champ = next.players.find((p) => p.wins >= next.options.wins);
        if (champ || next.players.length < MIN_PLAYERS) {
          m.champion = champ?.id || null;
          next.phase = 'final';
          for (const p of next.players) Object.assign(p, { alive: false });
        } else newRound(next, now, rand, m.round + 1);
        break;
      }
      return null;
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
