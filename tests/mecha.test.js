import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BONUS_LETTERS, createDictionary, matchesSyllable, normalizeWord,
} from '../src/mecha/words.js';
import {
  MAX_LIVES, MIN_TURN_MS, applyAction, findPlayer, newRoom, pickSyllable, wordProblem,
} from '../src/mecha/game.js';
import SYLLABLES from '../src/mecha/syllables.js';

const dict = createDictionary(readFileSync(new URL('../public/mecha/palabras.txt', import.meta.url), 'utf8'));
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

function playing(names = ['Ana', 'Beto', 'Caro'], options = {}) {
  let room = newRoom('a', names[0], '🐸', 1000);
  names.slice(1).forEach((n, i) => { room = applyAction(room, { type: 'join', playerId: 'abcdefgh'[i + 1], name: n }, { now: 1000 }); });
  if (Object.keys(options).length) room = applyAction(room, { type: 'setOptions', playerId: 'a', options }, { now: 1000 });
  return applyAction(room, { type: 'start', playerId: 'a' }, { now: 2000, rand: () => 0 });
}
// Busca en el diccionario una palabra válida para la sílaba actual.
function answer(room, skip = 0) {
  const text = readFileSync(new URL('../public/mecha/palabras.txt', import.meta.url), 'utf8');
  const found = text.split('\n').filter((w) => w && w !== room.syllable && matchesSyllable(w, room.syllable, room.options.mode) && !room.used.includes(w));
  return found[skip];
}

test('mecha: las tildes no cuentan, la ñ sí', () => {
  assert.equal(normalizeWord('  Canción '), 'cancion');
  assert.equal(normalizeWord('PINGÜINO'), 'pinguino');
  assert.equal(normalizeWord('Ñandú'), 'ñandu');
  assert.notEqual(normalizeWord('año'), normalizeWord('ano'));
});

test('mecha: el diccionario tiene conjugaciones, voseo y plurales, y no inventa', () => {
  for (const w of ['tenes', 'comiste', 'corrieron', 'cancion', 'pinguino', 'computadoras', 'pibe', 'choripan']) assert.ok(dict.has(w), w);
  for (const w of ['wsxq', 'asdasd', 'zarpadisimo', '']) assert.ok(!dict.has(w), w);
  assert.ok(dict.size > 500000);
});

test('mecha: toda sílaba de la lista tiene palabras en el diccionario', () => {
  const text = readFileSync(new URL('../public/mecha/palabras.txt', import.meta.url), 'utf8');
  for (const mode of ['anywhere', 'start']) {
    for (const len of [2, 3, 4]) {
      const list = SYLLABLES[mode][len];
      assert.ok(list.length > 50, `${mode} ${len}`);
      const sample = list[list.length - 1];
      const re = mode === 'start' ? new RegExp(`^${sample}`, 'm') : new RegExp(sample);
      assert.ok(re.test(text), sample);
    }
  }
  const rand = seq(0.1, 0.5, 0.9, 0.3);
  for (const difficulty of ['facil', 'normal', 'dificil']) {
    const s = pickSyllable({ mode: 'anywhere', difficulty }, rand);
    assert.ok(s.length >= 2 && s.length <= 4, s);
    if (difficulty === 'facil') assert.equal(s.length, 2);
    if (difficulty === 'dificil') assert.ok(s.length >= 3);
  }
});

test('mecha: arranca con todos vivos, con sus vidas y la mecha encendida', () => {
  const room = playing();
  assert.equal(room.phase, 'playing');
  assert.ok(room.players.every((p) => p.alive && p.lives === 2));
  assert.ok(room.fuse.deadline >= 2000 + MIN_TURN_MS);
  assert.equal(room.current, 'a');
  assert.ok(room.syllable.length >= 2);
});

test('mecha: no se puede empezar solo ni lo puede empezar otro que el anfitrión', () => {
  const solo = newRoom('a', 'Ana', '🐸', 0);
  assert.equal(applyAction(solo, { type: 'start', playerId: 'a' }), null);
  const two = applyAction(solo, { type: 'join', playerId: 'b', name: 'Beto' });
  assert.equal(applyAction(two, { type: 'start', playerId: 'b' }), null);
});

test('mecha: una palabra válida pasa la bomba al siguiente y cambia la sílaba', () => {
  const room = playing();
  const word = answer(room);
  const next = applyAction(room, { type: 'submit', playerId: 'a', word, turn: room.turn }, { now: 3000, rand: seq(0.7), dict });
  assert.ok(next);
  assert.equal(next.current, 'b');
  assert.equal(next.turn, room.turn + 1);
  assert.ok(next.used.includes(normalizeWord(word)));
  assert.equal(findPlayer(next, 'a').last, normalizeWord(word));
});

test('mecha: se rechaza lo que no tiene la sílaba, lo inventado, lo repetido y lo fuera de turno', () => {
  const room = playing();
  assert.match(wordProblem(room, 'zzz', dict), /Tiene que tener/);
  assert.match(wordProblem(room, `${room.syllable}qqqq`, dict), /no está en el diccionario/);
  const word = answer(room);
  assert.equal(applyAction(room, { type: 'submit', playerId: 'b', word, turn: room.turn }, { now: 3000, dict }), null);
  assert.equal(applyAction(room, { type: 'submit', playerId: 'a', word, turn: room.turn - 1 }, { now: 3000, dict }), null);
  const used = { ...room, used: [normalizeWord(word)] };
  assert.match(wordProblem(used, word, dict), /ya se usó/);
});

