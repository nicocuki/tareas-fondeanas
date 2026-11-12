import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, CHOICES, KEYPAD, QUICK, isEnabled, mainButton, newUi, phaseOf, press, statusOf } from '../src/timba/controls.js';
import { applyAction, newRoom } from '../src/timba/game.js';
import { limitsFor } from '../src/timba/games.js';
import { FLOOR_OF_TABLE, TABLES } from '../src/timba/scenes.js';

// Una partida con un jugador parado en el piso de la mesa `kind` (la primera que haya) y sentado en ella.
function seated(kind, seed = 1) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let room = applyAction(newRoom('a', 'Ana', '🐸', 0), { type: 'start', playerId: 'a' }, { now: 0 });
  const spot = TABLES.find((t) => t.kind === kind);
  room.players[0].loc = `f${FLOOR_OF_TABLE[spot.id]}`;
  room.money = 50000;
  room = applyAction(room, { type: 'sit', playerId: 'a', table: spot.id }, { now: 0, rand });
  return { room, spot, rand };
}
const ctxOf = (room, spot, now) => ({ kind: spot.kind, t: room.tb[spot.id] || null, room, now });

test('timba controles: el teclado escribe, borra y los botones rápidos ponen el mínimo, 1/4, 1/2 y todo', () => {
  const { room, spot } = seated('bj');
  const ctx = ctxOf(room, spot, 0);
  let ui = newUi('bj');
  assert.equal(ui.amount, limitsFor('bj', 1)[0]);
  ui = press('k:1', ui, ctx).ui;
  assert.equal(ui.amount, 1, 'el primer dígito empieza un número nuevo');
  ui = press('k:2', ui, ctx).ui;
  ui = press('k:000', ui, ctx).ui;
  assert.equal(ui.amount, 12000);
  ui = press('k:C', ui, ctx).ui;
  assert.equal(ui.amount, 0);
  for (const [k] of QUICK) assert.ok(press(`q:${k}`, ui, ctx).ui.amount >= limitsFor('bj', 1)[0]);
  assert.equal(press('q:all', ui, ctx).ui.amount, limitsFor('bj', 1)[1]);
  assert.equal(KEYPAD.length, 12);
});

test('timba controles: una apuesta fuera de los límites no se manda y avisa', () => {
  const { room, spot } = seated('slots');
  const ctx = ctxOf(room, spot, 0);
  const low = press('a:play', { ...newUi('slots'), amount: 0 }, ctx);
  assert.ok(!low.action && /mínima/.test(low.toast));
  const high = press('a:play', { ...newUi('slots'), amount: 999999 }, ctx);
  assert.ok(!high.action && /máxima/.test(high.toast));
  assert.equal(high.ui.amount, limitsFor('slots', 1)[1], 'se baja al máximo');
  const kenoEmpty = seated('keno');
  assert.equal(isEnabled('a:play', newUi('keno'), ctxOf(kenoEmpty.room, kenoEmpty.spot, 0)), false, 'en el keno sin números no se juega');
});

