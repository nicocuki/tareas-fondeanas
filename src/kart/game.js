// Fondo Kart: reducer de la sala. Corre en la transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null
// si la acción no vale. La carrera en sí (karts, ítems) va en vivo entre las pantallas (KartRace.jsx): acá queda lo de a
// una vez: quién corre y con qué personaje, la votación de la pista, quién llegó y en qué orden.
//
// Dos modos (`options.mode`):
//   - `online`: cada jugador entra desde su compu (su id es el de la compu) y elige si maneja con el teclado o con el
//     celular como volante (el celular no entra a la sala: se conecta directo a esa compu, ver KartPad.jsx).
//   - `local`: una sola compu (la del anfitrión) muestra la pantalla partida y cada uno maneja con su celular, que sí entra a
//     la sala como jugador (`screen` = la compu del anfitrión). El anfitrión puede sumarse con el teclado.
// Cada jugador lleva `screen`: la compu que lo simula y lo dibuja. Los bots los simula la compu del anfitrión.
//
// Fases: lobby → vote (cada uno vota una de las pistas o «?») → race → results → (otra votación o la sala de espera).
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { SKINS, freeSkin, isSkin } from '../wii/skins.js';
import { RANDOM_PICK, TRACKS } from './tracks.js';
import { CC_VALUES } from './sim.js';

export const GAME_TYPE = 'kart';
export const MAX_RACERS = 8;          // contando los bots
export const MAX_LOCAL = 4;           // en el local, cuántos se dibujan en la pantalla partida
export const MAX_PLAYERS = 8;
export const VOTE_MS = 15000;
export const INTRO_MS = 6500;         // de que se elige la pista a la largada (muestra la pista y la cuenta 3, 2, 1)
export const AFTER_FIRST_MS = 30000;  // cuando llega el primero, los demás tienen este tiempo
export const RACE_MAX_MS = 6 * 60000;
export const DEFAULT_OPTIONS = { mode: 'online', items: true, bots: true, cc: 100 };
export const OPTION_VALUES = { mode: ['online', 'local'], items: [true, false], bots: [true, false], cc: CC_VALUES };
const BOT_NAMES = ['Turbina', 'Chispa', 'Pistón', 'Bujía', 'Tuerca', 'Rulemán', 'Cardán', 'Escape'];

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const isBot = (id) => String(id).startsWith('bot-');

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE, phase: 'lobby', hostId, options: { ...DEFAULT_OPTIONS },
    players: [{ id: hostId, name: cleanName(hostName) || 'Anfitrión', avatar: avatar || '🏎️', skin: SKINS[0].id, screen: hostId, ctrl: 'keys' }],
    vote: null, race: null, results: null, n: 0, createdAt: now, updatedAt: now,
  };
}

// Quiénes corren en una carrera (todos los de la sala, y bots hasta 8 si están prendidos).
export function racersFor(room) {
  const humans = room.players.map((p) => ({ id: p.id, name: p.name, skin: p.skin, screen: p.screen }));
  const bots = [];
  if (room.options.bots) {
    const taken = humans.map((h) => h.skin);
    for (let i = 0; humans.length + bots.length < MAX_RACERS; i++) {
      const skin = freeSkin([...taken, ...bots.map((b) => b.skin)]);
      bots.push({ id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length], skin, screen: room.hostId, bot: true });
    }
  }
  return [...humans, ...bots];
}

export function startProblem(room) {
  if (!room.players.length) return room.options.mode === 'local' ? 'Conectá al menos un celular: escaneá el QR.' : 'No hay nadie para correr.';
  return null;
}

