import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUS_ALT, BUS_SPEED, DROP_BASE, ISLAND_R, LOOT_LIMIT, STORM_PHASES, WADE_MIN, busAt, busRoute, chestOf, dropInfo, makeWorld, spawnPoint, stormAt, stormCenters,
} from '../src/royale3d/map.js';
import {
  GRENADE_FUSE, MAX_HP, RARITIES, SLOTS, STEP, WEAPONS, WEAPON_LIST, BUILD_KINDS, aimShot, blastOn, blastSolids, boardBus, buildProblem, canShoot, chestContents, finishCast,
  floorAt, grenadeFor, groundItems, held, hurt, jumpOff, newPlayer, openGlider, pelletDirs, pickAction, pickUp, pieceAt, pieceFor, placePiece, rayCast, rayPlayers, resolveShot, rocketFor,
  selectSlot, startCast, statsOf, stepAir, stepGrenade, stepGround, stepRocket, swapSlot,
} from '../src/royale3d/sim.js';
import { MAX_PLAYERS, alive, applyAction, newRoom, ranking, score, startProblem } from '../src/royale3d/game.js';

const SEED = 424242;
const world = makeWorld(SEED);
const ground = (x, z, yaw = 0) => { const p = newPlayer(x, 0, z, yaw); p.y = floorAt(world, x, z, 80); p.grounded = true; return p; };
const clean = (seed = 9) => { const w = makeWorld(seed, 'lobby'); w.solids.length = 0; w.cells.clear(); w.byId.clear(); return w; };
const walk = (p, input, seconds, w = world) => { for (let i = 0; i < seconds * 60; i++) stepGround(p, input, STEP, w); return p; };

// ─── La isla ─────────────────────────────────────────────────────────────────
test('royale3d: la isla sale de la semilla (igual cada vez) y tiene tierra en el medio y mar afuera', () => {
  assert.equal(world.height(10, 10), makeWorld(SEED).height(10, 10));
  assert.notEqual(world.height(10, 10), makeWorld(SEED + 1).height(10, 10));
  assert.equal(world.solids.length, makeWorld(SEED).solids.length);
  assert.ok(world.height(0, 0) > 0);
  assert.ok(world.height(ISLAND_R + 12, 0) < WADE_MIN, 'más allá de la costa es mar abierto');
});

test('royale3d: están los catorce lugares con nombre, separados, y hay cofres de los tres tipos', () => {
  for (const seed of [1, 42, SEED, 99999]) {
    const w = makeWorld(seed);
    assert.deepEqual(w.places.map((p) => p.id).sort(), ['arboleada', 'cover', 'frontera', 'judia', 'muelle', 'penasco', 'polvorin', 'puente', 'villa'].concat(['barrio', 'ciudad', 'estacion', 'fabrica', 'pueblo']).sort());
    for (let i = 0; i < w.places.length; i++) for (let j = i + 1; j < w.places.length; j++) {
      const a = w.places[i], b = w.places[j];
      if (a.id === 'muelle' || b.id === 'muelle') continue;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > (a.r + b.r) * 0.8, `${a.id} y ${b.id} se pisan en la semilla ${seed}`);
    }
    assert.ok(w.chests.length >= 30, `cofres: ${w.chests.length}`);
    for (const tier of [1, 2, 3]) assert.ok(w.chests.some((c) => c.tier === tier), `falta un cofre de tier ${tier} en la semilla ${seed}`);
    assert.ok(w.trees.length > 150 && w.solids.length > 400);
    assert.ok(w.chests.every((c) => c.y > -1), 'ningún cofre queda bajo el agua');
  }
});

test('royale3d: a todos los cofres se llega caminando (nadie queda encerrado)', () => {
  for (const seed of [7, SEED]) {
    const w = makeWorld(seed);
    for (const c of w.chests) {
      // Hay un lugar libre a menos de dos metros donde parar un jugador.
      let ok = false;
      for (let a = 0; a < 12 && !ok; a++) {
        const x = c.x + Math.cos(a * 0.52) * 1.5, z = c.z + Math.sin(a * 0.52) * 1.5;
        const p = newPlayer(x, 0, z); p.y = floorAt(w, x, z, c.y + 0.5);
        w.near(x - 0.5, z - 0.5, x + 0.5, z + 0.5, []).length; // solo para tocar la grilla
        const blocked = w.near(x - 0.45, z - 0.45, x + 0.45, z + 0.45, []).some((s) => s.y1 > p.y + 0.6 && s.y0 < p.y + 1.8 && (s.k === 'cyl' ? Math.hypot(x - s.cx, z - s.cz) < s.r + 0.45 : x > s.x0 - 0.45 && x < s.x1 + 0.45 && z > s.z0 - 0.45 && z < s.z1 + 0.45));
        if (!blocked) ok = true;
      }
      assert.ok(ok, `el cofre ${c.i} de la semilla ${seed} no tiene lugar al lado`);
    }
  }
});

