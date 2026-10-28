import test from 'node:test';
import assert from 'node:assert/strict';
import { adminListing, handleAdmin, isAdminKey } from '../worker/admin.js';
import { isAdminProfile, isAdminTrigger } from '../src/ui/admin.js';

const room = (extra = {}) => JSON.stringify({ gameType: 'teg', hostId: 'a', phase: 'lobby', players: [{ id: 'a', name: 'Nico' }, { id: 'b', name: 'Juli' }], ...extra });

test('admin: se activa solo con el nombre «cuki», el avatar 🤖 y el código CUKI', () => {
  assert.ok(isAdminTrigger({ name: ' Cuki ', avatar: '🤖' }, 'CUKI'));
  assert.ok(!isAdminTrigger({ name: 'cuki', avatar: '🐸' }, 'CUKI'));
  assert.ok(!isAdminTrigger({ name: 'nico', avatar: '🤖' }, 'CUKI'));
  assert.ok(!isAdminTrigger({ name: 'cuki', avatar: '🤖' }, 'ABCD'));
  assert.ok(isAdminProfile({ name: 'CUKI', avatar: '🤖' }));
});

test('admin: el servidor pide la clave, y sin clave configurada no deja entrar a nadie', () => {
  assert.ok(isAdminKey({ ADMIN_CLAVE: 'secreta' }, 'secreta'));
  assert.ok(!isAdminKey({ ADMIN_CLAVE: 'secreta' }, 'secretb'));
  assert.ok(!isAdminKey({ ADMIN_CLAVE: 'secreta' }, null));
  assert.ok(isAdminKey({ SUGERENCIAS_CLAVE: 'otra' }, 'otra'), 'si no hay ADMIN_CLAVE vale la de las sugerencias');
  assert.ok(!isAdminKey({}, ''));
});

test('admin: la lista tiene todas las salas con gente, públicas o no', () => {
  const tree = { rooms: { ABCD: room() }, publica: { ABCD: true } };
  assert.deepEqual(adminListing(tree, 'ABCD', 2), { code: 'ABCD', game: 'teg', host: 'Nico', players: 2, max: 6, phase: 'lobby', conns: 2, pub: true });
  assert.equal(adminListing({ rooms: { ABCD: room() } }, 'ABCD', 1).pub, undefined);
  assert.equal(adminListing(tree, 'ABCD', 0), null, 'sin nadie conectado no se lista');
  assert.equal(adminListing({}, 'ABCD', 3), null, 'una sala vacía (recién cerrada) tampoco');
  assert.equal(adminListing({ rooms: { ABCD: room({ isLocalGame: true }) } }, 'ABCD', 1), null);
});

function fakeEnv() {
  const calls = [];
  const ns = (obj) => ({ idFromName: (n) => n, get: (id) => obj(id) });
  return {
    calls,
    ADMIN_CLAVE: 'k',
    BUZON: ns(() => ({ listar: async () => [{ id: 'm:1', text: 'hola' }], borrar: async (id) => calls.push(['borrar', id]) })),
    DIRECTORIO: ns(() => ({ todas: async () => [{ code: 'ABCD' }] })),
    SALA: ns((code) => ({ cerrar: async () => calls.push(['cerrar', code]) })),
  };
}
const call = (env, method, path, { clave = 'k', body } = {}) => handleAdmin(
  new Request(`http://x/api/admin${path}`, { method, headers: { 'x-admin-clave': clave }, body: body && JSON.stringify(body) }),
  env, new URL(`http://x/api/admin${path}`),
);

test('admin: las rutas hacen lo suyo y con otra clave todo da 404', async () => {
  const env = fakeEnv();
  assert.equal((await call(env, 'GET', '/salas', { clave: 'mal' })).status, 404);
  assert.deepEqual(await (await call(env, 'GET', '/salas')).json(), [{ code: 'ABCD' }]);
  assert.deepEqual(await (await call(env, 'GET', '/sugerencias')).json(), [{ id: 'm:1', text: 'hola' }]);
  assert.equal((await call(env, 'POST', '/salas/cerrar', { body: { code: 'WXYZ' } })).status, 200);
  assert.equal((await call(env, 'POST', '/salas/cerrar', { body: { code: 'wx' } })).status, 400);
  assert.equal((await call(env, 'POST', '/sugerencias/borrar', { body: { id: 'm:1' } })).status, 200);
  assert.equal((await call(env, 'POST', '/sugerencias/borrar', { body: { id: 'r:ip' } })).status, 400, 'no se borran los contadores de envíos');
  assert.deepEqual(env.calls, [['cerrar', 'WXYZ'], ['borrar', 'm:1']]);
});
