import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDeck, handValue, isNatural, payoutFor } from '../src/timba/bj.js';
import {
  DUCKS, LIMITS, NAMES, ROULETTE_WHEEL, WHEEL, betLimits, crapsStep, isSpot, quickBet, raceDucks, roulettePays, slotsEval, spinWheel, validDice,
} from '../src/timba/games.js';
import {
  DAY_MS, ELEV_MS, HOME_MS, LIMO_MS, RESULT_MS, ROULETTE_MS, START_MONEY, WHEEL_SPIN_MS, applyAction, findPlayer, fmtMoney, newRoom,
} from '../src/timba/game.js';
import { QUOTA_MULTIPLIERS, TOTAL_DAYS, quotaFor } from '../src/timba/quota.js';
import { CASINOS, FLOOR_COUNT, casinoOfDay, casinoOfFloor, floorOfLoc, floorsOfDay, locOfFloor } from '../src/timba/casinos.js';
import {
  DECOR, FLOOR_OF_TABLE, MAX_BIG_PER_ROW, SCENES, TABLES, canStand, doorFor, floorTables, nearby, spawnPoint, standAt, stepSide, stepTop,
} from '../src/timba/scenes.js';

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
// Sienta a un jugador en una mesa.
const sit = (room, id, table) => act(room, id, { type: 'sit', table });
// Pone las cartas a repartir en la mesa de blackjack 1: la primera de la lista sale primero (primero el croupier, después
// el jugador). (Con menos de 60 cartas la sala vuelve a mezclar, así que se rellena el principio del mazo.)
const stack = (room, ...cards) => { room.tb.bj1.deck = [...Array(80).fill(2), ...[...cards].reverse()]; return room; };

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
  assert.equal(payoutFor(36, [0, 12], dealer19, false), 90);
});

test('timba: el mazo tiene 4 barajas completas y se mezcla', () => {
  const deck = freshDeck(Math.random);
  assert.equal(deck.length, 208);
  const counts = new Map();
  for (const c of deck) counts.set(c, (counts.get(c) || 0) + 1);
  assert.ok([...counts.values()].every((n) => n === 4) && counts.size === 52);
  assert.notDeepEqual(deck.slice(0, 20), Array.from({ length: 20 }, (_, i) => i));
});

test('timba: apuestas de $36 a $360 en blackjack, sin pasarse de la plata, y los botones rápidos', () => {
  assert.deepEqual(betLimits('bj', 1000), { min: 36, max: 360 });
  assert.deepEqual(betLimits('bj', 100), { min: 36, max: 100 });
  assert.equal(betLimits('bj', 35), null);
  assert.deepEqual(['min', 'q', 'h', 'all'].map((k) => quickBet('bj', k, 1000)), [36, 90, 180, 360]);
  assert.deepEqual(['min', 'q', 'h', 'all'].map((k) => quickBet('bj', k, 100)), [36, 90, 100, 100]);
  assert.equal(quickBet('bj', 'all', 20), 0);
  assert.deepEqual(['min', 'q', 'h', 'all'].map((k) => quickBet('slots', k, 1000)), [1, 15, 30, 60]);
});

