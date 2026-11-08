import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, FLOOR, HARD, SOFT, PRESSED, ITEM_LIST, boardFor, idx, isPillar, itemAt, makeBoard, pressOrder, spawnCells } from '../src/bomber/map.js';
import { BASE, COUNTDOWN_MS, FUSE, HALF, HURRY_S, KICK_SPEED, MAX_FIRE, STEP, blastArms, blastCells, canPlace, cellOf, effective, kickBomb, newBomb, newPlayer, pressedCount, slideBomb, statsFor, stepPlayer, packCells, unpackCells } from '../src/bomber/sim.js';
import { GRACE_MS, MAX_PLAYERS, ROUND_END_MS, applyAction, findPlayer, newRoom, ranking, startProblem } from '../src/bomber/game.js';
import { serializeRoom } from '../src/codigo-secreto/game.js';

const rand = () => 0.3;
function room(n) {
  let r = newRoom('h', 'Host', '🐸', 0);
  for (let i = 1; i < n; i++) r = applyAction(r, { type: 'join', playerId: `p${i}`, name: `P${i}`, avatar: '🦊' }, { now: 0, rand });
  return r;
}
const started = (n, now = 0) => applyAction(room(n), { type: 'start', playerId: 'h' }, { now, rand });
const go = (r) => r.match.startsAt + 1; // ya arrancó la ronda
const act = (r, a, now) => applyAction(r, { ...a, match: r.match.n, round: r.match.round }, { now, rand });

test('bombardero: la misma semilla arma el mismo tablero, con borde, pilares y ladrillos', () => {
  for (const count of [2, 4, 5, 8]) {
    const a = makeBoard(77, count), b = makeBoard(77, count), c = makeBoard(78, count);
    assert.deepEqual([a.W, a.H], count <= 4 ? [15, 13] : [19, 15]);
    assert.deepEqual(a.cells, b.cells);
    assert.notDeepEqual(a.cells, c.cells);
    let soft = 0, floor = 0;
    for (let y = 0; y < a.H; y++) {
      for (let x = 0; x < a.W; x++) {
        const v = a.cells[idx(a.W, x, y)];
        const edge = x === 0 || y === 0 || x === a.W - 1 || y === a.H - 1;
        if (edge || isPillar(x, y)) assert.equal(v, HARD, `piedra en ${x},${y}`);
        else { assert.notEqual(v, HARD); if (v === SOFT) soft++; else floor++; }
      }
    }
    assert.ok(soft > floor, 'la mayoría del piso lleva ladrillo');
    // Cada uno aparece en piso libre, con lugar para moverse y poner una bomba sin volarse.
    for (const s of a.spawns) {
      assert.equal(a.cells[idx(a.W, s.x, s.y)], FLOOR);
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => a.cells[idx(a.W, s.x + dx, s.y + dy)] === FLOOR && a.cells[idx(a.W, s.x + dx * 2, s.y + dy * 2)] === FLOOR);
      assert.ok(free.length >= 2, `el lugar ${s.x},${s.y} está encerrado`);
    }
    assert.equal(a.spawns.length, boardFor(count).max);
  }
  assert.equal(spawnCells(BOARDS.big).length, 8);
});

test('bombardero: los ítems salen de la semilla y sin calaveras no hay calaveras', () => {
  const b = makeBoard(5, 4);
  const kinds = new Set();
  let n = 0;
  for (let i = 0; i < b.W * b.H; i++) {
    const k = itemAt(5, i);
    assert.equal(k, itemAt(5, i));
    if (k) { n++; kinds.add(k); assert.ok(ITEM_LIST.includes(k)); }
    assert.notEqual(itemAt(5, i, false), 'skull');
  }
  assert.ok(n > 30 && n < 120, `${n} ítems`);
  assert.ok(kinds.has('fire') && kinds.has('bomb'));
});

