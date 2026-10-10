// Servidor de salas + cliente, conectados por un WebSocket de mentira (sin red ni Cloudflare).
// Cada «pantalla» es una copia aparte de src/realtime.js (se importa con otro ?query).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SalaCore, newAttachment } from '../worker/core.js';
import { makeState } from '../src/gartic/game.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function makeCloud() {
  const salas = new Map();
  function sala(code) {
    if (!salas.has(code)) {
      const conns = new Set();
      const stored = new Map();
      const core = new SalaCore({
        code,
        storage: { put: (k, v) => stored.set(k, structuredClone(v)), delete: (k) => stored.delete(k) },
        connections: () => [...conns],
      });
      salas.set(code, { core, conns, stored });
    }
    return salas.get(code);
  }
  class FakeWebSocket {
    constructor(url) {
      this.code = url.split('/').pop();
      this.server = sala(this.code);
      this.closed = false;
      this.chain = Promise.resolve();
      let att = newAttachment(this.code);
      this.conn = {
        send: (text) => setTimeout(() => !this.closed && this.onmessage?.({ data: text })),
        att: () => att,
        saveAtt: (next) => { att = structuredClone(next); },
      };
      this.server.conns.add(this.conn);
      setTimeout(() => this.onopen?.());
    }
    send(text) {
      if (this.closed) throw new Error('cerrado');
      if (text === 'ping') { this.conn.send('pong'); return; }
      this.chain = this.chain.then(() => this.server.core.message(this.conn, text));
    }
    close() { this.drop(); }
    // Corte del lado del servidor o de la red.
    drop() {
      if (this.closed) return;
      this.closed = true;
      this.server.conns.delete(this.conn);
      this.chain.then(() => this.server.core.close(this.conn));
      setTimeout(() => this.onclose?.());
    }
  }
  return { sala, FakeWebSocket, sockets: () => [...salas.values()].flatMap((s) => [...s.conns]) };
}

let screens = 0;
async function screen(cloud, { offset = 0 } = {}) {
  const rt = await import(`../src/realtime.js?pantalla=${++screens}`);
  const store = new Map();
  rt.configureRealtime({
    WebSocket: class extends cloud.FakeWebSocket { constructor(url) { super(url); sockets.push(this); } },
    url: (code) => `ws://prueba/api/sala/${code}`,
    fetchTime: async () => ({ now: Date.now() + offset }),
    storage: () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }),
  });
  const sockets = [];
  return { ...rt, sockets };
}

const until = async (fn, ms = 1000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('No pasó a tiempo');
    await tick();
  }
};

test('realtime: lo que escribe una pantalla le llega a la otra', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  const seen = [];
  const off = b.onValue(b.ref('futbol/ABCD/ball'), (snap) => seen.push(snap.val()));
  await a.set(a.ref('futbol/ABCD/ball'), { x: 1, y: 2 });
  await until(() => seen.length >= 2);
  assert.deepEqual(seen, [null, { x: 1, y: 2 }]);
  off();
  a.configureRealtime({}); b.configureRealtime({});
});

test('realtime: las transacciones no pierden escrituras aunque lleguen juntas', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  const bump = (rt) => rt.runTransaction(rt.ref('futbol/ABCD/match'), (m) => ({ n: (m?.n || 0) + 1 }));
  await Promise.all(Array.from({ length: 10 }, () => [bump(a), bump(b)]).flat());
  const snap = await a.get(a.ref('futbol/ABCD/match'));
  assert.equal(snap.val().n, 20);
  const aborted = await a.runTransaction(a.ref('futbol/ABCD/match'), () => undefined);
  assert.equal(aborted.committed, false);
  assert.equal(aborted.snapshot.val().n, 20);
  a.configureRealtime({}); b.configureRealtime({});
});