// Juega una ronda entera tocando solo botones prendidos: lo que manda cada botón lo acepta la sala.
function playRound(kind, picks, seed) {
  let { room, spot, rand } = seated(kind, seed);
  let ui = newUi(kind);
  let now = 1000;
  for (const btn of picks) ui = press(btn, ui, ctxOf(room, spot, now)).ui;
  const sent = [];
  for (let step = 0; step < 40; step++) {
    const ctx = ctxOf(room, spot, now);
    const btn = step === 0 ? 'a:play' : mainButton(kind, ui, ctx);
    const extra = ['a:hit', 'a:hi', 'a:lo', 'c:0', 'c:1', 'c:2'].find((b) => step > 0 && isEnabled(b, ui, ctx));
    const use = kind === 'bj' && extra ? 'a:stand' : kind === 'hilo' && extra ? extra : kind === 'mines' && extra && step < 3 ? extra : btn;
    if (!isEnabled(use, ui, ctx)) { now += 500; continue; }
    const res = press(use, ui, ctx, rand);
    ui = res.ui;
    let action = res.action;
    if (res.roll) action = { type: 'crapsRoll', dice: [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)] };
    if (!action) break;
    const next = applyAction(room, { ...action, playerId: 'a' }, { now, rand });
    assert.ok(next, `${kind}: la sala rechazó ${JSON.stringify(action)} del botón ${use}`);
    sent.push(action.type);
    room = next;
    now += 300;
    const ph = phaseOf(kind, room.tb[spot.id], room, now);
    if (!ph.busy && step > 0 && kind !== 'bj') break;
    if (kind === 'bj' && room.tb[spot.id].phase === 'result') break;
    if (ph.running) { now += 20000; const settled = applyAction(room, { type: 'settle', playerId: 'a' }, { now, rand }); if (settled) room = settled; break; }
  }
  return { room, spot, sent };
}

test('timba controles: en los 14 juegos, lo que mandan los botones prendidos lo acepta la sala', () => {
  const picks = { roulette: ['s:n17'], duck: ['d:2'], keno: ['n:3', 'n:9', 'n:22'], baccarat: ['b:banker'], mwheel: ['w:10'], mines: ['m:5'] };
  for (const kind of Object.keys(ACTIONS)) {
    for (let seed = 1; seed < 6; seed++) {
      const { sent, room, spot } = playRound(kind, picks[kind] || [], seed);
      assert.ok(sent.length >= 1, `${kind}: se mandó algo`);
      assert.ok(Number.isInteger(room.money) && room.money >= 0);
      const st = statusOf(newUi(kind), ctxOf(room, spot, 99999999));
      assert.ok(st.text.length > 3, `${kind}: el cartel dice algo`);
    }
  }
});

test('timba controles: lo que se elige en la mesa es lo que se apuesta', () => {
  const { room, spot } = seated('roulette');
  const ctx = ctxOf(room, spot, 0);
  let ui = press('s:d2', newUi('roulette'), ctx).ui;
  assert.deepEqual(press('a:play', ui, ctx).action, { type: 'spin', amount: ui.amount, spot: 'd2' });
  for (const id of CHOICES.roulette) assert.ok(press(id, newUi('roulette'), ctx).ui.spot, id);
  const k = seated('keno');
  let kui = newUi('keno');
  for (let i = 0; i < 12; i++) kui = press(`n:${i}`, kui, ctxOf(k.room, k.spot, 0)).ui;
  assert.equal(kui.picks.length, 10, 'hasta 10 números');
  kui = press('n:0', kui, ctxOf(k.room, k.spot, 0)).ui;
  assert.equal(kui.picks.length, 9, 'tocar uno elegido lo saca');
  const m = seated('mines');
  ui = press('m:10', newUi('mines'), ctxOf(m.room, m.spot, 0)).ui;
  assert.equal(press('a:play', ui, ctxOf(m.room, m.spot, 0)).action.mines, 10);
});

test('timba controles: la mesa de otro no se puede tocar y en medio de una ronda el teclado se apaga', () => {
  const ui = newUi('crash');
  let started; let spot;
  for (let seed = 1; !started || started.tb[spot.id].point < 120; seed++) {
    const s = seated('crash', seed);
    spot = s.spot;
    started = applyAction(s.room, { ...press('a:play', ui, ctxOf(s.room, spot, 0)).action, playerId: 'a' }, { now: 0, rand: s.rand });
  }
  const ctx = ctxOf(started, spot, 10);
  assert.equal(isEnabled('k:5', ui, ctx), false);
  assert.equal(isEnabled('a:cash', ui, ctx), true);
  assert.equal(statusOf(ui, ctx, 'Ana').text.startsWith('Ana: '), true, 'el cartel dice quién juega');
});
