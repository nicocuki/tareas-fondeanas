import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import {
  CATEGORIES, MAX_ROLLS, applyAction, categoriesFor, currentPlayer, diceToThrow, findPlayer, holdProblem, isDone, newRoom,
  preview, rollProblem, scoreFor, scoreProblem, totalOf,
} from '../src/generala/game.js';
import {
  DIE, FACES, HALF, HAND, POUR_GAP, TRAY, cleanThrow, mulberry32, readDie, shelfSlot, simulate, throwSetup,
} from '../src/generala/dice.js';

await RAPIER.init();

const rand = () => 0; // con 0 arranca el primero de la lista
const FLAT = [0, HALF, 0, 0, 0, 0, 1]; // un dado apoyado de plano, con el 1 arriba
const GESTURE = { s: 7, x: 0, z: 60, a: 0, b: -1000, p: 50 };

// Una sala con `n` jugadores (a, b, c…) y la partida empezada: arranca a.
function started(n = 2, options) {
  let room = newRoom('a', 'Ana', '🐸', 0);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: 'abcdefgh'[i], name: `J${i}` }, { now: 0, rand });
  if (options) room = applyAction(room, { type: 'setOptions', playerId: 'a', options }, { now: 0 });
  return applyAction(room, { type: 'start', playerId: 'a' }, { now: 1000, rand });
}
const act = (room, playerId, action, now = 2000) => applyAction(room, { ...action, playerId }, { now, rand });
// Tira el que juega: `values` son los valores de los dados que salen del cubilete (0 = montado).
function roll(room, values) {
  const t = room.turn;
  const next = act(room, t.p, { type: 'roll', seen: t.rollN, throw: GESTURE, values, poses: values.map(() => FLAT) });
  assert.ok(next, 'la tirada tiene que valer');
  return next;
}
const score = (room, cat) => act(room, room.turn.p, { type: 'score', cat, turn: room.turn.n });
const hold = (room, i) => act(room, room.turn.p, { type: 'hold', i, turn: room.turn.n, seen: room.turn.rollN });

// ─── Puntos ──────────────────────────────────────────────────────────────────
test('generala: los números valen lo que suman los dados de ese número', () => {
  assert.equal(scoreFor('n4', [4, 4, 1, 4, 6]), 12);
  assert.equal(scoreFor('n1', [1, 1, 1, 1, 1]), 5);
  assert.equal(scoreFor('n6', [1, 2, 3, 4, 5]), 0);
});

