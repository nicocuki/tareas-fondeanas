import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMY_COLORS, CARD_COUNT, CONTINENTS, COUNTRIES, COUNTRY_COUNT, LINKS, NEIGHBORS, OBJECTIVES, SYMBOLS, cardSymbol, countriesOf, indexOf,
} from '../src/teg/board.js';
import {
  COMMON_TOTAL, FORCED_TRADE, MAX_LOG, MAX_PLAYERS, SETUP_ARMIES, applyAction, armiesOf, attackProblem, countOf, findPlayer, movable, newRoom,
  objectiveProgress, ownedBy, reinforcements, tradeValue, validSet,
} from '../src/teg/game.js';
import { serializeRoom } from '../src/codigo-secreto/game.js';
import { summarizeRoom } from '../src/ui/roomSummary.js';
import { writeError } from '../worker/rules.js';

const NOW = 1000;
const ids = 'abcdef';
function act(room, who, action, ctx = {}) {
  const out = applyAction(room, { ...action, playerId: who }, { now: NOW, rand: () => 0.5, ...ctx });
  assert.ok(out, `se rechazó ${action.type} de ${who} (etapa ${room.stage})`);
  return out;
}
const rejects = (room, who, action, ctx = {}) => assert.equal(applyAction(room, { ...action, playerId: who }, { now: NOW, rand: () => 0.5, ...ctx }), null, `${action.type} debería rechazarse`);

// Sala en el lobby con n jugadores (a, b, c…).
function lobby(n = 3, options = {}) {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  for (let i = 1; i < n; i++) room = act(room, ids[i], { type: 'join', name: `J${ids[i]}`, avatar: '🦊' });
  if (Object.keys(options).length) room = act(room, 'a', { type: 'setOptions', options });
  return room;
}
// Parte con el orden de turno fijo (a, b, c…): el reordenamiento es solo del test.
function started(n = 3, options = {}) {
  let room = act(lobby(n, options), 'a', { type: 'start' });
  const order = [...room.players].sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  const remap = new Map(room.players.map((p, i) => [i, order.indexOf(p)]));
  room.own = room.own.map((o) => remap.get(o));
  room.players = order;
  return room;
}
// Termina las dos tandas de ejércitos iniciales poniéndolo todo en el primer país de cada uno.
function ready(n = 3, options = {}) {
  let room = started(n, options);
  for (let round = 0; round < 2; round++) {
    room.players.forEach((p, i) => { room = act(room, p.id, { type: 'place', c: ownedBy(room, i)[0], n: p.pend }); });
  }
  assert.equal(room.stage, 'reinforce');
  assert.equal(room.current, 0);
  return room;
}
// Una partida armada a mano: `owners` es una lista de [país, jugador, ejércitos].
function setup(room, rows) {
  for (const [id, who, armies] of rows) { room.own[indexOf[id]] = who; room.arm[indexOf[id]] = armies; }
  return room;
}
const attack = (room, who, from, to, dice, a, d) => act(room, who, { type: 'attack', from: indexOf[from], to: indexOf[to], dice, seen: room.rollN }, { dice: { a, d } });
// Pasa a atacar con los refuerzos ya puestos.
function attacking(n = 3) {
  const room = ready(n);
  room.stage = 'attack';
  room.reinf = 0;
  return room;
}

// ─── Mapa ────────────────────────────────────────────────────────────────────
test('mapa: 50 países y 6 continentes con los tamaños y los bonus del T.E.G.', () => {
  assert.equal(COUNTRY_COUNT, 50);
  assert.equal(new Set(COUNTRIES.map((c) => c.id)).size, 50);
  const sizes = Object.fromEntries(Object.keys(CONTINENTS).map((k) => [k, countriesOf(k).length]));
  assert.deepEqual(sizes, { norteamerica: 10, sudamerica: 6, europa: 9, africa: 6, asia: 15, oceania: 4 });
  const bonus = Object.fromEntries(Object.entries(CONTINENTS).map(([k, c]) => [k, c.bonus]));
  assert.deepEqual(bonus, { norteamerica: 5, sudamerica: 3, europa: 5, africa: 3, asia: 7, oceania: 2 });
});