test('royale3d: los sólidos se rompen (los que tienen vida), se sacan de la grilla y avisan', () => {
  const w = makeWorld(5);
  const crate = w.solids.find((s) => s.mat === 'crate' && s.hp > 0);
  const rock = w.solids.find((s) => s.mat === 'rock');
  let broke = null;
  w.onBreak = (s) => { broke = s; };
  assert.equal(w.damage(rock.id, 999), null, 'las rocas no se rompen');
  assert.equal(w.damage(crate.id, 10).broken, false);
  assert.equal(w.damage(crate.id, 999).broken, true);
  assert.equal(broke.id, crate.id);
  assert.equal(w.damage(crate.id, 10), null, 'una caja rota no se rompe de nuevo');
  assert.ok(!w.near(crate.x0, crate.z0, crate.x1, crate.z1, []).includes(crate));
});

// ─── Moverse ─────────────────────────────────────────────────────────────────
test('royale3d: caminar avanza, correr avanza más y no se entra al mar profundo', () => {
  const p = ground(0, 0, 0);
  const z0 = p.z;
  walk(p, { f: true }, 1);
  const walked = Math.abs(p.z - z0);
  assert.ok(walked > 4 && walked < 7);
  const q = ground(0, 0, 0);
  walk(q, { f: true, sprint: true }, 1);
  assert.ok(Math.abs(q.z) > walked * 1.3);
  const swim = ground(60, 0, Math.PI / 2 * 3); // mirando a +x
  walk(swim, { f: true }, 60);
  assert.ok(world.height(swim.x, swim.z) >= WADE_MIN - 0.3, 'se frenó en la orilla');
  assert.ok(Math.hypot(swim.x, swim.z) < ISLAND_R + 5);
});

test('royale3d: las paredes de las casas frenan y la puerta deja pasar', () => {
  const w = makeWorld(11);
  const villa = w.places.find((p) => p.id === 'villa');
  const floor = w.solids.find((s) => s.kind === 'floor' && Math.abs((s.x0 + s.x1) / 2 - villa.x) < 20 && Math.abs((s.z0 + s.z1) / 2 - villa.z) < 20);
  const cx = (floor.x0 + floor.x1) / 2;
  // Camino derecho por el medio de la casa, desde el norte y desde el sur: por un solo lado se entra (el de la puerta).
  const enters = (fromZ, yaw) => {
    const p = newPlayer(cx, 0, fromZ, yaw);
    p.y = floorAt(w, p.x, p.z, 80); p.grounded = true;
    let inside = false;
    for (let i = 0; i < 60 * 4; i++) { stepGround(p, { f: true }, STEP, w); if (p.x > floor.x0 + 0.6 && p.x < floor.x1 - 0.6 && p.z > floor.z0 + 0.6 && p.z < floor.z1 - 0.6) inside = true; }
    return inside;
  };
  const fromSouth = enters(floor.z1 + 6, 0), fromNorth = enters(floor.z0 - 6, Math.PI);
  assert.ok(fromSouth !== fromNorth, `una casa se entra por un solo lado (sur ${fromSouth}, norte ${fromNorth})`);
});

test('royale3d: se sube un escalón de un paso, una pared alta frena', () => {
  const w = clean(3);
  const y = w.height(0, 0);
  w.addBox(-2, 2, -6, -4, y - 1, y + 0.5, { mat: 'wood', hp: 0 });    // escalón de 0,5 m
  w.addBox(-3, 3, -11, -10, y - 1, y + 3, { mat: 'wood', hp: 0 });    // pared de 3 m
  const p = newPlayer(0, y, 0, 0); p.y = floorAt(w, 0, 0, 5); p.grounded = true;
  let top = p.y;
  for (let i = 0; i < 60 * 3; i++) { stepGround(p, { f: true }, STEP, w); top = Math.max(top, p.y); }
  assert.ok(top > y + 0.4, 'subió al escalón');
  assert.ok(p.z > -9.7 && p.z < -9, `la pared la frenó en z = ${p.z.toFixed(2)}`);
});

