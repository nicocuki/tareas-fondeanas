import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, MAX_PLAYERS, applyAction, findPlayer, newRoom, ranking } from '../src/cohetes/game.js';
import { THEMES, themeFor, carve, decorations, makeTerrain, solid, surfaceY, waterY } from '../src/cohetes/terrain.js';
import {
  CHUTE_FALL, DRILL_R, ITEMS, JET_MAX, JET_TIME, MAX_COINS, MAX_CRATES, MAX_DROPS, SHIP_TIME, STEP, addItem, blastOn, chuteBoost, coinSpots, crateInfo, enclosedPockets, jetForce,
  mapItems, newTank, overlaps, projectilesFor, push, shipAt, shipFor, stepProjectile, stepTank, thrust, useItem,
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

test('cohetes: hay diez temas de mapa y todos se arman bien', () => {
  const themes = new Set();
  for (let seed = 1; seed < 400; seed++) {
    const theme = themeFor(seed);
    if (themes.has(theme)) continue;
    themes.add(theme);
    const t = makeTerrain(seed, 6);
    assert.equal(t.theme, theme);
    assert.ok(t.grid.some((v) => v), `mapa vacío con la semilla ${seed}`);
  }
  assert.deepEqual([...themes].sort(), [...THEMES].sort());
  assert.equal(THEMES.length, 10);
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

test('cohetes: dos helicópteros, uno de cada lado, van al ras del agua, suben hasta el medio del mapa y bajan hasta el agua', () => {
  const W = 1000, end = SHIP_TIME - 1e-6;
  const H = 1100, level = waterY(0, H);
  const a0 = shipAt(-5, W, H, 0), a1 = shipAt(end, W, H, 0), am = shipAt((SHIP_TIME - 5) / 2, W, H, 0);
  const b0 = shipAt(-5, W, H, 1), b1 = shipAt(end, W, H, 1);
  assert.ok(a0.y < level && a0.y > level - 60, `sale al ras del agua (${a0.y} con el agua en ${level})`);
  assert.ok(a0.x < 0 && a1.x > W, 'el 0 va de izquierda a derecha');
  assert.ok(b0.x > W && b1.x < 0, 'el 1 va de derecha a izquierda');
  assert.ok(Math.abs(a0.y - a1.y) < 8, 'termina a la altura en que salió');
  assert.ok(Math.abs(am.y - H / 2) < 5, `en el medio va a media altura (${am.y})`);
  assert.ok(Math.abs(shipAt(-2.2, W, H, 0).y - a0.y) < 7, 'hasta que la cuenta llega a 2 va derecho');
  assert.ok(shipAt(0, W, H, 0).y < a0.y - 40, 'después sube');
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
});

test('cohetes: las piezas del mapa flotan sueltas adentro de recintos cerrados, en todos los temas', () => {
  const themes = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const t = makeTerrain(seed, 8);
    themes.add(t.theme);
    const items = mapItems(t, seed);
    assert.deepEqual(items, mapItems(makeTerrain(seed, 8), seed), 'salen de la semilla');
    assert.ok(items.length >= 4, `${t.theme} ${seed}: ${items.length} piezas`);
    const pockets = enclosedPockets(t);
    for (const c of items) {
      assert.ok(c.i >= MAX_DROPS && c.i < MAX_CRATES && ITEMS[c.weapon] && c.float);
      assert.ok(!solid(t, c.x, c.y), 'en el aire, no adentro de la roca');
      assert.ok(pockets.some((pk) => pk.cells.some((cell) => Math.abs(cell.x - c.x) <= 6 && Math.abs(cell.y - c.y) <= 6)), 'hay que romper bloques para llegar');
    }
  }
  assert.ok(themes.has('volcan'));
});

test('cohetes: el volcán tiene el cráter abierto y una cámara sellada con varias piezas', () => {
  let seed = 1;
  while (themeFor(seed) !== 'volcan') seed++;
  const t = makeTerrain(seed, 8);
  const cx = Math.round(t.W / 2);
  // Cráter: aire arriba del todo; más abajo, roca (el tapón) antes de la cámara.
  assert.ok(!solid(t, cx, 300), 'el cráter está abierto');
  assert.ok(solid(t, cx, 285 + 360), 'el tapón de roca cierra la chimenea');
  const pockets = enclosedPockets(t);
  assert.ok(pockets.some((pk) => pk.cells.some((c) => Math.abs(c.x - cx) < 30 && Math.abs(c.y - (285 + 480)) < 30)), 'la cámara de magma es un recinto cerrado');
  const middle = mapItems(t, seed).filter((c) => Math.abs(c.x - cx) < 130 && c.y > 285 + 380 && c.y < 285 + 600);
  assert.ok(middle.length >= 2, 'la cámara grande guarda más de una pieza');
});

// ─── Temas nuevos ────────────────────────────────────────────────────────────
test('cohetes: cada tema nuevo tiene tierra de sobra, huecos y adornos propios', () => {
  for (const theme of THEMES.slice(3)) {
    let seed = 1;
    while (themeFor(seed) !== theme) seed++;
    const t = makeTerrain(seed, 8);
    const fill = t.grid.reduce((s, v) => s + v, 0) / t.grid.length;
    assert.ok(fill > 0.1 && fill < 0.45, `${theme}: ${(fill * 100).toFixed(0)}% de tierra`);
    assert.ok(t.holes.length >= 1, `${theme}: hay huecos`);
    const kinds = new Set(decorations(t, seed).map((d) => d.kind));
    assert.ok(kinds.size >= 2, `${theme}: adornos ${[...kinds]}`);
    for (const k of kinds) assert.ok(!['pine', 'birch', 'flower', 'grass', 'spike', 'crystal', 'shard', 'vent'].includes(k), `${theme} usa un adorno de otro tema (${k})`);
  }
});

// ─── Balas, paracaídas y poderes ─────────────────────────────────────────────
const emptyWorld = (W = 400, H = 600) => ({ W, H, grid: new Uint8Array(W * H), holes: [], theme: 'tierra' });

test('cohetes: las balas caen en arco (con bastante gravedad) pero el láser va derecho', () => {
  const t = emptyWorld();
  const [r] = projectilesFor({ k: 'r', x: 10, y: 100, a: 0, w: 'rocket' }, 'yo');
  const [l] = projectilesFor({ k: 'l', x: 10, y: 100, a: 0, w: 'laser' }, 'yo');
  for (let i = 0; i < 0.5 / STEP; i++) { stepProjectile(r, STEP, t, []); stepProjectile(l, STEP, t, []); }
  assert.ok(r.y - 100 > 20, `el cohete cayó ${(r.y - 100).toFixed(1)} px en medio segundo`);
  assert.equal(l.y, 100, 'el láser no cae');
});

test('cohetes: el láser hace 100 de daño parejo (mata de un tiro) y los demás bajan con la distancia', () => {
  assert.equal(ITEMS.laser.damage, 100);
  assert.equal(blastOn({ x: 0, y: 0 }, { x: 0, y: 2, w: 'laser' }).damage, 100);
  assert.equal(blastOn({ x: 0, y: 0 }, { x: 0, y: 16, w: 'laser' }).damage, 100, 'también en el borde del alcance');
  assert.ok(blastOn({ x: 0, y: 0 }, { x: 0, y: 25, w: 'rocket' }).damage < ITEMS.rocket.damage);
});

test('cohetes: el taladro atraviesa la pared, deja un túnel por donde pasa y explota recién al salir del otro lado', () => {
  const t = emptyWorld(500, 300);
  for (let y = 0; y < t.H; y++) for (let x = 200; x < 240; x++) t.grid[y * t.W + x] = 1;
  const [b] = projectilesFor({ k: 'd', x: 100, y: 150, a: 0, w: 'drill' }, 'yo');
  let hit = null, tunnels = 0;
  for (let i = 0; i < 3000 && !hit && !b.done; i++) {
    hit = stepProjectile(b, STEP, t, []);
    for (const tn of b.tunnels) { carve(t, tn.x, tn.y, DRILL_R); tunnels++; }
    b.tunnels.length = 0;
  }
  assert.ok(hit, 'terminó explotando');
  assert.ok(hit.x > 240, `explotó pasando la pared (x = ${hit.x.toFixed(0)})`);
  assert.ok(tunnels >= 3, `cavó ${tunnels} tramos`);
  for (let x = 200; x < 240; x++) {
    let open = false;
    for (let y = 120; y < 190; y++) if (!solid(t, x, y)) open = true;
    assert.ok(open, `la columna ${x} quedó cerrada: el túnel no es continuo`);
  }
});

test('cohetes: el taladro se corta si la pared es más gruesa que su alcance', () => {
  const t = emptyWorld(900, 300);
  for (let y = 0; y < t.H; y++) for (let x = 200; x < 700; x++) t.grid[y * t.W + x] = 1;
  const [b] = projectilesFor({ k: 'd', x: 100, y: 150, a: 0, w: 'drill' }, 'yo');
  let hit = null;
  for (let i = 0; i < 3000 && !hit && !b.done; i++) { hit = stepProjectile(b, STEP, t, []); for (const tn of b.tunnels) carve(t, tn.x, tn.y, DRILL_R); b.tunnels.length = 0; }
  assert.ok(hit && hit.x < 700 && hit.x > 300, `explotó adentro de la roca (x = ${hit?.x.toFixed(0)})`);
});

test('cohetes: el jetpack dura más, empuja fuerte hasta un tope de velocidad y apuntando para abajo sube', () => {
  assert.ok(JET_TIME >= 3, 'dura bastante');
  const f = jetForce(Math.PI / 2);
  assert.ok(f.y < 0 && Math.abs(f.y) > 400, `apuntando para abajo empuja ${f.y.toFixed(0)} hacia arriba`);
  const t = emptyWorld(400, 900);
  const p = newTank(200, 800, 'tank');
  p.stuck = false;
  let top = 0;
  for (let i = 0; i < JET_TIME / STEP; i++) {
    thrust(p, f.x, f.y, STEP, JET_MAX);
    stepTank(p, 0, STEP, t);
    top = Math.max(top, Math.hypot(p.vx, p.vy));
  }
  assert.ok(800 - p.y > 250, `subió ${(800 - p.y).toFixed(0)} px`);
  assert.ok(top <= JET_MAX + 25, `la velocidad se queda cerca del tope (${top.toFixed(0)})`);
});

test('cohetes: en paracaídas, el «disparo» es un impulso suave que se apaga solo y sin daño', () => {
  const t = emptyWorld(400, 3000);
  const p = newTank(200, 200, 'chute');
  run(t, p, 1);
  assert.ok(Math.abs(p.vy - CHUTE_FALL) < 4, 'cae despacio');
  const y0 = p.y;
  chuteBoost(p, Math.PI / 2); // apunta para abajo: el impulso va para arriba
  assert.ok(p.vy < 0, 'sube con el impulso');
  run(t, p, 0.4);
  assert.ok(p.y < y0, 'quedó más arriba de donde estaba');
  run(t, p, 6);
  assert.ok(Math.abs(p.vy - CHUTE_FALL) < 3, 'vuelve a la caída lenta');
  const tank = newTank(200, 200, 'tank');
  chuteBoost(tank, 0);
  assert.equal(tank.vx, 0, 'solo vale en paracaídas');
  assert.equal(p.hp, 100, 'no lastima');
});

test('cohetes: el helicóptero se mueve sin quiebres (altura e inclinación suaves)', () => {
  const W = 1200, H = 1100;
  let prev = shipAt(-5, W, H, 0), prevDy = null, worst = 0;
  for (let s = -5 + 1 / 60; s < SHIP_TIME; s += 1 / 60) {
    const a = shipAt(s, W, H, 0);
    const dy = a.y - prev.y;
    if (prevDy !== null) worst = Math.max(worst, Math.abs(dy - prevDy));
    assert.ok(Math.abs(a.pitch) <= 0.5 + 1e-9, 'inclinación acotada');
    prev = a; prevDy = dy;
  }
  assert.ok(worst < 0.06, `cambio brusco de velocidad vertical: ${worst.toFixed(3)}`);
  assert.ok(shipAt(2, W, H, 0).pitch < 0 && shipAt(11, W, H, 0).pitch > 0, 'sube con el morro arriba y baja con el morro abajo');
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

// ─── Modos de juego ──────────────────────────────────────────────────────────
import { MODES, MODE_LIST, STORM_DPS, STORM_START, hasStorm, hasWater, inStorm, modeOf, startKit, stormAt, stormPhases } from '../src/cohetes/modes.js';
import { ICON_NAMES } from '../src/cohetes/icons.js';
import { fillCircle } from '../src/cohetes/terrain.js';
import { ITEM_LIST, STRIKE_BOMBS, teleportTarget, unstick } from '../src/cohetes/sim.js';

test('cohetes: hay ocho modos con zona válida y el anfitrión puede elegir cualquiera', () => {
  assert.equal(MODE_LIST.length, 8);
  for (const key of MODE_LIST) {
    const m = MODES[key];
    assert.ok(['water', 'storm', 'both'].includes(m.zone), key);
    assert.ok(m.hp > 0 && m.g > 0 && m.reload > 0 && m.crates > 0 && m.name && m.blurb, key);
    assert.equal(hasWater(m) || hasStorm(m), true);
  }
  assert.equal(modeOf({}).name, MODES.water.name, 'una sala vieja sin modo es Marea alta');
  assert.equal(modeOf({ mode: 'inventado' }), MODES.water);
  let room = newRoom('h', 'Host', '🐸');
  room = applyAction(room, { type: 'join', playerId: 'g', name: 'Guest' });
  for (const key of MODE_LIST) {
    const next = applyAction(room, { type: 'setOptions', playerId: 'h', options: { mode: key } });
    assert.equal(next.options.mode, key);
  }
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { mode: 'inventado' } }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'g', options: { mode: 'storm' } }), null, 'solo el anfitrión');
});

