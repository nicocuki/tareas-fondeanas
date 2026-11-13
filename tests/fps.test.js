import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, applyAction, newRoom, ranking } from '../src/fps/game.js';
import { FLOOR, GUN_RESPAWN_MS, MAPS, gunsOf, makeArena } from '../src/fps/maps.js';
import { floorAt, newPlayer, rayCast, stepGround, STEP } from '../src/royale3d/sim.js';

const ctx = (now) => ({ now, rand: () => 0.5 });
function playing(minutes = 5) {
  let room = newRoom('h', 'Host', '🐸', 0);
  room = applyAction(room, { type: 'join', playerId: 'a', name: 'Ana' }, ctx(0));
  room = applyAction(room, { type: 'setOptions', playerId: 'h', options: { minutes, limit: 10, map: 'plaza' } }, ctx(0));
  return applyAction(room, { type: 'start', playerId: 'h' }, ctx(0));
}

test('fps: las bajas se anotan, el feed tiene tope y el primero que llega al límite gana', () => {
  let room = playing();
  const t = COUNTDOWN_MS + 10;
  assert.equal(applyAction(room, { type: 'died', playerId: 'a', match: 1, by: 'h', w: 'rifle' }, ctx(10)), null, 'en la cuenta regresiva no se muere nadie');
  for (let i = 0; i < 9; i++) room = applyAction(room, { type: 'died', playerId: 'a', match: 1, by: 'h', w: 'rifle', h: i % 2 }, ctx(t + i));
  assert.equal(room.players[0].kills, 9);
  assert.equal(room.players[0].heads, 4);
  assert.equal(room.players[1].deaths, 9);
  assert.equal(room.phase, 'playing');
  room = applyAction(room, { type: 'died', playerId: 'a', match: 1, by: 'h', w: 'sniper' }, ctx(t + 20));
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'h');
  assert.ok(room.match.feed.length <= 12);
  assert.equal(ranking(room)[0].id, 'h');
});

test('fps: morirse solo cuenta como muerte sin baja para nadie, y el tiempo cierra la partida', () => {
  let room = playing(3);
  room = applyAction(room, { type: 'died', playerId: 'h', match: 1, by: 'h' }, ctx(COUNTDOWN_MS + 1));
  assert.equal(room.players[0].kills, 0);
  assert.equal(room.players[0].deaths, 1);
  assert.equal(applyAction(room, { type: 'tick', playerId: 'a', match: 1 }, ctx(COUNTDOWN_MS + 1000)), null);
  room = applyAction(room, { type: 'tick', playerId: 'a', match: 1 }, ctx(COUNTDOWN_MS + 3 * 60000));
  assert.equal(room.phase, 'final');
});

test('fps: un arma del mapa la agarra uno solo y vuelve a aparecer a los 20 segundos', () => {
  let room = playing();
  room = applyAction(room, { type: 'take', playerId: 'h', match: 1, key: 's0' }, ctx(6000));
  assert.ok(room);
  assert.equal(applyAction(room, { type: 'take', playerId: 'a', match: 1, key: 's0' }, ctx(7000)), null);
  assert.ok(applyAction(room, { type: 'take', playerId: 'a', match: 1, key: 's0' }, ctx(6000 + GUN_RESPAWN_MS)));
  assert.equal(applyAction(room, { type: 'take', playerId: 'a', match: 1, key: 's99' }, ctx(9000)), null);
  room = applyAction(room, { type: 'take', playerId: 'a', match: 1, key: 'w3.4' }, ctx(9000));
  assert.equal(applyAction(room, { type: 'take', playerId: 'h', match: 1, key: 'w3.4' }, ctx(9500)), null, 'un arma soltada no vuelve');
});

test('fps: se puede entrar con la partida empezada y arranca en cero', () => {
  const room = applyAction(playing(), { type: 'join', playerId: 'z', name: 'Zoe' }, ctx(9000));
  const z = room.players.find((p) => p.id === 'z');
  assert.equal(z.inGame, true);
  assert.equal(z.kills, 0);
});

test('fps: en cada mapa los lugares de aparición y las armas quedan en el piso, libres y adentro de las paredes', () => {
  for (const def of MAPS) {
    const w = makeArena(def.id);
    const free = (x, z) => w.near(x - 0.5, z - 0.5, x + 0.5, z + 0.5, []).every((s) => s.y1 <= FLOOR + 0.05 || s.y0 > FLOOR + 1.9);
    for (const [x, z] of def.spawns) {
      assert.ok(Math.abs(x) < def.hx && Math.abs(z) < def.hz, `${def.id}: ${x},${z} afuera`);
      assert.ok(free(x, z), `${def.id}: el lugar ${x},${z} está tapado`);
    }
    // Las armas pueden estar arriba de una pasarela o una torre, pero con lugar para pararse.
    for (const g of gunsOf(def.id)) {
      const top = floorAt(w, g.x, g.z, FLOOR + 20);
      assert.ok(w.near(g.x - 0.5, g.z - 0.5, g.x + 0.5, g.z + 0.5, []).every((s) => s.y1 <= top + 0.05 || s.y0 > top + 1.9), `${def.id}: el arma ${g.key} está tapada`);
    }
    // Nadie se va del mapa: caminando derecho hacia afuera se frena en la pared.
    const p = newPlayer(0.5, FLOOR, def.spawns[0][1], -Math.PI / 2);
    p.x = def.spawns[0][0]; p.yaw = Math.PI / 2 * (def.spawns[0][0] > 0 ? -1 : 1);
    for (let i = 0; i < 60 * 12; i++) stepGround(p, { f: true }, STEP, w);
    assert.ok(Math.abs(p.x) < def.hx, `${def.id}: se salió por la pared (${p.x})`);
    // Las paredes frenan las balas.
    assert.ok(rayCast(w, { x: 0, y: FLOOR + 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 200).dist < def.hx + 1);
  }
});

test('fps: se sube a las pasarelas y las torres por la rampa', () => {
  for (const def of MAPS) {
    const w = makeArena(def.id);
    const ramps = w.solids.filter((s) => s.k === 'ramp');
    for (const r of ramps) {
      const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][r.dir];
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const len = r.dir % 2 ? r.z1 - r.z0 : r.x1 - r.x0;
      const p = newPlayer(cx - dir[0] * (len / 2 + 1), FLOOR, cz - dir[1] * (len / 2 + 1), Math.atan2(-dir[0], -dir[1]));
      for (let i = 0; i < 60 * 3; i++) stepGround(p, { f: true }, STEP, w);
      assert.ok(p.y > FLOOR + r.rise - 0.3, `${def.id}: la rampa no sube (${p.y.toFixed(2)})`);
    }
  }
});
