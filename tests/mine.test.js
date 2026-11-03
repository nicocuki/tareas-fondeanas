import test from 'node:test';
import assert from 'node:assert/strict';
import { B, ITEMS, RECIPES, addItem, armorPoints, breakInfo, canCraft, count, craft, dropOf, emptyInv, isSolid, reduceDamage } from '../src/mine/blocks.js';
import { H, SEA, W, animalSpawns, at, makeWorld, solidAt, spawnPoint } from '../src/mine/world.js';
import { LOCATOR_RANGE, MOBS, STEP, computeLight, daylight, locatorMarks, newMob, newPlayer, placeProblem, stepMob, stepPlayer, stepVitals, takeHit } from '../src/mine/sim.js';
import { GRACE_MINUTES, MAX_PLAYERS, MODES, PREP_MS, applyAction, graceEnd, newRoom, pvpOn, startProblem } from '../src/mine/game.js';

const SEED = 12345;

// ─── El mundo ────────────────────────────────────────────────────────────────
test('el mundo sale igual de la misma semilla y distinto de otra', () => {
  const a = makeWorld(SEED), b = makeWorld(SEED), c = makeWorld(SEED + 1);
  assert.equal(a.t.length, W * H);
  assert.deepEqual(a.t, b.t);
  assert.notDeepEqual(a.t, c.t);
});

test('el mundo tiene lecho de roca abajo, cielo arriba, agua, lava, cuevas y todas las menas', () => {
  const w = makeWorld(SEED);
  const seen = new Set(w.t);
  for (const k of ['grass', 'dirt', 'stone', 'treelog', 'treeleaves', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'bedrock', 'lava']) {
    assert.ok(seen.has(B[k]), `falta ${k}`);
  }
  // El agua y la arena dependen de que la semilla traiga mar o desierto: se miran varias.
  const more = new Set();
  for (const seed of [1, 2, 3, 4, 5, 99]) for (const id of makeWorld(seed).t) more.add(id);
  for (const k of ['sand', 'water', 'snow', 'cactus', 'sandstone', 'gravel']) assert.ok(more.has(B[k]), `falta ${k}`);
  for (let x = 0; x < W; x++) {
    assert.equal(at(w, x, H - 1), B.bedrock);
    assert.equal(at(w, x, 0), B.air);
  }
  // Hay cuevas: aire por debajo de la superficie.
  let caves = 0;
  for (let x = 0; x < W; x++) for (let y = w.surf[x] + 4; y < H - 15; y++) if (w.t[y * W + x] === B.air) caves++;
  assert.ok(caves > 1500, `pocas cuevas: ${caves}`);
});

test('los minerales están a su profundidad: el diamante solo hondo, el carbón por todos lados', () => {
  const w = makeWorld(SEED);
  let minDiamond = H, minGold = H, coal = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = w.t[y * W + x];
    if (id === B.diamond_ore) minDiamond = Math.min(minDiamond, y);
    if (id === B.gold_ore) minGold = Math.min(minGold, y);
    if (id === B.coal_ore) coal++;
  }
  assert.ok(minDiamond >= 95, `diamante muy arriba: ${minDiamond}`);
  assert.ok(minGold >= 80, `oro muy arriba: ${minGold}`);
  assert.ok(coal > 200);
});

test('varias semillas dan los cinco biomas y todos los lugares de aparición son tierra firme', () => {
  const biomes = new Set();
  for (const seed of [1, 2, 3, 4, 5, 99, 4242, 77777]) {
    const w = makeWorld(seed);
    for (const b of w.biome) biomes.add(b);
    for (let i = 0; i < 8; i++) {
      const sp = spawnPoint(w, i, 8);
      const x = Math.floor(sp.x), y = Math.floor(sp.y - 0.01);
      assert.ok(!solidAt(w, x, y) && !solidAt(w, x, y - 1), `seed ${seed} #${i}: aparece adentro de un bloque`);
      assert.ok(solidAt(w, x, y + 1) || solidAt(w, x, y + 2), `seed ${seed} #${i}: aparece en el aire`);
      assert.notEqual(at(w, x, y), B.water);
      assert.ok(w.surf[x] < SEA, `seed ${seed} #${i}: aparece en el mar`);
    }
  }
  for (const b of ['plains', 'forest', 'desert', 'snow', 'mountains']) assert.ok(biomes.has(b), `falta el bioma ${b}`);
});

