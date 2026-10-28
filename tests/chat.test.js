import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_LEN, MAX_CHAT_STRING, MAX_MESSAGES, addChatMessage, parseChat } from '../src/ui/chat.js';
import { ROOTS, writeError } from '../worker/rules.js';

test('chat de la T: los mensajes se suman en orden con un número que no se repite', () => {
  let raw = null;
  raw = addChatMessage(raw, { id: 'a', name: 'Nico', text: '  hola   che ', now: 1 });
  raw = addChatMessage(raw, { id: 'b', name: 'Juli', text: 'buenas', now: 2 });
  const chat = parseChat(raw);
  assert.equal(chat.s, 2);
  assert.deepEqual(chat.m.map((m) => [m.k, m.i, m.n, m.x]), [[1, 'a', 'Nico', 'hola che'], [2, 'b', 'Juli', 'buenas']]);
});

test('chat de la T: un mensaje vacío no se manda y uno largo se corta', () => {
  assert.equal(addChatMessage(null, { id: 'a', name: 'Nico', text: '   ', now: 1 }), null);
  const long = parseChat(addChatMessage(null, { id: 'a', name: 'Nico', text: 'x'.repeat(500), now: 1 }));
  assert.equal(long.m[0].x.length, CHAT_LEN);
});

test('chat de la T: guarda los últimos y el peor caso entra en el tope del servidor', () => {
  let raw = null;
  for (let i = 0; i < MAX_MESSAGES + 15; i++) raw = addChatMessage(raw, { id: `id-${i}`, name: '"'.repeat(40), text: '"'.repeat(CHAT_LEN), now: 1e13 });
  const chat = parseChat(raw);
  assert.equal(chat.m.length, MAX_MESSAGES);
  assert.equal(chat.m[0].k, 16);
  assert.ok(raw.length <= MAX_CHAT_STRING, `pesa ${raw.length}`);
  assert.equal(writeError(['chat', 'ABCD'], 'u', raw, null), null);
});

test('chat/{sala}: el servidor solo acepta un texto con tope', () => {
  assert.ok(ROOTS.includes('chat'));
  assert.equal(writeError(['chat', 'ABCD'], 'u', null, null), null);
  assert.ok(writeError(['chat', 'ABCD'], 'u', 'x'.repeat(MAX_CHAT_STRING + 1), null));
  assert.ok(writeError(['chat', 'ABCD'], 'u', { m: [] }, null));
  assert.ok(writeError(['chat', 'ABCD', 'm'], 'u', 'hola', null));
});

test('chat de la T: un valor roto se lee como chat vacío', () => {
  assert.deepEqual(parseChat('no es json'), { s: 0, m: [] });
  assert.deepEqual(parseChat(null), { s: 0, m: [] });
});
