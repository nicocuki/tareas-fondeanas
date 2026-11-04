// Arena Royale: el reducer de la sala. Lógica pura, como el de los demás juegos: corre dentro de la transacción de la
// sala (`backend.updateRoom`) y no lee el reloj ni el azar por su cuenta (los recibe en `ctx`).
//
// La partida en sí NO se calcula acá: la simula cada pantalla con `sim.js` a partir de `match.seed` y de la lista de
// jugadas `match.cmds`. La sala solo anota las jugadas (con el paso en que valen, según la hora del servidor) y quién ganó.
// Fases: `lobby` → `playing` → `ended` (y de ahí otra vez `playing` o `lobby`).
import { DEFAULT_DECK, TICK_MS, validDeck } from './cards.js';
import { LEAD } from './sim.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'arena';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;       // 1 contra 1 o 2 contra 2
export const TEAM_SIZE = 2;
export const COUNTDOWN_MS = 4000;
export const MAX_CMDS = 600;        // cada jugada pesa ~18 caracteres: 600 son ~11.000 de los 30.000 de la sala
export const DEFAULT_OPTIONS = { minutes: 3 };
export const OPTION_VALUES = { minutes: [2, 3, 5] };

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const teamName = (team) => (team === 0 ? 'Azul' : 'Rojo');

export function makeCode(rand = Math.random) {
  return Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
}

const teamCount = (room, team) => room.players.filter((p) => p.team === team && !p.left).length;

function newPlayer(id, name, avatar, team, deck) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', team, deck: validDeck(deck) ? [...deck] : [...DEFAULT_DECK], wins: 0, left: false };
}

export function newRoom(hostId, hostName, avatar, now = Date.now(), deck = null) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, 0, deck)],
    match: null,
    matchN: 0,
    winnerTeam: null,
    createdAt: now,
    updatedAt: now,
  };
}

// El paso de la simulación que corresponde a la hora `now` (de servidor).
export const tickAt = (match, now) => Math.floor((now - match.startsAt) / TICK_MS);

function endMatch(room, winner) {
  room.phase = 'ended';
  room.winnerTeam = winner;
  if (winner === 0 || winner === 1) for (const p of room.players) if (p.team === winner && !p.left) p.wins += 1;
}

function removePlayer(room, id) {
  room.players = room.players.filter((p) => p.id !== id);
  if (room.hostId === id && room.players.length) room.hostId = (room.players.find((p) => !p.left) || room.players[0]).id;
}

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
  const next = structuredClone(room);
  next.updatedAt = now;
  const me = findPlayer(next, action.playerId);
  const idle = next.phase === 'lobby' || next.phase === 'ended';

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        if (me.left && next.phase === 'lobby') me.left = false;
        return next;
      }
      if (!idle || next.players.length >= MAX_PLAYERS) return null;
      const name = cleanName(action.name);
      if (!name) return null;
      const team = teamCount(next, 0) <= teamCount(next, 1) ? 0 : 1;
      if (teamCount(next, team) >= TEAM_SIZE) return null;
      next.players.push(newPlayer(action.playerId, name, action.avatar, team, action.deck));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      if (idle) { removePlayer(next, me.id); return next; }
      me.left = true;
      if (next.hostId === me.id) next.hostId = (next.players.find((p) => !p.left) || me).id;
      // Si su equipo se quedó sin nadie, pierde.
      if (!teamCount(next, me.team)) endMatch(next, teamCount(next, 1 - me.team) ? 1 - me.team : -1);
      return next;
    }

    case 'setTeam': {
      if (!me || !idle || ![0, 1].includes(action.team)) return null;
      if (me.team === action.team) return next;
      if (teamCount(next, action.team) >= TEAM_SIZE) return null;
      me.team = action.team;
      return next;
    }

    case 'setDeck': {
      if (!me || !idle || !validDeck(action.deck)) return null;
      me.deck = [...action.deck];
      return next;
    }

    case 'setOptions': {
      if (!idle || next.hostId !== action.playerId || !action.options) return null;
      for (const [key, value] of Object.entries(action.options)) {
        if (!OPTION_VALUES[key]?.includes(value)) return null;
        next.options[key] = value;
      }
      return next;
    }

    case 'start': {
      if (!idle || next.hostId !== action.playerId) return null;
      next.players = next.players.filter((p) => !p.left);
      if (!teamCount(next, 0) || !teamCount(next, 1)) return null;
      next.phase = 'playing';
      next.winnerTeam = null;
      next.matchN += 1;
      next.match = {
        seed: Math.floor(rand() * 2147483647) + 1,
        startsAt: now + COUNTDOWN_MS,
        minutes: next.options.minutes,
        seats: [...next.players].sort((a, b) => a.team - b.team).map((p) => ({ id: p.id, team: p.team, deck: [...p.deck] })),
        cmds: [],
      };
      return next;
    }

    // Una jugada: la carta del lugar `slot` de la mano, en (x, y) de la arena. La sala solo la anota; la simulación
    // decide si valía (elixir, zona…). El paso en que vale sale de la hora del servidor más un margen (`LEAD`).
    case 'play': {
      const match = next.match;
      if (next.phase !== 'playing' || !match || !me || me.left || now < match.startsAt) return null;
      const seat = match.seats.findIndex((s) => s.id === me.id);
      const { slot, x, y } = action;
      if (seat < 0 || !Number.isInteger(slot) || slot < 0 || slot > 3 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (match.cmds.length >= MAX_CMDS) return null;
      match.cmds.push([Math.max(1, tickAt(match, now)) + LEAD, seat, slot, Math.round(x * 10), Math.round(y * 10)]);
      return next;
    }

    // Cualquier pantalla avisa cuando la simulación termina; vale la primera.
    case 'finish': {
      const match = next.match;
      if (next.phase !== 'playing' || !match || !me || now < match.startsAt || ![0, 1, -1].includes(action.winner)) return null;
      endMatch(next, action.winner);
      return next;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId || next.phase === 'lobby') return null;
      next.players = next.players.filter((p) => !p.left);
      next.phase = 'lobby';
      next.match = null;
      next.winnerTeam = null;
      return next;
    }

    default:
      return null;
  }
}
