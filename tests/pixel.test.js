import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, T, TILE, TILE_HP, makeMap, placeAt, reachable, tileAt, zoneAt, damageTile, isWalkable } from '../src/pixel/map.js';
import { WEAPONS, SLOTS, BUILD_CODE, BUILD_COST, MAX_WOOD, WOOD_BREAK, buildProblem, placePiece, GLIDE_AT, BUS_SPEED, bulletsForShot, stepBullet, dropInfo, spawnPoint, standable, newPlayer, hurt, take, canTake, startCast, finishCast, blastOn, MAX_DROPS, DROP_BASE, chestContents, groundItems, pickAction, pickUp, swapSlot, MAX_TOOK, contentsOf, busRoute, busAt, boardBus, jump, stepAir, openGlider, landSpot } from '../src/pixel/sim.js';
import { COUNTDOWN_MS, MAX_PLAYERS, applyAction, newRoom, startProblem, findPlayer } from '../src/pixel/game.js';

test('pixel: la misma semilla arma el mismo mapa y cada mapa tiene su tamaño', () => {
  for (const id of Object.keys(MAPS)) {
    if (MAPS[id].hidden) continue;
    const a = makeMap(id, 1234), b = makeMap(id, 1234), c = makeMap(id, 99);
    assert.equal(a.N, MAPS[id].size);
    assert.deepEqual(a.tiles, b.tiles);
    assert.notDeepEqual(a.tiles, c.tiles);
    assert.equal(a.buildings.length > 0, true);
  }
});

test('pixel: en la isla de espera todos aparecen en lugares libres y los cofres están en suelo alcanzable', () => {
  const w = makeMap('espera', 777);
  for (let i = 0; i < 10; i++) { const sp = spawnPoint(w, 777, i, 10); assert.ok(standable(w, sp.x, sp.y), `el jugador ${i} aparece trabado`); }
  for (const id of Object.keys(MAPS).filter((k) => !MAPS[k].hidden)) {
    for (const seed of [777, 5, 1234, 42]) {
      const t = makeMap(id, seed);
      assert.ok(t.chests.length >= 25 && t.chests.length < DROP_BASE, `${id}: ${t.chests.length} cofres`);
      const reach = reachable(t);
      assert.ok(t.chests.every((c, i) => c.i === i && reach[c.ty * t.N + c.tx]), `${id} ${seed}: hay un cofre al que no se llega`);
      for (let n = 0; n < MAX_DROPS; n++) assert.ok(isWalkable(t, Math.floor(dropInfo(t, seed, n).x / TILE), Math.floor(dropInfo(t, seed, n).y / TILE)));
    }
  }
});

test('pixel: la isla grande tiene los lugares con nombre, y la playa se llama como pidió Nico', () => {
  const t = makeMap('grande', 31);
  const names = t.places.map((p) => p.name);
  for (const n of ['Pibes Polvorín Polvoriento', 'Muelle Mojito', 'Frontera del Fondo', 'Puente Pollín', 'Cover', 'Arboleada Alianza', 'Juvenil Judía']) assert.ok(names.includes(n), n);
  const at = (id) => t.tiles.filter((_, i) => true).length && t.places.find((p) => p.id === id);
  const count = (id, kind) => { const p = at(id); let n = 0; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (tileAt(t, x, y) === kind) n++; return n; };
  assert.ok(count('muelle', T.PLANK) > 20, 'el muelle tiene tablones');
  assert.ok(count('cover', T.FIELD) > 60 && count('cover', T.LINE) > 20 && count('cover', T.NET) >= 6, 'la cancha tiene pasto, líneas y arcos');
  assert.ok(count('judia', T.CROP) > 30, 'la chacra tiene surcos');
  assert.ok(count('frontera', T.WALL) > 40, 'la frontera es un muro largo');
  assert.ok(count('puente', T.DEEP) > 40 && count('puente', T.PLANK) >= 9, 'el río tiene un puente');
  assert.ok(count('polvorin', T.SAND) > 100, 'la playa es de arena');
  assert.equal(placeAt(t, at('muelle').cx * TILE, at('muelle').cy * TILE).id, 'muelle');
});