test('generala: escalera, full, póker y generala, con 5 más si salen servidos', () => {
  for (const dice of [[1, 2, 3, 4, 5], [6, 5, 4, 3, 2], [3, 4, 5, 6, 1]]) assert.equal(scoreFor('esc', dice), 20);
  assert.equal(scoreFor('esc', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreFor('esc', [2, 2, 3, 4, 5]), 0);
  assert.equal(scoreFor('esc', [5, 1, 3, 2, 4], { served: true }), 25);
  assert.equal(scoreFor('full', [3, 3, 5, 5, 5]), 30);
  assert.equal(scoreFor('full', [3, 3, 5, 5, 5], { served: true }), 35);
  assert.equal(scoreFor('full', [5, 5, 5, 5, 5]), 0, 'cinco iguales no son full');
  assert.equal(scoreFor('full', [1, 1, 2, 2, 3]), 0);
  assert.equal(scoreFor('poker', [2, 2, 6, 2, 2]), 40);
  assert.equal(scoreFor('poker', [2, 2, 2, 2, 2], { served: true }), 45, 'cinco iguales también son póker');
  assert.equal(scoreFor('poker', [2, 2, 2, 3, 3]), 0);
  assert.equal(scoreFor('gen', [6, 6, 6, 6, 6]), 50);
  assert.equal(scoreFor('gen', [6, 6, 6, 6, 5]), 0);
});

test('generala: la doble solo vale con la generala ya anotada con puntos', () => {
  assert.equal(scoreFor('doble', [3, 3, 3, 3, 3]), 0);
  assert.equal(scoreFor('doble', [3, 3, 3, 3, 3], { sheet: { gen: 0 } }), 0, 'tachada no cuenta');
  assert.equal(scoreFor('doble', [3, 3, 3, 3, 3], { sheet: { gen: 50 } }), 100);
});

test('generala: con un dado sin valor (montado) no se anota nada', () => {
  assert.equal(scoreFor('n3', [3, 3, 0, 3, 3]), 0);
  assert.equal(scoreFor('zz', [1, 2, 3, 4, 5]), 0);
});

// ─── La partida ──────────────────────────────────────────────────────────────
test('generala: hasta tres tiradas; entre una y otra se apartan dados y solo salen los que no se guardaron', () => {
  let room = started(2);
  assert.equal(room.phase, 'playing');
  assert.equal(room.turn.p, 'a');
  assert.equal(holdProblem(room, 'a'), 'Primero tirá los dados.');
  assert.equal(scoreProblem(room, 'a', 'n1'), 'Primero tirá los dados.');
  assert.deepEqual(diceToThrow(room), [0, 1, 2, 3, 4]);
  room = roll(room, [4, 4, 2, 6, 4]);
  assert.equal(room.turn.rolls, 1);
  assert.deepEqual(room.turn.dice, [4, 4, 2, 6, 4]);
  assert.equal(act(room, 'b', { type: 'hold', i: 0, turn: room.turn.n, seen: room.turn.rollN }), null, 'el otro no toca mis dados');
  for (const i of [0, 1, 4]) room = hold(room, i);
  assert.deepEqual(room.turn.held, [1, 1, 0, 0, 1]);
  room = hold(room, 4);
  room = hold(room, 4);
  assert.deepEqual(diceToThrow(room), [2, 3]);
  assert.equal(act(room, 'a', { type: 'roll', seen: room.turn.rollN, throw: GESTURE, values: [4, 4, 4], poses: [FLAT, FLAT, FLAT] }), null, 'tienen que venir justo los dados que se tiran');
  room = roll(room, [4, 1]);
  assert.deepEqual(room.turn.dice, [4, 4, 4, 1, 4]);
  room = hold(room, 2);
  room = roll(room, [4]);
  assert.equal(room.turn.rolls, MAX_ROLLS);
  assert.equal(rollProblem(room, 'a'), 'Ya usaste las tres tiradas: anotá en la planilla.');
  assert.equal(holdProblem(room, 'a'), 'Ya no quedan tiradas.');
  assert.deepEqual(preview(room), { n1: 0, n2: 0, n3: 0, n4: 20, n5: 0, n6: 0, esc: 0, full: 0, poker: 40, gen: 50, doble: 0 });
  room = score(room, 'gen');
  assert.equal(findPlayer(room, 'a').sheet.gen, 50);
  assert.equal(room.turn.p, 'b', 'pasa el turno');
  assert.equal(room.turn.rolls, 0);
  assert.deepEqual(room.last, { n: 1, p: 'a', cat: 'gen', pts: 50, served: false });
});

test('generala: dos clics seguidos no tiran dos veces, ni vale tirar o anotar fuera de turno', () => {
  let room = started(2);
  const seen = room.turn.rollN;
  room = roll(room, [1, 2, 3, 4, 6]);
  assert.equal(act(room, 'a', { type: 'roll', seen, throw: GESTURE, values: [1, 1, 1, 1, 1], poses: Array(5).fill(FLAT) }), null);
  assert.equal(act(room, 'b', { type: 'roll', seen: room.turn.rollN, throw: GESTURE, values: [1, 1, 1, 1, 1], poses: Array(5).fill(FLAT) }), null);
  assert.equal(act(room, 'b', { type: 'score', cat: 'n1', turn: room.turn.n }), null);
  assert.equal(act(room, 'a', { type: 'score', cat: 'n1', turn: room.turn.n + 1 }), null, 'una anotación de otro turno se descarta');
  assert.equal(act(room, 'a', { type: 'roll', seen: room.turn.rollN, throw: GESTURE, values: [7, 1, 1, 1, 1], poses: Array(5).fill(FLAT) }), null, 'un dado no vale 7');
  assert.equal(act(room, 'a', { type: 'roll', seen: room.turn.rollN, throw: GESTURE, values: [1, 1, 1, 1, 1], poses: Array(5).fill([0, 1, 2]) }), null, 'las posiciones tienen que estar completas');
});

test('generala: con un dado montado la tirada no vale, no gasta intento y se tiran de nuevo los mismos dados', () => {
  let room = started(1);
  room = roll(room, [5, 5, 3, 2, 1]);
  room = hold(room, 0);
  room = hold(room, 1);
  room = roll(room, [5, 0, 2]);
  assert.equal(room.turn.cocked, true);
  assert.equal(room.turn.rolls, 1, 'no gastó la tirada');
  assert.equal(scoreProblem(room, 'a', 'n5'), 'Hay un dado montado: tirá de nuevo.');
  assert.equal(holdProblem(room, 'a'), 'Hay un dado montado: tirá de nuevo.');
  assert.deepEqual(preview(room), {});
  assert.deepEqual(diceToThrow(room), [2, 3, 4]);
  room = roll(room, [5, 5, 5]);
  assert.equal(room.turn.cocked, false);
  assert.equal(room.turn.rolls, 2);
  assert.deepEqual(room.turn.dice, [5, 5, 5, 5, 5]);
  // Montado en la tercera tirada: igual se repite.
  room = hold(room, 0);
  room = roll(room, [5, 5, 0, 5]);
  assert.equal(room.turn.rolls, 2);
  assert.equal(rollProblem(room, 'a'), null);
  room = roll(room, [5, 5, 6, 5]);
  assert.equal(room.turn.rolls, 3);
  assert.equal(score(room, 'poker').players[0].sheet.poker, 40);
});

test('generala: servido da 5 más, y tachar anota cero', () => {
  let room = started(1);
  room = roll(room, [2, 2, 2, 6, 6]);
  room = score(room, 'full');
  assert.equal(room.players[0].sheet.full, 35);
  assert.equal(room.last.served, true);
  room = roll(room, [1, 2, 2, 6, 6]);
  room = score(room, 'esc');
  assert.equal(room.players[0].sheet.esc, 0, 'tachada');
  assert.equal(scoreProblem(room, 'a', 'esc'), 'Primero tirá los dados.');
  room = roll(room, [1, 2, 3, 4, 5]);
  assert.equal(scoreProblem(room, 'a', 'esc'), 'Esa casilla ya está anotada.');
  assert.equal(score(room, 'esc'), null);
});

test('generala: la generala servida gana la partida ahí mismo, si la sala juega así', () => {
  let room = started(2);
  room = roll(room, [3, 3, 3, 3, 3]);
  room = score(room, 'gen');
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winners, ['a']);
  assert.equal(room.reason, 'servida');

  room = started(2, { servida: false });
  room = roll(room, [3, 3, 3, 3, 3]);
  room = score(room, 'gen');
  assert.equal(room.phase, 'playing');
  assert.equal(room.players[0].sheet.gen, 50);
});