test('timba: el dinero se muestra como en el original', () => {
  assert.deepEqual([75, 1000, 1200, 1250, 10000, 360].map(fmtMoney), ['$75', '$1K', '$1.2K', '$1.25K', '$10K', '$360']);
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
  assert.equal(arrived.day.endsAt, 0, 'el día todavía no arrancó: arranca con el ascensor');
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
  assert.equal(act(room, 'a', { type: 'floor', to: 4 }, 5000), null, 'el piso 4 es del casino 2: el día 1 no se llega');
  assert.equal(room.day.endsAt, 0, 'en el lobby el reloj no corre');
  room = act(room, 'b', { type: 'floor', to: 1 }, 5000);
  assert.equal(room.trip.kind, 'elev');
  assert.equal(room.day.endsAt, 5000 + DAY_MS, 'el día arranca con el primer viaje a un piso');
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

// ─── Mesas ───────────────────────────────────────────────────────────────────
test('timba: la mesa es de uno solo: si alguien juega, está ocupada para los demás', () => {
  let room = atFloor1(2);
  room = sit(room, 'a', 'bj1');
  assert.equal(act(room, 'b', { type: 'sit', table: 'bj1' }), null, 'la mesa está ocupada');
  assert.equal(act(room, 'b', { type: 'bjBet', amount: 50 }), null, 'sin silla no se apuesta');
  assert.equal(act(room, 'a', { type: 'sit', table: 'bj2' }), null, 'no se juega en dos a la vez');
  assert.ok(act(room, 'b', { type: 'sit', table: 'bj2' }), 'hay otras mesas libres');
  room = act(room, 'a', { type: 'stand' });
  assert.equal(room.tb.bj1, undefined, 'al levantarse queda libre');
  assert.ok(act(room, 'b', { type: 'sit', table: 'bj1' }));
});

test('timba: cada juego tiene sus mesas y no se puede sentar lejos del piso 1', () => {
  const count = (kind) => floorTables(1).filter((t) => t.kind === kind).length;
  assert.deepEqual(['bj', 'slots', 'wheel', 'roulette', 'duck', 'craps'].map(count), [4, 4, 2, 2, 2, 2]);
  assert.equal(act(started(1), 'a', { type: 'sit', table: 'bj1' }), null, 'solo en el piso donde está la mesa');
  assert.equal(act(atFloor1(1), 'a', { type: 'sit', table: 'nada' }), null);
});

// ─── Blackjack ───────────────────────────────────────────────────────────────
test('timba: una mano ganada paga a la caja de todos y queda anotada', () => {
  let room = sit(atFloor1(1), 'a', 'bj1');
  stack(room, 9, 8, 9, 9); // croupier 10+9 = 19; Ana 10+10 = 20
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(room.tb.bj1.phase, 'play');
  assert.equal(room.money, 900, 'la apuesta sale de la caja');
  room = act(room, 'a', { type: 'bjStand' });
  assert.equal(room.tb.bj1.phase, 'result');
  assert.equal(room.money, 1100);
  assert.equal(room.net.a, 100);
  assert.equal(room.tb.bj1.res, 'win');
});

test('timba: blackjack natural paga 3 a 2, pasarse pierde, doblar duplica', () => {
  let room = sit(atFloor1(1), 'a', 'bj1');
  stack(room, 9, 8, 0, 12);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(room.tb.bj1.phase, 'result', 'con blackjack no hay nada que decidir');
  assert.equal(room.money, 1150);
  assert.equal(room.tb.bj1.res, 'bj');

  // Pasarse
  clock += RESULT_MS + 1;
  stack(room, 9, 8, 9, 6, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 50 }, clock);
  assert.equal(room.tb.bj1.phase, 'play');
  room = act(room, 'a', { type: 'bjHit' }, clock);
  assert.equal(room.tb.bj1.st, 'bust');
  assert.equal(room.tb.bj1.phase, 'result');
  assert.equal(room.money, 1100);
  assert.equal(room.tb.bj1.dealer.length, 2, 'si se pasó, el croupier no pide');

  // Doblar con 11
  clock += RESULT_MS + 1;
  stack(room, 9, 8, 4, 5, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 }, clock);
  assert.equal(act(room, 'a', { type: 'bjDouble' }, clock).tb.bj1.bet, 200);
  room = act(room, 'a', { type: 'bjDouble' }, clock);
  assert.equal(room.tb.bj1.phase, 'result');
  assert.equal(room.tb.bj1.res, 'win');
  assert.equal(room.money, 1100 + 200);
});

test('timba: la apuesta respeta el mínimo, el máximo y la plata que hay', () => {
  const room = sit(atFloor1(1), 'a', 'bj1');
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 35 }), null);
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 361 }), null);
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 36.5 }), null);
  room.money = 80;
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 100 }), null, 'no alcanza la plata');
  assert.ok(act(room, 'a', { type: 'bjBet', amount: 80 }));
});

test('timba: en medio de una mano no se puede levantar, y los resultados se ven un rato', () => {
  let room = sit(atFloor1(2), 'a', 'bj1');
  stack(room, 9, 8, 9, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  assert.equal(act(room, 'a', { type: 'stand' }), null, 'en medio de una mano no se puede levantar');
  room = act(room, 'a', { type: 'bjStand' });
  assert.equal(room.money, 1100);
  const at = room.tb.bj1.resultAt;
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 40 }, at + RESULT_MS - 1), null);
  assert.equal(act(room, 'a', { type: 'bjBet', amount: 40 }, at + RESULT_MS).tb.bj1.phase, 'play', 'con uno solo la mano arranca apenas apuesta');
});

test('timba: levantarse sin apostar deja la mesa libre, y con una apuesta sin repartir la devuelve', () => {
  let room = sit(atFloor1(2), 'a', 'bj1');
  room = act(room, 'a', { type: 'stand' });
  assert.equal(room.money, 1000);
  assert.deepEqual(room.tb, {});
});

test('timba: el que se va en medio de una mano se planta y la mano se paga igual', () => {
  let room = sit(atFloor1(2), 'a', 'bj1');
  stack(room, 9, 8, 9, 9);
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  room = act(room, 'a', { type: 'leave' });
  assert.deepEqual(room.tb, {}, 'el que se fue ya no tiene mesa');
  assert.equal(room.money, 1100, 'la mano de Ana se pagó igual');
  assert.equal(room.net.a, 100);
});

// ─── Tragamonedas ────────────────────────────────────────────────────────────
test('timba: tragamonedas: los patrones se suman y se multiplican por el valor del símbolo', () => {
  const full = (sym) => Array(9).fill(sym);
  const lotus = slotsEval(full(0));
  assert.equal(lotus.mult, 175, 'tablero lleno de lotos: 175 veces');
  assert.equal(slotsEval(full(3)).mult, 25, 'de ojos: 100 × 0,25');
  // una sola línea de escarabajos arriba (y nada más igual)
  assert.equal(slotsEval([1, 1, 1, 0, 2, 3, 2, 3, 0]).mult, 2 * 1.25);
  // la X incluye las dos diagonales: 20 + 2 + 2 = 24 veces
  assert.equal(slotsEval([2, 0, 2, 1, 2, 3, 2, 1, 2]).mult, 24 * 0.75);
  // el rombo: los cuatro del medio de cada lado
  assert.equal(slotsEval([0, 1, 2, 1, 3, 1, 2, 1, 0]).mult, 5 * 1.25);
  assert.equal(slotsEval([0, 1, 2, 3, 1, 0, 2, 3, 1]).mult, 0);
});

