// A los Tiros: reducer de la sala (mismo patrón que los otros juegos). Corre dentro de la transacción
// de `rooms/{código}` con `ctx = { now, rand }`. Acá vive todo lo que es por turnos: quién está, qué
// cartas eligió cada uno, quién ganó cada pelea y cada ronda. Lo que pasa en tiempo real durante la
// pelea (movimiento, balas, vida) va por otro lado (ver `TirosGame.jsx`): cada pantalla avisa acá
// solo cuando su jugador muere.
//
// Como en el original: una pelea termina cuando queda uno solo vivo; el que gana `options.battles`
// peleas gana la ronda (un punto); los que no ganaron la ronda eligen una carta; gana la partida el
// primero que llega a `options.rounds` puntos. Al principio eligen todos.
//
// Las cartas se eligen de a uno, como en el original: `picking` = { order, at, hand, chosen, chosenAt }.
// Le toca a `order[at]`, que ve las cinco de `hand`; al elegir, `chosen` queda un momento a la vista
// de todos (`REVEAL_MS`) y el `tick` pasa al siguiente. Hacia qué carta apunta el que elige no pasa por
// acá: va en vivo por `tiros/{sala}/elige` (ver TirosApp.jsx).
import { MAPS } from './maps.js';
import { dealCards, CARDS } from './cards.js';

export const GAME_TYPE = 'tiros';
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 3000;   // cuenta regresiva antes de cada pelea
export const BATTLE_END_MS = 2500;  // cuánto se muestra quién ganó la pelea
export const PICK_MS = 20000;       // tiempo de cada uno para elegir carta
export const REVEAL_MS = 1800;      // la carta elegida se ve 1 s y después se va con el jugador
export const MAX_BATTLE_MS = 120000; // si una pelea se estira tanto, se repite
export const COLORS = ['#f28c28', '#3d8fe0', '#3fb36b', '#a463d9'];

// `cardLimit`: modo «Fila de cartas». 0 = apagado; si no, cada uno tiene como mucho esa cantidad de
// cartas y, al elegir una más, se le va la más vieja (como una fila).
export const DEFAULT_OPTIONS = { rounds: 5, battles: 2, cardLimit: 0 };
export const OPTION_VALUES = { rounds: [3, 5, 7], battles: [1, 2, 3] };
export const MAX_CARD_LIMIT = 30;
const validOption = (key, value) => (key === 'cardLimit'
  ? Number.isInteger(value) && value >= 0 && value <= MAX_CARD_LIMIT
  : OPTION_VALUES[key]?.includes(value));

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
    picking: null,
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
  room.picking = { order: pickers.map((p) => p.id), at: -1, hand: [], chosen: null, chosenAt: 0 };
  nextPicker(room, now, rand);
}

// Le pasa el turno al siguiente que tenga que elegir, o arranca la pelea si ya eligieron todos.
function nextPicker(room, now, rand) {
  const pick = room.picking;
  pick.at += 1;
  while (pick.at < pick.order.length && !findPlayer(room, pick.order[pick.at])?.inGame) pick.at += 1;
  if (pick.at >= pick.order.length) { startBattle(room, now, rand); return; }
  pick.hand = dealCards(rand);
  pick.chosen = null;
  pick.chosenAt = 0;
  room.phaseEndsAt = now + PICK_MS;
}

export const currentPicker = (room) => (room?.phase === 'picking' && room.picking?.order ? room.picking.order[room.picking.at] : null);

function startBattle(room, now, rand) {
  const previous = room.battle?.map ?? -1;
  let map = Math.floor(rand() * MAPS.length);
  if (map === previous) map = (map + 1) % MAPS.length;
  const order = shuffle(inGame(room).map((p) => p.id), rand);
  room.phase = 'fight';
  room.picking = null;
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

function choose(room, card, now) {
  const pick = room.picking;
  const player = findPlayer(room, pick.order[pick.at]);
  if (player) {
    player.cards.push(card);
    // Fila de cartas: si se pasa del tope, se va la que eligió primero.
    const limit = room.options.cardLimit || 0;
    if (limit > 0) player.cards.splice(0, Math.max(0, player.cards.length - limit));
  }
  pick.chosen = card;
  pick.chosenAt = now;
  room.phaseEndsAt = now + REVEAL_MS;
}

function backToLobby(room) {
  room.phase = 'lobby';
  room.phaseEndsAt = 0;
  room.picking = null;
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
      const wasPicking = currentPicker(room) === me.id && !room.picking.chosen;
      if (next.phase !== 'lobby' && next.phase !== 'final' && inGame(next).length < MIN_PLAYERS) { backToLobby(next); return next; }
      if (next.phase === 'fight') checkBattleEnd(next, now);
      if (wasPicking) nextPicker(next, now, rand);
      return next;
    }

    case 'setOptions': {
      if (next.phase !== 'lobby' || next.hostId !== action.playerId) return null;
      for (const [key, value] of Object.entries(action.options || {})) {
        if (validOption(key, value)) next.options[key] = value;
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
      // Solo el que tiene el turno, una vez, una de sus cinco cartas.
      if (currentPicker(next) !== me?.id || action.turn !== next.picking.at || next.picking.chosen) return null;
      if (!CARDS[action.card] || !next.picking.hand.includes(action.card)) return null;
      choose(next, action.card, now);
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
        // Salas de antes de elegir por turnos: se va directo a la pelea.
        if (!Array.isArray(next.picking?.order)) { startBattle(next, now, rand); return next; }
        // Se le acabó el tiempo sin elegir: le toca una al azar. Si ya eligió, pasa el siguiente.
        if (!next.picking.chosen) choose(next, next.picking.hand[Math.floor(rand() * next.picking.hand.length)], now);
        else nextPicker(next, now, rand);
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
