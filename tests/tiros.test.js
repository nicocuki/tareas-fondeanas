import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_END_MS, COUNTDOWN_MS, PICK_MS, REVEAL_MS, applyAction, currentPicker, findPlayer, newRoom } from '../src/tiros/game.js';
import { CARDS, CARD_IDS, dealCards, statsFor } from '../src/tiros/cards.js';
import { MAPS, WORLD_H, WORLD_W } from '../src/tiros/maps.js';
import { compileShape, hitSolid, touchesAny } from '../src/tiros/shapes.js';
import { applyBox, boxSolid, claimBeats, claimBox, encodeBox, newBoxes, pushBox, stepBoxes } from '../src/tiros/boxes.js';

const solidsOf = (rects) => rects.flatMap((r) => compileShape(['rect', ...r]));
import { MAX_RISE, PLAYER_R, STEP, WALL_SLIDE, bulletDamage, bulletsForShot, newPlayerState, seeded, stepBullet, stepPlayer, touches } from '../src/tiros/sim.js';

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
      assert.ok(!touchesAny(x, y, PLAYER_R, map.solids), `${map.name} ${x},${y}`);
    }
    // Cada uno cae y queda parado sobre algo.
    for (const [x, y] of map.spawns) {
      const p = newPlayerState(x, y, statsFor([]));
      for (let i = 0; i < 240; i++) stepPlayer(p, {}, STEP, { solids: map.solids, stats: statsFor([]), now: i * STEP });
      assert.ok(p.onGround, `${map.name} ${x},${y} no cae en un piso`);
    }
  }
});

