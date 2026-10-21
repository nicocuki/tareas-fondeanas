import test from 'node:test';
import assert from 'node:assert/strict';
import { isFull, summarizeRoom } from '../src/ui/roomSummary.js';

test('resumen de sala: dice de qué juego es, quién la armó y cuántos hay', () => {
  const raw = JSON.stringify({ gameType: 'tiros', phase: 'lobby', hostId: 'b', players: [{ id: 'a', name: 'Ana', avatar: '🐸' }, { id: 'b', name: 'Beto', avatar: '🦊' }] });
  assert.deepEqual(summarizeRoom('ABCD', null, raw), { code: 'ABCD', game: 'tiros', host: 'Beto', hostAvatar: '🦊', players: 2, max: 15, phase: 'lobby', local: false });
  // Las salas de Código Secreto no tienen gameType.
  const cs = summarizeRoom('ABCD', null, JSON.stringify({ phase: 'playing', hostId: 'a', players: [{ id: 'a', name: 'Ana' }] }));
  assert.equal(cs.game, 'codigo-secreto');
  assert.equal(cs.hostAvatar, '');
  assert.equal(cs.phase, 'playing');
});

test('resumen de sala: Trazo Loco, salas que no existen y salas llenas', () => {
  const gartic = { hostId: 'u1', players: { u1: { name: 'Caro', avatar: '🐼' }, u2: { name: 'Dani' } }, state: { phase: 'lobby' }, settings: {} };
  const g = summarizeRoom('WXYZ', gartic, null);
  assert.equal(g.game, 'gartic');
  assert.equal(g.host, 'Caro');
  assert.equal(g.players, 2);
  assert.equal(summarizeRoom('WXYZ', null, null), null);
  assert.equal(summarizeRoom('WXYZ', null, 'esto no es JSON'), null);
  assert.ok(isFull({ players: 4, max: 4 }));
  assert.ok(!isFull({ players: 9, max: null }));
  assert.ok(!isFull(null));
});
