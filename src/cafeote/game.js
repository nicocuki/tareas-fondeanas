// Lógica de juego de Café o Té (2v2)

export const DEFAULT_OPTIONS = {
  wordTime: 30, // 15, 30, 60 segundos
  mode: 'tiempo', // 'tiempo' | 'contador'
  showRivalCounter: true,
  wordType: 'concepto', // 'concepto' | 'palabra'
};

export function cleanName(name) {
  return (name || '').trim().slice(0, 16);
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function newRoom(hostId, hostName) {
  return {
    gameType: 'cafe-o-te',
    phase: 'lobby',
    hostId,
    options: { ...DEFAULT_OPTIONS },
    players: [
      { id: hostId, name: cleanName(hostName), team: 'red', role: 'pensador', ready: false },
    ],
    secretWord: '',
    secretWordSubmissions: {},
    secretChat: [], // [{ id, senderId, senderName, text, isSuggestion: boolean, likes: [playerId] }]
    startTime: null,
    winner: null,
    teamState: {
      red: createTeamState(),
      blue: createTeamState(),
    },
  };
}

function createTeamState() {
  return {
    chain: [
      { id: 'init', speaker: 'system', text: '¿Café o Té?' }
    ],
    turn: 'pensador',
    currentFixed: null,
    currentProposed: null,
    attempts: 0,
    solved: false,
    solvedTime: null,
    solvedAttempts: null,
  };
}

export function findPlayer(room, playerId) {
  return room?.players?.find((p) => p.id === playerId) || null;
}

export function isHost(room, playerId) {
  return room?.hostId === playerId;
}

export function applyAction(room, action) {
  if (!room) return room;
  const next = JSON.parse(JSON.stringify(room));

  switch (action.type) {
    case 'setOptions': {
      if (next.hostId !== action.playerId || next.phase !== 'lobby') return room;
      next.options = { ...next.options, ...action.options };
      return next;
    }

    case 'join': {
      if (next.phase !== 'lobby') return room;
      const clean = cleanName(action.name);
      if (!clean) return room;
      let player = next.players.find((p) => p.id === action.playerId);
      if (!player) {
        if (next.players.length >= 4) return room;
        player = { id: action.playerId, name: clean, team: null, role: null, ready: false };
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
      return next;
    }

    case 'pickRole': {
      if (next.phase !== 'lobby') return room;
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player) return room;

      const { team, role } = action;
      if (!['red', 'blue'].includes(team) || !['pensador', 'adivinador'].includes(role)) return room;

      const taken = next.players.find((p) => p.team === team && p.role === role && p.id !== action.playerId);
      if (taken) return room;

      player.team = team;
      player.role = role;
      player.ready = false;
      return next;
    }

    case 'startSecretPhase': {
      if (next.hostId !== action.playerId || next.phase !== 'lobby') return room;
      if (next.players.length < 4) return room;
      const allAssigned = next.players.every((p) => p.team && p.role);
      if (!allAssigned) return room;

      return initSecretPhase(next);
    }

    case 'pensadorChat': {
      if (next.phase !== 'secret_word') return room;
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player || player.role !== 'pensador') return room;

      const text = (action.text || '').trim();
      if (!text) return room;

      // Si es tipo 'palabra' sola y fue sugerencia, se valida que sea 1 sola palabra
      if (action.isSuggestion && next.options.wordType === 'palabra' && /\s/.test(text)) {
        return room;
      }

      next.secretChat.push({
        id: makeId(),
        senderId: player.id,
        senderName: player.name,
        text,
        isSuggestion: Boolean(action.isSuggestion),
        likes: [],
      });
      return next;
    }

    case 'pensadorLike': {
      if (next.phase !== 'secret_word') return room;
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player || player.role !== 'pensador') return room;

      const msg = next.secretChat.find((m) => m.id === action.msgId && m.isSuggestion);
      if (!msg) return room;

      if (!msg.likes.includes(player.id)) {
        msg.likes.push(player.id);
      } else {
        msg.likes = msg.likes.filter((id) => id !== player.id);
      }

      // Si la sugerencia tiene el me gusta del OTRO pensador (o de ambos pensadores)
      const pensadores = next.players.filter((p) => p.role === 'pensador');
      const otherPensador = pensadores.find((p) => p.id !== msg.senderId);

      // Se elige si el autor + el otro le dieron like, o si el otro le dio like
      if ((otherPensador && msg.likes.includes(otherPensador.id)) || (msg.likes.length >= 2)) {
        next.secretWord = msg.text;
        next.phase = 'playing';
        next.startTime = Date.now();
      }

      return next;
    }

    case 'forceStartGame': {
      if (next.phase !== 'secret_word') return room;
      const word = (action.word || '').trim() || (next.options.wordType === 'palabra' ? 'Árbol' : 'Ruedita del mouse');
      next.secretWord = word;
      next.phase = 'playing';
      next.startTime = Date.now();
      return next;
    }

    case 'pensadorChoose': {
      if (next.phase !== 'playing') return room;
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player || player.role !== 'pensador') return room;

      const team = player.team;
      const ts = next.teamState[team];
      if (ts.solved || ts.turn !== 'pensador') return room;

      const choice = (action.choice || '').trim();
      if (!choice) return room;

      if (!ts.currentFixed) {
        ts.currentFixed = choice;
        ts.chain.push({ id: makeId(), speaker: 'pensador', text: choice });
        ts.turn = 'adivinador';
        return checkWinner(next);
      }

      ts.currentFixed = choice;
      ts.chain.push({ id: makeId(), speaker: 'pensador', text: choice });

      const targetWord = next.secretWord.trim().toLowerCase();
      if (choice.trim().toLowerCase() === targetWord) {
        ts.solved = true;
        ts.solvedTime = Date.now() - (next.startTime || Date.now());
        ts.solvedAttempts = ts.attempts;
        return checkWinner(next);
      }

      ts.currentProposed = null;
      ts.turn = 'adivinador';
      return checkWinner(next);
    }

    case 'adivinadorPropose': {
      if (next.phase !== 'playing') return room;
      const player = next.players.find((p) => p.id === action.playerId);
      if (!player || player.role !== 'adivinador') return room;

      const team = player.team;
      const ts = next.teamState[team];
      if (ts.solved || ts.turn !== 'adivinador') return room;

      const proposal = (action.proposal || '').trim();
      if (!proposal) return room;

      ts.attempts += 1;
      ts.currentProposed = proposal;
      ts.chain.push({ id: makeId(), speaker: 'adivinador', text: proposal, fixed: ts.currentFixed });
      ts.turn = 'pensador';
      return checkWinner(next);
    }

    case 'toLobby': {
      next.phase = 'lobby';
      next.winner = null;
      next.secretWord = '';
      next.secretChat = [];
      next.teamState = {
        red: createTeamState(),
        blue: createTeamState(),
      };
      next.players.forEach((p) => { p.ready = false; });
      return next;
    }

    case 'restartGame': {
      return initSecretPhase(next);
    }

    default:
      return room;
  }
}

