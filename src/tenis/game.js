// Tenis Movido: reducer de la sala. Corre en la transacción de `rooms/{código}` con `ctx = { now }` y devuelve null si la acción no vale.
//
// Dos modos (`options.mode`):
//   - `local`: una sola compu (el anfitrión) muestra la pantalla partida en dos y todos los celulares se conectan a ella.
//   - `online`: cada equipo tiene su compu (`room.screens`, la del anfitrión es la del equipo 0) y sus celulares.
// Y dos formatos (`options.format`): `1v1` (lugares 0 y 1) o `2v2` (lugares 0 a 3: 0 y 1 al fondo, 2 y 3 en la red;
// el equipo es `lugar % 2`). Los lugares sin celular los juega la máquina.
//
// Lo de a una vez va acá (quién juega dónde, el tanteo); los golpes van en vivo del celular a la compu del anfitrión,
// que es la única que simula la pelota y la manda a la otra compu (TenisScreen.jsx).
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { freeSkin, isSkin } from '../wii/skins.js';

export const GAME_TYPE = 'tenis';
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 1;   // con uno solo, del otro lado juega la máquina
export const GAMES_TO_WIN = 3;
export const COLORS = ['#ff5a5f', '#4aa0ff', '#ff9a3c', '#3fe0d0']; // por lugar: el equipo 0 rojo y naranja, el 1 azul y turquesa
export const TEAM_COLORS = ['#ff5a5f', '#4aa0ff'];
export const DEFAULT_OPTIONS = { mode: 'local', format: '1v1' };
export const OPTION_VALUES = { mode: ['local', 'online'], format: ['1v1', '2v2'] };

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const playerAt = (room, slot) => room?.players.find((p) => p.slot === slot) || null;
export const slotCount = (room) => (room.options?.format === '2v2' ? 4 : 2);
export const teamOf = (slot) => slot % 2;
export const findScreen = (room, id) => room?.screens?.find((s) => s.id === id) || null;
export const screenOfTeam = (room, team) => room?.screens?.find((s) => s.team === team) || null;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE, phase: 'lobby', hostId, options: { ...DEFAULT_OPTIONS },
    screens: [{ id: hostId, name: cleanName(hostName) || 'Cancha', team: 0 }], players: [], score: newScore(), n: 0, winner: null, createdAt: now, updatedAt: now,
  };
}

// ─── El tanteo ───────────────────────────────────────────────────────────────
// Puntos 0, 15, 30, 40 y juego (con iguales y ventaja); gana el partido el primer equipo a GAMES_TO_WIN juegos.
export const newScore = () => ({ p: [0, 0], g: [0, 0], server: 0 });
export function addPoint(score, side) {
  const s = { p: [...score.p], g: [...score.g], server: score.server };
  const o = 1 - side;
  s.p[side] += 1;
  if (s.p[side] >= 4 && s.p[side] - s.p[o] >= 2) {
    s.g[side] += 1;
    s.p = [0, 0];
    s.server = 1 - s.server; // saca el otro equipo en el juego siguiente
  }
  return s;
}
const CALLS = ['0', '15', '30', '40'];
export function pointText(score) {
  const [a, b] = score.p;
  if (a >= 3 && b >= 3) return a === b ? 'Iguales' : 'Ventaja';
  return `${CALLS[Math.min(a, 3)]} – ${CALLS[Math.min(b, 3)]}`;
}
export const matchWinner = (score) => (score.g[0] >= GAMES_TO_WIN ? 0 : score.g[1] >= GAMES_TO_WIN ? 1 : -1);

export function startProblem(room) {
  if (!room.players.length) return 'Conectá al menos un celular: escaneá el QR.';
  if (room.options.mode === 'online' && (room.screens || []).length < 2) return 'Falta la compu del otro equipo: que entre con el código de la cancha.';
  return null;
}

// El lugar libre para un celular nuevo: si dice de qué equipo es, uno de ese equipo; si no, el primero libre.
export function freeSlot(room, team) {
  const n = slotCount(room);
  const free = [];
  for (let s = 0; s < n; s++) if (!playerAt(room, s)) free.push(s);
  if (team === 0 || team === 1) return free.find((s) => teamOf(s) === team) ?? null;
  return free[0] ?? null;
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
  next.options ||= { ...DEFAULT_OPTIONS };
  next.screens ||= [{ id: next.hostId, name: 'Cancha', team: 0 }];
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const screen = findScreen(next, action.playerId);

  switch (action.type) {
    // Un celular se conecta como control. Toma el lugar libre de su equipo (en el online, el de la compu cuyo QR escaneó).
    case 'join': {
      if (screen) return null;
      if (me) { me.name = cleanName(action.name) || me.name; break; }
      if (!cleanName(action.name)) return null;
      const slot = freeSlot(next, action.team);
      if (slot == null) return null;
      next.players.push({ id: action.playerId, name: cleanName(action.name), avatar: action.avatar || '🎾', slot, skin: isSkin(action.skin) ? action.skin : freeSkin(next.players.map((p) => p.skin)) });
      break;
    }
    // La compu del otro equipo, en el online.
    case 'screenJoin': {
      if (screen) { screen.name = cleanName(action.name) || screen.name; break; }
      if (next.options.mode !== 'online' || next.screens.length >= 2 || next.phase === 'playing') return null;
      next.screens.push({ id: action.playerId, name: cleanName(action.name) || 'Cancha 2', team: 1 });
      break;
    }
    case 'leave': {
      if (me) next.players = next.players.filter((p) => p.id !== me.id);
      else if (screen && !host) {
        next.screens = next.screens.filter((s) => s.id !== screen.id);
        if (next.phase === 'playing') next.phase = 'lobby'; // sin la otra compu no se puede seguir
      } else return null;
      break;
    }
    // El personaje (src/wii/skins.js), lo elige cada uno desde su celular.
    case 'setSkin': {
      if (!me || !isSkin(action.skin)) return null;
      me.skin = action.skin;
      break;
    }
    case 'setOptions': {
      if (!host || next.phase === 'playing') return null;
      for (const [k, v] of Object.entries(action.options || {})) {
        if (!OPTION_VALUES[k]?.includes(v)) return null;
        next.options[k] = v;
      }
      if (next.options.mode === 'local') next.screens = next.screens.filter((s) => s.id === next.hostId);
      // Al pasar a 1v1, los de la red se mueven a un lugar libre o se desconectan.
      const n = slotCount(next);
      for (const p of next.players.filter((x) => x.slot >= n)) {
        const s = freeSlot({ ...next, players: next.players.filter((x) => x.slot < n) }, teamOf(p.slot));
        if (s != null) p.slot = s; else next.players = next.players.filter((x) => x.id !== p.id);
      }
      break;
    }
    case 'start': {
      if (!host || next.phase === 'playing' || startProblem(next)) return null;
      next.phase = 'playing';
      next.score = newScore();
      next.winner = null;
      next.n += 1;
      break;
    }
    // Lo anota la compu del anfitrión cuando la pelota define un punto (lleva `n` del partido y `k`, el número de punto, para no contarlo dos veces).
    case 'point': {
      if (!host || next.phase !== 'playing' || action.n !== next.n || (action.side !== 0 && action.side !== 1)) return null;
      if (action.k !== (next.score.k || 0)) return null;
      next.score = { ...addPoint(next.score, action.side), k: (next.score.k || 0) + 1 };
      const w = matchWinner(next.score);
      if (w >= 0) { next.winner = w; next.phase = 'final'; }
      break;
    }
    case 'toLobby': {
      if (!host) return null;
      next.phase = 'lobby';
      break;
    }
    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}