test('cohetes: la tormenta cubre todo el mapa al principio, se cierra por fases y cada círculo cabe en el anterior', () => {
  const W = 2400, H = 1300;
  for (const seed of [1, 7, 99, 12345]) {
    const phases = stormPhases(seed, W, H);
    const first = stormAt(0, seed, W, H);
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) assert.ok(!inStorm(first, x, y), 'las esquinas empiezan adentro');
    for (let k = 1; k < phases.length; k++) {
      const a = phases[k - 1], b = phases[k];
      assert.ok(b.r <= a.r, `la fase ${k} no es más grande`);
      assert.ok(Math.hypot(b.x - a.x, b.y - a.y) + b.r <= a.r + 1e-6, `la fase ${k} cabe adentro de la anterior (semilla ${seed})`);
    }
    let prev = Infinity;
    for (let s = 0; s < 400; s += 0.5) {
      const st = stormAt(s, seed, W, H);
      assert.ok(st.r <= prev + 1e-6, 'el radio nunca crece');
      prev = st.r;
    }
    assert.ok(stormAt(400, seed, W, H).r < 30, 'al final queda casi nada');
    assert.equal(stormAt(STORM_START - 1, seed, W, H).r, first.r, 'no se mueve mientras bajan todos');
    assert.deepEqual(stormAt(55, seed, W, H), stormAt(55, seed, W, H));
  }
  assert.equal(STORM_DPS, 10);
  assert.ok(stormAt(100, 5, W, H, 1.6).r < stormAt(100, 5, W, H, 0.6).r, 'más rápida, más cerrada');
});

