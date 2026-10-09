import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_BUDGET, CHAT_MESSAGES, DEFAULT_OPTIONS, MAX_CHAT_TEXT, MAX_TEAM_CHAT, WORD_POOL,
  applyAction, boardSize, clueProblem, generateBoard, majorityFor, neutralCount, newRoom,
  normalizeOptions, numberProblem, pickedCards, remaining, serializeRoom, shuffle, startProblems, teamsFor,
} from '../src/codigo-secreto/game.js';

const ROSTER = {
  red: [['rs', 'Rosa', 'spymaster'], ['ro', 'Rodo', 'operative']],
  blue: [['bs', 'Bea', 'spymaster'], ['bo', 'Beto', 'operative']],
  yellow: [['ys', 'Yaco', 'spymaster'], ['yo', 'Yani', 'operative']],
  green: [['gs', 'Gala', 'spymaster'], ['go', 'Gonza', 'operative']],
};

// Sala lista para jugar: el anfitrión es 'rs' y cada equipo tiene espía y agente.
function buildRoom({ options, extraOperatives = [] } = {}) {
  let room = newRoom('rs', 'Rosa');
  if (options) room = applyAction(room, { type: 'setOptions', playerId: 'rs', options });
  const teams = teamsFor(room.options.teamCount);
  for (const team of teams) {
    for (const [id, name] of ROSTER[team]) {
      if (id !== 'rs') room = applyAction(room, { type: 'join', playerId: id, name });
    }
  }
  for (const [id, name] of extraOperatives) {
    room = applyAction(room, { type: 'join', playerId: id, name });
  }
  for (const team of teams) {
    for (const [id, , role] of ROSTER[team]) {
      room = applyAction(room, { type: 'pickRole', playerId: id, team, role });
    }
  }
  for (const [id] of extraOperatives) {
    room = applyAction(room, { type: 'pickRole', playerId: id, team: 'red', role: 'operative' });
  }
  return applyAction(room, { type: 'start', playerId: 'rs' });
}

// El equipo que abre sale al azar. Los tests se apoyan en que rojo empiece (y tenga sus 9
// palabras), así que se rearma la sala hasta que le toque: forzar currentTeam a mano dejaba
// el tablero inconsistente con el reparto.
function playingRoom(opts) {
  for (let i = 0; i < 500; i++) {
    const room = buildRoom(opts);
    if (room.currentTeam === 'red') return room;
  }
  throw new Error('no se consiguió una sala que empiece con rojo');
}

// Tiene que ser una palabra que no exista en el pozo, si no el tablero puede contenerla
// y la pista queda rechazada (ver el test de más abajo).
const CLUE_WORD = 'zarpadisimo';
const clue = (room, playerId, number = 1, word = CLUE_WORD) =>
  applyAction(room, { type: 'clue', playerId, word, number, round: room.round, turn: room.turn });
const vote = (room, playerId, index) =>
  applyAction(room, { type: 'vote', playerId, index, round: room.round, turn: room.turn });
const unvote = (room, playerId, index) =>
  applyAction(room, { type: 'unvote', playerId, index, round: room.round, turn: room.turn });
const endTurn = (room, playerId) => applyAction(room, { type: 'endTurn', playerId, turn: room.turn });
const indexOf = (room, team, skip = 0) =>
  room.board.map((c, i) => [c, i]).filter(([c]) => c.team === team && !c.revealed)[skip][1];

test('el pozo de palabras no tiene repetidas y alcanza para el tablero más grande', () => {
  assert.equal(new Set(WORD_POOL).size, WORD_POOL.length);
  assert.ok(!WORD_POOL.includes(CLUE_WORD), 'la pista de los tests no puede estar en el pozo');
  assert.ok(WORD_POOL.length > 500);
  assert.ok(WORD_POOL.length >= boardSize(4));
});

test('el tablero tiene palabras distintas y el reparto correcto', () => {
  for (let i = 0; i < 200; i++) {
    const { board, startingTeam } = generateBoard();
    assert.equal(board.length, 25);
    assert.equal(new Set(board.map((c) => c.word)).size, 25);
    const other = startingTeam === 'red' ? 'blue' : 'red';
    assert.equal(remaining(board, startingTeam), 9);
    assert.equal(remaining(board, other), 8);
    assert.equal(board.filter((c) => c.team === 'neutral').length, 7);
    assert.equal(board.filter((c) => c.team === 'assassin').length, 1);
  }
});

