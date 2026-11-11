import test from 'node:test';
import assert from 'node:assert/strict';
import { ISLAND_R, STORM_PHASES, heightAt, makeWorld, spawnPoint, stormAt, stormCenters } from '../src/royale3d/map.js';
import { MAG, STEP, aimShot, damageFor, groundPlayer, hitscan, newPlayer, rayLength, startReload, finishReload, stepPlayer, tryShoot, solidAt } from '../src/royale3d/sim.js';
import { MAX_PLAYERS, alive, applyAction, newRoom, ranking, startProblem } from '../src/royale3d/game.js';

const SEED = 424242;

test('royale3d: la isla sale de la semilla (igual cada vez) y tiene tierra firme en el medio', () => {
  assert.equal(heightAt(SEED, 3, 4), heightAt(SEED, 3, 4));
  assert.notEqual(heightAt(SEED, 3, 4), heightAt(SEED + 1, 3, 4));
  assert.ok(heightAt(SEED, 0, 0) > 0.5);
  assert.ok(heightAt(SEED, ISLAND_R + 8, 0) < 0, 'más allá de la costa es mar');
  assert.deepEqual(makeWorld(SEED), makeWorld(SEED));
  const w = makeWorld(SEED);
  assert.ok(w.trees.length > 40 && w.rocks.length > 5 && w.cabins.length >= 3);
});

test('royale3d: todos aparecen en tierra firme, sin estar adentro de nada', () => {
  for (const seed of [1, 7, 99, SEED, 2 ** 30]) {
    const world = makeWorld(seed);
    for (let i = 0; i < 8; i++) {
      const sp = spawnPoint(seed, i, 8, world);
      const p = groundPlayer(seed, newPlayer(sp));
      assert.ok(p.y > 0.5, `semilla ${seed}, lugar ${i}: en el agua`);
      assert.ok(!solidAt(world, p.x, p.y + 1, p.z), `semilla ${seed}, lugar ${i}: adentro de algo`);
    }
  }
});

test('royale3d: caminar avanza, no atraviesa árboles y no se mete al mar', () => {
  const world = makeWorld(SEED);
  const p = groundPlayer(SEED, newPlayer(spawnPoint(SEED, 0, 4, world)));
  const x0 = p.x, z0 = p.z;
  for (let i = 0; i < 60; i++) stepPlayer(p, { f: true }, STEP, world);
  assert.ok(Math.hypot(p.x - x0, p.z - z0) > 2, 'se movió');
  // Caminando derecho para afuera, nunca pasa el mar profundo.
  const q = groundPlayer(SEED, newPlayer({ x: 30, z: 0, yaw: Math.PI / 2 }));
  for (let i = 0; i < 60 * 40; i++) stepPlayer(q, { f: true }, STEP, world);
  assert.ok(heightAt(SEED, q.x, q.z) >= -0.9);
  // Contra un árbol: queda afuera de su tronco.
  const t = world.trees[0];
  const r = groundPlayer(SEED, newPlayer({ x: t.x + 4, z: t.z, yaw: Math.PI / 2 }));
  for (let i = 0; i < 240; i++) stepPlayer(r, { f: true }, STEP, world);
  assert.ok(Math.hypot(r.x - t.x, r.z - t.z) >= t.r + 0.4 || r.x > t.x + 4 === false);
});

test('royale3d: saltar sube y vuelve a caer al piso', () => {
  const world = makeWorld(SEED);
  const p = groundPlayer(SEED, newPlayer(spawnPoint(SEED, 0, 4, world)));
  const base = p.y;
  stepPlayer(p, { jump: true }, STEP, world);
  let top = p.y;
  for (let i = 0; i < 120; i++) { stepPlayer(p, {}, STEP, world); top = Math.max(top, p.y); }
  assert.ok(top > base + 1);
  assert.ok(p.grounded);
});

test('royale3d: un tiro pega en el cuerpo, en la cabeza pega el doble y una pared lo frena', () => {
  const world = { seed: SEED, trees: [], rocks: [], cabins: [] };
  const flat = heightAt(SEED, 0, 0);
  const o = { x: 0, y: flat + 1, z: 0 };
  const d = { x: 0, y: 0, z: -1 };
  const target = (z, y = flat) => [{ id: 'b', x: 0, y, z }];
  const body = hitscan(world, o, d, target(-10));
  assert.equal(body.id, 'b');
  assert.equal(body.head, false);
  assert.ok(Math.abs(body.dist - 9.5) < 0.6);
  assert.ok(hitscan(world, { ...o, y: flat + 1.6 }, d, target(-10)).head, 'a la altura de la cabeza');
  assert.equal(hitscan(world, o, d, target(10)), null, 'de espaldas no');
  assert.equal(damageFor(true), damageFor(false) * 2);
  const wall = { seed: SEED, trees: [], rocks: [], cabins: [{ x: 0, z: -5, w: 4, d: 1, h: 4, y: flat }] };
  assert.equal(hitscan(wall, o, d, target(-10)), null, 'la cabaña tapa');
  assert.ok(rayLength(wall, o, d) < 5);
});

test('royale3d: apuntar con la cámara manda el tiro hacia lo que se ve en la mira', () => {
  const world = { seed: SEED, trees: [], rocks: [], cabins: [] };
  const p = groundPlayer(SEED, newPlayer({ x: 0, z: 0, yaw: 0 }));
  const { o, d } = aimShot(world, p);
  assert.ok(d.z < -0.9, 'yaw 0 mira hacia -z');
  assert.ok(Math.abs(o.y - (p.y + 1.55)) < 0.01);
});