test('generala: sin la doble la planilla tiene diez casillas', () => {
  const room = started(1, { doble: false });
  assert.equal(categoriesFor(room).length, 10);
  assert.equal(scoreProblem(roll(room, [1, 1, 1, 1, 1]), 'a', 'doble'), 'Esa casilla no se juega.');
  assert.equal(categoriesFor(started(1)).length, CATEGORIES.length);
});

test('generala: una partida entera: termina cuando todos llenan la planilla y gana el que más suma', () => {
  let room = started(3, { servida: false });
  let turns = 0;
  while (room.phase === 'playing') {
    const me = currentPlayer(room);
    // a saca siempre seis, b siempre unos y c siempre escalera.
    room = roll(room, me.id === 'a' ? [6, 6, 6, 6, 6] : me.id === 'b' ? [1, 1, 1, 1, 1] : [1, 2, 3, 4, 5]);
    const options = preview(room);
    const best = Object.keys(options).sort((x, y) => options[y] - options[x])[0];
    room = score(room, best);
    turns += 1;
    assert.ok(turns <= 33);
  }
  assert.equal(turns, 33);
  assert.ok(room.players.every((p) => isDone(room, p)));
  assert.deepEqual(room.winners, ['a']);
  assert.equal(room.reason, 'puntos');
  assert.equal(totalOf(room.players[0].sheet), 50 + 100 + 45 + 30, 'generala, doble, póker servido y los seis');
  // Otra partida: planillas en cero.
  room = act(room, 'a', { type: 'start' });
  assert.equal(room.phase, 'playing');
  assert.ok(room.players.every((p) => totalOf(p.sheet) === 0 && !Object.keys(p.sheet).length));
});

