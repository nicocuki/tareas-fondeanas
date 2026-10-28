import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, T, TILE, makeMap, placeAt, reachable, tileAt, zoneAt, damageTile, isWalkable } from '../src/pixel/map.js';
import { WEAPONS, GLIDE_AT, BUS_SPEED, bulletsForShot, stepBullet, dropInfo, spawnPoint, standable, newPlayer, hurt, take, canTake, startCast, finishCast, blastOn, MAX_DROPS, DROP_BASE, chestContents, giveContents, contentsOf, busRoute, busAt, boardBus, jump, stepAir, openGlider, landSpot } from '../src/pixel/sim.js';
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

test('pixel: el contenido de un cofre sale de la semilla, entra al inventario y no cae al piso', () => {
  const a = chestContents(9, 4, 2), b = chestContents(9, 4, 2);
  assert.deepEqual(a, b);
  assert.ok(WEAPONS[a.w]);
  const p = newPlayer(0, 0);
  const got = giveContents(p, { w: 'rifle', items: { bandage: 3, grenade: 2 } });
  assert.equal(p.inv[1].w, 'rifle');
  assert.equal(p.items.bandage, 3);
  assert.equal(got.length, 3);
  // Con el inventario lleno solo cambia el arma de la mano si la nueva es mejor.
  take(p, 'smg');
  giveContents(p, { w: 'pistol', items: {} });
  assert.equal(p.inv[0].w, 'pistol');
  giveContents(p, { w: 'sniper', items: {} });
  assert.equal(p.inv[0].w, 'sniper');
  giveContents(p, { w: 'pistol', items: {} });
  assert.equal(p.inv[0].w, 'sniper');
  assert.ok(contentsOf(makeMap('grande', 9), 9, DROP_BASE + 1));
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

test('pixel: el inventario tiene tres lugares y levantar la misma arma la recarga', () => {
  const p = newPlayer(0, 0);
  assert.equal(take(p, 'smg'), 1);
  assert.equal(take(p, 'rifle'), 2);
  assert.equal(canTake(p, 'sniper'), false);
  assert.equal(canTake(p, 'smg'), true);
  p.inv[1].mag = 3;
  take(p, 'smg');
  assert.equal(p.inv[1].mag, WEAPONS.smg.mag);
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
  for (let i = 1; i < 9; i++) r = applyAction(r, { type: 'died', playerId: `p${i}`, match: r.match.n, by: 'h', w: 'sniper' }, { now: late }) || r;
  assert.ok(JSON.stringify(r).length < 30000, String(JSON.stringify(r).length));
});