test('timba: tragamonedas: paga a la caja cuando termina la animación y no antes', () => {
  let room = sit(atFloor1(1), 'a', 'slots1');
  assert.equal(act(room, 'a', { type: 'spin', amount: 61 }), null, 'máximo $60');
  assert.equal(act(room, 'a', { type: 'spin', amount: 0 }), null);
  room = act(room, 'a', { type: 'spin', amount: 50 }, clock);
  const t = room.tb.slots1;
  assert.equal(room.money, 950, 'la apuesta sale al girar');
  assert.equal(t.grid.length, 9);
  assert.equal(t.pay, Math.round(50 * slotsEval(t.grid).mult));
  assert.equal(act(room, 'a', { type: 'spin', amount: 5 }, clock + 1), null, 'no se gira dos veces');
  assert.equal(act(room, 'a', { type: 'settle' }, clock + t.ms - 1), null, 'todavía gira');
  room = act(room, 'a', { type: 'settle' }, clock + t.ms);
  assert.equal(room.money, 950 + t.pay);
  assert.equal(room.net.a, t.pay - 50);
  assert.equal(act(room, 'a', { type: 'settle' }, clock + t.ms + 1), null, 'no se cobra dos veces');
  assert.ok(act(room, 'a', { type: 'spin', amount: 5 }, clock + t.ms + 1), 'se puede girar de nuevo');
});

test('timba: si se levanta mientras gira, cobra al toque', () => {
  let room = sit(atFloor1(1), 'a', 'slots2');
  room = act(room, 'a', { type: 'spin', amount: 40 }, clock);
  const { pay } = room.tb.slots2;
  room = act(room, 'a', { type: 'stand' }, clock + 100);
  assert.equal(room.money, 960 + pay);
  assert.deepEqual(room.tb, {});
});

// ─── Rueda de la fortuna ─────────────────────────────────────────────────────
test('timba: rueda: 20 casilleros y el pago promedio es justo (sin contar los de girar otra vez)', () => {
  assert.equal(WHEEL.length, 20);
  const plain = WHEEL.filter((v) => v !== 'again');
  assert.equal(plain.reduce((a, b) => a + b, 0) / plain.length, 1);
  assert.equal(WHEEL.filter((v) => v === 'again').length, 2);
});

test('timba: rueda: cada «gira otra vez» suma un giro, y se cobra el último casillero', () => {
  // dos veces seguidas «otra vez» (el 0 y el 10) y después el 5 (que paga 5)
  const picks = [0.0, 10.5 / 20, 5.5 / 20];
  let k = 0;
  const spins = spinWheel(() => picks[k++]);
  assert.deepEqual(spins, [0, 10, 5]);
  let room = sit(atFloor1(1), 'a', 'wheel1');
  room = applyAction(room, { type: 'spin', playerId: 'a', amount: 10 }, { now: clock, rand: () => 5.5 / 20 });
  const t = room.tb.wheel1;
  assert.deepEqual(t.spins, [5]);
  assert.equal(t.pay, 50);
  assert.equal(t.ms, WHEEL_SPIN_MS + 600);
  room = act(room, 'a', { type: 'settle' }, clock + t.ms);
  assert.equal(room.money, 1040);
  // con girar otra vez: dura más
  room = sit(atFloor1(1), 'a', 'wheel2');
  let n = 0;
  room = applyAction(room, { type: 'spin', playerId: 'a', amount: 10 }, { now: clock, rand: () => [0, 10.5 / 20, 2.5 / 20][n++] });
  assert.deepEqual(room.tb.wheel2.spins, [0, 10, 2]);
  assert.equal(room.tb.wheel2.ms, 3 * WHEEL_SPIN_MS + 600);
  assert.equal(room.tb.wheel2.pay, 1, 'el 0,1x de $10 es $1');
});