test('bombardero: los bloques del final caen en espiral y tapan cada casilla una sola vez', () => {
  for (const { W, H } of Object.values(BOARDS)) {
    const order = pressOrder(W, H);
    const expected = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!isPillar(x, y)) expected.push(idx(W, x, y));
    assert.equal(order.length, expected.length);
    assert.deepEqual([...order].sort((a, b) => a - b), expected.sort((a, b) => a - b));
    assert.equal(order[0], idx(W, 1, 1));
    assert.equal(order[1], idx(W, 2, 1), 'sigue por la fila de arriba');
    assert.equal(pressedCount(0, 120, order), 0);
    assert.equal(pressedCount(120 - HURRY_S / 2, 120, order), Math.floor(order.length / 2));
    assert.equal(pressedCount(120, 120, order), order.length);
  }
});

// Un tablero vacío (solo piedra) para probar el movimiento y el fuego con casillas elegidas a mano.
function emptyBoard() {
  const b = makeBoard(1, 2);
  for (let i = 0; i < b.cells.length; i++) if (b.cells[i] === SOFT) b.cells[i] = FLOOR;
  return b;
}

test('bombardero: el fuego frena en la piedra, rompe el primer ladrillo, atraviesa con la perforante y encadena bombas', () => {
  const b = emptyBoard();
  const W = b.W;
  const bombs = new Map();
  const c = idx(W, 1, 1);
  let r = blastArms(b, bombs, c, 3, false);
  assert.deepEqual(r.arms, [0, 3, 3, 0], 'arriba e izquierda hay borde; derecha y abajo, pasillo');
  b.cells[idx(W, 3, 1)] = SOFT;
  r = blastArms(b, bombs, c, 3, false);
  assert.deepEqual(r.arms, [0, 2, 3, 0], 'llega hasta el ladrillo y lo rompe');
  assert.deepEqual(r.broke, [idx(W, 3, 1)]);
  b.cells[idx(W, 2, 1)] = SOFT;
  r = blastArms(b, bombs, c, 3, false);
  assert.equal(r.arms[1], 1, 'frena en el primer ladrillo');
  assert.deepEqual(r.broke, [idx(W, 2, 1)]);
  r = blastArms(b, bombs, c, 3, true);
  assert.equal(r.arms[1], 3, 'la perforante sigue');
  assert.deepEqual(r.broke, [idx(W, 2, 1), idx(W, 3, 1)]);
  assert.deepEqual(blastCells(W, c, [0, 2, 1, 0]), [c, c + 1, c + 2, c + W]);
  // Una bomba en el camino frena el fuego y explota en cadena; un ítem a la vista también lo frena.
  bombs.set(idx(W, 1, 3), { c: idx(W, 1, 3) });
  r = blastArms(b, bombs, c, 5, false);
  assert.equal(r.arms[2], 2);
  assert.deepEqual(r.bombs, [idx(W, 1, 3)]);
  r = blastArms(b, bombs, c, 5, false, (i) => i === idx(W, 1, 2));
  assert.equal(r.arms[2], 1);
  b.cells[idx(W, 1, 2)] = PRESSED;
  assert.equal(blastArms(b, bombs, c, 5, false).arms[2], 0, 'un bloque caído es piedra');
});

