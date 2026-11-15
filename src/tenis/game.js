// Tenis Movido (prototipo): reducer de la sala. La compu es la «cancha» (el anfitrión, que no juega) y los celulares
// son los controles: entran a la sala como jugadores con un lugar (0 = cerca de la pantalla, 1 = del otro lado).
// Corre en la transacción de `rooms/{código}` con `ctx = { now }` y devuelve null si la acción no vale.
//
// Lo de a una vez va acá (quién controla qué lado, el tanteo); los golpes van en vivo del celular a la compu
// (TenisControl.jsx → TenisScreen.jsx) y la pelota la simula solo la compu.
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'tenis';
export const MAX_PLAYERS = 2;
export const MIN_PLAYERS = 1;   // con uno solo, del otro lado juega la máquina
export const GAMES_TO_WIN = 3;
export const COLORS = ['#ff5a5f', '#4aa0ff'];

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const playerAt = (room, slot) => room?.players.find((p) => p.slot === slot) || null;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return { gameType: GAME_TYPE, phase: 'lobby', hostId, screen: { name: cleanName(hostName) || 'Cancha', avatar: avatar || '📺' }, players: [], score: newScore(), n: 0, winner: null, createdAt: now, updatedAt: now };
}

// ─── El tanteo ───────────────────────────────────────────────────────────────
// Puntos 0, 15, 30, 40 y juego (con iguales y ventaja); gana el partido el primero a GAMES_TO_WIN juegos.
export const newScore = () => ({ p: [0, 0], g: [0, 0], server: 0 });
export function addPoint(score, side) {
  const s = { p: [...score.p], g: [...score.g], server: score.server };
  const o = 1 - side;
  s.p[side] += 1;
  if (s.p[side] >= 4 && s.p[side] - s.p[o] >= 2) {
    s.g[side] += 1;
    s.p = [0, 0];
    s.server = 1 - s.server; // saca el otro en el juego siguiente
  }
  return s;
}
const CALLS = ['0', '15', '30', '40'];
export function pointText(score) {
  const [a, b] = score.p;
  if (a >= 3 && b >= 3) return a === b ? 'Iguales' : `Ventaja ${a > b ? 'cerca' : 'lejos'}`;
  return `${CALLS[Math.min(a, 3)]} – ${CALLS[Math.min(b, 3)]}`;
}
export const matchWinner = (score) => (score.g[0] >= GAMES_TO_WIN ? 0 : score.g[1] >= GAMES_TO_WIN ? 1 : -1);

export function startProblem(room) {
  if (!room.players.length) return 'Conectá al menos un celular: escaneá el QR.';
  return null;
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
  const screen = next.hostId === action.playerId;

  switch (action.type) {
    // Un celular se conecta como control. Toma el lugar libre (o el que pidió, si está libre).
    case 'join': {
      if (screen) return null;
      if (me) { me.name = cleanName(action.name) || me.name; break; }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      const want = action.slot === 0 || action.slot === 1 ? action.slot : null;
      const slot = want != null && !playerAt(next, want) ? want : playerAt(next, 0) ? 1 : 0;
      next.players.push({ id: action.playerId, name: cleanName(action.name), avatar: action.avatar || '🎾', slot });
      break;
    }
    case 'leave': {
      if (!me) return null;
      next.players = next.players.filter((p) => p.id !== me.id);
      break;
    }
    case 'start': {
      if (!screen || next.phase === 'playing' || startProblem(next)) return null;
      next.phase = 'playing';
      next.score = newScore();
      next.winner = null;
      next.n += 1;
      break;
    }
    // Lo anota la cancha cuando la pelota define un punto (lleva `n` del partido y `k`, el número de punto, para no contarlo dos veces).
    case 'point': {
      if (!screen || next.phase !== 'playing' || action.n !== next.n || (action.side !== 0 && action.side !== 1)) return null;
      if (action.k !== (next.score.k || 0)) return null;
      next.score = { ...addPoint(next.score, action.side), k: (next.score.k || 0) + 1 };
      const w = matchWinner(next.score);
      if (w >= 0) { next.winner = w; next.phase = 'final'; }
      break;
    }
    case 'toLobby': {
      if (!screen) return null;
      next.phase = 'lobby';
      break;
    }
    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}