test('más equipos = más palabras, pero las de cada equipo no cambian', () => {
  for (const teamCount of [2, 3, 4]) {
    for (const bombs of [1, 3, 5]) {
      const options = normalizeOptions({ ...DEFAULT_OPTIONS, teamCount, bombs });
      const { board, startingTeam, teams } = generateBoard(options);
      assert.equal(board.length, boardSize(teamCount));
      assert.equal(new Set(board.map((c) => c.word)).size, board.length);
      assert.equal(teams.length, teamCount);
      for (const team of teams) assert.equal(remaining(board, team), team === startingTeam ? 9 : 8);
      assert.equal(board.filter((c) => c.team === 'assassin').length, bombs);
      assert.equal(board.filter((c) => c.team === 'neutral').length, neutralCount(options));
      assert.ok(neutralCount(options) >= 0);
    }
  }
});

test('la mezcla es uniforme (el asesino cae en cualquier casilla)', () => {
  const counts = Array(25).fill(0);
  const items = [...Array(24).fill('x'), 'assassin'];
  const n = 100000;
  for (let i = 0; i < n; i++) counts[shuffle(items).indexOf('assassin')]++;
  for (const c of counts) assert.ok(Math.abs(c / n - 0.04) < 0.005, `frecuencia ${c / n}`);
});

test('dos jugadores que entran a la vez quedan los dos (transacción)', () => {
  const room = newRoom('a', 'Ana');
  const afterB = applyAction(room, { type: 'join', playerId: 'b', name: 'Bruno' });
  const afterC = applyAction(afterB, { type: 'join', playerId: 'c', name: 'Caro' });
  assert.deepEqual(afterC.players.map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(afterC.hostId, 'a');
});

test('no se puede iniciar sin espía y agente en cada equipo', () => {
  const room = newRoom('a', 'Ana');
  assert.equal(startProblems(room).length, 4);
  assert.equal(applyAction(room, { type: 'start', playerId: 'a' }), null);
});

test('solo hay un espía maestro por equipo', () => {
  let room = newRoom('a', 'Ana');
  room = applyAction(room, { type: 'join', playerId: 'b', name: 'Bruno' });
  room = applyAction(room, { type: 'pickRole', playerId: 'a', team: 'red', role: 'spymaster' });
  assert.equal(applyAction(room, { type: 'pickRole', playerId: 'b', team: 'red', role: 'spymaster' }), null);
});

// ---------- modificadores del lobby ----------

test('solo el anfitrión cambia los modificadores, y solo en el lobby', () => {
  let room = newRoom('a', 'Ana');
  room = applyAction(room, { type: 'join', playerId: 'b', name: 'Bruno' });
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'b', options: { bombs: 3 } }), null);
  room = applyAction(room, { type: 'setOptions', playerId: 'a', options: { bombs: 3 } });
  assert.equal(room.options.bombs, 3);
  assert.equal(room.board.filter((c) => c.team === 'assassin').length, 3);

  const playing = playingRoom();
  assert.equal(applyAction(playing, { type: 'setOptions', playerId: 'rs', options: { bombs: 2 } }), null);
});

test('bajar la cantidad de equipos saca a los jugadores de los equipos que ya no existen', () => {
  let room = newRoom('a', 'Ana');
  room = applyAction(room, { type: 'join', playerId: 'b', name: 'Bruno' });
  room = applyAction(room, { type: 'setOptions', playerId: 'a', options: { teamCount: 4 } });
  room = applyAction(room, { type: 'pickRole', playerId: 'b', team: 'green', role: 'operative' });
  assert.equal(room.board.length, 49);
  room = applyAction(room, { type: 'setOptions', playerId: 'a', options: { teamCount: 2 } });
  assert.equal(room.board.length, 25);
  assert.equal(room.players.find((p) => p.id === 'b').team, null);
});

test('los modificadores inválidos se descartan', () => {
  const o = normalizeOptions({ teamCount: 9, bombs: 99, clueMinutes: 7, instantReveal: 'no' });
  assert.equal(o.teamCount, 2);
  assert.equal(o.bombs, 1);
  assert.equal(o.clueMinutes, 0);
  assert.equal(o.instantReveal, true);
});

// ---------- pistas ----------

