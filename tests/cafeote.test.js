import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, newRoom } from '../src/cafeote/game.js';

test('Café o Té: Flujo de chat de pensadores y me gusta', () => {
  let room = newRoom('p1', 'Nico');
  room = applyAction(room, { type: 'join', playerId: 'p2', name: 'Uri' });
  room = applyAction(room, { type: 'join', playerId: 'p3', name: 'Mati' });
  room = applyAction(room, { type: 'join', playerId: 'p4', name: 'Sofía' });

  room = applyAction(room, { type: 'pickRole', playerId: 'p1', team: 'red', role: 'pensador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p2', team: 'red', role: 'adivinador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p3', team: 'blue', role: 'pensador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p4', team: 'blue', role: 'adivinador' });

  room = applyAction(room, { type: 'startSecretPhase', playerId: 'p1' });
  assert.equal(room.phase, 'secret_word');

  // Pensador 1 conversa
  room = applyAction(room, { type: 'pensadorChat', playerId: 'p1', text: 'Che, ¿qué ponemos?', isSuggestion: false });
  assert.equal(room.secretChat.length, 1);

  // Pensador 1 sugiere "Ruedita del mouse"
  room = applyAction(room, { type: 'pensadorChat', playerId: 'p1', text: 'Ruedita del mouse', isSuggestion: true });
  assert.equal(room.secretChat.length, 2);
  const msgId = room.secretChat[1].id;

  // Pensador 2 (Mati) le da Like a la sugerencia -> Inicia la partida con esa palabra
  room = applyAction(room, { type: 'pensadorLike', playerId: 'p3', msgId });
  assert.equal(room.phase, 'playing');
  assert.equal(room.secretWord, 'Ruedita del mouse');
});

test('Café o Té: Reinicio y volver al lobby', () => {
  let room = newRoom('p1', 'Nico');
  room = applyAction(room, { type: 'join', playerId: 'p2', name: 'Uri' });
  room = applyAction(room, { type: 'join', playerId: 'p3', name: 'Mati' });
  room = applyAction(room, { type: 'join', playerId: 'p4', name: 'Sofía' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p1', team: 'red', role: 'pensador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p2', team: 'red', role: 'adivinador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p3', team: 'blue', role: 'pensador' });
  room = applyAction(room, { type: 'pickRole', playerId: 'p4', team: 'blue', role: 'adivinador' });
  room = applyAction(room, { type: 'startSecretPhase', playerId: 'p1' });

  // Forzar inicio
  room = applyAction(room, { type: 'forceStartGame', word: 'Árbol' });
  assert.equal(room.phase, 'playing');

  // Volver a la sala de espera
  room = applyAction(room, { type: 'toLobby' });
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players.length, 4);

  // Volver a iniciar partida inmediatamente
  room = applyAction(room, { type: 'restartGame' });
  assert.equal(room.phase, 'secret_word');
});