test('cohetes: el arsenal inicial es siempre el mismo para el mismo jugador, sin repetir ni curitas', () => {
  const kit = startKit(123, 'ana', 3);
  assert.deepEqual(kit, startKit(123, 'ana', 3));
  assert.equal(new Set(kit).size, 3);
  assert.ok(!kit.includes('heal'));
  assert.notDeepEqual(startKit(123, 'ana', 3), startKit(123, 'beto', 3));
  assert.deepEqual(startKit(1, 'x', 0), []);
});

test('cohetes: morir en la tormenta queda anotado y no cuenta como baja de nadie', () => {
  let room = start(lobby(3));
  const m = room.match.n, t0 = 1000 + COUNTDOWN_MS;
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, w: 'storm' }, { now: t0 });
  assert.deepEqual(room.match.deaths.at(-1), { id: 'p1', by: null, w: 'storm' });
  room = applyAction(room, { type: 'died', playerId: 'p2', match: m, w: 'cualquiera' }, { now: t0 });
  assert.equal(room.match.deaths.at(-1).w, null, 'una causa inventada se descarta');
});

test('cohetes: cada objeto tiene su ícono dibujado y los nuevos se pueden agarrar de las cajas', () => {
  for (const w of [...ITEM_LIST, 'airbomb']) assert.ok(ICON_NAMES.includes(w), `falta el ícono de ${w}`);
  for (const w of ['skull', 'hit', 'wave', 'storm', 'coin', 'crown']) assert.ok(ICON_NAMES.includes(w), w);
  for (const w of ['teleport', 'turbo', 'shock', 'medkit', 'triple', 'bounce', 'cement', 'strike']) assert.ok(ITEM_LIST.includes(w), w);
  for (const i of [0, 10, 50]) assert.ok(ITEM_LIST.includes(crateInfo(i, 77, 2000).weapon));
  assert.ok(crateInfo(5, 77, 2000, 3).at < crateInfo(5, 77, 2000, 10).at, 'con cajas más seguidas, caen antes');
  assert.equal(STRIKE_BOMBS, 6);
});