// ─── Ruleta ──────────────────────────────────────────────────────────────────
test('timba: ruleta: los pagos de cada apuesta y el 0', () => {
  assert.equal(ROULETTE_WHEEL.length, 37);
  assert.equal(new Set(ROULETTE_WHEEL).size, 37);
  assert.equal(roulettePays('n17', 17), 36);
  assert.equal(roulettePays('n17', 18), 0);
  assert.equal(roulettePays('n0', 0), 36);
  assert.equal(roulettePays('red', 1), 2);
  assert.equal(roulettePays('red', 2), 0);
  assert.equal(roulettePays('black', 2), 2);
  assert.equal(roulettePays('odd', 7), 2);
  assert.equal(roulettePays('even', 8), 2);
  assert.equal(roulettePays('low', 18), 2);
  assert.equal(roulettePays('high', 18), 0);
  assert.equal(roulettePays('d2', 13), 3);
  assert.equal(roulettePays('d3', 24), 0);
  for (const spot of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3']) assert.equal(roulettePays(spot, 0), 0, `el 0 pierde ${spot}`);
  // cada apuesta paga justo (menos el 0): la suma de lo que vuelve en los 37 números es 36 por cada $1
  for (const spot of ['red', 'odd', 'low', 'd1', 'n5']) assert.equal(Array.from({ length: 37 }, (_, n) => roulettePays(spot, n)).reduce((a, b) => a + b, 0), 36);
  assert.ok(isSpot('n36') && isSpot('red') && !isSpot('n37') && !isSpot('azul'));
});

test('timba: ruleta: apuesta, gira y cobra', () => {
  let room = sit(atFloor1(1), 'a', 'roulette1');
  assert.equal(act(room, 'a', { type: 'spin', amount: 20 }), null, 'falta elegir la apuesta');
  assert.equal(act(room, 'a', { type: 'spin', amount: 20, spot: 'n99' }), null);
  assert.equal(act(room, 'a', { type: 'spin', amount: 4, spot: 'red' }), null, 'mínimo $5');
  room = applyAction(room, { type: 'spin', playerId: 'a', amount: 20, spot: 'n17' }, { now: clock, rand: () => 0 });
  assert.equal(room.tb.roulette1.n, 0);
  assert.equal(room.tb.roulette1.pay, 0, 'salió el 0');
  room = act(room, 'a', { type: 'settle' }, clock + ROULETTE_MS);
  assert.equal(room.money, 980);
  room = applyAction(room, { type: 'spin', playerId: 'a', amount: 20, spot: 'n0' }, { now: clock + 9000, rand: () => 0 });
  assert.equal(room.tb.roulette1.pay, 720, 'un pleno paga 36 veces');
});

// ─── Carrera de patos ────────────────────────────────────────────────────────
test('timba: patos: cuatro con nombre, gana el que llega primero y paga 3,8 veces', () => {
  assert.deepEqual(DUCKS, ['Cuki', 'Suti', 'Vitas', 'Gordon']);
  const race = raceDucks(() => 0.5);
  assert.equal(race.times.length, 4);
  assert.equal(race.win, 0, 'si empatan gana el primero');
  const seq = [0.9, 0.1, 0.5, 0.7];
  let k = 0;
  assert.equal(raceDucks(() => seq[k++]).win, 1);
  // sin favorito: con azar parejo gana cada uno más o menos un cuarto de las veces
  const wins = [0, 0, 0, 0];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 4000; i++) wins[raceDucks(rnd).win]++;
  assert.ok(wins.every((w) => w > 850 && w < 1150), `reparto raro: ${wins}`);
});

test('timba: patos: se elige uno, y cobra solo si ese gana', () => {
  let room = sit(atFloor1(1), 'a', 'duck1');
  assert.equal(act(room, 'a', { type: 'spin', amount: 20 }), null, 'falta elegir el pato');
  assert.equal(act(room, 'a', { type: 'spin', amount: 20, pick: 4 }), null);
  const seq = [0.9, 0.1, 0.5, 0.7]; // gana Suti
  let k = 0;
  const win = applyAction(room, { type: 'spin', playerId: 'a', amount: 20, pick: 1 }, { now: clock, rand: () => seq[k++ % 4] });
  assert.equal(win.tb.duck1.win, 1);
  assert.equal(win.tb.duck1.pay, 76);
  const end = clock + win.tb.duck1.ms;
  assert.equal(act(win, 'a', { type: 'settle' }, end - 1), null, 'la carrera sigue');
  assert.equal(act(win, 'a', { type: 'settle' }, end).money, 980 + 76);
  k = 0;
  const lose = applyAction(room, { type: 'spin', playerId: 'a', amount: 20, pick: 0 }, { now: clock, rand: () => seq[k++ % 4] });
  assert.equal(lose.tb.duck1.pay, 0);
});

// ─── Craps ───────────────────────────────────────────────────────────────────
test('timba: craps: 7 u 11 gana, 2, 3 o 12 pierde y los otros quedan de punto', () => {
  for (const [dice, want] of [[[3, 4], 'win'], [[5, 6], 'win'], [[1, 1], 'lose'], [[1, 2], 'lose'], [[6, 6], 'lose']]) assert.equal(crapsStep(0, dice).res, want);
  assert.deepEqual(crapsStep(0, [2, 2]), { point: 4, res: '' });
  assert.deepEqual(crapsStep(0, [4, 4]), { point: 8, res: '' });
  assert.deepEqual(crapsStep(4, [1, 3]), { point: 0, res: 'win' }, 'sale el punto');
  assert.deepEqual(crapsStep(4, [3, 4]), { point: 0, res: 'lose' }, 'sale un 7');
  assert.deepEqual(crapsStep(4, [6, 6]), { point: 4, res: '' }, 'con punto, el 12 no pasa nada');
  assert.ok(validDice([1, 6]) && !validDice([0, 3]) && !validDice([1, 7]) && !validDice([1]) && !validDice([1.5, 2]));
});

