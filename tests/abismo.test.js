import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JUDGE_GRACE_MS, MAX_PLAYERS, REVEAL_MS, allAnswers, answersOf, applyAction, cleanVerdict, findPlayer, newRoom, pickPrompts, promptAt,
  ranking, resultFor,
} from '../src/abismo/game.js';
import { PROMPTS, PROMPT_BY_ID } from '../src/abismo/prompts.js';
import { MAX_ANSWER, TIERS, answerKey, cleanAnswer, depthOf, isNiche, tierForRarity } from '../src/abismo/tiers.js';
import {
  RATE_MAX, allowJudge, buildJudgePrompt, cleanResult, fakeVerdict, mergePlayer, parseVerdict, playerKey, rankingTables, scoreOf, signAnswer,
  verdictToResult, verifyAnswer,
} from '../worker/juez.js';
import { MAX_ROOM_STRING } from '../worker/rules.js';

const rand = () => 0.3;
function lobby(names = ['Ana', 'Beto', 'Caro']) {
  let room = newRoom('a', names[0], '🐸', 0);
  names.slice(1).forEach((n, i) => { room = applyAction(room, { type: 'join', playerId: 'abcdefghijkl'[i + 1], name: n, avatar: '🦊' }, { now: 0 }); });
  return room;
}
const start = (room, now = 1000) => applyAction(room, { type: 'start', playerId: 'a' }, { now, rand });
const answer = (room, id, tier, text = `resp ${id}`, now = 2000) => applyAction(room, { type: 'answer', playerId: id, round: room.round, text, canonical: text, tier, note: 'nota', sig: 'ab12cd34ef56ab12' }, { now });

test('abismo: las consignas tienen id único, texto y referencias, y hay muchas', () => {
  assert.ok(PROMPTS.length >= 200, `${PROMPTS.length}`);
  assert.equal(new Set(PROMPTS.map((p) => p.id)).size, PROMPTS.length);
  for (const p of PROMPTS) {
    assert.ok(/^[a-z0-9-]+$/.test(p.id), p.id);
    assert.ok(p.text.length > 8 && p.text.length <= 90, p.text);
    assert.ok(p.ex.length >= 3 && p.ex.length <= 4, p.id);
  }
});

test('abismo: los niveles van de Plancton a Uno en un millón según la rareza, y cada punto son 10 metros', () => {
  assert.equal(tierForRarity(0).id, 'plancton');
  assert.equal(tierForRarity(5).pts, 10);
  assert.equal(tierForRarity(25).id, 'vivillo');
  assert.equal(tierForRarity(40).id, 'cardumen');
  assert.equal(tierForRarity(60).id, 'raro');
  assert.equal(tierForRarity(80).id, 'abisal');
  assert.equal(tierForRarity(95).id, 'krill');
  assert.equal(tierForRarity(100).pts, 100);
  assert.equal(tierForRarity('zzz').id, 'plancton');
  assert.deepEqual(TIERS.map((t) => t.pts), [10, 15, 30, 60, 85, 100]);
  assert.equal(depthOf(60), 600);
  assert.ok(isNiche('abisal') && isNiche('krill') && !isNiche('raro'));
});

test('abismo: la clave de una respuesta ignora mayúsculas, tildes y signos', () => {
  assert.equal(answerKey('  Pingüino   Emperador! '), 'pinguino emperador');
  assert.equal(answerKey('Pinguino emperador'), answerKey('pingüino EMPERADOR'));
  assert.equal(cleanAnswer('x'.repeat(100)).length, MAX_ANSWER);
  assert.equal(answerKey('Ñandú'), 'ñandu');
});

test('abismo: arrancar elige consignas sin repetir las ya jugadas en la sala y abre la primera ronda', () => {
  let room = start(lobby());
  assert.equal(room.phase, 'prompt');
  assert.equal(room.round, 1);
  assert.equal(room.prompts.length, 7);
  assert.equal(new Set(room.prompts).size, 7);
  assert.equal(room.phaseEndsAt, 1000 + 25000);
  assert.ok(promptAt(room).text);
  assert.ok(room.players.every((p) => p.inGame && p.score === 0));
  const picks = pickPrompts(5, room.used, Math.random);
  assert.ok(picks.every((id) => !room.used.includes(id)));
  // Con casi todo usado, igual elige la cantidad pedida.
  assert.equal(pickPrompts(7, PROMPTS.map((p) => p.id), Math.random).length, 7);
  room = applyAction(room, { type: 'setOptions', playerId: 'a', options: { rounds: 5 } }, { now: 0 });
  assert.equal(room, null, 'las opciones solo se cambian en la sala de espera');
});