test('generala: si empatan, ganan los dos', () => {
  let room = started(2, { servida: false });
  while (room.phase === 'playing') {
    room = roll(room, [2, 2, 3, 3, 3]);
    room = score(room, Object.keys(preview(room))[0]);
  }
  assert.deepEqual(room.winners, ['a', 'b']);
});

test('generala: el que se va en plena partida queda en la planilla y se saltea; si era su turno, pasa', () => {
  let room = started(3);
  room = roll(room, [1, 2, 3, 4, 6]);
  room = act(room, 'a', { type: 'leave' });
  assert.equal(findPlayer(room, 'a').left, true);
  assert.equal(room.turn.p, 'b');
  assert.equal(room.hostId, 'b', 'el anfitrión pasa a otro');
  room = score(roll(room, [1, 1, 1, 2, 2]), 'n1');
  assert.equal(room.turn.p, 'c');
  room = score(roll(room, [1, 1, 1, 2, 2]), 'n1');
  assert.equal(room.turn.p, 'b', 'a ya no juega');
  assert.equal(act(room, 'z', { type: 'join', name: 'Zeta' }), null, 'nadie entra con la partida empezada');
  // El anfitrión saca a c en plena partida.
  room = act(room, 'b', { type: 'kick', target: 'c' });
  assert.equal(findPlayer(room, 'c').left, true);
  assert.deepEqual(room.kicked, ['c']);
  room = act(room, 'b', { type: 'leave' });
  assert.equal(room.phase, 'ended', 'no queda nadie');
});

test('generala: las opciones las cambia solo el anfitrión, en la sala de espera', () => {
  let room = newRoom('a', 'Ana', '🐸', 0);
  room = act(room, 'b', { type: 'join', name: 'Beto' });
  assert.equal(act(room, 'b', { type: 'setOptions', options: { doble: false } }), null);
  room = act(room, 'a', { type: 'setOptions', options: { doble: false } });
  assert.deepEqual(room.options, { servida: true, doble: false });
  room = act(room, 'a', { type: 'start' });
  assert.equal(act(room, 'a', { type: 'setOptions', options: { doble: true } }), null);
});

test('generala: la sala más grande entra holgada en el tope de 30.000 caracteres', () => {
  let room = started(8, { servida: false });
  for (const p of room.players) { p.name = 'Ñandú "comillas"'; for (const c of CATEGORIES) p.sheet[c.id] = 100; }
  room.turn.poses = room.turn.poses.map(() => [-13.9999, 0.7999, -9.9999, -0.7071, -0.7071, -0.7071, -0.7071]);
  room.turn.throw = cleanThrow({ s: 4294967295, x: -110, z: -10, a: -1000, b: -1000, p: 100 });
  room.kicked = Array(10).fill('abcdefgh');
  assert.ok(JSON.stringify(room).length < 3000, `pesa ${JSON.stringify(room).length}`);
});

