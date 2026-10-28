import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, T, TILE, makeMap, tileAt, zoneAt, damageTile, isWalkable } from '../src/pixel/map.js';
import { WEAPONS, bulletsForShot, stepBullet, lootSpots, dropInfo, spawnPoint, standable, newPlayer, hurt, take, canTake, startCast, finishCast, blastOn, MAX_DROPS, DROP_BASE } from '../src/pixel/sim.js';
import { COUNTDOWN_MS, MAX_PLAYERS, applyAction, newRoom, startProblem, findPlayer } from '../src/pixel/game.js';

test('pixel: la misma semilla arma el mismo mapa y cada mapa tiene su tamaño', () => {
  for (const id of Object.keys(MAPS)) {
    const a = makeMap(id, 1234), b = makeMap(id, 1234), c = makeMap(id, 99);
    assert.equal(a.N, MAPS[id].size);
    assert.deepEqual(a.tiles, b.tiles);
    assert.notDeepEqual(a.tiles, c.tiles);
    assert.equal(a.buildings.length > 0, true);
  }
});

test('pixel: todos aparecen en lugares libres y el botín está en suelo caminable', () => {
  for (const id of Object.keys(MAPS)) {
    const t = makeMap(id, 777);
    for (let i = 0; i < MAPS[id].players; i++) {
      const sp = spawnPoint(t, 777, i, MAPS[id].players);
      assert.ok(standable(t, sp.x, sp.y), `${id}: el jugador ${i} aparece trabado`);
    }
    const spots = lootSpots(t, 777);
    assert.ok(spots.length > 20);
    assert.ok(spots.every((s) => isWalkable(t, Math.floor(s.x / TILE), Math.floor(s.y / TILE))));
    assert.ok(spots.length < DROP_BASE);
    for (let n = 0; n < MAX_DROPS; n++) assert.ok(isWalkable(t, Math.floor(dropInfo(t, 777, n).x / TILE), Math.floor(dropInfo(t, 777, n).y / TILE)));
  }
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
