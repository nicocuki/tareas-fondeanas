import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_END_MS, COUNTDOWN_MS, PICK_MS, REVEAL_MS, applyAction, currentPicker, findPlayer, newRoom } from '../src/tiros/game.js';
import { CARDS, CARD_IDS, dealCards, statsFor } from '../src/tiros/cards.js';
import { MAPS, WORLD_H, WORLD_W } from '../src/tiros/maps.js';
import { PLAYER_R, STEP, bulletDamage, bulletsForShot, circleRect, newPlayerState, seeded, stepBullet, stepPlayer, touches } from '../src/tiros/sim.js';

const rand = seeded(7);
function lobby(names = ['Ana', 'Beto']) {
  let room = newRoom('a', names[0], '🐸', 0);
  names.slice(1).forEach((n, i) => { room = applyAction(room, { type: 'join', playerId: 'bcd'[i], name: n }, { now: 0 }); });
  return room;
}
// Eligen de a uno: el de turno elige la primera carta y, pasado el momento en que se ve, sigue el otro.
function pickAll(room, now) {
  while (room.phase === 'picking') {
    room = applyAction(room, { type: 'pick', playerId: currentPicker(room), turn: room.picking.at, card: room.picking.hand[0] }, { now, rand });
    now += REVEAL_MS;
    room = applyAction(room, { type: 'tick', phase: 'picking' }, { now, rand });
  }
  return room;
}
const kill = (room, id, now) => applyAction(room, { type: 'died', playerId: id, battle: room.battle.n }, { now, rand });

test('tiros: al empezar eligen todos una carta, de a uno, y después arranca la pelea con cuenta regresiva', () => {
  let room = applyAction(lobby(), { type: 'start', playerId: 'a' }, { now: 1000, rand });
  assert.equal(room.phase, 'picking');
  assert.deepEqual(room.picking.order, ['a', 'b']);
  assert.equal(currentPicker(room), 'a');
  assert.equal(room.picking.hand.length, 5);
  assert.equal(new Set(room.picking.hand).size, 5);
  assert.equal(applyAction(room, { type: 'pick', playerId: 'a', turn: 0, card: 'noexiste' }, { now: 1100 }), null);
  room = pickAll(room, 2000);
  assert.equal(room.phase, 'fight');
  assert.equal(room.battle.startsAt, 2000 + 2 * REVEAL_MS + COUNTDOWN_MS);
  assert.equal(findPlayer(room, 'a').cards.length, 1);
  assert.deepEqual(Object.values(room.battle.spawns).sort(), [0, 1]);
});

test('tiros: nadie puede morir durante la cuenta regresiva, ni dos veces, ni en otra pelea', () => {
  let room = pickAll(applyAction(lobby(['Ana', 'Beto', 'Caro']), { type: 'start', playerId: 'a' }, { now: 0, rand }), 0);
  assert.equal(kill(room, 'b', 100), null);
  const t = room.battle.startsAt + 10;
  room = kill(room, 'b', t);
  assert.equal(room.phase, 'fight'); // quedan dos
  assert.equal(kill(room, 'b', t + 1), null);
  assert.equal(applyAction(room, { type: 'died', playerId: 'c', battle: 99 }, { now: t }), null);
  room = kill(room, 'c', t + 2);
  assert.equal(room.phase, 'battleEnd');
  assert.equal(room.battle.winner, 'a');
  assert.equal(findPlayer(room, 'a').wins, 1);
});

test('tiros: con 2 peleas ganadas se gana la ronda y eligen carta solo los que perdieron', () => {
  let room = pickAll(applyAction(lobby(['Ana', 'Beto', 'Caro']), { type: 'start', playerId: 'a' }, { now: 0, rand }), 0);
  for (let i = 0; i < 2; i++) {
    const t = room.battle.startsAt + 5;
    room = kill(kill(room, 'b', t), 'c', t);
    room = applyAction(room, { type: 'tick', phase: 'battleEnd', battle: room.battle.n }, { now: t + BATTLE_END_MS, rand });
  }
  assert.equal(room.phase, 'picking');
  assert.deepEqual(room.picking.order, ['b', 'c']);
  assert.equal(findPlayer(room, 'a').points, 1);
  assert.ok(room.players.every((p) => p.wins === 0));
  assert.equal(room.roundWinner, 'a');
});

test('tiros: el primero en llegar a los puntos gana la partida', () => {
  let room = applyAction(lobby(), { type: 'setOptions', playerId: 'a', options: { rounds: 3, battles: 1 } });
  room = pickAll(applyAction(room, { type: 'start', playerId: 'a' }, { now: 0, rand }), 0);
  for (let i = 0; i < 3; i++) {
    const t = room.battle.startsAt + 5;
    room = kill(room, 'a', t);
    room = applyAction(room, { type: 'tick', phase: 'battleEnd', battle: room.battle.n }, { now: t + BATTLE_END_MS, rand });
    if (room.phase === 'picking') room = pickAll(room, t + BATTLE_END_MS);
  }
  assert.equal(room.phase, 'final');
  assert.equal(room.champion, 'b');
  assert.equal(findPlayer(room, 'a').cards.length, 3); // la del principio + una por cada ronda perdida
});