test('abismo: se puede jugar solo, y el revelado espera a «Descender»', () => {
  let room = start(newRoom('a', 'Ana', '🐸', 0));
  room = answer(room, 'a', 'raro', 'pez piedra');
  assert.equal(room.phase, 'reveal');
  assert.equal(room.phaseEndsAt, 0, 'con uno solo no hay reloj en el revelado');
  assert.equal(findPlayer(room, 'a').score, 60);
  assert.equal(applyAction(room, { type: 'tick', playerId: 'a', round: 1, phase: 'reveal' }, { now: 99999999 }), null);
  room = applyAction(room, { type: 'next', playerId: 'a', round: 1 }, { now: 3000 });
  assert.equal(room.phase, 'prompt');
  assert.equal(room.round, 2);
});

test('abismo: cada uno responde una vez por ronda; cuando respondieron todos se revela y se suman los puntos', () => {
  let room = start(lobby());
  room = answer(room, 'a', 'plancton', 'manzana');
  assert.equal(answer(room, 'a', 'krill', 'otra'), null, 'no se puede responder dos veces');
  assert.equal(applyAction(room, { type: 'answer', playerId: 'b', round: 1, text: 'x', tier: 'inventado' }, { now: 2000 }), null);
  assert.equal(applyAction(room, { type: 'answer', playerId: 'b', round: 7, text: 'x', tier: 'raro' }, { now: 2000 }), null, 'ronda vieja');
  assert.equal(room.phase, 'prompt');
  room = answer(room, 'b', 'krill', 'chirimoya');
  room = answer(room, 'c', 'cardumen', 'kiwi', 2500);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.phaseEndsAt, 2500 + REVEAL_MS);
  assert.deepEqual(room.players.map((p) => p.score), [10, 100, 30]);
  assert.deepEqual(ranking(room).map((p) => `${p.name}:${p.place}`), ['Beto:1', 'Caro:2', 'Ana:3']);
  assert.equal(answersOf(room).b.c, 'chirimoya');
  assert.equal(answersOf(room).b.t, undefined, 'lo escrito va solo si difiere de la forma correcta');
  assert.equal(answersOf(room).b.g, 'ab12cd34ef56ab12');
});

test('abismo: el reloj cierra la consigna con margen para el juez, y el que no respondió queda en 0', () => {
  let room = start(lobby());
  room = answer(room, 'a', 'raro', 'kumquat');
  const deadline = room.phaseEndsAt;
  assert.equal(applyAction(room, { type: 'tick', playerId: 'b', round: 1, phase: 'prompt' }, { now: deadline + 1000 }), null, 'todavía se espera al juez');
  room = applyAction(room, { type: 'tick', playerId: 'b', round: 1, phase: 'prompt' }, { now: deadline + JUDGE_GRACE_MS });
  assert.equal(room.phase, 'reveal');
  assert.deepEqual(room.players.map((p) => p.score), [60, 0, 0]);
  assert.equal(applyAction(room, { type: 'tick', playerId: 'b', round: 1, phase: 'reveal' }, { now: room.phaseEndsAt - 1 }), null);
  room = applyAction(room, { type: 'tick', playerId: 'b', round: 1, phase: 'reveal' }, { now: room.phaseEndsAt });
  assert.equal(room.phase, 'prompt');
  assert.equal(room.round, 2);
  assert.ok(room.answers[1] && !Object.keys(room.answers[1]).length);
});

test('abismo: después de la última ronda viene el final, con todas las respuestas ordenadas por profundidad', () => {
  let room = applyAction(lobby(['Ana', 'Beto']), { type: 'setOptions', playerId: 'a', options: { rounds: 5, seconds: 15 } }, { now: 0 });
  room = start(room);
  assert.equal(room.phaseEndsAt, 1000 + 15000);
  for (let r = 1; r <= 5; r++) {
    room = answer(room, 'a', r === 3 ? 'krill' : 'plancton', `a${r}`);
    room = answer(room, 'b', 'abisal', `b${r}`);
    assert.equal(room.phase, 'reveal');
    room = applyAction(room, { type: 'next', playerId: 'a', round: r }, { now: 5000 });
  }
  assert.equal(room.phase, 'final');
  const all = allAnswers(room);
  assert.equal(all.length, 10);
  assert.equal(all[0].answer.c, 'a3');
  assert.equal(all[0].answer.p, 100);
  assert.equal(all[all.length - 1].answer.p, 10);
  assert.deepEqual(ranking(room).map((p) => [p.name, p.score]), [['Beto', 425], ['Ana', 140]]);
  const mine = resultFor(room, 'b');
  assert.equal(mine.answers.length, 5);
  assert.equal(mine.answers[0].promptId, room.prompts[0]);
  assert.equal(mine.answers[0].sig, 'ab12cd34ef56ab12');
  // Otra partida desde el final, sin repetir consignas.
  const again = start(room, 9000);
  assert.equal(again.phase, 'prompt');
  assert.ok(again.prompts.every((id) => !room.prompts.includes(id)));
  assert.ok(again.players.every((p) => p.score === 0));
});