test('royale3d: saltar sube y vuelve a caer al piso', () => {
  const p = ground(0, 0);
  const base = p.y;
  stepGround(p, { jump: true }, STEP, world);
  let top = p.y;
  for (let i = 0; i < 120; i++) { stepGround(p, {}, STEP, world); top = Math.max(top, p.y); }
  assert.ok(top > base + 1);
  assert.ok(p.grounded && Math.abs(p.y - base) < 0.1);
});

// ─── Bus, caída libre y planeador ────────────────────────────────────────────
test('royale3d: el bus cruza la isla en línea recta, igual en todas las pantallas', () => {
  const r = busRoute(SEED);
  assert.deepEqual(r, busRoute(SEED));
  const a = busAt(r, 0), b = busAt(r, 5);
  assert.equal(a.y, BUS_ALT);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 5 * BUS_SPEED) < 0.01);
  assert.ok(busAt(r, 1000).done);
});

test('royale3d: saltar del bus, caer, abrir el planeador y aterrizar en tierra firme', () => {
  const r = busRoute(SEED);
  const p = newPlayer(0, 0, 0);
  boardBus(p, busAt(r, 4));
  assert.equal(p.mode, 'bus');
  jumpOff(p, busAt(r, 4), r);
  assert.equal(p.mode, 'fall');
  let t = 0, res = null, sawGlide = false;
  while (!res && t < 120) { res = stepAir(p, { f: true }, STEP, world); t += STEP; if (p.mode === 'glide') sawGlide = true; }
  assert.equal(res, 'landed');
  assert.ok(sawGlide, 'el planeador se abre solo');
  assert.equal(p.mode, 'ground');
  assert.ok(t > 8 && t < 40, `tardó ${t.toFixed(1)} s`);
  assert.ok(world.height(p.x, p.z) >= 0.1, 'aterrizó en tierra');
  // Abrirlo antes con Espacio.
  const q = newPlayer(0, 200, 0); q.mode = 'fall'; q.vy = -30;
  assert.ok(openGlider(q) && q.mode === 'glide');
});

// ─── Armas y rarezas ─────────────────────────────────────────────────────────
test('royale3d: hay once armas y cinco rarezas, y cuanto más rara, mejor', () => {
  assert.equal(WEAPON_LIST.length, 10);
  assert.equal(RARITIES.length, 5);
  for (const w of WEAPON_LIST) {
    const prev = statsOf({ w, r: 0 });
    for (let r = 1; r < 5; r++) {
      const s = statsOf({ w, r });
      assert.ok(s.dmg >= prev.dmg && s.rate <= prev.rate && s.reload <= prev.reload, `${w} rareza ${r}`);
      assert.ok(s.mag >= prev.mag);
    }
  }
  assert.ok(statsOf({ w: 'rifle', r: 4 }).dmg > statsOf({ w: 'rifle', r: 0 }).dmg * 1.2);
});

test('royale3d: el cargador se gasta, el arma no dispara recargando y el pico no gasta balas', () => {
  const p = ground(0, 0);
  p.inv[1] = { w: 'pistol', r: 0, mag: 2 }; selectSlot(p, 1);
  assert.ok(canShoot(p, 0));
  p.inv[1].mag = 0;
  assert.ok(!canShoot(p, 1), 'sin balas no');
  p.inv[1].mag = 5; p.reloadUntil = 3;
  assert.ok(!canShoot(p, 2), 'recargando no');
  selectSlot(p, 0);
  assert.ok(canShoot(p, 9) && held(p).w === 'pickaxe');
});

test('royale3d: un tiro pega en el cuerpo, en la cabeza pega más y una pared lo frena', () => {
  const flat = { seed: 1, height: () => 0, near: () => [], byId: new Map(), solids: [], cells: new Map() };
  const gun = { w: 'rifle', r: 0, mag: 30 };
  const o = { x: 0, y: 1.0, z: 0 }, d = { x: 0, y: 0, z: -1 };
  const body = resolveShot(flat, o, d, gun, [{ id: 'b', x: 0, y: 0, z: -15 }], 0, 1);
  assert.equal(body.hits.length, 1);
  assert.equal(body.hits[0].head, false);
  assert.equal(body.hits[0].dmg, Math.round(statsOf(gun).dmg));
  const head = resolveShot(flat, { ...o, y: 1.6 }, d, gun, [{ id: 'b', x: 0, y: 0, z: -15 }], 0, 1);
  assert.ok(head.hits[0].head && head.hits[0].dmg > body.hits[0].dmg);
  assert.equal(resolveShot(flat, o, d, gun, [{ id: 'b', x: 0, y: 0, z: 15 }], 0, 1).hits.length, 0, 'de espaldas no');
  const walled = makeWorld(2);
  const gy = walled.height(0, 0);
  walled.addBox(-3, 3, -9, -8, gy - 1, gy + 4, { mat: 'wood', hp: 100 });
  const blocked = resolveShot(walled, { x: 0, y: gy + 1, z: 0 }, d, gun, [{ id: 'b', x: 0, y: gy, z: -15 }], 0, 1);
  assert.equal(blocked.hits.length, 0, 'la pared tapa');
  assert.equal(blocked.solids.length, 1, 'y se lleva el daño');
});

