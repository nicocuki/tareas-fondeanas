import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BJ_MAX, BJ_MIN, betLimits, freshDeck, handValue, isNatural, payoutFor, quickBet,
} from '../src/timba/bj.js';
import {
  DAY_MS, ELEV_MS, HOME_MS, LIMO_MS, RESULT_MS, START_MONEY, applyAction, findPlayer, fmtMoney, newRoom, nextQuota,
} from '../src/timba/game.js';
import { SCENES, canStand, doorFor, nearby, seatPos, spawnPoint, stepSide, stepTop } from '../src/timba/scenes.js';

const rand = () => 0.3;
let clock = 1000;
const T = () => clock;

// Una sala con `n` jugadores (a, b, c…) y la partida empezada.
function started(n = 2) {
  let room = newRoom('a', 'Ana', '🐸', 0);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: 'abcdefgh'[i], name: `J${i}` }, { now: 0, rand });
  clock = 1000;
  return applyAction(room, { type: 'start', playerId: 'a' }, { now: clock, rand });
}
const act = (room, playerId, action, now = clock) => applyAction(room, { ...action, playerId }, { now, rand });
const ids = (room) => room.players.map((p) => p.id);

// Lleva a todos hasta el piso 1 (limusina → puerta del casino → ascensor → piso).
function atFloor1(n = 2) {
  let room = started(n);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'elevator' });
  room = act(room, 'a', { type: 'floor', to: 1 }, clock);
  clock += ELEV_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'f1' });
  return room;
}
// Pone las cartas a repartir: el último de la lista sale primero (primero el croupier, después cada asiento).
// (Con menos de 60 cartas la sala vuelve a mezclar, así que se rellena el principio del mazo.)
const stack = (room, ...cards) => { room.bj.deck = [...Array(80).fill(2), ...[...cards].reverse()]; return room; };

// ─── Cartas ──────────────────────────────────────────────────────────────────
test('timba: el As vale 11 mientras no se pase, y 21 con dos cartas es blackjack', () => {
  assert.deepEqual(handValue([0, 12]), { total: 21, soft: true });
  assert.equal(handValue([0, 0, 8]).total, 21);   // A A 9
  assert.equal(handValue([0, 5, 9]).total, 17);   // A 6 10: el As pasa a valer 1
  assert.equal(handValue([12, 11, 5]).total, 26);
  assert.ok(isNatural([0, 9]) && !isNatural([6, 6, 6]));
});

test('timba: los pagos: blackjack 3 a 2, gana el que tiene más, empate devuelve y pasarse pierde', () => {
  const dealer19 = [9, 8];
  assert.equal(payoutFor(100, [0, 12], dealer19, false), 250);
  assert.equal(payoutFor(100, [0, 12], [0, 12], false), 100, 'blackjack contra blackjack empata');
  assert.equal(payoutFor(100, [9, 9], dealer19, false), 200);
  assert.equal(payoutFor(100, [9, 8], dealer19, false), 100);
  assert.equal(payoutFor(100, [9, 7], dealer19, false), 0);
  assert.equal(payoutFor(100, [9, 7, 9], dealer19, true), 0);
  assert.equal(payoutFor(100, [9, 7], [9, 5, 9], false), 200, 'el croupier se pasó');
  assert.equal(payoutFor(BJ_MIN, [0, 12], dealer19, false), 90);
});

test('timba: el mazo tiene 4 barajas completas y se mezcla', () => {
  const deck = freshDeck(Math.random);
  assert.equal(deck.length, 208);
  const counts = new Map();
  for (const c of deck) counts.set(c, (counts.get(c) || 0) + 1);
  assert.ok([...counts.values()].every((n) => n === 4) && counts.size === 52);
  assert.notDeepEqual(deck.slice(0, 20), Array.from({ length: 20 }, (_, i) => i));
});

