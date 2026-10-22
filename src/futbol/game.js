// Lógica de sala del juego de Fútbol (HaxBall-like)
// Solo maneja el estado de sala (fase, jugadores, puntaje).
// La física del partido corre en el cliente (FutbolGame.jsx + physics.js).
import { isKicked, kickTarget, markKicked } from '../lobby/kick.js';

export const DEFAULT_OPTIONS = {
  matchMinutes: 0,         // duración del partido en minutos (0 = ilimitado)
  goalsToWin: 0,           // goles para ganar (0 = ilimitado)
  mapType: 'cancha3',      // coches: 'cancha3', 'cancha5', 'cancha9', 'cancha11'
  stadium: 'classic',      // pelotas: un estadio de HaxBall (STADIUMS en haxball.js)
  vehicleMode: 'pelotas',  // 'pelotas' | 'coches'
  infiniteBoost: false,    // boolean: boost infinito en coches (default false)
};

export const MAX_PER_TEAM = 10;

export function cleanName(name) {
  return (name || '').trim().slice(0, 16);
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function newRoom(hostId, hostName) {
  const now = Date.now();
  return {
    gameType: 'futbol',
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [
      { id: hostId, name: cleanName(hostName), team: 'red' },
    ],
    score: { red: 0, blue: 0 },
    winner: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function findPlayer(room, playerId) {
  return room?.players?.find((p) => p.id === playerId) || null;
}

export function isHost(room, playerId) {
  return room?.hostId === playerId;
}

export function teamCount(room, team) {
  return room.players.filter((p) => p.team === team).length;
}

// Después de un partido cada uno vuelve a la sala cuando quiere (`back`). Los que siguen en la pantalla del
// final aparecen esperando, y no se arranca hasta que vuelvan todos (o se vayan).
export const waitingPlayers = (room) => (room?.phase === 'ended' ? room.players.filter((p) => !p.back) : []);

// Si ya volvieron todos, la sala pasa a la sala de espera de verdad.
function settleBack(next) {
  if (next.phase !== 'ended' || next.players.some((p) => !p.back)) return next;
  next.phase = 'lobby';
  next.score = { red: 0, blue: 0 };
  next.winner = null;
  for (const p of next.players) delete p.back;
  return next;
}

export function canStart(room) {
  if (room?.phase !== 'lobby' && !room?.isTrainingMode) return false;
  if (room?.isTrainingMode) return (room?.players?.length || 0) >= 1;
  return teamCount(room, 'red') >= 1 && teamCount(room, 'blue') >= 1;
}

export function applyAction(room, action) {
  if (!room) return room;
  // El anfitrión saca a alguien: es su `leave`, y con esa pantalla no puede volver a entrar.
  if (action.type === 'kick') {
    const target = kickTarget(room, action, ['lobby', 'ended']);
    const left = target && applyAction(room, { type: 'leave', playerId: target });
    return left && left !== room ? markKicked(left, target) : room;
  }
  if (action.type === 'join' && isKicked(room, action.playerId)) return room;
  const next = JSON.parse(JSON.stringify(room));
  next.updatedAt = Date.now();

  switch (action.type) {
    case 'join': {
      // Con el partido terminado también se puede entrar: va directo a la sala de espera.
      if (next.phase !== 'lobby' && next.phase !== 'ended') return room;
      const clean = cleanName(action.name);
      if (!clean) return room;
      let player = next.players.find((p) => p.id === action.playerId);
      if (!player) {
        // Sin equipo: lo pone en el equipo con menos gente (o rojo por defecto)
        const redCount = teamCount(next, 'red');
        const blueCount = teamCount(next, 'blue');
        const defaultTeam = blueCount < redCount ? 'blue' : 'red';
        if (teamCount(next, defaultTeam) >= MAX_PER_TEAM) return room;
        player = { id: action.playerId, name: clean, team: defaultTeam };
        if (next.phase === 'ended') player.back = true;
        next.players.push(player);
      } else {
        player.name = clean;
      }
      return next;
    }

    case 'leave': {
      next.players = next.players.filter((p) => p.id !== action.playerId);
      if (next.hostId === action.playerId && next.players.length > 0) {
        next.hostId = next.players[0].id;
      }
      return settleBack(next);
    }

    case 'pickTeam': {
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player || !(next.phase === 'lobby' || (next.phase === 'ended' && player.back))) return room;
      const { team } = action;
      if (!['red', 'blue'].includes(team)) return room;
      if (player.team === team) return room;
      if (teamCount(next, team) >= MAX_PER_TEAM) return room;
      player.team = team;
      return next;
    }

    case 'setOptions': {
      const host = findPlayer(next, action.playerId);
      if (next.hostId !== action.playerId || !(next.phase === 'lobby' || (next.phase === 'ended' && host?.back))) return room;
      next.options = { ...next.options, ...action.options };
      return next;
    }

    case 'startGame': {
      if (next.hostId !== action.playerId || next.phase !== 'lobby') return room;
      if (!canStart(next)) return room;
      next.phase = 'playing';
      next.score = { red: 0, blue: 0 };
      next.winner = null;
      // Identifica este partido en la sincronización en tiempo real (futbol/{sala}): lo que haya
      // quedado de un partido anterior se ignora.
      next.matchNumber = (next.matchNumber || 0) + 1;
      next.lastGoalKickoff = -1;
      return next;
    }

    case 'goalScored': {
      // Lo manda la pantalla que tenía la pelota cuando entró en un arco.
      if (next.phase !== 'playing') return room;
      const { team, kickoff } = action; // equipo que anotó y saque en el que fue
      if (!['red', 'blue'].includes(team)) return room;
      // Un gol por saque: si el mismo gol llega dos veces, cuenta una.
      if (Number.isInteger(kickoff)) {
        if (kickoff <= (next.lastGoalKickoff ?? -1)) return room;
        next.lastGoalKickoff = kickoff;
      }
      next.score[team] = (next.score[team] || 0) + 1;
      return next;
    }

    case 'endGame': {
      if (next.phase !== 'playing') return room;
      const red = next.score.red;
      const blue = next.score.blue;
      if (red > blue) next.winner = 'red';
      else if (blue > red) next.winner = 'blue';
      else next.winner = 'tie';
      next.phase = 'ended';
      return next;
    }

    // El que aprieta «Volver al lobby» al terminar el partido: vuelve solo él.
    case 'backToLobby': {
      const player = findPlayer(next, action.playerId);
      if (next.phase !== 'ended' || !player || player.back) return room;
      player.back = true;
      return settleBack(next);
    }

    // «Volver a la sala» con el partido en juego (menú de pausa): vuelven todos.
    case 'toLobby': {
      next.phase = 'lobby';
      next.score = { red: 0, blue: 0 };
      next.winner = null;
      for (const p of next.players) delete p.back;
      return next;
    }

    default:
      return room;
  }
}
