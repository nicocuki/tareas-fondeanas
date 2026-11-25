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
import { GAME_MODES, GAME_MODE_LIST, MODE_CARDS, MODIFIERS, STORM_DPS, STORM_START, hasStorm, hasWater, inStorm, settingsOf, stormAt, stormPhases } from '../src/cohetes/modes.js';
import { ICON_NAMES } from '../src/cohetes/icons.js';
import { fillCircle } from '../src/cohetes/terrain.js';
import { ITEM_DESC, ITEM_LIST, STRIKE_BOMBS, teleportTarget, unstick } from '../src/cohetes/sim.js';
import { BOT_HP, BOT_PREFIX, aimAt, botCount, botId, botSpot, botThink, isBot, newBot } from '../src/cohetes/bots.js';
import { FLAG_REACH, RESPAWN_S, leader, nearFlag, spawnSpot } from '../src/cohetes/ctf.js';
import { ctfColsFor } from '../src/cohetes/terrain.js';

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
  for (const w of ['skull', 'hit', 'wave', 'storm', 'coin', 'crown', 'flag', 'robot']) assert.ok(ICON_NAMES.includes(w), w);
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

// ─── Equipos ─────────────────────────────────────────────────────────────────
test('cohetes: por equipos se reparten parejo, se rebalancea al empezar y gana el último equipo en pie', () => {
  let room = newRoom('p0', 'P0', '🐸');
  for (let i = 1; i < 5; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `P${i}` });
  assert.deepEqual(room.players.map((p) => p.team), [0, 1, 0, 1, 0], 'entran alternados');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p0', options: { gameMode: 'soon' } }), null, 'Próximamente no se puede elegir');
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { gameMode: 'teams' } });
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

// ─── Modos y modificadores ───────────────────────────────────────────────────
test('cohetes: hay tres modos que se pueden elegir y un cuarto «Próximamente» que no', () => {
  assert.deepEqual(GAME_MODE_LIST, ['ffa', 'teams', 'ctf']);
  assert.deepEqual(MODE_CARDS, ['ffa', 'teams', 'ctf', 'soon']);
  assert.equal(GAME_MODES.soon.soon, true);
  let room = newRoom('h', 'Host', '🐸');
  room = applyAction(room, { type: 'join', playerId: 'g', name: 'Guest' });
  assert.equal(room.options.gameMode, 'ffa', 'el default es todos contra todos');
  for (const key of GAME_MODE_LIST) assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { gameMode: key } }).options.gameMode, key);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { gameMode: 'soon' } }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'g', options: { gameMode: 'ctf' } }), null, 'solo el anfitrión');
});

test('cohetes: los modificadores se eligen de a uno por bloque y se acumulan entre bloques', () => {
  assert.deepEqual(Object.keys(MODIFIERS.zone.choices), ['water', 'storm', 'none', 'both']);
  assert.deepEqual(Object.keys(MODIFIERS.life.choices), ['normal', 'titans', 'fragile']);
  assert.deepEqual(Object.keys(MODIFIERS.extra.choices), ['none', 'machines']);
  assert.deepEqual(settingsOf({}), { ...settingsOf({}), gameMode: 'ffa', zone: 'water', life: 'normal', hp: 100, machines: false }, 'por defecto: marea, vida normal, sin extras');
  let room = newRoom('h', 'Host', '🐸');
  for (const options of [{ zone: 'storm' }, { life: 'titans' }, { extra: 'machines' }]) room = applyAction(room, { type: 'setOptions', playerId: 'h', options });
  const s = settingsOf(room.options);
  assert.deepEqual([s.zone, s.hp, s.machines], ['storm', 200, true], 'uno de cada bloque, todos juntos');
  assert.equal(settingsOf({ life: 'fragile' }).hp, 40);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { zone: 'inventada' } }), null);
  assert.equal(hasWater(settingsOf({ zone: 'both' })) && hasStorm(settingsOf({ zone: 'both' })), true, 'peligro total = marea y tormenta');
  assert.equal(hasWater(settingsOf({ zone: 'none' })) || hasStorm(settingsOf({ zone: 'none' })), false, 'sin peligro no cierra nada');
});

