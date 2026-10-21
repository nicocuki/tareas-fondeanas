import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, MAX_PLAYERS, applyAction, findPlayer, newRoom, ranking } from '../src/cohetes/game.js';
import { H, carve, makeTerrain, solid, surfaceY, waterY } from '../src/cohetes/terrain.js';
import {
  COIN_COUNT, STEP, TANK_H, WEAPONS, blastOn, blocked, coinSpots, crateInfo, groundUnder, newTank, projectilesFor, spawnFor, stepProjectile, stepTank,
} from '../src/cohetes/sim.js';

const settle = (t, p, seconds = 1, dir = 0) => { for (let i = 0; i < seconds / STEP; i++) stepTank(p, dir, STEP, t); };

// ─── Terreno ─────────────────────────────────────────────────────────────────
test('cohetes: la misma semilla arma la misma isla, y con los mismos cráteres queda igual', () => {
  const a = makeTerrain(1234, 6), b = makeTerrain(1234, 6);
  assert.deepEqual(a.grid, b.grid);
  carve(a, 300, surfaceY(a, 300), 20); carve(a, 320, surfaceY(a, 320), 15);
  carve(b, 320, surfaceY(b, 320), 15); carve(b, 300, surfaceY(b, 300), 20);
  assert.deepEqual(a.grid, b.grid, 'cavar en otro orden da lo mismo');
  assert.notDeepEqual(makeTerrain(99, 6).grid, a.grid);
  assert.ok(makeTerrain(1, 25).W > makeTerrain(1, 2).W, 'con más jugadores la isla es más ancha');
});

test('cohetes: el agua sube con el tiempo y más rápido con la opción rápida', () => {
  assert.equal(waterY(0), waterY(10), 'al principio hay unos segundos de gracia');
  assert.ok(waterY(120) < waterY(60));
  assert.ok(waterY(120, 1.6) < waterY(120, 1));
  assert.ok(waterY(10000) > 0);
});

// ─── Tanque ──────────────────────────────────────────────────────────────────
test('cohetes: el tanque cae, se apoya en la tierra y maneja subiendo las colinas', () => {
  const t = makeTerrain(7, 4);
  const x = t.W / 2;
  const p = newTank(x, surfaceY(t, x) - 40);
  settle(t, p, 1.5);
  assert.ok(p.onGround, 'quedó apoyado');
  assert.ok(!blocked(t, p.x, p.y), 'no quedó adentro de la tierra');
  assert.ok(Math.abs(p.y - groundUnder(t, p.x)) < 2, `las orugas tocan el piso (${p.y} / ${groundUnder(t, p.x)})`);
  const x0 = p.x;
  settle(t, p, 1, 1);
  assert.ok(p.x > x0 + 30, `manejó a la derecha (${x0} → ${p.x})`);
  assert.ok(!blocked(t, p.x, p.y));
});

test('cohetes: disparar empuja para atrás: tirando para abajo se sale volando', () => {
  const t = makeTerrain(7, 4);
  const p = newTank(t.W / 2, 0);
  p.y = surfaceY(t, p.x) - 0.001;
  settle(t, p, 0.3);
  const y0 = p.y;
  p.vy -= 115; // retroceso de un tiro para abajo
  // Y la explosión del propio tiro al lado también lo empuja (el «salto con cohete»).
  const kick = blastOn(p, { x: p.x, y: p.y + 2, w: 'rocket' });
  p.vx += kick.vx; p.vy += kick.vy;
  settle(t, p, 0.25);
  assert.ok(p.y < y0 - 15, `subió (${y0} → ${p.y})`);
});

test('cohetes: los cohetes caen en arco, explotan contra la tierra y el daño baja con la distancia', () => {
  const t = makeTerrain(3, 4);
  const x = t.W / 2;
  const [b] = projectilesFor({ k: 's1', x, y: surfaceY(t, x) - 60, a: 0, w: 'rocket' }, 'yo');
  let hit = null;
  for (let i = 0; i < 600 && !hit; i++) hit = stepProjectile(b, STEP, t, []);
  assert.ok(hit, 'explotó');
  assert.ok(solid(t, hit.x, hit.y) || solid(t, hit.x, hit.y + 1), 'contra la tierra');
  assert.ok(hit.x > x, 'avanzó para adelante');
  const near = blastOn({ x: hit.x, y: hit.y + TANK_H / 2 }, { ...hit, w: 'rocket' });
  const far = blastOn({ x: hit.x + 25, y: hit.y + TANK_H / 2 }, { ...hit, w: 'rocket' });
  assert.ok(near.damage > far.damage);
  assert.equal(blastOn({ x: hit.x + 200, y: hit.y }, { ...hit, w: 'rocket' }), null);
  assert.ok(WEAPONS.nuke.radius > WEAPONS.rocket.radius);
});