test('mapa: las fronteras son simétricas, no se repiten y todo el mapa es una sola pieza', () => {
  const seen = new Set();
  for (const { a, b } of LINKS) {
    assert.notEqual(a, b);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    assert.ok(!seen.has(key), `frontera repetida ${COUNTRIES[a].id}-${COUNTRIES[b].id}`);
    seen.add(key);
    assert.ok(NEIGHBORS[a].includes(b) && NEIGHBORS[b].includes(a));
  }
  NEIGHBORS.forEach((list, i) => assert.ok(list.length >= 2, `${COUNTRIES[i].id} tiene muy pocos vecinos`));
  const reached = new Set([0]);
  const queue = [0];
  while (queue.length) for (const n of NEIGHBORS[queue.shift()]) if (!reached.has(n)) { reached.add(n); queue.push(n); }
  assert.equal(reached.size, 50);
});

test('mapa: los países no se pisan en el dibujo', () => {
  for (let i = 0; i < COUNTRIES.length; i++) {
    for (let j = i + 1; j < COUNTRIES.length; j++) {
      const d = Math.hypot(COUNTRIES[i].x - COUNTRIES[j].x, COUNTRIES[i].y - COUNTRIES[j].y);
      assert.ok(d >= 40, `${COUNTRIES[i].id} y ${COUNTRIES[j].id} están a ${Math.round(d)}`);
    }
  }
  for (const c of COUNTRIES) assert.ok(c.x >= 30 && c.x <= 970 && c.y >= 30 && c.y <= 570, c.id);
});

test('cartas: 50 países repartidos en tres símbolos y dos comodines; el canje sube 4, 7, 10, 15, 20…', () => {
  assert.equal(CARD_COUNT, 52);
  assert.deepEqual(SYMBOLS.map((s) => [...Array(50).keys()].filter((i) => cardSymbol(i) === s).length).sort(), [16, 17, 17]);
  assert.equal(cardSymbol(50), 'wild');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(tradeValue), [4, 7, 10, 15, 20, 25]);
});

test('cartas: tres iguales, tres distintas, o con comodín; nunca dos iguales y una distinta', () => {
  const of = (s) => [...Array(50).keys()].filter((i) => cardSymbol(i) === s);
  const [c1, c2, c3] = of('cannon');
  const [s1] = of('ship');
  const [b1] = of('balloon');
  assert.ok(validSet([c1, c2, c3]));
  assert.ok(validSet([c1, s1, b1]));
  assert.ok(!validSet([c1, c2, s1]));
  assert.ok(validSet([c1, c2, 50]));
  assert.ok(validSet([c1, s1, 51]));
  assert.ok(validSet([50, 51, c1]));
  assert.ok(!validSet([c1, c1, c2]));
  assert.ok(!validSet([c1, c2]));
  assert.ok(!validSet([c1, c2, 99]));
});

// ─── Sala y arranque ─────────────────────────────────────────────────────────
test('sala: de 2 a 6 jugadores, cada uno con su color; solo se entra en la sala de espera', () => {
  const room = lobby(6);
  assert.equal(room.players.length, 6);
  assert.equal(new Set(room.players.map((p) => p.color)).size, 6);
  rejects(room, 'z', { type: 'join', name: 'Siete' });
  assert.equal(ARMY_COLORS.length, MAX_PLAYERS);
});

