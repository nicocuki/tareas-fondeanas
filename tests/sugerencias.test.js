import test from 'node:test';
import assert from 'node:assert/strict';
import { GAP_MS, MAX_NAME, MAX_TEXT, PER_HOUR, allowSend, cleanSuggestion, discordPayload } from '../worker/sugerencias.js';

test('sugerencias: se limpia el texto y se rechazan las muy cortas o muy largas', () => {
  assert.deepEqual(cleanSuggestion({ text: '  Quiero   más  juegos \r\n\r\n\r\n\r\nde cartas ', name: '  Nico   F  ' }), { text: 'Quiero más juegos\n\nde cartas', name: 'Nico F' });
  assert.ok(cleanSuggestion({ text: 'hola' }).error);
  assert.ok(cleanSuggestion({ text: '     ' }).error);
  assert.ok(cleanSuggestion({}).error);
  assert.ok(cleanSuggestion({ text: 'a'.repeat(MAX_TEXT + 1) }).error);
  assert.equal(cleanSuggestion({ text: 'a'.repeat(MAX_TEXT) }).text.length, MAX_TEXT);
  assert.equal(cleanSuggestion({ text: 'una idea', name: 'x'.repeat(100) }).name.length, MAX_NAME);
  assert.equal(cleanSuggestion({ text: 'una idea' }).name, '');
  assert.equal(cleanSuggestion({ text: 12345678 }).text, '12345678');
});

test('sugerencias: hay que esperar entre una y otra y hay un tope por hora', () => {
  let times = [];
  let r = allowSend(times, 1000);
  assert.ok(r.ok);
  times = r.times;
  assert.equal(allowSend(times, 1000 + GAP_MS - 1).ok, false);
  r = allowSend(times, 1000 + GAP_MS);
  assert.ok(r.ok);
  let now = 1000 + GAP_MS;
  times = r.times;
  for (let i = 2; i < PER_HOUR; i++) { now += GAP_MS; r = allowSend(times, now); assert.ok(r.ok); times = r.times; }
  assert.equal(allowSend(times, now + GAP_MS).ok, false, 'tope por hora');
  assert.ok(allowSend(times, now + 60 * 60 * 1000 + 1).ok, 'pasada la hora, de nuevo');
});

test('sugerencias: el mensaje de Discord no deja que nadie mencione a otros', () => {
  const p = discordPayload({ text: '@everyone hola', name: '', at: 0 });
  assert.deepEqual(p.allowed_mentions, { parse: [] });
  assert.match(p.embeds[0].footer.text, /sin firmar/);
  assert.equal(discordPayload({ text: 'x'.repeat(5000), name: 'Ana', at: 0 }).embeds[0].description.length, 2000);
  assert.match(discordPayload({ text: 'hola', name: 'Ana', at: 0 }).embeds[0].footer.text, /Ana/);
});