// ─── Roba la bandera ─────────────────────────────────────────────────────────
function ctfRoom(n = 4, options = {}) {
  let room = lobby(n);
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { gameMode: 'ctf', ...options } });
  return applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand: () => 0.3 });
}
const T0 = 1000 + COUNTDOWN_MS + 10;
const teamOf = (room, t) => room.players.filter((p) => p.team === t).map((p) => p.id);

test('cohetes: roba la bandera fuerza «Sin peligro» y reparte dos equipos parejos', () => {
  let room = lobby(5);
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { zone: 'storm' } });
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { gameMode: 'ctf' } });
  assert.equal(settingsOf(room.options).zone, 'none');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p0', options: { zone: 'water' } }), null, 'no se puede elegir la zona');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p0', options: { life: 'titans' } }).options.life, 'titans', 'los demás modificadores sí');
  room = applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand: () => 0.3 });
  assert.equal(room.match.mode, 'ctf');
  assert.equal(room.match.teams, true);
  assert.deepEqual(room.match.flags, [null, null]);
  assert.deepEqual(room.match.score, [0, 0]);
  assert.ok(Math.abs(teamOf(room, 0).length - teamOf(room, 1).length) <= 1);
});

test('cohetes: se agarra la bandera rival, se suma un punto en la base y la bandera vuelve', () => {
  let room = ctfRoom(4, { ctfPoints: 3 });
  const m = room.match.n;
  const [a] = teamOf(room, 0), [b] = teamOf(room, 1);
  assert.equal(applyAction(room, { type: 'flagTake', playerId: a, match: m, team: 1 }, { now: 1000 }), null, 'no en la cuenta regresiva');
  assert.equal(applyAction(room, { type: 'flagTake', playerId: a, match: m, team: 0 }, { now: T0 }), null, 'la propia no se roba');
  room = applyAction(room, { type: 'flagTake', playerId: a, match: m, team: 1 }, { now: T0 });
  assert.deepEqual(room.match.flags, [null, a]);
  assert.equal(applyAction(room, { type: 'flagTake', playerId: teamOf(room, 0)[1], match: m, team: 1 }, { now: T0 }), null, 'ya la tiene otro');
  assert.equal(applyAction(room, { type: 'flagCapture', playerId: b, match: m }, { now: T0 }), null, 'sin bandera no se suma');
  room = applyAction(room, { type: 'flagCapture', playerId: a, match: m }, { now: T0 });
  assert.deepEqual(room.match.score, [1, 0]);
  assert.deepEqual(room.match.flags, [null, null], 'la bandera robada vuelve a su base');
  assert.equal(findPlayer(room, a).captures, 1);
});

test('cohetes: no se suma con la bandera propia robada; si el que la lleva muere o se va, vuelve a su base', () => {
  let room = ctfRoom(4);
  const m = room.match.n;
  const [a] = teamOf(room, 0), [b] = teamOf(room, 1);
  room = applyAction(room, { type: 'flagTake', playerId: a, match: m, team: 1 }, { now: T0 });
  room = applyAction(room, { type: 'flagTake', playerId: b, match: m, team: 0 }, { now: T0 });
  assert.deepEqual(room.match.flags, [b, a]);
  assert.equal(applyAction(room, { type: 'flagCapture', playerId: a, match: m }, { now: T0 }), null, 'su bandera no está en la base');
  room = applyAction(room, { type: 'died', playerId: b, match: m, by: a, w: 'rocket' }, { now: T0 });
  assert.deepEqual(room.match.flags, [null, a], 'murió el que llevaba la bandera: vuelve');
  assert.equal(findPlayer(room, b).alive, true, 'en roba la bandera nadie queda afuera');
  assert.equal(findPlayer(room, b).deaths, 1);
  assert.equal(findPlayer(room, a).kills, 1);
  assert.equal(room.phase, 'playing');
  room = applyAction(room, { type: 'leave', playerId: a }, { now: T0 });
  assert.deepEqual(room.match.flags, [null, null], 'se fue el que llevaba la bandera: vuelve');
});