test('royale3d: la escopeta tira varios perdigones y pierde fuerza lejos; los perdigones salen iguales con la misma semilla', () => {
  const dirs = pelletDirs({ x: 0, y: 0, z: -1 }, 9, 0.07, 55);
  assert.equal(dirs.length, 9);
  assert.deepEqual(dirs, pelletDirs({ x: 0, y: 0, z: -1 }, 9, 0.07, 55));
  const flat = { seed: 1, height: () => 0, near: () => [], byId: new Map(), solids: [], cells: new Map() };
  const gun = { w: 'shotgun', r: 0, mag: 5 };
  const near = resolveShot(flat, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, gun, [{ id: 'b', x: 0, y: 0, z: -4 }], 0, 3);
  const far = resolveShot(flat, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, gun, [{ id: 'b', x: 0, y: 0, z: -40 }], 0, 3);
  assert.ok(near.hits[0].dmg > far.hits[0].dmg * 1.5);
  assert.ok(near.hits[0].dmg > 60, 'de cerca es letal');
});

test('royale3d: los rayos chocan contra el terreno, los árboles y las cabañas', () => {
  const w = makeWorld(SEED);
  const t = w.trees[0];
  const o = { x: t.x - 6, y: Math.max(t.y, w.height(t.x - 6, t.z)) + 1.5, z: t.z };
  const hit = rayCast(w, o, { x: 1, y: 0, z: 0 }, 50);
  assert.ok(hit.s && Math.abs(hit.dist - (6 - 0.5)) < 0.3, `choca con el tronco: ${hit.dist}`);
  const sky = rayCast(w, { x: 0, y: 100, z: 0 }, { x: 0, y: 1, z: 0 }, 50);
  assert.equal(sky.dist, 50);
  const down = rayCast(w, { x: 0, y: 30, z: 0 }, { x: 0, y: -1, z: 0 }, 100);
  assert.ok(down.ground && Math.abs(down.dist - (30 - w.height(0, 0))) < 0.1);
});

test('royale3d: apuntar con la cámara manda el tiro hacia lo que se ve en la mira', () => {
  const p = ground(0, 0, 0);
  const { o, d } = aimShot(world, p);
  assert.ok(d.z < -0.9, 'yaw 0 mira hacia -z');
  assert.ok(Math.abs(o.y - (p.y + 1.55)) < 0.01);
});

test('royale3d: rayPlayers distingue cabeza y cuerpo y se queda con el más cercano', () => {
  const o = { x: 0, y: 1, z: 0 }, d = { x: 0, y: 0, z: -1 };
  const hit = rayPlayers(o, d, [{ id: 'lejos', x: 0, y: 0, z: -20 }, { id: 'cerca', x: 0, y: 0, z: -8 }], 100);
  assert.equal(hit.id, 'cerca');
  assert.equal(rayPlayers({ ...o, y: 1.65 }, d, [{ id: 'x', x: 0, y: 0, z: -8 }], 100).head, true);
  assert.equal(rayPlayers(o, d, [{ id: 'x', x: 3, y: 0, z: -8 }], 100), null);
});

// ─── Explosiones, cohetes y granadas ─────────────────────────────────────────
test('royale3d: una explosión hace más daño en el centro, empuja hacia afuera y rompe lo que alcanza', () => {
  const p = ground(0, 0);
  const at = (dx) => ({ x: p.x + dx, y: p.y + 1, z: p.z, w: 'rocket' });
  const center = blastOn(p, at(0.5)), edge = blastOn(p, at(4)), far = blastOn(p, at(9));
  assert.ok(center.damage > edge.damage && edge.damage > 0);
  assert.equal(far, null);
  assert.ok(blastOn(p, at(-3)).vx > 0, 'empuja para el lado contrario');
  const w = makeWorld(8);
  const c = w.solids.find((s) => s.mat === 'crate' && s.hp > 0);
  const near = blastSolids(w, { x: (c.x0 + c.x1) / 2, y: c.y0 + 0.5, z: (c.z0 + c.z1) / 2, w: 'grenade' });
  assert.ok(near.some((d) => d.id === c.id && d.dmg >= c.hp));
});

