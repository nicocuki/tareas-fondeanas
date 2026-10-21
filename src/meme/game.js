// Armá el Meme: reducer puro (mismo patrón que Código Secreto y La Mecha). Corre dentro de la
// transacción de la sala con `ctx = { now, rand }`. Las plantillas las elige la pantalla que manda
// la acción (del catálogo de `catalog.js`) y viajan en la acción como `pool` o `template`.

export const GAME_TYPE = 'meme';
export const MAX_PLAYERS = 12;
export const MIN_PLAYERS = 2;
export const MAX_TEXT = 80;
export const MAX_BOXES = 5;
export const VOTE_MS = 12000;     // cuánto se muestra cada meme para votar
export const RESULTS_MS = 9000;   // resultados de la ronda antes de la siguiente
export const STARS = [1, 2, 3, 4, 5];

// `rerolls`: cuántas veces puede cambiar cada uno su plantilla por ronda (−1 = sin límite).
export const UNLIMITED = -1;
export const DEFAULT_OPTIONS = { mode: 'normal', rounds: 3, seconds: 90, rerolls: 1 };
export const OPTION_VALUES = { mode: ['normal', 'same'], rounds: [1, 2, 3, 4, 5], seconds: [45, 60, 90, 120], rerolls: [0, 1, 2, 3, 5, 10, UNLIMITED] };

export const cleanName = (name) => String(name || '').trim().slice(0, 20);

// Cuántos cambios de plantilla le quedan a alguien en esta ronda (Infinity sin límite). Las salas de
// antes de esta opción no la tienen (una por persona) y guardaban `true` en vez de la cuenta.
export function rerollsLeft(room, id) {
  if (!room || room.options.mode === 'same') return 0;
  const limit = room.options.rerolls ?? 1;
  const used = Number(room.rerolled?.[id] === true ? 1 : room.rerolled?.[id] || 0);
  return limit === UNLIMITED ? Infinity : Math.max(0, limit - used);
}
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar)],
    round: 0,
    phaseEndsAt: 0,
    templates: {},
    rerolled: {},
    memes: {},
    order: [],
    voteIndex: 0,
    votes: {},
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', score: 0, inGame: false };
}

// Una plantilla que llega en una acción: solo lo que hace falta, y con forma válida.
export function cleanTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  if (typeof t.url !== 'string' || !/^https:\/\/i\.imgflip\.com\/[\w./-]+$/.test(t.url)) return null;
  const w = Number(t.w), h = Number(t.h), boxes = Number(t.boxes);
  if (!(w > 0 && h > 0 && boxes >= 1)) return null;
  return { id: String(t.id).slice(0, 20), name: String(t.name || '').slice(0, 60), url: t.url, w: Math.round(w), h: Math.round(h), boxes: Math.min(MAX_BOXES, Math.round(boxes)) };
}

const clamp = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback);

export function cleanTexts(texts, boxes) {
  const list = Array.isArray(texts) ? texts.slice(0, boxes) : [];
  return Array.from({ length: boxes }, (_, i) => {
    const t = list[i] || {};
    const clean = {
      t: String(t.t || '').replace(/\s+/g, ' ').slice(0, MAX_TEXT),
      x: Math.round(clamp(t.x, 0, 100, 50)),
      y: Math.round(clamp(t.y, 0, 100, 50)),
      w: Math.round(clamp(t.w, 10, 100, 92)),
      s: Math.round(clamp(t.s, 3, 16, 8) * 10) / 10,
    };
    if (t.k) clean.k = 1; // letra negra
    return clean;
  });
}

export const hasText = (texts) => Array.isArray(texts) && texts.some((t) => t.t.trim());

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function beginRound(room, pool, now, rand) {
  const clean = (pool || []).map(cleanTemplate).filter(Boolean);
  if (!clean.length) return false;
  room.round += 1;
  room.phase = 'making';
  room.phaseEndsAt = now + room.options.seconds * 1000;
  room.memes = {};
  room.votes = {};
  room.rerolled = {};
  room.order = [];
  room.voteIndex = 0;
  room.templates = {};
  const shuffled = shuffle(clean, rand);
  const same = shuffled[0];
  room.players.forEach((p, i) => {
    p.inGame = true;
    room.templates[p.id] = room.options.mode === 'same' ? same : shuffled[i % shuffled.length];
  });
  return true;
}