test('timba: apuestas de $36 a $360, sin pasarse de la plata, y los botones rápidos', () => {
  assert.deepEqual(betLimits(1000), { min: BJ_MIN, max: BJ_MAX });
  assert.deepEqual(betLimits(100), { min: BJ_MIN, max: 100 });
  assert.equal(betLimits(35), null);
  assert.deepEqual(['min', 'q', 'h', 'all'].map((k) => quickBet(k, 1000)), [36, 90, 180, 360]);
  assert.deepEqual(['min', 'q', 'h', 'all'].map((k) => quickBet(k, 100)), [36, 90, 100, 100]);
  assert.equal(quickBet('all', 20), 0);
});

test('timba: el dinero se muestra como en el original', () => {
  assert.deepEqual([75, 1000, 1200, 1250, 10000, 360].map(fmtMoney), ['$75', '$1K', '$1.2K', '$1.25K', '$10K', '$360']);
  assert.equal(nextQuota(1200), 1800);
});

// ─── De la casita al piso 1 ──────────────────────────────────────────────────
test('timba: empieza en la sala de espera con $1K y 15 tickets', () => {
  const room = started(3);
  assert.equal(room.phase, 'playing');
  assert.equal(room.money, START_MONEY);
  assert.equal(room.tickets, 15);
  assert.ok(room.players.every((p) => p.loc === 'wait'));
});

test('timba: la limusina sale cuando están todos adentro y llega a la puerta del casino', () => {
  let room = started(3);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  room = act(room, 'b', { type: 'loc', to: 'limo' });
  assert.equal(room.trip, null, 'falta uno');
  assert.equal(act(room, 'a', { type: 'loc', to: 'outside' }), null, 'de la limusina no se pasa a la puerta del casino caminando');
  room = act(room, 'c', { type: 'loc', to: 'limo' });
  assert.equal(room.trip.kind, 'limo');
  assert.equal(act(room, 'a', { type: 'loc', to: 'wait' }), null, 'no se baja mientras anda');
  assert.equal(act(room, 'a', { type: 'tick' }, 1000 + LIMO_MS - 1), null, 'todavía no llegó');
  const arrived = act(room, 'a', { type: 'tick' }, 1000 + LIMO_MS);
  assert.ok(arrived.players.every((p) => p.loc === 'outside'));
  assert.equal(arrived.day.endsAt, 1000 + LIMO_MS + DAY_MS, 'el día arranca al llegar');
  assert.equal(arrived.trip, null);
});

test('timba: se puede bajar de la limusina antes de que salgan', () => {
  let room = started(2);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  room = act(room, 'a', { type: 'loc', to: 'wait' });
  assert.equal(findPlayer(room, 'a').loc, 'wait');
});

test('timba: el ascensor solo viaja con todos a bordo', () => {
  let room = started(2);
  for (const id of ['a', 'b']) room = act(room, id, { type: 'loc', to: 'limo' });
  room = act(room, 'a', { type: 'tick' }, 1000 + LIMO_MS);
  assert.equal(act(room, 'a', { type: 'loc', to: 'f1' }), null, 'de la puerta se entra al ascensor, no al piso');
  room = act(room, 'a', { type: 'loc', to: 'elevator' });
  assert.equal(act(room, 'a', { type: 'floor', to: 1 }, 5000), null, 'falta b');
  room = act(room, 'b', { type: 'loc', to: 'elevator' });
  assert.equal(act(room, 'a', { type: 'floor', to: 0 }, 5000), null, 'ya está en el lobby');
  assert.equal(act(room, 'a', { type: 'floor', to: 2 }, 5000), null, 'todavía no hay piso 2');
  room = act(room, 'b', { type: 'floor', to: 1 }, 5000);
  assert.equal(room.trip.kind, 'elev');
  assert.equal(act(room, 'a', { type: 'loc', to: 'outside' }, 5001), null, 'no se sale con el ascensor andando');
  assert.equal(act(room, 'a', { type: 'tick' }, 5000 + ELEV_MS - 1), null);
  room = act(room, 'a', { type: 'tick' }, 5000 + ELEV_MS);
  assert.equal(room.elev.floor, 1);
  assert.equal(act(room, 'a', { type: 'loc', to: 'outside' }, 9000), null, 'las puertas dan al piso 1');
  room = act(room, 'a', { type: 'loc', to: 'f1' }, 9000);
  assert.equal(findPlayer(room, 'a').loc, 'f1');
  room = act(room, 'a', { type: 'loc', to: 'elevator' }, 9000);
  assert.equal(findPlayer(room, 'a').loc, 'elevator');
});