test('la pista no puede ser una palabra del tablero, ni tener espacios, ni ser vacía', () => {
  const room = playingRoom();
  assert.ok(clueProblem(room, room.board[0].word.toUpperCase()));
  assert.ok(clueProblem(room, 'dos palabras'));
  assert.ok(clueProblem(room, '   '));
  assert.ok(clueProblem(room, '●●●'), 'una pista sin letras no sirve');
  assert.ok(clueProblem(room, '-'));
  assert.equal(clueProblem(room, 'zarpado'), null);
  assert.equal(clueProblem(room, 'ñandú'), null);
  assert.equal(clueProblem(room, '7'), null);
});

test('una palabra del tablero sigue prohibida después de destaparse', () => {
  let room = clue(playingRoom(), 'rs', 1);
  const idx = indexOf(room, 'red');
  const word = room.board[idx].word;
  room = vote(room, 'ro', idx);
  assert.ok(room.board[idx].revealed);
  assert.ok(clueProblem(room, word));
});

test('el número no puede ser 0, ni infinito, ni mayor a lo que le queda al equipo', () => {
  const room = playingRoom();
  assert.ok(numberProblem(room, 'red', 0));
  assert.ok(numberProblem(room, 'red', -1));
  assert.ok(numberProblem(room, 'red', 'inf'));
  assert.ok(numberProblem(room, 'red', 10));
  assert.equal(numberProblem(room, 'red', 9), null);
  assert.equal(clue(room, 'rs', 0), null);
  assert.equal(clue(room, 'rs', 10), null);
  assert.equal(clue(room, 'rs', 'inf'), null);
});

test('el espía no puede dar dos pistas', () => {
  const room = clue(playingRoom(), 'rs', 2);
  assert.ok(room);
  assert.equal(clue(room, 'rs', 1, 'otra'), null);
});

test('la pista N da exactamente N intentos', () => {
  let room = clue(playingRoom(), 'rs', 2);
  room = vote(room, 'ro', indexOf(room, 'red'));
  assert.equal(room.currentTeam, 'red');
  room = vote(room, 'ro', indexOf(room, 'red'));
  assert.equal(room.currentTeam, 'blue');
  assert.equal(room.clue, null);
});

test('con pista 1 hay un solo intento', () => {
  let room = clue(playingRoom(), 'rs', 1);
  room = vote(room, 'ro', indexOf(room, 'red'));
  assert.equal(room.currentTeam, 'blue');
});

test('los agentes no pueden destapar antes de la pista', () => {
  const room = playingRoom();
  assert.equal(vote(room, 'ro', indexOf(room, 'red')), null);
});

// ---------- qué pasa al fallar ----------

test('por defecto, tocar una neutral o una del rival termina el turno', () => {
  let room = clue(playingRoom(), 'rs', 3);
  assert.equal(vote(room, 'ro', indexOf(room, 'neutral')).currentTeam, 'blue');
  room = clue(playingRoom(), 'rs', 3);
  assert.equal(vote(room, 'ro', indexOf(room, 'blue')).currentTeam, 'blue');
});

test('con la opción activada, una neutral no corta los intentos', () => {
  let room = clue(playingRoom({ options: { keepAfterNeutral: true } }), 'rs', 3);
  room = vote(room, 'ro', indexOf(room, 'neutral'));
  assert.equal(room.currentTeam, 'red');
  assert.equal(room.clue.guesses, 1);
  // pero la del rival sí, porque esa opción quedó apagada
  room = vote(room, 'ro', indexOf(room, 'blue'));
  assert.equal(room.currentTeam, 'blue');
});

test('con la opción activada, una del equipo contrario no corta los intentos', () => {
  let room = clue(playingRoom({ options: { keepAfterOpponent: true } }), 'rs', 3);
  room = vote(room, 'ro', indexOf(room, 'blue'));
  assert.equal(room.currentTeam, 'red');
  room = vote(room, 'ro', indexOf(room, 'neutral'));
  assert.equal(room.currentTeam, 'blue');
});

test('aunque se sigan los intentos, el límite de la pista se respeta', () => {
  let room = clue(playingRoom({ options: { keepAfterNeutral: true } }), 'rs', 2);
  room = vote(room, 'ro', indexOf(room, 'neutral'));
  room = vote(room, 'ro', indexOf(room, 'neutral'));
  assert.equal(room.currentTeam, 'blue');
});

// ---------- bombas y victoria ----------

