// Abismo: reducer puro (mismo patrón que Código Secreto y los demás). Corre dentro de la transacción de la
// sala con `ctx = { now, rand }`. Todos responden la misma consigna a la vez; qué tan nicho es cada respuesta
// lo decide el juez del servidor (/api/abismo/juzgar), y la pantalla manda el veredicto en la acción `answer`.
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';
import { PROMPTS, PROMPT_BY_ID } from './prompts.js';
import { MAX_ANSWER, MAX_NOTE, TIERS, cleanAnswer, depthOf, tierById } from './tiers.js';

export const GAME_TYPE = 'abismo';
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 10;
// Después de que el reloj llega a cero, cuánto se espera a que el juez termine de juzgar lo que ya se mandó.
export const JUDGE_GRACE_MS = 6000;
// Cuánto dura el revelado con más de un jugador (con uno solo, avanza él con «Descender»).
export const REVEAL_MS = 10000;
export const MAX_USED = 60; // consignas ya jugadas en esta sala, para no repetirlas

export const DEFAULT_OPTIONS = { rounds: 7, seconds: 25 };
export const OPTION_VALUES = { rounds: [5, 7, 10], seconds: [15, 25, 40] };

export const cleanName = (name) => String(name || '').trim().slice(0, 20);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar)],
    round: 0,          // 1 a options.rounds mientras se juega
    prompts: [],       // ids de las consignas de esta partida
    answers: [],       // por ronda: { [playerId]: { t, c, k, p, n, g } }
    phaseEndsAt: 0,
    startedAt: 0,
    used: [],
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', score: 0, inGame: false };
}

// La consigna de la ronda `round` (1-based), o null.
export const promptAt = (room, round = room?.round) => PROMPT_BY_ID[room?.prompts?.[round - 1]] || null;
export const answersOf = (room, round = room?.round) => room?.answers?.[round - 1] || {};
export const myAnswer = (room, id, round) => answersOf(room, round)[id] || null;
export const activePlayers = (room) => room.players.filter((p) => p.inGame);
export const depthOfPlayer = (p) => depthOf(p.score);

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Elige `n` consignas al azar, evitando las ya jugadas en esta sala mientras alcancen.
export function pickPrompts(n, used, rand) {
  const avoid = new Set(used || []);
  const fresh = PROMPTS.filter((p) => !avoid.has(p.id));
  const pool = fresh.length >= n ? fresh : PROMPTS;
  return shuffle(pool, rand).slice(0, n).map((p) => p.id);
}