function startVoting(room, now, rand) {
  room.order = shuffle(Object.keys(room.memes).filter((id) => hasText(room.memes[id]) && room.templates[id]), rand);
  room.voteIndex = 0;
  room.votes = {};
  if (!room.order.length) { showResults(room, now); return; }
  room.phase = 'voting';
  room.phaseEndsAt = now + VOTE_MS;
}

export function pointsFor(room, author) {
  return Object.values(room.votes[author] || {}).reduce((sum, s) => sum + s, 0);
}

function showResults(room, now) {
  let best = null;
  for (const author of room.order) {
    const points = pointsFor(room, author);
    const p = findPlayer(room, author);
    if (p) p.score += points;
    if (!best || points > best.points) best = { author, points };
  }
  if (best) {
    room.history = [...room.history, {
      round: room.round, author: best.author, points: best.points,
      template: room.templates[best.author], texts: room.memes[best.author],
    }].slice(-5);
  }
  room.phase = 'results';
  room.phaseEndsAt = now + RESULTS_MS;
}

// Quiénes pueden votar el meme actual: los que juegan esta partida, menos su autor. El que entró
// con la partida empezada solo mira.
export function votersFor(room, author) {
  return room.players.filter((p) => p.inGame && p.id !== author).map((p) => p.id);
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = structuredClone(room);
  next.updatedAt = now;
  const me = findPlayer(next, action.playerId);
  const sameRound = action.round === next.round;

  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        return next;
      }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      next.players.push(newPlayer(action.playerId, action.name, action.avatar));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) return next;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      delete next.templates[me.id];
      if (next.phase === 'making' && next.players.filter((p) => p.inGame).every((p) => next.memes[p.id])) startVoting(next, now, rand);
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
      if (next.hostId !== action.playerId) return null;
      if (next.phase !== 'lobby' && next.phase !== 'final') return null;
      if (next.players.length < MIN_PLAYERS) return null;
      next.players.forEach((p) => { p.score = 0; });
      next.round = 0;
      next.history = [];
      return beginRound(next, action.pool, now, rand) ? next : null;
    }

    case 'reroll': {
      if (next.phase !== 'making' || !sameRound || !me?.inGame) return null;
      if (rerollsLeft(next, me.id) <= 0 || next.memes[me.id]) return null;
      const t = cleanTemplate(action.template);
      if (!t) return null;
      next.templates[me.id] = t;
      next.rerolled[me.id] = Number(next.rerolled[me.id] === true ? 1 : next.rerolled[me.id] || 0) + 1;
      return next;
    }

    case 'submit': {
      if (next.phase !== 'making' || !sameRound || !me?.inGame || next.memes[me.id]) return null;
      const tpl = next.templates[me.id];
      if (!tpl) return null;
      next.memes[me.id] = cleanTexts(action.texts, tpl.boxes);
      const pending = next.players.filter((p) => p.inGame && !next.memes[p.id]);
      if (!pending.length) startVoting(next, now, rand);
      return next;
    }

    case 'vote': {
      if (next.phase !== 'voting' || !sameRound || action.index !== next.voteIndex || !me?.inGame) return null;
      const author = next.order[next.voteIndex];
      if (!author || author === me.id || !STARS.includes(action.stars)) return null;
      next.votes[author] = { ...next.votes[author], [me.id]: action.stars };
      const missing = votersFor(next, author).filter((id) => !next.votes[author][id]);
      if (!missing.length) advanceVoting(next, now);
      return next;
    }

    case 'tick': {
      // Cualquier pantalla lo manda cuando ve el reloj en cero; la transacción deja pasar uno.
      if (!sameRound || action.phase !== next.phase || now < next.phaseEndsAt) return null;
      if (next.phase === 'making') { startVoting(next, now, rand); return next; }
      if (next.phase === 'voting') {
        if (action.index !== next.voteIndex) return null;
        advanceVoting(next, now);
        return next;
      }
      if (next.phase === 'results') {
        if (next.round >= next.options.rounds) {
          next.phase = 'final';
          next.phaseEndsAt = 0;
          return next;
        }
        return beginRound(next, action.pool, now, rand) ? next : null;
      }
      return null;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId) return null;
      next.phase = 'lobby';
      next.phaseEndsAt = 0;
      next.players.forEach((p) => { p.inGame = false; });
      return next;
    }

    default:
      return null;
  }
}

function advanceVoting(room, now) {
  room.voteIndex += 1;
  if (room.voteIndex >= room.order.length) showResults(room, now);
  else room.phaseEndsAt = now + VOTE_MS;
}

export function ranking(room) {
  return [...room.players].sort((a, b) => b.score - a.score);
}
