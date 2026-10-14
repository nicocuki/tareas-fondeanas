// A los Tiros: reducer de la sala (mismo patrón que los otros juegos). Corre dentro de la transacción
// de `rooms/{código}` con `ctx = { now, rand }`. Acá vive todo lo que es por turnos: quién está, qué
// cartas eligió cada uno, quién ganó cada pelea y cada ronda. Lo que pasa en tiempo real durante la
// pelea (movimiento, balas, vida) va por otro lado (ver `TirosGame.jsx`): cada pantalla avisa acá
// solo cuando su jugador muere.
//
// Como en el original: una pelea termina cuando queda uno solo vivo; el que gana `options.battles`
// peleas gana la ronda (un punto); los que no ganaron la ronda eligen una carta; gana la partida el
// primero que llega a `options.rounds` puntos. Al principio eligen todos.
import { MAPS } from './maps.js';
import { dealCards, CARDS } from './cards.js';

export const GAME_TYPE = 'tiros';
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 3000;   // cuenta regresiva antes de cada pelea
export const BATTLE_END_MS = 2500;  // cuánto se muestra quién ganó la pelea
export const PICK_MS = 30000;       // tiempo para elegir carta
export const MAX_BATTLE_MS = 120000; // si una pelea se estira tanto, se repite
export const COLORS = ['#f28c28', '#3d8fe0', '#3fb36b', '#a463d9'];

export const DEFAULT_OPTIONS = { rounds: 5, battles: 2 };
export const OPTION_VALUES = { rounds: [3, 5, 7], battles: [1, 2, 3] };

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);
export const alivePlayers = (room) => inGame(room).filter((p) => !room.battle?.dead?.[p.id]);

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, COLORS[0])],
    battle: null,
    picking: {},
    phaseEndsAt: 0,
    roundWinner: null,
    champion: null,
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, cards: [], points: 0, wins: 0, inGame: false };
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

function startPicking(room, pickers, now, rand) {
  room.phase = 'picking';
  room.phaseEndsAt = now + PICK_MS;
  room.picking = Object.fromEntries(pickers.map((p) => [p.id, dealCards(rand)]));
}

function startBattle(room, now, rand) {
  const previous = room.battle?.map ?? -1;
  let map = Math.floor(rand() * MAPS.length);
  if (map === previous) map = (map + 1) % MAPS.length;
  const order = shuffle(inGame(room).map((p) => p.id), rand);
  room.phase = 'fight';
  room.picking = {};
  room.battle = {
    n: (room.battle?.n || 0) + 1,
    map,
    startsAt: now + COUNTDOWN_MS,
    spawns: Object.fromEntries(order.map((id, i) => [id, i])),
    dead: {},
    winner: null,
  };
  room.phaseEndsAt = room.battle.startsAt + MAX_BATTLE_MS;
}

// Si queda uno solo vivo (o ninguno), se termina la pelea.
function checkBattleEnd(room, now) {
  if (room.phase !== 'fight') return;
  const alive = alivePlayers(room);
  if (alive.length > 1) return;
  const winner = alive[0] || null;
  room.battle.winner = winner?.id || null;
  if (winner) winner.wins += 1;
  room.phase = 'battleEnd';
  room.phaseEndsAt = now + BATTLE_END_MS;
}

function afterBattle(room, now, rand) {
  const winner = findPlayer(room, room.battle?.winner);
  if (!winner || winner.wins < room.options.battles) { startBattle(room, now, rand); return; }
  winner.points += 1;
  room.players.forEach((p) => { p.wins = 0; });
  room.roundWinner = winner.id;
  if (winner.points >= room.options.rounds) {
    room.phase = 'final';
    room.champion = winner.id;
    room.phaseEndsAt = 0;
    return;
  }
  startPicking(room, inGame(room).filter((p) => p.id !== winner.id), now, rand);
}

function pickFor(room, id, card) {
  const hand = room.picking[id];
  const p = findPlayer(room, id);
  if (!hand || !p || !hand.includes(card)) return false;
  p.cards.push(card);
  delete room.picking[id];
  return true;
}

function backToLobby(room) {
  room.phase = 'lobby';
  room.phaseEndsAt = 0;
  room.picking = {};
  room.battle = null;
  room.players.forEach((p) => { p.inGame = false; });
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = structuredClone(room);
  next.updatedAt = now;
  const me = findPlayer(next, action.playerId);

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        return next;
      }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next)));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) return next;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      delete next.picking[me.id];
      if (next.phase !== 'lobby' && next.phase !== 'final' && inGame(next).length < MIN_PLAYERS) { backToLobby(next); return next; }
      if (next.phase === 'fight') checkBattleEnd(next, now);
      if (next.phase === 'picking' && !Object.keys(next.picking).length) startBattle(next, now, rand);
      return next;
    }

    case 'setOptions': {
      if (next.phase !== 'lobby' || next.hostId !== action.playerId) return null;
      for (const [key, value] of Object.entries(action.options || {})) {
        if (OPTION_VALUES[key]?.includes(value)) next.options[key] = value;
      }
      return next;
    }

    case 'start': {
      if (next.hostId !== action.playerId || (next.phase !== 'lobby' && next.phase !== 'final')) return null;
      if (next.players.length < MIN_PLAYERS) return null;
      next.players.forEach((p) => { p.inGame = true; p.cards = []; p.points = 0; p.wins = 0; });
      next.champion = null;
      next.roundWinner = null;
      next.battle = null;
      startPicking(next, next.players, now, rand);
      return next;
    }

    case 'pick': {
      if (next.phase !== 'picking' || !me || !CARDS[action.card]) return null;
      if (!pickFor(next, me.id, action.card)) return null;
      if (!Object.keys(next.picking).length) startBattle(next, now, rand);
      return next;
    }

    case 'died': {
      // Lo manda cada pantalla por su propio jugador; el anfitrión también puede avisar por alguien
      // que dejó de mandar señales (se cerró la pestaña sin salir).
      const target = action.target && next.hostId === action.playerId ? findPlayer(next, action.target) : me;
      if (next.phase !== 'fight' || !target?.inGame || action.battle !== next.battle?.n || next.battle.dead[target.id]) return null;
      if (now < next.battle.startsAt) return null;
      next.battle.dead[target.id] = action.by && findPlayer(next, action.by) ? action.by : true;
      checkBattleEnd(next, now);
      return next;
    }

    case 'tick': {
      // Cualquier pantalla lo manda cuando ve el reloj en cero; la transacción deja pasar uno.
      if (action.phase !== next.phase || now < next.phaseEndsAt) return null;
      if (next.phase === 'picking') {
        for (const [id, hand] of Object.entries(next.picking)) pickFor(next, id, hand[0]);
        startBattle(next, now, rand);
        return next;
      }
      if (next.phase === 'battleEnd') {
        if (action.battle !== next.battle?.n) return null;
        afterBattle(next, now, rand);
        return next;
      }
      if (next.phase === 'fight') {
        if (action.battle !== next.battle?.n) return null;
        startBattle(next, now, rand); // empate por tiempo: se repite la pelea
        return next;
      }
      return null;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId) return null;
      backToLobby(next);
      return next;
    }

    default:
      return null;
  }
}

export const ranking = (room) => [...room.players].sort((a, b) => b.points - a.points || b.wins - a.wins);