test('royale3d: el cohete vuela con algo de caída y explota contra el terreno', () => {
  const w = makeWorld(SEED);
  const rk = rocketFor({ k: 1, w: 'bazooka', o: [0, 20, 0], d: [0, -0.2, -0.98] }, 'a');
  let hit = null;
  for (let i = 0; i < 60 * 8 && !hit; i++) hit = stepRocket(rk, STEP, w);
  assert.ok(hit, 'chocó con algo');
  assert.ok(hit.z < -10 && hit.y < 60);
});

test('royale3d: la granada rebota, se frena y explota a los 2 segundos', () => {
  const w = makeWorld(SEED);
  const y = w.height(0, 0);
  const g = grenadeFor({ k: 1, w: 'grenade', o: [0, y + 1.5, 0], v: [0, 3, -12], f: GRENADE_FUSE }, 'a');
  let t = 0, boom = false, bounced = false, lastVy = 0;
  while (!boom && t < 5) { boom = stepGrenade(g, STEP, w); t += STEP; if (lastVy < -1 && g.vy > 0) bounced = true; lastVy = g.vy; }
  assert.ok(boom && Math.abs(t - GRENADE_FUSE) < 0.05);
  assert.ok(bounced, 'rebotó');
  assert.ok(g.z < -3 && g.y >= w.height(g.x, g.z) - 0.1);
});

// ─── Curarse, cofres y botín ─────────────────────────────────────────────────
test('royale3d: curarse tarda, se corta si te pegan y no pasa de 100', () => {
  const p = ground(0, 0);
  p.hp = 50; p.items.medkit = 2; p.items.shield = 1;
  assert.ok(startCast(p, 'medkit', 0));
  assert.equal(finishCast(p, 1), null, 'todavía no');
  hurt(p, 5, 'x', 'pistol', 1);
  assert.equal(p.cast, null, 'se cortó');
  assert.equal(p.items.medkit, 2, 'y no se gastó');
  startCast(p, 'medkit', 2);
  assert.equal(finishCast(p, 6), 'medkit');
  assert.equal(p.hp, 45 + 70 > MAX_HP ? MAX_HP : 115);
  p.hp = MAX_HP;
  assert.ok(!startCast(p, 'medkit', 7), 'con la vida llena no hace falta');
  startCast(p, 'shield', 8); finishCast(p, 10);
  assert.equal(p.shield, 25);
});

test('royale3d: el daño se come primero el escudo', () => {
  const p = ground(0, 0);
  p.shield = 30;
  hurt(p, 50, 'x', 'rifle', 0);
  assert.equal(p.shield, 0);
  assert.equal(p.hp, 80);
});

test('royale3d: el contenido de un cofre sale de la semilla; los de más arriba traen más y mejor', () => {
  assert.deepEqual(chestContents(SEED, 5, 2), chestContents(SEED, 5, 2));
  const rarity = (tier) => { let n = 0, sum = 0; for (let i = 0; i < 400; i++) for (const g of chestContents(SEED, i, tier).weapons) { n++; sum += g.r; } return sum / n; };
  assert.ok(rarity(3) > rarity(2) && rarity(2) > rarity(1));
  assert.equal(chestContents(SEED, 1, 3).weapons.length, 2, 'los de tier 3 traen dos armas');
  for (let i = 0; i < 400; i++) for (const g of chestContents(SEED, i, 1).weapons) assert.ok(g.r >= (WEAPONS[g.w].minR || 0), 'respeta la rareza mínima');
  let seen = new Set();
  for (let i = 0; i < 600; i++) for (const g of [...chestContents(SEED, i, 1).weapons, ...chestContents(SEED, i, 2).weapons, ...chestContents(SEED, i, 3).weapons]) seen.add(g.w);
  assert.equal(seen.size, 10, 'salen las diez armas');
  const drop = chestContents(SEED, DROP_BASE, 3, { medkit: 1, bigshield: 1, grenade: 2 });
  assert.ok(drop.items.medkit >= 1 && drop.items.bigshield >= 1 && drop.items.grenade >= 2);
});

test('royale3d: lo que deja un cofre en el piso está alrededor de él y con claves distintas', () => {
  const ch = world.chests[0];
  const items = groundItems(SEED, ch);
  assert.ok(items.length >= 3);
  assert.equal(new Set(items.map((i) => i.key)).size, items.length);
  for (const it of items) { assert.ok(Math.hypot(it.x - ch.x, it.z - ch.z) < 2.6); assert.match(it.key, /^\d+:\d$/); }
});

