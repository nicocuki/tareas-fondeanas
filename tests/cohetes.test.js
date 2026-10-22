import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, MAX_PLAYERS, applyAction, findPlayer, newRoom, ranking } from '../src/cohetes/game.js';
import { carve, decorations, makeTerrain, solid, surfaceY, waterY } from '../src/cohetes/terrain.js';
import {
  ITEMS, MAX_COINS, MAX_CRATES, SHIP_TIME, STEP, addItem, blastOn, coinSpots, crateInfo, mapItems, newTank, overlaps, projectilesFor, push, shipAt, shipFor,
  stepProjectile, stepTank, useItem,
} from '../src/cohetes/sim.js';

const run = (t, p, seconds, dir = 0) => { for (let i = 0; i < seconds / STEP; i++) stepTank(p, dir, STEP, t); };
// Un tanque cayendo sobre la primera tierra debajo de x.
function landed(t, x) {
  const p = newTank(x, surfaceY(t, x, 175) - 30);
  run(t, p, 1.5);
  return p;
}
const xWithGround = (t) => { for (let x = 200; x < t.W; x += 7) { const y = surfaceY(t, x, 175); if (y < t.H - 200) return x; } return 300; };

// ─── Mapa ────────────────────────────────────────────────────────────────────
test('cohetes: la misma semilla arma el mismo mapa, y con los mismos cráteres queda igual', () => {
  const a = makeTerrain(1234, 6), b = makeTerrain(1234, 6);
  assert.deepEqual(a.grid, b.grid);
  carve(a, 300, 300, 20); carve(a, 320, 310, 15);
  carve(b, 320, 310, 15); carve(b, 300, 300, 20);
  assert.deepEqual(a.grid, b.grid, 'cavar en otro orden da lo mismo');
  assert.notDeepEqual(makeTerrain(99, 6).grid, a.grid);
  assert.ok(makeTerrain(1, 25).W > makeTerrain(1, 2).W, 'con más jugadores el mapa es más ancho');
  assert.ok(a.holes.length > 3, 'hay anillos huecos');
  assert.ok(decorations(a, 1234).length > 10, 'hay plantitas arriba de los bloques');
});

test('cohetes: hay mapas de tierra y de hielo, y los dos se arman bien', () => {
  const themes = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const t = makeTerrain(seed, 6);
    themes.add(t.theme);
    assert.ok(t.grid.some((v) => v), `mapa vacío con la semilla ${seed}`);
  }
  assert.deepEqual([...themes].sort(), ['hielo', 'tierra']);
});

test('cohetes: el agua espera a que bajen todos y después sube, más rápido con la opción rápida', () => {
  const H = 1100;
  assert.equal(waterY(0, H), waterY(25, H));
  assert.ok(waterY(120, H) < waterY(60, H));
  assert.ok(waterY(120, H, 1.6) < waterY(120, H, 1));
  assert.ok(waterY(10000, H) > 0);
});

// ─── Tanque ──────────────────────────────────────────────────────────────────
test('cohetes: el tanque cae, se pega a la tierra y maneja sin meterse adentro', () => {
  const t = makeTerrain(7, 6);
  const p = landed(t, xWithGround(t));
  assert.ok(p.stuck, 'quedó pegado al piso');
  assert.ok(!overlaps(t, p.x, p.y), 'no quedó adentro');
  assert.ok(p.ny < -0.5, 'mirando para arriba');
  const x0 = p.x, y0 = p.y;
  run(t, p, 1, 1);
  assert.ok(Math.hypot(p.x - x0, p.y - y0) > 30, 'manejó');
  assert.ok(!overlaps(t, p.x, p.y));
});

