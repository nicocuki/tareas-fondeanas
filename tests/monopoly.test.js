import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, GROUPS, GROUP_KEYS, SQUARES, STATIONS, TOKENS, UTILITIES, groupSquares, mortgageValue, unmortgageCost } from '../src/monopoly/board.js';
import {
  AUCTION_BID_MS, AUCTION_OPEN_MS, MAX_LOG, MAX_PLAYERS, applyAction, auctionChance, buildProblem, debtTotal, findPlayer, liquidation, makeId, netWorth, newRoom, ownedBy, rentFor, roomFromSave,
  tradeEffects,
} from '../src/monopoly/game.js';
import { announce, describe } from '../src/monopoly/log.js';
import { botMove } from '../src/monopoly/bots.js';
import { exportSave, parseSaveFile, roomProblem, signature } from '../src/monopoly/saveFile.js';
import { serializeRoom } from '../src/codigo-secreto/game.js';
import { summarizeRoom } from '../src/ui/roomSummary.js';
import { writeError } from '../worker/rules.js';

const NOW = 1000;
const ids = 'abcdefgh';
// Aplica una acción de `who`; si el reducer la rechaza, el test falla.
function act(room, who, action, ctx = {}) {
  const out = applyAction(room, { ...action, playerId: who }, { now: NOW, rand: () => 0.5, ...ctx });
  assert.ok(out, `se rechazó ${action.type} de ${who} (paso ${room.step})`);
  return out;
}
const rejects = (room, who, action, ctx = {}) => assert.equal(applyAction(room, { ...action, playerId: who }, { now: NOW, rand: () => 0.5, ...ctx }), null, `${action.type} debería rechazarse`);
const roll = (room, who, d1, d2) => act(room, who, { type: 'roll', seen: room.rollN }, { dice: [d1, d2] });

// Partida de `n` jugadores (a, b, c…) con el orden de turno fijo: empieza a.
function game(n = 3, options = {}) {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  for (let i = 1; i < n; i++) room = act(room, ids[i], { type: 'join', name: `J${ids[i]}`, avatar: '🦊' });
  // Para los tests la subasta sale siempre (así es más fácil probarla); la probabilidad tiene sus propios tests.
  room = act(room, 'a', { type: 'setOptions', options: { auctionChance: 100, ...options } });
  room = act(room, 'a', { type: 'start' });
  room.players.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  room.current = 'a';
  return room;
}
const own = (room, id, ...positions) => { for (const pos of positions) room.props[pos] = { o: id, h: 0, m: 0 }; return room; };
const me = (room, id) => findPlayer(room, id);
// ─── Tablero ─────────────────────────────────────────────────────────────────
test('tablero: 40 casilleros, 28 propiedades, los mismos mazos y precios del clásico', () => {
  assert.equal(SQUARES.length, 40);
  assert.equal(SQUARES.filter((s) => ['street', 'station', 'utility'].includes(s.t)).length, 28);
  assert.equal(STATIONS.length, 4);
  assert.equal(UTILITIES.length, 2);
  assert.equal(CARDS.chance.length, 16);
  assert.equal(CARDS.chest.length, 16);
  assert.equal(SQUARES.filter((s) => s.t === 'chance').length, 3);
  assert.equal(SQUARES.filter((s) => s.t === 'chest').length, 3);
  const sizes = Object.fromEntries(GROUP_KEYS.map((g) => [g, groupSquares(g).length]));
  assert.deepEqual(sizes, { brown: 2, lightblue: 3, pink: 3, orange: 3, red: 3, yellow: 3, green: 3, blue: 2 });
  const total = SQUARES.reduce((n, s) => n + (s.t !== 'tax' && s.price ? s.price : 0), 0);
  assert.equal(total, 4590 + 4 * 200 + 2 * 150, 'las 22 calles, 4 estaciones y 2 compañías');
  assert.equal(SQUARES[0].t, 'go');
  assert.equal(SQUARES[10].t, 'jail');
  assert.equal(SQUARES[20].t, 'parking');
  assert.equal(SQUARES[30].t, 'gotojail');
  for (const s of SQUARES.filter((x) => x.t === 'street')) {
    assert.equal(s.rent.length, 6, s.name);
    assert.ok(GROUPS[s.g], s.name);
    for (let i = 1; i < 6; i++) assert.ok(s.rent[i] > s.rent[i - 1], `${s.name}: el alquiler sube con cada casa`);
  }
  assert.equal(SQUARES[39].price, 400);
  assert.equal(SQUARES[39].rent[5], 2000);
  assert.equal(SQUARES[1].rent[0], 2);
});

test('tablero: hipoteca = mitad del precio; levantarla cuesta un 10 % más', () => {
  assert.equal(mortgageValue(1), 30);
  assert.equal(unmortgageCost(1), 33);
  assert.equal(mortgageValue(39), 200);
  assert.equal(unmortgageCost(39), 220);
  assert.equal(unmortgageCost(5), 110);
});

// ─── Sala y arranque ─────────────────────────────────────────────────────────
test('sala: entran hasta 8, cada uno con su color; solo se entra en la sala de espera', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  for (let i = 1; i < MAX_PLAYERS; i++) room = act(room, ids[i], { type: 'join', name: `J${i}` });
  assert.equal(room.players.length, 8);
  assert.equal(new Set(room.players.map((p) => p.color)).size, 8);
  rejects(room, 'z', { type: 'join', name: 'Nueve' });
  assert.equal(applyAction(newRoom('a', 'Ana'), { type: 'join', playerId: 'b', name: '   ' }), null, 'sin nombre no entra');
});

test('arranque: solo el anfitrión, con 2 o más; cada uno recibe la plata inicial y se sortea el orden', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  rejects(room, 'a', { type: 'start' });
  room = act(room, 'b', { type: 'join', name: 'Beto' });
  rejects(room, 'b', { type: 'start' });
  room = act(room, 'a', { type: 'setOptions', options: { startCash: 2000, freeParking: true, auctionChance: 25, auctions: false, nope: 1 } });
  assert.deepEqual(room.options, { startCash: 2000, freeParking: true, auctionChance: 25 });
  rejects(room, 'b', { type: 'setOptions', options: { startCash: 1000 } });
  assert.equal(act(room, 'a', { type: 'setOptions', options: { startCash: 1 } }).options.startCash, 2000, 'un valor inválido se ignora');
  room = act(room, 'a', { type: 'start' });
  assert.equal(room.phase, 'playing');
  assert.ok(room.players.every((p) => p.cash === 2000 && p.pos === 0 && !p.jail));
  assert.equal(room.step, 'roll');
  assert.equal(room.current, room.players[0].id);
  assert.equal(room.deck.chance.length, 16);
  assert.deepEqual([...room.deck.chest].sort((x, y) => x - y), Array.from({ length: 16 }, (_, i) => i));
  rejects(room, 'a', { type: 'start' }); // ya empezó
  rejects(room, 'a', { type: 'setOptions', options: { startCash: 1000 } }); // ya no se cambian
});

// ─── Tirar y mover ───────────────────────────────────────────────────────────
test('tirar: mueve la suma de los dados, solo el de turno y una vez', () => {
  let room = game();
  rejects(room, 'b', { type: 'roll', seen: room.rollN }, { dice: [1, 2] });
  rejects(room, 'a', { type: 'roll', seen: 99 }, { dice: [1, 2] }); // pantalla desactualizada
  room = roll(room, 'a', 1, 2);
  assert.equal(me(room, 'a').pos, 3);
  assert.deepEqual(room.dice, [1, 2]);
  assert.equal(room.step, 'buy');
  assert.equal(room.offer, 3);
  rejects(room, 'a', { type: 'roll', seen: room.rollN }, { dice: [1, 2] }); // primero hay que decidir la compra
});

test('salida: pasar por la Salida cobra $200', () => {
  let room = game();
  me(room, 'a').pos = 36;
  room = roll(room, 'a', 3, 2); // 36 + 5 = 41 → casillero 1
  assert.equal(me(room, 'a').pos, 1);
  assert.equal(me(room, 'a').cash, 1500 + 200);
});

test('salida: caer justo en la Salida también cobra', () => {
  let room = game();
  me(room, 'a').pos = 35;
  room = roll(room, 'a', 3, 2);
  assert.equal(me(room, 'a').pos, 0);
  assert.equal(me(room, 'a').cash, 1700);
});

// ─── Comprar y alquilar ──────────────────────────────────────────────────────
test('comprar: paga el precio, la propiedad queda a su nombre y el turno sigue', () => {
  let room = game();
  room = roll(room, 'a', 1, 2); // Barracas, $60
  room = act(room, 'a', { type: 'buy' });
  assert.equal(me(room, 'a').cash, 1440);
  assert.deepEqual(room.props[3], { o: 'a', h: 0, m: 0 });
  assert.equal(room.step, 'act');
  rejects(room, 'a', { type: 'buy' });
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  assert.equal(room.current, 'b');
  assert.equal(room.step, 'roll');
});