test('abismo: el que entra con la partida empezada mira y juega la próxima; el que se va no traba la ronda', () => {
  let room = start(lobby(['Ana', 'Beto']));
  room = applyAction(room, { type: 'join', playerId: 'z', name: 'Zoe' }, { now: 1500 });
  assert.equal(findPlayer(room, 'z').inGame, false);
  assert.equal(answer(room, 'z', 'raro'), null);
  room = answer(room, 'a', 'raro');
  assert.equal(room.phase, 'prompt');
  room = applyAction(room, { type: 'leave', playerId: 'b' }, { now: 2000 });
  assert.equal(room.phase, 'reveal', 'quedó uno solo con respuesta: se revela');
  assert.equal(room.phaseEndsAt, 0, 'y sin reloj, porque juega uno');
  room = applyAction(room, { type: 'toLobby', playerId: 'a' }, { now: 3000 });
  assert.equal(room.phase, 'lobby');
  room = start(room, 4000);
  assert.equal(findPlayer(room, 'z').inGame, true);
});

test('abismo: el veredicto que llega en la acción se limpia (nota con tope, firma hexadecimal)', () => {
  const v = cleanVerdict({ text: '  Pez   piedra ', canonical: 'Pez piedra', tier: 'raro', note: 'x'.repeat(200), sig: 'NOPE' });
  assert.deepEqual({ ...v, n: v.n.length }, { c: 'Pez piedra', k: 'raro', p: 60, n: 60 });
  const w = cleanVerdict({ text: 'pes piedra', canonical: 'Pez piedra', tier: 'raro', note: 'Dijo "pes"', sig: 'ab12cd34ef56ab12' });
  assert.deepEqual(w, { c: 'Pez piedra', t: 'pes piedra', k: 'raro', p: 60, n: 'Dijo pes', g: 'ab12cd34ef56ab12' });
  assert.equal(cleanVerdict({ text: '', tier: 'raro' }), null);
  assert.equal(cleanVerdict({ text: 'hola', tier: 'nope' }), null);
});

test('abismo: la sala llena, con todas las respuestas y notas, queda lejos del tope de 30.000 caracteres', () => {
  let room = newRoom('p0', 'Jugador 0'.padEnd(20, 'x'), '🐸', 0);
  for (let i = 1; i < MAX_PLAYERS; i++) room = applyAction(room, { type: 'join', playerId: `player-id-${i}`, name: `Jugador ${i}`.padEnd(20, 'x'), avatar: '🦄' }, { now: 0 });
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { rounds: 10 } }, { now: 0 });
  room = applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand });
  for (let r = 1; r <= 10; r++) {
    for (const p of room.players) {
      room = applyAction(room, { type: 'answer', playerId: p.id, round: r, text: 'w'.repeat(MAX_ANSWER), canonical: 'v'.repeat(MAX_ANSWER), tier: 'abisal', note: 'ñ'.repeat(90), sig: 'f'.repeat(32) }, { now: 2000 });
    }
    room = applyAction(room, { type: 'next', playerId: 'p0', round: r }, { now: 3000 });
  }
  assert.equal(room.phase, 'final');
  const size = JSON.stringify(room).length;
  assert.ok(size < MAX_ROOM_STRING * 0.8, `${size}`);
});

// ─── El juez ─────────────────────────────────────────────────────────────────
test('juez: el mensaje lleva la consigna, las referencias y la respuesta, y se lee lo que contesta el modelo', () => {
  const prompt = PROMPT_BY_ID.fruta;
  const { system, user } = buildJudgePrompt(prompt, '  chirimoya ');
  assert.ok(system.includes('"rarity"'));
  assert.ok(user.includes('«Nombrá una fruta»') && user.includes('manzana') && user.includes('«chirimoya»'));
  const v = parseVerdict('Acá va:\n{"valid": true, "canonical": "Chirimoya", "rarity": 71, "reason": "", "note": "Qué  rica"}\n');
  assert.deepEqual(v, { valid: true, canonical: 'Chirimoya', rarity: 71, reason: '', note: 'Qué rica' });
  assert.deepEqual(parseVerdict({ valid: false, canonical: '', rarity: 'x', reason: 'No es fruta', note: '' }).reason, 'No es fruta');
  assert.equal(parseVerdict('no sé'), null);
  assert.equal(parseVerdict('{"valid": "sí"}'), null);
  assert.equal(parseVerdict({ valid: true, rarity: 150 }).rarity, 100);
});