test('timba: si el que falta se va, los que quedan arriba de la limusina salen igual', () => {
  let room = started(3);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  room = act(room, 'b', { type: 'loc', to: 'limo' });
  room = act(room, 'a', { type: 'gone', target: 'c' });
  assert.equal(room.trip?.kind, 'limo');
  assert.equal(act(room, 'b', { type: 'gone', target: 'a' }), null, 'solo el anfitrión saca gente');
});

// ─── Blackjack ───────────────────────────────────────────────────────────────
test('timba: una mano ganada paga a la caja de todos y queda anotada', () => {
  let room = atFloor1(1);
  room = act(room, 'a', { type: 'bjSit' });
  stack(room, 9, 8, 9, 9); // croupier 10+9 = 19; Ana 10+10 = 20
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(room.bj.phase, 'play');
  assert.equal(room.money, 900, 'la apuesta sale de la caja');
  room = act(room, 'a', { type: 'bjStand' });
  assert.equal(room.bj.phase, 'result');
  assert.equal(room.money, 1100);
  assert.equal(room.net.a, 100);
  assert.equal(room.bj.seats[0].res, 'win');
});

test('timba: blackjack natural paga 3 a 2, pasarse pierde, doblar duplica', () => {
  let room = atFloor1(1);
  room = act(room, 'a', { type: 'bjSit' });
  stack(room, 9, 8, 0, 12);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(room.bj.phase, 'result', 'con blackjack no hay nada que decidir');
  assert.equal(room.money, 1150);
  assert.equal(room.bj.seats[0].res, 'bj');

  // Pasarse
  clock += RESULT_MS + 1;
  stack(room, 9, 8, 9, 6, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 50 }, clock);
  assert.equal(room.bj.phase, 'play');
  room = act(room, 'a', { type: 'bjHit' }, clock);
  assert.equal(room.bj.seats[0].st, 'bust');
  assert.equal(room.bj.phase, 'result');
  assert.equal(room.money, 1100);
  assert.equal(room.bj.dealer.length, 2, 'si se pasaron todos, el croupier no pide');

  // Doblar con 11
  clock += RESULT_MS + 1;
  stack(room, 9, 8, 4, 5, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 }, clock);
  assert.equal(act(room, 'a', { type: 'bjDouble' }, clock).bj.seats[0].bet, 200);
  room = act(room, 'a', { type: 'bjDouble' }, clock);
  assert.equal(room.bj.phase, 'result');
  assert.equal(room.bj.seats[0].res, 'win');
  assert.equal(room.money, 1100 + 200);
});

test('timba: la apuesta respeta el mínimo, el máximo y la plata que hay', () => {
  let room = atFloor1(1);
  room = act(room, 'a', { type: 'bjSit' });
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 35 }), null);
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 361 }), null);
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 36.5 }), null);
  room.money = 80;
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 100 }), null, 'no alcanza la plata');
  assert.ok(act(room, 'a', { type: 'bjBet', amount: 80 }));
});

test('timba: la mesa es de uno solo: si alguien juega, está ocupada para los demás', () => {
  let room = atFloor1(2);
  room = act(room, 'a', { type: 'bjSit' });
  assert.equal(act(room, 'b', { type: 'bjSit' }), null, 'la mesa está ocupada');
  assert.equal(act(room, 'b', { type: 'bjBet', amount: 50 }), null, 'sin silla no se apuesta');
  stack(room, 9, 8, 9, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(room.bj.phase, 'play');
  assert.equal(act(room, 'a', { type: 'bjLeave' }), null, 'en medio de una mano no se puede levantar');
  room = act(room, 'a', { type: 'bjStand' });
  assert.equal(room.bj.phase, 'result');
  assert.equal(room.money, 1100);
  // los resultados se ven un rato antes de poder apostar de nuevo
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 40 }, room.bj.resultAt + RESULT_MS - 1), null);
  const again = act(room, 'a', { type: 'bjBet', amount: 40 }, room.bj.resultAt + RESULT_MS);
  assert.equal(again.bj.phase, 'play', 'con uno solo la mano arranca apenas apuesta');
  assert.equal(act(again, 'b', { type: 'bjSit' }), null, 'sigue ocupada mientras Ana no se levante');
  // al levantarse, la mesa queda libre para el otro
  room = act(room, 'a', { type: 'bjLeave' });
  assert.equal(room.bj.seats.length, 0);
  assert.ok(act(room, 'b', { type: 'bjSit' }));
});

