// Cohete Royale (un Rocket Bot Royale): reducer de la sala, mismo patrón que los otros juegos. Corre en
// la transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá va lo que es de a una vez: quién juega, la semilla de la isla, quién murió (y quién lo mató),
// qué monedas y cajas ya se agarraron y el ranking. El movimiento, los tiros y las explosiones van en
// tiempo real por otro lado (CohetesGame.jsx): cada pantalla es dueña de su tanque y avisa acá
// cuando muere (`died`), igual que en A los Tiros.
import { ITEMS, MAX_COINS, MAX_CRATES } from './sim.js';

export const GAME_TYPE = 'cohetes';
export const MAX_PLAYERS = 25;
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 5000; // «¡Preparate!» mientras la nave entra al mapa

// Un color por jugador (hasta 25).
export const COLORS = [
  '#f2a93b', '#3d8fe0', '#4cc35a', '#e5484d', '#a463d9', '#f2d22e', '#2ec4c4', '#ec6fb6', '#ff7a29',
  '#8bd35f', '#5b6ef0', '#c9a27e', '#f5f5f5', '#7a8597', '#1f9d8a', '#d94f9c', '#ffb3a7', '#9b7bff',
  '#3a3f4b', '#b8e05a', '#ff5470', '#6ad1ff', '#a0522d', '#ffd8a8', '#7cfc9a',
];

export const DEFAULT_OPTIONS = { water: 1 };
export const OPTION_VALUES = { water: [0.6, 1, 1.6] };

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
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, alive: false, kills: 0, coins: 0, place: 0 };
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

// Puntos del ranking: como en el original, cuenta el puesto, las bajas y las monedas.
export const score = (p, total) => (p.place ? (total - p.place) * 10 : 0) + p.kills * 25 + p.coins * 2;

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
  room.match.deaths.push({ id: target.id, by: byId || null, w: byId && ITEMS[weapon] ? weapon : null });
  const by = byId && byId !== target.id ? findPlayer(room, byId) : null;
  if (by?.inGame) by.kills += 1;
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
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
      if (!host || !['lobby', 'final'].includes(next.phase) || next.players.length < MIN_PLAYERS) return null;
      for (const p of next.players) Object.assign(p, { inGame: true, alive: true, kills: 0, coins: 0, place: 0 });
      next.match = {
        n: (next.match?.n || 0) + 1,
        seed: Math.floor(rand() * 2 ** 31),
        startsAt: now + COUNTDOWN_MS,
        order: shuffle(next.players.map((p) => p.id), rand), // dónde arranca cada uno
        size: next.players.length,                            // el ancho de la isla depende de esto
        deaths: [],
        coins: {},
        crates: {},
        winner: null,
      };
      next.phase = 'playing';
      break;
    }

    // Lo manda cada pantalla por su tanque; el anfitrión, por alguien que dejó de mandar señales.
    case 'died': {
      const target = action.target ? (host ? findPlayer(next, action.target) : null) : me;
      if (next.phase !== 'playing' || !sameMatch || !target?.inGame || !target.alive || now < next.match.startsAt) return null;
      const by = action.by && findPlayer(next, action.by)?.inGame ? action.by : null;
      kill(next, target, by, action.w);
      checkEnd(next);
      break;
    }

    // Monedas y cajas: las agarra el primero que llega (la transacción deja pasar uno).
    case 'coin': {
      const i = action.i;
      if (next.phase !== 'playing' || !sameMatch || !me?.alive || !Number.isInteger(i) || i < 0 || i >= MAX_COINS || next.match.coins[i]) return null;
      next.match.coins[i] = me.id;
      me.coins += 1;
      break;
    }
    case 'crate': {
      const i = action.i;
      if (next.phase !== 'playing' || !sameMatch || !me?.alive || !Number.isInteger(i) || i < 0 || i >= MAX_CRATES || next.match.crates[i]) return null;
      next.match.crates[i] = me.id;
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
