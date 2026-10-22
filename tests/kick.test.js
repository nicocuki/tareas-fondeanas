import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_KICKED } from '../src/lobby/kick.js';
import * as cohetes from '../src/cohetes/game.js';
import * as mecha from '../src/mecha/game.js';
import * as meme from '../src/meme/game.js';
import * as nave from '../src/nave/game.js';
import * as tiros from '../src/tiros/game.js';
import * as codigo from '../src/codigo-secreto/game.js';
import * as cafe from '../src/cafeote/game.js';
import * as futbol from '../src/futbol/game.js';

// Sala de espera con el anfitrión h y dos más, a y b.
function lobby(g) {
  let room = g.newRoom('h', 'Host', '🐸', 0);
  for (const id of ['a', 'b']) room = g.applyAction(room, { type: 'join', playerId: id, name: id.toUpperCase(), avatar: '🦊' }, { now: 0, rand: () => 0.3 }) || room;
  return room;
}
const ids = (room) => room.players.map((p) => p.id);
// cafeote y futbol devuelven la sala igual cuando la acción no vale; los demás, null.
const rejected = (before, after) => after === null || after === before;

const GAMES = { cohetes, mecha, meme, nave, tiros, codigo, cafe, futbol };
for (const [name, g] of Object.entries(GAMES)) {
  test(`expulsar (${name}): solo el anfitrión, en la sala de espera, y el expulsado no vuelve a entrar con esa pantalla`, () => {
    const room = lobby(g);
    assert.deepEqual(ids(room), ['h', 'a', 'b']);
    assert.ok(rejected(room, g.applyAction(room, { type: 'kick', playerId: 'a', target: 'b' }, { now: 0 })), 'uno que no es anfitrión no saca');
    assert.ok(rejected(room, g.applyAction(room, { type: 'kick', playerId: 'h', target: 'h' }, { now: 0 })), 'el anfitrión no se saca a sí mismo');
    assert.ok(rejected(room, g.applyAction(room, { type: 'kick', playerId: 'h', target: 'zz' }, { now: 0 })), 'a uno que no está, no');
    const after = g.applyAction(room, { type: 'kick', playerId: 'h', target: 'a' }, { now: 0 });
    assert.deepEqual(ids(after), ['h', 'b']);
    assert.deepEqual(after.kicked, ['a']);
    assert.ok(rejected(after, g.applyAction(after, { type: 'join', playerId: 'a', name: 'A' }, { now: 0 })), 'no vuelve a entrar');
    assert.equal(ids(g.applyAction(after, { type: 'join', playerId: 'c', name: 'C' }, { now: 0 }) || after).includes('c'), true, 'otro sí entra');
  });
}

test('expulsar: la lista de expulsados tiene tope', () => {
  let room = futbol.newRoom('h', 'Host');
  for (let i = 0; i < MAX_KICKED + 5; i++) {
    room = futbol.applyAction(room, { type: 'join', playerId: `p${i}`, name: `P${i}` });
    room = futbol.applyAction(room, { type: 'kick', playerId: 'h', target: `p${i}` });
  }
  assert.equal(room.kicked.length, MAX_KICKED);
});

test('fútbol: al terminar, cada uno vuelve a la sala cuando quiere y no se arranca hasta que vuelvan todos', () => {
  let room = futbol.newRoom('h', 'Host');
  room = futbol.applyAction(room, { type: 'join', playerId: 'a', name: 'A' });
  room = futbol.applyAction(room, { type: 'join', playerId: 'b', name: 'B' });
  room = futbol.applyAction(room, { type: 'startGame', playerId: 'h' });
  room = futbol.applyAction(room, { type: 'endGame', playerId: 'h' });
  assert.equal(room.phase, 'ended');
  room = futbol.applyAction(room, { type: 'backToLobby', playerId: 'h' });
  assert.equal(room.phase, 'ended', 'los demás siguen en el final');
  assert.deepEqual(futbol.waitingPlayers(room).map((p) => p.id), ['a', 'b']);
  assert.equal(futbol.canStart(room), false);
  assert.equal(futbol.applyAction(room, { type: 'startGame', playerId: 'h' }).phase, 'ended', 'no se puede arrancar');
  room = futbol.applyAction(room, { type: 'pickTeam', playerId: 'h', team: 'blue' });
  assert.equal(futbol.findPlayer(room, 'h').team, 'blue', 'el que volvió ya elige equipo');
  room = futbol.applyAction(room, { type: 'backToLobby', playerId: 'a' });
  room = futbol.applyAction(room, { type: 'leave', playerId: 'b' });
  assert.equal(room.phase, 'lobby', 'volvió uno y el otro se fue: sala de espera');
  assert.equal(futbol.waitingPlayers(room).length, 0);
  assert.ok(room.players.every((p) => !p.back));
  room = futbol.applyAction(room, { type: 'pickTeam', playerId: 'a', team: 'red' });
  assert.equal(futbol.applyAction(room, { type: 'startGame', playerId: 'h' }).phase, 'playing');
});

test('fútbol: el anfitrión puede sacar al que se quedó en el final, y así se destraba', () => {
  let room = futbol.newRoom('h', 'Host');
  room = futbol.applyAction(room, { type: 'join', playerId: 'a', name: 'A' });
  room = futbol.applyAction(room, { type: 'startGame', playerId: 'h' });
  room = futbol.applyAction(room, { type: 'endGame', playerId: 'h' });
  room = futbol.applyAction(room, { type: 'backToLobby', playerId: 'h' });
  room = futbol.applyAction(room, { type: 'kick', playerId: 'h', target: 'a' });
  assert.equal(room.phase, 'lobby');
  assert.deepEqual(ids(room), ['h']);
});