test('mecha: en modo «al principio» la palabra tiene que empezar con la sílaba', () => {
  const room = { ...playing(['Ana', 'Beto'], { mode: 'start' }), syllable: 'cas' };
  assert.equal(wordProblem(room, 'casa', dict), null);
  assert.match(wordProblem(room, 'encasillar', dict), /empezar con «CAS»/);
  const anywhere = { ...room, options: { ...room.options, mode: 'anywhere' } };
  assert.equal(wordProblem(anywhere, 'encasillar', dict), null);
});

test('mecha: la tilde es opcional al responder', () => {
  const room = { ...playing(), syllable: 'cio' };
  assert.equal(wordProblem(room, 'cancion', dict), null);
  assert.equal(wordProblem(room, 'canción', dict), null);
});

test('mecha: la bomba no explota antes de tiempo y al explotar le saca una vida al que la tiene', () => {
  const room = playing();
  assert.equal(applyAction(room, { type: 'explode', turn: room.turn }, { now: room.fuse.deadline - 1 }), null);
  const boom = applyAction(room, { type: 'explode', turn: room.turn }, { now: room.fuse.deadline, rand: () => 0.5 });
  assert.equal(findPlayer(boom, 'a').lives, 1);
  assert.equal(boom.current, 'b');
  assert.ok(boom.fuse.deadline > room.fuse.deadline);
  // Dos pantallas avisan la misma explosión: la segunda llega con el turno viejo y no hace nada.
  assert.equal(applyAction(boom, { type: 'explode', turn: room.turn }, { now: boom.fuse.deadline }), null);
});

test('mecha: el que se queda sin vidas sale y el último vivo gana', () => {
  let room = playing(['Ana', 'Beto'], { lives: 1 });
  room = applyAction(room, { type: 'explode', turn: room.turn }, { now: room.fuse.deadline, rand: () => 0.5 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'b');
  assert.equal(findPlayer(room, 'b').wins, 1);
  assert.equal(findPlayer(room, 'a').alive, false);
  // Revancha: el anfitrión vuelve a empezar y todos reviven.
  const again = applyAction(room, { type: 'start', playerId: 'a' }, { now: 99999, rand: () => 0 });
  assert.ok(again.players.every((p) => p.alive && p.lives === 1));
});

test('mecha: con tres jugadores, el muerto deja de recibir la bomba', () => {
  let room = playing(['Ana', 'Beto', 'Caro'], { lives: 1 });
  room = applyAction(room, { type: 'explode', turn: room.turn }, { now: room.fuse.deadline, rand: () => 0.5 });
  assert.equal(room.phase, 'playing');
  assert.equal(room.current, 'b');
  const word = answer(room);
  room = applyAction(room, { type: 'submit', playerId: 'b', word, turn: room.turn }, { now: room.fuse.litAt + 10, rand: () => 0.5, dict });
  assert.equal(room.current, 'c');
  const word2 = answer(room);
  room = applyAction(room, { type: 'submit', playerId: 'c', word: word2, turn: room.turn }, { now: room.fuse.litAt + 20, rand: () => 0.5, dict });
  assert.equal(room.current, 'b'); // se saltea a Ana
});

test('mecha: al pasar la bomba, el siguiente tiene al menos unos segundos', () => {
  const room = playing();
  const late = room.fuse.deadline - 500;
  const next = applyAction(room, { type: 'submit', playerId: 'a', word: answer(room), turn: room.turn }, { now: late, rand: () => 0.5, dict });
  assert.ok(next.fuse.deadline >= late + MIN_TURN_MS);
});

test('mecha: completar el abecedario da una vida extra', () => {
  const room = playing();
  const me = room.players[0];
  me.letters = BONUS_LETTERS.filter((c) => c !== 'z').join('');
  room.syllable = 'za';
  const next = applyAction(room, { type: 'submit', playerId: 'a', word: 'zapato', turn: room.turn }, { now: 3000, rand: () => 0.5, dict });
  assert.equal(findPlayer(next, 'a').lives, 3);
  assert.equal(findPlayer(next, 'a').letters, '');
  assert.equal(next.log.at(-1).t, 'bonus');
  const full = structuredClone(room);
  full.players[0].lives = MAX_LIVES;
  const capped = applyAction(full, { type: 'submit', playerId: 'a', word: 'zapato', turn: full.turn }, { now: 3000, rand: () => 0.5, dict });
  assert.equal(findPlayer(capped, 'a').lives, MAX_LIVES);
});

test('mecha: si se va el que tiene la bomba, pasa al siguiente; si queda uno solo, gana', () => {
  let room = playing();
  room = applyAction(room, { type: 'leave', playerId: 'a' }, { now: 3000, rand: () => 0.5 });
  assert.equal(room.current, 'b');
  assert.equal(room.hostId, 'b');
  room = applyAction(room, { type: 'leave', playerId: 'c' }, { now: 3100, rand: () => 0.5 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'b');
});

test('mecha: los que entran con la partida empezada miran hasta la próxima', () => {
  const room = playing(['Ana', 'Beto']);
  const joined = applyAction(room, { type: 'join', playerId: 'z', name: 'Zoe' }, { now: 3000 });
  assert.equal(findPlayer(joined, 'z').alive, false);
  assert.equal(joined.current, room.current);
});

test('mecha: una partida larga no rompe el tope de la sala', () => {
  const room = playing(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']);
  room.used = Array.from({ length: 2000 }, (_, i) => `palabralarguisima${i}`).slice(-800);
  room.log = Array.from({ length: 14 }, () => ({ t: 'ok', id: 'a', w: 'electroencefalografista', s: 'cef' }));
  assert.ok(JSON.stringify(room).length < 30000, `${JSON.stringify(room).length}`);
});