test('cohetes: gana el primero en llegar a los puntos, o por puntos al acabarse el tiempo (empate posible)', () => {
  const score = (room, team) => {
    const [a] = teamOf(room, team);
    room = applyAction(room, { type: 'flagTake', playerId: a, match: room.match.n, team: 1 - team }, { now: T0 });
    return applyAction(room, { type: 'flagCapture', playerId: a, match: room.match.n }, { now: T0 });
  };
  let room = score(ctfRoom(4, { ctfPoints: 3, ctfMinutes: 0 }), 1);
  room = score(room, 1); room = score(room, 0);
  assert.equal(room.phase, 'playing');
  room = score(room, 1);
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winTeam, 1);
  assert.ok(teamOf(room, 1).every((id) => findPlayer(room, id).place === 1));
  // Por tiempo.
  let timed = ctfRoom(4, { ctfPoints: 0, ctfMinutes: 3 });
  assert.equal(timed.match.endsAt, timed.match.startsAt + 180000);
  assert.equal(applyAction(timed, { type: 'tick', playerId: 'p0', match: timed.match.n }, { now: timed.match.endsAt - 1 }), null, 'antes de tiempo no termina');
  timed = score(timed, 0);
  const ended = applyAction(timed, { type: 'tick', playerId: 'p0', match: timed.match.n }, { now: timed.match.endsAt });
  assert.equal(ended.phase, 'final');
  assert.equal(ended.match.winTeam, 0);
  const tie = applyAction(ctfRoom(4, { ctfMinutes: 3 }), { type: 'tick', playerId: 'p0', match: 1 }, { now: 1000 + COUNTDOWN_MS + 180000 });
  assert.equal(tie.match.winTeam, null, 'empatados: no gana nadie');
  assert.equal(leader([2, 2]), null);
});

test('cohetes: con tiempo y puntos en 0 la partida es infinita; solo termina si un equipo se queda sin gente', () => {
  let room = ctfRoom(4, { ctfPoints: 0, ctfMinutes: 0 });
  assert.equal(room.match.endsAt, 0);
  assert.equal(applyAction(room, { type: 'tick', playerId: 'p0', match: room.match.n }, { now: 9e12 }), null, 'el reloj no la termina');
  for (let i = 0; i < 20; i++) {
    const [a] = teamOf(room, 0);
    room = applyAction(room, { type: 'flagTake', playerId: a, match: room.match.n, team: 1 }, { now: T0 });
    room = applyAction(room, { type: 'flagCapture', playerId: a, match: room.match.n }, { now: T0 });
  }
  assert.equal(room.phase, 'playing', '20 puntos y sigue');
  for (const id of teamOf(room, 1)) room = applyAction(room, { type: 'leave', playerId: id }, { now: T0 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winTeam, 0);
});

test('cohetes: en roba la bandera la lista de muertes tiene tope pero se cuentan todas', () => {
  let room = ctfRoom(4);
  const m = room.match.n, [v] = teamOf(room, 0);
  for (let i = 0; i < 40; i++) room = applyAction(room, { type: 'died', playerId: v, match: m, w: 'robot' }, { now: T0 });
  assert.equal(room.match.dn, 40);
  assert.ok(room.match.deaths.length <= 12);
  assert.equal(room.match.deaths.at(-1).w, 'robot');
  assert.equal(findPlayer(room, v).deaths, 40);
  assert.equal(ranking(room)[0].place, 1 && ranking(room)[0].place);
});

test('cohetes: el mapa de roba la bandera es más ancho que alto, parejo entre equipos y con una bandera sobre suelo en cada punta', () => {
  for (const seed of [1, 7, 42, 99, 12345]) {
    const t = makeTerrain(seed, 8, true);
    assert.ok(t.W > t.H * 2.5, `más ancho que alto: ${t.W}×${t.H}`);
    assert.notEqual(t.theme, 'volcan');
    assert.equal(t.ctf, true);
    for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W >> 1; x++) if (t.grid[y * t.W + x] !== t.grid[y * t.W + t.W - 1 - x]) assert.fail(`asimétrico en ${x},${y} (semilla ${seed})`);
    assert.equal(t.bases.length, 2);
    assert.ok(t.bases[0].x < t.W / 3 && t.bases[1].x > (t.W * 2) / 3, 'puntas contrarias');
    for (const b of t.bases) {
      assert.ok(solid(t, b.x, b.y + 4) && solid(t, b.x - 40, b.y + 4) && solid(t, b.x + 40, b.y + 4), 'la bandera está sobre suelo');
      for (let k = 1; k < 100; k += 4) assert.ok(!solid(t, b.x, b.y - k), 'aire arriba de la bandera');
    }
    assert.equal(themeFor(seed, true), t.theme);
  }
  assert.ok(ctfColsFor(25) > ctfColsFor(2) && ctfColsFor(25) % 2 === 0 && ctfColsFor(2) % 2 === 0);
  assert.notEqual(makeTerrain(1, 4, true).W, makeTerrain(1, 4, false).W);
});