test('timba: levantarse sin apostar deja la mesa libre', () => {
  let room = atFloor1(2);
  room = act(room, 'a', { type: 'bjSit' });
  room = act(room, 'a', { type: 'bjLeave' });
  assert.equal(room.money, 1000);
  assert.equal(room.bj.seats.length, 0);
  assert.equal(act(started(1), 'a', { type: 'bjSit' }), null, 'solo en el piso 1');
});

test('timba: el que se va en medio de una mano se planta y la mano se paga igual', () => {
  let room = atFloor1(2);
  room = act(room, 'a', { type: 'bjSit' });
  stack(room, 9, 8, 9, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  room = act(room, 'a', { type: 'leave' });
  assert.equal(room.bj.phase, 'result');
  assert.ok(room.bj.seats.every((s) => s.id !== 'a'), 'el que se fue ya no tiene silla');
  assert.equal(room.money, 1100, 'la mano de Ana se pagó igual');
  assert.equal(room.net.a, 100);
});

// ─── El día ──────────────────────────────────────────────────────────────────
test('timba: se acaba el día: todos al ascensor, se cierra la mesa y solo se baja al lobby', () => {
  let room = atFloor1(2);
  room = act(room, 'a', { type: 'bjSit' });
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  const endsAt = room.day.endsAt;
  assert.equal(act(room, 'a', { type: 'tick' }, endsAt - 1), null);
  room = act(room, 'a', { type: 'tick' }, endsAt);
  assert.ok(room.day.over);
  assert.ok(room.players.every((p) => p.loc === 'elevator'));
  assert.equal(room.money, 1000, 'la apuesta que no se repartió vuelve a la caja');
  assert.equal(room.bj.seats.length, 0);
  assert.equal(act(room, 'a', { type: 'loc', to: 'f1' }, endsAt + 1), null, 'el ascensor está cerrado');
  assert.equal(act(room, 'a', { type: 'bjSit' }, endsAt + 1), null);
  assert.equal(act(room, 'a', { type: 'floor', to: 1 }, endsAt + 1), null, 'solo el lobby');
  room = act(room, 'a', { type: 'floor', to: 0 }, endsAt + 1);
  assert.equal(room.trip.kind, 'home');
});

test('timba: si juntaron la cuota sigue otro día con una cuota más alta', () => {
  let room = atFloor1(2);
  room.money = 1500;
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  room = act(room, 'a', { type: 'floor', to: 0 }, room.day.endsAt + 1);
  room = act(room, 'b', { type: 'tick' }, room.trip.at + HOME_MS);
  assert.equal(room.phase, 'playing');
  assert.equal(room.day.n, 2);
  assert.equal(room.day.quota, 1800);
  assert.equal(room.day.endsAt, 0);
  assert.equal(room.day.over, false);
  assert.ok(room.players.every((p) => p.loc === 'wait'));
  assert.equal(room.money, 1500, 'la plata sigue siendo de todos');
});

test('timba: si no la juntaron se termina la partida y el anfitrión puede empezar otra', () => {
  let room = atFloor1(2);
  room.money = 900;
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  room = act(room, 'a', { type: 'floor', to: 0 }, room.day.endsAt + 1);
  room = act(room, 'b', { type: 'tick' }, room.trip.at + HOME_MS);
  assert.equal(room.phase, 'ended');
  assert.equal(room.day.last.lost, true);
  assert.equal(act(room, 'b', { type: 'start' }), null, 'solo el anfitrión');
  const again = act(room, 'a', { type: 'start' });
  assert.equal(again.phase, 'playing');
  assert.equal(again.money, START_MONEY);
  assert.equal(again.day.n, 1);
  assert.ok(again.run > room.run);
  assert.equal(act(room, 'a', { type: 'toLobby' }).phase, 'lobby');
});

test('timba: nadie entra con la partida empezada, y la plata nunca queda negativa ni con decimales', () => {
  let room = atFloor1(3);
  assert.equal(act(room, 'zz', { type: 'join', name: 'Tarde' }), null);
  for (const id of ids(room)) room = act(room, id, { type: 'bjSit' }) || room; // solo se sienta uno
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) {
    const id = ids(room)[Math.floor(rnd() * 3)];
    const kind = ['bjBet', 'bjHit', 'bjStand', 'bjDouble', 'bjLeave', 'bjSit'][Math.floor(rnd() * 6)];
    clock += 800;
    const next = applyAction(room, { type: kind, playerId: id, amount: 36 + Math.floor(rnd() * 325) }, { now: clock, rand: rnd });
    if (next) room = next;
    assert.ok(room.money >= 0 && Number.isInteger(room.money), `plata ${room.money} en el paso ${i}`);
  }
});

