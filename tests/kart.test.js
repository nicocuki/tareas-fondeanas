import test from 'node:test';
import assert from 'node:assert/strict';
import { LAPS, RANDOM_PICK, TRACKS, buildTrack, nearest } from '../src/kart/tracks.js';
import { CC, ITEM_IDS, MT_TIMES, STEP, botInput, hitKart, newKart, rankingOf, rollItem, spawnShot, stepKart, stepShot } from '../src/kart/sim.js';
import { MAX_LOCAL, applyAction, newRoom, pickTrack, racersFor } from '../src/kart/game.js';
import { SKIN_IDS } from '../src/wii/skins.js';

const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('kart: las 7 pistas son circuitos cerrados y la largada, las cajas y los aceleradores quedan sobre el asfalto', () => {
  assert.equal(TRACKS.length, 7);
  assert.equal(RANDOM_PICK, 7);
  for (let i = 0; i < TRACKS.length; i++) {
    const t = buildTrack(i);
    assert.ok(t.length > 500, `${t.id} mide ${t.length}`);
    const a = t.samples[0], b = t.samples[t.count - 1];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 3, `${t.id} cierra`);
    for (const g of t.grid) assert.ok(Math.abs(nearest(t, g.x, g.z).lat) < t.half, `${t.id}: lugar de largada adentro`);
    for (const x of [...t.boxes, ...t.pads]) assert.ok(Math.abs(nearest(t, x.x, x.z).lat) < t.half, `${t.id}: caja o acelerador adentro`);
    // Ninguna parte de la pista se pisa con otra (si no, el kart saltaría de un tramo al otro).
    for (let p = 0; p < t.count; p += 4) for (let q = p + 40; q < t.count - (p < 40 ? 40 - p : 0); q += 4) {
      const d = Math.hypot(t.samples[p].x - t.samples[q].x, t.samples[p].z - t.samples[q].z);
      assert.ok(d > t.width + 2, `${t.id}: los tramos ${p} y ${q} están a ${d.toFixed(1)} m`);
    }
  }
});

test('kart: un bot completa las 3 vueltas en todas las pistas, sin caerse y en un tiempo razonable', () => {
  for (let i = 0; i < TRACKS.length; i++) {
    const t = buildTrack(i);
    const k = newKart('bot-0', 0, t);
    let falls = 0, time = 0;
    for (let n = 0; n < 60 * 60 * 4 && !k.finished; n++) {
      time = n * STEP - 1;
      const wasFalling = k.fall > 0;
      stepKart(k, botInput(k, t), STEP, t, { cc: 150, t: time });
      if (!wasFalling && k.fall > 0) falls++;
    }
    assert.ok(k.finished, `${t.id}: terminó (vuelta ${k.lap})`);
    assert.ok(falls <= 1, `${t.id}: se cayó ${falls} veces`);
    const perLap = k.finishT / LAPS;
    assert.ok(perLap < (t.length / CC[150].max) * 1.9, `${t.id}: ${perLap.toFixed(1)} s por vuelta`);
  }
});

test('kart: el derrape carga el mini turbo y al soltar da turbo; con más carga, más turbo', () => {
  const t = { ...buildTrack(0), half: 1000, wallAt: 1000, pads: [] }; // un playón: que no se vaya de la pista dando vueltas
  const run = (holdSeconds) => {
    const k = newKart('a', 0, t);
    k.started = true; k.speed = 25; k.yaw = t.grid[0].yaw;
    stepKart(k, { s: 1, a: true, d: true }, STEP, t, { cc: 150, t: 1 }); // salto
    for (let n = 0; n < 60 * holdSeconds; n++) stepKart(k, { s: 1, a: true, d: true }, STEP, t, { cc: 150, t: 1 });
    assert.equal(k.drift, 1, 'derrapa a la derecha');
    stepKart(k, { s: 0, a: true, d: false }, STEP, t, { cc: 150, t: 1 });
    return k.boost;
  };
  assert.equal(run(0.4), 0, 'muy poca carga: nada');
  const blue = run(1.5), purple = run(3.5);
  assert.ok(blue > 0 && blue <= MT_TIMES[1] + 0.01, `azul ${blue}`);
  assert.ok(purple > blue, `violeta ${purple} > azul ${blue}`);
});