test('cohetes: el teletransporte llega lo más lejos que se pueda en línea recta y no entra en la tierra', () => {
  const t = emptyWorld(600, 300);
  const to = teleportTarget(t, { x: 100, y: 100 }, 0, 400);
  assert.ok(to && Math.abs(to.x - 360) < 3 && to.y === 100, 'sin tope llega al alcance máximo (260)');
  assert.ok(Math.abs(teleportTarget(t, { x: 100, y: 100 }, 0, 80).x - 180) < 3, 'o hasta donde apuntás');
  // Con tierra en el destino, aparece del lado libre más lejano.
  for (let y = 0; y < 300; y++) for (let x = 300; x < 340; x++) t.grid[y * t.W + x] = 1;
  const p = teleportTarget(t, { x: 100, y: 100 }, 0, 260);
  assert.ok(p && !overlaps(t, p.x, p.y), 'no queda adentro de la tierra');
  // Un sólido total: no hay lugar.
  t.grid.fill(1);
  assert.equal(teleportTarget(t, { x: 100, y: 100 }, 0, 260), null);
});

test('cohetes: el rebotador rebota contra la pared y explota después del último rebote', () => {
  const t = emptyWorld(600, 300);
  for (let y = 0; y < 300; y++) for (let x = 400; x < 420; x++) t.grid[y * t.W + x] = 1; // una pared
  const [b] = projectilesFor({ k: 'b', x: 300, y: 150, a: 0, w: 'bounce' }, 'yo');
  let vxBefore = b.vx, bounced = false, boom = null;
  for (let i = 0; i < 6 / STEP && !boom; i++) {
    boom = stepProjectile(b, STEP, t, []);
    if (!bounced && b.vx < 0) { bounced = true; assert.ok(vxBefore > 0); }
  }
  assert.ok(bounced, 'dio la vuelta al pegar');
  assert.ok(boom || b.done, 'al final explota');
});

