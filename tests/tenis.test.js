import test from 'node:test';
import assert from 'node:assert/strict';
import { addPoint, applyAction, matchWinner, newRoom, newScore, pointText } from '../src/tenis/game.js';
import { HALF_L, HALF_W, STEP, canReach, hitBall, newRally, sideOf, stepRally, swingPower } from '../src/tenis/sim.js';

const ctx = { now: 0 };

test('tenis: el tanteo cuenta 15, 30, 40, iguales, ventaja y juego', () => {
  let s = newScore();
  s = addPoint(s, 0); assert.equal(pointText(s), '15 – 0');
  s = addPoint(s, 0); s = addPoint(s, 1); assert.equal(pointText(s), '30 – 15');
  s = addPoint(s, 0); s = addPoint(s, 1); s = addPoint(s, 1); assert.equal(pointText(s), 'Iguales');
  s = addPoint(s, 1); assert.equal(pointText(s), 'Ventaja lejos');
  s = addPoint(s, 0); assert.equal(pointText(s), 'Iguales');
  s = addPoint(s, 0); s = addPoint(s, 0);
  assert.deepEqual(s.g, [1, 0]);
  assert.equal(s.server, 1, 'en el juego siguiente saca el otro');
  for (let i = 0; i < 8; i++) s = addPoint(s, 0);
  assert.equal(matchWinner(s), 0);
});

test('tenis: la compu es la cancha y los celulares toman los dos lados', () => {
  let r = newRoom('pc', 'Tele', '📺');
  assert.equal(applyAction(r, { type: 'start', playerId: 'pc' }, ctx), null, 'sin celulares no arranca');
  assert.equal(applyAction(r, { type: 'join', playerId: 'pc', name: 'Tele' }, ctx), null, 'la cancha no es un control');
  r = applyAction(r, { type: 'join', playerId: 'a', name: 'Ana' }, ctx);
  r = applyAction(r, { type: 'join', playerId: 'b', name: 'Beto' }, ctx);
  assert.deepEqual(r.players.map((p) => p.slot), [0, 1]);
  assert.equal(applyAction(r, { type: 'join', playerId: 'c', name: 'Caro' }, ctx), null, 'son dos lados');
  assert.equal(applyAction(r, { type: 'start', playerId: 'a' }, ctx), null, 'arranca la cancha, no un celular');
  r = applyAction(r, { type: 'start', playerId: 'pc' }, ctx);
  assert.equal(r.phase, 'playing');
  r = applyAction(r, { type: 'point', playerId: 'pc', n: 1, side: 1, k: 0 }, ctx);
  assert.deepEqual(r.score.p, [0, 1]);
  assert.equal(applyAction(r, { type: 'point', playerId: 'pc', n: 1, side: 1, k: 0 }, ctx), null, 'el mismo punto no se cuenta dos veces');
  assert.equal(applyAction(r, { type: 'point', playerId: 'a', n: 1, side: 0, k: 1 }, ctx), null, 'los puntos los anota la cancha');
  r = applyAction(r, { type: 'leave', playerId: 'b' }, ctx);
  r = applyAction(r, { type: 'join', playerId: 'c', name: 'Caro' }, ctx);
  assert.equal(r.players.find((p) => p.id === 'c').slot, 1, 'el que entra toma el lado libre');
});

test('tenis: la fuerza del golpe sale del pico de aceleración', () => {
  assert.equal(swingPower(5), 0);
  assert.equal(swingPower(100), 1);
  assert.ok(swingPower(30) > 0.3 && swingPower(30) < 0.7);
});

test('tenis: un golpe hace picar la pelota del otro lado, adentro de la cancha', () => {
  for (const side of [0, 1]) for (const power of [0, 0.5, 1]) for (const aim of [-1, 0, 1]) {
    const r = newRally(side);
    r.ball.y = 1.2; r.ball.vy = 0;
    hitBall(r, side, power, aim);
    let over = null;
    for (let i = 0; i < 120 * 4 && !over && r.bounces === 0; i++) over = stepRally(r);
    assert.equal(over, null, `lado ${side}, fuerza ${power}, para ${aim}: ${over?.why}`);
    assert.equal(r.bounceSide, 1 - side);
    assert.ok(Math.abs(r.ball.x) <= HALF_W && Math.abs(r.ball.z) <= HALF_L);
  }
});

test('tenis: si nadie le pega, el que pegó gana el punto por doble pique', () => {
  const r = newRally(0);
  hitBall(r, 0, 0.5, 0);
  let over = null;
  for (let i = 0; i < 120 * 8 && !over; i++) over = stepRally(r);
  assert.equal(over.winner, 0);
});

test('tenis: dos máquinas pelotean y se definen puntos (la pelota llega al alcance del otro)', () => {
  let points = 0, hits = 0;
  for (let n = 0; n < 20; n++) {
    const r = newRally(n % 2);
    let over = null;
    for (let i = 0; i < 120 * 30 && !over; i++) {
      for (const side of [0, 1]) if (r.hits < 6 && canReach(r, side)) { hitBall(r, side, 0.5, ((i * 7 + n) % 9) / 4.5 - 1); hits += 1; }
      over = stepRally(r);
    }
    if (over) points += 1;
    void sideOf;
  }
  assert.ok(hits > 40, `hubo peloteo (${hits} golpes)`);
  assert.ok(points >= 18, `se definieron puntos (${points})`);
});