test('cohetes: la triple tira tres, la mina se queda en el piso hasta que alguien pasa', () => {
  assert.equal(projectilesFor({ k: 'a', x: 0, y: 0, a: 0, w: 'triple' }, 'yo').length, 3);
  const t = makeTerrain(5, 4);
  const x = t.W / 2;
  const [m] = projectilesFor({ k: 'm', x, y: surfaceY(t, x) - 20, a: Math.PI / 2, w: 'mine' }, 'yo');
  for (let i = 0; i < 240; i++) assert.equal(stepProjectile(m, STEP, t, []), null);
  assert.ok(m.stuck, 'se pegó al piso');
  assert.ok(stepProjectile(m, STEP, t, [{ id: 'otro', x: m.x + 5, y: m.y + 3 }]), 'alguien cerca la hace explotar');
});

test('cohetes: monedas, cajas y lugares de salida salen de la semilla y quedan arriba de la tierra', () => {
  const t = makeTerrain(42, 10);
  const coins = coinSpots(t, 42);
  assert.equal(coins.length, COIN_COUNT);
  assert.deepEqual(coins, coinSpots(makeTerrain(42, 10), 42));
  for (const c of coins) assert.ok(!solid(t, c.x, c.y));
  assert.deepEqual(crateInfo(3, 42, t.W), crateInfo(3, 42, t.W));
  for (let i = 0; i < 10; i++) {
    const s = spawnFor(t, i, 10);
    assert.ok(s.y < H && !blocked(t, s.x, s.y), `salida ${i} trabada`);
  }
});

// ─── Sala ────────────────────────────────────────────────────────────────────
function lobby(n) {
  let room = newRoom('p0', 'Nico', '🐸', 0);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `J${i}` }, { now: 0 }) || room;
  return room;
}
const start = (room) => applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand: () => 0.3 });

test('cohetes: entran hasta 25 y cada uno con su color', () => {
  const room = lobby(30);
  assert.equal(room.players.length, MAX_PLAYERS);
  assert.equal(new Set(room.players.map((p) => p.color)).size, MAX_PLAYERS);
});

test('cohetes: gana el último vivo; las bajas cuentan para el que pegó y el ranking sale por puesto', () => {
  let room = start(lobby(4));
  const m = room.match.n;
  const t0 = 1000 + COUNTDOWN_MS;
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: 1000 }), null, 'en la cuenta regresiva no se muere');
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, by: 'p0' }, { now: t0 });
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: t0 }), null, 'no se muere dos veces');
  room = applyAction(room, { type: 'died', playerId: 'p2', match: m, by: 'p0' }, { now: t0 });
  room = applyAction(room, { type: 'died', playerId: 'p3', match: m, by: null }, { now: t0 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'p0');
  assert.equal(findPlayer(room, 'p0').kills, 2);
  assert.deepEqual(ranking(room).map((p) => [p.id, p.place]), [['p0', 1], ['p3', 2], ['p2', 3], ['p1', 4]]);
});

test('cohetes: cada moneda y cada caja la agarra uno solo', () => {
  let room = start(lobby(3));
  const m = room.match.n;
  room = applyAction(room, { type: 'coin', playerId: 'p1', match: m, i: 4 }, { now: 5000 });
  assert.equal(applyAction(room, { type: 'coin', playerId: 'p2', match: m, i: 4 }, { now: 5000 }), null);
  assert.equal(findPlayer(room, 'p1').coins, 1);
  room = applyAction(room, { type: 'crate', playerId: 'p2', match: m, i: 0 }, { now: 5000 });
  assert.equal(room.match.crates[0], 'p2');
  assert.equal(applyAction(room, { type: 'crate', playerId: 'p1', match: m, i: 0 }, { now: 5000 }), null);
  assert.equal(applyAction(room, { type: 'coin', playerId: 'p1', match: m - 1, i: 5 }, { now: 5000 }), null, 'una de otra partida no vale');
});

test('cohetes: el que entra con la partida empezada mira, y si alguien se va la partida sigue', () => {
  let room = start(lobby(3));
  room = applyAction(room, { type: 'join', playerId: 'tarde', name: 'Tardío' }, { now: 6000 });
  assert.equal(findPlayer(room, 'tarde').inGame, false);
  assert.equal(applyAction(room, { type: 'coin', playerId: 'tarde', match: room.match.n, i: 1 }, { now: 6000 }), null);
  room = applyAction(room, { type: 'leave', playerId: 'p2' }, { now: 6000 });
  assert.equal(room.phase, 'playing');
  room = applyAction(room, { type: 'leave', playerId: 'p1' }, { now: 6000 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'p0');
});

test('cohetes: la sala con 25 jugadores y todo agarrado entra en el tope', () => {
  let room = start(lobby(MAX_PLAYERS));
  for (let i = 0; i < COIN_COUNT; i++) room.match.coins[i] = `p${i % 25}`;
  for (let i = 0; i < 40; i++) room.match.crates[i] = `p${i % 25}`;
  const size = JSON.stringify(JSON.stringify(room)).length;
  assert.ok(size < 20000, `la sala pesa ${size}`);
});