test('arranque: solo el anfitrión, con 2 o más; reparte los 50 países, los objetivos y el mazo', () => {
  rejects(newRoom('a', 'Ana'), 'a', { type: 'start' });
  rejects(lobby(3), 'b', { type: 'start' });
  const room = act(lobby(3), 'a', { type: 'start' }, { rand: Math.random });
  assert.equal(room.phase, 'playing');
  assert.equal(room.stage, 'setup1');
  assert.equal(room.own.length, 50);
  assert.deepEqual([0, 1, 2].map((i) => countOf(room, i)).sort(), [16, 17, 17]);
  assert.ok(room.arm.every((n) => n === 1));
  assert.ok(room.players.every((p) => p.pend === SETUP_ARMIES[0]));
  assert.equal(new Set(room.players.map((p) => p.obj)).size, 3, 'objetivos distintos');
  assert.deepEqual([...room.deck].sort((a, b) => a - b), [...Array(52).keys()]);
  rejects(room, 'a', { type: 'start' });
});

test('objetivos: nadie tiene que destruirse a sí mismo ni a un color que no juega', () => {
  for (let k = 0; k < 40; k++) {
    const room = act(lobby(3 + (k % 4)), 'a', { type: 'start' }, { rand: Math.random });
    const colors = room.players.map((p) => p.color);
    for (const p of room.players) {
      const o = OBJECTIVES.find((x) => x.id === p.obj);
      assert.ok(o, p.obj);
      if (o.destroy !== undefined) {
        assert.notEqual(o.destroy, p.color);
        assert.ok(colors.includes(o.destroy));
      }
    }
  }
});

test('objetivos: con la opción «30 países» todos tienen el mismo', () => {
  const room = act(lobby(3, { goal: 'conquer30' }), 'a', { type: 'start' });
  assert.ok(room.players.every((p) => p.obj === 'c30'));
});

// ─── Ejércitos iniciales ─────────────────────────────────────────────────────
test('inicio: todos ponen a la vez, 5 y después 3, solo en sus países; después arranca el primer turno', () => {
  let room = started(3);
  const mine = ownedBy(room, 0)[0];
  const theirs = ownedBy(room, 1)[0];
  rejects(room, 'a', { type: 'place', c: theirs, n: 1 });
  rejects(room, 'a', { type: 'place', c: mine, n: 6 });
  rejects(room, 'a', { type: 'place', c: mine, n: 0 });
  room = act(room, 'b', { type: 'place', c: ownedBy(room, 1)[0], n: 2 }); // b no espera a nadie
  room = act(room, 'a', { type: 'place', c: mine, n: 5 });
  rejects(room, 'a', { type: 'place', c: mine, n: 1 });
  room = act(room, 'b', { type: 'place', c: ownedBy(room, 1)[1], n: 3 });
  assert.equal(room.stage, 'setup1');
  room = act(room, 'c', { type: 'place', c: ownedBy(room, 2)[0], n: 5 });
  assert.equal(room.stage, 'setup2');
  assert.ok(room.players.every((p) => p.pend === 3));
  for (const [i, p] of room.players.entries()) room = act(room, p.id, { type: 'place', c: ownedBy(room, i)[0], n: 3 });
  assert.equal(room.stage, 'reinforce');
  assert.equal(room.current, 0);
  assert.equal(room.reinf, reinforcements(room, 0));
  assert.equal(armiesOf(room, 0), countOf(room, 0) + 8);
});

// ─── Refuerzos ───────────────────────────────────────────────────────────────
test('refuerzos: la mitad de los países (mínimo 3) más el bonus de cada continente completo', () => {
  const room = ready(3);
  room.own.fill(1);
  for (const c of [0, 1, 2, 3, 4]) room.own[c] = 0;
  assert.equal(reinforcements(room, 0), 3);
  for (let c = 0; c < 20; c++) room.own[c] = 0;
  // Los primeros 20 países son toda América del Norte, toda América del Sur y 4 de Europa.
  assert.equal(reinforcements(room, 0), 10 + 5 + 3);
  room.own.fill(0);
  room.own[indexOf.japon] = 1; // todo menos un país de Asia
  assert.equal(reinforcements(room, 0), 24 + 5 + 3 + 5 + 3 + 2);
  room.own[indexOf.japon] = 0;
  assert.equal(reinforcements(room, 0), 25 + 5 + 3 + 5 + 3 + 7 + 2);
});