test('royale3d: agarrar armas: entran hasta llenar, después se cambia la de la mano, y el pico no se toca', () => {
  const p = ground(0, 0);
  for (let i = 0; i < 4; i++) assert.equal(pickUp(p, { kind: 'smg', r: i, n: 1 }).dropped, null);
  assert.equal(p.inv.filter(Boolean).length, 5);
  assert.equal(pickAction(p, { kind: 'rifle', r: 2, n: 1 }), 'swap');
  const slot = swapSlot(p);
  assert.ok(slot >= 1, 'nunca el pico');
  const out = pickUp(p, { kind: 'rifle', r: 2, n: 1 });
  assert.equal(out.dropped.w, 'smg');
  assert.equal(p.inv[0].w, 'pickaxe');
  assert.equal(p.inv[slot].w, 'rifle');
  // Consumibles hasta su tope.
  p.items.bandage = 14;
  assert.equal(pickUp(p, { kind: 'bandage', n: 5 }).name.includes('x1'), true);
  assert.equal(pickAction(p, { kind: 'bandage', n: 1 }), 'full');
});

// ─── Construir ───────────────────────────────────────────────────────────────
test('royale3d: pared, piso y rampa: ocupan su lugar, se pueden pisar y no se repiten', () => {
  const w = clean(9);
  const gx = 4, gz = 2;
  const p = newPlayer(gx - 6, 0, gz, 0); p.y = floorAt(w, p.x, p.z, 80); p.grounded = true; p.wood = 100;
  const floor = pieceFor(w, 'floor', { x: gx, z: gz }, p);
  assert.equal(buildProblem(w, floor, p), null);
  placePiece(w, floor);
  assert.match(buildProblem(w, pieceFor(w, 'floor', { x: gx, z: gz }, p), p), /Ya hay/);
  // Se puede pisar el piso.
  const onFloor = newPlayer(floor.def.x0 + 2, 0, floor.def.z0 + 2); onFloor.y = floorAt(w, onFloor.x, onFloor.z, 80);
  assert.ok(Math.abs(onFloor.y - floor.B) < 0.01);
  // La pared frena.
  const wall = pieceFor(w, 'wall', { x: gx + 10, z: gz }, p);
  placePiece(w, wall);
  const q = newPlayer(wall.def.x0 - 4, 0, (wall.def.z0 + wall.def.z1) / 2, -Math.PI / 2);
  q.y = floorAt(w, q.x, q.z, 80); q.grounded = true;
  const x0 = q.x;
  walk(q, { f: true }, 3, w);
  assert.ok(q.x < wall.def.x0 + 0.2 && q.x > x0, 'avanzó y la pared la frenó');
  // Sin madera no se puede.
  p.wood = 3;
  assert.match(buildProblem(w, pieceFor(w, 'wall', { x: gx + 2, z: gz + 5 }, p), p), /madera/);
});

test('royale3d: por una rampa se sube a un piso de arriba', () => {
  const w = clean(9);
  const gx = 2, gz = 2;
  const p = newPlayer(gx - 4, 0, gz, -Math.PI / 2); p.y = floorAt(w, p.x, p.z, 80); p.grounded = true; p.wood = 100;
  const ramp = pieceFor(w, 'ramp', { x: gx, z: gz }, p);
  placePiece(w, ramp);
  assert.equal(ramp.e, 0, 'sube hacia donde mirás (+x)');
  // El piso de al lado, un nivel arriba, empalma con la punta de la rampa.
  const next = pieceFor(w, 'floor', { x: gx + 4, z: gz }, p, 1);
  assert.equal(next.anchor, ramp.anchor);
  placePiece(w, next);
  walk(p, { f: true }, 1.5, w);
  assert.ok(p.y > ramp.anchor + 2.8, `subió: ${(p.y - ramp.anchor).toFixed(2)}`);
  assert.ok(BUILD_KINDS.ramp.cost > 0);
});

// ─── Tormenta y cofres del cielo ─────────────────────────────────────────────
test('royale3d: la tormenta se achica por fases, cada círculo cabe en el anterior, y es igual para la misma semilla', () => {
  const c = stormCenters(SEED);
  assert.deepEqual(c, stormCenters(SEED));
  assert.equal(c.length, STORM_PHASES.length + 1);
  for (let i = 1; i < c.length; i++) assert.ok(Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z) + c[i].r <= c[i - 1].r + 1e-6, `fase ${i}`);
  assert.ok(stormAt(SEED, 0).r > ISLAND_R * 1.2, 'al empezar cubre toda la isla');
  let prev = Infinity;
  for (let t = 0; t < 600; t += 5) { const s = stormAt(SEED, t); assert.ok(s.r <= prev + 1e-9); prev = s.r; }
  assert.equal(stormAt(SEED, 10000).r, STORM_PHASES.at(-1).r);
  assert.ok(stormAt(SEED, 150, 0.65).r < stormAt(SEED, 150, 1).r, 'la rápida va adelantada');
});