test('cada jugador aparece lejos de los demás', () => {
  const w = makeWorld(SEED);
  const xs = Array.from({ length: 8 }, (_, i) => spawnPoint(w, i, 8).x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 20, 'aparecen muy juntos');
});

test('hay animales en el mapa y salen siempre los mismos', () => {
  const w = makeWorld(SEED);
  const a = animalSpawns(w);
  assert.ok(a.length > 15);
  assert.deepEqual(a, animalSpawns(w));
  assert.ok(a.every((m) => at(w, Math.floor(m.x), Math.floor(m.y - 0.1)) === B.air));
});

test('la luz baja de cielo y se apaga en las cuevas', () => {
  const w = makeWorld(SEED);
  const light = new Uint8Array(W * H);
  computeLight(w, light);
  const x = 100;
  assert.equal(light[(w.surf[x] - 1) * W + x], 15);
  assert.equal(light[(H - 5) * W + x], 0);
});

test('los árboles del mundo se atraviesan pero se rompen; los troncos y hojas puestos son sólidos', () => {
  assert.equal(isSolid(B.treelog), false);
  assert.equal(isSolid(B.treeleaves), false);
  assert.equal(isSolid(B.log), true);
  assert.equal(isSolid(B.leaves), true);
  assert.ok(!ITEMS.treelog && !ITEMS.treeleaves, 'los árboles naturales no son ítems');
  assert.equal(dropOf(B.treelog, true), 'log');
  assert.equal(dropOf(B.treeleaves, true, () => 0.01), 'apple');
  assert.equal(breakInfo(B.treelog, 'iron_axe').time, breakInfo(B.log, 'iron_axe').time);
  assert.ok(Number.isFinite(breakInfo(B.treeleaves, null).time));
  // El mundo solo trae árboles naturales: un tronco sólido solo aparece si lo pone un jugador.
  const w = makeWorld(SEED);
  assert.ok(!w.t.includes(B.log) && !w.t.includes(B.leaves));
});

test('el jugador camina a través de un árbol natural y se frena contra uno puesto', () => {
  const w = flatWorld();
  for (let y = 56; y < 60; y++) w.t[y * W + 55] = B.treelog;
  const p = newPlayer(50.5, 60);
  run(w, p, { ...noInput, right: true }, 3);
  assert.ok(p.x > 58, `no atravesó el tronco: x = ${p.x}`);
  const w2 = flatWorld();
  for (let y = 56; y < 60; y++) w2.t[y * W + 55] = B.log;
  const q = newPlayer(50.5, 60);
  run(w2, q, { ...noInput, right: true }, 3);
  assert.ok(q.x < 55, `atravesó un tronco puesto: x = ${q.x}`);
});

// ─── Bloques, herramientas y recetas ─────────────────────────────────────────
test('la piedra con las manos no suelta nada y con pico de madera suelta roca', () => {
  assert.equal(breakInfo(B.stone, null).drops, false);
  assert.equal(breakInfo(B.stone, 'wood_pickaxe').drops, true);
  assert.equal(dropOf(B.stone, true), 'cobble');
  assert.equal(dropOf(B.stone, false), null);
  assert.ok(breakInfo(B.stone, 'wood_pickaxe').time < breakInfo(B.stone, null).time / 5);
});

test('el hierro pide pico de piedra y el oro y el diamante, pico de hierro', () => {
  assert.equal(breakInfo(B.iron_ore, 'wood_pickaxe').drops, false);
  assert.equal(breakInfo(B.iron_ore, 'stone_pickaxe').drops, true);
  assert.equal(breakInfo(B.diamond_ore, 'stone_pickaxe').drops, false);
  assert.equal(breakInfo(B.diamond_ore, 'iron_pickaxe').drops, true);
  assert.equal(breakInfo(B.gold_ore, 'iron_pickaxe').drops, true);
  assert.equal(dropOf(B.diamond_ore, true), 'diamond');
  assert.equal(dropOf(B.coal_ore, true), 'coal');
  assert.equal(breakInfo(B.bedrock, 'diamond_pickaxe').time, Infinity);
});

test('el hacha es mejor para la madera y la pala para la tierra', () => {
  assert.ok(breakInfo(B.log, 'iron_axe').time < breakInfo(B.log, 'iron_pickaxe').time);
  assert.ok(breakInfo(B.dirt, 'iron_shovel').time < breakInfo(B.dirt, null).time);
});

test('las hojas a veces sueltan una manzana', () => {
  assert.equal(dropOf(B.leaves, true, () => 0.01), 'apple');
  assert.equal(dropOf(B.leaves, true, () => 0.9), null);
});

