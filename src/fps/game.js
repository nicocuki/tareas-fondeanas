// Fuego Cruzado: reducer de la sala. Todos contra todos en primera persona, con armas tiradas en el mapa.
// Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo de a una vez: quién juega, el mapa, las bajas (quién mató a quién), quién agarró cada arma del mapa y
// cuándo, y cuándo termina. El movimiento y los tiros van en tiempo real por otro lado (FpsGame.jsx): cada pantalla
// es dueña de su jugador, juzga sus tiros y avisa `died` cuando muere. Al morir se reaparece solo, en la pantalla.
import { WEAPONS } from '../royale3d/sim.js';
import { GUN_RESPAWN_MS, MAP_IDS, gunReady, mapById } from './maps.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'fps';
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 5000;
export const MAX_FEED = 12;     // las últimas bajas que quedan en la sala (para el cartel de arriba a la derecha)
export const MAX_DROPPED = 80;  // armas soltadas al morir que se anotan como agarradas

export const COLORS = ['#ff5a5f', '#4aa0ff', '#5ed36b', '#ffd23f', '#c46bff', '#ff9a3c', '#3fe0d0', '#ff7ac8', '#a5e04a', '#e9edf2'];
export const COLOR_NAMES = ['Rojo', 'Azul', 'Verde', 'Amarillo', 'Violeta', 'Naranja', 'Turquesa', 'Rosa', 'Lima', 'Blanco'];

export const DEFAULT_OPTIONS = { map: 'random', minutes: 5, limit: 20 };
export const OPTION_VALUES = { map: ['random', ...MAP_IDS], minutes: [3, 5, 8, 10], limit: [10, 20, 30, 50] };

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);

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
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, kills: 0, deaths: 0, heads: 0 };
}

const freeColor = (room) => { for (let c = 0; c < COLORS.length; c++) if (!room.players.some((p) => p.color === c)) return c; return room.players.length % COLORS.length; };

export function startProblem(room) {
  if (room.players.length < MIN_PLAYERS) return `Hacen falta al menos ${MIN_PLAYERS} jugadores.`;
  if (room.players.length > MAX_PLAYERS) return `Son hasta ${MAX_PLAYERS}.`;
  return null;
}

// La tabla: más bajas primero; si empatan, menos muertes.
export const ranking = (room) => [...inGame(room)].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

function newMatch(next, now, rand) {
  for (const p of next.players) Object.assign(p, { inGame: true, kills: 0, deaths: 0, heads: 0 });
  const map = next.options.map === 'random' ? MAP_IDS[Math.floor(rand() * MAP_IDS.length)] : next.options.map;
  next.match = {
    n: (next.match?.n || 0) + 1,
    map,
    startsAt: now + COUNTDOWN_MS,
    endsAt: now + COUNTDOWN_MS + next.options.minutes * 60000,
    limit: next.options.limit,
    feed: [],    // { id, by, w, h } las últimas bajas
    took: {},    // arma del mapa (`s3`) -> cuándo la agarraron; arma soltada (`w12.3`) -> 1
    winner: null,
  };
  next.phase = 'playing';
}

function finish(room) {
  room.match.winner = ranking(room)[0]?.id || null;
  room.phase = 'final';
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
      const p = newPlayer(action.playerId, action.name, action.avatar, freeColor(next));
      // En un todos contra todos se puede entrar con la partida empezada: arranca en cero.
      if (next.phase === 'playing') p.inGame = true;
      next.players.push(p);
      break;
    }

    case 'leave': {
      if (!me) return null;
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) break;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      if (next.phase === 'playing' && next.players.length < MIN_PLAYERS) finish(next);
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

    // Lo manda cada pantalla cuando su jugador muere (`by`: quién lo mató, `w`: con qué, `h`: tiro a la cabeza).
    case 'died': {
      if (next.phase !== 'playing' || !sameMatch || !me?.inGame || now < next.match.startsAt) return null;
      const killer = action.by && action.by !== me.id ? findPlayer(next, action.by) : null;
      me.deaths += 1;
      if (killer?.inGame) { killer.kills += 1; if (action.h) killer.heads += 1; }
      const w = WEAPONS[action.w] ? action.w : null;
      next.match.feed.push({ id: me.id, by: killer ? killer.id : null, w, h: action.h ? 1 : 0 });
      if (next.match.feed.length > MAX_FEED) next.match.feed.splice(0, next.match.feed.length - MAX_FEED);
      if (killer && killer.kills >= next.match.limit) finish(next);
      break;
    }

    // Agarrar un arma: las del mapa (`s{n}`) vuelven a aparecer a los GUN_RESPAWN_MS; las soltadas al morir (`w{n}.{d}`), no.
    case 'take': {
      const key = action.key;
      if (next.phase !== 'playing' || !sameMatch || !me?.inGame || typeof key !== 'string') return null;
      const took = next.match.took;
      const spawn = /^s(\d{1,2})$/.exec(key);
      if (spawn) {
        if (Number(spawn[1]) >= mapById(next.match.map).guns.length || !gunReady(took, key, now)) return null;
        took[key] = now;
      } else if (/^w\d{1,5}\.\d{1,2}$/.test(key)) {
        if (took[key]) return null;
        const dropped = Object.keys(took).filter((k) => k[0] === 'w');
        if (dropped.length >= MAX_DROPPED) delete took[dropped[0]];
        took[key] = 1;
      } else return null;
      break;
    }

    // Cualquier pantalla avisa cuando se acabó el tiempo.
    case 'tick': {
      if (next.phase !== 'playing' || !sameMatch || now < next.match.endsAt) return null;
      finish(next);
      break;
    }

    case 'toLobby': {
      if (!host || next.phase !== 'final') return null;
      next.phase = 'lobby';
      for (const p of next.players) p.inGame = false;
      break;
    }

    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}

export { GUN_RESPAWN_MS };