test('pixel: el contenido de un cofre sale de la semilla y queda en el piso, igual en todas las pantallas', () => {
  const a = chestContents(9, 4, 2), b = chestContents(9, 4, 2);
  assert.deepEqual(a, b);
  assert.ok(WEAPONS[a.w]);
  const ch = { i: 4, tier: 2, x: 100, y: 80 };
  const items = groundItems(9, ch);
  assert.deepEqual(items, groundItems(9, ch));
  assert.equal(items[0].kind, a.w, 'primero el arma');
  assert.equal(items.length, 1 + Object.keys(a.items).length);
  assert.equal(new Set(items.map((it) => it.key)).size, items.length, 'cada cosa tiene su clave');
  for (const it of items) assert.ok(Math.hypot(it.x - ch.x, it.y - ch.y) < 12, 'cae pegado al cofre');
  assert.ok(contentsOf(makeMap('grande', 9), 9, DROP_BASE + 1));
});

test('pixel: agarrar del piso entra al inventario y, con todo lleno, cambia el arma de la mano', () => {
  const p = newPlayer(0, 0);
  assert.equal(pickAction(p, { kind: 'rifle', n: 1 }), 'take');
  assert.equal(pickUp(p, { kind: 'rifle', n: 1, mag: 3 }).dropped, null);
  assert.deepEqual(p.inv[1], { w: 'rifle', mag: 3 }, 'conserva las balas del cargador');
  const got = pickUp(p, { kind: 'bandage', n: 3 });
  assert.equal(p.items.bandage, 3);
  assert.match(got.name, /x3/);
  take(p, 'smg');
  take(p, 'shotgun');
  // Inventario lleno: cambia la que tenés en la mano (sea mejor o peor) y deja la vieja para tirar.
  p.sel = 2;
  assert.equal(swapSlot(p), 2);
  assert.equal(pickAction(p, { kind: 'sniper', n: 1 }), 'swap');
  const swap = pickUp(p, { kind: 'sniper', n: 1 });
  assert.equal(swap.dropped.w, 'smg');
  assert.equal(p.inv[2].w, 'sniper');
  assert.equal(p.inv[0].w, 'pickaxe', 'el pico no se toca');
  // Con el pico en la mano, cambia la peor de las tres.
  p.sel = 0;
  const worst = swapSlot(p);
  assert.ok(worst >= 1);
  assert.equal(pickUp(p, { kind: 'pistol', n: 1 }).dropped.w, [null, 'rifle', 'sniper', 'shotgun'][worst]);
  assert.equal(p.inv[0].w, 'pickaxe');
  // Lo que ya está al tope no entra.
  p.items.bandage = 99;
  assert.equal(pickAction(p, { kind: 'bandage', n: 2 }), 'full');
  assert.equal(pickUp(p, { kind: 'bandage', n: 2 }), null);
});

test('pixel: lo del piso lo agarra uno solo, y solo de un cofre abierto', () => {
  let r = applyAction(room(3), { type: 'start', playerId: 'h' }, { now: 0, rand: () => 0.3 });
  const late = COUNTDOWN_MS + 1, m = r.match.n;
  assert.equal(applyAction(r, { type: 'take', playerId: 'p1', match: m, key: '4:0' }, { now: late }), null, 'el cofre está cerrado');
  r = applyAction(r, { type: 'loot', playerId: 'h', match: m, i: 4 }, { now: late });
  const a = applyAction(r, { type: 'take', playerId: 'p1', match: m, key: '4:0' }, { now: late });
  assert.equal(a.match.took['4:0'], 'p1');
  assert.equal(applyAction(a, { type: 'take', playerId: 'p2', match: m, key: '4:0' }, { now: late }), null, 'se lo lleva uno solo');
  assert.ok(applyAction(a, { type: 'take', playerId: 'p2', match: m, key: '4:1' }, { now: late }), 'otra cosa del mismo cofre sí');
  assert.ok(applyAction(a, { type: 'take', playerId: 'p2', match: m, key: 'w0.1' }, { now: late }), 'un arma tirada');
  for (const key of ['4:9', '4', 'x', '9999:0', 'w0', '4:0 ']) assert.equal(applyAction(r, { type: 'take', playerId: 'p1', match: m, key }, { now: late }), null, key);
  assert.equal(applyAction(r, { type: 'take', playerId: 'p1', match: m + 1, key: '4:0' }, { now: late }), null, 'de otra partida no');
});