test('comprar: sin plata no se puede (hasta juntarla hipotecando)', () => {
  let room = game();
  me(room, 'a').cash = 50;
  room = roll(room, 'a', 1, 2);
  rejects(room, 'a', { type: 'buy' });
  own(room, 'a', 5); // una estación para hipotecar
  room = act(room, 'a', { type: 'mortgage', pos: 5 });
  assert.equal(me(room, 'a').cash, 150);
  room = act(room, 'a', { type: 'buy' });
  assert.equal(me(room, 'a').cash, 90);
});

test('alquiler: se le paga al dueño; el doble si tiene toda la tanda sin casas', () => {
  let room = game();
  own(room, 'b', 3);
  room = roll(room, 'a', 1, 2); // cae en Barracas (3), alquiler 4
  assert.equal(me(room, 'a').cash, 1496);
  assert.equal(me(room, 'b').cash, 1504);
  assert.equal(room.step, 'act');

  room = game();
  own(room, 'b', 1, 3);
  assert.equal(rentFor(room, 3), 8); // toda la tanda: el doble
  room.props[3].h = 1;
  assert.equal(rentFor(room, 3), 20);
  room.props[3].h = 5;
  assert.equal(rentFor(room, 3), 450);
  room.props[3].m = 1;
  assert.equal(rentFor(room, 3), 0, 'hipotecada no cobra');
});

test('alquiler: estaciones (25/50/100/200) y compañías (4× o 10× los dados)', () => {
  const room = game();
  own(room, 'b', 5);
  assert.equal(rentFor(room, 5), 25);
  own(room, 'b', 15);
  assert.equal(rentFor(room, 5), 50);
  own(room, 'b', 25, 35);
  assert.equal(rentFor(room, 5), 200);
  own(room, 'b', 12);
  assert.equal(rentFor(room, 12, 7), 28);
  own(room, 'b', 28);
  assert.equal(rentFor(room, 12, 7), 70);
});

test('alquiler: caer en una compañía paga según los dados que sacó', () => {
  let room = game();
  own(room, 'b', 12);
  me(room, 'a').pos = 5;
  room = roll(room, 'a', 3, 4); // 5 + 7 = 12
  assert.equal(me(room, 'a').cash, 1500 - 28);
});

test('alquiler: en tu propia propiedad o en una hipotecada no se paga', () => {
  let room = game();
  own(room, 'a', 3);
  room = roll(room, 'a', 1, 2);
  assert.equal(me(room, 'a').cash, 1500);
  room = game();
  own(room, 'b', 3);
  room.props[3].m = 1;
  room = roll(room, 'a', 1, 2);
  assert.equal(me(room, 'a').cash, 1500);
});

test('impuestos: van al banco, o al pozo si está la opción del Descanso', () => {
  let room = game();
  me(room, 'a').pos = 1;
  room = roll(room, 'a', 1, 2); // → 4, Impuesto a las Ganancias
  assert.equal(me(room, 'a').cash, 1300);
  assert.equal(room.pot, 0);

  room = game(3, { freeParking: true });
  me(room, 'a').pos = 1;
  room = roll(room, 'a', 1, 2);
  assert.equal(room.pot, 200);
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  me(room, 'b').pos = 15;
  room = roll(room, 'b', 2, 3); // → 20, Descanso: se lleva el pozo
  assert.equal(me(room, 'b').cash, 1500 + 200);
  assert.equal(room.pot, 0);
});

// ─── Dobles y cárcel ─────────────────────────────────────────────────────────
test('dobles: tira otra vez; al tercer doble seguido, a la cárcel', () => {
  let room = game();
  room = roll(room, 'a', 2, 2); // pos 4: impuesto
  assert.equal(room.step, 'roll');
  assert.equal(room.doubles, 1);
  room = roll(room, 'a', 3, 3); // pos 10: de visita en la cárcel
  assert.equal(room.doubles, 2);
  assert.equal(room.step, 'roll');
  assert.equal(me(room, 'a').jail, 0);
  room = roll(room, 'a', 1, 1);
  assert.equal(me(room, 'a').pos, 10);
  assert.equal(me(room, 'a').jail, 1);
  assert.equal(room.step, 'act');
  assert.equal(room.doubles, 0);
  assert.equal(me(room, 'a').cash, 1300, 'no cobró la Salida ni pagó nada más que el impuesto');
});

test('dobles: un doble que cae en una propiedad la ofrece y después vuelve a tirar', () => {
  let room = game();
  me(room, 'a').pos = 4;
  room = roll(room, 'a', 1, 1); // pos 6, Parque Patricios
  assert.equal(room.step, 'buy');
  room = act(room, 'a', { type: 'buy' });
  assert.equal(room.step, 'roll');
  rejects(room, 'a', { type: 'endTurn', turn: room.turnNo });
});

test('«Andá a la cárcel»: va directo, sin cobrar la Salida', () => {
  let room = game();
  me(room, 'a').pos = 25;
  room = roll(room, 'a', 2, 3);
  assert.equal(me(room, 'a').pos, 10);
  assert.equal(me(room, 'a').jail, 1);
  assert.equal(me(room, 'a').cash, 1500);
  assert.equal(room.step, 'act');
});

test('cárcel: se sale pagando $50, con la carta, o sacando dobles; a la tercera hay que pagar', () => {
  let room = game();
  me(room, 'a').jail = 1;
  me(room, 'a').pos = 10;
  // pagar y tirar normal
  let r = act(room, 'a', { type: 'payBail' });
  assert.equal(me(r, 'a').cash, 1450);
  assert.equal(me(r, 'a').jail, 0);
  assert.equal(r.step, 'roll');
  r = roll(r, 'a', 1, 2);
  assert.equal(me(r, 'a').pos, 13);
  // con la carta
  room.deck.chest = room.deck.chest.filter((i) => i !== 4); // la carta de salir gratis la tiene a
  me(room, 'a').jf = ['chest'];
  r = act(room, 'a', { type: 'useCard' });
  assert.equal(me(r, 'a').jail, 0);
  assert.deepEqual(me(r, 'a').jf, []);
  assert.equal(r.deck.chest.length, 16, 'la carta vuelve al mazo');
  // dobles: sale, mueve, pero no tira de nuevo
  r = roll(room, 'a', 2, 2);
  assert.equal(me(r, 'a').jail, 0);
  assert.equal(me(r, 'a').pos, 14);
  assert.equal(r.step, 'buy');
  r = act(r, 'a', { type: 'buy' });
  assert.equal(r.step, 'act', 'sin tirada extra');
  // sin dobles: se queda
  r = roll(room, 'a', 1, 2);
  assert.equal(me(r, 'a').jail, 2);
  assert.equal(me(r, 'a').pos, 10);
  assert.equal(r.step, 'act');
  // tercera vez sin dobles: paga $50 y mueve
  me(room, 'a').jail = 3;
  r = roll(room, 'a', 1, 2);
  assert.equal(me(r, 'a').jail, 0);
  assert.equal(me(r, 'a').cash, 1450);
  assert.equal(me(r, 'a').pos, 13);
});

test('cárcel: en la cárcel igual se cobran alquileres, y no se puede pagar la fianza sin plata', () => {
  let room = game();
  me(room, 'a').jail = 1;
  me(room, 'a').pos = 10;
  me(room, 'a').cash = 40;
  rejects(room, 'a', { type: 'payBail' });
  rejects(room, 'a', { type: 'useCard' });
  own(room, 'a', 11);
  me(room, 'b').pos = 5;
  room.current = 'b';
  room = roll(room, 'b', 3, 3);
  assert.equal(me(room, 'b').pos, 11);
  assert.equal(me(room, 'a').cash, 40 + 10);
});

// ─── Cartas ──────────────────────────────────────────────────────────────────
function withCard(kind, text, pos, id = 'a') {
  const room = game();
  const idx = CARDS[kind].findIndex((c) => c.text.startsWith(text));
  assert.ok(idx >= 0, text);
  room.deck[kind] = [idx, ...room.deck[kind].filter((i) => i !== idx)];
  me(room, id).pos = pos;
  return room;
}

test('cartas: cobrar y pagar al banco; la carta vuelve al fondo del mazo', () => {
  let room = withCard('chance', 'El banco te paga dividendos', 0);
  room = roll(room, 'a', 3, 4); // pos 7: Suerte
  assert.equal(me(room, 'a').cash, 1550);
  assert.equal(room.card.d, 'chance');
  assert.equal(room.deck.chance.length, 16);
  assert.equal(room.deck.chance.at(-1), room.card.i);

  room = withCard('chance', 'Multa por exceso', 0);
  room = roll(room, 'a', 3, 4);
  assert.equal(me(room, 'a').cash, 1485);
});