test('del tronco al pico de diamante: se puede fabricar todo en cadena', () => {
  const inv = emptyInv();
  const make = (out) => assert.ok(craft(inv, RECIPES.find((r) => r.out === out)), `no se pudo hacer ${out}`);
  addItem(inv, 'log', 4);
  make('planks'); make('planks'); make('planks'); // 12 tablones
  make('table'); // 8
  make('stick'); // 6 tablones, 4 palos
  make('wood_pickaxe'); // 3 tablones + 2 palos
  assert.equal(count(inv, 'planks'), 0 + 12 - 4 - 2 - 3);
  addItem(inv, 'diamond', 3);
  addItem(inv, 'stick', 4);
  make('diamond_pickaxe');
  assert.ok(ITEMS.diamond_pickaxe.tier === 4);
  assert.equal(inv.find((s) => s?.i === 'diamond_pickaxe').d, ITEMS.diamond_pickaxe.dur);
});

test('si no entra lo fabricado no se gasta nada', () => {
  const inv = Array.from({ length: 36 }, () => ({ i: 'dirt', n: 64 }));
  inv[0] = { i: 'log', n: 2 };
  const r = RECIPES.find((x) => x.out === 'planks');
  assert.ok(canCraft(inv, r));
  assert.equal(craft(inv, r), false);
  assert.equal(inv[0].n, 2);
});

test('todas las recetas se pueden fabricar con lo que piden y las de armadura existen', () => {
  for (const r of RECIPES) {
    assert.ok(ITEMS[r.out], `ítem desconocido ${r.out}`);
    for (const k of Object.keys(r.in)) assert.ok(ITEMS[k], `ingrediente desconocido ${k}`);
  }
  for (const mat of ['leather', 'iron', 'gold', 'diamond']) for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) assert.ok(RECIPES.some((r) => r.out === `${mat}_${piece}`));
});

test('la armadura completa de diamante frena el 80 % del daño y la de cuero, mucho menos', () => {
  const diamond = ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots'];
  const leather = ['leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots'];
  assert.equal(armorPoints(diamond), 20);
  assert.ok(Math.abs(reduceDamage(10, diamond) - 2) < 1e-9);
  assert.equal(armorPoints(leather), 7);
  assert.ok(reduceDamage(10, leather) > 7);
  assert.equal(reduceDamage(10, [null, null, null, null]), 10);
});

// ─── Física ──────────────────────────────────────────────────────────────────
function flatWorld() {
  const t = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 60; y < H; y++) t[y * W + x] = B.stone;
  return { t, surf: new Int16Array(W).fill(60), biome: new Array(W).fill('plains'), seed: 1 };
}
const noInput = { left: false, right: false, jump: false, sneak: false, sprint: false };
const run = (w, p, input, seconds) => { let ev = {}; for (let i = 0; i < seconds / STEP; i++) ev = { ...ev, ...stepPlayer(w, p, input, STEP) }; return ev; };

test('el jugador cae y se apoya en el piso', () => {
  const w = flatWorld();
  const p = newPlayer(50.5, 50);
  run(w, p, noInput, 2);
  assert.ok(p.onGround);
  assert.ok(Math.abs(p.y - 60) < 0.01, `y = ${p.y}`);
});

test('no atraviesa paredes y un escalón de un bloque se sube solo', () => {
  const w = flatWorld();
  for (let y = 40; y < 60; y++) w.t[y * W + 55] = B.stone; // pared alta
  const p = newPlayer(50.5, 60);
  run(w, p, { ...noInput, right: true }, 3);
  assert.ok(p.x < 55 - 0.3 + 0.01, `atravesó: x = ${p.x}`);
  const w2 = flatWorld();
  w2.t[59 * W + 55] = B.stone; // un escalón
  const q = newPlayer(50.5, 60);
  run(w2, q, { ...noInput, right: true }, 2);
  assert.ok(q.x > 56, `no subió el escalón: x = ${q.x}`);
  assert.ok(q.y < 60);
});

test('saltar sube cerca de un bloque y poco más, y no se salta en el aire', () => {
  const w = flatWorld();
  const p = newPlayer(50.5, 60);
  run(w, p, noInput, 0.2);
  let top = p.y;
  for (let i = 0; i < 1 / STEP; i++) { stepPlayer(w, p, { ...noInput, jump: true }, STEP); top = Math.min(top, p.y); }
  assert.ok(60 - top > 1 && 60 - top < 1.6, `saltó ${60 - top}`);
});