test('cohetes: el cemento no le pega a los tanques, solo explota contra la tierra y rellena', () => {
  const t = emptyWorld(600, 300);
  for (let y = 200; y < 300; y++) for (let x = 0; x < 600; x++) t.grid[y * t.W + x] = 1; // piso
  const [b] = projectilesFor({ k: 'c', x: 100, y: 150, a: 0.4, w: 'cement' }, 'yo');
  let hit = null;
  for (let i = 0; i < 6 / STEP && !hit && !b.done; i++) hit = stepProjectile(b, STEP, t, [{ id: 'otro', x: b.x + 1, y: b.y, shield: false }]);
  assert.ok(hit, 'explotó contra el piso aunque había un tanque en el camino');
  assert.ok(!solid(t, hit.x, hit.y), 'justo antes de la pared, en el aire');
  const before = t.grid.reduce((a, v) => a + v, 0);
  assert.ok(fillCircle(t, hit.x, hit.y, 17));
  assert.ok(t.grid.reduce((a, v) => a + v, 0) > before, 'agregó tierra');
  // En el aire no hace nada: se acaba su vida sin explotar.
  const sky = emptyWorld(600, 3000);
  const [air] = projectilesFor({ k: 'd', x: 100, y: 1500, a: -Math.PI / 2, w: 'cement' }, 'yo');
  let boom = null;
  for (let i = 0; i < 5 / STEP && !air.done; i++) boom = boom || stepProjectile(air, STEP, sky, []);
  assert.ok(air.done, 'se le acaba la vida');
  assert.equal(boom, null);
});