test('realtime: eventos de hijos (agregado, cambiado, borrado) y null borra', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  const log = [];
  const players = b.ref('futbol/ABCD/players');
  b.onChildAdded(players, (s) => log.push(['+', s.key, s.val()]));
  b.onChildChanged(players, (s) => log.push(['~', s.key, s.val()]));
  b.onChildRemoved(players, (s) => log.push(['-', s.key]));
  await tick(20);
  await a.set(a.ref('futbol/ABCD/players/p1'), { x: 1 });
  await a.set(a.ref('futbol/ABCD/players/p2'), { x: 2 });
  await a.update(a.ref('futbol/ABCD/players'), { 'p1/x': 5 });
  await a.remove(a.ref('futbol/ABCD/players/p2'));
  await until(() => log.length >= 4);
  assert.deepEqual(log, [['+', 'p1', { x: 1 }], ['+', 'p2', { x: 2 }], ['~', 'p1', { x: 5 }], ['-', 'p2']]);
  assert.equal((await a.get(a.ref('futbol/ABCD/players/p2'))).exists(), false);
  a.configureRealtime({}); b.configureRealtime({});
});

test('realtime: lo anotado con onDisconnect se ejecuta cuando la pantalla se va', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  await a.onDisconnect(a.ref('futbol/ABCD/peers/p1')).remove();
  await a.set(a.ref('futbol/ABCD/peers/p1'), 'sesion');
  const peers = [];
  b.onValue(b.ref('futbol/ABCD/peers'), (s) => peers.push(s.val()));
  await until(() => peers.at(-1)?.p1 === 'sesion');
  a.configureRealtime({}); // cierra la pestaña
  await until(() => peers.at(-1) === null);
  b.configureRealtime({});
});

test('realtime: después de un corte se reconecta y vuelve a escuchar', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  const seen = [];
  b.onValue(b.ref('rooms/ABCD'), (s) => seen.push(s.val()));
  const connected = [];
  b.onValue(b.ref('.info/connected'), (s) => connected.push(s.val()));
  await until(() => seen.length === 1 && connected.at(-1) === true);
  b.sockets.at(-1).drop();
  await until(() => connected.includes(false));
  await a.set(a.ref('rooms/ABCD'), '{"hola":1}');
  await until(() => seen.at(-1) === '{"hola":1}', 3000);
  await until(() => connected.at(-1) === true);
  a.configureRealtime({}); b.configureRealtime({});
});

test('realtime: serverTimestamp se reemplaza por la hora del servidor', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud);
  const before = Date.now();
  await a.set(a.ref('garticRooms/ABCD/state'), { phase: 'lobby', startedAt: a.serverTimestamp() });
  const { startedAt } = (await a.get(a.ref('garticRooms/ABCD/state'))).val();
  assert.ok(startedAt >= before && startedAt <= Date.now());
  a.configureRealtime({});
});

test('realtime: la hora del servidor se estima con /api/hora', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud, { offset: 5000 });
  const value = await new Promise((resolve) => { const off = a.onValue(a.ref('.info/serverTimeOffset'), (s) => { off(); resolve(s.val()); }); });
  assert.ok(Math.abs(value - 5000) < 50, `offset ${value}`);
  a.configureRealtime({});
});

test('realtime: la sala de Código Secreto es un string con tope de 30.000 caracteres', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud);
  await a.set(a.ref('rooms/ABCD'), 'x'.repeat(100));
  await assert.rejects(a.set(a.ref('rooms/ABCD'), 'x'.repeat(30000)));
  await assert.rejects(a.set(a.ref('rooms/ABCD/campo'), 1));
  await assert.rejects(a.set(a.ref('otraCosa/ABCD'), 1));
  a.configureRealtime({});
});