test('bombardero: el jugador camina por el pasillo, frena en los ladrillos, dobla con ayuda y sale de su bomba', () => {
  const b = emptyBoard();
  const W = b.W;
  const bombs = new Map();
  const p = newPlayer(1, 1);
  for (let i = 0; i < 60; i++) stepPlayer(p, 1, 0, STEP, b, bombs, 4);
  assert.ok(Math.abs(p.x - 5.5) < 0.01, `avanzó cuatro casillas: ${p.x}`);
  assert.equal(p.y, 1.5);
  assert.equal(p.dir, 1);
  // Un ladrillo adelante: se queda pegado.
  b.cells[idx(W, 6, 1)] = SOFT;
  for (let i = 0; i < 60; i++) stepPlayer(p, 1, 0, STEP, b, bombs, 4);
  assert.ok(Math.abs(p.x - (6 - HALF)) < 0.01, `pegado al ladrillo: ${p.x}`);
  // Quiere bajar en la columna 5 pero está un poco corrido: lo ayuda a doblar.
  p.x = 5.5 - 0.3;
  for (let i = 0; i < 40; i++) stepPlayer(p, 0, 1, STEP, b, bombs, 4);
  assert.ok(Math.abs(p.x - 5.5) < 0.01 && p.y > 2, `dobló: ${p.x}, ${p.y}`);
  // Contra una pared de frente no pasa nada raro: se queda.
  const q = newPlayer(1, 1);
  q.y = 1.8;
  for (let i = 0; i < 60; i++) stepPlayer(q, -1, 0, STEP, b, bombs, 4); // a la izquierda hay borde
  assert.ok(Math.abs(q.x - (1 + HALF)) < 0.01, `pegado al borde: ${q.x}`);
  assert.ok(Math.abs(q.y - 1.5) < 0.01, 'y acomodado al centro del pasillo');
  // Una bomba debajo no frena hasta que sale de la casilla; después sí.
  const r = newPlayer(1, 1);
  const bc = cellOf(W, r);
  bombs.set(bc, { c: bc });
  r.onBomb = bc;
  for (let i = 0; i < 30; i++) stepPlayer(r, 0, 1, STEP, b, bombs, 4);
  assert.ok(r.y > 2.2 && r.onBomb === null, `salió de la bomba: ${r.y}`);
  for (let i = 0; i < 60; i++) stepPlayer(r, 0, -1, STEP, b, bombs, 4);
  assert.ok(Math.abs(r.y - (2 + HALF)) < 0.01, `ahora la bomba lo frena: ${r.y}`);
  // Empujar una bomba de frente avisa la dirección (para la patada).
  assert.equal(stepPlayer(r, 0, -1, STEP, b, bombs, 4), 0);
  const eff = effective(statsFor(1, {}, 'a'), r, 0);
  assert.equal(canPlace(b, bombs, r, eff, 0), true);
  assert.equal(canPlace(b, bombs, r, eff, 1), false, 'ya tiene una bomba puesta');
});

test('bombardero: una bomba pateada se desliza hasta la casilla antes de lo que la frena', () => {
  const b = emptyBoard();
  const W = b.W;
  const bombs = new Map();
  const bomb = newBomb('k', idx(W, 1, 1), 'a', 0, { fuse: FUSE, fire: 2, pierce: false, remote: false });
  bombs.set(bomb.c, bomb);
  assert.equal(kickBomb(b, bombs, bomb, 0), false, 'arriba hay borde');
  assert.equal(kickBomb(b, bombs, bomb, 1), true);
  b.cells[idx(W, 5, 1)] = SOFT;
  let moves = 0;
  for (let i = 0; i < 600 && bomb.slide; i++) if (slideBomb(b, bombs, bomb, STEP)) moves++;
  assert.equal(bomb.slide, null);
  assert.equal(bomb.c, idx(W, 4, 1), 'frena antes del ladrillo');
  assert.equal(moves, 3);
  assert.ok(bombs.get(idx(W, 4, 1)) === bomb && !bombs.has(idx(W, 1, 1)));
  assert.ok(KICK_SPEED > 5);
});

test('bombardero: lo que tiene cada uno sale de lo agarrado y la enfermedad lo cambia un rato', () => {
  const seed = 5, b = makeBoard(seed, 4);
  const cells = { fire: [], bomb: [], speed: [], kick: [], fullfire: [] };
  for (let i = 0; i < b.W * b.H; i++) { const k = itemAt(seed, i); if (cells[k]) cells[k].push(i); }
  const took = {};
  for (const k of ['fire', 'bomb', 'speed', 'kick']) took[cells[k][0]] = 'a';
  took[cells.fire[1]] = 'b';
  const a = statsFor(seed, took, 'a');
  assert.deepEqual([a.fire, a.bombs, a.speed, a.kick], [BASE.fire + 1, BASE.bombs + 1, 1, true]);
  assert.equal(statsFor(seed, took, 'b').fire, BASE.fire + 1);
  assert.equal(statsFor(seed, took, 'c').fire, BASE.fire);
  if (cells.fullfire.length) { took[cells.fullfire[0]] = 'a'; assert.equal(statsFor(seed, took, 'a').fire, MAX_FIRE); }
  const p = newPlayer(1, 1);
  p.skull = 'nobomb'; p.skullUntil = 10;
  assert.equal(effective(a, p, 5).bombs, 0);
  assert.equal(effective(a, p, 11).bombs, a.bombs, 'se curó');
  p.skull = 'tinyfire';
  assert.equal(effective(a, p, 5).fire, 1);
});