function initSecretPhase(room) {
  room.phase = 'secret_word';
  room.winner = null;
  room.secretWord = '';
  room.secretWordSubmissions = {};
  room.secretChat = [];
  room.secretWordTimer = Date.now() + room.options.wordTime * 1000;
  room.teamState = {
    red: createTeamState(),
    blue: createTeamState(),
  };
  return room;
}

function checkWinner(room) {
  const red = room.teamState.red;
  const blue = room.teamState.blue;

  if (!red.solved && !blue.solved) return room;

  const mode = room.options.mode; // 'tiempo' | 'contador'

  if (mode === 'tiempo') {
    // En modo tiempo: ¡El primero que la saca gana en el instante!
    if (red.solved && !blue.solved) room.winner = 'red';
    else if (blue.solved && !red.solved) room.winner = 'blue';
    else if (red.solved && blue.solved) {
      if (red.solvedTime <= blue.solvedTime) room.winner = 'red';
      else room.winner = 'blue';
    }
  } else {
    // En modo contador (intentos):
    if (red.solved && blue.solved) {
      if (red.solvedAttempts < blue.solvedAttempts) room.winner = 'red';
      else if (blue.solvedAttempts < red.solvedAttempts) room.winner = 'blue';
      else room.winner = 'tie';
    } else if (red.solved && !blue.solved) {
      // Si rojo resolvió en X intentos, y azul ya lleva más de X intentos -> Azul ya perdió
      if (blue.attempts > red.solvedAttempts) {
        room.winner = 'red';
      }
    } else if (blue.solved && !red.solved) {
      // Si azul resolvió en X intentos, y rojo ya lleva más de X intentos -> Rojo ya perdió
      if (red.attempts > blue.solvedAttempts) {
        room.winner = 'blue';
      }
    }
  }

  if (room.winner) {
    room.phase = 'ended';
  }

  return room;
}