test('cartas: avanzar hasta un casillero cobra la Salida si pasa por ella', () => {
  let room = withCard('chance', 'Avanzá hasta Núñez', 0);
  room = roll(room, 'a', 3, 4); // Suerte en 7 → Núñez (24), sin pasar por la Salida
  assert.equal(me(room, 'a').pos, 24);
  assert.equal(me(room, 'a').cash, 1500);
  assert.equal(room.step, 'buy');

  room = withCard('chance', 'Avanzá hasta Núñez', 36);
  room = roll(room, 'a', 5, 6 - 0 - 0 === 6 ? 6 : 6); // 36 + 11 = 47 → 7
  assert.equal(me(room, 'a').pos, 24);
  assert.equal(me(room, 'a').cash, 1700, 'pasó por la Salida');
});

test('cartas: la estación más cercana cobra el doble; la compañía, 10× los dados', () => {
  let room = withCard('chance', 'Avanzá hasta la estación más cercana', 0);
  own(room, 'b', 15);
  room = roll(room, 'a', 3, 4); // Suerte en 7 → estación más cercana: Constitución (15)
  assert.equal(me(room, 'a').pos, 15);
  assert.equal(me(room, 'a').cash, 1500 - 50, 'alquiler de 1 estación (25) × 2');
  assert.equal(me(room, 'b').cash, 1550);

  room = withCard('chance', 'Avanzá hasta la compañía más cercana', 0);
  own(room, 'b', 12);
  room = roll(room, 'a', 3, 4);
  assert.equal(me(room, 'a').pos, 12);
  const paid = 1500 - me(room, 'a').cash;
  assert.ok(paid >= 20 && paid <= 120 && paid % 10 === 0, `pagó ${paid}`);
});

test('cartas: retroceder 3 y volver a resolver el casillero', () => {
  let room = withCard('chance', 'Retrocedé 3', 0);
  room = roll(room, 'a', 3, 4); // 7 → 4: Impuesto a las Ganancias
  assert.equal(me(room, 'a').pos, 4);
  assert.equal(me(room, 'a').cash, 1300);
});

test('cartas: a la cárcel desde una carta; «Salir gratis» se la guarda el jugador', () => {
  let room = withCard('chance', 'Andá directo a la cárcel', 0);
  room = roll(room, 'a', 3, 4);
  assert.equal(me(room, 'a').pos, 10);
  assert.equal(me(room, 'a').jail, 1);

  room = withCard('chance', 'Salí gratis', 0);
  room = roll(room, 'a', 3, 4);
  assert.deepEqual(me(room, 'a').jf, ['chance']);
  assert.equal(room.deck.chance.length, 15, 'sale del mazo mientras la tiene alguien');
});

test('cartas: reparaciones por casa y hotel', () => {
  let room = withCard('chance', 'Arreglos en tus edificios', 0);
  own(room, 'a', 1, 3);
  room.props[1].h = 2;
  room.props[3].h = 5;
  room = roll(room, 'a', 3, 4);
  assert.equal(me(room, 'a').cash, 1500 - (2 * 25 + 100));
});

test('cartas: pagarle a cada jugador / cobrarle a cada jugador', () => {
  let room = withCard('chance', 'Te eligieron presidente', 0);
  room = roll(room, 'a', 3, 4);
  assert.equal(me(room, 'a').cash, 1400);
  assert.equal(me(room, 'b').cash, 1550);
  assert.equal(me(room, 'c').cash, 1550);

});

test('cartas: el cumpleaños le cobra $10 a cada uno', () => {
  let room = withCard('chest', 'Es tu cumpleaños', 0);
  room = roll(room, 'a', 1, 1); // pos 2: Caja comunal
  assert.equal(me(room, 'a').cash, 1520);
  assert.equal(me(room, 'b').cash, 1490);
  assert.equal(me(room, 'c').cash, 1490);
  assert.equal(room.step, 'roll', 'era un doble');
});

// ─── Deudas ──────────────────────────────────────────────────────────────────
test('deuda: sin plata para el alquiler queda una deuda que frena todo hasta pagarla', () => {
  let room = game();
  own(room, 'b', 3);
  me(room, 'a').cash = 2;
  room = roll(room, 'a', 1, 2);
  assert.equal(debtTotal(room, 'a'), 4);
  assert.equal(me(room, 'a').cash, 2);
  rejects(room, 'a', { type: 'endTurn', turn: room.turnNo });
  rejects(room, 'a', { type: 'payDebt' });
});

test('deuda: se paga hipotecando; si no alcanza ni vendiendo todo, se puede declarar la quiebra', () => {
  let room = game();
  own(room, 'b', 3);
  own(room, 'a', 5);
  me(room, 'a').cash = 2;
  room = roll(room, 'a', 1, 2);
  assert.equal(debtTotal(room, 'a'), 4);
  rejects(room, 'a', { type: 'bankrupt' }); // hipotecando la estación junta $100
  room = act(room, 'a', { type: 'mortgage', pos: 5 });
  room = act(room, 'a', { type: 'payDebt' });
  assert.equal(me(room, 'a').cash, 2 + 100 - 4);
  assert.equal(me(room, 'b').cash, 1504);
  assert.equal(room.debts.length, 0);
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
});

test('quiebra contra otro jugador: se queda con todo; las hipotecadas siguen hipotecadas', () => {
  let room = game();
  own(room, 'b', 3);
  own(room, 'a', 5, 6);
  room.props[6].m = 1;
  room.props[5].m = 1;
  me(room, 'a').cash = 1;
  me(room, 'a').jf = ['chest'];
  room.deck.chest = room.deck.chest.filter((i) => i !== 4);
  room.props[3].h = 5;
  room = roll(room, 'a', 1, 2); // alquiler del hotel: $450
  assert.equal(debtTotal(room, 'a'), 450);
  room = act(room, 'a', { type: 'bankrupt' });
  assert.ok(me(room, 'a').out);
  assert.equal(room.props[5].o, 'b');
  assert.equal(room.props[6].o, 'b');
  assert.equal(room.props[6].m, 1);
  assert.deepEqual(me(room, 'b').jf, ['chest']);
  assert.equal(me(room, 'b').cash, 1500 + 1 - 10 - 5, 'recibe la plata y paga el 10 % de las dos hipotecas ($100 y $50)');
});

test('quiebra: la partida sigue con el siguiente; gana el último que queda', () => {
  let room = game(2);
  own(room, 'b', 3);
  me(room, 'a').cash = 1;
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'bankrupt' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'b');
  assert.deepEqual(room.eliminated, ['a']);
  assert.equal(me(room, 'b').wins, 1);
});

test('quiebra contra el banco: sus propiedades se subastan una por una', () => {
  let room = game(3);
  me(room, 'a').cash = 1;
  me(room, 'a').pos = 0;
  own(room, 'a', 1, 6);
  room = roll(room, 'a', 1, 3); // pos 4: impuesto $200 al banco
  assert.equal(debtTotal(room, 'a'), 200);
  assert.equal(liquidation(room, 'a'), 1 + 30 + 50);
  room = act(room, 'a', { type: 'bankrupt' });
  assert.ok(me(room, 'a').out);
  assert.equal(room.step, 'auction');
  assert.equal(room.auction.pos, 1);
  assert.deepEqual(room.queue, [6]);
  assert.equal(room.props[1], undefined, 'vuelve al banco sin hipoteca');
  assert.equal(room.current, 'b');
  // la primera sale a $50 (el otro se baja), la segunda se queda sin comprador
  room = act(room, 'b', { type: 'bid', amount: 50 });
  room = act(room, 'c', { type: 'passBid' });
  assert.equal(room.props[1].o, 'b');
  assert.equal(room.auction.pos, 6);
  assert.equal(room.auction.deadline, NOW + AUCTION_OPEN_MS, 'la segunda subasta arranca con su reloj');
  room = act(room, 'b', { type: 'passBid' });
  room = act(room, 'c', { type: 'passBid' });
  assert.equal(room.auction, null);
  assert.equal(room.step, 'roll');
  assert.equal(room.current, 'b');
  assert.equal(room.props[6], undefined);
});

// ─── Subasta ─────────────────────────────────────────────────────────────────
test('subasta: no comprar abre una subasta; gana la oferta más alta y paga lo ofrecido', () => {
  let room = game();
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  assert.equal(room.step, 'auction');
  assert.equal(room.auction.pos, 3);
  assert.deepEqual(room.auction.order, ['b', 'c', 'a']);
  assert.equal(room.auction.deadline, NOW + AUCTION_OPEN_MS, 'hay un rato para la primera oferta');
  rejects(room, 'b', { type: 'bid', amount: 0 });
  rejects(room, 'b', { type: 'bid', amount: 49 });   // se empieza en $50
  rejects(room, 'b', { type: 'bid', amount: 2000 }); // más de lo que tiene
  // Es en vivo: ofrece cualquiera de los que siguen en carrera, sin esperar turno.
  room = act(room, 'a', { type: 'bid', amount: 50 }, { now: NOW + 4000 });
  assert.equal(room.auction.deadline, NOW + 4000 + AUCTION_BID_MS, 'cada oferta vuelve a poner el reloj');
  rejects(room, 'a', { type: 'bid', amount: 100 });  // el que va ganando no se sube a sí mismo
  rejects(room, 'a', { type: 'passBid' });           // ni se baja
  rejects(room, 'c', { type: 'bid', amount: 99 });   // hay que subir de a $50 como mínimo
  room = act(room, 'c', { type: 'bid', amount: 100 });
  room = act(room, 'b', { type: 'passBid' });
  rejects(room, 'b', { type: 'bid', amount: 300 });  // el que se bajó ya no ofrece
  assert.equal(room.step, 'auction', 'sigue mientras haya alguien que pueda superar la oferta');
  room = act(room, 'a', { type: 'passBid' });
  assert.equal(room.auction, null, 'se bajaron todos menos el que va ganando: se cierra sin esperar el reloj');
  assert.deepEqual(room.props[3], { o: 'c', h: 0, m: 0 });
  assert.equal(me(room, 'c').cash, 1400);
  assert.equal(room.step, 'act');
  assert.equal(room.current, 'a');
});