test('tiros: solo elige el de turno, una vez; la elegida se ve un momento y pasa el siguiente', () => {
  let room = applyAction(lobby(['Ana', 'Beto', 'Caro']), { type: 'start', playerId: 'a' }, { now: 0, rand });
  const card = room.picking.hand[2];
  assert.equal(applyAction(room, { type: 'pick', playerId: 'b', turn: 0, card }, { now: 10, rand }), null);
  assert.equal(applyAction(room, { type: 'pick', playerId: 'a', turn: 1, card }, { now: 10, rand }), null);
  room = applyAction(room, { type: 'pick', playerId: 'a', turn: 0, card }, { now: 10, rand });
  assert.equal(room.picking.chosen, card);
  assert.deepEqual(findPlayer(room, 'a').cards, [card]);
  assert.equal(applyAction(room, { type: 'pick', playerId: 'a', turn: 0, card: room.picking.hand[0] }, { now: 20, rand }), null);
  assert.equal(applyAction(room, { type: 'tick', phase: 'picking' }, { now: 10 + REVEAL_MS - 1, rand }), null);
  room = applyAction(room, { type: 'tick', phase: 'picking' }, { now: 10 + REVEAL_MS, rand });
  assert.equal(currentPicker(room), 'b');
  assert.equal(room.picking.chosen, null);
  assert.equal(room.phaseEndsAt, 10 + REVEAL_MS + PICK_MS);
});

test('tiros: si se acaba el tiempo de elegir le toca una al azar; si alguien se va, sigue sin él', () => {
  let room = applyAction(lobby(['Ana', 'Beto', 'Caro']), { type: 'start', playerId: 'a' }, { now: 0, rand });
  const hand = room.picking.hand;
  assert.equal(applyAction(room, { type: 'tick', phase: 'picking' }, { now: PICK_MS - 1, rand }), null);
  room = applyAction(room, { type: 'tick', phase: 'picking' }, { now: PICK_MS, rand });
  assert.ok(hand.includes(room.picking.chosen));
  assert.deepEqual(findPlayer(room, 'a').cards, [room.picking.chosen]);
  room = applyAction(room, { type: 'tick', phase: 'picking' }, { now: PICK_MS + REVEAL_MS, rand });
  assert.equal(currentPicker(room), 'b');
  room = applyAction(room, { type: 'leave', playerId: 'b' }, { now: PICK_MS + REVEAL_MS + 5, rand }); // se va el que elegía
  assert.equal(currentPicker(room), 'c');
  room = pickAll(room, PICK_MS * 2);
  assert.equal(room.phase, 'fight');
  assert.deepEqual(Object.keys(room.battle.spawns).sort(), ['a', 'c']);
  room = applyAction(room, { type: 'leave', playerId: 'c' }, { now: room.battle.startsAt + 1, rand });
  assert.equal(room.phase, 'lobby'); // queda uno solo
});

test('tiros: el anfitrión puede dar por muerto a alguien que se desconectó, los demás no', () => {
  let room = pickAll(applyAction(lobby(['Ana', 'Beto', 'Caro']), { type: 'start', playerId: 'a' }, { now: 0, rand }), 0);
  const t = room.battle.startsAt + 1;
  assert.equal(applyAction(room, { type: 'died', playerId: 'b', target: 'c', battle: room.battle.n }, { now: t }).battle.dead.c, undefined);
  room = applyAction(room, { type: 'died', playerId: 'a', target: 'c', battle: room.battle.n }, { now: t, rand });
  assert.equal(room.battle.dead.c, true);
});

test('tiros: las cartas cambian las estadísticas con los números del original', () => {
  const base = statsFor([]);
  assert.equal(base.hp, 100);
  assert.equal(base.ammo, 3);
  const s = statsFor(['combinar', 'combinar', 'tanque', 'cuerda']);
  assert.equal(s.dmg, 55 * 2 * 2 * 1.6);
  assert.equal(s.ammo, 1); // nunca menos de una bala
  assert.equal(s.hp, 200);
  assert.ok(Math.abs(s.cooldown - 0.3 * 1.25 * 2) < 1e-9);
  assert.ok(Math.abs(s.reload - (2 + 0.5 + 0.5 + 0.5 + 0.5)) < 1e-9);
  assert.equal(statsFor(['lluvia']).ammo, 15);
  assert.deepEqual(statsFor(['onda', 'onda', 'helado']).blockFx, ['shock', 'frost']);
  assert.ok(CARD_IDS.length >= 30);
  for (const id of CARD_IDS) assert.ok(CARDS[id].lines.length && CARDS[id].name, id);
  const hand = dealCards(seeded(3));
  assert.equal(new Set(hand).size, 5);
});