test('bombardero: ronda, respiro para el empate, rondas ganadas y final', () => {
  let r = started(3);
  assert.equal(r.phase, 'playing');
  assert.equal(r.match.round, 1);
  assert.equal(r.match.startsAt, COUNTDOWN_MS);
  assert.deepEqual([...r.match.order].sort(), ['h', 'p1', 'p2']);
  assert.equal(act(r, { type: 'died', playerId: 'p1', by: 'h' }, 10), null, 'antes de arrancar no se muere');
  let t = go(r);
  assert.equal(act(r, { type: 'tick', playerId: 'h' }, t), null, 'nada que cerrar');
  r = act(r, { type: 'died', playerId: 'p1', by: 'h' }, t);
  assert.equal(findPlayer(r, 'h').kills, 1);
  assert.equal(r.match.endsAt, 0, 'quedan dos');
  r = act(r, { type: 'died', playerId: 'p2', by: 'p2' }, t);
  assert.equal(r.match.deaths[1].w, 'self');
  assert.equal(r.match.endsAt, t + GRACE_MS);
  assert.equal(act(r, { type: 'tick', playerId: 'h' }, t + 10), null, 'todavía no: respiro');
  // En el respiro cae el último también: empate.
  const draw = act(act(r, { type: 'died', playerId: 'h', by: 'p2' }, t + 100), { type: 'tick', playerId: 'p1' }, t + GRACE_MS);
  assert.equal(draw.phase, 'roundEnd');
  assert.equal(draw.match.winner, null);
  assert.ok(draw.players.every((p) => p.wins === 0));
  // Sin empate: gana el que quedó.
  r = act(r, { type: 'tick', playerId: 'p1' }, t + GRACE_MS);
  assert.equal(r.phase, 'roundEnd');
  assert.equal(r.match.winner, 'h');
  assert.equal(findPlayer(r, 'h').wins, 1);
  assert.equal(act(r, { type: 'died', playerId: 'h' }, t + GRACE_MS), null);
  assert.equal(act(r, { type: 'tick', playerId: 'h' }, t + GRACE_MS + 10), null, 'se muestra quién ganó');
  // Entra uno nuevo mientras tanto: juega la ronda que viene.
  r = applyAction(r, { type: 'join', playerId: 'p3', name: 'P3' }, { now: t, rand });
  assert.equal(findPlayer(r, 'p3').inGame, false);
  const t2 = r.match.endsAt + ROUND_END_MS;
  r = act(r, { type: 'tick', playerId: 'h' }, t2);
  assert.equal(r.phase, 'playing');
  assert.equal(r.match.round, 2);
  assert.equal(r.match.size, 4);
  assert.equal(findPlayer(r, 'p3').inGame, true);
  assert.deepEqual(r.match.took, {});
  // Gana dos rondas más: campeón.
  r = { ...r, options: { ...r.options, wins: 2 } };
  t = go(r);
  for (const id of ['p1', 'p2', 'p3']) r = act(r, { type: 'died', playerId: id, by: 'h' }, t);
  r = act(r, { type: 'tick', playerId: 'h' }, t + GRACE_MS);
  assert.equal(findPlayer(r, 'h').wins, 2);
  r = act(r, { type: 'tick', playerId: 'h' }, r.match.endsAt + ROUND_END_MS);
  assert.equal(r.phase, 'final');
  assert.equal(r.match.champion, 'h');
  assert.equal(ranking(r)[0].id, 'h');
  r = applyAction(r, { type: 'toLobby', playerId: 'h' }, { now: t });
  assert.equal(r.phase, 'lobby');
});