test('cohetes: el tanque da toda la vuelta a un bloque pegado: piso, pared, techo', () => {
  // Un bloque cuadrado solo en el medio de la nada.
  const t = { W: 400, H: 400, grid: new Uint8Array(400 * 400), holes: [] };
  for (let y = 150; y < 250; y++) for (let x = 150; x < 250; x++) t.grid[y * 400 + x] = 1;
  const p = newTank(200, 120);
  run(t, p, 1);
  assert.ok(p.stuck && p.ny < -0.9, 'arriba del bloque');
  let minNy = 0, maxNx = 0, ceiling = false;
  for (let i = 0; i < 9 / STEP; i++) {
    stepTank(p, 1, STEP, t);
    maxNx = Math.max(maxNx, p.nx);
    if (p.ny > 0.9) ceiling = true;
    minNy = Math.min(minNy, p.ny);
    assert.ok(p.stuck, `se despegó en (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  }
  assert.ok(maxNx > 0.9, 'anduvo por la pared');
  assert.ok(ceiling, 'anduvo por el techo, cabeza abajo');
});

test('cohetes: cada tecla lleva siempre para el mismo lado del tanque, aunque se suelte y se vuelva a apretar', () => {
  // Cabeza abajo, en el techo de un bloque, D lleva para la izquierda (el mismo sentido en el que da la vuelta).
  const t = { W: 400, H: 400, grid: new Uint8Array(400 * 400), holes: [] };
  for (let y = 150; y < 250; y++) for (let x = 150; x < 250; x++) t.grid[y * 400 + x] = 1;
  const p = newTank(200, 120);
  run(t, p, 1);
  for (let i = 0; i < 12 / STEP && !(p.ny > 0.95 && Math.abs(p.x - 200) < 30); i++) stepTank(p, 1, STEP, t);
  assert.ok(p.ny > 0.95, 'llegó al techo');
  const x0 = p.x;
  run(t, p, 0.1, 0); // suelta la tecla
  run(t, p, 0.3, 1); // y la vuelve a apretar
  assert.ok(p.x < x0 - 3, `siguió para la izquierda (${x0.toFixed(1)} → ${p.x.toFixed(1)})`);
});

test('cohetes: el retroceso de un tiro lo despega y lo hace volar; uno chiquito no', () => {
  const t = makeTerrain(7, 6);
  const p = landed(t, xWithGround(t));
  push(p, 0, -20);
  assert.ok(p.stuck, 'un empujoncito no lo despega');
  const y0 = p.y;
  push(p, 0, -135);
  run(t, p, 0.25);
  assert.ok(!p.stuck && p.y < y0 - 15, `salió volando (${y0} → ${p.y})`);
});

test('cohetes: dos helicópteros, uno de cada lado, salen del agua, suben hasta el medio y bajan hasta el agua', () => {
  const W = 1000, end = SHIP_TIME - 1e-6;
  const H = 1100, level = waterY(0, H);
  const a0 = shipAt(-5, W, H, 0), a1 = shipAt(end, W, H, 0), am = shipAt((SHIP_TIME - 5) / 2, W, H, 0);
  const b0 = shipAt(-5, W, H, 1), b1 = shipAt(end, W, H, 1);
  assert.ok(a0.y < level && a0.y > level - 60, `sale al ras del agua (${a0.y} con el agua en ${level})`);
  assert.ok(a0.x < 0 && a1.x > W, 'el 0 va de izquierda a derecha');
  assert.ok(b0.x > W && b1.x < 0, 'el 1 va de derecha a izquierda');
  assert.ok(Math.abs(a0.y - a1.y) < 8, 'termina a la altura en que salió');
  assert.ok(am.y < 120, 'en el medio va arriba de todo');
  assert.ok(Math.abs(am.x - W / 2) < 5);
  assert.ok(shipAt(SHIP_TIME + 1, W, H, 0).gone);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => shipFor(['a', 'b', 'c', 'd'], id)), [0, 1, 0, 1], 'se reparten de a uno');
});

test('cohetes: con paracaídas se baja despacio', () => {
  const t = makeTerrain(7, 6);
  const p = newTank(xWithGround(t), 90, 'chute');
  run(t, p, 0.5);
  assert.ok(p.vy <= 42 + 1e-6, 'cae despacio');
  run(t, p, 30);
  assert.equal(p.mode, 'tank', 'al tocar tierra se suelta el paracaídas');
  assert.ok(p.stuck);
});

test('cohetes: los cohetes caen un poco, explotan contra la tierra y el daño baja con la distancia', () => {
  const t = makeTerrain(3, 6);
  const x = xWithGround(t);
  const [b] = projectilesFor({ k: 's1', x: x - 100, y: surfaceY(t, x, 175) - 3, a: 0, w: 'rocket' }, 'yo');
  const y0 = b.y;
  const empty = { W: 400, H: 400, grid: new Uint8Array(400 * 400), holes: [] };
  const [b2] = projectilesFor({ k: 's2', x: 10, y: 100, a: 0, w: 'rocket' }, 'yo');
  let hit = null;
  for (let i = 0; i < 600 && !hit && !b.done; i++) hit = stepProjectile(b, STEP, t, []);
  for (let i = 0; i < 30; i++) stepProjectile(b2, STEP, empty, []);
  assert.ok(b2.y > 100 + 0.5 && b2.vy > 0, 'tienen gravedad');
  if (hit) assert.ok(hit.y >= y0, 'cayó, no subió');
  const near = blastOn({ x: 0, y: 0 }, { x: 0, y: 5, w: 'rocket' });
  const far = blastOn({ x: 0, y: 0 }, { x: 0, y: 25, w: 'rocket' });
  assert.ok(near.damage > far.damage);
  assert.equal(blastOn({ x: 0, y: 0 }, { x: 200, y: 0, w: 'rocket' }), null);
  assert.ok(ITEMS.nuke.radius > ITEMS.rocket.radius);
});

test('cohetes: la metralla tira varios, el escudo devuelve, la mina se queda pegada hasta que alguien pasa', () => {
  assert.equal(projectilesFor({ k: 'a', x: 0, y: 0, a: 0, w: 'flak' }, 'yo').length, ITEMS.flak.count);
  assert.equal(projectilesFor({ k: 'a', x: 0, y: 0, a: 0, w: 'shield' }, 'yo').length, 0, 'el escudo no tira nada');
  const empty = { W: 400, H: 400, grid: new Uint8Array(400 * 400), holes: [] };
  const [r] = projectilesFor({ k: 'r', x: 100, y: 200, a: 0, w: 'rocket' }, 'yo');
  for (let i = 0; i < 120 && !r.reflectedBy; i++) stepProjectile(r, STEP, empty, [{ id: 'otro', x: 200, y: 200, shield: true }]);
  assert.equal(r.reflectedBy, 'otro');
  assert.equal(r.owner, 'otro', 'el tiro devuelto es del que tenía el escudo');
  assert.ok(r.vx < 0, 'vuelve para atrás');
  const t = makeTerrain(5, 6);
  const x = xWithGround(t);
  const [m] = projectilesFor({ k: 'm', x, y: surfaceY(t, x, 175) - 20, a: Math.PI / 2, w: 'mine' }, 'yo');
  for (let i = 0; i < 240; i++) assert.equal(stepProjectile(m, STEP, t, []), null);
  assert.ok(m.stuck, 'se pegó');
  assert.ok(stepProjectile(m, STEP, t, [{ id: 'otro', x: m.x + 5, y: m.y - 4 }]), 'alguien cerca la hace explotar');
});

test('cohetes: monedas y cajas salen de la semilla, las monedas en el aire', () => {
  const t = makeTerrain(42, 10);
  const coins = coinSpots(t, 42);
  assert.ok(coins.length > 5 && coins.length <= MAX_COINS);
  assert.deepEqual(coins, coinSpots(makeTerrain(42, 10), 42));
  for (const c of coins) assert.ok(!solid(t, c.x, c.y), 'moneda adentro de la tierra');
  assert.deepEqual(crateInfo(3, 42, t.W), crateInfo(3, 42, t.W));
  const items = mapItems(t, 42);
  assert.ok(items.length > 5, 'hay cajas tiradas por el mapa');
  for (const c of items) {
    assert.ok(c.i < MAX_CRATES && ITEMS[c.weapon]);
    assert.ok(solid(t, c.x, c.y + 1) && !solid(t, c.x, c.y - 3), 'apoyada arriba de la tierra');
  }
});

test('cohetes: el inventario suma lo repetido, usa la primera casilla libre y se vacía al gastarse', () => {
  let inv = [null, null, null];
  inv = addItem(inv, 'nuke');
  inv = addItem(inv, 'heal');
  inv = addItem(inv, 'nuke');
  assert.deepEqual(inv, [{ w: 'nuke', n: 2 }, { w: 'heal', n: 1 }, null]);
  inv = addItem(inv, 'mine');
  assert.equal(addItem(inv, 'laser'), null, 'lleno: no entra otra cosa');
  assert.ok(addItem(inv, 'mine'), 'pero sí una que ya tiene');
  inv = useItem(inv, 2);
  assert.equal(inv[1], null);
  assert.deepEqual(useItem(inv, 1)[0], { w: 'nuke', n: 1 });
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
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, by: 'p0', w: 'nuke' }, { now: t0 });
  assert.equal(room.match.deaths.at(-1).w, 'nuke', 'guarda con qué lo eliminaron');
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
  for (let i = 0; i < MAX_COINS; i++) room.match.coins[i] = `p${i % 25}`;
  for (let i = 0; i < 24; i++) room.match.deaths.push({ id: `p${i}`, by: `p${i + 1}`, w: 'homing' });
  for (let i = 0; i < MAX_CRATES; i++) room.match.crates[i] = `p${i % 25}`;
  const size = JSON.stringify(JSON.stringify(room)).length;
  assert.ok(size < 20000, `la sala pesa ${size}`);
});