test('royale3d: los cofres del cielo caen adentro de la zona de su momento, cada vez más tarde y con lo mejor', () => {
  const d0 = dropInfo(world, 0), d1 = dropInfo(world, 1);
  assert.deepEqual(d0, dropInfo(world, 0));
  assert.ok(d1.at > d0.at && d0.tier === 3 && d0.i === DROP_BASE);
  for (let n = 0; n < 8; n++) {
    const d = dropInfo(world, n);
    const st = stormAt(SEED, d.at);
    assert.ok(Math.hypot(d.x - st.x, d.z - st.z) <= st.r + 1, `el cofre ${n} cae dentro de la zona`);
    assert.ok(world.height(d.x, d.z) > 0, 'sobre tierra');
    assert.equal(chestOf(world, DROP_BASE + n).i, DROP_BASE + n);
  }
  assert.ok(LOOT_LIMIT > DROP_BASE);
});

test('royale3d: en la isla de espera todos aparecen en tierra firme y sin estar adentro de nada', () => {
  const lobby = makeWorld(SEED, 'lobby');
  for (let i = 0; i < 10; i++) {
    const sp = spawnPoint(SEED, i, 10, lobby);
    assert.ok(lobby.height(sp.x, sp.z) > 1);
    const p = newPlayer(sp.x, 0, sp.z); p.y = floorAt(lobby, sp.x, sp.z, 50);
    assert.ok(!lobby.near(sp.x - 0.5, sp.z - 0.5, sp.x + 0.5, sp.z + 0.5, []).some((s) => s.y1 > p.y + 0.6));
  }
});

// ─── La sala ─────────────────────────────────────────────────────────────────
function lobbyOf(n) {
  let room = newRoom('h', 'Nico', '🐸', 1000);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `J${i}` });
  return room;
}
function playing(n = 3) {
  return applyAction(lobbyOf(n), { type: 'start', playerId: 'h' }, { now: 5000, rand: () => 0.3 });
}

test('royale3d: hacen falta 2 jugadores, hasta 10, y solo el anfitrión arranca', () => {
  assert.ok(startProblem(lobbyOf(1)));
  assert.equal(applyAction(lobbyOf(1), { type: 'start', playerId: 'h' }), null);
  assert.equal(applyAction(lobbyOf(3), { type: 'start', playerId: 'p1' }), null);
  assert.equal(MAX_PLAYERS, 10);
  assert.equal(lobbyOf(MAX_PLAYERS).players.length, MAX_PLAYERS);
  assert.equal(applyAction(lobbyOf(MAX_PLAYERS), { type: 'join', playerId: 'x', name: 'Extra' }), null);
  const room = playing(3);
  assert.equal(room.phase, 'playing');
  assert.equal(alive(room).length, 3);
  assert.equal(room.match.order.length, 3);
});

test('royale3d: la velocidad de la tormenta se elige entre tres y solo en la sala de espera', () => {
  const room = lobbyOf(2);
  for (const v of ['lenta', 'normal', 'rapida']) assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { storm: v } }).options.storm, v);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'h', options: { storm: 'loca' } }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p1', options: { storm: 'rapida' } }), null);
});

test('royale3d: los cofres los abre el primero que llega y cada cosa del piso la agarra uno solo', () => {
  let room = playing(3);
  const m = room.match.n;
  assert.equal(applyAction(room, { type: 'take', playerId: 'p1', match: m, key: '3:0' }), null, 'el cofre tiene que estar abierto');
  room = applyAction(room, { type: 'loot', playerId: 'p1', match: m, i: 3 });
  assert.equal(room.match.loot[3], 'p1');
  assert.equal(room.players.find((p) => p.id === 'p1').loot, 1);
  assert.equal(applyAction(room, { type: 'loot', playerId: 'p2', match: m, i: 3 }), null, 'ya lo abrió otro');
  assert.equal(applyAction(room, { type: 'loot', playerId: 'p2', match: m, i: LOOT_LIMIT }), null);
  assert.equal(applyAction(room, { type: 'loot', playerId: 'p2', match: m + 1, i: 4 }), null, 'de otra partida no');
  room = applyAction(room, { type: 'take', playerId: 'p2', match: m, key: '3:0' });
  assert.equal(room.match.took['3:0'], 'p2');
  assert.equal(applyAction(room, { type: 'take', playerId: 'p1', match: m, key: '3:0' }), null);
  assert.ok(applyAction(room, { type: 'take', playerId: 'p1', match: m, key: 'w12.3' }), 'las armas tiradas se agarran por su clave');
  assert.equal(applyAction(room, { type: 'take', playerId: 'p1', match: m, key: 'cualquiera' }), null);
  assert.equal(applyAction(room, { type: 'take', playerId: 'p1', match: m, key: '3:9' }), null);
});