test('kart: acelerar justo en el «2» da turbo de largada; antes de tiempo, el motor se ahoga', () => {
  const t = buildTrack(1);
  const start = (pressAt) => {
    const k = newKart('a', 0, t);
    for (let time = -3; time < 0.05; time += STEP) stepKart(k, { s: 0, a: time >= pressAt, d: false }, STEP, t, { cc: 100, t: time });
    return k;
  };
  assert.ok(start(-1.0).boost > 0, 'turbo');
  assert.ok(start(-2.8).spin > 0, 'ahogado');
  assert.equal(start(0).boost, 0, 'tarde: nada');
});

test('kart: un golpe hace girar el kart; con estrella no pasa nada', () => {
  const t = buildTrack(0);
  const k = newKart('a', 0, t);
  assert.ok(hitKart(k, 'verde'));
  assert.ok(k.spin > 0);
  assert.equal(hitKart(k, 'verde'), false, 'recién golpeado no se vuelve a golpear');
  const s = newKart('b', 1, t); s.star = 5;
  assert.equal(hitKart(s, 'rojo'), false);
});

test('kart: los ítems dependen del puesto y el caparazón rebotador vuelve de la pared', () => {
  const r = seeded(5);
  const first = new Set(), last = new Set();
  for (let i = 0; i < 400; i++) { first.add(rollItem(0, 8, r)); last.add(rollItem(7, 8, r)); }
  for (const id of [...first, ...last]) assert.ok(ITEM_IDS.includes(id));
  assert.ok(!first.has('estrella') && !first.has('rayo') && !first.has('dorado'), 'el primero no recibe ítems para alcanzar');
  assert.ok(last.has('estrella') && !last.has('banana'), 'el último recibe ítems fuertes');
  const t = buildTrack(0);
  const k = newKart('a', 0, t);
  k.yaw += Math.PI / 2; // apunta a la pared
  const p = spawnShot('verde', 'a', k, 's1', 0);
  let alive = true;
  for (let n = 0; n < 120 && alive; n++) alive = stepShot(p, STEP, t, () => null, n * STEP);
  assert.ok(alive, 'sigue andando');
  assert.ok(Math.abs(nearest(t, p.x, p.z).lat) < t.half + t.wallAt, 'no se fue de la pista');
});

test('kart: los puestos van por tiempo de llegada y después por cuánto avanzó cada uno', () => {
  const ks = [{ id: 'a', prog: 100 }, { id: 'b', prog: 300 }, { id: 'c', prog: 50, finished: true, finishT: 80 }, { id: 'd', prog: 10 }];
  assert.deepEqual(rankingOf(ks, { d: 70000 }), ['d', 'c', 'b', 'a']);
});

