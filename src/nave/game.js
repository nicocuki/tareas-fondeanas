// Entre Nosotros (un Among Us): reducer de la sala, mismo patrón que los otros juegos. Corre dentro
// de la transacción de `rooms/{código}` con `ctx = { now, rand }` y devuelve null si la acción no vale.
//
// Acá vive todo lo que no es movimiento: quién es impostor, las tareas de cada uno, las muertes, los
// cuerpos, las reuniones y los votos, los sabotajes y quién gana. Dónde está cada uno va en tiempo
// real por otro lado (NaveGame.jsx): cada pantalla es dueña de su jugador, y el que mata o reporta
// manda acá la posición que ve. Entre amigos alcanza; no es a prueba de trampas.
//
// Fases: lobby → roles (se muestra quién sos) → playing ⇄ meeting → ejection → playing … → final.
// `round` sube cada vez que se vuelve a jugar: con eso las pantallas mandan a todos a la cafetería.
import { commonTasks, playerTasks, taskDone, TASKS } from './tasks.js';
import { STATIONS, W, H } from './map.js';

export const GAME_TYPE = 'nave';
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 4;
export const ROLES_MS = 5000;         // pantalla de «Tripulante» / «Impostor»
export const EJECT_MS = 9000;         // resultados de la votación (3 s) y la expulsión
export const RESULTS_MS = 3000;
export const REACTOR_MS = 30000;      // cuenta regresiva de la fusión del reactor
export const SABOTAGE_COOLDOWN = 30000;
export const FIRST_COOLDOWN = 10000;  // al empezar, matar y sabotear tardan esto
export const MAX_CHAT = 40;
export const CHAT_LEN = 120;
export const CHAT_BUDGET = 3000;      // caracteres de chat en la sala (se tiran los más viejos)

// Los colores del original, con su nombre.
export const COLORS = [
  { name: 'Rojo', body: '#c51111' }, { name: 'Azul', body: '#132ed1' }, { name: 'Verde', body: '#117f2d' },
  { name: 'Rosa', body: '#ed54ba' }, { name: 'Naranja', body: '#ef7d0d' }, { name: 'Amarillo', body: '#f5f557' },
  { name: 'Negro', body: '#3f474e' }, { name: 'Blanco', body: '#d6e0f0' }, { name: 'Violeta', body: '#6b2fbb' },
  { name: 'Marrón', body: '#71491e' }, { name: 'Celeste', body: '#38fedc' }, { name: 'Lima', body: '#50ef39' },
];

// Opciones del anfitrión, con los valores por defecto del original.
export const DEFAULT_OPTIONS = {
  impostors: 1, killCooldown: 25, killDistance: 1, speed: 1, crewVision: 1, impostorVision: 1.5,
  meetings: 1, emergencyCooldown: 15, discussion: 15, voting: 60, confirmEjects: true, anonymousVotes: false,
  commonTasks: 1, longTasks: 1, shortTasks: 2,
};
export const OPTION_VALUES = {
  impostors: [1, 2, 3],
  killCooldown: [10, 15, 20, 25, 30, 45, 60],
  killDistance: [0, 1, 2],
  speed: [0.75, 1, 1.25, 1.5, 2],
  crewVision: [0.5, 0.75, 1, 1.25, 1.5, 2],
  impostorVision: [1, 1.25, 1.5, 2, 3],
  meetings: [0, 1, 2, 3, 5],
  emergencyCooldown: [0, 10, 15, 20, 30],
  discussion: [0, 15, 30, 60],
  voting: [15, 30, 60, 90, 120],
  confirmEjects: [true, false],
  anonymousVotes: [true, false],
  commonTasks: [0, 1, 2],
  longTasks: [0, 1, 2, 3],
  shortTasks: [0, 1, 2, 3, 4, 5],
};
export const KILL_RANGE = [1.6, 2.3, 3.2]; // corta, normal, larga (en casillas)
export const REPORT_RANGE = 4;
export const USE_RANGE = 1.9;
export const BUTTON_RANGE = 3.3;

export const cleanName = (name) => String(name || '').trim().slice(0, 16);
export const makeId = () => Math.random().toString(36).slice(2, 10);
export const findPlayer = (room, id) => room?.players.find((p) => p.id === id) || null;
export const inGame = (room) => room.players.filter((p) => p.inGame);
export const aliveCrew = (room) => inGame(room).filter((p) => p.alive && !p.impostor);
export const aliveImpostors = (room) => inGame(room).filter((p) => p.alive && p.impostor);
export const colorOf = (p) => COLORS[p?.color ?? 0] || COLORS[0];

// Con pocos jugadores no entran tantos impostores (como en el original).
export const maxImpostors = (count) => (count >= 9 ? 3 : count >= 7 ? 2 : 1);