test('la bomba hace ganar al otro equipo cuando son dos', () => {
  let room = clue(playingRoom(), 'rs', 1);
  room = vote(room, 'ro', indexOf(room, 'assassin'));
  assert.equal(room.winner, 'blue');
  assert.equal(room.winReason, 'assassin');
});

test('con tres equipos, la bomba elimina al que la toca y el juego sigue', () => {
  let room = clue(playingRoom({ options: { teamCount: 3 } }), 'rs', 1);
  room = vote(room, 'ro', indexOf(room, 'assassin'));
  assert.deepEqual(room.eliminated, ['red']);
  assert.equal(room.winner, null);
  assert.equal(room.currentTeam, 'blue');
  // el turno saltea al equipo eliminado
  room = clue(room, 'bs', 1);
  room = vote(room, 'bo', indexOf(room, 'neutral'));
  assert.equal(room.currentTeam, 'yellow');
  room = clue(room, 'ys', 1);
  room = vote(room, 'yo', indexOf(room, 'neutral'));
  assert.equal(room.currentTeam, 'blue');
});

test('si te destapan tu última palabra, ganás aunque no sea tu turno', () => {
  let room = playingRoom();
  const blueCards = room.board.map((c, i) => [c, i]).filter(([c]) => c.team === 'blue').map(([, i]) => i);
  room = { ...room, board: room.board.map((c, i) => (c.team === 'blue' && i !== blueCards[0] ? { ...c, revealed: true } : c)) };
  room = clue(room, 'rs', 1);
  room = vote(room, 'ro', blueCards[0]);
  assert.equal(room.winner, 'blue');
  assert.equal(room.winReason, 'complete');
});

// ---------- votación ----------

test('con un solo agente, confirmar destapa al toque', () => {
  const room = clue(playingRoom(), 'rs', 2);
  assert.equal(majorityFor(room, 'red'), 1);
  const idx = indexOf(room, 'red');
  assert.ok(vote(room, 'ro', idx).board[idx].revealed);
});

test('con tres agentes hace falta la mayoría', () => {
  let room = clue(playingRoom({ extraOperatives: [['r2', 'Rita'], ['r3', 'Raúl']] }), 'rs', 3);
  assert.equal(majorityFor(room, 'red'), 2);
  const idx = indexOf(room, 'red');
  room = vote(room, 'ro', idx);
  assert.deepEqual(room.votes[idx], ['ro']);
  assert.equal(room.board[idx].revealed, false);
  room = vote(room, 'r2', idx);
  assert.equal(room.board[idx].revealed, true);
  assert.deepEqual(room.votes, {});
});

test('el voto es definitivo: no se cambia ni se repite', () => {
  let room = clue(playingRoom({ extraOperatives: [['r2', 'Rita'], ['r3', 'Raúl']] }), 'rs', 3);
  const a = indexOf(room, 'red');
  const b = indexOf(room, 'red', 1);
  room = vote(room, 'ro', a);
  assert.equal(vote(room, 'ro', b), null);
  assert.equal(vote(room, 'ro', a), null);
});

test('si votan todos y nadie llega a la mayoría, se vuelve a votar', () => {
  let room = clue(playingRoom({ extraOperatives: [['r2', 'Rita'], ['r3', 'Raúl']] }), 'rs', 3);
  room = vote(room, 'ro', indexOf(room, 'red'));
  room = vote(room, 'r2', indexOf(room, 'red', 1));
  room = vote(room, 'r3', indexOf(room, 'neutral'));
  assert.deepEqual(room.votes, {});
  assert.equal(room.voteReset, 1);
  assert.equal(room.board.filter((c) => c.revealed).length, 0);
});

test('el espía no vota y el agente del otro equipo tampoco', () => {
  const room = clue(playingRoom(), 'rs', 2);
  assert.equal(vote(room, 'rs', indexOf(room, 'red')), null);
  assert.equal(vote(room, 'bo', indexOf(room, 'red')), null);
});

test('terminar turno exige al menos un intento', () => {
  let room = clue(playingRoom(), 'rs', 3);
  assert.equal(applyAction(room, { type: 'endTurn', playerId: 'ro', turn: room.turn }), null);
  room = vote(room, 'ro', indexOf(room, 'red'));
  room = applyAction(room, { type: 'endTurn', playerId: 'ro', turn: room.turn });
  assert.equal(room.currentTeam, 'blue');
});

// ---------- revelado al terminar el turno ----------