test('subasta: si nadie ofrece, la propiedad queda sin dueño', () => {
  let room = game();
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  room = act(room, 'b', { type: 'passBid' });
  room = act(room, 'c', { type: 'passBid' });
  assert.equal(room.step, 'auction', 'el último que queda decide');
  room = act(room, 'a', { type: 'passBid' });
  assert.equal(room.auction, null);
  assert.equal(room.props[3], undefined);
  assert.equal(room.step, 'act');
});

test('subasta: cuando se acaba el reloj se la lleva la oferta más alta, o nadie si no hubo ofertas', () => {
  let room = game();
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  rejects(room, 'b', { type: 'auctionEnd' }, { now: NOW + AUCTION_OPEN_MS - 1 }); // todavía hay tiempo
  rejects(room, 'zz', { type: 'auctionEnd' }, { now: NOW + AUCTION_OPEN_MS });   // alguien de afuera no
  const nobody = act(room, 'c', { type: 'auctionEnd' }, { now: NOW + AUCTION_OPEN_MS });
  assert.equal(nobody.auction, null);
  assert.equal(nobody.props[3], undefined);
  assert.equal(nobody.log.at(-1).k, 'unsold');
  assert.equal(nobody.step, 'act');
  // Con una oferta: el reloj corre desde la oferta y, al terminar, la propiedad es del que ofreció.
  room = act(room, 'b', { type: 'bid', amount: 150 }, { now: NOW + 9000 });
  rejects(room, 'a', { type: 'auctionEnd' }, { now: NOW + 9000 + AUCTION_BID_MS - 1 }); // el reloj lo movió la oferta
  room = act(room, 'a', { type: 'auctionEnd' }, { now: NOW + 9000 + AUCTION_BID_MS });
  assert.deepEqual(room.props[3], { o: 'b', h: 0, m: 0 });
  assert.equal(me(room, 'b').cash, 1350);
  assert.equal(room.step, 'act');
  rejects(room, 'a', { type: 'auctionEnd' }, { now: NOW + 99999 }); // ya no hay subasta
});

test('subasta: si el que va ganando se va, la oferta se anula y la subasta sigue', () => {
  let room = game();
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  room = act(room, 'b', { type: 'bid', amount: 200 });
  room = act(room, 'b', { type: 'leave' });
  assert.equal(room.auction.pos, 3);
  assert.equal(room.auction.bid, 0);
  assert.equal(room.auction.bidder, null);
  assert.deepEqual(room.auction.active, ['c', 'a']);
  room = act(room, 'c', { type: 'bid', amount: 50 });
  room = act(room, 'a', { type: 'passBid' });
  assert.equal(room.props[3].o, 'c');
});

test('subasta: al retomar una partida guardada el reloj arranca de nuevo', () => {
  let room = game();
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  room = act(room, 'b', { type: 'bid', amount: 50 });
  const { room: saved } = roomFromSave(room, 'a', NOW + 500000);
  assert.equal(saved.auction.deadline, 0);
  let back = act(saved, 'tmpb', { type: 'join', name: 'Otra', avatar: '🦊' }, { now: NOW + 500000 });
  back = act(back, 'tmpb', { type: 'claim', seat: 'b' }, { now: NOW + 500000 });
  back = act(back, 'a', { type: 'resumeStart' }, { now: NOW + 600000 });
  assert.equal(back.phase, 'playing');
  assert.equal(back.auction.deadline, NOW + 600000 + AUCTION_OPEN_MS);
});

// ─── Fichas ──────────────────────────────────────────────────────────────────
test('fichas: en una sala no se repiten; si la que pedís está ocupada te toca otra libre', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  room = act(room, 'b', { type: 'join', name: 'Beto', avatar: '🦊' });
  assert.equal(me(room, 'b').avatar, '🦊', 'si está libre, es la que pidió');
  room = act(room, 'c', { type: 'join', name: 'Caro', avatar: '🐸' }, { rand: () => 0 });
  assert.equal(me(room, 'c').avatar, '🐼', 'la primera libre de la lista (rand = 0)');
  room = act(room, 'd', { type: 'join', name: 'Dani' }, { rand: () => 0.999 });
  assert.equal(me(room, 'd').avatar, '🤖', 'sin pedir ninguna: una libre al azar');
  // Los bots tampoco repiten.
  for (let i = 0; i < 4; i++) room = act(room, 'a', { type: 'addBot', botId: `bot-x${i}yz`, name: `Bot ${i}` });
  const all = room.players.map((p) => p.avatar);
  assert.equal(new Set(all).size, MAX_PLAYERS);
  assert.ok(all.every((t) => TOKENS.includes(t)));
  // Volver a entrar con una ficha ocupada no pisa la de otro.
  room = act(room, 'b', { type: 'join', name: 'Beto', avatar: '🐸' });
  assert.equal(me(room, 'b').avatar, '🦊');
});

test('fichas: en la sala de espera cada uno elige la suya entre las libres', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  room = act(room, 'b', { type: 'join', name: 'Beto', avatar: '🦊' });
  rejects(room, 'b', { type: 'setAvatar', avatar: '🐸' });  // la tiene Ana
  rejects(room, 'b', { type: 'setAvatar', avatar: '💩' });  // no es una ficha
  rejects(room, 'zz', { type: 'setAvatar', avatar: '🐢' }); // no está en la sala
  room = act(room, 'b', { type: 'setAvatar', avatar: '🐢' });
  assert.equal(me(room, 'b').avatar, '🐢');
  room = act(room, 'a', { type: 'setAvatar', avatar: '🦊' }); // la que soltó Beto
  room = act(room, 'a', { type: 'start' });
  rejects(room, 'a', { type: 'setAvatar', avatar: '🐼' });  // con la partida empezada, no
});

test('subasta: con la opción apagada, no comprar deja la propiedad libre', () => {
  let room = game(3, { auctionChance: 0 });
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  assert.equal(room.step, 'act');
  assert.equal(room.auction, null);
});

test('subasta: tras un doble, el turno vuelve a quien tiró', () => {
  let room = game();
  me(room, 'a').pos = 4;
  room = roll(room, 'a', 1, 1); // pos 6
  room = act(room, 'a', { type: 'declineBuy' });
  room = act(room, 'b', { type: 'bid', amount: 50 });
  room = act(room, 'c', { type: 'passBid' });
  room = act(room, 'a', { type: 'passBid' });
  assert.equal(room.props[6].o, 'b');
  assert.equal(room.step, 'roll');
  assert.equal(room.current, 'a');
});

// ─── Construir, vender, hipotecar ────────────────────────────────────────────
test('construir: hace falta toda la tanda, parejo, y cuesta lo que dice el color', () => {
  let room = game();
  own(room, 'a', 1);
  assert.match(buildProblem(room, 'a', 1), /Necesitás las 2 calles/);
  own(room, 'a', 3);
  assert.equal(buildProblem(room, 'a', 1), null);
  room = act(room, 'a', { type: 'build', pos: 1 });
  assert.equal(room.props[1].h, 1);
  assert.equal(me(room, 'a').cash, 1450);
  assert.match(buildProblem(room, 'a', 1), /parejo/);
  rejects(room, 'a', { type: 'build', pos: 1 });
  room = act(room, 'a', { type: 'build', pos: 3 });
  for (let i = 0; i < 3; i++) { room = act(room, 'a', { type: 'build', pos: 1 }); room = act(room, 'a', { type: 'build', pos: 3 }); }
  assert.equal(room.props[1].h, 4);
  room = act(room, 'a', { type: 'build', pos: 1 });
  assert.equal(room.props[1].h, 5, 'hotel');
  assert.match(buildProblem(room, 'a', 1), /hotel/);
  assert.equal(me(room, 'a').cash, 1500 - 50 * 9);
});