test('juez: del veredicto al resultado: nivel, puntos y nota; una inválida trae el motivo', () => {
  const ok = verdictToResult('chirimoya', { valid: true, canonical: 'Chirimoya', rarity: 71, reason: '', note: 'Bien' });
  assert.deepEqual(ok, { ok: true, text: 'chirimoya', canonical: 'Chirimoya', tier: 'raro', pts: 60, rarity: 71, note: 'Bien' });
  assert.deepEqual(verdictToResult('auto', { valid: false, canonical: '', rarity: 0, reason: 'No es fruta', note: '' }), { ok: false, reason: 'No es fruta' });
  assert.equal(verdictToResult('x', null).ok, false);
  const fake = fakeVerdict(PROMPT_BY_ID.fruta, 'Manzana');
  assert.equal(fake.rarity, 5);
  assert.equal(fakeVerdict(PROMPT_BY_ID.fruta, 'chirimoya').valid, true);
  assert.equal(fakeVerdict(PROMPT_BY_ID.fruta, 'ab').valid, false);
  assert.equal(fakeVerdict(PROMPT_BY_ID.fruta, 'chirimoya').rarity, fakeVerdict(PROMPT_BY_ID.fruta, 'CHIRIMOYA ').rarity, 'determinista');
});

test('juez: la firma depende del secreto, la consigna, la respuesta normalizada y el nivel', async () => {
  const sig = await signAnswer('clave', 'fruta', 'Chirimoya', 'raro');
  assert.match(sig, /^[a-f0-9]{16}$/);
  assert.equal(sig, await signAnswer('clave', 'fruta', 'chirimoya!', 'raro'));
  assert.notEqual(sig, await signAnswer('clave', 'fruta', 'Chirimoya', 'krill'));
  assert.notEqual(sig, await signAnswer('otra', 'fruta', 'Chirimoya', 'raro'));
  assert.equal(await verifyAnswer('clave', { promptId: 'fruta', canonical: 'Chirimoya', tier: 'raro', sig }), true);
  assert.equal(await verifyAnswer('clave', { promptId: 'fruta', canonical: 'Chirimoya', tier: 'krill', sig }), false);
  assert.equal(await verifyAnswer('clave', { promptId: 'fruta', canonical: 'Chirimoya', tier: 'raro' }), false);
});

test('juez: límite de veredictos por minuto', () => {
  let times = [];
  for (let i = 0; i < RATE_MAX; i++) { const r = allowJudge(times, 1000 + i); assert.ok(r.ok); times = r.times; }
  assert.equal(allowJudge(times, 2000).ok, false);
  assert.equal(allowJudge(times, 1000 + 61_000).ok, true, 'pasado el minuto, de nuevo');
});

test('juez: el ranking suma partidas por nombre, cuenta las nicho y arma las dos tablas', () => {
  const clean = cleanResult({ name: '  Feli  ', avatar: '🐸', answers: [
    { promptId: 'fruta', canonical: 'Chirimoya', tier: 'raro', sig: 'x' },
    { promptId: 'fruta', canonical: 'Zapote', tier: 'krill', sig: 'y' },
    { promptId: 'nope', canonical: 'Nada', tier: 'raro' },
    { promptId: 'perro', canonical: 'Xoloitzcuintle', tier: 'abisal', sig: 'z' },
    { promptId: 'perro', canonical: '', tier: 'abisal', sig: 'z' },
  ] });
  assert.equal(clean.name, 'Feli');
  assert.equal(clean.answers.length, 3);
  assert.equal(scoreOf(clean.answers), 60 + 100 + 85);
  const p1 = mergePlayer(null, clean, 10);
  assert.deepEqual(p1, { name: 'Feli', avatar: '🐸', games: 1, best: 245, niche: 2, krill: 1, total: 245, at: 10 });
  const p2 = mergePlayer(p1, { ...clean, answers: [{ promptId: 'fruta', canonical: 'Pera', tier: 'plancton' }] }, 20);
  assert.deepEqual([p2.games, p2.best, p2.niche, p2.total], [2, 245, 2, 255]);
  assert.equal(playerKey('FELI '), playerKey('feli'));
  assert.equal(cleanResult({ name: '', answers: [] }).error, 'Falta el nombre.');
  assert.ok(cleanResult({ name: 'x', answers: [{ promptId: 'nope' }] }).error);
  const tables = rankingTables({ a: { name: 'A', niche: 1, krill: 0, best: 300 }, b: { name: 'B', niche: 3, krill: 1, best: 200 } }, 10);
  assert.deepEqual(tables.niche.map((p) => p.name), ['B', 'A']);
  assert.deepEqual(tables.best.map((p) => p.name), ['A', 'B']);
});