// Un veredicto del juez que llega en la acción `answer`, con forma válida, o null.
export function cleanVerdict(a) {
  if (!a || typeof a !== 'object') return null;
  const tier = tierById(a.tier);
  const text = cleanAnswer(a.text);
  if (!tier || !text) return null;
  // `c` es la forma correcta que fijó el juez; `t` (lo que se escribió) va solo si es distinto.
  const clean = { c: cleanAnswer(a.canonical) || text, k: tier.id, p: tier.pts };
  if (clean.c !== text) clean.t = text;
  if (a.note) clean.n = String(a.note).replace(/["\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (typeof a.sig === 'string' && /^[a-f0-9]{16,32}$/.test(a.sig)) clean.g = a.sig;
  return clean;
}

function beginRound(room, now) {
  room.round += 1;
  room.phase = 'prompt';
  room.phaseEndsAt = now + room.options.seconds * 1000;
  room.answers[room.round - 1] = {};
}

// Cierra la consigna: los puntos se suman y se pasa al revelado (el que no respondió queda en 0).
function startReveal(room, now) {
  const round = answersOf(room);
  for (const p of activePlayers(room)) {
    const a = round[p.id];
    if (a) p.score += a.p;
  }
  room.phase = 'reveal';
  room.phaseEndsAt = activePlayers(room).length > 1 ? now + REVEAL_MS : 0;
}

function advance(room, now) {
  if (room.round >= room.options.rounds) {
    room.phase = 'final';
    room.phaseEndsAt = 0;
    return;
  }
  beginRound(room, now);
}

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'final']);
    const left = target && applyAction(room, { type: 'leave', playerId: target }, ctx);
    return left && left !== room ? markKicked(left, target) : null;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return null;
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
      if (next.phase === 'prompt' && activePlayers(next).length && activePlayers(next).every((p) => answersOf(next)[p.id])) startReveal(next, now);
      if (next.phase === 'reveal' && activePlayers(next).length <= 1) next.phaseEndsAt = 0;
      if ((next.phase === 'prompt' || next.phase === 'reveal') && !activePlayers(next).length) { next.phase = 'final'; next.phaseEndsAt = 0; }
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
      next.players.forEach((p) => { p.score = 0; p.inGame = true; });
      next.round = 0;
      next.answers = [];
      next.prompts = pickPrompts(next.options.rounds, next.used, rand);
      next.used = [...next.used, ...next.prompts].slice(-MAX_USED);
      next.startedAt = now;
      beginRound(next, now);
      return next;
    }

    case 'answer': {
      // Un veredicto aceptado del juez. Se guarda una sola respuesta por persona y por ronda.
      if (next.phase !== 'prompt' || !sameRound || !me?.inGame) return null;
      const round = answersOf(next);
      if (round[me.id]) return null;
      const clean = cleanVerdict(action);
      if (!clean) return null;
      round[me.id] = clean;
      if (activePlayers(next).every((p) => round[p.id])) startReveal(next, now);
      return next;
    }

    case 'tick': {
      // Cualquier pantalla lo manda cuando ve el reloj en cero; la transacción deja pasar uno.
      if (!sameRound || action.phase !== next.phase) return null;
      if (next.phase === 'prompt') {
        if (now < next.phaseEndsAt + JUDGE_GRACE_MS) return null;
        startReveal(next, now);
        return next;
      }
      if (next.phase === 'reveal') {
        if (!next.phaseEndsAt || now < next.phaseEndsAt) return null;
        advance(next, now);
        return next;
      }
      return null;
    }

    case 'next': {
      // El anfitrión pasa a la ronda siguiente sin esperar el reloj del revelado.
      if (next.phase !== 'reveal' || !sameRound || next.hostId !== action.playerId) return null;
      advance(next, now);
      return next;
    }

    case 'toLobby': {
      if (next.hostId !== action.playerId) return null;
      next.phase = 'lobby';
      next.phaseEndsAt = 0;
      next.round = 0;
      next.players.forEach((p) => { p.inGame = false; });
      return next;
    }

    default:
      return null;
  }
}

// Del mejor al peor; los empatados comparten puesto (`place`).
export function ranking(room) {
  const list = [...room.players].filter((p) => p.inGame).sort((a, b) => b.score - a.score);
  let place = 0;
  return list.map((p, i) => {
    if (i === 0 || p.score !== list[i - 1].score) place = i + 1;
    return { ...p, place };
  });
}

// Las respuestas de la partida, de la más nicho a la más obvia: { round, prompt, player, answer }.
export function allAnswers(room) {
  const out = [];
  (room.answers || []).forEach((byPlayer, i) => {
    const prompt = PROMPT_BY_ID[room.prompts[i]];
    for (const [id, a] of Object.entries(byPlayer || {})) {
      const player = findPlayer(room, id);
      if (player) out.push({ round: i + 1, prompt, player, answer: a });
    }
  });
  return out.sort((a, b) => b.answer.p - a.answer.p || a.round - b.round);
}

// Lo que se manda al ranking global al terminar: las respuestas de este jugador con su firma.
export function resultFor(room, id) {
  const answers = (room.answers || []).map((byPlayer, i) => {
    const a = byPlayer?.[id];
    return a ? { promptId: room.prompts[i], text: a.t || a.c, canonical: a.c, tier: a.k, sig: a.g } : null;
  }).filter(Boolean);
  return { answers, rounds: room.options.rounds, startedAt: room.startedAt };
}

export { TIERS, MAX_ANSWER };