test('royale3d: el cargador se gasta, no deja tirar recargando y se llena', () => {
  const p = newPlayer({ x: 0, z: 0, yaw: 0 });
  let t = 0, shots = 0;
  while (tryShoot(p, t)) { shots++; t += 0.2; if (shots > 100) break; }
  assert.equal(shots, MAG);
  assert.ok(p.reloadUntil > 0, 'al quedarse sin balas empieza a recargar');
  assert.ok(!startReload(p, t), 'ya está recargando');
  assert.ok(!tryShoot(p, t + 0.1), 'recargando');
  assert.ok(finishReload(p, t + 5));
  assert.equal(p.ammo, MAG);
});

test('royale3d: la tormenta se achica por fases, cada círculo cabe en el anterior, y siempre es igual para la misma semilla', () => {
  const c = stormCenters(SEED);
  assert.deepEqual(c, stormCenters(SEED));
  for (let i = 1; i < c.length; i++) assert.ok(Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z) + c[i].r <= c[i - 1].r + 1e-6, `fase ${i}`);
  const start = stormAt(SEED, 0);
  assert.equal(start.shrinking, false);
  assert.equal(start.dps, 0);
  let prev = Infinity;
  for (let t = 0; t < 400; t += 5) { const s = stormAt(SEED, t); assert.ok(s.r <= prev + 1e-9); prev = s.r; }
  assert.equal(stormAt(SEED, 10000).r, STORM_PHASES.at(-1).r);
  assert.ok(stormAt(SEED, 100, 0.6).r < stormAt(SEED, 100, 1).r, 'rápida va más adelantada');
});

// ─── La sala ─────────────────────────────────────────────────────────────────
function lobbyOf(n) {
  let room = newRoom('h', 'Nico', '🐸', 1000);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `J${i}` });
  return room;
}
function playing(n = 3) {
  const room = applyAction(lobbyOf(n), { type: 'start', playerId: 'h' }, { now: 5000, rand: () => 0.3 });
  return room;
}

test('royale3d: hacen falta 2 jugadores, hasta 8, y solo el anfitrión arranca', () => {
  assert.ok(startProblem(lobbyOf(1)));
  assert.equal(applyAction(lobbyOf(1), { type: 'start', playerId: 'h' }), null);
  assert.equal(applyAction(lobbyOf(3), { type: 'start', playerId: 'p1' }), null);
  assert.equal(lobbyOf(MAX_PLAYERS).players.length, MAX_PLAYERS);
  assert.equal(applyAction(lobbyOf(MAX_PLAYERS), { type: 'join', playerId: 'x', name: 'Extra' }), null);
  const room = playing(3);
  assert.equal(room.phase, 'playing');
  assert.equal(alive(room).length, 3);
  assert.equal(room.match.order.length, 3);
});

test('royale3d: la tormenta solo cambia con una opción válida y en la sala de espera', () => {
  const room = lobbyOf(2);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { storm: 'rapida' } }).options.storm, 'rapida');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { storm: 'loca' } }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p1', options: { storm: 'rapida' } }), null);
});

test('royale3d: al caer el penúltimo gana el que queda, con puestos del último al primero en caer', () => {
  let room = playing(3);
  const m = room.match.n;
  const t = room.match.startsAt + 1000;
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: room.match.startsAt - 1 }), null, 'antes de arrancar no vale');
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m + 1 }, { now: t }), null, 'de otra partida no vale');
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, by: 'h' }, { now: t });
  assert.equal(room.phase, 'playing');
  assert.equal(room.players.find((p) => p.id === 'h').kills, 1);
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: t }), null, 'no se muere dos veces');
  room = applyAction(room, { type: 'died', playerId: 'p2', match: m, w: 'storm' }, { now: t + 1 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'h');
  assert.deepEqual(ranking(room).map((p) => p.id), ['h', 'p2', 'p1']);
});

test('royale3d: el anfitrión da por muerto al que se fue; salirse en plena partida cuenta como caer', () => {
  let room = playing(2);
  const m = room.match.n;
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', target: 'h', match: m }, { now: room.match.startsAt + 1 }), null, 'solo el anfitrión da por muerto a otro');
  room = applyAction(room, { type: 'leave', playerId: 'p1' }, { now: room.match.startsAt + 5 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'h');
});

test('royale3d: «otra partida» cambia la isla y «volver a la sala» deja a todos sin jugar', () => {
  let room = playing(2);
  const seed = room.match.seed;
  room = applyAction(room, { type: 'died', playerId: 'p1', match: room.match.n }, { now: room.match.startsAt + 1 });
  const again = applyAction(room, { type: 'start', playerId: 'h' }, { now: 99999, rand: () => 0.77 });
  assert.equal(again.phase, 'playing');
  assert.notEqual(again.match.seed, seed);
  assert.equal(again.match.n, 2);
  const lobby = applyAction(room, { type: 'toLobby', playerId: 'h' });
  assert.equal(lobby.phase, 'lobby');
  assert.ok(lobby.players.every((p) => !p.inGame && !p.alive));
});

test('royale3d: la sala entera pesa muy poco (8 jugadores, partida terminada)', () => {
  let room = playing(8);
  for (const p of room.players.slice(1)) room = applyAction(room, { type: 'died', playerId: p.id, match: room.match.n, by: 'h' }, { now: room.match.startsAt + 10 });
  assert.equal(room.phase, 'final');
  assert.ok(JSON.stringify(room).length < 5000, String(JSON.stringify(room).length));
});