test('bombardero: se acaba el tiempo y la ronda queda empatada; si se van todos menos uno, termina', () => {
  let r = started(2);
  const end = r.match.startsAt + r.options.minutes * 60000;
  assert.equal(act(r, { type: 'tick', playerId: 'h' }, end - 1), null);
  const d = act(r, { type: 'tick', playerId: 'h' }, end);
  assert.equal(d.phase, 'roundEnd');
  assert.equal(d.match.winner, null);
  // El otro se va: el que queda gana la ronda y, como no hay con quién seguir, la partida termina.
  r = applyAction(r, { type: 'leave', playerId: 'p1' }, { now: go(r) });
  assert.equal(r.match.endsAt > 0, true);
  r = act(r, { type: 'tick', playerId: 'h' }, r.match.endsAt);
  assert.equal(r.match.winner, 'h');
  r = act(r, { type: 'tick', playerId: 'h' }, r.match.endsAt + ROUND_END_MS);
  assert.equal(r.phase, 'final');
});

test('bombardero: un ítem se lo lleva uno solo y tiene que existir', () => {
  const r = started(2);
  const t = go(r);
  const { W, H } = boardFor(2);
  let c = -1;
  for (let i = 0; i < W * H && c < 0; i++) if (itemAt(r.match.seed, i, true)) c = i;
  const a = act(r, { type: 'take', playerId: 'h', c }, t);
  assert.equal(a.match.took[c], 'h');
  assert.equal(act(a, { type: 'take', playerId: 'p1', c }, t), null, 'ya lo agarró otro');
  let none = -1;
  for (let i = 0; i < W * H && none < 0; i++) if (!itemAt(r.match.seed, i, true)) none = i;
  assert.equal(act(r, { type: 'take', playerId: 'h', c: none }, t), null, 'ahí no hay ítem');
  for (const bad of [-1, W * H, 1.5, '3']) assert.equal(act(r, { type: 'take', playerId: 'h', c: bad }, t), null);
  assert.equal(applyAction(r, { type: 'take', playerId: 'h', c, match: r.match.n, round: 9 }, { now: t }), null, 'de otra ronda no');
});

test('bombardero: las opciones, quién arranca y los topes', () => {
  let r = room(1);
  assert.ok(startProblem(r));
  r = applyAction(r, { type: 'setOptions', playerId: 'h', options: { wins: 5, minutes: 3, skulls: false } }, { now: 0 });
  assert.deepEqual(r.options, { wins: 5, minutes: 3, skulls: false });
  assert.equal(applyAction(r, { type: 'setOptions', playerId: 'h', options: { wins: 9 } }, { now: 0 }), null);
  assert.equal(applyAction(room(2), { type: 'start', playerId: 'p1' }, { now: 0 }), null, 'solo el anfitrión');
  const full = room(MAX_PLAYERS);
  assert.equal(applyAction(full, { type: 'join', playerId: 'x', name: 'X' }, { now: 0 }), null, 'llena');
  assert.equal(new Set(full.players.map((p) => p.color)).size, MAX_PLAYERS, 'cada uno con su color');
  const s = applyAction(full, { type: 'start', playerId: 'h' }, { now: 0, rand });
  assert.equal(s.match.skulls, false || true);
  assert.equal(boardFor(s.match.size).W, 19);
});

test('bombardero: la sala entera, en el peor caso, queda lejos del tope de 30.000 caracteres', () => {
  let r = started(MAX_PLAYERS);
  r.players.forEach((p) => { p.name = 'Nombre de dieciséis'; p.avatar = '🦄'; });
  const { W, H } = boardFor(MAX_PLAYERS);
  const t = go(r);
  for (let i = 0; i < W * H; i++) if (itemAt(r.match.seed, i, true)) r.match.took[i] = 'xxxxxxxx';
  for (const p of r.players.slice(1)) r = act(r, { type: 'died', playerId: p.id, by: 'h' }, t) || r;
  const size = serializeRoom(r).length;
  assert.ok(size < 8000, `la sala pesa ${size}`);
});

test('bombardero: las casillas rotas viajan como tira de bits y vuelven iguales', () => {
  const cells = new Set([0, 7, 8, 100, 284]);
  const packed = packCells(cells, 285);
  assert.ok(packed.length < 60);
  assert.deepEqual(unpackCells(packed), [0, 7, 8, 100, 284]);
  assert.deepEqual(unpackCells('no es base64 ***'), []);
});
