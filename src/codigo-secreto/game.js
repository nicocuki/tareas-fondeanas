// Lógica pura del juego: sin React ni red, para poder testearla y aplicarla dentro de transacciones.
import { WORD_POOL } from './words.js';

export { WORD_POOL };

export const ALL_TEAMS = ['red', 'blue', 'yellow', 'green'];
export const ROLES = ['spymaster', 'operative'];
export const TEAM_ICON = { red: '●', blue: '▲', yellow: '◆', green: '✦', neutral: '○', assassin: '✕' };
export const TEAM_LABEL = {
  red: 'Rojo', blue: 'Azul', yellow: 'Amarillo', green: 'Verde', neutral: 'Neutral', assassin: 'Bomba',
};

// Chat global: solo mensajes rápidos de esta lista. El de equipo (solo agentes) es texto libre,
// porque ahí se discute qué casillas elegir.
export const CHAT_MESSAGES = ['Apurate', 'Dale rapido', 'Mish', 'Virgo'];
export const CHAT_SCOPES = ['global', 'team'];

export const MAX_NAME = 20;
export const MAX_CLUE = 24;
export const MAX_PLAYERS = 20;
export const MAX_CHAT = 30;
export const MAX_TEAM_CHAT = 20;
export const MAX_CHAT_TEXT = 140;
// Tope del chat serializado. Con texto libre, 4 equipos charlando podrían pasar el límite de
// 30.000 caracteres que ponen las reglas de la base, y ahí se rechazaría cualquier jugada.
export const CHAT_BUDGET = 12000;
export const MAX_LOG = 40;
// Una sala sin movimiento durante este tiempo puede reutilizarse si sale su código.
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

// Tablero cuadrado según la cantidad de equipos. Cada equipo aporta siempre la misma cantidad
// de palabras (9 el que empieza, 8 los demás); las neutrales rellenan lo que sobra.
export const GRID_COLS = { 2: 5, 3: 6, 4: 7 };
export const CARDS_STARTING_TEAM = 9;
export const CARDS_OTHER_TEAM = 8;
export const BOMB_CHOICES = [1, 2, 3, 4, 5];
// 0 = sin límite de tiempo.
export const TIMER_CHOICES = [0, 1, 2, 3, 5, 10];

export const DEFAULT_OPTIONS = {
  teamCount: 2,
  bombs: 1,
  keepAfterNeutral: false,
  keepAfterOpponent: false,
  clueMinutes: 0,
  guessMinutes: 0,
  instantReveal: true,
};

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function teamsFor(teamCount) {
  return ALL_TEAMS.slice(0, teamCount);
}

export function boardSize(teamCount) {
  const cols = GRID_COLS[teamCount] || GRID_COLS[2];
  return cols * cols;
}

export function teamCardCount(team, startingTeam) {
  return team === startingTeam ? CARDS_STARTING_TEAM : CARDS_OTHER_TEAM;
}

export function neutralCount(options) {
  const o = normalizeOptions(options);
  const teamCards = CARDS_STARTING_TEAM + CARDS_OTHER_TEAM * (o.teamCount - 1);
  return boardSize(o.teamCount) - teamCards - o.bombs;
}

export function normalizeOptions(raw) {
  const o = { ...DEFAULT_OPTIONS, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    teamCount: GRID_COLS[o.teamCount] ? o.teamCount : DEFAULT_OPTIONS.teamCount,
    bombs: BOMB_CHOICES.includes(o.bombs) ? o.bombs : DEFAULT_OPTIONS.bombs,
    keepAfterNeutral: o.keepAfterNeutral === true,
    keepAfterOpponent: o.keepAfterOpponent === true,
    clueMinutes: TIMER_CHOICES.includes(o.clueMinutes) ? o.clueMinutes : 0,
    guessMinutes: TIMER_CHOICES.includes(o.guessMinutes) ? o.guessMinutes : 0,
    instantReveal: o.instantReveal !== false,
  };
}

// Fisher–Yates: sort(() => Math.random() - 0.5) no mezcla de forma uniforme.
export function shuffle(items, rand = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)];
  return s;
}