test('agachado no se cae por el borde', () => {
  const w = flatWorld();
  for (let x = 60; x < W; x++) for (let y = 60; y < H; y++) w.t[y * W + x] = B.air; // un precipicio
  const p = newPlayer(58.5, 60);
  run(w, p, { ...noInput, right: true, sneak: true }, 4);
  assert.ok(p.onGround && p.x < 60.3, `se cayó: x = ${p.x}, y = ${p.y}`);
});

test('caerse de alto lastima y de poco no', () => {
  const w = flatWorld();
  const low = newPlayer(50.5, 57);
  assert.equal(run(w, low, noInput, 2).landed, undefined);
  const high = newPlayer(50.5, 35);
  assert.ok(run(w, high, noInput, 3).landed >= 20);
});

test('el agua frena la caída y no lastima', () => {
  const w = flatWorld();
  for (let y = 50; y < 60; y++) for (let x = 40; x < 60; x++) w.t[y * W + x] = B.water;
  const p = newPlayer(50.5, 30);
  const ev = run(w, p, noInput, 5);
  assert.equal(ev.landed, undefined);
  assert.ok(p.swim || p.onGround);
});

test('sin aire bajo el agua el jugador se ahoga y la lava quema', () => {
  const w = flatWorld();
  for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) w.t[y * W + x] = B.water;
  const p = newPlayer(50.5, 59);
  for (let i = 0; i < 20 / STEP; i++) { stepPlayer(w, p, noInput, STEP); stepVitals(w, p, STEP, i * STEP, false); }
  assert.ok(p.hp < 20, 'no se ahogó');
  const lava = flatWorld();
  for (let y = 55; y < 60; y++) for (let x = 40; x < 60; x++) lava.t[y * W + x] = B.lava;
  const q = newPlayer(50.5, 59);
  for (let i = 0; i < 1 / STEP; i++) { stepPlayer(lava, q, noInput, STEP); stepVitals(lava, q, STEP, i * STEP, false); }
  assert.ok(q.hp < 16, `la lava no quema: ${q.hp}`);
});

test('la panza llena regenera vida y la vacía ya no', () => {
  const w = flatWorld();
  const p = newPlayer(50.5, 60);
  p.hp = 10;
  for (let i = 0; i < 9 / STEP; i++) stepVitals(w, p, STEP, i * STEP, false);
  assert.ok(p.hp >= 12, `no regeneró: ${p.hp}`);
  const q = newPlayer(50.5, 60);
  q.hp = 10; q.food = 5;
  for (let i = 0; i < 9 / STEP; i++) stepVitals(w, q, STEP, i * STEP, false);
  assert.ok(q.hp <= 10);
});

test('un golpe lastima menos con armadura y empuja', () => {
  const p = newPlayer(50.5, 60);
  const q = newPlayer(50.5, 60);
  q.armor = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'];
  takeHit(p, 6, 'x', 'iron_sword', 1, 1);
  takeHit(q, 6, 'x', 'iron_sword', 1, 1);
  assert.equal(p.hp, 14);
  assert.ok(q.hp > p.hp);
  assert.ok(p.vx > 0 && p.vy < 0);
  assert.equal(p.lastBy, 'x');
});

test('no se puede poner un bloque adentro tuyo ni en el aire ni muy lejos', () => {
  const w = flatWorld();
  const p = newPlayer(50.5, 60);
  assert.ok(placeProblem(w, p, 50, 59, B.dirt), 'adentro mío');
  assert.ok(placeProblem(w, p, 52, 55, B.dirt), 'en el aire');
  assert.ok(placeProblem(w, p, 70, 59, B.dirt), 'muy lejos');
  assert.equal(placeProblem(w, p, 53, 59, B.dirt), null);
});

// ─── Barra localizadora ──────────────────────────────────────────────────────
test('la barra muestra a los cercanos, no a los que se agachan ni a los lejanos', () => {
  const me = { x: 100, y: 50 };
  const marks = locatorMarks(me, [
    { id: 'a', x: 130, y: 50, color: '#f00', name: 'A' },
    { id: 'b', x: 60, y: 70, color: '#0f0', name: 'B' },
    { id: 'c', x: 110, y: 50, sneak: 1, color: '#00f', name: 'C' },
    { id: 'd', x: 100 + LOCATOR_RANGE + 5, y: 50, color: '#ff0', name: 'D' },
    { id: 'e', x: 90, y: 50, dead: 1, color: '#0ff', name: 'E' },
  ]);
  assert.deepEqual(marks.map((m) => m.id).sort(), ['a', 'b']);
  const a = marks.find((m) => m.id === 'a'), b = marks.find((m) => m.id === 'b');
  assert.ok(a.pos > 0 && b.pos < 0, 'derecha e izquierda');
  assert.equal(b.vert, 1, 'B está más abajo');
  assert.equal(a.vert, 0);
  assert.ok(a.pos < 1 && b.pos > -1);
});

