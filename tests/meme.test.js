import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLAYERS, RESULTS_MS, UNLIMITED, VOTE_MS, applyAction, cleanTemplate, cleanTexts, findPlayer, newRoom, pointsFor, ranking, rerollsLeft,
} from '../src/meme/game.js';
import { CATALOG, boxLabel, defaultTexts, findTemplate, toRoomTemplate } from '../src/meme/catalog.js';

const tpl = (i, boxes = 2) => ({ id: `t${i}`, name: `Meme ${i}`, url: `https://i.imgflip.com/m${i}.jpg`, w: 600, h: 400, boxes });
const POOL = Array.from({ length: 10 }, (_, i) => tpl(i));
const say = (...lines) => lines.map((t, i) => ({ t, x: 50, y: i ? 88 : 12, s: 9 }));

function lobby(names = ['Ana', 'Beto', 'Caro'], options) {
  let room = newRoom('a', names[0], '🐸', 0);
  names.slice(1).forEach((n, i) => { room = applyAction(room, { type: 'join', playerId: 'abcdefghijklmn'[i + 1], name: n }, { now: 0 }); });
  if (options) room = applyAction(room, { type: 'setOptions', playerId: 'a', options });
  return room;
}
const start = (room, now = 1000) => applyAction(room, { type: 'start', playerId: 'a', pool: POOL }, { now, rand: () => 0.3 });
function submitAll(room, now = 2000) {
  for (const p of room.players) room = applyAction(room, { type: 'submit', playerId: p.id, round: room.round, texts: say(`arriba ${p.name}`, 'abajo') }, { now, rand: () => 0.4 }) || room;
  return room;
}

test('meme: cada plantilla del catálogo es válida y trae sus cajas de texto ubicadas', () => {
  assert.ok(CATALOG.length >= 60, `${CATALOG.length}`);
  assert.equal(new Set(CATALOG.map((t) => t.id)).size, CATALOG.length);
  for (const t of CATALOG) {
    const room = toRoomTemplate(t);
    assert.deepEqual(cleanTemplate(room), room, t.name);
    assert.ok(t.hint && t.name, t.id);
    assert.ok(t.boxes.length >= 1 && t.boxes.length <= 5, t.name);
    for (const b of t.boxes) {
      assert.ok(b.x >= 0 && b.x <= 100 && b.y >= 0 && b.y <= 100, t.name);
      assert.ok(b.w >= 10 && b.w <= 100 && b.s >= 3 && b.s <= 16, t.name);
    }
    assert.deepEqual(cleanTexts(defaultTexts(room), room.boxes), defaultTexts(room), t.name);
  }
  const drake = findTemplate('181913649');
  assert.equal(defaultTexts(toRoomTemplate(drake))[0].x, 75);
  assert.equal(boxLabel(drake, 1), 'Lo que sí');
  assert.equal(boxLabel({ id: 'otra' }, 0), 'Texto 1');
  assert.equal(cleanTemplate({ ...tpl(1), url: 'https://malicioso.com/x.jpg' }), null);
});