test('timba: craps: se apuesta una vez, se tira hasta que se decide y paga 1 a 1', () => {
  let room = sit(atFloor1(1), 'a', 'craps1');
  assert.equal(act(room, 'a', { type: 'crapsRoll', dice: [3, 4] }), null, 'sin apuesta no se tira');
  assert.equal(act(room, 'a', { type: 'crapsBet', amount: 19 }), null, 'mínimo $20');
  assert.equal(act(room, 'a', { type: 'crapsBet', amount: 361 }), null);
  room = act(room, 'a', { type: 'crapsBet', amount: 100 });
  assert.equal(room.money, 900);
  assert.equal(act(room, 'a', { type: 'crapsBet', amount: 100 }), null, 'ya hay una apuesta en marcha');
  assert.equal(act(room, 'a', { type: 'crapsRoll', dice: [0, 9] }), null, 'dados que no existen');
  room = act(room, 'a', { type: 'crapsRoll', dice: [2, 2] });
  assert.equal(room.tb.craps1.point, 4);
  assert.equal(room.tb.craps1.res, '');
  room = act(room, 'a', { type: 'crapsRoll', dice: [5, 5] });
  assert.equal(room.tb.craps1.point, 4, 'siguen tirando');
  room = act(room, 'a', { type: 'crapsRoll', dice: [1, 3] });
  assert.equal(room.tb.craps1.res, 'win');
  assert.equal(room.money, 1100);
  assert.equal(room.net.a, 100);
  assert.equal(act(room, 'a', { type: 'crapsRoll', dice: [3, 4] }), null, 'ya se decidió');
  // otra ronda: perder con 7
  room = act(room, 'a', { type: 'crapsBet', amount: 50 });
  room = act(room, 'a', { type: 'crapsRoll', dice: [3, 3] });
  room = act(room, 'a', { type: 'crapsRoll', dice: [3, 4] });
  assert.equal(room.tb.craps1.res, 'lose');
  assert.equal(room.money, 1050);
  assert.equal(room.net.a, 50);
});

test('timba: craps: si se levanta con una apuesta sin decidir, se le devuelve', () => {
  let room = sit(atFloor1(1), 'a', 'craps2');
  room = act(room, 'a', { type: 'crapsBet', amount: 100 });
  room = act(room, 'a', { type: 'crapsRoll', dice: [4, 4] });
  room = act(room, 'a', { type: 'stand' });
  assert.equal(room.money, 1000);
  assert.deepEqual(room.tb, {});
});

// ─── El día y la limusina de vuelta ──────────────────────────────────────────
test('timba: el reloj del día no corre hasta el primer viaje del ascensor a un piso', () => {
  let room = started(1);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  assert.equal(room.day.endsAt, 0);
  assert.equal(act(room, 'a', { type: 'loc', to: 'back' }), null, 'todavía no entraron al casino: no se vuelve');
  room = act(room, 'a', { type: 'loc', to: 'elevator' });
  room = act(room, 'a', { type: 'floor', to: 1 }, clock);
  assert.equal(room.day.endsAt, clock + DAY_MS);
});

test('timba: se acaba el día: todos al ascensor, se cierra la mesa y solo se baja al lobby', () => {
  let room = sit(atFloor1(2), 'a', 'bj1');
  room = act(room, 'a', { type: 'bjBet', amount: 100 });
  const endsAt = room.day.endsAt;
  assert.equal(act(room, 'a', { type: 'tick' }, endsAt - 1), null);
  room = act(room, 'a', { type: 'tick' }, endsAt);
  assert.ok(room.day.over);
  assert.ok(room.players.every((p) => p.loc === 'elevator'));
  assert.equal(room.money, 1000, 'la apuesta que no se repartió vuelve a la caja');
  assert.deepEqual(room.tb, {});
  assert.equal(act(room, 'a', { type: 'loc', to: 'f1' }, endsAt + 1), null, 'el ascensor está cerrado');
  assert.equal(act(room, 'a', { type: 'sit', table: 'bj1' }, endsAt + 1), null);
  assert.equal(act(room, 'a', { type: 'floor', to: 1 }, endsAt + 1), null, 'solo el lobby');
  room = act(room, 'a', { type: 'floor', to: 0 }, endsAt + 1);
  assert.equal(room.trip.kind, 'elev');
});

// Del piso 1 de vuelta a la puerta del casino (con el día terminado o no): todos al ascensor, al lobby y afuera.
function backOutside(room) {
  let r = room;
  for (const id of ids(r)) r = act(r, id, { type: 'loc', to: 'elevator' }) || r;
  r = act(r, 'a', { type: 'floor', to: 0 }, clock);
  clock += ELEV_MS + 10;
  r = act(r, 'a', { type: 'tick' }, clock);
  for (const id of ids(r)) r = act(r, id, { type: 'loc', to: 'outside' });
  return r;
}

test('timba: de vuelta a casa en la limusina: con la cuota sigue otro día con una cuota más alta', () => {
  let room = atFloor1(2);
  room.money = 1500;
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  clock = room.day.endsAt + 1;
  room = backOutside(room);
  assert.ok(room.players.every((p) => p.loc === 'outside'));
  room = act(room, 'a', { type: 'loc', to: 'back' });
  assert.equal(room.trip, null, 'falta uno');
  room = act(room, 'b', { type: 'loc', to: 'back' });
  assert.equal(room.trip.kind, 'home', 'cuando están todos arriba, vuelven');
  room = act(room, 'b', { type: 'tick' }, room.trip.at + HOME_MS);
  assert.equal(room.phase, 'playing');
  assert.equal(room.day.n, 2);
  assert.equal(room.day.quota, 1725, 'cuota del día 2: la caja al empezar ($1.500) por 1,15');
  assert.equal(room.day.endsAt, 0);
  assert.equal(room.day.over, false);
  assert.ok(room.players.every((p) => p.loc === 'wait'));
  assert.equal(room.money, 1500, 'la plata sigue siendo de todos');
});

