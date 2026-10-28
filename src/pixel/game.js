// Pixel Royale: reducer de la sala, mismo patrón que Cohete Royale. Corre en la transacción de
// `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo que es de a una vez: quién juega, el mapa y su semilla, quién murió (y quién lo mató),
// qué cofres ya se abrieron y el ranking. El movimiento, los tiros y las explosiones van en tiempo
// real por otro lado (PixelGame.jsx): cada pantalla es dueña de su jugador y avisa acá cuando muere.
import { LOOT_LIMIT, WEAPONS } from './sim.js';
import { MAPS, MAP_IDS } from './map.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'pixel';
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 15000; // la isla de espera: se camina y se prueba la pistola antes de subir al bus

export const COLORS = ['#ff5a5f', '#4aa0ff', '#5ed36b', '#ffd23f', '#c46bff', '#ff9a3c', '#3fe0d0', '#ff7ac8', '#a5e04a', '#e9edf2'];

export const DEFAULT_OPTIONS = { map: 'grande', zone: 1 };
export const OPTION_VALUES = { map: MAP_IDS, zone: [0.7, 1, 1.5] };

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);
export const alive = (room) => inGame(room).filter((p) => p.alive);

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, COLORS[0])],
    match: null,
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, alive: false, kills: 0, loot: 0, place: 0 };
}

const freeColor = (room) => COLORS.find((c) => !room.players.some((p) => p.color === c)) || COLORS[room.players.length % COLORS.length];

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// El mapa chico es para hasta 5; el grande, para 10.
export const mapFits = (mapId, count) => count <= (MAPS[mapId]?.players || MAX_PLAYERS);
export function startProblem(room) {
  if (room.players.length < MIN_PLAYERS) return `Hacen falta al menos ${MIN_PLAYERS} jugadores.`;
  if (!mapFits(room.options.map, room.players.length)) return `${MAPS[room.options.map].name} es para hasta ${MAPS[room.options.map].players}: elegí la grande.`;
  return null;
}

// Puntos del ranking: cuenta el puesto, las bajas y el botín.
export const score = (p, total) => (p.place ? (total - p.place) * 10 : 0) + p.kills * 25 + p.loot;

export function ranking(room) {
  const total = inGame(room).length;
  return inGame(room).sort((a, b) => (a.place || 99) - (b.place || 99) || score(b, total) - score(a, total));
}

// Si queda uno solo vivo (o ninguno), termina: el que queda sale primero.
function checkEnd(room) {
  if (room.phase !== 'playing') return;
  const left = alive(room);
  if (left.length > 1) return;
  if (left[0]) { left[0].place = 1; left[0].alive = false; }
  room.phase = 'final';
  room.match.winner = left[0]?.id || null;
}

function kill(room, target, byId, weapon) {
  target.alive = false;
  target.place = alive(room).length + 1; // los que siguen vivos van adelante
  const valid = byId && byId !== target.id;
  room.match.deaths.push({ id: target.id, by: valid ? byId : null, w: valid && (WEAPONS[weapon] || weapon === 'grenade' || weapon === 'storm') ? weapon : null });
  const by = valid ? findPlayer(room, byId) : null;
  if (by?.inGame) by.kills += 1;
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  // El anfitrión saca a alguien: es su `leave`, y con esa pantalla no puede volver a entrar.
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
      // El que entra con la partida empezada mira hasta la próxima (inGame: false).
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
      for (const p of next.players) Object.assign(p, { inGame: true, alive: true, kills: 0, loot: 0, place: 0 });
      next.match = {
        n: (next.match?.n || 0) + 1,
        seed: Math.floor(rand() * 2 ** 31),
        map: next.options.map,
        zone: next.options.zone,
        startsAt: now + COUNTDOWN_MS,
        order: shuffle(next.players.map((p) => p.id), rand), // dónde arranca cada uno
        size: next.players.length,
        deaths: [],
        loot: {},
        winner: null,
      };
      next.phase = 'playing';
      break;
    }

    // Lo manda cada pantalla por su jugador; el anfitrión, por alguien que dejó de mandar señales.
    case 'died': {
      const target = action.target ? (host ? findPlayer(next, action.target) : null) : me;
      if (next.phase !== 'playing' || !sameMatch || !target?.inGame || !target.alive || now < next.match.startsAt) return null;
      const by = action.by && findPlayer(next, action.by)?.inGame ? action.by : null;
      kill(next, target, by, action.w);
      checkEnd(next);
      break;
    }

    // Cofre: lo abre el primero que llega (la transacción deja pasar a uno). El contenido sale de la semilla.
    case 'loot': {
      const i = action.i;
      if (next.phase !== 'playing' || !sameMatch || !me?.alive || !Number.isInteger(i) || i < 0 || i >= LOOT_LIMIT || next.match.loot[i]) return null;
      next.match.loot[i] = me.id;
      me.loot += 1;
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
