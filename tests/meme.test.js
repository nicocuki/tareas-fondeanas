import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLAYERS, RESULTS_MS, VOTE_MS, applyAction, cleanTemplate, cleanTexts, findPlayer, newRoom, pointsFor, ranking,
} from '../src/meme/game.js';
import { defaultTexts, parseImgflip } from '../src/meme/templates.js';

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

test('meme: la lista de Imgflip se limpia y cada meme arranca con textos arriba y abajo', () => {
  const parsed = parseImgflip({ success: true, data: { memes: [
    { id: '181913649', name: 'Drake', url: 'https://i.imgflip.com/30b1gx.jpg', width: 1200, height: 1200, box_count: 2 },
    { id: 'x', name: 'Raro', url: 'http://otro.com/a.jpg', width: 10, height: 10, box_count: 0 },
  ] } });
  assert.deepEqual(parsed, [{ id: '181913649', name: 'Drake', url: 'https://i.imgflip.com/30b1gx.jpg', w: 1200, h: 1200, boxes: 2 }]);
  assert.deepEqual(parseImgflip({ success: false }), []);
  assert.equal(defaultTexts(2)[1].y, 88);
  assert.equal(defaultTexts(4).length, 4);
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

test('meme: se puede cambiar el meme una sola vez, y no en el modo «todos el mismo»', () => {
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
  for (const p of room.players) room = applyAction(room, { type: 'submit', playerId: p.id, round: room.round, texts: Array.from({ length: 5 }, () => ({ t: '"'.repeat(80), x: 50, y: 50, s: 8 })) }, { now: 2000 });
  for (const author of room.order) room.votes[author] = Object.fromEntries(room.players.map((p) => [p.id, 5]));
  room.history = Array.from({ length: 5 }, (_, i) => ({ round: i, author: 'a', points: 50, template: tpl(i, 5), texts: room.memes.a }));
  const size = JSON.stringify(room).length;
  assert.ok(size < 30000, `${size}`);
});