// ─── La física ───────────────────────────────────────────────────────────────
test('generala: el dado es de verdad: las caras opuestas suman 7', () => {
  for (let k = 0; k < 6; k += 2) assert.equal(FACES[k] + FACES[k + 1], 7);
  assert.equal(readDie([0, HALF, 0, 0, 0, 0, 1]).value, 1);
  const h = Math.SQRT1_2;
  assert.equal(readDie([0, HALF, 0, h, 0, 0, h]).value, 5, 'girado un cuarto sobre x queda arriba la cara de -z');
  assert.equal(readDie([0, HALF, 0, 0, 0, h, h]).value, 3, 'girado un cuarto sobre z queda arriba la cara de +x');
  assert.equal(readDie([0, HALF, 0, 1, 0, 0, 0]).value, 6, 'dado vuelta');
});

test('generala: un dado inclinado o arriba de otro está montado y no vale', () => {
  const tilt = Math.sin(0.2), w = Math.cos(0.2); // 23° sobre x
  assert.equal(readDie([0, HALF + 0.2, 0, tilt, 0, 0, w]).value, 0);
  assert.equal(readDie([0, HALF + DIE, 0, 0, 0, 0, 1]).value, 0, 'de plano, pero arriba de otro dado');
  assert.equal(readDie([0, HALF, 0, 0, Math.sin(0.4), 0, Math.cos(0.4)]).value, 1, 'girado sobre el paño vale igual');
});

test('generala: el gesto se limpia: enteros, adentro de la zona de la mano y con dirección', () => {
  assert.deepEqual(cleanThrow({ s: -1, x: 99999, z: -99999, a: 0, b: 0, p: 500 }), { s: 4294967295, x: HAND.x1 * 10, z: HAND.z0 * 10, a: 0, b: -1000, p: 100 });
  assert.equal(cleanThrow(null), null);
  assert.deepEqual(cleanThrow({ s: 1.9, x: 10.4, z: 20.6, a: 3.2, b: -7.7, p: 33.3 }), { s: 1, x: 10, z: 21, a: 3, b: -8, p: 33 });
});

test('generala: la misma tirada da exactamente la misma trayectoria (así todas las pantallas ven lo mismo)', () => {
  const a = simulate(RAPIER, GESTURE, [0, 1, 2, 3, 4]);
  const b = simulate(RAPIER, { ...GESTURE }, [0, 1, 2, 3, 4]);
  assert.deepEqual(a.poses, b.poses);
  assert.deepEqual(a.values, b.values);
  assert.equal(a.count, b.count);
  assert.deepEqual(Array.from(a.frames), Array.from(b.frames));
  assert.deepEqual(a.events, b.events);
  const c = simulate(RAPIER, { ...GESTURE, s: 8 }, [0, 1, 2, 3, 4]);
  assert.notDeepEqual(a.poses, c.poses, 'otra semilla, otra tirada');
});

test('generala: los dados salen del cubilete de a uno, sin encimarse, y desde adentro de la bandeja', () => {
  const rnd = mulberry32(99);
  for (let n = 0; n < 200; n++) {
    const gesture = { s: Math.floor(rnd() * 2 ** 32), x: (rnd() * 40 - 20) * 10, z: (rnd() * 30 - 10) * 10, a: rnd() * 2000 - 1000, b: rnd() * 2000 - 1000, p: rnd() * 100 };
    const setup = throwSetup(gesture, [0, 1, 2, 3, 4]);
    setup.forEach((d, k) => {
      assert.equal(d.at, k * POUR_GAP);
      assert.ok(Math.abs(d.p[0]) <= TRAY.hx - 1.4 && Math.abs(d.p[2]) <= TRAY.hz - 1.4 && d.p[1] > TRAY.wall + HALF);
      assert.ok(Math.abs(d.q[0] ** 2 + d.q[1] ** 2 + d.q[2] ** 2 + d.q[3] ** 2 - 1) < 1e-9);
    });
  }
});