test('pixel: el bus cruza la isla, se salta, se cae, se abre el planeador y se aterriza en suelo libre', () => {
  const t = makeMap('grande', 11);
  const route = busRoute(t, 11);
  assert.deepEqual(route, busRoute(t, 11));
  const start = busAt(route, 0), end = busAt(route, 1000);
  assert.ok(end.done && !start.done);
  assert.ok(Math.hypot(start.x - t.W / 2, start.y - t.H / 2) > t.W * 0.45, 'arranca afuera de la isla');
  const mid = busAt(route, route.len / 2 / BUS_SPEED);
  assert.ok(Math.hypot(mid.x - t.W / 2, mid.y - t.H / 2) < t.W * 0.3, 'pasa por la isla');
  const p = newPlayer(0, 0);
  boardBus(p, mid);
  assert.ok(p.aboard);
  jump(p, mid, route);
  assert.ok(!p.aboard && p.air.z === 1 && !p.air.glide);
  let landed = null, glideAt = null;
  for (let i = 0; i < 60 * 40 && !landed; i++) {
    landed = stepAir(p, 1, 0, 1 / 60, t);
    if (p.air?.glide && glideAt === null) glideAt = p.air.z;
  }
  assert.equal(landed, 'landed');
  assert.ok(glideAt <= GLIDE_AT + 0.01, 'el planeador se abre solo');
  assert.equal(p.air, null);
  assert.ok(standable(t, p.x, p.y));
  // Abrir el planeador antes se puede una sola vez.
  const q = newPlayer(0, 0);
  jump(q, mid, route);
  assert.equal(openGlider(q), true);
  assert.equal(openGlider(q), false);
  // Aterrizar sobre el mar o una pared te deja en un lugar libre.
  const s = landSpot(t, 2, 2);
  assert.ok(standable(t, s.x, s.y));
});

test('pixel: la zona solo se achica y el círculo siguiente queda adentro del anterior', () => {
  const t = makeMap('grande', 5);
  let prev = Infinity;
  for (let s = 0; s < 400; s += 5) {
    const z = zoneAt(t, s, 1);
    assert.ok(z.r <= prev + 1e-9);
    prev = z.r;
  }
  for (let i = 1; i < t.plan.length; i++) assert.ok(Math.hypot(t.plan[i].cx - t.plan[i - 1].cx, t.plan[i].cy - t.plan[i - 1].cy) + t.plan[i].r <= t.plan[i - 1].r + 1e-6);
  assert.ok(zoneAt(t, 60, 1.5).r <= zoneAt(t, 60, 1).r);
});

test('pixel: una bala se frena en una pared, rompe de a poco y la escopeta abre un abanico igual en todas las pantallas', () => {
  const t = makeMap('chica', 3);
  let wx = 0, wy = 0;
  for (let i = 0; i < t.tiles.length; i++) if (t.tiles[i] === T.WALL && t.tiles[i - 1] === T.FLOOR) { wx = (i % t.N) - 1; wy = Math.floor(i / t.N); break; }
  const [b] = bulletsForShot({ k: 'a', x: (wx + 0.5) * TILE, y: (wy + 0.5) * TILE, a: 0, w: 'rifle', sd: 1 }, 'u');
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) hit = stepBullet(b, 1 / 60, t);
  assert.equal(hit?.kind, 'tile');
  assert.equal(tileAt(t, hit.tx, hit.ty), T.WALL);
  assert.equal(damageTile(t, hit.tx, hit.ty, 50), false);
  assert.equal(damageTile(t, hit.tx, hit.ty, 100), true);
  assert.equal(tileAt(t, hit.tx, hit.ty), T.RUBBLE);
  const s1 = bulletsForShot({ k: 's', x: 0, y: 0, a: 0, w: 'shotgun', sd: 42 }, 'u'), s2 = bulletsForShot({ k: 's', x: 0, y: 0, a: 0, w: 'shotgun', sd: 42 }, 'v');
  assert.equal(s1.length, WEAPONS.shotgun.pellets);
  assert.deepEqual(s1.map((x) => x.vy), s2.map((x) => x.vy));
});