export function makeId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function generateBoard(options = DEFAULT_OPTIONS, rand = Math.random) {
  const o = normalizeOptions(options);
  const teams = teamsFor(o.teamCount);
  const startingTeam = teams[Math.floor(rand() * teams.length)];
  const assignments = shuffle([
    ...teams.flatMap((t) => Array(teamCardCount(t, startingTeam)).fill(t)),
    ...Array(o.bombs).fill('assassin'),
    ...Array(neutralCount(o)).fill('neutral'),
  ], rand);
  const words = shuffle([...new Set(WORD_POOL)], rand).slice(0, boardSize(o.teamCount));
  return {
    board: words.map((word, i) => ({ word, team: assignments[i], revealed: false })),
    startingTeam,
    teams,
  };
}

export function remaining(board, team) {
  return board.filter((c) => c.team === team && !c.revealed).length;
}

export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
}

export function normalizeWord(word) {
  return String(word ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Una sola línea, sin espacios de sobra. Se corta por caracteres y no por unidades UTF-16,
// para no partir un emoji al medio.
export function cleanChatText(text) {
  return Array.from(String(text ?? '').replace(/\s+/g, ' ').trim()).slice(0, MAX_CHAT_TEXT).join('').trim();
}

// Se queda con los últimos de cada canal y, si aun así pesa demasiado, tira los más viejos.
function trimChat(chat) {
  const seen = {};
  const kept = [];
  for (let i = chat.length - 1; i >= 0; i--) {
    const c = chat[i];
    const channel = c.s === 'team' ? `team:${c.t}` : 'global';
    seen[channel] = (seen[channel] || 0) + 1;
    if (seen[channel] <= (c.s === 'team' ? MAX_TEAM_CHAT : MAX_CHAT)) kept.unshift(c);
  }
  let size = JSON.stringify(kept).length;
  while (size > CHAT_BUDGET && kept.length) size -= JSON.stringify(kept.shift()).length + 1;
  return kept;
}

export function findPlayer(room, playerId) {
  return (room && playerId && room.players.find((p) => p.id === playerId)) || null;
}

export function spymasterOf(room, team) {
  return room.players.find((p) => p.team === team && p.role === 'spymaster') || null;
}

export function operativesOf(room, team) {
  return room.players.filter((p) => p.team === team && p.role === 'operative');
}

// Con un solo agente la mayoría es 1, así que confirmar equivale a destapar.
export function majorityFor(room, team) {
  return Math.floor(operativesOf(room, team).length / 2) + 1;
}

export function isHost(room, playerId) {
  return !!room && !!playerId && room.hostId === playerId;
}

export function activeTeams(room) {
  return room.teams.filter((t) => !room.eliminated.includes(t));
}

export function startProblems(room) {
  const problems = [];
  for (const team of room.teams) {
    if (!spymasterOf(room, team)) problems.push(`Falta el espía del equipo ${TEAM_LABEL[team]}.`);
    if (!operativesOf(room, team).length) problems.push(`Falta al menos un agente en el equipo ${TEAM_LABEL[team]}.`);
  }
  return problems;
}

export function clueProblem(room, word) {
  const raw = String(word ?? '').trim();
  if (!raw) return 'Escribí una pista.';
  if (/\s/.test(raw)) return 'La pista tiene que ser una sola palabra, sin espacios.';
  const w = normalizeWord(raw);
  if (!w) return 'Escribí una pista.';
  if (w.length > MAX_CLUE) return 'La pista es demasiado larga.';
  if (!/[a-z0-9]/.test(w)) return 'La pista tiene que tener al menos una letra.';
  // Vale también para las ya destapadas: decirlas en voz alta sigue estando prohibido.
  if (room.board.some((c) => normalizeWord(c.word) === w)) {
    return 'Esa palabra está en el tablero: no se puede usar como pista.';
  }
  return null;
}

// El número no puede ser 0 ni infinito: como mucho, las palabras que le quedan al equipo.
export function numberProblem(room, team, number) {
  const max = remaining(room.board, team);
  if (!Number.isInteger(number)) return 'Elegí un número.';
  if (number < 1) return 'El número tiene que ser 1 o más.';
  if (number > max) return `A tu equipo le quedan ${max} palabra${max === 1 ? '' : 's'}: no podés pedir más.`;
  return null;
}

// La pista N da exactamente N intentos.
export function guessLimit(clue) {
  return clue.number;
}

export function timerLeft(room, now = Date.now()) {
  const t = room.timer;
  if (!t) return null;
  if (room.paused) return Math.max(0, t.left ?? 0);
  return Math.max(0, (t.deadline ?? now) - now);
}

function startTimer(room, kind, now) {
  const minutes = kind === 'clue' ? room.options.clueMinutes : room.options.guessMinutes;
  if (!minutes) return null;
  return { kind, deadline: now + minutes * 60000, left: null };
}

function nextActiveTeam(room, from) {
  const start = room.teams.indexOf(from);
  for (let i = 1; i <= room.teams.length; i++) {
    const team = room.teams[(start + i) % room.teams.length];
    if (!room.eliminated.includes(team)) return team;
  }
  return from;
}

function passTurn(room, now) {
  const next = {
    ...room,
    currentTeam: nextActiveTeam(room, room.currentTeam),
    clue: null,
    votes: {},
    voteReset: 0,
    turn: room.turn + 1,
  };
  return { ...next, timer: startTimer(next, 'clue', now) };
}

function withNewBoard(room, rand) {
  const options = normalizeOptions(room.options);
  const { board, startingTeam, teams } = generateBoard(options, rand);
  return {
    ...room,
    options,
    teams,
    board,
    currentTeam: startingTeam,
    clue: null,
    votes: {},
    voteReset: 0,
    eliminated: [],
    round: (room.round || 0) + 1,
    turn: (room.turn || 0) + 1,
    log: [],
    winner: null,
    winReason: null,
    paused: false,
    pausedBy: null,
    timer: null,
  };
}

export function newRoom(hostId, hostName, { rand = Math.random, now = Date.now() } = {}) {
  const base = {
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [{ id: hostId, name: cleanName(hostName), team: null, role: null, ready: false }],
    chat: [],
  };
  return { ...withNewBoard(base, rand), createdAt: now, updatedAt: now };
}

// El equipo de turno tocó una bomba: queda eliminado. Si queda uno solo en pie, gana ese.
function hitBomb(room, now) {
  const eliminated = [...room.eliminated, room.currentTeam];
  const alive = room.teams.filter((t) => !eliminated.includes(t));
  const done = { ...room, eliminated, clue: null, timer: null };
  if (alive.length <= 1) return { ...done, winner: alive[0] || null, winReason: 'assassin' };
  return passTurn(done, now);
}

// Gana quien se quede sin palabras, aunque no sea su turno (primero el que está jugando).
function finishedTeam(room) {
  const order = [room.currentTeam, ...room.teams.filter((t) => t !== room.currentTeam)];
  return order.find((t) => !room.eliminated.includes(t) && remaining(room.board, t) === 0) || null;
}

// Revelado al instante: cada casilla se destapa apenas el equipo la confirma.
function revealCard(room, index, now) {
  const card = room.board[index];
  const board = room.board.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  const clue = { ...room.clue, guesses: room.clue.guesses + 1 };
  const next = { ...room, board, clue, votes: {}, voteReset: 0 };

  if (card.team === 'assassin') return hitBomb(next, now);
  const winner = finishedTeam(next);
  if (winner) return { ...next, clue: null, timer: null, winner, winReason: 'complete' };

  const keepGuessing = card.team === room.currentTeam
    || (card.team === 'neutral' ? room.options.keepAfterNeutral : room.options.keepAfterOpponent);
  if (!keepGuessing || clue.guesses >= guessLimit(clue)) return passTurn(next, now);
  return next;
}

// Revelado al terminar el turno: una casilla queda elegida cuando la vota la mayoría del equipo.
// Nada se destapa hasta que alguien aprieta «Terminar turno» (o se acaba el reloj).
export function pickedCards(room) {
  if (!room.clue) return [];
  const need = majorityFor(room, room.currentTeam);
  return Object.keys(room.votes)
    .map(Number)
    .filter((i) => room.votes[i].length >= need && room.board[i] && !room.board[i].revealed)
    // Si alguien se fue y bajó la mayoría, podrían quedar más elegidas que intentos: ganan las más votadas.
    .sort((a, b) => room.votes[b].length - room.votes[a].length || a - b)
    .slice(0, room.clue.number);
}

// Se destapan todas las elegidas juntas. Como se ven a la vez, «seguir después de una blanca»
// no tiene sentido acá: el turno siempre termina.
function resolvePicks(room, picks, now) {
  const board = room.board.map((c, i) => (picks.includes(i) ? { ...c, revealed: true } : c));
  const next = { ...room, board, clue: { ...room.clue, guesses: picks.length }, votes: {}, voteReset: 0 };
  // La bomba pesa más que cualquier otra cosa que haya salido en la misma tanda.
  if (picks.some((i) => room.board[i].team === 'assassin')) return hitBomb(next, now);
  const winner = finishedTeam(next);
  if (winner) return { ...next, clue: null, timer: null, winner, winReason: 'complete' };
  return passTurn(next, now);
}

function reduce(room, a, me, { rand, now }) {
  const playing = room.phase === 'playing' && !room.winner && !room.paused;

  switch (a.type) {
    case 'join': {
      const name = cleanName(a.name);
      if (!name || !a.playerId) return null;
      if (me) return me.name === name ? null : { ...room, players: room.players.map((p) => (p.id === me.id ? { ...p, name } : p)) };
      if (room.players.length >= MAX_PLAYERS) return null;
      const players = [...room.players, { id: a.playerId, name, team: null, role: null, ready: false }];
      const hostAlive = room.players.some((p) => p.id === room.hostId);
      return { ...room, players, hostId: hostAlive ? room.hostId : a.playerId };
    }

    case 'leave': {
      if (!me) return null;
      const players = room.players.filter((p) => p.id !== me.id);
      const votes = Object.fromEntries(
        Object.entries(room.votes)
          .map(([i, ids]) => [i, ids.filter((id) => id !== me.id)])
          .filter(([, ids]) => ids.length),
      );
      return { ...room, players, votes, hostId: room.hostId === me.id ? (players[0]?.id ?? null) : room.hostId };
    }

    case 'pickRole': {
      if (!me || !room.teams.includes(a.team) || !ROLES.includes(a.role)) return null;
      // Durante la partida solo puede elegir quien todavía no tiene equipo (evita que un espía vea el mapa y pase a agente).
      if (room.phase !== 'lobby' && me.team) return null;
      if (me.team === a.team && me.role === a.role) return null;
      const spymaster = a.role === 'spymaster' && spymasterOf(room, a.team);
      if (spymaster && spymaster.id !== me.id) return null;
      // Al cambiar de equipo o rol, reseteamos su estado de listo
      return { ...room, players: room.players.map((p) => (p.id === me.id ? { ...p, team: a.team, role: a.role, ready: false } : p)) };
    }

    // Solo el anfitrión toca los modificadores, y solo antes de empezar.
    case 'setOptions': {
      if (!me || room.phase !== 'lobby' || !isHost(room, me.id)) return null;
      const options = normalizeOptions({ ...room.options, ...a.options });
      const changed = Object.keys(options).filter((k) => options[k] !== room.options[k]);
      if (!changed.length) return null;
      const teams = teamsFor(options.teamCount);
      // Al cambiar opciones, se resetea el listo de todos para reconfirmar
      const players = room.players.map((p) => {
        const teamValid = p.team && teams.includes(p.team);
        return { ...p, team: teamValid ? p.team : null, role: teamValid ? p.role : null, ready: false };
      });
      const base = { ...room, options, players, teams };
      // Cambiar equipos o bombas cambia el tamaño del tablero: hay que rearmarlo.
      if (!changed.includes('teamCount') && !changed.includes('bombs')) return base;
      const next = generateBoard(options, rand);
      return { ...base, teams: next.teams, board: next.board, currentTeam: next.startingTeam, eliminated: [], log: [] };
    }

    case 'setReady':
    case 'toggleReady': {
      if (!me || room.phase !== 'lobby') return null;
      if (!me.team || !me.role) return null;
      const nextReady = a.ready !== undefined ? Boolean(a.ready) : !me.ready;
      if (me.ready === nextReady) return null;
      const players = room.players.map((p) => (p.id === me.id ? { ...p, ready: nextReady } : p));
      const nextRoom = { ...room, players };

      // Todos los jugadores de la sala deben tener equipo, rol asignado y estar listos
      const allAssigned = players.length >= 2 && players.every((p) => p.team && p.role);
      const allReady = allAssigned && players.every((p) => p.ready);
      if (allReady && startProblems(nextRoom).length === 0) {
        const next = { ...nextRoom, phase: 'playing', paused: false, pausedBy: null, chat: [] };
        return { ...next, timer: startTimer(next, 'clue', now) };
      }
      return nextRoom;
    }

    case 'start': {
      if (!me || room.phase !== 'lobby' || startProblems(room).length) return null;
      const next = { ...room, phase: 'playing', paused: false, pausedBy: null, chat: [] };
      return { ...next, timer: startTimer(next, 'clue', now) };
    }

    // La pausa congela todo: el reloj y cualquier jugada.
    case 'setPaused': {
      if (!me || room.phase !== 'playing' || room.winner) return null;
      const paused = a.paused === true;
      if (paused === (room.paused === true)) return null;
      let timer = room.timer;
      if (timer) {
        timer = paused
          ? { ...timer, left: Math.max(0, (timer.deadline ?? now) - now), deadline: null }
          : { ...timer, deadline: now + Math.max(0, timer.left ?? 0), left: null };
      }
      return { ...room, paused, pausedBy: paused ? me.name : null, timer };
    }

    case 'chat': {
      if (!me || !CHAT_SCOPES.includes(a.scope)) return null;
      let entry;
      if (a.scope === 'global') {
        if (!Number.isInteger(a.msg) || a.msg < 0 || a.msg >= CHAT_MESSAGES.length) return null;
        entry = { p: me.id, n: me.name, t: me.team || null, m: a.msg, s: 'global', at: now };
      } else {
        // El canal de equipo es solo entre agentes: el espía no entra.
        if (!(me.team && me.role === 'operative')) return null;
        const text = cleanChatText(a.text);
        if (!text) return null;
        entry = { p: me.id, n: me.name, t: me.team, x: text, s: 'team', at: now };
      }
      return { ...room, chat: trimChat([...room.chat, entry]) };
    }

    case 'clue': {
      if (!playing || a.round !== room.round || a.turn !== room.turn || room.clue) return null;
      if (!me || me.role !== 'spymaster' || me.team !== room.currentTeam) return null;
      const word = String(a.word ?? '').trim();
      if (clueProblem(room, word)) return null;
      if (numberProblem(room, me.team, a.number)) return null;
      const next = {
        ...room,
        clue: { team: me.team, word, number: a.number, guesses: 0 },
        votes: {},
        voteReset: 0,
        log: [{ team: me.team, word, number: a.number }, ...room.log].slice(0, MAX_LOG),
      };
      return { ...next, timer: startTimer(next, 'guess', now) };
    }

    // Cada agente confirma una casilla; cuando la mayoría del equipo coincide, queda elegida.
    case 'vote': {
      if (!playing || a.round !== room.round || a.turn !== room.turn || !room.clue) return null;
      if (!me || me.role !== 'operative' || me.team !== room.currentTeam) return null;
      const card = room.board[a.index];
      if (!card || card.revealed) return null;

      if (!room.options.instantReveal) {
        if (room.votes[a.index]?.includes(me.id)) return null;
        // Cada agente puede votar tantas casillas como intentos dio la pista, y no más.
        const mine = Object.values(room.votes).filter((ids) => ids.includes(me.id)).length;
        if (mine >= room.clue.number) return null;
        const next = { ...room, votes: { ...room.votes, [a.index]: [...(room.votes[a.index] || []), me.id] } };
        const picks = pickedCards({ ...next, clue: { ...room.clue, number: Infinity } });
        if (picks.length > room.clue.number) return null;
        return next;
      }

      // Al instante, el voto es definitivo: no se retira ni se mueve a otra casilla.
      if (Object.values(room.votes).some((ids) => ids.includes(me.id))) return null;

      const voters = [...(room.votes[a.index] || []), me.id];
      const votes = { ...room.votes, [a.index]: voters };
      const operatives = operativesOf(room, room.currentTeam).length;
      if (voters.length >= Math.floor(operatives / 2) + 1) return revealCard(room, a.index, now);
      const total = Object.values(votes).reduce((n, ids) => n + ids.length, 0);
      // Votaron todos y nadie llegó a la mayoría: se vuelve a votar.
      if (total >= operatives) return { ...room, votes: {}, voteReset: (room.voteReset || 0) + 1 };
      return { ...room, votes };
    }

    // Solo con revelado al terminar el turno: hasta que no se ve el resultado, se puede cancelar.
    case 'unvote': {
      if (!playing || room.options.instantReveal || a.round !== room.round || a.turn !== room.turn || !room.clue) return null;
      if (!me || me.role !== 'operative' || me.team !== room.currentTeam) return null;
      if (!room.votes[a.index]?.includes(me.id)) return null;
      const ids = room.votes[a.index].filter((id) => id !== me.id);
      const votes = { ...room.votes };
      if (ids.length) votes[a.index] = ids;
      else delete votes[a.index];
      return { ...room, votes };
    }

    case 'endTurn': {
      if (!playing || a.turn !== room.turn || !room.clue) return null;
      if (!me || me.role !== 'operative' || me.team !== room.currentTeam) return null;
      if (room.options.instantReveal) return room.clue.guesses < 1 ? null : passTurn(room, now);
      // Es la única forma de ver el resultado: se destapan todas las elegidas.
      const picks = pickedCards(room);
      return picks.length ? resolvePicks(room, picks, now) : null;
    }

    // Cualquier cliente puede avisar que se acabó el reloj; la transacción deja pasar solo al primero.
    case 'timeout': {
      if (!me || !playing || a.turn !== room.turn || a.round !== room.round) return null;
      if (!room.timer || !room.timer.deadline || now < room.timer.deadline) return null;
      // Si ya habían elegido casillas, se destapan: el tiempo se terminó, no la jugada.
      const picks = room.options.instantReveal ? [] : pickedCards(room);
      return picks.length ? resolvePicks(room, picks, now) : passTurn(room, now);
    }

    case 'newRound': {
      if (!me || room.phase !== 'playing' || !room.winner) return null;
      const next = withNewBoard(room, rand);
      return { ...next, timer: startTimer(next, 'clue', now) };
    }

    case 'toLobby':
      if (!me || room.phase !== 'playing') return null;
      return {
        ...withNewBoard(room, rand),
        phase: 'lobby',
        players: room.players.map((p) => ({ ...p, ready: false })),
      };

    default:
      return null;
  }
}

// Devuelve la sala nueva, o null si la acción no es válida para el estado actual.
export function applyAction(room, action, { rand = Math.random, now = Date.now() } = {}) {
  if (!room) return null;
  const current = normalizeRoom(room);
  const next = reduce(current, action, findPlayer(current, action.playerId), { rand, now });
  return next ? { ...next, updatedAt: now } : null;
}

// Rellena lo que pueda faltar (salas viejas guardadas antes de estos cambios).
export function normalizeRoom(room) {
  const options = normalizeOptions(room.options);
  const teams = Array.isArray(room.teams) && room.teams.length >= 2 ? room.teams : teamsFor(options.teamCount);
  return {
    ...room,
    options,
    teams,
    players: Array.isArray(room.players)
      ? room.players.map((p) => ({ ...p, ready: p.ready === true }))
      : [],
    eliminated: Array.isArray(room.eliminated) ? room.eliminated : [],
    chat: Array.isArray(room.chat) ? room.chat : [],
    votes: room.votes && typeof room.votes === 'object' && !Array.isArray(room.votes) ? room.votes : {},
    voteReset: Number.isInteger(room.voteReset) ? room.voteReset : 0,
    paused: room.paused === true,
    timer: room.timer && typeof room.timer === 'object' ? room.timer : null,
    hostId: room.hostId || room.players?.[0]?.id || null,
  };
}

const BOARD_SIZES = Object.keys(GRID_COLS).map((n) => boardSize(Number(n)));

export function parseRoom(value) {
  if (typeof value !== 'string') return null;
  try {
    const room = JSON.parse(value);
    if (!room || typeof room !== 'object') return null;
    if (room.gameType && room.gameType !== 'codigo-secreto') {
      return room;
    }
    if (room.teamState) {
      return room;
    }
    const valid = Array.isArray(room.board) && BOARD_SIZES.includes(room.board.length)
      && Array.isArray(room.players) && Array.isArray(room.log);
    return valid ? normalizeRoom(room) : null;
  } catch {
    return null;
  }
}

export function serializeRoom(room) {
  return JSON.stringify(room);
}