// La pista que sale de los votos: una al azar entre las votadas (como en el género); «?» es cualquiera.
export function pickTrack(votes, rand) {
  const list = Object.values(votes || {}).filter((v) => Number.isInteger(v) && v >= 0 && v <= RANDOM_PICK);
  const pick = list.length ? list[Math.floor(rand() * list.length) % list.length] : RANDOM_PICK;
  const track = pick === RANDOM_PICK ? Math.floor(rand() * TRACKS.length) % TRACKS.length : pick;
  return { pick, track };
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startRace(next, now, rand) {
  const { pick, track } = pickTrack(next.vote?.votes, rand);
  const racers = shuffle(racersFor(next), rand);
  next.race = { n: next.n, track, pick, startsAt: now + INTRO_MS, racers, finish: {}, firstAt: 0, cc: next.options.cc, items: next.options.items };
  next.phase = 'race';
  next.results = null;
}

function finishRace(next, order) {
  const race = next.race;
  const ids = race.racers.map((r) => r.id);
  const listed = (order || []).filter((id) => ids.includes(id));
  const done = ids.filter((id) => race.finish[id] != null).sort((a, b) => race.finish[a] - race.finish[b]);
  const rest = [...listed.filter((id) => !done.includes(id)), ...ids.filter((id) => !done.includes(id) && !listed.includes(id))];
  next.results = { n: race.n, track: race.track, order: [...done, ...rest].map((id) => ({ id, ms: race.finish[id] ?? null })) };
  next.phase = 'results';
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
  const rand = ctx.rand || Math.random;
  const next = JSON.parse(JSON.stringify(room));
  next.options = { ...DEFAULT_OPTIONS, ...next.options };
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;

  switch (action.type) {
    // En el online entra una compu; en el local, un celular (que maneja en la compu del anfitrión).
    case 'join': {
      if (me) { me.name = cleanName(action.name) || me.name; break; }
      if (!cleanName(action.name) || next.phase !== 'lobby' || next.players.length >= MAX_PLAYERS) return null;
      const local = next.options.mode === 'local';
      if (local && next.players.length >= MAX_LOCAL) return null;
      const skin = isSkin(action.skin) && !next.players.some((p) => p.skin === action.skin) ? action.skin : freeSkin(next.players.map((p) => p.skin));
      next.players.push({ id: action.playerId, name: cleanName(action.name), avatar: action.avatar || '🏎️', skin, screen: local ? next.hostId : action.playerId, ctrl: local ? 'phone' : 'keys' });
      break;
    }
    case 'leave': {
      if (!me && !host) return null;
      next.players = next.players.filter((p) => p.id !== action.playerId);
      if (host) {
        // El anfitrión se va: pasa a otra compu (en el local no hay otra: la sala queda sin anfitrión y se cierra sola).
        const other = next.players.find((p) => p.screen === p.id);
        if (other) { next.hostId = other.id; next.players = next.players.filter((p) => p.screen !== action.playerId || p.id === p.screen); }
      } else next.players = next.players.filter((p) => p.screen !== action.playerId || p.id === p.screen);
      break;
    }
    case 'setOptions': {
      if (!host || next.phase !== 'lobby') return null;
      for (const [k, v] of Object.entries(action.options || {})) {
        if (!OPTION_VALUES[k]?.includes(v)) return null;
        next.options[k] = v;
      }
      // Al cambiar de modo, se quedan solo los que sirven: en el local las otras compus salen; en el online, los celulares.
      if (next.options.mode === 'local') next.players = next.players.filter((p) => p.screen === next.hostId).slice(0, MAX_LOCAL);
      else {
        next.players = next.players.filter((p) => p.screen === p.id);
        if (!findPlayer(next, next.hostId)) next.players.unshift({ id: next.hostId, name: 'Anfitrión', avatar: '🏎️', skin: freeSkin(next.players.map((p) => p.skin)), screen: next.hostId, ctrl: 'keys' });
      }
      break;
    }
    case 'setSkin': {
      if (!me || !isSkin(action.skin) || next.players.some((p) => p.id !== me.id && p.skin === action.skin)) return null;
      me.skin = action.skin;
      break;
    }
    // Teclado o celular (solo el online; en el local los celulares son celulares).
    case 'setCtrl': {
      if (!me || !['keys', 'phone'].includes(action.ctrl) || (next.options.mode === 'local' && me.id !== next.hostId)) return null;
      me.ctrl = action.ctrl;
      break;
    }
    // El anfitrión, en el local, se suma o se baja con el teclado de su compu.
    case 'hostKeys': {
      if (!host || next.options.mode !== 'local' || next.phase !== 'lobby') return null;
      if (findPlayer(next, next.hostId)) next.players = next.players.filter((p) => p.id !== next.hostId);
      else {
        if (next.players.length >= MAX_LOCAL) return null;
        next.players.unshift({ id: next.hostId, name: cleanName(action.name) || 'Teclado', avatar: '⌨️', skin: freeSkin(next.players.map((p) => p.skin)), screen: next.hostId, ctrl: 'keys' });
      }
      break;
    }
    case 'start': {
      if (!host || (next.phase !== 'lobby' && next.phase !== 'results') || startProblem(next)) return null;
      next.n += 1;
      next.phase = 'vote';
      next.vote = { n: next.n, votes: {}, endsAt: now + VOTE_MS };
      next.race = null;
      break;
    }
    case 'vote': {
      if (next.phase !== 'vote' || !me || action.n !== next.vote.n || !Number.isInteger(action.pick) || action.pick < 0 || action.pick > RANDOM_PICK) return null;
      next.vote.votes[me.id] = action.pick;
      if (next.players.every((p) => next.vote.votes[p.id] != null)) startRace(next, now, rand);
      break;
    }
    // Cualquier pantalla: cierra la votación cuando se acabó el tiempo, o la carrera cuando pasó el tope.
    case 'tick': {
      if (next.phase === 'vote' && action.n === next.vote.n && now >= next.vote.endsAt) { startRace(next, now, rand); break; }
      if (next.phase === 'race' && action.n === next.race.n && now >= next.race.startsAt + RACE_MAX_MS) { finishRace(next, action.order); break; }
      return null;
    }
    // La compu dueña del kart avisa que llegó (`ms` desde la largada). Los bots los avisa la del anfitrión.
    case 'finish': {
      const race = next.race;
      if (next.phase !== 'race' || action.n !== race.n || !Number.isFinite(action.ms) || action.ms < 0) return null;
      const racer = race.racers.find((r) => r.id === action.id);
      if (!racer || race.finish[racer.id] != null) return null;
      if (racer.screen !== action.playerId && !(racer.bot && host) && !(host && !findPlayer(next, racer.screen))) return null;
      race.finish[racer.id] = Math.round(action.ms);
      if (!race.firstAt) race.firstAt = now;
      const humans = race.racers.filter((r) => !r.bot && findPlayer(next, r.id));
      if (humans.length && humans.every((r) => race.finish[r.id] != null) && !race.allAt) race.allAt = now;
      break;
    }
    // La compu del anfitrión cierra la carrera (llegaron todos o se acabó el tiempo) con el orden que ve de los que faltan.
    case 'end': {
      const race = next.race;
      if (!host || next.phase !== 'race' || action.n !== race.n) return null;
      const ok = (race.allAt && now >= race.allAt + 2500) || (race.firstAt && now >= race.firstAt + AFTER_FIRST_MS) || now >= race.startsAt + RACE_MAX_MS;
      if (!ok) return null;
      finishRace(next, action.order);
      break;
    }
    case 'toLobby': {
      if (!host) return null;
      next.phase = 'lobby'; next.vote = null; next.race = null;
      break;
    }
    default:
      return null;
  }
  next.updatedAt = now;
  return next;
}