test('kart: la sala entra, vota la pista, corre y termina con resultados', () => {
  let now = 1000;
  const rand = seeded(9);
  const act = (room, a) => applyAction(room, a, { now, rand });
  let room = newRoom('h', 'Host', '🏎️', now);
  room = act(room, { type: 'join', playerId: 'p2', name: 'Feli' });
  assert.equal(room.players.length, 2);
  assert.notEqual(room.players[0].skin, room.players[1].skin, 'cada uno con un personaje distinto');
  assert.equal(act(room, { type: 'setSkin', playerId: 'p2', skin: room.players[0].skin }), null, 'no se repite personaje');
  assert.ok(SKIN_IDS.length === 8);
  assert.equal(racersFor(room).length, 8, 'rellena con bots');
  room = act(room, { type: 'setOptions', playerId: 'h', options: { cc: 150, items: false } });
  assert.equal(act(room, { type: 'setOptions', playerId: 'p2', options: { cc: 50 } }), null, 'solo el anfitrión');
  room = act(room, { type: 'start', playerId: 'h' });
  assert.equal(room.phase, 'vote');
  room = act(room, { type: 'vote', playerId: 'h', n: room.vote.n, pick: 3 });
  assert.equal(room.phase, 'vote');
  room = act(room, { type: 'vote', playerId: 'p2', n: room.vote.n, pick: 3 });
  assert.equal(room.phase, 'race', 'votaron todos: arranca');
  assert.equal(room.race.track, 3);
  assert.equal(room.race.cc, 150);
  assert.equal(room.race.items, false);
  assert.equal(room.race.racers.length, 8);
  const n = room.race.n;
  assert.equal(act(room, { type: 'finish', playerId: 'p2', n, id: 'h', ms: 9000 }), null, 'otra compu no avisa por mí');
  room = act(room, { type: 'finish', playerId: 'h', n, id: 'h', ms: 90000 });
  room = act(room, { type: 'finish', playerId: 'h', n, id: 'bot-0', ms: 85000 });
  assert.equal(act(room, { type: 'end', playerId: 'h', n, order: [] }), null, 'falta que llegue la otra persona');
  room = act(room, { type: 'finish', playerId: 'p2', n, id: 'p2', ms: 95000 });
  now += 3000;
  room = act(room, { type: 'end', playerId: 'h', n, order: ['bot-3', 'bot-1'] });
  assert.equal(room.phase, 'results');
  assert.deepEqual(room.results.order.slice(0, 5).map((o) => o.id), ['bot-0', 'h', 'p2', 'bot-3', 'bot-1']);
  assert.ok(JSON.stringify(room).length < 30000);
  room = act(room, { type: 'start', playerId: 'h' });
  assert.equal(room.phase, 'vote', 'otra carrera');
});

test('kart: la votación vence sola y «?» elige una pista cualquiera', () => {
  let room = newRoom('h', 'Host', '🏎️', 0);
  room = applyAction(room, { type: 'start', playerId: 'h' }, { now: 0 });
  assert.equal(applyAction(room, { type: 'tick', playerId: 'h', n: room.vote.n }, { now: 1000 }), null, 'todavía no');
  const r2 = applyAction(room, { type: 'tick', playerId: 'h', n: room.vote.n }, { now: 16000, rand: () => 0.5 });
  assert.equal(r2.phase, 'race');
  const { pick, track } = pickTrack({ a: RANDOM_PICK }, () => 0.99);
  assert.equal(pick, RANDOM_PICK);
  assert.ok(track >= 0 && track < TRACKS.length);
});

test('kart: en el local los celulares entran a la compu del anfitrión, hasta 4', () => {
  let room = newRoom('h', 'Host', '🏎️', 0);
  room = applyAction(room, { type: 'setOptions', playerId: 'h', options: { mode: 'local' } }, { now: 0 });
  room = applyAction(room, { type: 'hostKeys', playerId: 'h' }, { now: 0 }); // el anfitrión se baja (queda solo de tele)
  for (let i = 0; i < 6; i++) room = applyAction(room, { type: 'join', playerId: `c${i}`, name: `C${i}` }, { now: 0 }) || room;
  assert.equal(room.players.length, MAX_LOCAL);
  assert.ok(room.players.every((p) => p.screen === 'h' && p.ctrl === 'phone'));
  room = applyAction(room, { type: 'setOptions', playerId: 'h', options: { mode: 'online' } }, { now: 0 });
  assert.deepEqual(room.players.map((p) => p.id), ['h'], 'al pasar a online salen los celulares');
});

test('kart: una sala pública de Fondo Kart (online) y una de Tenis Movido sin celulares aparecen en la portada', async () => {
  const { roomListing } = await import('../worker/publicas.js');
  const tree = (code, room) => ({ publica: { [code]: true }, rooms: { [code]: JSON.stringify(room) } });
  const kart = newRoom('h', 'Nico', '🏎️', 0);
  assert.equal(roomListing(tree('ABCD', kart), 'ABCD', 1)?.game, 'kart');
  const local = applyAction(kart, { type: 'setOptions', playerId: 'h', options: { mode: 'local' } }, { now: 0 });
  assert.equal(roomListing(tree('ABCD', local), 'ABCD', 1), null, 'la local no: se entra con el celular');
  const tenis = (await import('../src/tenis/game.js')).newRoom('h', 'Cancha', '📺', 0);
  assert.equal(roomListing(tree('WXYZ', tenis), 'WXYZ', 1)?.game, 'tenis');
});
