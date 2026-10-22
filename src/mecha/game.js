// La Mecha: reducer puro, como el de Código Secreto. Corre dentro de la transacción de la sala
// (`backend.updateRoom`), así que no lee el reloj ni el azar por su cuenta: recibe `now`, `rand`
// y el diccionario en `ctx`. Devuelve la sala nueva o `null` si la acción no corresponde.
import SYLLABLES from './syllables.js';
import { BONUS_LETTERS, matchesSyllable, normalizeWord } from './words.js';
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const GAME_TYPE = 'la-mecha';
export const MAX_PLAYERS = 16;
export const MIN_PLAYERS = 2;
export const MAX_USED = 800;     // palabras ya usadas que se recuerdan (tope del tamaño de la sala)
export const MAX_LOG = 14;
export const MIN_TURN_MS = 4000; // cuando la bomba te llega, tenés al menos esto antes de que explote
export const MAX_LIVES = 5;

export const FUSES = {
  corta: [6000, 14000],
  normal: [10000, 25000],
  larga: [15000, 40000],
};

export const DEFAULT_OPTIONS = { mode: 'anywhere', difficulty: 'normal', lives: 2, fuse: 'normal' };
export const OPTION_VALUES = {
  mode: ['anywhere', 'start'],
  difficulty: ['facil', 'normal', 'dificil'],
  lives: [1, 2, 3, 4],
  fuse: ['corta', 'normal', 'larga'],
};

// De qué parte de cada lista de sílabas (ordenadas de más a menos común) se saca, según la dificultad.
const POOLS = {
  anywhere: {
    facil: [[2, 0, 120]],
    normal: [[2, 0, 220], [3, 0, 400]],
    dificil: [[3, 300, 1200], [4, 0, 600]],
  },
  start: {
    facil: [[2, 0, 60]],
    normal: [[2, 0, 140], [3, 0, 200]],
    dificil: [[3, 120, 500], [4, 0, 300]],
  },
};

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);

export function makeCode(rand = Math.random) {
  return Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
}

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar)],
    round: 0,
    turn: 0,
    current: null,
    syllable: '',
    fuse: null,
    used: [],
    log: [],
    winner: null,
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', lives: 0, letters: '', alive: false, out: false, last: '', wins: 0 };
}

export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const alivePlayers = (room) => room.players.filter((p) => p.alive);

export function pickSyllable(options, rand, avoid = '') {
  const pools = POOLS[options.mode]?.[options.difficulty] || POOLS.anywhere.normal;
  for (let attempt = 0; attempt < 8; attempt++) {
    const [len, from, to] = pools[Math.floor(rand() * pools.length)];
    const list = SYLLABLES[options.mode]?.[len] || [];
    const slice = list.slice(from, Math.min(to, list.length));
    if (!slice.length) continue;
    const s = slice[Math.floor(rand() * slice.length)];
    if (s !== avoid) return s;
  }
  return 'ar';
}

function lightFuse(options, now, rand) {
  const [min, max] = FUSES[options.fuse] || FUSES.normal;
  return { litAt: now, deadline: now + Math.round(min + rand() * (max - min)) };
}

// El siguiente jugador vivo después de `fromId` (en el orden de la ronda).
function nextAlive(room, fromId) {
  const n = room.players.length;
  const start = room.players.findIndex((p) => p.id === fromId);
  for (let k = 1; k <= n; k++) {
    const p = room.players[(start + k + n) % n];
    if (p.alive) return p.id;
  }
  return null;
}

function addLog(room, entry) {
  room.log = [...room.log, entry].slice(-MAX_LOG);
}

function finishIfOver(room, now) {
  const alive = alivePlayers(room);
  if (alive.length > 1) return false;
  room.phase = 'ended';
  room.winner = alive[0]?.id || null;
  room.current = null;
  room.fuse = null;
  room.endedAt = now;
  const w = findPlayer(room, room.winner);
  if (w) w.wins = (w.wins || 0) + 1;
  return true;
}