const DEFERRED = { options: { instantReveal: false } };
const TRIO = [['r2', 'Rita'], ['r3', 'Raúl']];

test('al terminar el turno: elegir no destapa, ni siquiera al llegar al número de la pista', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 2);
  const a = indexOf(room, 'red');
  const b = indexOf(room, 'neutral');
  room = vote(room, 'ro', a);
  room = vote(room, 'ro', b);
  assert.deepEqual(pickedCards(room), [a, b].sort((x, y) => x - y));
  assert.equal(room.board.filter((c) => c.revealed).length, 0);
  assert.equal(room.currentTeam, 'red');
  assert.equal(room.clue.guesses, 0);
});

test('al terminar el turno: se puede cancelar una elegida y cambiarla por otra', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 1);
  const a = indexOf(room, 'neutral');
  const b = indexOf(room, 'red');
  room = vote(room, 'ro', a);
  assert.equal(vote(room, 'ro', b), null, 'con pista 1 no se puede elegir una segunda');
  room = unvote(room, 'ro', a);
  assert.deepEqual(pickedCards(room), []);
  room = vote(room, 'ro', b);
  assert.deepEqual(pickedCards(room), [b]);
  assert.equal(unvote(room, 'ro', a), null, 'no se cancela lo que no votaste');
});

test('al terminar el turno: solo «Terminar turno» destapa, y destapa todas juntas', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 3);
  assert.equal(endTurn(room, 'ro'), null, 'sin elegir nada no se puede terminar');
  const picks = [indexOf(room, 'red'), indexOf(room, 'red', 1), indexOf(room, 'neutral')];
  for (const i of picks) room = vote(room, 'ro', i);
  room = endTurn(room, 'ro');
  for (const i of picks) assert.equal(room.board[i].revealed, true);
  assert.equal(remaining(room.board, 'red'), 7);
  assert.equal(room.currentTeam, 'blue');
  assert.deepEqual(room.votes, {});
});

test('al terminar el turno: el turno pasa aunque todas fueran propias', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 2);
  room = vote(room, 'ro', indexOf(room, 'red'));
  // la primera sigue sin destapar, así que la segunda propia es la de índice 1
  room = endTurn(vote(room, 'ro', indexOf(room, 'red', 1)), 'ro');
  assert.equal(room.currentTeam, 'blue');
});

test('al terminar el turno: si entre las elegidas hay una bomba, pierde el equipo', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 2);
  room = vote(room, 'ro', indexOf(room, 'red'));
  room = vote(room, 'ro', indexOf(room, 'assassin'));
  assert.equal(room.winner, null, 'todavía no pasó nada');
  room = endTurn(room, 'ro');
  assert.equal(room.winner, 'blue');
  assert.equal(room.winReason, 'assassin');
});

test('al terminar el turno: completar las propias gana al destaparlas', () => {
  let room = clue(playingRoom(DEFERRED), 'rs', 2);
  const reds = room.board.map((c, i) => [c, i]).filter(([c]) => c.team === 'red').map(([, i]) => i);
  room = { ...room, board: room.board.map((c, i) => (reds.slice(2).includes(i) ? { ...c, revealed: true } : c)) };
  room = vote(vote(room, 'ro', reds[0]), 'ro', reds[1]);
  assert.equal(room.winner, null);
  room = endTurn(room, 'ro');
  assert.equal(room.winner, 'red');
});

test('al terminar el turno: si se acaba el reloj, se destapa lo elegido', () => {
  const t0 = 1_000_000;
  let room = clue(playingRoom({ options: { instantReveal: false, guessMinutes: 1 } }), 'rs', 2);
  room = { ...room, timer: { kind: 'guess', deadline: t0, left: null } };
  const idx = indexOf(room, 'red');
  room = vote(room, 'ro', idx);
  room = applyAction(room, { type: 'timeout', playerId: 'bo', round: room.round, turn: room.turn }, { now: t0 + 1 });
  assert.equal(room.board[idx].revealed, true);
  assert.equal(room.currentTeam, 'blue');
});

