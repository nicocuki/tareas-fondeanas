import test from 'node:test';
import assert from 'node:assert/strict';
import { adminListing, cleanNotice, handleAdmin, isAdminKey } from '../worker/admin.js';
import { isAdminProfile, isAdminTrigger, noticeIsForMe } from '../src/ui/admin.js';

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
  assert.deepEqual(adminListing(tree, 'ABCD', 2), { code: 'ABCD', game: 'teg', host: 'Nico', players: 2, max: 6, phase: 'lobby', who: [{ n: 'Nico', a: '', h: 1 }, { n: 'Juli', a: '' }], conns: 2, pub: true });
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
    DIRECTORIO: ns(() => ({ todas: async () => [{ code: 'ABCD' }], avisar: async (text, ms, to) => calls.push(['avisar', text, ms, to]) })),
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

test('admin: el aviso se limpia (140 letras, entre 3 y 60 segundos) y se manda al directorio', async () => {
  assert.deepEqual(cleanNotice({ text: '  hola   mundo ', seconds: 20 }), { text: 'hola mundo', seconds: 20, to: null });
  assert.equal(cleanNotice({ text: 'x'.repeat(500) }).text.length, 140);
  assert.equal(cleanNotice({ text: 'a' }).seconds, 10);
  assert.equal(cleanNotice({ text: 'a', seconds: 1 }).seconds, 3);
  assert.equal(cleanNotice({ text: 'a', seconds: 999 }).seconds, 60);
  const env = fakeEnv();
  assert.equal((await call(env, 'POST', '/aviso', { clave: 'mal', body: { text: 'hola' } })).status, 404);
  assert.equal((await call(env, 'POST', '/aviso', { body: { text: '¡Hola a todos!', seconds: 5 } })).status, 200);
  assert.equal((await call(env, 'POST', '/aviso', { body: {} })).status, 200, 'sin texto saca el aviso');
  assert.deepEqual(env.calls.filter((c) => c[0] === 'avisar'), [['avisar', '¡Hola a todos!', 5000, null], ['avisar', '', 10000, null]]);
});

test('admin: el aviso puede ir a una sala o a un jugador, y cada pantalla se queda con lo suyo', async () => {
  assert.deepEqual(cleanNotice({ text: 'a', room: 'abcd' }).to, { room: 'ABCD' });
  assert.deepEqual(cleanNotice({ text: 'a', room: 'ABCD', name: '  Juli  ' }).to, { room: 'ABCD', name: 'Juli' });
  assert.equal(cleanNotice({ text: 'a', name: 'Juli' }).to, null, 'un nombre sin sala no vale');
  const env = fakeEnv();
  assert.equal((await call(env, 'POST', '/aviso', { body: { text: 'hola', room: 'xx' } })).status, 400);
  assert.equal((await call(env, 'POST', '/aviso', { body: { text: 'hola', room: 'abcd', name: 'Juli', seconds: 5 } })).status, 200);
  assert.deepEqual(env.calls.filter((c) => c[0] === 'avisar'), [['avisar', 'hola', 5000, { room: 'ABCD', name: 'Juli' }]]);
  assert.ok(noticeIsForMe(null, { room: '', name: 'x' }), 'sin destino va a todos, estén o no en una sala');
  assert.ok(noticeIsForMe({ room: 'ABCD' }, { room: 'ABCD', name: 'x' }));
  assert.ok(!noticeIsForMe({ room: 'ABCD' }, { room: 'WXYZ', name: 'x' }));
  assert.ok(!noticeIsForMe({ room: 'ABCD' }, { room: '', name: 'x' }), 'el del menú no recibe los de sala');
  assert.ok(noticeIsForMe({ room: 'ABCD', name: 'Juli' }, { room: 'ABCD', name: ' juli ' }));
  assert.ok(!noticeIsForMe({ room: 'ABCD', name: 'Juli' }, { room: 'ABCD', name: 'Nico' }));
});