test('refuerzos: se reparten en los países propios, solo en tu turno y hasta agotarlos', () => {
  let room = ready(3);
  const [a1] = ownedBy(room, 0);
  const total = room.reinf;
  rejects(room, 'b', { type: 'place', c: ownedBy(room, 1)[0], n: 1 });
  rejects(room, 'a', { type: 'place', c: ownedBy(room, 1)[0], n: 1 });
  rejects(room, 'a', { type: 'place', c: a1, n: total + 1 });
  rejects(room, 'a', { type: 'toAttack' }); // faltan ejércitos por poner
  room = act(room, 'a', { type: 'place', c: a1, n: total - 1 });
  room = act(room, 'a', { type: 'place', c: a1, n: 1 });
  assert.equal(room.reinf, 0);
  room = act(room, 'a', { type: 'toAttack' });
  assert.equal(room.stage, 'attack');
  rejects(room, 'a', { type: 'place', c: a1, n: 1 });
});

// ─── Canje ───────────────────────────────────────────────────────────────────
function withCards(cards) {
  const room = ready(3);
  room.players[0].cards = cards;
  room.deck = room.deck.filter((c) => !cards.includes(c));
  return room;
}
const sym = (s, k = 0) => [...Array(50).keys()].filter((i) => cardSymbol(i) === s)[k];

test('canje: 4, 7 y 10 ejércitos, y +2 en cada país de las cartas que sea tuyo', () => {
  const trio = [sym('cannon', 0), sym('cannon', 1), sym('cannon', 2)];
  let room = withCards([...trio, sym('ship')]);
  room.own[trio[0]] = 0;
  room.own[trio[1]] = 1;
  const before = room.reinf;
  const armBefore = room.arm[trio[0]];
  rejects(room, 'b', { type: 'trade', cards: trio });
  rejects(room, 'a', { type: 'trade', cards: [trio[0], trio[1], sym('ship')] });
  rejects(room, 'a', { type: 'trade', cards: [trio[0], trio[1], 49] });
  room = act(room, 'a', { type: 'trade', cards: trio });
  assert.equal(room.reinf, before + 4);
  assert.equal(room.arm[trio[0]], armBefore + 2, 'país propio de una carta');
  assert.equal(room.tradeN, 1);
  assert.deepEqual(room.players[0].cards, [sym('ship')]);
  assert.deepEqual(room.discard, trio);
  // el segundo canje, de cualquiera, vale 7
  room.players[1].cards = [sym('ship', 0), sym('ship', 1), sym('ship', 2)];
  room.current = 1;
  room.stage = 'reinforce';
  const b4 = room.reinf;
  room = act(room, 'b', { type: 'trade', cards: room.players[1].cards });
  assert.equal(room.reinf, b4 + 7);
});

test('canje: con 5 cartas hay que canjear antes de repartir o atacar', () => {
  const cards = [sym('cannon', 0), sym('cannon', 1), sym('ship', 0), sym('ship', 1), sym('balloon', 0)];
  assert.equal(cards.length, FORCED_TRADE);
  let room = withCards(cards);
  rejects(room, 'a', { type: 'place', c: ownedBy(room, 0)[0], n: 1 });
  room.reinf = 0;
  rejects(room, 'a', { type: 'toAttack' });
  room = act(room, 'a', { type: 'trade', cards: [sym('cannon', 0), sym('ship', 0), sym('balloon', 0)] });
  room.reinf = 0;
  room = act(room, 'a', { type: 'toAttack' });
});

test('canje: solo en la fase de refuerzos de tu turno', () => {
  const trio = [sym('cannon', 0), sym('cannon', 1), sym('cannon', 2)];
  const room = withCards(trio);
  room.stage = 'attack';
  rejects(room, 'a', { type: 'trade', cards: trio });
});