test('al terminar el turno: con varios agentes cada uno vota varias y puede cancelar', () => {
  let room = clue(playingRoom({ ...DEFERRED, extraOperatives: TRIO }), 'rs', 2);
  const a = indexOf(room, 'red');
  const b = indexOf(room, 'red', 1);
  const c = indexOf(room, 'neutral');
  room = vote(room, 'ro', a);
  room = vote(room, 'ro', b);
  assert.equal(vote(room, 'ro', c), null, 'cada agente vota como mucho tantas como la pista');
  assert.deepEqual(pickedCards(room), [], 'con 1 de 3 votos todavía no está elegida');
  room = vote(room, 'r2', a);
  assert.deepEqual(pickedCards(room), [a], 'con 2 de 3 queda elegida');
  room = unvote(room, 'r2', a);
  assert.deepEqual(pickedCards(room), [], 'si alguien cancela, deja de estar elegida');
  assert.deepEqual(room.votes[a], ['ro']);
  assert.equal(room.voteReset, 0, 'acá no hay reinicio de votos: se pueden cancelar');
});

test('al terminar el turno: el equipo no puede elegir más casillas que intentos', () => {
  let room = clue(playingRoom({ ...DEFERRED, extraOperatives: TRIO }), 'rs', 1);
  const a = indexOf(room, 'red');
  const b = indexOf(room, 'red', 1);
  room = vote(vote(room, 'ro', a), 'r2', a);
  room = vote(room, 'r3', b);
  assert.equal(vote(room, 'r2', b), null, 'b sería la segunda elegida con pista 1');
  // con revelado al instante, en cambio, los votos no se cancelan
  const instant = vote(clue(playingRoom({ extraOperatives: TRIO }), 'rs', 2), 'ro', a);
  assert.equal(unvote(instant, 'ro', a), null);
});

// ---------- pausa ----------

test('la pausa congela las jugadas hasta que alguien la saca', () => {
  let room = clue(playingRoom(), 'rs', 2);
  room = applyAction(room, { type: 'setPaused', playerId: 'bo', paused: true });
  assert.equal(room.paused, true);
  assert.equal(room.pausedBy, 'Beto');
  assert.equal(vote(room, 'ro', indexOf(room, 'red')), null);
  assert.equal(applyAction(room, { type: 'setPaused', playerId: 'ro', paused: true }), null);
  room = applyAction(room, { type: 'setPaused', playerId: 'ro', paused: false });
  assert.equal(room.paused, false);
  assert.ok(vote(room, 'ro', indexOf(room, 'red')));
});

// ---------- reloj ----------

test('el reloj arranca al empezar y cambia al dar la pista', () => {
  const t0 = 1_000_000;
  let room = playingRoom({ options: { clueMinutes: 2, guessMinutes: 1 } });
  room = applyAction(room, { type: 'start', playerId: 'rs' }, { now: t0 }) || room;
  room = applyAction(room, { type: 'clue', playerId: 'rs', word: 'zarpado', number: 2, round: room.round, turn: room.turn }, { now: t0 });
  assert.equal(room.timer.kind, 'guess');
  assert.equal(room.timer.deadline, t0 + 60000);
});

test('cuando se acaba el reloj pasa el turno, y no antes', () => {
  const t0 = 1_000_000;
  let room = playingRoom({ options: { clueMinutes: 1 } });
  room = { ...room, timer: { kind: 'clue', deadline: t0 + 60000, left: null } };
  const early = { type: 'timeout', playerId: 'ro', round: room.round, turn: room.turn };
  assert.equal(applyAction(room, early, { now: t0 }), null);
  const after = applyAction(room, early, { now: t0 + 60001 });
  assert.equal(after.currentTeam, 'blue');
});

test('la pausa detiene el reloj y al reanudar devuelve lo que quedaba', () => {
  const t0 = 1_000_000;
  let room = playingRoom({ options: { clueMinutes: 2 } });
  room = { ...room, timer: { kind: 'clue', deadline: t0 + 120000, left: null } };
  room = applyAction(room, { type: 'setPaused', playerId: 'ro', paused: true }, { now: t0 + 20000 });
  assert.equal(room.timer.left, 100000);
  assert.equal(room.timer.deadline, null);
  room = applyAction(room, { type: 'setPaused', playerId: 'ro', paused: false }, { now: t0 + 500000 });
  assert.equal(room.timer.deadline, t0 + 600000);
});

// ---------- chat ----------