test('construir: no en turno ajeno, ni hipotecada la tanda, ni sin plata', () => {
  let room = game();
  own(room, 'b', 1, 3);
  rejects(room, 'b', { type: 'build', pos: 1 }); // no es su turno
  own(room, 'a', 1, 3);
  room.props[3].m = 1;
  assert.match(buildProblem(room, 'a', 1), /hipotecada/);
  room.props[3].m = 0;
  me(room, 'a').cash = 49;
  assert.match(buildProblem(room, 'a', 1), /faltan \$1/);
});

test('construir: el banco tiene 32 casas y 12 hoteles', () => {
  let room = game();
  own(room, 'a', 1, 3);
  own(room, 'b', 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29);
  for (const pos of [6, 8, 9, 11, 13, 14, 16, 18, 19, 21]) room.props[pos].h = 3; // 30 casas
  room.props[23].h = 2; // 32
  assert.match(buildProblem(room, 'a', 1), /sin casas/);
});

test('vender edificios: parejo y a la mitad de lo que costaron; el hotel vuelve a 4 casas', () => {
  let room = game();
  own(room, 'a', 1, 3);
  room.props[1].h = 2;
  room.props[3].h = 2;
  room = act(room, 'a', { type: 'sellBuilding', pos: 1 });
  assert.equal(me(room, 'a').cash, 1525);
  rejects(room, 'a', { type: 'sellBuilding', pos: 1 }); // la otra tiene más
  room.props[3].h = 5;
  room = act(room, 'a', { type: 'sellBuilding', pos: 3 });
  assert.equal(room.props[3].h, 4);
});

test('hipotecar: da la mitad; con edificios en el color hay que venderlos antes; levantarla cuesta 10 % más', () => {
  let room = game();
  own(room, 'a', 1, 3);
  room.props[3].h = 1;
  rejects(room, 'a', { type: 'mortgage', pos: 1 });
  room.props[3].h = 0;
  room = act(room, 'a', { type: 'mortgage', pos: 1 });
  assert.equal(me(room, 'a').cash, 1530);
  assert.equal(room.props[1].m, 1);
  rejects(room, 'a', { type: 'mortgage', pos: 1 });
  rejects(room, 'b', { type: 'unmortgage', pos: 1 });
  room = act(room, 'a', { type: 'unmortgage', pos: 1 });
  assert.equal(me(room, 'a').cash, 1530 - 33);
  assert.equal(room.props[1].m, 0);
});

test('hipotecar: se puede en cualquier momento, aunque no sea tu turno', () => {
  let room = game();
  own(room, 'b', 5);
  room = act(room, 'b', { type: 'mortgage', pos: 5 });
  assert.equal(me(room, 'b').cash, 1600);
});

// ─── Tratos ──────────────────────────────────────────────────────────────────
const offer = (give = {}, take = {}) => ({ type: 'tradeOffer', to: 'b', give: { cash: 0, props: [], cards: 0, ...give }, take: { cash: 0, props: [], cards: 0, ...take } });

test('trato: se ofrece, el otro acepta y se intercambian propiedades y plata', () => {
  let room = game();
  own(room, 'a', 1);
  own(room, 'b', 3);
  room = act(room, 'a', offer({ props: [1], cash: 100 }, { props: [3] }));
  assert.ok(room.trade);
  rejects(room, 'c', { type: 'tradeAccept' });
  rejects(room, 'a', { type: 'tradeAccept' });
  rejects(room, 'c', offer({ cash: 5 })); // ya hay uno abierto
  room = act(room, 'b', { type: 'tradeAccept' });
  assert.equal(room.trade, null);
  assert.equal(room.props[1].o, 'b');
  assert.equal(room.props[3].o, 'a');
  assert.equal(me(room, 'a').cash, 1400);
  assert.equal(me(room, 'b').cash, 1600);
});

test('trato: se puede rechazar o cancelar; no vale lo que no tenés ni propiedades con edificios', () => {
  let room = game();
  own(room, 'a', 1, 3);
  own(room, 'b', 6);
  rejects(room, 'a', offer({ props: [6] })); // no es suya
  rejects(room, 'a', offer({ cash: 5000 }));
  rejects(room, 'a', offer()); // vacío
  rejects(room, 'a', { ...offer({ cash: 5 }), to: 'a' }); // con uno mismo
  rejects(room, 'a', offer({ cards: 1 })); // no tiene la carta
  room.props[1].h = 1;
  rejects(room, 'a', offer({ props: [3] })); // hay edificios en su color
  room.props[1].h = 0;
  room = act(room, 'a', offer({ props: [1] }, { cash: 10 }));
  room = act(room, 'b', { type: 'tradeDecline' });
  assert.equal(room.trade, null);
  room = act(room, 'a', offer({ props: [1] }));
  room = act(room, 'a', { type: 'tradeCancel' });
  assert.equal(room.trade, null);
});

test('trato: las hipotecadas pasan con el 10 % de la hipoteca para el que las recibe; se vende la carta de la cárcel', () => {
  let room = game();
  own(room, 'a', 39);
  room.props[39].m = 1;
  me(room, 'b').jf = ['chance'];
  room = act(room, 'a', offer({ props: [39] }, { cash: 300, cards: 1 }));
  room = act(room, 'b', { type: 'tradeAccept' });
  assert.equal(room.props[39].o, 'b');
  assert.equal(room.props[39].m, 1);
  assert.equal(me(room, 'b').cash, 1500 - 300 - 20);
  assert.equal(me(room, 'a').cash, 1800);
  assert.deepEqual(me(room, 'a').jf, ['chance']);
  assert.deepEqual(me(room, 'b').jf, []);
});

test('trato: si cambió algo antes de aceptar, no se puede aceptar', () => {
  let room = game();
  own(room, 'a', 1);
  room = act(room, 'a', offer({ props: [1] }));
  room.props[1].o = 'c';
  rejects(room, 'b', { type: 'tradeAccept' });
});

test('trato: no mientras se subasta', () => {
  let room = game();
  own(room, 'b', 5);
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' });
  rejects(room, 'b', { ...offer({ cash: 5 }), to: 'c' });
});

test('trato: el que recibe la oferta puede contestar con una contraoferta, que reemplaza a la original', () => {
  let room = game();
  own(room, 'a', 1);
  own(room, 'b', 3);
  room = act(room, 'a', offer({ props: [1] }, { props: [3] }));
  const back = (give = {}, take = {}) => ({ ...offer(give, take), to: 'a' });
  rejects(room, 'c', back({ cash: 5 }));               // un tercero no puede meterse
  rejects(room, 'a', offer({ cash: 5 }));              // ni el que propuso mandar otra encima
  rejects(room, 'b', { ...offer({ cash: 5 }), to: 'c' }); // ni contestarle a otro
  rejects(room, 'b', back({ props: [1] }));            // una contraoferta inválida no pasa…
  assert.deepEqual(room.trade.give.props, [1], '…y la original sigue en pie');
  room = act(room, 'b', back({ props: [3] }, { props: [1], cash: 50 }));
  assert.deepEqual(room.trade, { from: 'b', to: 'a', give: { cash: 0, cards: 0, props: [3] }, take: { cash: 50, cards: 0, props: [1] }, counter: true });
  assert.deepEqual(room.log.at(-1), { k: 'counter', p: 'b', o: 'a' });
  assert.equal(describe(room.log.at(-1), room).text, 'Jb le hizo una contraoferta a Ana.');
  assert.equal(announce(room.log.at(-1), room, 'a').text, 'Jb te hizo una contraoferta.');
  assert.equal(announce(room.log.at(-1), room, 'b'), null);
  rejects(room, 'b', { type: 'tradeAccept' });         // ahora le toca contestar al otro
  // Se puede contraofertar de vuelta, y al final se acepta como cualquier trato.
  room = act(room, 'a', offer({ props: [1], cash: 20 }, { props: [3] }));
  assert.equal(room.trade.counter, true);
  room = act(room, 'b', { type: 'tradeAccept' });
  assert.equal(room.trade, null);
  assert.equal(room.props[1].o, 'b');
  assert.equal(room.props[3].o, 'a');
  assert.equal(me(room, 'a').cash, 1480);
  // Con la oferta cerrada, la siguiente es una oferta común.
  room = act(room, 'b', back({ cash: 5 }));
  assert.equal(room.trade.counter, undefined);
  assert.equal(room.log.at(-1).k, 'offer');
});

test('trato: un bot también responde una contraoferta', () => {
  let room = game(2);
  me(room, 'b').bot = true;
  own(room, 'b', 3);
  room.trade = { from: 'b', to: 'a', give: { cash: 0, cards: 0, props: [3] }, take: { cash: 10, cards: 0, props: [] } };
  room = act(room, 'a', { type: 'tradeOffer', to: 'b', give: { cash: 300 }, take: { props: [3] } });
  assert.equal(room.trade.counter, true);
  assert.deepEqual(botMove(room), { botId: 'b', action: { type: 'tradeAccept' } });
});