test('pixel: el escudo absorbe primero, curarse lleva tiempo y se corta si te pegan, y las explosiones bajan con la distancia', () => {
  const p = newPlayer(0, 0);
  p.shield = 30;
  hurt(p, 40, 'x', 'rifle', 1);
  assert.equal(p.shield, 0);
  assert.equal(p.hp, 90);
  p.items.medkit = 1;
  assert.ok(startCast(p, 'medkit', 0));
  assert.equal(finishCast(p, 1), null);
  hurt(p, 5, 'x', 'rifle', 1.5);
  assert.equal(p.cast, null);
  p.items.bandage = 1;
  startCast(p, 'bandage', 2);
  assert.equal(finishCast(p, 3), 'bandage');
  assert.equal(p.hp, 100);
  const near = blastOn({ x: 5, y: 0 }, { w: 'grenade', x: 0, y: 0 }), far = blastOn({ x: 30, y: 0 }, { w: 'grenade', x: 0, y: 0 });
  assert.ok(near.damage > far.damage && far.damage > 0);
  assert.equal(blastOn({ x: 200, y: 0 }, { w: 'grenade', x: 0, y: 0 }), null);
});

test('pixel: el inventario tiene cuatro lugares (el pico fijo en el 1) y levantar la misma arma la recarga', () => {
  const p = newPlayer(0, 0);
  assert.equal(SLOTS, 4);
  assert.equal(p.inv[0].w, 'pickaxe');
  assert.ok(p.inv.slice(1).every((g) => g === null), 'no se arranca con ninguna arma');
  assert.equal(take(p, 'smg'), 1);
  assert.equal(take(p, 'rifle'), 2);
  assert.equal(take(p, 'shotgun'), 3);
  assert.equal(canTake(p, 'sniper'), false);
  assert.equal(canTake(p, 'smg'), true);
  p.inv[1].mag = 3;
  take(p, 'smg');
  assert.equal(p.inv[1].mag, WEAPONS.smg.mag);
});

test('pixel: la madera: lo que se rompe la da, las paredes y los pisos se construyen, frenan balas y al romperse dejan lo de abajo', () => {
  const t = makeMap('grande', 21);
  // Una casilla de pasto libre cerca del centro y una de agua profunda.
  let gx = 0, gy = 0, wx = 0, wy = 0;
  for (let y = 40; y < 60 && !gx; y++) for (let x = 40; x < 60; x++) if ([-3, -2, -1, 0, 1].every((d) => tileAt(t, x + d, y) === T.GRASS)) { gx = x; gy = y; break; }
  for (let i = 0; i < t.tiles.length && !wx; i++) if (t.tiles[i] === T.DEEP && t.tiles[i + 1] === T.DEEP && i % t.N > 3 && i % t.N < t.N - 3 && i > t.N * 4 && i < t.N * (t.N - 4)) { wx = i % t.N; wy = Math.floor(i / t.N); }
  const p = newPlayer(gx * TILE + TILE * 3, gy * TILE + TILE / 2);
  assert.equal(p.wood, 0);
  assert.equal(buildProblem(t, 'wall', gx, gy, p), null);
  assert.ok(buildProblem(t, 'wall', gx + 30, gy, p), 'muy lejos');
  assert.ok(buildProblem(t, 'wall', wx, wy, { x: wx * TILE, y: wy * TILE }), 'una pared no se apoya en el agua');
  assert.equal(buildProblem(t, 'floor', wx, wy, { x: wx * TILE, y: wy * TILE }), null, 'un piso sí: es un puente');
  const q = { x: gx * TILE + 8, y: gy * TILE + 8 };
  assert.ok(buildProblem(t, 'wall', gx, gy, p, [q]), 'no se construye arriba de alguien');
  // Pared: sólida, frena balas y se rompe de a poco.
  assert.ok(placePiece(t, BUILD_CODE.wall, gx, gy));
  assert.equal(tileAt(t, gx, gy), T.BWALL);
  assert.equal(placePiece(t, BUILD_CODE.wall, gx, gy), false, 'ya hay algo');
  const [b] = bulletsForShot({ k: 'w', x: (gx - 3) * TILE, y: (gy + 0.5) * TILE, a: 0, w: 'rifle', sd: 1 }, 'u');
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) hit = stepBullet(b, 1 / 60, t);
  assert.ok(hit?.kind === 'tile' && hit.tx === gx);
  assert.equal(damageTile(t, gx, gy, TILE_HP[T.BWALL] - 1), false);
  assert.equal(damageTile(t, gx, gy, 5), true);
  assert.equal(tileAt(t, gx, gy), T.GRASS, 'al romperse queda el pasto de antes');
  // Piso sobre el agua: se camina, y al romperse vuelve el agua.
  assert.ok(placePiece(t, BUILD_CODE.floor, wx, wy));
  assert.equal(isWalkable(t, wx, wy), true);
  assert.equal(damageTile(t, wx, wy, 99), true);
  assert.equal(tileAt(t, wx, wy), T.DEEP);
  // Todo lo que se rompe tiene su recompensa de madera, y el pico es un arma de cuerpo a cuerpo.
  for (const kind of [T.TREE, T.CRATE, T.WALL, T.BWALL, T.BFLOOR]) assert.ok(WOOD_BREAK[kind] > 0 && TILE_HP[kind] > 0);
  assert.ok(WEAPONS.pickaxe.melee && WEAPONS.pickaxe.range < 30 && WEAPONS.pickaxe.tileDmg > 0);
  assert.ok(BUILD_COST.wall > 0 && BUILD_COST.floor > 0 && MAX_WOOD >= BUILD_COST.wall * 10);
});