test('el chat solo acepta mensajes de la lista', () => {
  let room = playingRoom();
  assert.equal(applyAction(room, { type: 'chat', playerId: 'ro', scope: 'global', msg: 99 }), null);
  assert.equal(applyAction(room, { type: 'chat', playerId: 'ro', scope: 'otro', msg: 0 }), null);
  room = applyAction(room, { type: 'chat', playerId: 'ro', scope: 'global', msg: 2 });
  assert.equal(room.chat.length, 1);
  assert.equal(CHAT_MESSAGES[room.chat[0].m], 'Mish');
  assert.equal(room.chat[0].t, 'red');
});

const teamChat = (room, playerId, text) => applyAction(room, { type: 'chat', playerId, scope: 'team', text });

test('el canal de equipo es solo para agentes: el espía no entra', () => {
  const room = playingRoom();
  assert.equal(teamChat(room, 'rs', 'vamos por playa'), null);
  assert.ok(applyAction(room, { type: 'chat', playerId: 'rs', scope: 'global', msg: 0 }));
  assert.ok(teamChat(room, 'ro', 'vamos por playa'));
});

test('en el canal de equipo se escribe libre', () => {
  let room = teamChat(playingRoom(), 'ro', '  yo iría por   \n  castillo  ');
  assert.equal(room.chat[0].x, 'yo iría por castillo');
  assert.equal(room.chat[0].t, 'red');
  assert.equal(room.chat[0].s, 'team');
  // se pueden nombrar palabras del tablero: para eso está el canal
  room = teamChat(room, 'ro', room.board[0].word);
  assert.equal(room.chat[1].x, room.board[0].word);
});

test('el texto del equipo se corta y no acepta mensajes vacíos', () => {
  const room = playingRoom();
  assert.equal(teamChat(room, 'ro', '   \n  '), null);
  assert.equal(teamChat(room, 'ro', undefined), null);
  // un mensaje rápido no sirve en el canal de equipo, y texto libre no sirve en el global
  assert.equal(applyAction(room, { type: 'chat', playerId: 'ro', scope: 'team', msg: 0 }), null);
  assert.equal(applyAction(room, { type: 'chat', playerId: 'ro', scope: 'global', text: 'hola' }), null);
  const long = teamChat(room, 'ro', 'a'.repeat(500));
  assert.equal(long.chat[0].x.length, MAX_CHAT_TEXT);
  // los emojis no se parten al medio
  const emoji = teamChat(room, 'ro', '😀'.repeat(500));
  assert.equal(Array.from(emoji.chat[0].x).length, MAX_CHAT_TEXT);
  assert.ok(emoji.chat[0].x.endsWith('😀'));
});

test('el chat no crece sin límite', () => {
  let room = playingRoom();
  for (let i = 0; i < 50; i++) room = applyAction(room, { type: 'chat', playerId: 'ro', scope: 'global', msg: i % 4 });
  assert.equal(room.chat.length, 30);
});

test('lo que charla un equipo no borra el chat global', () => {
  let room = applyAction(playingRoom(), { type: 'chat', playerId: 'bo', scope: 'global', msg: 1 });
  for (let i = 0; i < 60; i++) room = teamChat(room, 'ro', `mensaje ${i}`);
  assert.equal(room.chat.filter((c) => c.s === 'global').length, 1);
  assert.equal(room.chat.filter((c) => c.s === 'team').length, MAX_TEAM_CHAT);
  assert.equal(room.chat.at(-1).x, 'mensaje 59');
});

test('ni con cuatro equipos escribiendo al máximo la sala pasa el límite de la base', () => {
  let room = newRoom('h', 'Anfitrion');
  room = applyAction(room, { type: 'setOptions', playerId: 'h', options: { teamCount: 4, bombs: 5 } });
  const teams = teamsFor(4);
  for (let i = 1; i < 20; i++) room = applyAction(room, { type: 'join', playerId: `jugador_${i}`, name: `NombreLargoDe20Ch${i}` });
  room.players.forEach((p, i) => {
    room = applyAction(room, { type: 'pickRole', playerId: p.id, team: teams[i % 4], role: i < 4 ? 'spymaster' : 'operative' });
  });
  room = applyAction(room, { type: 'start', playerId: 'h' });
  // comillas y barras se escapan al serializar: es el texto que más pesa
  const heavy = '"\\'.repeat(MAX_CHAT_TEXT);
  for (let i = 0; i < 100; i++) {
    for (const p of room.players.filter((pl) => pl.role === 'operative').slice(0, 4)) room = teamChat(room, p.id, heavy);
    room = applyAction(room, { type: 'chat', playerId: 'jugador_5', scope: 'global', msg: i % 4 });
  }
  room = { ...room, log: Array.from({ length: 40 }, () => ({ team: 'green', word: 'x'.repeat(24), number: 9 })) };
  assert.ok(JSON.stringify(room.chat).length <= CHAT_BUDGET);
  assert.ok(serializeRoom(room).length < 30000, `la sala pesa ${serializeRoom(room).length}`);
});