test('meme: modo normal reparte un meme distinto a cada uno; «todos el mismo», uno solo', () => {
  const normal = start(lobby());
  const ids = Object.values(normal.templates).map((t) => t.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(normal.phase, 'making');
  assert.equal(normal.phaseEndsAt, 1000 + 90000);
  const same = start(lobby(undefined, { mode: 'same' }));
  assert.equal(new Set(Object.values(same.templates).map((t) => t.id)).size, 1);
});

test('meme: por defecto se puede cambiar el meme una sola vez, y no en el modo «todos el mismo»', () => {
  let room = start(lobby());
  room = applyAction(room, { type: 'reroll', playerId: 'a', round: 1, template: tpl(99) }, { now: 1500 });
  assert.equal(room.templates.a.id, 't99');
  assert.equal(applyAction(room, { type: 'reroll', playerId: 'a', round: 1, template: tpl(98) }, { now: 1600 }), null);
  const same = start(lobby(undefined, { mode: 'same' }));
  assert.equal(applyAction(same, { type: 'reroll', playerId: 'a', round: 1, template: tpl(99) }, { now: 1500 }), null);
});

test('meme: los textos se limpian (tope de largo, cantidad de cajas, posiciones dentro de la imagen)', () => {
  const texts = cleanTexts([{ t: 'x'.repeat(200), x: 500, y: -3, s: 99 }, { t: 'b' }, { t: 'sobra' }], 2);
  assert.equal(texts.length, 2);
  assert.equal(texts[0].t.length, 80);
  assert.equal(texts[0].x, 100);
  assert.equal(texts[0].y, 0);
  assert.equal(texts[0].s, 16);
  assert.equal(texts[0].w, 92);
  assert.equal(cleanTexts([{ t: 'a', w: 3 }], 1)[0].w, 10);
});

test('meme: cuando todos entregan arranca la votación, en orden mezclado y sin memes vacíos', () => {
  let room = start(lobby());
  room = applyAction(room, { type: 'submit', playerId: 'a', round: 1, texts: say('hola') }, { now: 2000 });
  assert.equal(room.phase, 'making');
  assert.equal(applyAction(room, { type: 'submit', playerId: 'a', round: 1, texts: say('otra') }, { now: 2100 }), null); // ya entregó
  room = applyAction(room, { type: 'submit', playerId: 'b', round: 1, texts: say('', '') }, { now: 2200 }); // vacío
  room = applyAction(room, { type: 'submit', playerId: 'c', round: 1, texts: say('chau') }, { now: 2300, rand: () => 0.9 });
  assert.equal(room.phase, 'voting');
  assert.deepEqual([...room.order].sort(), ['a', 'c']);
  assert.equal(room.phaseEndsAt, 2300 + VOTE_MS);
});

test('meme: si se acaba el tiempo, se vota con lo que haya', () => {
  let room = start(lobby());
  room = applyAction(room, { type: 'submit', playerId: 'a', round: 1, texts: say('hola') }, { now: 2000 });
  assert.equal(applyAction(room, { type: 'tick', round: 1, phase: 'making' }, { now: room.phaseEndsAt - 1 }), null);
  room = applyAction(room, { type: 'tick', round: 1, phase: 'making' }, { now: room.phaseEndsAt, rand: () => 0.1 });
  assert.equal(room.phase, 'voting');
  assert.deepEqual(room.order, ['a']);
});

test('meme: nadie vota su propio meme y la votación avanza cuando votaron todos', () => {
  let room = submitAll(start(lobby()));
  const author = room.order[0];
  assert.equal(applyAction(room, { type: 'vote', playerId: author, round: 1, index: 0, stars: 5 }, { now: 3000 }), null);
  assert.equal(applyAction(room, { type: 'vote', playerId: author === 'a' ? 'b' : 'a', round: 1, index: 0, stars: 9 }, { now: 3000 }), null);
  const voters = room.players.map((p) => p.id).filter((id) => id !== author);
  room = applyAction(room, { type: 'vote', playerId: voters[0], round: 1, index: 0, stars: 5 }, { now: 3000 });
  assert.equal(room.voteIndex, 0);
  room = applyAction(room, { type: 'vote', playerId: voters[1], round: 1, index: 0, stars: 3 }, { now: 3100 });
  assert.equal(room.voteIndex, 1);
  assert.equal(pointsFor(room, author), 8);
  // Un voto que llega tarde, para el meme anterior, no hace nada.
  assert.equal(applyAction(room, { type: 'vote', playerId: voters[0], round: 1, index: 0, stars: 1 }, { now: 3200 }), null);
});

test('meme: al terminar la votación se suman los puntos y se guarda el mejor de la ronda', () => {
  let room = submitAll(start(lobby()));
  const stars = { 0: 5, 1: 2, 2: 4 };
  for (let i = 0; i < 3; i++) {
    const author = room.order[i];
    for (const p of room.players) if (p.id !== author) room = applyAction(room, { type: 'vote', playerId: p.id, round: 1, index: i, stars: stars[i] }, { now: 4000 });
  }
  assert.equal(room.phase, 'results');
  assert.equal(room.phaseEndsAt, 4000 + RESULTS_MS);
  assert.equal(room.history.length, 1);
  assert.equal(room.history[0].author, room.order[0]);
  assert.equal(room.history[0].points, 10);
  assert.equal(findPlayer(room, room.order[0]).score, 10);
  assert.equal(ranking(room)[0].id, room.order[0]);
});

test('meme: el reloj de la votación pasa al siguiente aunque falten votos', () => {
  let room = submitAll(start(lobby()));
  room = applyAction(room, { type: 'tick', round: 1, phase: 'voting', index: 0 }, { now: room.phaseEndsAt });
  assert.equal(room.voteIndex, 1);
  assert.equal(applyAction(room, { type: 'tick', round: 1, phase: 'voting', index: 0 }, { now: room.phaseEndsAt }), null); // aviso repetido
});

test('meme: después de la última ronda viene el final, y el anfitrión puede jugar otra', () => {
  let room = submitAll(start(lobby(undefined, { rounds: 2 })));
  room = applyAction(room, { type: 'tick', round: 1, phase: 'voting', index: 0 }, { now: room.phaseEndsAt });
  room = applyAction(room, { type: 'tick', round: 1, phase: 'voting', index: 1 }, { now: room.phaseEndsAt });
  room = applyAction(room, { type: 'tick', round: 1, phase: 'voting', index: 2 }, { now: room.phaseEndsAt });
  assert.equal(room.phase, 'results');
  room = applyAction(room, { type: 'tick', round: 1, phase: 'results', pool: POOL }, { now: room.phaseEndsAt, rand: () => 0.7 });
  assert.equal(room.phase, 'making');
  assert.equal(room.round, 2);
  room = applyAction(room, { type: 'tick', round: 2, phase: 'making' }, { now: room.phaseEndsAt });
  assert.equal(room.phase, 'results'); // nadie entregó: no hay qué votar
  room = applyAction(room, { type: 'tick', round: 2, phase: 'results' }, { now: room.phaseEndsAt });
  assert.equal(room.phase, 'final');
  const again = applyAction(room, { type: 'start', playerId: 'a', pool: POOL }, { now: 99999, rand: () => 0.2 });
  assert.equal(again.round, 1);
  assert.ok(again.players.every((p) => p.score === 0));
});

test('meme: el que entra a mitad de ronda juega desde la siguiente', () => {
  let room = start(lobby(['Ana', 'Beto']));
  room = applyAction(room, { type: 'join', playerId: 'z', name: 'Zoe' }, { now: 1500 });
  assert.equal(findPlayer(room, 'z').inGame, false);
  room = submitAll(room);
  assert.equal(room.phase, 'voting'); // no se lo espera
});

test('meme: una sala llena con textos largos no pasa el tope de 30.000 caracteres (da ~20.000)', () => {
  const names = Array.from({ length: MAX_PLAYERS }, (_, i) => `Jugador${i}`);
  let room = start(lobby(names, { rounds: 5 }));
  room.templates = Object.fromEntries(room.players.map((p) => [p.id, tpl(p.id, 5)]));
  for (const p of room.players) room = applyAction(room, { type: 'submit', playerId: p.id, round: room.round, texts: Array.from({ length: 5 }, () => ({ t: '"'.repeat(80), x: 50, y: 50, w: 48, s: 8 })) }, { now: 2000 });
  for (const author of room.order) room.votes[author] = Object.fromEntries(room.players.map((p) => [p.id, 5]));
  room.history = Array.from({ length: 5 }, (_, i) => ({ round: i, author: 'a', points: 50, template: tpl(i, 5), texts: room.memes.a }));
  const size = JSON.stringify(room).length;
  assert.ok(size < 30000, `${size}`);
});

test('meme: el anfitrión elige cuántos cambios de meme tiene cada uno (o sin límite), y se renuevan cada ronda', () => {
  const reroll = (room, id, i) => applyAction(room, { type: 'reroll', playerId: id, round: room.round, template: tpl(i) }, { now: 1500 });
  let room = start(lobby(undefined, { rerolls: 3 }));
  assert.equal(rerollsLeft(room, 'a'), 3);
  for (const i of [90, 91, 92]) room = reroll(room, 'a', i);
  assert.equal(room.templates.a.id, 't92');
  assert.equal(rerollsLeft(room, 'a'), 0);
  assert.equal(reroll(room, 'a', 93), null);
  assert.equal(rerollsLeft(room, 'b'), 3); // los cambios son de cada uno
  // Ronda nueva: vuelven a estar los tres.
  room = submitAll(room);
  assert.equal(rerollsLeft({ ...room, rerolled: {} }, 'a'), 3);

  let free = start(lobby(undefined, { rerolls: UNLIMITED }));
  for (let i = 0; i < 20; i++) free = reroll(free, 'a', 50 + i);
  assert.equal(free.templates.a.id, 't69');
  assert.equal(rerollsLeft(free, 'a'), Infinity);

  const none = start(lobby(undefined, { rerolls: 0 }));
  assert.equal(reroll(none, 'a', 90), null);
  // Valores que no están en la lista no se aceptan.
  assert.equal(lobby(undefined, { rerolls: 7 }).options.rerolls, 1);
});

test('meme: una sala de antes de la opción (sin «rerolls» y con «true») sigue con un cambio por persona', () => {
  const room = start(lobby());
  delete room.options.rerolls;
  assert.equal(rerollsLeft(room, 'a'), 1);
  room.rerolled.a = true;
  assert.equal(rerollsLeft(room, 'a'), 0);
});