// Termina el día `n` con la caja en `money` y vuelve a casa en la limusina.
function finishDay(n, money) {
  let room = atFloor1(1);
  room.day.n = n;
  room.money = money;
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  clock = room.day.endsAt + 1;
  room = backOutside(room);
  room = act(room, 'a', { type: 'loc', to: 'back' });
  return act(room, 'a', { type: 'tick' }, room.trip.at + HOME_MS);
}

test('timba: pasado el día 3 la partida sigue (ya no es una demo)', () => {
  const room = finishDay(3, 5000);
  assert.equal(room.phase, 'playing');
  assert.equal(room.day.n, 4);
  assert.equal(room.day.quota, 6850, 'día 4: $5.000 × 1,37');
});

test('timba: al superar el día 12 se gana la partida', () => {
  const room = finishDay(TOTAL_DAYS, 5000);
  assert.equal(room.phase, 'ended');
  assert.equal(room.day.last.won, true);
});

test('timba: la cuota es la caja al empezar el día por el multiplicador, redondeada', () => {
  assert.equal(TOTAL_DAYS, 12);
  assert.deepEqual(QUOTA_MULTIPLIERS, [1.2, 1.15, 1.4, 1.37, 1.85, 2.13, 2.18, 2.52, 2.85, 3.19, 3.43, 3.7]);
  assert.equal(quotaFor(1, 1000), 1200, 'el día 1 arranca con $1.000 y pide $1.200');
  assert.equal(quotaFor(2, 1250), 1438, '1.437,5 redondea para arriba');
  assert.equal(quotaFor(12, 10000), 37000);
  assert.ok(Number.isInteger(quotaFor(4, 1234)), 'siempre un entero');
  assert.equal(quotaFor(13, 1000), null, 'no hay día 13');
  assert.equal(quotaFor(1, -5), null);
  for (let d = 1; d <= TOTAL_DAYS; d++) assert.equal(quotaFor(d, 2000), Math.round(2000 * QUOTA_MULTIPLIERS[d - 1]));
});

test('timba: si vuelven con menos de la cuota es game over y el anfitrión puede empezar otra', () => {
  let room = atFloor1(2);
  room.money = 900;
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  clock = room.day.endsAt + 1;
  room = backOutside(room);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'back' });
  room = act(room, 'b', { type: 'tick' }, room.trip.at + HOME_MS);
  assert.equal(room.phase, 'ended');
  assert.equal(room.day.last.lost, true);
  assert.equal(act(room, 'b', { type: 'start' }), null, 'solo el anfitrión');
  const again = act(room, 'a', { type: 'start' });
  assert.equal(again.phase, 'playing');
  assert.equal(again.money, START_MONEY);
  assert.equal(again.day.n, 1);
  assert.deepEqual(again.tb, {});
  assert.ok(again.run > room.run);
  assert.equal(act(room, 'a', { type: 'toLobby' }).phase, 'lobby');
});

test('timba: se puede volver antes de que se acabe el día, y se baja de la limusina de vuelta', () => {
  let room = atFloor1(1);
  room.money = 1300;
  room = backOutside(room);
  assert.ok(room.day.endsAt > 0 && !room.day.over, 'el día sigue corriendo');
  room = act(room, 'a', { type: 'loc', to: 'back' });
  assert.equal(room.trip.kind, 'home', 'un solo jugador: sale al toque');
  const asleep = act(atFloor1(2), 'a', { type: 'loc', to: 'outside' });
  assert.equal(asleep, null, 'del piso no se sale a la calle');
  let two = backOutside(atFloor1(2));
  two = act(two, 'a', { type: 'loc', to: 'back' });
  two = act(two, 'a', { type: 'loc', to: 'outside' });
  assert.equal(findPlayer(two, 'a').loc, 'outside', 'se puede bajar antes de que salgan');
  // si el que falta se va, el otro sale
  two = act(two, 'b', { type: 'loc', to: 'back' });
  two = act(two, 'a', { type: 'loc', to: 'back' });
  assert.equal(two.trip.kind, 'home');
});