test('cohetes: sacar a un tanque de adentro del cemento lo deja en el aire libre', () => {
  const t = emptyWorld(300, 300);
  const p = newTank(150, 150);
  fillCircle(t, 150, 150, 14);
  assert.ok(overlaps(t, p.x, p.y));
  unstick(t, p);
  assert.ok(!overlaps(t, p.x, p.y));
});

test('cohetes: la gravedad del modo Luna hace caer más despacio a los tanques y a los cohetes', () => {
  const t = emptyWorld(600, 600);
  const a = newTank(100, 50), b = newTank(100, 50);
  for (let i = 0; i < 0.5 / STEP; i++) { stepTank(a, 0, STEP, t); stepTank(b, 0, STEP, t, { g: MODES.moon.g }); }
  assert.ok(b.y - 50 < (a.y - 50) * 0.6, 'cae menos');
  const [r1] = projectilesFor({ k: 'r1', x: 10, y: 100, a: 0, w: 'rocket' }, 'yo');
  const [r2] = projectilesFor({ k: 'r2', x: 10, y: 100, a: 0, w: 'rocket' }, 'yo');
  for (let i = 0; i < 0.5 / STEP; i++) { stepProjectile(r1, STEP, t, [], 1); stepProjectile(r2, STEP, t, [], MODES.moon.g); }
  assert.ok(r2.y - 100 < (r1.y - 100) * 0.6);
});

// ─── Equipos ─────────────────────────────────────────────────────────────────
test('cohetes: por equipos se reparten parejo, se rebalancea al empezar y gana el último equipo en pie', () => {
  let room = newRoom('p0', 'P0', '🐸');
  for (let i = 1; i < 5; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `P${i}` });
  assert.deepEqual(room.players.map((p) => p.team), [0, 1, 0, 1, 0], 'entran alternados');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p0', options: { teams: 3 } }), null);
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { teams: 2 } });
  for (const id of ['p1', 'p3']) room = applyAction(room, { type: 'setTeam', playerId: id, team: 0 });
  assert.equal(applyAction(room, { type: 'setTeam', playerId: 'p1', target: 'p2', team: 1 }), null, 'solo el anfitrión mueve a otro');
  room = applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000 });
  const count = (t) => room.players.filter((p) => p.team === t).length;
  assert.ok(Math.abs(count(0) - count(1)) <= 1, 'quedaron parejos');
  assert.equal(room.match.teams, true);
  const m = room.match.n, t0 = 1000 + COUNTDOWN_MS;
  const team1 = room.players.filter((p) => p.team === 1).map((p) => p.id);
  const team0 = room.players.filter((p) => p.team === 0).map((p) => p.id);
  // Una baja a un compañero no suma.
  room = applyAction(room, { type: 'died', playerId: team0[0], match: m, by: team0[1] }, { now: t0 });
  assert.equal(findPlayer(room, team0[1]).kills, 0);
  for (const id of team0.slice(1)) room = applyAction(room, { type: 'died', playerId: id, match: m, by: team1[0] }, { now: t0 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winTeam, 1);
  assert.ok(team1.every((id) => findPlayer(room, id).place === 1), 'todo el equipo ganador es primero');
});
