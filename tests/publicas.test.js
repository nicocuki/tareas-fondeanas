// Salas públicas: qué sala se lista en la portada y quién puede marcarla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LISTING_TTL_MS, MAX_LISTED, roomListing, visibleListings } from '../worker/publicas.js';
import { writeError } from '../worker/rules.js';
import { SalaCore, newAttachment } from '../worker/core.js';
import { newRoom as newCodigo, serializeRoom } from '../src/codigo-secreto/game.js';
import { newRoom as newTiros } from '../src/tiros/game.js';

const tree = (code, room, extra = {}) => ({ rooms: { [code]: typeof room === 'string' ? room : JSON.stringify(room) }, ...extra });
const pub = (code) => ({ publica: { [code]: true } });

test('una sala sin marcar como pública no se lista', () => {
  const room = newTiros('a', 'Nico', '🐸', 0);
  assert.equal(roomListing(tree('ABCD', room), 'ABCD', 1), null);
});

test('una sala pública en la sala de espera se lista con juego, anfitrión y jugadores', () => {
  const room = newTiros('a', 'Nico', '🐸', 0);
  assert.deepEqual(roomListing(tree('ABCD', room, pub('ABCD')), 'ABCD', 1), {
    code: 'ABCD', game: 'tiros', host: 'Nico', players: 1, max: 4,
  });
});

test('Código Secreto (sin gameType) se lista como codigo-secreto', () => {
  const room = newCodigo('a', 'Uri', { rand: () => 0.5, now: 0 });
  const listing = roomListing(tree('ABCD', serializeRoom(room), pub('ABCD')), 'ABCD', 2);
  assert.equal(listing.game, 'codigo-secreto');
  assert.equal(listing.host, 'Uri');
});

test('no se lista si la partida empezó, si está llena o si no hay nadie conectado', () => {
  const room = newTiros('a', 'Nico', '🐸', 0);
  assert.equal(roomListing(tree('ABCD', { ...room, phase: 'fight' }, pub('ABCD')), 'ABCD', 1), null);
  const full = { ...room, players: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })) };
  assert.equal(roomListing(tree('ABCD', full, pub('ABCD')), 'ABCD', 4), null);
  assert.equal(roomListing(tree('ABCD', room, pub('ABCD')), 'ABCD', 0), null);
});

test('las partidas locales y de entrenamiento del fútbol no se listan', () => {
  const room = { gameType: 'futbol', phase: 'lobby', hostId: 'a', players: [{ id: 'a', name: 'Nico' }], isTrainingMode: true };
  assert.equal(roomListing(tree('ABCD', room, pub('ABCD')), 'ABCD', 1), null);
});

test('Trazo Loco se lista desde garticRooms, con su máximo de jugadores', () => {
  const gartic = {
    hostId: 'u1', settings: { maxPlayers: 6 }, players: { u1: { name: 'Alan' }, u2: { name: 'Nico' } },
    state: { phase: 'lobby' },
  };
  assert.deepEqual(roomListing({ garticRooms: { WXYZ: gartic }, ...pub('WXYZ') }, 'WXYZ', 2), {
    code: 'WXYZ', game: 'gartic', host: 'Alan', players: 2, max: 6,
  });
});

test('la lista saca las vencidas, pone las nuevas primero y tiene tope', () => {
  const now = LISTING_TTL_MS * 2;
  const entries = [{ code: 'AAAA', at: now - 10 }, { code: 'BBBB', at: now - 5 }, { code: 'CCCC', at: now - LISTING_TTL_MS }];
  assert.deepEqual(visibleListings(entries, now).map((e) => e.code), ['BBBB', 'AAAA']);
  const many = Array.from({ length: MAX_LISTED + 5 }, (_, i) => ({ code: String(i), at: now - i }));
  assert.equal(visibleListings(many, now).length, MAX_LISTED);
});

test('publica/{sala} solo acepta true o null', () => {
  assert.equal(writeError(['publica', 'ABCD'], 'u', true, null), null);
  assert.equal(writeError(['publica', 'ABCD'], 'u', null, null), null);
  assert.ok(writeError(['publica', 'ABCD'], 'u', 'si', null));
  assert.ok(writeError(['publica', 'ABCD', 'x'], 'u', true, null));
});

test('el servidor de la sala avisa qué rutas se escribieron', async () => {
  const changed = [];
  const core = new SalaCore({
    code: 'ABCD',
    storage: { put() {}, delete() {} },
    connections: () => [],
    onWrite: (segs) => changed.push(...segs.map((s) => s.join('/'))),
  });
  let att = newAttachment('ABCD');
  const conn = { send() {}, att: () => att, saveAtt: (a) => { att = a; } };
  await core.message(conn, JSON.stringify({ op: 'set', path: 'publica/ABCD', v: true }));
  await core.message(conn, JSON.stringify({ op: 'set', path: 'publica/ABCD', v: 'no' })); // rechazada
  assert.deepEqual(changed, ['publica/ABCD']);
});