test('generala: 300 tiradas: todas terminan, ningún dado se va de la bandeja y las seis caras salen parejas', () => {
  const rnd = mulberry32(2024);
  const faces = [0, 0, 0, 0, 0, 0, 0];
  let dice = 0;
  let longest = 0;
  for (let n = 0; n < 300; n++) {
    const thrown = [0, 1, 2, 3, 4].slice(0, n % 2 ? 1 + Math.floor(rnd() * 5) : 5);
    const x = HAND.x0 + rnd() * (HAND.x1 - HAND.x0), z = HAND.z0 + rnd() * (HAND.z1 - HAND.z0);
    const gesture = { s: Math.floor(rnd() * 2 ** 32), x: x * 10, z: z * 10, a: (rnd() * 12 - 6 - x) * 20, b: (-4 + rnd() * 6 - 3 - z) * 20, p: Math.floor(rnd() * 101) };
    const r = simulate(RAPIER, gesture, thrown);
    assert.ok(r.settled, `la tirada ${n} no terminó`);
    assert.equal(r.poses.length, thrown.length);
    assert.equal(r.frames.length, r.count * thrown.length * 7);
    longest = Math.max(longest, r.seconds);
    r.poses.forEach((p, k) => {
      assert.ok(Math.abs(p[0]) <= TRAY.hx - HALF + 0.05 && Math.abs(p[2]) <= TRAY.hz - HALF + 0.05 && p[1] > HALF - 0.05, `dado afuera en la tirada ${n}`);
      assert.equal(readDie(p).value, r.values[k]);
      faces[r.values[k]] += 1;
      dice += 1;
    });
    for (const e of r.events) assert.ok(e[0] >= 0 && e[0] <= r.seconds && e[2] >= 4 && e[5] < thrown.length);
  }
  assert.ok(longest < 4, `la más larga duró ${longest} s`);
  assert.ok(faces[0] / dice < 0.04, `demasiados dados montados: ${faces[0]} de ${dice}`);
  const expected = (dice - faces[0]) / 6;
  for (let f = 1; f <= 6; f++) assert.ok(Math.abs(faces[f] - expected) < expected * 0.25, `la cara ${f} salió ${faces[f]} veces de ${dice}`);
});

test('generala: una partida con la física de verdad: lo que da la tirada entra al reducer tal cual', () => {
  let room = started(1);
  const rnd = mulberry32(5);
  let guard = 0;
  while (room.phase === 'playing' && guard++ < 200) {
    const thrown = diceToThrow(room);
    const gesture = { s: Math.floor(rnd() * 2 ** 32), x: 0, z: 50, a: 100, b: -900, p: 55 };
    const r = simulate(RAPIER, gesture, thrown);
    room = act(room, 'a', { type: 'roll', seen: room.turn.rollN, throw: gesture, values: r.values, poses: r.poses });
    assert.ok(room);
    if (room.turn.cocked) continue;
    assert.ok(room.turn.dice.every((d) => d >= 1 && d <= 6));
    const options = preview(room);
    room = score(room, Object.keys(options).sort((x, y) => options[y] - options[x])[0]);
  }
  assert.equal(room.phase, 'ended');
});

test('generala: el estante tiene un lugar para cada dado, fuera del paño', () => {
  const xs = [0, 1, 2, 3, 4].map((i) => shelfSlot(i));
  for (const [x, y, z] of xs) assert.ok(Math.abs(x) < TRAY.hx && y === HALF && z > TRAY.hz + TRAY.thick + HALF);
  for (let i = 1; i < 5; i++) assert.ok(xs[i][0] - xs[i - 1][0] > DIE + 0.3);
});