// ---------- varios ----------

test('una jugada de un turno o ronda vieja se descarta', () => {
  let room = clue(playingRoom(), 'rs', 3);
  const stale = { type: 'vote', playerId: 'ro', index: indexOf(room, 'red'), round: room.round, turn: room.turn };
  room = vote(room, 'ro', indexOf(room, 'neutral'));
  room = clue(room, 'bs', 1);
  assert.equal(applyAction(room, stale), null);
  const oldRound = { ...stale, turn: room.turn, round: room.round - 1 };
  assert.equal(applyAction(room, { ...oldRound, playerId: 'bo' }), null);
});

test('durante la partida un espía no puede pasarse a agente', () => {
  const room = playingRoom();
  assert.equal(applyAction(room, { type: 'pickRole', playerId: 'rs', team: 'red', role: 'operative' }), null);
});

test('nueva ronda solo con ganador, y volver a la sala resetea el tablero', () => {
  let room = playingRoom();
  assert.equal(applyAction(room, { type: 'newRound', playerId: 'rs' }), null);
  const lobby = applyAction(room, { type: 'toLobby', playerId: 'bo' });
  assert.equal(lobby.phase, 'lobby');
  assert.notDeepEqual(lobby.board, room.board);
  assert.equal(lobby.players.length, 4);
});

test('si se va el anfitrión, el mando pasa a otro jugador', () => {
  let room = newRoom('a', 'Ana');
  room = applyAction(room, { type: 'join', playerId: 'b', name: 'Bruno' });
  room = applyAction(room, { type: 'leave', playerId: 'a' });
  assert.equal(room.hostId, 'b');
  assert.ok(applyAction(room, { type: 'setOptions', playerId: 'b', options: { bombs: 2 } }));
});

test('sistema de listo: cambiar de rol resetea listo y cuando todos ponen listo arranca la partida', () => {
  let room = newRoom('rs', 'Rosa');
  room = applyAction(room, { type: 'join', playerId: 'ro', name: 'Rodo' });
  room = applyAction(room, { type: 'join', playerId: 'bs', name: 'Bea' });
  room = applyAction(room, { type: 'join', playerId: 'bo', name: 'Beto' });

  // Sin rol no pueden ponerse listos
  assert.equal(applyAction(room, { type: 'toggleReady', playerId: 'rs' }), null);

  room = applyAction(room, { type: 'pickRole', playerId: 'rs', team: 'red', role: 'spymaster' });
  room = applyAction(room, { type: 'pickRole', playerId: 'ro', team: 'red', role: 'operative' });
  room = applyAction(room, { type: 'pickRole', playerId: 'bs', team: 'blue', role: 'spymaster' });
  room = applyAction(room, { type: 'pickRole', playerId: 'bo', team: 'blue', role: 'operative' });

  // Todos arrancan no listos
  assert.equal(room.players.filter((p) => p.ready).length, 0);

  // Rosa se pone lista
  room = applyAction(room, { type: 'toggleReady', playerId: 'rs' });
  assert.equal(room.players.find((p) => p.id === 'rs').ready, true);
  assert.equal(room.phase, 'lobby');

  // Si Rosa cambia de rol, su listo se desactiva
  room = applyAction(room, { type: 'pickRole', playerId: 'rs', team: 'red', role: 'operative' });
  assert.equal(room.players.find((p) => p.id === 'rs').ready, false);

  // Devolvemos el rol correcto
  room = applyAction(room, { type: 'pickRole', playerId: 'rs', team: 'red', role: 'spymaster' });

  // Van poniendo listo los demás
  room = applyAction(room, { type: 'toggleReady', playerId: 'rs' });
  room = applyAction(room, { type: 'toggleReady', playerId: 'ro' });
  room = applyAction(room, { type: 'toggleReady', playerId: 'bs' });
  assert.equal(room.phase, 'lobby');

  // El último pone listo: arranca automáticamente
  room = applyAction(room, { type: 'toggleReady', playerId: 'bo' });
  assert.equal(room.phase, 'playing');
});