test('tiros: los mapas entran en el mundo y nadie aparece adentro de una pared', () => {
  for (const map of MAPS) {
    assert.equal(map.spawns.length, 4, map.name);
    for (const [x, y] of map.spawns) {
      assert.ok(x > 0 && x < WORLD_W && y > 0 && y < WORLD_H, map.name);
      assert.ok(!map.rects.some((r) => circleRect(x, y, PLAYER_R, r)), `${map.name} ${x},${y}`);
    }
    // Cada uno cae y queda parado sobre algo.
    for (const [x, y] of map.spawns) {
      const p = newPlayerState(x, y, statsFor([]));
      for (let i = 0; i < 240; i++) stepPlayer(p, {}, STEP, { rects: map.rects, stats: statsFor([]), now: i * STEP });
      assert.ok(p.onGround, `${map.name} ${x},${y} no cae en un piso`);
    }
  }
});

test('tiros: saltar, chocar contra la pared y saltar de la pared', () => {
  const rects = [[0, 20, 64, 2], [30, 0, 2, 20]];
  const stats = statsFor([]);
  const p = newPlayerState(20, 18, stats);
  for (let i = 0; i < 60; i++) stepPlayer(p, {}, STEP, { rects, stats, now: 0 });
  assert.ok(p.onGround);
  stepPlayer(p, { jump: true }, STEP, { rects, stats, now: 0 });
  assert.ok(p.vy < -20);
  // Corre hacia la pared y en el aire salta de ella hacia el otro lado.
  for (let i = 0; i < 120 && !p.wall; i++) stepPlayer(p, { right: true, jump: true }, STEP, { rects, stats, now: 0 });
  assert.equal(p.wall, 1);
  p.y = 8; p.vy = 0; // en el aire, pegado a la pared
  stepPlayer(p, { right: true }, STEP, { rects, stats, now: 0 });
  assert.equal(p.wall, 1);
  stepPlayer(p, { right: true, jump: true }, STEP, { rects, stats, now: 0 });
  assert.ok(p.vx < -10 && p.vy < -20);
});

test('tiros: el que se cae del mapa sale disparado para arriba hasta cerca del techo y avisa para restar vida', () => {
  const stats = statsFor([]);
  const p = newPlayerState(30, 37.5, stats);
  const ev = stepPlayer(p, {}, STEP, { rects: [], stats, now: 1 });
  assert.equal(ev.out, 'bottom');
  assert.ok(!stepPlayer(p, {}, STEP, { rects: [], stats, now: 1.1 }).out); // no dos veces seguidas
  let top = p.y;
  for (let i = 0; i < 240; i++) { stepPlayer(p, {}, STEP, { rects: [], stats, now: 1.2 + i * STEP }); top = Math.min(top, p.y); }
  assert.ok(top < 6, `subió hasta ${top}`);
  // Debajo de un piso que llega al borde de abajo, lo atraviesa y no se queda rebotando.
  const under = newPlayerState(10, 37.5, stats);
  const floor = [[0, 31, 18, 5]];
  let outs = 0, best = 99;
  for (let i = 0; i < 240; i++) { if (stepPlayer(under, {}, STEP, { rects: floor, stats, now: i * STEP }).out) outs++; best = Math.min(best, under.y); }
  assert.equal(outs, 1);
  assert.ok(best < 10);
  const side = newPlayerState(-1.5, 10, stats);
  assert.equal(stepPlayer(side, {}, STEP, { rects: [], stats, now: 1 }).out, 'left');
  assert.ok(side.vx > 30);
});

test('tiros: la bala cae con la gravedad, rebota si tiene rebotes y si no pega en la pared', () => {
  const rects = [[40, 0, 2, 36]];
  const plain = statsFor([]);
  const [b] = bulletsForShot({ k: 's', t: 0, x: 30, y: 10, a: 0, sd: 1 }, 'a', plain);
  let impact = null;
  for (let i = 0; i < 120 && !impact; i++) impact = stepBullet(b, STEP, { rects, stats: plain })?.impact;
  assert.ok(impact && b.done);
  assert.ok(b.y > 10); // bajó un poco
  const bouncy = statsFor(['caos']);
  const [c] = bulletsForShot({ k: 's', t: 0, x: 30, y: 10, a: 0, sd: 1 }, 'a', bouncy);
  for (let i = 0; i < 60; i++) stepBullet(c, STEP, { rects, stats: bouncy });
  assert.equal(c.bounced, 1);
  assert.ok(c.vx < 0 && !c.done);
  assert.ok(bulletDamage(c, statsFor(['truco'])) > 0);
});

test('tiros: escopeta abre el abanico, ráfaga sale escalonada, igual en todas las pantallas', () => {
  const shot = { k: 's', t: 10, x: 30, y: 10, a: 0, sd: 42 };
  const shotgun = bulletsForShot(shot, 'a', statsFor(['escopeta']));
  assert.equal(shotgun.length, 5);
  assert.deepEqual(shotgun, bulletsForShot(shot, 'a', statsFor(['escopeta'])));
  const angles = shotgun.map((b) => Math.atan2(b.vy, b.vx));
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.3);
  const burst = bulletsForShot(shot, 'a', statsFor(['rafaga']));
  assert.deepEqual(burst.map((b) => b.t0), [10, 10.08, 10.16]);
  assert.ok(touches({ x: 0, y: 0, r: 0.3 }, 1, 0));
});