test('trato: avisa qué tandas arma y cuáles desarma, sin cambiar la sala', () => {
  const room = game();
  own(room, 'a', 1, 6, 8, 9, 5, 15, 25); // La Boca, las tres celestes y tres estaciones
  own(room, 'b', 3, 35, 12);              // Barracas, la cuarta estación y una compañía
  const before = JSON.stringify(room);
  const trade = (give, take) => ({ from: 'a', to: 'b', give: { cash: 0, cards: 0, props: give }, take: { cash: 0, cards: 0, props: take } });
  // a entrega una celeste (desarma la tanda) y recibe Barracas (completa las marrones) y la estación que le faltaba.
  assert.deepEqual(tradeEffects(room, trade([6], [3, 35])), [
    { id: 'a', set: 'lightblue', kind: 'breaks' },
    { id: 'a', set: 'brown', kind: 'completes' },
    { id: 'a', set: 'station', kind: 'completes' },
  ]);
  // Al revés: el que completa es el otro.
  assert.deepEqual(tradeEffects(room, trade([1], [])), [{ id: 'b', set: 'brown', kind: 'completes' }]);
  // Una compañía suelta o pura plata no arman nada.
  assert.deepEqual(tradeEffects(room, trade([], [12])), []);
  assert.deepEqual(tradeEffects(room, trade([], [])), []);
  assert.deepEqual(tradeEffects(room, null), []);
  assert.equal(JSON.stringify(room), before);
});

test('trato: la bitácora cuenta qué se intercambió y los avisos le hablan a cada uno', () => {
  let room = game();
  own(room, 'a', 1);
  own(room, 'b', 3);
  me(room, 'b').jf = ['chance'];
  room = act(room, 'a', offer({ props: [1], cash: 100 }, { props: [3], cards: 1 }));
  assert.equal(announce(room.log.at(-1), room, 'b').text, 'Ana te propone un trato.');
  assert.equal(announce(room.log.at(-1), room, 'a'), null, 'el que propone no necesita el aviso');
  room = act(room, 'b', { type: 'tradeAccept' });
  const entry = room.log.at(-1);
  assert.deepEqual(entry, { k: 'traded', p: 'a', o: 'b', g: { c: 100, s: [1] }, t: { s: [3], j: 1 } });
  assert.equal(describe(entry, room).text, 'Ana y Jb cerraron un trato: Ana dio $100, La Boca; Jb dio Barracas, 1 carta de «Salir de la cárcel».');
  assert.equal(announce(entry, room, 'a').text, '¡Trato cerrado con Jb! Recibís Barracas, 1 carta de «Salir de la cárcel».');
  assert.equal(announce(entry, room, 'b').text, '¡Trato cerrado con Ana! Recibís $100, La Boca.');
  assert.equal(announce(entry, room, 'c').text, describe(entry, room).text);
  // Una entrada de antes (sin el detalle) se sigue leyendo.
  assert.equal(describe({ k: 'traded', p: 'a', o: 'b' }, room).text, 'Ana y Jb cerraron un trato.');
  // Un regalo: un lado va vacío.
  room = act(room, 'a', offer({ cash: 50 }));
  room = act(room, 'b', { type: 'tradeAccept' });
  assert.deepEqual(room.log.at(-1), { k: 'traded', p: 'a', o: 'b', g: { c: 50 }, t: {} });
  assert.match(describe(room.log.at(-1), room).text, /Jb dio nada\.$/);
  // Al que le rechazan el trato se le avisa en rojo.
  room = act(room, 'a', offer({ cash: 5 }));
  room = act(room, 'b', { type: 'tradeDecline' });
  assert.deepEqual(announce(room.log.at(-1), room, 'a'), { icon: '🚫', text: 'Jb rechazó tu trato.', tone: 'loss' });
  assert.equal(announce(room.log.at(-1), room, 'b'), null);
});

// ─── Salir, expulsar, volver ─────────────────────────────────────────────────
test('salirse en plena partida: pierde todo contra el banco y el turno sigue', () => {
  let room = game(3);
  own(room, 'a', 3);
  room = act(room, 'a', { type: 'leave' });
  assert.equal(me(room, 'a').left, true);
  assert.equal(me(room, 'a').out, true);
  assert.equal(room.current, 'b');
  assert.equal(room.step, 'auction', 'su propiedad se subasta');
  assert.equal(room.phase, 'playing');
  room = act(room, 'b', { type: 'leave' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'c');
});

test('el anfitrión puede sacar a alguien en plena partida; no vuelve a entrar', () => {
  let room = game(3);
  room = act(room, 'a', { type: 'kick', target: 'c' });
  assert.ok(me(room, 'c').out);
  assert.deepEqual(room.kicked, ['c']);
  rejects(room, 'b', { type: 'kick', target: 'a' });
});

test('si el anfitrión se va, otro pasa a serlo', () => {
  let room = game(3);
  room = act(room, 'a', { type: 'leave' });
  assert.notEqual(room.hostId, 'a');
  assert.ok(!me(room, room.hostId).out);
});

test('otra partida y volver a la sala: se reinicia todo menos las victorias', () => {
  let room = game(2);
  own(room, 'b', 3);
  me(room, 'a').cash = 1;
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'bankrupt' });
  assert.equal(room.phase, 'ended');
  rejects(room, 'b', { type: 'start' });
  const again = act(room, 'a', { type: 'start' }); // el anfitrión (a se fue a la quiebra pero sigue en la sala)
  assert.equal(again.phase, 'playing');
  assert.deepEqual(again.props, {});
  assert.ok(again.players.every((p) => p.cash === 1500 && !p.out));
  assert.equal(again.players.find((p) => p.id === 'b').wins, 1);
  const lobby = act(room, 'a', { type: 'toLobby' });
  assert.equal(lobby.phase, 'lobby');
  assert.equal(lobby.log.length, 0);
});

// ─── Tamaños y red ───────────────────────────────────────────────────────────
test('la sala del peor caso entra en el tope de 30.000 caracteres', () => {
  let room = newRoom(makeId(), 'N'.repeat(20), '🐸', NOW);
  for (let i = 1; i < MAX_PLAYERS; i++) room = applyAction(room, { type: 'join', playerId: makeId(), name: 'N'.repeat(20), avatar: '🦖' }, { now: NOW });
  room = applyAction(room, { type: 'start', playerId: room.hostId }, { now: NOW, rand: Math.random });
  const owners = room.players.map((p) => p.id);
  let i = 0;
  for (const [pos, s] of SQUARES.entries()) {
    if (!['street', 'station', 'utility'].includes(s.t)) continue;
    room.props[pos] = { o: owners[i++ % owners.length], h: s.t === 'street' ? 5 : 0, m: i % 3 === 0 ? 1 : 0 };
  }
  for (let k = 0; k < MAX_LOG + 10; k++) room.log.push({ k: 'rent', p: owners[0], o: owners[1], s: 39, n: 2000, d: 12 });
  room.log = room.log.slice(-MAX_LOG);
  room.trade = { from: owners[0], to: owners[1], give: { cash: 1500, cards: 1, props: [1, 3, 5, 6, 8, 9, 11, 13, 14, 16, 18, 19] }, take: { cash: 1500, cards: 1, props: [21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39, 12] } };
  room.auction = { pos: 39, bid: 1000, bidder: owners[2], order: owners, active: owners, resume: 'act', deadline: 1700000000000 };
  room.debts = owners.map((id) => ({ from: id, to: owners[0], n: 4000, s: 39 }));
  const size = serializeRoom(room).length;
  assert.ok(size < 12000, `pesa ${size}`);
  assert.equal(writeError(['rooms', 'ABCD'], 'u', serializeRoom(room), null), null);
});

test('portada: la sala se reconoce como Monopoly, con tope de 8', () => {
  const room = newRoom('a', 'Ana', '🐸', NOW);
  const sum = summarizeRoom('ABCD', null, serializeRoom(room));
  assert.equal(sum.game, 'monopoly');
  assert.equal(sum.max, 8);
  assert.equal(sum.host, 'Ana');
});

test('una acción que no es de este juego o de un tipo desconocido se rechaza', () => {
  const room = game();
  assert.equal(applyAction({ ...room, gameType: 'la-mecha' }, { type: 'roll', playerId: 'a', seen: 0 }), null);
  assert.equal(applyAction(room, { type: 'inventada', playerId: 'a' }), null);
  assert.equal(applyAction(null, { type: 'roll' }), null);
  assert.equal(netWorth(room, 'a'), 1500);
  assert.deepEqual(ownedBy(room, 'a'), []);
});

test('una propiedad inexistente o mal escrita no rompe nada: se rechaza', () => {
  const room = game();
  for (const type of ['build', 'sellBuilding', 'mortgage', 'unmortgage']) {
    for (const pos of [-1, 40, 1.5, 'x', undefined, null]) rejects(room, 'a', { type, pos });
  }
  rejects(room, 'a', { type: 'tradeOffer', to: 'zz', give: { cash: 5 }, take: {} });
  rejects(room, 'a', { type: 'bid', amount: 'mucho' });
});