export function newRoom(hostId, hostName, avatar, now = Date.now()) {
  return {
    gameType: GAME_TYPE,
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [newPlayer(hostId, hostName, avatar, 0)],
    game: 0,
    round: 0,
    bodies: [],
    killReadyAt: {},
    sabotage: null,
    sabotageReadyAt: 0,
    emergencyReadyAt: 0,
    meeting: null,
    ejection: null,
    chat: [],
    winner: null,
    reason: '',
    phaseEndsAt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function newPlayer(id, name, avatar, color) {
  return { id, name: cleanName(name), avatar: avatar || '🐸', color, inGame: false, alive: false, impostor: false, tasks: [], meetingsLeft: 0 };
}

const freeColor = (room) => {
  const used = new Set(room.players.map((p) => p.color));
  const free = COLORS.findIndex((_, i) => !used.has(i));
  return free >= 0 ? free : room.players.length % COLORS.length;
};

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Progreso de la barra de tareas: tareas terminadas de los tripulantes (vivos o fantasmas) / total.
export function taskProgress(room) {
  let done = 0, total = 0;
  for (const p of inGame(room)) {
    if (p.impostor) continue;
    for (const t of p.tasks) { total += 1; if (taskDone(t)) done += 1; }
  }
  return { done, total };
}

// ¿Ganó alguien? { winner: 'crew' | 'impostor', reason } o null.
export function winnerOf(room) {
  const imps = aliveImpostors(room).length;
  const crew = aliveCrew(room).length;
  if (imps === 0) return { winner: 'crew', reason: 'votes' };
  if (imps >= crew) return { winner: 'impostor', reason: 'kills' };
  const { done, total } = taskProgress(room);
  if (total > 0 && done >= total) return { winner: 'crew', reason: 'tasks' };
  return null;
}

function finish(room, result) {
  room.phase = 'final';
  room.winner = result.winner;
  room.reason = result.reason;
  room.sabotage = null;
  room.phaseEndsAt = 0;
}

// Si ya ganó alguien, termina. Durante una reunión o la expulsión se espera al final de la expulsión.
function checkWin(room) {
  if (room.phase !== 'playing') return;
  const result = winnerOf(room);
  if (result) finish(room, result);
}

function startPlaying(room, now, afterMeeting) {
  const o = room.options;
  room.phase = 'playing';
  room.round += 1;
  room.ejection = null;
  room.phaseEndsAt = 0;
  for (const p of aliveImpostors(room)) room.killReadyAt[p.id] = now + (afterMeeting ? o.killCooldown * 1000 : FIRST_COOLDOWN);
  room.emergencyReadyAt = now + o.emergencyCooldown * 1000;
  room.sabotageReadyAt = Math.max(room.sabotageReadyAt || 0, now + FIRST_COOLDOWN);
}

function startMeeting(room, caller, body, now) {
  const o = room.options;
  const votingAt = now + o.discussion * 1000;
  room.phase = 'meeting';
  room.meeting = { n: (room.meeting?.n || 0) + 1, caller: caller.id, body: body || null, at: now, votingAt, endsAt: votingAt + o.voting * 1000, votes: {} };
  room.bodies = [];
  // Una reunión arregla el sabotaje crítico (como en el original); las luces siguen apagadas.
  if (room.sabotage?.kind === 'reactor') room.sabotage = null;
  room.phaseEndsAt = room.meeting.endsAt;
}

// Cuenta los votos de los vivos y pasa a la expulsión.
function endMeeting(room, now) {
  const counts = {};
  for (const [voter, target] of Object.entries(room.meeting.votes)) {
    const v = findPlayer(room, voter);
    if (!v?.inGame || !v.alive) continue;
    counts[target] = (counts[target] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const tie = Boolean(top && ranked[1] && ranked[1][1] === top[1]);
  let ejected = null;
  if (top && !tie && top[0] !== 'skip') ejected = findPlayer(room, top[0]);
  if (ejected) ejected.alive = false;
  room.phase = 'ejection';
  room.ejection = {
    id: ejected?.id || null,
    impostor: Boolean(ejected?.impostor),
    tie,
    impostorsLeft: aliveImpostors(room).length,
  };
  room.phaseEndsAt = now + EJECT_MS;
}

function allVoted(room) {
  return inGame(room).filter((p) => p.alive).every((p) => room.meeting.votes[p.id]);
}

function releaseReactor(room, id) {
  const s = room.sabotage;
  if (s?.kind !== 'reactor') return;
  s.hold = s.hold.map((h) => (h === id ? null : h));
}

const finiteIn = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;

export function applyAction(room, action, ctx = {}) {
  if (!room || room.gameType !== GAME_TYPE) return null;
  const now = ctx.now ?? Date.now();
  const rand = ctx.rand ?? Math.random;
  const next = JSON.parse(JSON.stringify(room));
  const me = findPlayer(next, action.playerId);
  const host = next.hostId === action.playerId;
  const sameGame = action.game === next.game;
  const result = reduce(next, action, { now, rand, me, host, sameGame });
  if (!result) return null;
  result.updatedAt = now;
  return result;
}

function reduce(next, action, { now, rand, me, host, sameGame }) {
  const o = next.options;
  switch (action.type) {
    case 'join': {
      if (me) {
        me.name = cleanName(action.name) || me.name;
        if (action.avatar) me.avatar = action.avatar;
        return next;
      }
      if (next.players.length >= MAX_PLAYERS || !cleanName(action.name)) return null;
      // El que entra con la partida empezada solo mira (inGame: false) hasta la próxima.
      next.players.push(newPlayer(action.playerId, action.name, action.avatar, freeColor(next)));
      return next;
    }

    case 'leave': {
      if (!me) return null;
      releaseReactor(next, me.id);
      next.players = next.players.filter((p) => p.id !== me.id);
      if (!next.players.length) return next;
      if (next.hostId === me.id) next.hostId = next.players[0].id;
      if (next.phase === 'meeting' && allVoted(next)) endMeeting(next, now);
      checkWin(next);
      return next;
    }

    // El anfitrión avisa por alguien que dejó de mandar su posición (pestaña cerrada sin salir).
    case 'gone': {
      const target = findPlayer(next, action.target);
      if (!host || !target?.inGame || !['playing', 'meeting'].includes(next.phase) || !sameGame) return null;
      target.inGame = false;
      target.alive = false;
      releaseReactor(next, target.id);
      if (next.phase === 'meeting' && allVoted(next)) endMeeting(next, now);
      checkWin(next);
      return next;
    }

    case 'color': {
      const c = action.color;
      if (!me || next.phase !== 'lobby' || !Number.isInteger(c) || c < 0 || c >= COLORS.length) return null;
      if (next.players.some((p) => p.id !== me.id && p.color === c)) return null;
      me.color = c;
      return next;
    }

    case 'setOptions': {
      if (!host || next.phase !== 'lobby' || !action.options) return null;
      for (const [k, v] of Object.entries(action.options)) {
        if (!OPTION_VALUES[k]?.includes(v)) return null;
        o[k] = v;
      }
      return next;
    }

    case 'start': {
      if (!host || !['lobby', 'final'].includes(next.phase) || next.players.length < MIN_PLAYERS) return null;
      const order = shuffle(next.players, rand);
      const count = Math.min(o.impostors, maxImpostors(order.length));
      const impostors = new Set(order.slice(0, count).map((p) => p.id));
      const common = commonTasks(o.commonTasks, rand);
      for (const p of next.players) {
        p.inGame = true;
        p.alive = true;
        p.impostor = impostors.has(p.id);
        // Los impostores también tienen una lista (de mentira): así no se nota quién no hace nada.
        p.tasks = playerTasks(common, o, rand);
        p.meetingsLeft = o.meetings;
      }
      next.game += 1;
      next.phase = 'roles';
      next.phaseEndsAt = now + ROLES_MS;
      next.bodies = [];
      next.killReadyAt = {};
      next.sabotage = null;
      next.sabotageReadyAt = 0;
      next.meeting = null;
      next.ejection = null;
      next.chat = [];
      next.winner = null;
      next.reason = '';
      return next;
    }

    case 'toLobby': {
      if (!host || next.phase !== 'final') return null;
      next.phase = 'lobby';
      for (const p of next.players) Object.assign(p, { inGame: false, alive: false, impostor: false, tasks: [], meetingsLeft: 0 });
      next.bodies = [];
      next.meeting = null;
      next.ejection = null;
      next.sabotage = null;
      next.chat = [];
      return next;
    }

    // Cualquiera avisa cuando ve un reloj en cero; la transacción deja pasar uno solo.
    case 'tick': {
      if (!sameGame || action.phase !== next.phase) return null;
      if (next.phase === 'roles') {
        if (now < next.phaseEndsAt) return null;
        startPlaying(next, now, false);
        return next;
      }
      if (next.phase === 'meeting') {
        if (action.meeting !== next.meeting.n || now < next.meeting.endsAt) return null;
        endMeeting(next, now);
        return next;
      }
      if (next.phase === 'ejection') {
        if (now < next.phaseEndsAt) return null;
        const result = winnerOf(next);
        if (result) finish(next, result);
        else startPlaying(next, now, true);
        return next;
      }
      if (next.phase === 'playing') {
        if (next.sabotage?.kind !== 'reactor' || now < next.sabotage.endsAt) return null;
        finish(next, { winner: 'impostor', reason: 'reactor' });
        return next;
      }
      return null;
    }

    case 'kill': {
      const target = findPlayer(next, action.target);
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.alive || !me.impostor) return null;
      if (!target?.inGame || !target.alive || target.impostor) return null;
      if (now < (next.killReadyAt[me.id] || 0)) return null;
      if (!finiteIn(action.x, W) || !finiteIn(action.y, H)) return null;
      target.alive = false;
      releaseReactor(next, target.id);
      next.bodies.push({ id: target.id, by: me.id, x: Math.round(action.x * 100) / 100, y: Math.round(action.y * 100) / 100 });
      next.killReadyAt[me.id] = now + o.killCooldown * 1000;
      checkWin(next);
      return next;
    }

    case 'report': {
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.alive) return null;
      const body = next.bodies.find((b) => b.id === action.body);
      if (!body) return null;
      startMeeting(next, me, body.id, now);
      return next;
    }

    case 'emergency': {
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.alive || me.meetingsLeft <= 0) return null;
      if (now < next.emergencyReadyAt || next.sabotage?.kind === 'reactor') return null;
      me.meetingsLeft -= 1;
      startMeeting(next, me, null, now);
      return next;
    }

    case 'vote': {
      const m = next.meeting;
      if (next.phase !== 'meeting' || !sameGame || action.meeting !== m?.n || now < m.votingAt) return null;
      if (!me?.inGame || !me.alive || m.votes[me.id]) return null;
      const target = action.target === 'skip' ? null : findPlayer(next, action.target);
      if (action.target !== 'skip' && (!target?.inGame || !target.alive)) return null;
      m.votes[me.id] = action.target;
      if (allVoted(next)) endMeeting(next, now);
      return next;
    }

    case 'task': {
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || me.impostor) return null;
      const t = me.tasks[action.task];
      if (!t || taskDone(t) || t.d !== action.step || !STATIONS[t.s[t.d]]) return null;
      t.d += 1;
      checkWin(next);
      return next;
    }

    case 'sabotage': {
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.impostor) return null;
      if (next.sabotage || now < (next.sabotageReadyAt || 0)) return null;
      if (action.kind === 'lights') {
        const switches = Array.from({ length: 5 }, () => rand() < 0.5);
        switches[Math.floor(rand() * 5)] = false; // al menos una apagada
        next.sabotage = { kind: 'lights', switches };
      } else if (action.kind === 'reactor') {
        next.sabotage = { kind: 'reactor', endsAt: now + REACTOR_MS, hold: [null, null] };
      } else return null;
      return next;
    }

    case 'fixLights': {
      const s = next.sabotage;
      const i = action.switch;
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.alive || s?.kind !== 'lights') return null;
      if (!Number.isInteger(i) || i < 0 || i >= s.switches.length) return null;
      s.switches[i] = !s.switches[i];
      if (s.switches.every(Boolean)) { next.sabotage = null; next.sabotageReadyAt = now + SABOTAGE_COOLDOWN; }
      return next;
    }

    case 'holdReactor': {
      const s = next.sabotage;
      const side = action.side;
      if (next.phase !== 'playing' || !sameGame || !me?.inGame || !me.alive || s?.kind !== 'reactor' || ![0, 1].includes(side)) return null;
      if (action.on) {
        if (s.hold[side] && s.hold[side] !== me.id) return null;
        releaseReactor(next, me.id);
        s.hold[side] = me.id;
      } else {
        if (s.hold[side] !== me.id) return null;
        s.hold[side] = null;
      }
      if (s.hold[0] && s.hold[1]) { next.sabotage = null; next.sabotageReadyAt = now + SABOTAGE_COOLDOWN; }
      return next;
    }

    // Charla: en las reuniones los vivos hablan con todos; los fantasmas solo entre ellos (siempre).
    case 'chat': {
      const text = String(action.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN);
      if (!text || !me?.inGame) return null;
      const ghost = !me.alive;
      if (!ghost && next.phase !== 'meeting') return null;
      if (ghost && !['playing', 'meeting', 'ejection'].includes(next.phase)) return null;
      next.chat.push({ id: me.id, x: text, g: ghost ? 1 : 0, at: now });
      if (next.chat.length > MAX_CHAT) next.chat = next.chat.slice(-MAX_CHAT);
      while (next.chat.reduce((n, c) => n + c.x.length, 0) > CHAT_BUDGET) next.chat.shift();
      return next;
    }

    default:
      return null;
  }
}

// Nombre de la tarea con su sala actual («Electricidad: Arreglar cables (1/3)»): lo usa la pantalla.
export function taskLabel(t, roomName) {
  const def = TASKS[t.k];
  const parts = t.s.length > 1 ? ` (${Math.min(t.d, t.s.length)}/${t.s.length})` : '';
  return `${roomName ? `${roomName}: ` : ''}${def?.name || t.k}${parts}`;
}