test('cohetes: al aparecer en roba la bandera se cae de su lado, a alturas distintas y nunca adentro de la tierra', () => {
  const ys = new Set();
  for (const seed of [3, 8, 21]) {
    const t = makeTerrain(seed, 8, true);
    let k = 0;
    const rand = () => ((k = (k * 9301 + 49297) % 233280), k / 233280 || 0.5);
    for (let i = 0; i < 40; i++) {
      for (const team of [0, 1]) {
        const sp = spawnSpot(t, team, rand);
        assert.ok(!overlaps(t, sp.x, sp.y), 'no aparece adentro de la tierra');
        assert.ok(team === 0 ? sp.x < t.W / 2 : sp.x > t.W / 2, 'de su lado');
        ys.add(Math.round(sp.y / 20));
        const p = newTank(sp.x, sp.y);
        run(t, p, 3);
        assert.ok(p.y < t.H - 40, 'no se cae al fondo');
      }
    }
  }
  assert.ok(ys.size > 5, 'las alturas varían');
  const t = makeTerrain(3, 8, true);
  assert.ok(nearFlag({ x: t.bases[0].x, y: t.bases[0].y - 6 }, t.bases[0]) && !nearFlag({ x: t.bases[0].x + 3 * FLAG_REACH, y: t.bases[0].y }, t.bases[0]));
  assert.equal(RESPAWN_S > 0, true);
});

// ─── Máquinas ────────────────────────────────────────────────────────────────
test('cohetes: las máquinas aparecen en lugares libres, repartidas a lo ancho y siempre iguales para la misma semilla', () => {
  assert.ok(botCount(2) >= 3 && botCount(25) <= 8 && botCount(25) > botCount(2));
  for (const ctf of [false, true]) {
    const t = makeTerrain(11, 8, ctf);
    const n = botCount(8);
    const xs = [];
    for (let i = 0; i < n; i++) {
      const b = newBot(t, 11, i, n);
      assert.ok(!overlaps(t, b.x, b.y), 'no nace adentro de la tierra');
      assert.equal(b.hp, BOT_HP);
      assert.deepEqual(botSpot(t, 11, i, n), botSpot(t, 11, i, n));
      xs.push(b.x);
    }
    assert.ok(Math.max(...xs) - Math.min(...xs) > t.W * 0.4, 'repartidas por el mapa');
    if (ctf) for (let i = 0; i < n; i++) for (const base of t.bases) assert.ok(Math.hypot(botSpot(t, 11, i, n).x - base.x, botSpot(t, 11, i, n).y - base.y) > 200, 'lejos de las banderas');
  }
  assert.notDeepEqual(botSpot(makeTerrain(11, 8), 11, 0, 4, 0), botSpot(makeTerrain(11, 8), 11, 0, 4, 1), 'al volver aparece en otro lado');
  assert.ok(isBot(botId(3)) && botId(3).startsWith(BOT_PREFIX) && !isBot('abcd1234'));
});