// ─── Ataque ──────────────────────────────────────────────────────────────────
test('ataque: se comparan los dados de mayor a menor y los empates los gana el defensor', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 6], ['chile', 1, 4]]);
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 4, 2], [5, 4, 1]);
  // 6 contra 5: pierde el defensor; 4 contra 4: empate, pierde el atacante; 2 contra 1: pierde el defensor.
  assert.equal(room.arm[indexOf.chile], 2);
  assert.equal(room.arm[indexOf.argentina], 5);
  assert.deepEqual(room.last.a, [6, 4, 2]);
  assert.equal(room.last.dl, 2);
  assert.equal(room.last.al, 1);
});

test('ataque: el defensor tira hasta 3 dados pero no más que sus ejércitos; con 1 dado se compara uno solo', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 6], ['chile', 1, 1]]);
  room = attack(room, 'a', 'argentina', 'chile', 3, [3, 3, 3], [2]);
  assert.equal(room.pending.to, indexOf.chile);
  assert.equal(room.arm[indexOf.argentina], 6, 'solo se compararon los dos primeros dados');
});

test('ataque: hace falta un ejército de sobra, país propio y vecino, y los dados que se puedan', () => {
  const room = attacking();
  setup(room, [['argentina', 0, 2], ['chile', 1, 3], ['brasil', 0, 1], ['peru', 1, 3], ['japon', 1, 1]]);
  const ask = (from, to, dice) => applyAction(room, { type: 'attack', playerId: 'a', from: indexOf[from], to: indexOf[to], dice, seen: room.rollN }, { rand: () => 0.5 });
  assert.ok(ask('argentina', 'chile', 1));
  assert.equal(ask('argentina', 'chile', 2), null, 'con 2 ejércitos solo 1 dado');
  assert.equal(ask('brasil', 'peru', 1), null, 'un solo ejército no ataca');
  assert.equal(ask('argentina', 'japon', 1), null, 'no es vecino');
  assert.equal(ask('chile', 'argentina', 1), null, 'no es tuyo');
  assert.equal(ask('argentina', 'chile', 4), null);
  assert.equal(ask('argentina', 'chile', 0), null);
  assert.equal(applyAction(room, { type: 'attack', playerId: 'a', from: indexOf.argentina, to: indexOf.chile, dice: 1, seen: 99 }, { rand: () => 0.5 }), null, 'pantalla desactualizada');
  assert.equal(applyAction(room, { type: 'attack', playerId: 'b', from: indexOf.chile, to: indexOf.argentina, dice: 1, seen: 0 }, { rand: () => 0.5 }), null, 'no es su turno');
  assert.match(attackProblem(room, 0, indexOf.argentina, indexOf.japon), /vecinos/);
});

test('ataque: dos clics seguidos con la misma pantalla no tiran dos veces', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 9], ['chile', 1, 9]]);
  const action = { type: 'attack', playerId: 'a', from: indexOf.argentina, to: indexOf.chile, dice: 3, seen: room.rollN };
  room = applyAction(room, action, { rand: () => 0.5 });
  assert.ok(room);
  assert.equal(applyAction(room, action, { rand: () => 0.5 }), null);
});

test('conquista: el país pasa a ser tuyo, hay que pasar ejércitos (mínimo los dados) y se roba una carta al terminar', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 6], ['chile', 1, 1], ['peru', 1, 3]]);
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 5, 4], [1]);
  assert.equal(room.own[indexOf.chile], 0);
  assert.equal(room.arm[indexOf.chile], 0);
  assert.deepEqual(room.pending, { from: indexOf.argentina, to: indexOf.chile, min: 3, max: 5 });
  assert.equal(room.conq, true);
  rejects(room, 'a', { type: 'occupy', n: 2 });
  rejects(room, 'a', { type: 'occupy', n: 6 });
  rejects(room, 'a', { type: 'toRegroup' });
  rejects(room, 'a', { type: 'endTurn', turn: room.turnNo });
  rejects(room, 'b', { type: 'occupy', n: 3 });
  room = act(room, 'a', { type: 'occupy', n: 4 });
  assert.equal(room.arm[indexOf.chile], 4);
  assert.equal(room.arm[indexOf.argentina], 2);
  assert.equal(room.pending, null);
  const cards = room.players[0].cards.length;
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  assert.equal(room.players[0].cards.length, cards + 1);
  assert.equal(room.current, 1);
  assert.equal(room.stage, 'reinforce');
});