test('timba: nadie entra con la partida empezada, y la plata nunca queda negativa ni con decimales', () => {
  let room = atFloor1(3);
  assert.equal(act(room, 'zz', { type: 'join', name: 'Tarde' }), null);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const kinds = ['sit', 'stand', 'bjBet', 'bjHit', 'bjStand', 'bjDouble', 'spin', 'settle', 'crapsBet', 'crapsRoll'];
  for (let i = 0; i < 1500; i++) {
    const id = ids(room)[Math.floor(rnd() * 3)];
    const type = kinds[Math.floor(rnd() * kinds.length)];
    clock += 900;
    const action = {
      type, playerId: id, table: TABLES[Math.floor(rnd() * TABLES.length)].id, amount: 1 + Math.floor(rnd() * 360),
      spot: ['red', 'n7', 'd2'][Math.floor(rnd() * 3)], pick: Math.floor(rnd() * 4), dice: [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)],
    };
    const next = applyAction(room, action, { now: clock, rand: rnd });
    if (next) room = next;
    assert.ok(room.money >= 0 && Number.isInteger(room.money), `plata ${room.money} en el paso ${i} (${type})`);
    for (const t of Object.values(room.tb)) assert.ok(room.players.some((p) => p.id === t.by), 'toda mesa tiene un jugador');
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

test('timba: desde arriba se choca con las paredes y con las mesas, y el ascensor tiene su puerta', () => {
  const floors = Array.from({ length: FLOOR_COUNT }, (_, i) => `f${i + 1}`);
  for (const scene of ['elevator', ...floors]) {
    const sp = spawnPoint(scene, 0);
    assert.ok(canStand(scene, sp.x, sp.y), `${scene}: el lugar de aparición tiene que ser libre`);
  }
  assert.ok(!canStand('f1', 910, 695), 'adentro de una mesa no se puede');
  assert.ok(!canStand('f1', 10, 10));
  for (const scene of floors) {
    const p = { x: 120, y: 500 };
    for (let i = 0; i < 300; i++) stepTop(p, -1, 0, 0.016, scene);
    assert.ok(p.x < 52 && p.x > 20, `${scene}: se puede llegar a la puerta del ascensor`);
    assert.equal(doorFor(scene, p, floorOfLoc(scene)), 'elevator');
  }
  const q = { x: 150, y: 150 };
  for (let i = 0; i < 400; i++) stepTop(q, 0, 1, 0.016, 'elevator');
  assert.equal(doorFor('elevator', q, 1), 'f1');
  assert.equal(doorFor('elevator', q, 7), 'f7', 'el ascensor deja en cualquiera de los 12 pisos');
  assert.equal(doorFor('elevator', q, 0), 'outside');
  assert.equal(doorFor('outside', { x: SCENES.outside.doorX + 1 }, 0), 'elevator');
});

test('timba: todo lo que se toca está donde corresponde', () => {
  assert.equal(nearby('wait', { x: SCENES.wait.van.x + 150, y: 300 })?.key, 'van');
  assert.equal(nearby('wait', { x: SCENES.wait.limo.x + 20, y: 300 })?.key, 'board');
  assert.equal(nearby('wait', { x: 300, y: 300 }), null);
  assert.equal(nearby('limo', { x: 0, y: 0 })?.key, 'unboard');
  assert.equal(nearby('back', { x: 0, y: 0 })?.key, 'unboardBack');
  assert.equal(nearby('outside', { x: 100, y: 300 }), null, 'sin haber entrado no se vuelve');
  assert.equal(nearby('outside', { x: 100, y: 300 }, { home: true })?.key, 'boardBack');
  assert.equal(nearby('outside', { x: SCENES.outside.doorX, y: 300 }, { home: true }), null);
  assert.equal(nearby('elevator', { x: SCENES.elevator.panel.x - 10, y: SCENES.elevator.panel.y + 20 })?.key, 'panel');
  assert.equal(nearby('elevator', { x: 70, y: 85 })?.key, 'npc');
  assert.equal(nearby('f1', { x: 120, y: 500 }), null);
  assert.equal(nearby('f1', { x: 700, y: 900 }), null);
});

test('timba: en cada piso, cada mesa tiene su lugar libre abajo, a la vista y al que se llega caminando', () => {
  for (let n = 1; n <= FLOOR_COUNT; n++) {
    const scene = `f${n}`;
    const sc = SCENES[scene];
    const tables = floorTables(n);
    assert.ok(tables.length > 0, `${scene}: tiene mesas`);
    for (const t of tables) {
      const sp = standAt(t);
      assert.ok(canStand(scene, sp.x, sp.y), `${t.id}: el lugar donde se para el jugador está libre`);
      assert.equal(nearby(scene, sp)?.key, `t:${t.id}`, `${t.id}: desde ahí se juega a esa mesa`);
      assert.equal(FLOOR_OF_TABLE[t.id], n);
      for (const o of [...tables, ...sc.decor]) if (o !== t) assert.ok(t.x + t.w <= o.x || o.x + o.w <= t.x || t.y + t.h <= o.y || o.y + o.h <= t.y, `${scene}: ${t.id} se pisa con otra cosa`);
    }
    // se llega a todas desde la puerta del ascensor (se recorre el piso de a 8 unidades)
    const step = 8;
    const key = (x, y) => `${Math.round(x / step)},${Math.round(y / step)}`;
    const seen = new Set([key(sc.spawn.x, sc.spawn.y)]);
    const queue = [[sc.spawn.x, sc.spawn.y]];
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const nx = x + dx; const ny = y + dy;
        if (!seen.has(key(nx, ny)) && canStand(scene, nx, ny)) { seen.add(key(nx, ny)); queue.push([nx, ny]); }
      }
    }
    for (const t of tables) { const sp = standAt(t); assert.ok(seen.has(key(sp.x, sp.y)) || [...seen].some((k) => { const [a, b] = k.split(',').map(Number); return Math.hypot(a * step - sp.x, b * step - sp.y) < step; }), `${scene}/${t.id}: se llega caminando`); }
  }
});

