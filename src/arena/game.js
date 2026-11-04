// Arena Royale: el reducer de la sala. Lógica pura, como el de los demás juegos: corre dentro de la transacción de la
// sala (`backend.updateRoom`) y no lee el reloj ni el azar por su cuenta (los recibe en `ctx`).
//
// La partida en sí NO se calcula acá: la simula cada pantalla con `sim.js` a partir de `match.seed` y de la lista de
// jugadas `match.cmds`. La sala solo anota las jugadas (con el paso en que valen, según la hora del servidor) y quién ganó.
// Fases: `lobby` → (`drafting`, si el modo es de elegir cartas) → `playing` → `ended` (y de ahí otra vez `playing` o `lobby`).
import { DEFAULT_DECK, TICK_MS, validDeck } from './cards.js';
import { LEAD } from './sim.js';
import {
  MODES, MODE_INFO, allDone, decksFromPicks, draftMs, isDraft, modeOf, seatDone,
} from './draft.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'arena';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;       // 1 contra 1 o 2 contra 2
export const TEAM_SIZE = 2;
export const COUNTDOWN_MS = 4000;
export const MAX_CMDS = 600;        // cada jugada pesa ~18 caracteres: 600 son ~11.000 de los 30.000 de la sala
export const DEFAULT_OPTIONS = { minutes: 3, mode: 'classic' };
export const OPTION_VALUES = { minutes: [2, 3, 5], mode: MODES };

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
    draft: null,
    match: null,
    matchN: 0,
    winnerTeam: null,
    createdAt: now,
    updatedAt: now,
  };
}

// El paso de la simulación que corresponde a la hora `now` (de servidor).
export const tickAt = (match, now) => Math.floor((now - match.startsAt) / TICK_MS);

// Por qué no se puede empezar (o null). La elección doble reparte lo que descarta cada uno al rival: hacen falta equipos parejos.
export function startProblem(room) {
  const alive = room.players.filter((p) => !p.left);
  const a = alive.filter((p) => p.team === 0).length;
  const b = alive.filter((p) => p.team === 1).length;
  if (!a || !b) return 'Hace falta al menos uno en cada equipo.';
  if (modeOf(room) === 'double' && a !== b) return 'En la doble elección los equipos tienen que ser parejos.';
  return null;
}

// Arranca la partida con los mazos ya definidos (`decks[i]` es el de `seats[i]`).
function beginMatch(room, seats, decks, now, rand) {
  room.phase = 'playing';
  room.draft = null;
  room.winnerTeam = null;
  room.matchN += 1;
  room.match = {
    seed: Math.floor(rand() * 2147483647) + 1,
    startsAt: now + COUNTDOWN_MS,
    minutes: room.options.minutes,
    seats: seats.map((s, i) => ({ id: s.id, team: s.team, deck: [...decks[i]] })),
    cmds: [],
  };
}

// Cuando todos eligieron, se arman los mazos y empieza la partida.
function finishDraft(room, now, rand) {
  const { draft } = room;
  const decks = decksFromPicks(draft);
  const keep = draft.seats.map((s, i) => [s, i]).filter(([s]) => !room.players.find((p) => p.id === s.id)?.left);
  beginMatch(room, keep.map(([s]) => s), keep.map(([, i]) => decks[i]), now, rand);
}

// Los que se fueron en plena elección eligen siempre la primera opción, para no frenar a los demás (ni a su rival).
function autoPick(draft, seat) {
  const { rounds } = MODE_INFO[draft.mode];
  while (draft.picks[seat].length < rounds) draft.picks[seat].push(0);
}

function endMatch(room, winner) {
  room.draft = null;
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
    const target = kickTarget(room, action, ['lobby', 'drafting', 'playing', 'ended']);
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
      else if (next.phase === 'drafting') {
        autoPick(next.draft, next.draft.seats.findIndex((s) => s.id === me.id));
        if (allDone(next.draft)) finishDraft(next, now, rand);
      }
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
      if (startProblem(next)) return null;
      const seats = [...next.players].sort((a, b) => a.team - b.team);
      const mode = modeOf(next);
      if (!isDraft(mode)) {
        beginMatch(next, seats, seats.map((p) => p.deck), now, rand);
        return next;
      }
      // Elegir cartas: cada uno elige a su ritmo y, cuando terminan todos (o se acaba el tiempo), arranca.
      next.phase = 'drafting';
      next.winnerTeam = null;
      next.match = null;
      next.draft = {
        mode,
        seed: Math.floor(rand() * 2147483647) + 1,
        seats: seats.map((p) => ({ id: p.id, team: p.team })),
        picks: seats.map(() => []),
        deadline: now + draftMs(mode),
      };
      return next;
    }

    // Una elección: `index` es cuál de las cartas ofrecidas en la ronda que te toca.
    case 'draftPick': {
      const draft = next.draft;
      if (next.phase !== 'drafting' || !draft || !me || me.left) return null;
      const seat = draft.seats.findIndex((s) => s.id === me.id);
      if (seat < 0 || seatDone(draft, seat)) return null;
      const { size } = MODE_INFO[draft.mode];
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= size) return null;
      if (action.round !== undefined && action.round !== draft.picks[seat].length) return null; // una elección vieja que llega tarde
      draft.picks[seat].push(action.index);
      if (allDone(draft)) finishDraft(next, now, rand);
      return next;
    }

    // Cualquier pantalla avisa cuando se acaba el tiempo: los que faltan eligen la primera opción.
    case 'draftTimeout': {
      const draft = next.draft;
      if (next.phase !== 'drafting' || !draft || !me || now < draft.deadline) return null;
      draft.seats.forEach((_, i) => autoPick(draft, i));
      finishDraft(next, now, rand);
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
      next.draft = null;
      next.match = null;
      next.winnerTeam = null;
      return next;
    }

    default:
      return null;
  }
}