test('sin conquistas no hay carta', () => {
  let room = attacking();
  const cards = room.players[0].cards.length;
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  assert.equal(room.players[0].cards.length, cards);
  rejects(room, 'a', { type: 'endTurn', turn: room.turnNo }); // ya no es su turno
});

test('«atacar hasta el final» sigue tirando hasta conquistar o quedarse con uno', () => {
  // Dados repetibles (generador con semilla).
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let room = attacking();
    setup(room, [['argentina', 0, 30], ['chile', 1, 12]]);
    room = act(room, 'a', { type: 'blitz', from: indexOf.argentina, to: indexOf.chile, seen: room.rollN }, { rand: seeded(seed) });
    assert.ok(room.pending || room.arm[indexOf.argentina] === 1, 'termina conquistando o sin ejércitos de sobra');
    assert.equal(30 - room.arm[indexOf.argentina], room.last.tl, 'las bajas de la serie coinciden con lo que se perdió');
    assert.equal(12 - (room.pending ? 0 : room.arm[indexOf.chile]), room.last.td);
    assert.ok(room.last.rounds >= 1);
  }
  // Con todos los dados en 1 el defensor gana los empates y el atacante se queda con un solo ejército.
  let room = attacking();
  setup(room, [['argentina', 0, 5], ['chile', 1, 30]]);
  room = act(room, 'a', { type: 'blitz', from: indexOf.argentina, to: indexOf.chile, seen: room.rollN }, { rand: () => 0 });
  assert.equal(room.arm[indexOf.argentina], 1);
  assert.equal(room.pending, null);
  assert.equal(room.last.tl, 4);
  rejects(room, 'a', { type: 'blitz', from: indexOf.argentina, to: indexOf.chile, seen: room.rollN }); // ya no le quedan ejércitos de sobra
});

// ─── Reagrupar ───────────────────────────────────────────────────────────────
test('reagrupe: siempre queda un ejército y los que llegan no se vuelven a mover', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 6], ['chile', 0, 1], ['peru', 0, 1], ['brasil', 1, 3]]);
  rejects(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.chile, n: 1 }); // todavía en ataque
  room = act(room, 'a', { type: 'toRegroup' });
  rejects(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.chile, n: 6 });
  rejects(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.brasil, n: 1 }); // de otro
  room = act(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.chile, n: 4 });
  assert.equal(room.arm[indexOf.chile], 5);
  assert.equal(movable(room, indexOf.chile), 0, 'los 4 que llegaron no vuelven a moverse');
  rejects(room, 'a', { type: 'move', from: indexOf.chile, to: indexOf.peru, n: 1 });
  room = act(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.chile, n: 1 });
  rejects(room, 'a', { type: 'move', from: indexOf.argentina, to: indexOf.chile, n: 1 });
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  assert.deepEqual(room.locked, {});
});

test('reagrupe: no se puede atacar después de pasar a reagrupar', () => {
  let room = attacking();
  setup(room, [['argentina', 0, 6], ['chile', 1, 3]]);
  room = act(room, 'a', { type: 'toRegroup' });
  rejects(room, 'a', { type: 'attack', from: indexOf.argentina, to: indexOf.chile, dice: 1, seen: room.rollN });
});

// ─── Eliminación y victoria ──────────────────────────────────────────────────
test('eliminar a alguien: el que lo eliminó se queda con sus cartas y el otro queda afuera', () => {
  let room = attacking(3);
  room.own.fill(2);
  setup(room, [['argentina', 0, 6], ['chile', 1, 1]]);
  room.players[1].cards = [3, 4];
  room.players[0].obj = 'a24';
  room.players[2].obj = 'a24';
  room.players[1].obj = 'a24';
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 5, 4], [1]);
  assert.equal(room.players[1].out, true);
  assert.equal(room.players[1].by, 0);
  assert.deepEqual(room.players[0].cards, [3, 4]);
  assert.deepEqual(room.players[1].cards, []);
  assert.deepEqual(room.eliminated, ['b']);
  room = act(room, 'a', { type: 'occupy', n: 3 });
  room = act(room, 'a', { type: 'endTurn', turn: room.turnNo });
  assert.equal(room.current, 2, 'el eliminado no juega más');
});