// ─── Los lugares ─────────────────────────────────────────────────────────────
test('timba: las escenas de costado van de izquierda a derecha y paran en los bordes', () => {
  const p = { x: 300, y: 0, face: 1 };
  stepSide(p, 1, 1, 'wait');
  assert.ok(p.x > 300 && p.moving);
  stepSide(p, -1, 100, 'wait');
  assert.equal(p.x, SCENES.wait.min);
  stepSide(p, 1, 1000, 'outside');
  assert.equal(p.x, SCENES.outside.max);
});

test('timba: desde arriba se choca con las paredes y con la mesa, y el ascensor tiene su puerta', () => {
  for (const scene of ['elevator', 'f1']) {
    const sp = spawnPoint(scene, 0);
    assert.ok(canStand(scene, sp.x, sp.y), `${scene}: el lugar de aparición tiene que ser libre`);
  }
  assert.ok(!canStand('f1', 800, 495), 'adentro de la mesa no se puede');
  assert.ok(!canStand('f1', 10, 10));
  const p = { x: 120, y: 500 };
  for (let i = 0; i < 300; i++) stepTop(p, -1, 0, 0.016, 'f1');
  assert.ok(p.x < 52 && p.x > 20, 'se puede llegar a la puerta del ascensor');
  assert.equal(doorFor('f1', p, 1), 'elevator');
  const q = { x: 150, y: 150 };
  for (let i = 0; i < 400; i++) stepTop(q, 0, 1, 0.016, 'elevator');
  assert.equal(doorFor('elevator', q, 1), 'f1');
  assert.equal(doorFor('elevator', q, 0), 'outside');
  assert.equal(doorFor('outside', { x: SCENES.outside.doorX + 1 }, 0), 'elevator');
});

test('timba: todo lo que se toca está donde corresponde y las sillas de la mesa no se pisan entre sí', () => {
  assert.equal(nearby('wait', { x: SCENES.wait.van.x + 150, y: 300 })?.key, 'van');
  assert.equal(nearby('wait', { x: SCENES.wait.limo.x + 20, y: 300 })?.key, 'board');
  assert.equal(nearby('wait', { x: 300, y: 300 }), null);
  assert.equal(nearby('limo', { x: 0, y: 0 })?.key, 'unboard');
  assert.equal(nearby('elevator', { x: SCENES.elevator.panel.x - 10, y: SCENES.elevator.panel.y + 20 })?.key, 'panel');
  assert.equal(nearby('elevator', { x: 70, y: 85 })?.key, 'npc');
  assert.equal(nearby('f1', { x: 800, y: 600 })?.key, 'bj');
  assert.equal(nearby('f1', { x: 200, y: 800 }), null);
  const seat = seatPos();
  assert.ok(canStand('f1', seat.x, seat.y), 'la silla está en el piso, libre');
  const t = SCENES.f1.table;
  assert.ok(t.rx <= 120 && t.ry <= 70, 'la mesa es chica');
});