function room(n, map = 'grande') {
  let r = newRoom('h', 'Host', '🐸', 0);
  for (let i = 1; i < n; i++) r = applyAction(r, { type: 'join', playerId: `p${i}`, name: `P${i}` }, { now: 0 });
  return applyAction(r, { type: 'setOptions', playerId: 'h', options: { map } }, { now: 0 });
}

test('pixel: el mapa chico es para 5, el grande para 10, y se necesitan 2', () => {
  assert.ok(startProblem(room(1)));
  assert.equal(startProblem(room(5, 'chica')), null);
  assert.ok(startProblem(room(6, 'chica')));
  assert.equal(applyAction(room(6, 'chica'), { type: 'start', playerId: 'h' }, { now: 0 }), null);
  assert.equal(room(MAX_PLAYERS).players.length, MAX_PLAYERS);
  assert.equal(applyAction(room(MAX_PLAYERS), { type: 'join', playerId: 'zz', name: 'Z' }, { now: 0 }), null);
});

test('pixel: partida completa: botín para el primero, bajas, tormenta y gana el último', () => {
  let r = applyAction(room(3), { type: 'start', playerId: 'h' }, { now: 1000, rand: () => 0.5 });
  const m = r.match.n;
  const late = 1000 + COUNTDOWN_MS + 1;
  assert.equal(applyAction(r, { type: 'died', playerId: 'p1', match: m }, { now: 1000 }), null, 'durante la cuenta no se muere');
  r = applyAction(r, { type: 'loot', playerId: 'p1', match: m, i: 4 }, { now: late });
  assert.equal(applyAction(r, { type: 'loot', playerId: 'p2', match: m, i: 4 }, { now: late }), null, 'el botín se lo lleva uno solo');
  assert.equal(applyAction(r, { type: 'loot', playerId: 'p2', match: m, i: 9999 }, { now: late }), null);
  r = applyAction(r, { type: 'died', playerId: 'p1', match: m, by: 'h', w: 'rifle' }, { now: late });
  assert.equal(findPlayer(r, 'h').kills, 1);
  assert.equal(r.phase, 'playing');
  r = applyAction(r, { type: 'died', playerId: 'p2', match: m, w: 'storm' }, { now: late });
  assert.equal(r.phase, 'final');
  assert.equal(r.match.winner, 'h');
  assert.equal(findPlayer(r, 'p2').place, 2);
  assert.equal(findPlayer(r, 'h').place, 1);
});

test('pixel: el peor caso de sala entra en los 30.000 caracteres', () => {
  let r = applyAction(room(10), { type: 'start', playerId: 'h' }, { now: 0, rand: () => 0.3 });
  const late = COUNTDOWN_MS + 1;
  for (let i = 0; i < 216; i++) r = applyAction(r, { type: 'loot', playerId: i % 2 ? 'h' : 'p1', match: r.match.n, i: i < 200 ? i : i }, { now: late }) || r;
  for (let i = 0; i < MAX_TOOK + 20; i++) r = applyAction(r, { type: 'take', playerId: i % 2 ? 'h' : 'p1', match: r.match.n, key: i < 600 ? (i < 200 ? `${i}:${i % 4}` : `w${i}.${i % 10}`) : '0:0' }, { now: late }) || r;
  assert.ok(Object.keys(r.match.took).length <= MAX_TOOK, 'lo anotado tiene tope');
  for (let i = 1; i < 9; i++) r = applyAction(r, { type: 'died', playerId: `p${i}`, match: r.match.n, by: 'h', w: 'sniper' }, { now: late }) || r;
  assert.ok(JSON.stringify(r).length < 30000, String(JSON.stringify(r).length));
});