test('tiros: saltar, chocar contra la pared y saltar de la pared', () => {
  const solids = solidsOf([[0, 20, 64, 2], [30, 0, 2, 20]]);
  const stats = statsFor([]);
  const p = newPlayerState(20, 18, stats);
  for (let i = 0; i < 60; i++) stepPlayer(p, {}, STEP, { solids, stats, now: 0 });
  assert.ok(p.onGround);
  stepPlayer(p, { jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(p.vy < -20);
  // Corre hacia la pared y en el aire salta de ella hacia el otro lado.
  for (let i = 0; i < 120 && !p.wall; i++) stepPlayer(p, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  assert.equal(p.wall, 1);
  p.y = 8; p.vy = 0; // en el aire, pegado a la pared
  stepPlayer(p, { right: true }, STEP, { solids, stats, now: 0 });
  assert.equal(p.wall, 1);
  stepPlayer(p, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(p.vx < -8 && p.vy < -18, `${p.vx} ${p.vy}`);
});

// Un jugador en el aire pegado a la pared derecha (x = 30), apretando hacia ella.
function onWall(vy) {
  const solids = solidsOf([[0, 30, 64, 2], [30, 0, 2, 30]]);
  const stats = statsFor([]);
  const p = newPlayerState(28.9, 10, stats);
  stepPlayer(p, { right: true }, STEP, { solids, stats, now: 0 });
  assert.equal(p.wall, 1);
  p.vy = vy;
  return { p, solids, stats, now: 0 };
}

test('tiros: el salto de la pared sale más para arriba que para el costado, como en ROUNDS', () => {
  const { p, solids, stats } = onWall(0);
  stepPlayer(p, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(p.vx < 0, 'se aleja de la pared');
  assert.ok(-p.vy > 1.8 * -p.vx, `sube ${-p.vy} y se aleja ${-p.vx}`);
  // Apretando hacia la pared vuelve a ella y trepa saltando de nuevo.
  const startY = p.y;
  let top = startY; // mantiene el salto y lo suelta un instante cada 0,3 s, como alguien trepando
  for (let i = 0; i < 240; i++) { stepPlayer(p, { right: true, jump: i % 36 !== 0 }, STEP, { solids, stats, now: 0 }); top = Math.min(top, p.y); }
  assert.ok(top < startY - 6, `trepó de ${startY} a ${top}`);
  // Hasta un ratito después de despegarse de la pared, todavía se puede saltar de ella.
  const late = onWall(5).p;
  stepPlayer(late, {}, STEP, { solids, stats, now: 0 });
  late.x -= 0.3; // ya no la toca
  stepPlayer(late, {}, STEP, { solids, stats, now: 0 });
  assert.equal(late.wall, 0);
  stepPlayer(late, { jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(late.vy < -15 && late.vx < 0, `${late.vx} ${late.vy}`);
});

test('tiros: saltar corta la caída en seco y si ya subía, suma', () => {
  // Cayendo rápido por la pared: el salto no descuenta la caída, sale con el empujón entero.
  const fast = onWall(30);
  stepPlayer(fast.p, { right: true, jump: true }, STEP, fast);
  const slow = onWall(0);
  stepPlayer(slow.p, { right: true, jump: true }, STEP, slow);
  assert.ok(Math.abs(fast.p.vy - slow.p.vy) < 1e-9, `${fast.p.vy} contra ${slow.p.vy}`);
  // Subiendo, el empujón se suma (con tope).
  const up = onWall(-10);
  stepPlayer(up.p, { right: true, jump: true }, STEP, up);
  assert.ok(up.p.vy < slow.p.vy - 9);
  const rocket = onWall(-60);
  stepPlayer(rocket.p, { right: true, jump: true }, STEP, rocket);
  assert.ok(rocket.p.vy >= -MAX_RISE, `${rocket.p.vy}`);
  // No se puede saltar dos veces seguidas en el mismo instante.
  const twice = onWall(0);
  stepPlayer(twice.p, { right: true, jump: true }, STEP, twice);
  stepPlayer(twice.p, { right: true }, STEP, twice);
  const vy = twice.p.vy;
  stepPlayer(twice.p, { right: true, jump: true }, STEP, twice);
  assert.ok(twice.p.vy > vy, 'el segundo salto no hizo nada');
});

test('tiros: el impulso de costado depende de cómo venías moviéndote', () => {
  const solids = solidsOf([[0, 20, 64, 2]]);
  const stats = statsFor([]);
  const run = (input) => {
    const p = newPlayerState(10, 18.8, stats);
    for (let i = 0; i < 60; i++) stepPlayer(p, input, STEP, { solids, stats, now: 0 });
    assert.ok(p.onGround);
    return p;
  };
  // Corriendo, el salto suma velocidad de costado; quieto, no.
  const runner = run({ right: true });
  const before = runner.vx;
  stepPlayer(runner, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(runner.vx > before * 1.2, `${before} → ${runner.vx}`);
  const still = run({});
  stepPlayer(still, { jump: true }, STEP, { solids, stats, now: 0 });
  assert.equal(still.vx, 0);
  // En el aire ese extra se gasta de a poco: sigue arriba de la velocidad normal un rato.
  for (let i = 0; i < 30; i++) stepPlayer(runner, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  assert.ok(runner.vx > 15, `${runner.vx}`);
  // Sin apretar nada tampoco se frena de golpe; apretando para el otro lado, sí.
  const coast = run({ right: true });
  stepPlayer(coast, { right: true, jump: true }, STEP, { solids, stats, now: 0 });
  const brake = structuredClone(coast);
  for (let i = 0; i < 40; i++) {
    stepPlayer(coast, { jump: true }, STEP, { solids, stats, now: 0 });
    stepPlayer(brake, { left: true, jump: true }, STEP, { solids, stats, now: 0 });
  }
  assert.ok(coast.vx > 14, `${coast.vx}`);
  assert.ok(brake.vx < 0, `${brake.vx}`);
});

test('tiros: el que se cae del mapa sale disparado para arriba hasta cerca del techo y avisa para restar vida', () => {
  const stats = statsFor([]);
  const p = newPlayerState(30, 37.5, stats);
  const ev = stepPlayer(p, {}, STEP, { solids: [], stats, now: 1 });
  assert.equal(ev.out, 'bottom');
  assert.ok(!stepPlayer(p, {}, STEP, { solids: [], stats, now: 1.1 }).out); // no dos veces seguidas
  let top = p.y;
  for (let i = 0; i < 240; i++) { stepPlayer(p, {}, STEP, { solids: [], stats, now: 1.2 + i * STEP }); top = Math.min(top, p.y); }
  assert.ok(top < 6, `subió hasta ${top}`);
  // Debajo de un piso que llega al borde de abajo, lo atraviesa y no se queda rebotando.
  const under = newPlayerState(10, 37.5, stats);
  const floor = solidsOf([[0, 31, 18, 5]]);
  let outs = 0, best = 99;
  for (let i = 0; i < 240; i++) { if (stepPlayer(under, {}, STEP, { solids: floor, stats, now: i * STEP }).out) outs++; best = Math.min(best, under.y); }
  assert.equal(outs, 1);
  assert.ok(best < 10);
  const side = newPlayerState(-1.5, 10, stats);
  assert.equal(stepPlayer(side, {}, STEP, { solids: [], stats, now: 1 }).out, 'left');
  assert.ok(side.vx > 30);
});

test('tiros: la bala cae con la gravedad, rebota si tiene rebotes y si no pega en la pared', () => {
  const solids = solidsOf([[40, 0, 2, 36]]);
  const plain = statsFor([]);
  const [b] = bulletsForShot({ k: 's', t: 0, x: 30, y: 10, a: 0, sd: 1 }, 'a', plain);
  let impact = null;
  for (let i = 0; i < 120 && !impact; i++) impact = stepBullet(b, STEP, { solids, stats: plain })?.impact;
  assert.ok(impact && b.done);
  assert.ok(b.y > 10); // bajó un poco
  const bouncy = statsFor(['caos']);
  const [c] = bulletsForShot({ k: 's', t: 0, x: 30, y: 10, a: 0, sd: 1 }, 'a', bouncy);
  for (let i = 0; i < 60; i++) stepBullet(c, STEP, { solids, stats: bouncy });
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

test('tiros: apretando hacia la pared queda agarrado y cae lentísimo; sin apretar, cae normal', () => {
  const held = onWall(0);
  const y0 = held.p.y;
  for (let i = 0; i < 120; i++) stepPlayer(held.p, { right: true }, STEP, held);
  assert.equal(held.p.wall, 1);
  assert.ok(held.p.y - y0 < WALL_SLIDE * 1.05, `en un segundo bajó ${held.p.y - y0}`);
  // Si venía cayendo rápido, al agarrarse se frena enseguida.
  const fast = onWall(30);
  stepPlayer(fast.p, { right: true }, STEP, fast);
  assert.ok(fast.p.vy <= WALL_SLIDE);
  const loose = onWall(0);
  const y1 = loose.p.y;
  for (let i = 0; i < 30; i++) stepPlayer(loose.p, {}, STEP, loose);
  assert.ok(loose.p.y - y1 > 2, `sin agarrarse bajó ${loose.p.y - y1}`);
});

test('tiros: al soltar las teclas frena deslizando, no en seco', () => {
  const solids = solidsOf([[0, 20, 64, 2]]);
  const stats = statsFor([]);
  const p = newPlayerState(10, 18.8, stats);
  for (let i = 0; i < 90; i++) stepPlayer(p, { right: true }, STEP, { solids, stats, now: 0 });
  assert.ok(p.onGround && p.vx > 13.5, `${p.vx}`);
  const x0 = p.x;
  for (let i = 0; i < 6; i++) stepPlayer(p, {}, STEP, { solids, stats, now: 0 });
  assert.ok(p.vx > 6, `a los 0,05 s todavía va a ${p.vx}`);
  for (let i = 0; i < 54; i++) stepPlayer(p, {}, STEP, { solids, stats, now: 0 });
  assert.ok(p.vx < 0.1, `a los 0,5 s ya casi frenó: ${p.vx}`);
  assert.ok(p.x - x0 > 0.8 && p.x - x0 < 2.5, `se deslizó ${p.x - x0}`);
  // Arranca rápido: en 0,15 s ya va a más de las tres cuartas partes de la velocidad.
  for (let i = 0; i < 18; i++) stepPlayer(p, { left: true }, STEP, { solids, stats, now: 0 });
  assert.ok(p.vx < -0.75 * 14, `${p.vx}`);
});

test('tiros: la bala común cae bastante y la de las cartas de velocidad va casi derecha', () => {
  const drop = (stats) => {
    const [b] = bulletsForShot({ k: 's', t: 0, x: 2, y: 10, a: 0, sd: 1 }, 'a', stats);
    while (b.x < 34 && !b.done) stepBullet(b, STEP, { solids: [], stats, targets: [] });
    return b.y - 10;
  };
  const plain = drop(statsFor([]));
  const fast = drop(statsFor(['tirorapido']));
  assert.ok(plain > 4, `la común cayó ${plain} en media pantalla`);
  assert.ok(fast < plain / 20, `la rápida cayó ${fast}`);
});

test('tiros: choques contra polígonos, círculos y cápsulas', () => {
  const [ramp] = compileShape(['poly', [[0, 10], [10, 20], [0, 20]]]);
  const hit = hitSolid(6, 15, 1.1, ramp); // sobre la rampa de 45°
  assert.ok(hit && Math.abs(hit.nx - Math.SQRT1_2) < 1e-6 && Math.abs(hit.ny + Math.SQRT1_2) < 1e-6, JSON.stringify(hit));
  assert.equal(hitSolid(9, 12, 1.1, ramp), null);
  const [ball] = compileShape(['circle', 0, 0, 2]);
  const top = hitSolid(0, -2.9, 1, ball);
  assert.ok(top && Math.abs(top.ny + 1) < 1e-9 && Math.abs(top.depth - 0.1) < 1e-9);
  const capsule = compileShape(['capsule', 0, 0, 10, 0, 1]);
  assert.equal(capsule.length, 3);
  assert.ok(touchesAny(10.8, 0.8, 0.5, capsule)); // en la punta redonda
  assert.ok(!touchesAny(10.9, 0.9, 0.2, capsule)); // la esquina del rectángulo no existe
});

test('tiros: en una rampa el jugador no se resbala quieto y bajando caminando no se despega', () => {
  const solids = compileShape(['poly', [[0, 10], [20, 30], [0, 30]]]);
  const stats = statsFor([]);
  const p = newPlayerState(8, 15.5, stats);
  for (let i = 0; i < 120; i++) stepPlayer(p, {}, STEP, { solids, stats, now: 0 });
  assert.ok(p.onGround);
  const x0 = p.x;
  for (let i = 0; i < 240; i++) stepPlayer(p, {}, STEP, { solids, stats, now: 0 });
  assert.ok(Math.abs(p.x - x0) < 0.05, `se resbaló de ${x0} a ${p.x}`);
  let air = 0;
  for (let i = 0; i < 60; i++) { stepPlayer(p, { right: true }, STEP, { solids, stats, now: 0 }); if (!p.onGround) air++; }
  assert.ok(air <= 2, `bajando estuvo ${air} pasos en el aire`);
  assert.ok(p.x > x0 + 4);
});

test('tiros: las cajas caen, se apilan quietas y se duermen', () => {
  const floor = compileShape(['rect', 0, 30, 64, 6]);
  const boxes = newBoxes([[20, 20, 1.8], [20, 16, 1.8]]);
  boxes.forEach((b) => { b.sleep = false; });
  for (let i = 0; i < 720; i++) stepBoxes(boxes, STEP, floor, [], () => true);
  assert.ok(Math.abs(boxes[0].y - 29.1) < 0.05 && Math.abs(boxes[1].y - 27.3) < 0.08, `${boxes[0].y} ${boxes[1].y}`);
  assert.ok(boxes.every((b) => b.sleep && Math.abs(b.a) < 0.02 && Math.abs(b.x - 20.9) < 0.05));
});

test('tiros: el jugador empuja las cajas y una bala las mueve y las hace girar', () => {
  const floor = compileShape(['rect', 0, 30, 64, 6]);
  const [box] = newBoxes([[30, 28.2, 1.8]]);
  let px = 27;
  for (let i = 0; i < 120; i++) {
    px = Math.min(px + 14 * STEP, box.x - box.h - PLAYER_R + 0.02);
    stepBoxes([box], STEP, floor, [{ x: px, y: 28.9, vx: 14, vy: 0 }], () => true);
  }
  assert.ok(box.x > 33, `la caja quedó en ${box.x}`);
  const [hit] = newBoxes([[40, 28.2, 1.8]]);
  const stats = statsFor([]);
  const [b] = bulletsForShot({ k: 'c', t: 0, x: 36, y: 28.5, a: 0, sd: 1 }, 'a', stats);
  const solids = [...floor, boxSolid(hit)];
  let touched = null;
  for (let i = 0; i < 60 && !b.done; i++) stepBullet(b, STEP, { solids, stats, targets: [], onBox: (i2, bl) => { touched = i2; pushBox(hit, bl.x, bl.y, 8, 0); } });
  assert.equal(touched, 0);
  assert.ok(hit.vx > 0 && hit.w !== 0 && !hit.sleep);
});

test('tiros: una caja la simula el último que la tocó, y su foto le gana a la de antes', () => {
  const boxes = newBoxes([[0, 0, 1.8]]);
  assert.ok(claimBox(boxes[0], 'b'));
  assert.equal(boxes[0].s, 1);
  assert.ok(!claimBox(boxes[0], 'b')); // ya era suya
  const theirs = newBoxes([[0, 0, 1.8]]);
  boxes[0].x = 7; boxes[0].w = 2; boxes[0].sleep = false;
  applyBox(theirs, encodeBox(boxes[0]), 'b', 10);
  assert.equal(theirs[0].o, 'b');
  assert.equal(theirs[0].x, 7);
  // Otro la reclama con el mismo número: gana el id mayor; uno viejo no pisa.
  applyBox(theirs, [0, 1, 1, 0, 0, 0, 0, 1, 1, 0], 'a', 11);
  assert.equal(theirs[0].o, 'b');
  applyBox(theirs, [0, 2, 2, 0, 0, 0, 0, 1, 1, 0], 'c', 12);
  assert.equal(theirs[0].o, 'c');
  assert.ok(claimBeats(2, 'a', theirs[0]));
});

test('tiros: las cajas del castillo arrancan quietas en su lugar', () => {
  const map = MAPS.find((m) => m.name === 'Castillo');
  const boxes = newBoxes(map.boxes);
  const start = boxes.map((b) => [b.x, b.y]);
  boxes.forEach((b) => { b.sleep = false; });
  for (let i = 0; i < 240; i++) stepBoxes(boxes, STEP, map.solids, [], () => true);
  boxes.forEach((b, i) => assert.ok(Math.hypot(b.x - start[i][0], b.y - start[i][1]) < 0.08 && Math.abs(b.a) < 0.03, `caja ${i}: ${b.x},${b.y},${b.a}`));
});