test('de día hay luz y de noche no; arranca de mañana', () => {
  assert.ok(daylight(0) > 0.4);
  assert.ok(daylight(120) > 0.95);
  assert.equal(daylight(360), 0);
  assert.ok(daylight(480) > 0.4);
});

// ─── Bichos ──────────────────────────────────────────────────────────────────
test('una vaca camina por el pasto sin hundirse ni salirse del mundo', () => {
  const w = flatWorld();
  const cow = newMob(1, 'cow', 100.5, 60);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const xs = new Set();
  for (let i = 0; i < 60 / STEP; i++) { stepMob(w, cow, STEP, i * STEP, rand, []); if (i % 120 === 0) xs.add(Math.round(cow.x)); }
  assert.ok(xs.size > 3, 'no se movió');
  assert.ok(Math.abs(cow.y - 60) < 0.01 && cow.x > 0 && cow.x < W);
});

test('un zombi persigue al jugador, sube escalones y le pega estando cerca', () => {
  const w = flatWorld();
  w.t[59 * W + 108] = B.stone;
  const z = newMob('z1', 'zombie', 100.5, 60);
  const target = { x: 115.5, y: 59.1 };
  for (let i = 0; i < 8 / STEP; i++) stepMob(w, z, STEP, i * STEP, Math.random, [target]);
  assert.ok(Math.abs(z.x - target.x) < 1.2, `no llegó: x = ${z.x}`);
  assert.equal(MOBS.zombie.dmg, 3);
});

test('un zombi lejos del jugador no lo persigue y el de la vaca huye al ser golpeado', () => {
  const w = flatWorld();
  const z = newMob('z2', 'zombie', 100.5, 60);
  z.dir = 0;
  for (let i = 0; i < 2 / STEP; i++) stepMob(w, z, STEP, i * STEP, Math.random, [{ x: 300, y: 59 }]);
  assert.ok(Math.abs(z.x - 100.5) < 0.5);
  const cow = newMob(3, 'cow', 100.5, 60);
  cow.fleeUntil = 100; cow.dir = 1;
  for (let i = 0; i < 1 / STEP; i++) stepMob(w, cow, STEP, 1 + i * STEP, Math.random, []);
  assert.ok(cow.x - 100.5 > 2, `no huyó rápido: ${cow.x - 100.5}`);
});

// ─── La sala ─────────────────────────────────────────────────────────────────
function lobby(n = 3) {
  let room = newRoom('h', 'Host', '🐸', 0);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `J${i}`, avatar: '🦊' });
  return room;
}
const started = (n = 3) => applyAction(lobby(n), { type: 'start', playerId: 'h' }, { now: 1000, rand: () => 0.5 });

test('UHC es el único modo disponible y Supervivencia se rechaza', () => {
  assert.equal(MODES.uhc.available, true);
  assert.equal(MODES.survival.available, false);
  const room = lobby();
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { mode: 'survival' } }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p1', options: { grace: 5 } }), null, 'solo el anfitrión');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { grace: 7 } }), null, 'valor inválido');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { grace: 3 } }).options.grace, 3);
  assert.ok(GRACE_MINUTES.includes(room.options.grace));
});

test('hacen falta dos jugadores y la partida guarda la tregua elegida', () => {
  assert.ok(startProblem(lobby(1)));
  const room = applyAction(lobby(3), { type: 'setOptions', playerId: 'h', options: { grace: 2 } });
  const r = applyAction(room, { type: 'start', playerId: 'h' }, { now: 5000, rand: () => 0.5 });
  assert.equal(r.phase, 'playing');
  assert.equal(r.match.grace, 2);
  assert.equal(r.match.startsAt, 5000 + PREP_MS);
  assert.equal(graceEnd(r.match), 5000 + PREP_MS + 120000);
  assert.equal(pvpOn(r.match, graceEnd(r.match) - 1), false);
  assert.equal(pvpOn(r.match, graceEnd(r.match)), true);
  assert.equal(r.match.order.length, 3);
  assert.equal(applyAction(lobby(3), { type: 'start', playerId: 'p1' }), null, 'solo el anfitrión arranca');
});