test('royale3d: al caer el penúltimo gana el que queda, con puestos del último al primero en caer', () => {
  let room = playing(3);
  const m = room.match.n;
  const t = room.match.startsAt + 1000;
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: room.match.startsAt - 1 }), null, 'antes de arrancar no vale');
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m + 1 }, { now: t }), null);
  room = applyAction(room, { type: 'died', playerId: 'p1', match: m, by: 'h', w: 'rifle' }, { now: t });
  assert.equal(room.phase, 'playing');
  assert.equal(room.players.find((p) => p.id === 'h').kills, 1);
  assert.deepEqual(room.match.deaths[0], { id: 'p1', by: 'h', w: 'rifle' });
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', match: m }, { now: t }), null, 'no se muere dos veces');
  room = applyAction(room, { type: 'died', playerId: 'p2', match: m, w: 'storm' }, { now: t + 1 });
  assert.equal(room.phase, 'final');
  assert.equal(room.match.winner, 'h');
  assert.deepEqual(ranking(room).map((p) => p.id), ['h', 'p2', 'p1']);
  const total = 3;
  assert.ok(score(ranking(room)[0], total) > score(ranking(room)[1], total));
});

test('royale3d: el anfitrión da por muerto al que se fue; salirse en plena partida cuenta como caer', () => {
  let room = playing(2);
  const m = room.match.n;
  assert.equal(applyAction(room, { type: 'died', playerId: 'p1', target: 'h', match: m }, { now: room.match.startsAt + 1 }), null);
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
  assert.deepEqual(again.match.loot, {});
  const lobby = applyAction(room, { type: 'toLobby', playerId: 'h' });
  assert.equal(lobby.phase, 'lobby');
  assert.ok(lobby.players.every((p) => !p.inGame && !p.alive));
});

test('royale3d: la sala entera pesa poco (10 jugadores, muchos cofres abiertos y cosas agarradas)', () => {
  let room = playing(10);
  const m = room.match.n;
  for (let i = 0; i < 60; i++) room = applyAction(room, { type: 'loot', playerId: `p${1 + (i % 9)}`, match: m, i }) || room;
  for (let i = 0; i < 60; i++) for (let k = 0; k < 6; k++) room = applyAction(room, { type: 'take', playerId: `p${1 + (k % 9)}`, match: m, key: `${i}:${k}` }) || room;
  for (const p of room.players.slice(1)) room = applyAction(room, { type: 'died', playerId: p.id, match: m, by: 'h', w: 'rifle' }, { now: room.match.startsAt + 10 }) || room;
  assert.equal(room.phase, 'final');
  assert.ok(JSON.stringify(room).length < 12000, String(JSON.stringify(room).length));
});

test('royale3d: Ciudad Cuki tiene calles, edificios de dos pisos con rampa y cofre arriba, y caminos a cada lugar', () => {
  for (const seed of [3, SEED]) {
    const w = makeWorld(seed);
    const c = w.places.find((p) => p.id === 'ciudad');
    assert.ok(Math.hypot(c.x, c.z) < ISLAND_R * 0.3, 'la ciudad queda cerca del medio');
    assert.ok(w.streets.length >= 12, `calles: ${w.streets.length}`);
    assert.equal(w.roads.length, w.places.length - 1);
    const ramps = w.solids.filter((s) => s.k === 'ramp' && Math.hypot((s.x0 + s.x1) / 2 - c.x, (s.z0 + s.z1) / 2 - c.z) < c.r);
    for (const r of ramps) {
      const high = w.chests.find((ch) => ch.y > r.y0 + 3.5 && Math.hypot(ch.x - (r.x0 + r.x1) / 2, ch.z - (r.z0 + r.z1) / 2) < 12);
      assert.ok(high, 'cada entrepiso tiene su cofre');
    }
  }
});