test('objetivo de destruir: gana quien elimina a ese color; si lo elimina otro, pasa a ocupar 30 países', () => {
  const build = () => {
    const room = attacking(3);
    room.own.fill(2);
    setup(room, [['argentina', 0, 6], ['chile', 1, 1]]);
    return room;
  };
  let room = build();
  room.players[0].obj = `d${room.players[1].color}`;
  room.players[2].obj = `d${room.players[1].color}`;
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 5, 4], [1]);
  assert.equal(room.players[2].obj, 'c30', 'otro lo destruyó: ya no es su objetivo');
  room = act(room, 'a', { type: 'occupy', n: 3 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'a');
  assert.equal(room.players[0].wins, 1);
});

test('objetivo de continente: gana al ocupar el último país que faltaba', () => {
  let room = attacking(3);
  room.own.fill(1);
  for (const c of countriesOf('oceania').filter((x) => x !== indexOf.australia)) room.own[c] = 0;
  for (const c of countriesOf('asia')) room.own[c] = 0;
  setup(room, [['java', 0, 5], ['australia', 1, 1]]);
  room.players[0].obj = 't8';
  assert.equal(objectiveProgress(room, 0).done, false);
  room = attack(room, 'a', 'java', 'australia', 3, [6, 5, 4], [1]);
  room = act(room, 'a', { type: 'occupy', n: 3 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'a');
});

test('objetivo de países: «18 países con 2 ejércitos» cuenta solo los que tienen 2 o más', () => {
  const room = ready(3);
  room.own.fill(1);
  room.arm.fill(1);
  for (let c = 0; c < 18; c++) room.own[c] = 0;
  room.players[0].obj = 'a18';
  assert.equal(objectiveProgress(room, 0).lines[0].have, 0);
  for (let c = 0; c < 17; c++) room.arm[c] = 2;
  assert.equal(objectiveProgress(room, 0).done, false);
  room.arm[17] = 3;
  assert.equal(objectiveProgress(room, 0).done, true);
});

test('con 30 países se gana siempre, sea cual sea el objetivo', () => {
  let room = attacking(3);
  room.own.fill(1);
  // 29 países del jugador 0, entre ellos Argentina, y Chile del 1: al conquistarlo llega a 30.
  const mine = [...Array(50).keys()].filter((c) => c !== indexOf.chile).slice(0, 29);
  if (!mine.includes(indexOf.argentina)) mine[0] = indexOf.argentina;
  for (const c of mine) room.own[c] = 0;
  assert.equal(countOf(room, 0), COMMON_TOTAL - 1);
  room.players[0].obj = `d${room.players[2].color}`; // un objetivo que está lejos de cumplirse
  setup(room, [['argentina', 0, 6], ['chile', 1, 1]]);
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 5, 4], [1]);
  room = act(room, 'a', { type: 'occupy', n: 3 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'a');
});

test('la opción «30 países» ignora el objetivo secreto', () => {
  let room = attacking(3);
  room.options.goal = 'conquer30';
  room.own.fill(1);
  for (const c of countriesOf('asia').concat(countriesOf('oceania'))) room.own[c] = 0;
  room.own[indexOf.australia] = 1;
  setup(room, [['java', 0, 5], ['australia', 1, 1]]);
  room.players[0].obj = 't8';
  room = attack(room, 'a', 'java', 'australia', 3, [6, 5, 4], [1]);
  room = act(room, 'a', { type: 'occupy', n: 3 });
  assert.equal(room.phase, 'playing');
});