test('el último en pie gana, con el puesto y las bajas anotadas', () => {
  let r = started(3);
  const t = r.match.startsAt + 1000;
  r = applyAction(r, { type: 'died', playerId: 'p1', match: 1, by: 'h', w: 'iron_sword' }, { now: t });
  assert.equal(r.phase, 'playing');
  assert.equal(r.players.find((p) => p.id === 'p1').place, 3);
  r = applyAction(r, { type: 'died', playerId: 'p2', match: 1, by: 'h', w: 'lava' }, { now: t });
  assert.equal(r.phase, 'final');
  assert.equal(r.match.winner, 'h');
  assert.equal(r.players.find((p) => p.id === 'h').kills, 2);
  assert.equal(r.players.find((p) => p.id === 'h').place, 1);
  assert.deepEqual(r.match.deaths.map((d) => [d.id, d.by, d.w]), [['p1', 'h', 'iron_sword'], ['p2', 'h', 'lava']]);
});

test('no se muere de una partida vieja, ni dos veces, ni antes de empezar; el anfitrión da por muerto a un ausente', () => {
  const r = started(3);
  const t = r.match.startsAt + 1000;
  assert.equal(applyAction(r, { type: 'died', playerId: 'p1', match: 7 }, { now: t }), null, 'otra partida');
  assert.equal(applyAction(r, { type: 'died', playerId: 'p1', match: 1 }, { now: r.match.startsAt - 1 }), null, 'antes de empezar');
  const dead = applyAction(r, { type: 'died', playerId: 'p1', match: 1 }, { now: t });
  assert.equal(applyAction(dead, { type: 'died', playerId: 'p1', match: 1 }, { now: t }), null, 'dos veces');
  assert.equal(applyAction(r, { type: 'died', playerId: 'p1', target: 'p2', match: 1 }, { now: t }), null, 'otro no puede matarlo');
  assert.equal(applyAction(r, { type: 'died', playerId: 'h', target: 'p2', match: 1, w: 'left' }, { now: t }).players.find((p) => p.id === 'p2').alive, false);
  assert.equal(applyAction(dead, { type: 'died', playerId: 'p2', match: 1, by: 'p2' }, { now: t }).match.deaths[1].by, null, 'no se acredita una baja a sí mismo');
});

test('quien se va de la partida cuenta como muerto y el que entra tarde mira', () => {
  let r = started(2);
  const t = r.match.startsAt + 10;
  r = applyAction(r, { type: 'join', playerId: 'late', name: 'Tarde', avatar: '🐱' }, { now: t });
  assert.equal(r.players.find((p) => p.id === 'late').inGame, false);
  r = applyAction(r, { type: 'leave', playerId: 'p1' }, { now: t });
  assert.equal(r.phase, 'final');
  assert.equal(r.match.winner, 'h');
});

test('del final se vuelve a la sala y se puede arrancar otra con otra semilla', () => {
  let r = started(2);
  r = applyAction(r, { type: 'died', playerId: 'p1', match: 1 }, { now: r.match.startsAt + 1 });
  assert.equal(r.phase, 'final');
  const lobbyAgain = applyAction(r, { type: 'toLobby', playerId: 'h' });
  assert.equal(lobbyAgain.phase, 'lobby');
  const again = applyAction(r, { type: 'start', playerId: 'h' }, { now: 9e6, rand: () => 0.9 });
  assert.equal(again.match.n, 2);
  assert.notEqual(again.match.seed, r.match.seed);
});

test('la sala entera pesa muy poco incluso llena', () => {
  let r = lobby(MAX_PLAYERS);
  assert.equal(r.players.length, MAX_PLAYERS);
  assert.equal(applyAction(r, { type: 'join', playerId: 'extra', name: 'X' }), null, 'sala llena');
  r = applyAction(r, { type: 'start', playerId: 'h' }, { now: 1000, rand: () => 0.5 });
  for (let i = 1; i < MAX_PLAYERS - 1; i++) r = applyAction(r, { type: 'died', playerId: `p${i}`, match: 1, by: 'h', w: 'diamond_sword' }, { now: r.match.startsAt + 1 });
  assert.ok(JSON.stringify(r).length < 4000, `${JSON.stringify(r).length}`);
});