// Por qué una palabra no sirve (o null si sirve). La usan la interfaz, para avisar antes, y el reducer.
export function wordProblem(room, rawWord, dict) {
  const word = normalizeWord(rawWord);
  if (!word) return 'Escribí una palabra.';
  if (!/^[a-zñ]+$/.test(word)) return 'Solo letras, sin espacios.';
  if (!matchesSyllable(word, room.syllable, room.options.mode)) {
    return room.options.mode === 'start' ? `Tiene que empezar con «${room.syllable.toUpperCase()}».` : `Tiene que tener «${room.syllable.toUpperCase()}».`;
  }
  if (word === room.syllable) return 'Tiene que ser una palabra más larga.';
  if (room.used.includes(word)) return 'Esa palabra ya se usó.';
  if (!dict || !dict.has(word)) return 'Esa palabra no está en el diccionario.';
  return null;
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
      if (next.players.length >= MAX_PLAYERS) return null;
      const name = cleanName(action.name);
      if (!name) return null;
      next.players.push(newPlayer(action.playerId, name, action.avatar));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      const wasCurrent = next.current === me.id;
      const after = wasCurrent ? nextAlive(next, me.id) : null;
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) return next;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      if (next.phase === 'playing') {
        if (finishIfOver(next, now)) return next;
        if (wasCurrent) {
          next.current = after && after !== me.id ? after : alivePlayers(next)[0].id;
          next.syllable = pickSyllable(next.options, rand, next.syllable);
          next.turn += 1;
          next.fuse.deadline = Math.max(next.fuse.deadline, now + MIN_TURN_MS);
        }
      }
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
      if (next.hostId !== action.playerId || next.phase === 'playing') return null;
      if (next.players.length < MIN_PLAYERS) return null;
      for (const p of next.players) {
        p.lives = next.options.lives;
        p.letters = '';
        p.alive = true;
        p.out = false;
        p.last = '';
      }
      next.phase = 'playing';
      next.round += 1;
      next.turn += 1;
      next.used = [];
      next.log = [];
      next.winner = null;
      next.current = next.players[Math.floor(rand() * next.players.length)].id;
      next.syllable = pickSyllable(next.options, rand);
      next.fuse = lightFuse(next.options, now, rand);
      next.fuse.deadline = Math.max(next.fuse.deadline, now + MIN_TURN_MS + 2000); // margen para la cuenta inicial
      next.startedAt = now;
      return next;
    }

    case 'submit': {
      if (next.phase !== 'playing' || next.current !== action.playerId || action.turn !== next.turn) return null;
      if (now >= next.fuse.deadline) return null; // ya explotó: llegó tarde
      if (wordProblem(next, action.word, ctx.dict)) return null;
      const word = normalizeWord(action.word);
      next.used = [...next.used, word].slice(-MAX_USED);
      me.last = word;
      // Vida extra al completar el abecedario.
      const letters = new Set(me.letters);
      for (const ch of word) if (BONUS_LETTERS.includes(ch)) letters.add(ch);
      let bonus = false;
      if (BONUS_LETTERS.every((ch) => letters.has(ch))) {
        bonus = me.lives < MAX_LIVES;
        me.lives = Math.min(MAX_LIVES, me.lives + 1);
        me.letters = '';
      } else {
        me.letters = BONUS_LETTERS.filter((ch) => letters.has(ch)).join('');
      }
      addLog(next, { t: bonus ? 'bonus' : 'ok', id: me.id, w: word, s: next.syllable });
      next.current = nextAlive(next, me.id) || me.id;
      next.syllable = pickSyllable(next.options, rand, next.syllable);
      next.turn += 1;
      next.fuse.deadline = Math.max(next.fuse.deadline, now + MIN_TURN_MS);
      return next;
    }

    case 'explode': {
      if (next.phase !== 'playing' || action.turn !== next.turn || now < next.fuse.deadline) return null;
      const victim = findPlayer(next, next.current);
      if (victim) {
        victim.lives -= 1;
        if (victim.lives <= 0) { victim.lives = 0; victim.alive = false; victim.out = true; }
        addLog(next, { t: 'boom', id: victim.id, s: next.syllable });
      }
      next.lastBoom = { id: victim?.id || null, at: now };
      if (finishIfOver(next, now)) { next.turn += 1; return next; }
      next.current = nextAlive(next, next.current) || alivePlayers(next)[0].id;
      next.syllable = pickSyllable(next.options, rand, next.syllable);
      next.turn += 1;
      next.fuse = lightFuse(next.options, now, rand);
      return next;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId) return null;
      next.phase = 'lobby';
      next.current = null;
      next.fuse = null;
      next.turn += 1;
      for (const p of next.players) { p.alive = false; p.out = false; p.lives = 0; }
      return next;
    }

    default:
      return null;
  }
}