// ─── Subasta con probabilidad ────────────────────────────────────────────────
test('subasta con chances: por defecto es del 50 % y se puede elegir entre 0, 25, 50, 75 y 100', () => {
  const room = newRoom('a', 'Ana', '🐸', NOW);
  assert.equal(room.options.auctionChance, 50);
  let r = act(room, 'a', { type: 'setOptions', options: { auctionChance: 75 } });
  assert.equal(r.options.auctionChance, 75);
  r = act(r, 'a', { type: 'setOptions', options: { auctionChance: 60 } }); // un valor que no está en la lista no cambia nada
  assert.equal(r.options.auctionChance, 75);
});

test('subasta con chances: si el azar cae dentro del porcentaje, se subasta y se anota el porcentaje', () => {
  let room = game(3, { auctionChance: 50 });
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' }, { rand: () => 0.49 });
  assert.equal(room.step, 'auction');
  assert.deepEqual(room.log.findLast((l) => l.k === 'auction'), { k: 'auction', s: 3, c: 50 });
});

test('subasta con chances: si el azar cae afuera, no hay subasta, la propiedad queda libre y se avisa', () => {
  let room = game(3, { auctionChance: 50 });
  room = roll(room, 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' }, { rand: () => 0.5 });
  assert.equal(room.step, 'act');
  assert.equal(room.auction, null);
  assert.equal(room.props[3], undefined);
  assert.deepEqual(room.log.findLast((l) => l.k === 'noauction'), { k: 'noauction', s: 3, c: 50 });
});

test('subasta con chances: al 100 % siempre sale y al 0 % nunca, sin tirar el azar', () => {
  const boom = () => { throw new Error('no debería tirar el azar'); };
  let room = roll(game(3, { auctionChance: 100 }), 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' }, { rand: boom });
  assert.equal(room.step, 'auction');
  room = roll(game(3, { auctionChance: 0 }), 'a', 1, 2);
  room = act(room, 'a', { type: 'declineBuy' }, { rand: boom });
  assert.equal(room.step, 'act');
});

test('subasta con chances: una sala vieja con «auctions» se lee como 100 % o 0 %', () => {
  const room = newRoom('a', 'Ana', '🐸', NOW);
  delete room.options.auctionChance;
  assert.equal(auctionChance({ ...room, options: { ...room.options, auctions: true } }), 100);
  assert.equal(auctionChance({ ...room, options: { ...room.options, auctions: false } }), 0);
});

test('subasta con chances: las propiedades de un quebrado también tiran el azar, una por una', () => {
  let room = game(3, { auctionChance: 50 });
  own(room, 'a', 1, 6);
  room.players.find((p) => p.id === 'a').cash = 0;
  room = roll(room, 'a', 1, 3); // impuesto de $200 al banco: no le alcanza
  room = act(room, 'a', { type: 'bankrupt' }, { rand: (() => { const seq = [0.1, 0.9]; return () => seq.shift(); })() });
  assert.deepEqual(room.queue, [], 'la primera salió a subasta y la segunda no');
  assert.equal(room.auction.pos, 1);
  assert.equal(room.props[6], undefined);
});

// ─── Contador de eventos ─────────────────────────────────────────────────────
test('la bitácora cuenta todo lo que pasó (logN), aunque guarde solo las últimas', () => {
  let room = game(3);
  assert.equal(room.logN, 0);
  room = roll(room, 'a', 1, 2);
  assert.equal(room.logN, room.log.length, 'una entrada por cada cosa: tirada y casillero');
  assert.deepEqual(room.log.map((l) => l.k), ['roll', 'at']);
  assert.deepEqual(room.log[1], { k: 'at', p: 'a', s: 3 });
  for (let i = 0; i < MAX_LOG + 5; i++) room.log.push({ k: 'drop', p: 'a', s: 1 });
  room.logN += MAX_LOG + 5;
  room.log = room.log.slice(-MAX_LOG);
  assert.ok(room.logN > room.log.length);
});

// ─── Guardar y retomar ───────────────────────────────────────────────────────
// Una partida en curso con propiedades, plata y una deuda, lista para guardar.
function midGame() {
  let room = game(3);
  own(room, 'b', 1, 3);
  room = roll(room, 'a', 1, 2); // cae en una propiedad de b (pos 3) y le paga
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  return room;
}

test('guardar: la partida empezada lleva su saveId y se reconoce igual en una sala nueva', () => {
  const room = midGame();
  assert.equal(room.saveId, String(NOW));
  const { room: restored, seatId } = roomFromSave(room, 'b', NOW + 5);
  assert.equal(restored.saveId, room.saveId);
  assert.equal(restored.phase, 'resume');
  assert.equal(seatId, 'b');
  assert.equal(restored.hostId, 'b');
  assert.deepEqual(restored.players.map((p) => !!p.by), [false, true, false]);
  assert.deepEqual(restored.props, room.props);
  assert.equal(restored.current, room.current);
  assert.equal(room.phase, 'playing', 'la original no se toca');
});

test('retomar: nadie juega hasta que el anfitrión retoma, y no se puede empezar de cero por error', () => {
  const { room } = roomFromSave(midGame(), 'b', NOW);
  rejects(room, 'b', { type: 'roll', seen: room.rollN });
  rejects(room, 'b', { type: 'start' });
  rejects(room, 'b', { type: 'resumeStart' }, {}); // solo hay uno sentado
});

test('retomar: cada uno que entra elige su lugar; no se puede tomar uno ocupado ni dos lugares', () => {
  let { room } = roomFromSave(midGame(), 'b', NOW);
  room = act(room, 'tmp1', { type: 'join', name: 'Cami', avatar: '🦊' }); // entra mirando
  assert.equal(room.players.length, 3);
  rejects(room, 'tmp1', { type: 'claim', seat: 'b' }); // ocupado por el anfitrión
  rejects(room, 'tmp1', { type: 'claim', seat: 'zz' });
  room = act(room, 'tmp1', { type: 'claim', seat: 'a' });
  assert.equal(findPlayer(room, 'a').by, 'tmp1');
  rejects(room, 'tmp1', { type: 'claim', seat: 'c' }); // ya tiene un lugar
  rejects(room, 'tmp2', { type: 'claim', seat: 'a' }); // lo tomó otro
});

test('retomar: con al menos dos sentados se retoma, y los lugares libres quiebran contra el banco', () => {
  let { room } = roomFromSave(midGame(), 'b', NOW);
  const before = { cash: findPlayer(room, 'b').cash, current: room.current };
  room = act(room, 'tmp1', { type: 'claim', seat: 'a' });
  rejects(room, 'a', { type: 'resumeStart' }); // solo el anfitrión
  room = act(room, 'b', { type: 'resumeStart' });
  assert.equal(room.phase, 'playing');
  assert.equal(findPlayer(room, 'c').out, true, 'nadie tomó el lugar de c');
  assert.equal(findPlayer(room, 'c').left, true);
  assert.equal(findPlayer(room, 'b').cash, before.cash);
  assert.equal(room.log.at(-2).k === 'resumed' || room.log.some((l) => l.k === 'resumed'), true);
  assert.notEqual(room.current, 'c');
  // y se puede seguir jugando
  const next = room.current;
  room = roll(room, next, 1, 2);
  assert.ok(room.rollN > 0);
});

test('retomar: si el que le tocaba jugar no se sienta, el turno pasa al siguiente', () => {
  const played = midGame();
  played.current = 'c';
  played.step = 'roll';
  let { room } = roomFromSave(played, 'a', NOW);
  room = act(room, 'tmp1', { type: 'claim', seat: 'b' });
  room = act(room, 'a', { type: 'resumeStart' });
  assert.equal(findPlayer(room, 'c').out, true);
  assert.equal(room.step, 'roll');
  assert.ok(['a', 'b'].includes(room.current));
});

test('retomar: soltar el lugar lo deja libre y, si era el anfitrión, el mando pasa a otro sentado', () => {
  let { room } = roomFromSave(midGame(), 'b', NOW);
  room = act(room, 'tmp1', { type: 'claim', seat: 'a' });
  room = act(room, 'b', { type: 'leave' });
  assert.equal(findPlayer(room, 'b').by, null);
  assert.equal(room.hostId, 'a');
  // el primero que se sienta cuando no queda nadie queda de anfitrión
  room = act(room, 'a', { type: 'leave' });
  room = act(room, 'tmp9', { type: 'claim', seat: 'c' });
  assert.equal(room.hostId, 'c');
});

test('retomar: el anfitrión puede liberar un lugar con «sacar»', () => {
  let { room } = roomFromSave(midGame(), 'b', NOW);
  room = act(room, 'tmp1', { type: 'claim', seat: 'a' });
  room = act(room, 'b', { type: 'kick', target: 'a' });
  assert.equal(findPlayer(room, 'a').by, null);
});

test('retomar: los que ya quebraron no tienen lugar para tomar', () => {
  const played = midGame();
  const c = findPlayer(played, 'c');
  c.out = true;
  played.eliminated = ['c'];
  const { room } = roomFromSave(played, 'c', NOW); // el dispositivo era de un jugador que ya no está: retoma el primero que sigue
  assert.notEqual(room.hostId, 'c');
  rejects(room, 'tmp1', { type: 'claim', seat: 'c' });
});

test('retomar: la sala de una partida guardada se lee como Monopoly en la fase «resume»', () => {
  const { room } = roomFromSave(midGame(), 'b', NOW);
  const sum = summarizeRoom('ABCD', null, serializeRoom(room));
  assert.equal(sum.game, 'monopoly');
  assert.equal(sum.phase, 'resume');
  assert.equal(writeError(['rooms', 'ABCD'], 'u', serializeRoom(room), null), null);
});

// ─── Bots ────────────────────────────────────────────────────────────────────
test('bots: solo el anfitrión los agrega, en la sala de espera, con un id válido y hasta el tope', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  rejects(room, 'b', { type: 'addBot', botId: 'bot-abc123', name: 'Bot X' });
  rejects(room, 'a', { type: 'addBot', botId: 'abc123', name: 'Bot X' });
  rejects(room, 'a', { type: 'addBot', botId: 'bot-abc123', name: '' });
  room = act(room, 'a', { type: 'addBot', botId: 'bot-abc123', name: 'Bot Lola' });
  assert.equal(findPlayer(room, 'bot-abc123').bot, true);
  rejects(room, 'a', { type: 'addBot', botId: 'bot-abc123', name: 'Bot Lola' }); // repetido
  for (let i = 0; i < MAX_PLAYERS - 2; i++) room = act(room, 'a', { type: 'addBot', botId: `bot-x${i}yz`, name: `Bot ${i}` });
  assert.equal(room.players.length, MAX_PLAYERS);
  rejects(room, 'a', { type: 'addBot', botId: 'bot-zzzzzz', name: 'Bot de más' });
  room = act(room, 'a', { type: 'start' });
  rejects(room, 'a', { type: 'addBot', botId: 'bot-qqqqqq', name: 'Tarde' });
});

test('bots: el anfitrión puede sacarlos y el mando nunca pasa a un bot', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  room = act(room, 'a', { type: 'addBot', botId: 'bot-abc123', name: 'Bot Lola' });
  room = act(room, 'a', { type: 'kick', target: 'bot-abc123' });
  assert.equal(room.players.length, 1);
  room = act(room, 'a', { type: 'addBot', botId: 'bot-abc123', name: 'Bot Lola' });
  room = act(room, 'b', { type: 'join', name: 'Beto', avatar: '🦊' });
  room = act(room, 'a', { type: 'leave' });
  assert.equal(room.hostId, 'b');
});