test('timba: los 12 pisos tienen ids de mesa únicas y nada de lo que se arma se sale de la sala', () => {
  assert.equal(new Set(TABLES.map((t) => t.id)).size, TABLES.length);
  for (let n = 1; n <= FLOOR_COUNT; n++) {
    const sc = SCENES[`f${n}`];
    for (const o of [...sc.tables, ...sc.decor]) assert.ok(o.x >= 60 && o.y >= 70 && o.x + o.w <= 1840 && o.y + o.h <= 950, `f${n}: ${o.id || o.kind} entra en la sala`);
    const big = sc.tables.filter((t) => t.y >= 200).length;
    assert.ok(big <= 2 * MAX_BIG_PER_ROW, `f${n}: las mesas grandes entran en dos filas`);
  }
});

test('timba: los límites de cada juego: los de tirar muchas veces son más bajos', () => {
  assert.deepEqual(LIMITS.slots, [1, 60]);
  assert.deepEqual(LIMITS.wheel, [1, 60]);
  assert.ok(LIMITS.bj[1] > LIMITS.slots[1] && LIMITS.craps[1] > LIMITS.slots[1], 'los de una partida tienen un rango más alto');
  for (const kind of Object.keys(LIMITS)) assert.ok(NAMES[kind]);
});

// ─── Casinos y pisos ─────────────────────────────────────────────────────────
test('timba: cada casino dura 3 días y tiene 3 pisos (días 1-3, 4-6, 7-9 y 10-12)', () => {
  assert.equal(CASINOS.length, 4);
  assert.equal(FLOOR_COUNT, 12);
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12].map(casinoOfDay), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12].map(casinoOfFloor), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual([1, 4, 7, 10].map(floorsOfDay), [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
  assert.equal(locOfFloor(0), 'outside');
  assert.equal(locOfFloor(9), 'f9');
  assert.equal(floorOfLoc('f12'), 12);
  assert.equal(floorOfLoc('outside'), null);
  assert.equal(floorOfLoc('elevator'), null);
});

test('timba: cuanto más avanzás más lujoso: cada casino tiene su decoración y la de arriba es mayor', () => {
  assert.deepEqual(CASINOS.map((c) => c.theme), ['classic', 'velvet', 'marble', 'gold']);
  const fountains = (c) => DECOR[c].filter((d) => d.kind === 'fountain').length;
  assert.deepEqual([1, 2, 3, 4].map(fountains), [0, 0, 2, 1], 'las fuentes llegan en el casino 3');
  assert.ok(DECOR[4].some((d) => d.kind === 'fountain' && d.w * d.h > 120 * 90), 'la del casino 4 es la más grande');
  for (let n = 1; n <= FLOOR_COUNT; n++) assert.equal(SCENES[`f${n}`].casino, casinoOfFloor(n));
});

// Lleva a todos a un piso de juego de hoy (ya con la limusina hecha y el ascensor arriba).
function atFloor(room, floor) {
  let r = room;
  for (const id of ids(r)) r = act(r, id, { type: 'loc', to: 'elevator' }) || r;
  r = act(r, 'a', { type: 'floor', to: floor }, clock);
  clock += ELEV_MS + 10;
  r = act(r, 'a', { type: 'tick' }, clock);
  for (const id of ids(r)) r = act(r, id, { type: 'loc', to: locOfFloor(floor) });
  return r;
}

test('timba: el ascensor ofrece los 3 pisos del casino de hoy y las mesas son del piso donde están', () => {
  let room = started(1);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  room = act(room, 'a', { type: 'loc', to: 'elevator' });
  for (const to of [4, 7, 10, 12, 13, -1]) assert.equal(act(room, 'a', { type: 'floor', to }), null, `el piso ${to} no es del casino de hoy`);
  room = atFloor(room, 3);
  assert.equal(findPlayer(room, 'a').loc, 'f3');
  const here = floorTables(3)[0];
  const other = floorTables(2)[0];
  assert.equal(act(room, 'a', { type: 'sit', table: other.id }), null, 'una mesa de otro piso no se usa');
  assert.ok(act(room, 'a', { type: 'sit', table: here.id }), 'una del piso 3 sí');
});

test('timba: el día siguiente (casino 2) ofrece los pisos 4 a 6 y no los del casino anterior', () => {
  let room = finishDay(3, 5000);
  assert.equal(room.day.n, 4);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  for (const id of ids(room)) room = act(room, id, { type: 'loc', to: 'elevator' });
  assert.equal(act(room, 'a', { type: 'floor', to: 1 }), null, 'el piso 1 ya es del casino anterior');
  assert.equal(act(room, 'a', { type: 'floor', to: 3 }), null);
  const up = act(room, 'a', { type: 'floor', to: 5 });
  assert.equal(up.trip.to, 5);
  room = atFloor(room, 6);
  assert.equal(findPlayer(room, 'a').loc, 'f6');
  const t = floorTables(6)[0];
  assert.ok(act(room, 'a', { type: 'sit', table: t.id }));
});

test('timba: al terminar el día los que están en un piso de cualquier casino vuelven al ascensor', () => {
  let room = started(1);
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  room = atFloor(room, 2);
  room = act(room, 'a', { type: 'tick' }, room.day.endsAt);
  assert.equal(room.day.over, true);
  assert.equal(findPlayer(room, 'a').loc, 'elevator');
});