// ─── Salirse y expulsar ──────────────────────────────────────────────────────
test('salirse en plena partida: sus países siguen ahí, se salta su turno y la partida sigue', () => {
  let room = ready(3);
  const mine = countOf(room, 0);
  room = act(room, 'a', { type: 'leave' });
  assert.equal(room.players[0].left, true);
  assert.equal(countOf(room, 0), mine);
  assert.equal(room.current, 1);
  assert.equal(room.stage, 'reinforce');
  assert.notEqual(room.hostId, 'a');
  room = act(room, 'c', { type: 'leave' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'b');
});

test('salirse durante los ejércitos iniciales no frena a los demás', () => {
  let room = started(3);
  room = act(room, 'a', { type: 'place', c: ownedBy(room, 0)[0], n: 5 });
  room = act(room, 'b', { type: 'place', c: ownedBy(room, 1)[0], n: 5 });
  room = act(room, 'c', { type: 'leave' });
  assert.equal(room.stage, 'setup2');
});

test('el anfitrión puede sacar a alguien en plena partida y no vuelve a entrar', () => {
  let room = ready(3);
  room = act(room, 'a', { type: 'kick', target: 'c' });
  assert.equal(room.players[2].left, true);
  assert.deepEqual(room.kicked, ['c']);
  rejects(room, 'b', { type: 'kick', target: 'a' });
});

test('volver a la sala y empezar otra: se reinicia todo menos las victorias', () => {
  let room = attacking(2);
  room.own.fill(0);
  room.own[indexOf.chile] = 1;
  setup(room, [['argentina', 0, 6], ['chile', 1, 1]]);
  room.players[0].obj = 'a24';
  room = attack(room, 'a', 'argentina', 'chile', 3, [6, 5, 4], [1]);
  room = act(room, 'a', { type: 'occupy', n: 3 });
  assert.equal(room.phase, 'ended');
  rejects(room, 'b', { type: 'start' });
  const again = act(room, 'a', { type: 'start' });
  assert.equal(again.phase, 'playing');
  assert.equal(again.log.length, 0);
  assert.equal(again.players.find((p) => p.id === 'a').wins, 1);
  const lobbyAgain = act(room, 'a', { type: 'toLobby' });
  assert.equal(lobbyAgain.phase, 'lobby');
});

// ─── Tamaños y red ───────────────────────────────────────────────────────────
test('la sala del peor caso entra de sobra en los 30.000 caracteres', () => {
  let room = ready(6);
  room.players.forEach((p) => { p.cards = [1, 2, 3, 4, 5, 6, 7, 8]; p.name = 'N'.repeat(20); });
  room.arm.fill(999);
  room.log = Array.from({ length: MAX_LOG + 5 }, (_, i) => ({ k: 'conquer', p: i % 6, f: 49, t: 48, v: 3 }));
  room.log = room.log.slice(-MAX_LOG);
  room.last = { n: 99, f: 1, t: 2, a: [6, 6, 6], d: [6, 6, 6], al: 3, dl: 0, rounds: 99, tl: 99, td: 99, won: true };
  const size = serializeRoom(room).length;
  assert.ok(size < 12000, `pesa ${size}`);
  assert.equal(writeError(['rooms', 'ABCD'], 'u', serializeRoom(room), null), null);
});

test('portada: la sala se reconoce como T.E.G., con tope de 6', () => {
  const sum = summarizeRoom('ABCD', null, serializeRoom(newRoom('a', 'Ana', '🐸', NOW)));
  assert.equal(sum.game, 'teg');
  assert.equal(sum.max, 6);
});

test('acciones inválidas o de otro juego se rechazan', () => {
  const room = ready(3);
  assert.equal(applyAction({ ...room, gameType: 'monopoly' }, { type: 'toAttack', playerId: 'a' }), null);
  assert.equal(applyAction(room, { type: 'inventada', playerId: 'a' }), null);
  assert.equal(applyAction(null, { type: 'start' }), null);
  for (const c of [-1, 50, 1.5, 'x', undefined]) rejects(room, 'a', { type: 'place', c, n: 1 });
  assert.ok(findPlayer(room, 'a'));
});