test('realtime: Trazo Loco mantiene privadas las entregas hasta la revelación', async () => {
  const cloud = makeCloud();
  const pantallas = [await screen(cloud), await screen(cloud), await screen(cloud)];
  const uids = await Promise.all(pantallas.map((rt) => rt.identity().then((u) => u.uid)));
  const [a, b] = pantallas;
  const players = Object.fromEntries(uids.map((id, i) => [id, { name: `J${i}`, avatar: '🐸', index: i }]));
  const state = makeState(players, 'normal', 60, 'm1', Date.now());
  await a.set(a.ref('garticRooms/ABCD'), { hostId: uids[0], players, state });
  const step = (rt, uid, round = 0) => rt.ref(`garticSteps/ABCD/m1/${round}/${uid}`);

  await a.set(step(a, uids[0]), { type: 'text', content: 'un pingüino', authorId: uids[0], order: 0 });
  // Nadie escribe la entrega de otro…
  await assert.rejects(b.set(step(b, uids[0]), { type: 'text', content: 'trampa' }));
  // …ni la lee durante la partida.
  const denied = await new Promise((resolve) => b.onValue(step(b, uids[0]), () => resolve(false), () => resolve(true)));
  assert.equal(denied, true);
  await assert.rejects(b.get(b.ref('garticSteps/ABCD/m1')));
  assert.equal((await a.get(step(a, uids[0]))).val().content, 'un pingüino');

  // Una entrega confirmada ya no se cambia.
  await a.set(a.ref(`garticReady/ABCD/m1/0/${uids[0]}`), true);
  await assert.rejects(a.set(step(a, uids[0]), { type: 'text', content: 'otra cosa' }));

  // En la revelación se ve todo.
  await a.update(a.ref('garticRooms/ABCD/state'), { phase: 'reveal' });
  const all = (await b.get(b.ref('garticSteps/ABCD/m1'))).val();
  assert.equal(all[0][uids[0]].content, 'un pingüino');
  pantallas.forEach((rt) => rt.configureRealtime({}));
});

test('realtime: lo guardado alcanza para rearmar la sala, sin las fotos del fútbol', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud);
  await a.set(a.ref('rooms/ABCD'), '{"sala":true}');
  await a.set(a.ref('futbol/ABCD/players/p1'), { x: 1 });
  await a.set(a.ref('futbol/ABCD/match'), { k: 3 });
  await a.set(a.ref('garticSteps/ABCD/m1/0/u1/content'), 'dibujo').catch(() => {});
  const { stored, core } = cloud.sala('ABCD');
  assert.deepEqual([...stored.keys()].sort(), ['d:futbol/ABCD/match', 'd:rooms/ABCD']);
  const copy = new SalaCore({ code: 'ABCD', storage: { put() {}, delete() {} }, connections: () => [] });
  copy.load([...stored].map(([k, v]) => [k.slice(2), v]));
  assert.equal(copy.get(['rooms', 'ABCD']), '{"sala":true}');
  assert.equal(copy.get(['futbol', 'ABCD', 'players']), null);
  assert.deepEqual(core.get(['futbol', 'ABCD', 'players']), { p1: { x: 1 } });
  // Borrar una rama de más arriba borra todo lo guardado debajo.
  await a.set(a.ref('futbol/ABCD'), null);
  assert.deepEqual([...stored.keys()], ['d:rooms/ABCD']);
  a.configureRealtime({});
});

test('realtime: algo más grande que un mensaje llega partido y se arma entero', async () => {
  const cloud = makeCloud();
  const a = await screen(cloud), b = await screen(cloud);
  const big = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`p${i}`, { x: 'a'.repeat(400000) }]));
  await a.set(a.ref('futbol/ABCD/pickups'), big);
  const seen = [];
  b.onValue(b.ref('futbol/ABCD/pickups'), (snap) => seen.push(snap.val()));
  await until(() => seen.length >= 1);
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0]).sort(), ['p0', 'p1', 'p2', 'p3']);
  assert.equal(seen[0].p3.x.length, 400000);
  a.configureRealtime({}); b.configureRealtime({});
});

test('realtime: push genera claves ordenadas por hora', async () => {
  const { pushKey } = await import('../worker/tree.js');
  const keys = Array.from({ length: 50 }, () => pushKey());
  assert.deepEqual([...keys].sort(), keys);
  assert.equal(new Set(keys).size, 50);
});