test('bots: compra con colchón, rechaza sin plata y se baja de una subasta cara', () => {
  let room = game(2, { auctionChance: 100 });
  room.players[0].bot = true;
  room = roll(room, 'a', 1, 2); // pos 3
  assert.deepEqual(botMove(room), { botId: 'a', action: { type: 'buy' } });
  me(room, 'a').cash = 100;
  assert.deepEqual(botMove(room).action, { type: 'declineBuy' });
  me(room, 'a').cash = 1500;
  room = act(room, 'a', { type: 'declineBuy' });
  room.players[1].bot = true;
  // En la subasta en vivo sube lo mínimo mientras le convenga, y si va ganando espera.
  assert.deepEqual(botMove(room), { botId: 'b', action: { type: 'bid', amount: 50 } });
  room.auction.bid = 500;
  assert.deepEqual(botMove(room), { botId: 'b', action: { type: 'passBid' } });
  room.auction.bid = 0;
  room = act(room, 'b', { type: 'bid', amount: 50 });
  assert.deepEqual(botMove(room), { botId: 'a', action: { type: 'passBid' } }, 'el que va ganando espera; al otro ya no le conviene');
  me(room, 'a').bot = false;
  assert.equal(botMove(room), null, 'si el que falta es una persona, el bot que va ganando espera el reloj');
});

test('bots: aceptan un trato que los favorece y rechazan uno que no', () => {
  let room = game(2);
  room.players[1].bot = true;
  own(room, 'a', 1);
  own(room, 'b', 3);
  room = act(room, 'a', { type: 'tradeOffer', to: 'b', give: { cash: 300 }, take: { props: [3] } });
  assert.equal(botMove(room).action.type, 'tradeAccept', 'le dan 300 por una de 60');
  room = act(room, 'b', { type: 'tradeDecline' });
  room = act(room, 'a', { type: 'tradeOffer', to: 'b', give: { cash: 10 }, take: { props: [3] } });
  assert.equal(botMove(room).action.type, 'tradeDecline', 'le dan 10 por una de 60');
});

test('bots: no se mueven si no es su turno, si debe una persona o si la partida no está en curso', () => {
  let room = game(2);
  room.players[1].bot = true; // b es bot pero juega a
  assert.equal(botMove(room), null);
  room.current = 'b';
  assert.equal(botMove(room).action.type, 'roll');
  room.debts = [{ from: 'a', to: null, n: 50 }];
  assert.equal(botMove(room), null, 'espera a que la persona pague');
  assert.equal(botMove({ ...room, phase: 'lobby' }), null);
});

test('bots: una partida entera entre bots avanza sin que el reducer rechace ninguna jugada', () => {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  let seed = 3;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const id of ['bot-b11111', 'bot-c22222', 'bot-d33333']) room = applyAction(room, { type: 'addBot', playerId: 'a', botId: id, name: id }, { now: NOW, rand });
  room.players[0].bot = true;
  room = applyAction(room, { type: 'start', playerId: 'a' }, { now: NOW, rand });
  let steps = 0;
  const seen = new Set();
  while (room.phase === 'playing' && steps < 30000) {
    const move = botMove(room);
    assert.ok(move, `ningún bot puede jugar (paso ${room.step}, turno de ${room.current}, ${steps} jugadas)`);
    const next = applyAction(room, { ...move.action, playerId: move.botId }, { now: NOW + steps, rand });
    assert.ok(next, `el reducer rechazó ${JSON.stringify(move)} en el paso ${room.step} (${steps} jugadas)`);
    for (const p of next.players) assert.ok(p.cash >= 0, `${p.name} quedó con plata negativa`);
    seen.add(move.action.type);
    room = next;
    steps += 1;
  }
  assert.ok(steps > 100, 'la partida avanzó');
  for (const type of ['roll', 'buy', 'endTurn']) assert.ok(seen.has(type), `nunca jugaron ${type}`);
  assert.equal(room.phase, 'ended', `no terminó en ${steps} jugadas`); // con esta semilla termina; un empate sin ningún color completo no es un bug de reglas
});

// ─── Archivo de partida ──────────────────────────────────────────────────────
const saveOf = (room) => ({ id: room.saveId, savedAt: 5000, seat: 'a', room });

test('archivo: una partida exportada se vuelve a leer igual', () => {
  const save = saveOf(midGame());
  const { save: back, error } = parseSaveFile(exportSave(save));
  assert.equal(error, undefined);
  assert.deepEqual(back, save);
});

test('archivo: si alguien lo edita a mano sin la firma, se rechaza', () => {
  const file = JSON.parse(exportSave(saveOf(midGame())));
  file.data.room.players[0].cash = 999999;
  assert.match(parseSaveFile(JSON.stringify(file)).error, /modificado/);
});

test('archivo: aunque recalcule la firma, una partida incoherente se rechaza', () => {
  const room = midGame();
  room.props[1] = { o: 'nadie', h: 0 };
  const file = JSON.parse(exportSave(saveOf(room)));
  file.sig = signature(JSON.stringify(file.data));
  assert.match(parseSaveFile(JSON.stringify(file)).error, /no es válido/);
});

test('archivo: rechaza lo que no es una partida', () => {
  for (const text of ['', 'hola', '{}', '[]', JSON.stringify({ kind: 'otra-cosa', v: 1, data: {} })]) {
    assert.ok(parseSaveFile(text).error, `debería rechazar ${JSON.stringify(text)}`);
  }
});

test('archivo: roomProblem detecta plata, posiciones y edificios imposibles', () => {
  const base = midGame();
  assert.equal(roomProblem(base), null);
  const bad = (fn) => { const r = structuredClone(base); fn(r); return roomProblem(r); };
  assert.ok(bad((r) => { r.players[0].cash = 1.5; }));
  assert.ok(bad((r) => { r.players[0].pos = 40; }));
  assert.ok(bad((r) => { r.props[5] = { o: 'a', h: 2 }; })); // una estación no lleva casas
  assert.ok(bad((r) => { r.props[0] = { o: 'a' }; })); // la salida no se compra
  assert.ok(bad((r) => { r.players[1].id = 'a'; })); // ids repetidos
});

test('archivo: la partida leída se puede retomar', () => {
  const { save } = parseSaveFile(exportSave(saveOf(midGame())));
  const { room, seatId } = roomFromSave(save.room, save.seat, NOW);
  assert.equal(room.phase, 'resume');
  assert.equal(seatId, 'a');
});