test('cohetes: una máquina apunta bien, dispara cuando ve a alguien, se acerca por la superficie y patrulla si no ve a nadie', () => {
  const t = emptyWorld(900, 500);
  const from = { x: 100, y: 300 };
  for (const to of [{ x: 400, y: 300 }, { x: 300, y: 200 }, { x: 150, y: 330 }, { x: 40, y: 280 }]) {
    const a = aimAt(from, to);
    assert.notEqual(a, null);
    const [b] = projectilesFor({ k: 'a', x: from.x, y: from.y, a, w: 'rocket' }, 'bot');
    let near = Infinity;
    for (let i = 0; i < 4 / STEP && !b.done; i++) { stepProjectile(b, STEP, t, []); near = Math.min(near, Math.hypot(b.x - to.x, b.y - to.y)); }
    assert.ok(near < 3, `el cohete pasa a ${near.toFixed(1)} del blanco`);
  }
  assert.equal(aimAt(from, { x: 5000, y: 300 }), null, 'fuera de alcance');
  const bot = { ...newTank(100, 300), nx: 0, ny: -1, dir: 0, turnAt: 0, readyAt: 0 };
  const near = botThink(bot, [{ x: 300, y: 300 }], 10, () => 0.5);
  assert.equal(near.dir, 1, 'va para el lado del enemigo');
  assert.notEqual(near.fire, null, 'dispara');
  assert.equal(botThink(bot, [{ x: 300, y: 300 }], 10.5, () => 0.5).fire, null, 'tiene que recargar');
  assert.equal(botThink({ ...bot, readyAt: 0 }, [{ x: 100, y: 300 + 600 }], 10, () => 0.5).fire, null, 'si está lejos no dispara');
  assert.equal(botThink({ ...bot, x: 500, readyAt: 0 }, [{ x: 300, y: 300 }], 10, () => 0.5).dir, -1, 'si el enemigo está del otro lado, va para allá');
  assert.equal(botThink({ ...bot, readyAt: 0 }, [{ x: 160, y: 300 }], 10, () => 0.5).dir, 0, 'no se les pega demasiado');
  const idle = { ...bot, turnAt: 0 };
  assert.equal(botThink(idle, [], 10, () => 0.9).fire, null);
  assert.ok(idle.turnAt > 10, 'después de elegir rumbo espera un rato');
});

test('cohetes: una explosión lastima a una máquina como a un tanque y las muertes por máquinas quedan anotadas', () => {
  const bot = newBot(makeTerrain(5, 6), 5, 0, 3);
  const hit = blastOn(bot, { x: bot.x + 10, y: bot.y, w: 'rocket', o: 'p1' });
  assert.ok(hit && hit.damage > 0);
  let room = start(lobby(3));
  const m = room.match.n, t0 = 1000 + COUNTDOWN_MS;
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, by: null, w: 'robot' }, { now: t0 });
  assert.deepEqual(room.match.deaths.at(-1), { id: 'p1', by: null, w: 'robot' });
});

// ─── Cuadro de cada objeto ───────────────────────────────────────────────────
test('cohetes: cada objeto (y el cohete) tiene su descripción para el cuadro de abajo a la derecha', () => {
  for (const w of ['rocket', ...ITEM_LIST]) {
    assert.ok(typeof ITEM_DESC[w] === 'string' && ITEM_DESC[w].length > 20, `falta la descripción de ${w}`);
    assert.ok(ITEMS[w].name, w);
  }
});
