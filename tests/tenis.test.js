import test from 'node:test';
import assert from 'node:assert/strict';
import { addPoint, applyAction, matchWinner, newRoom, newScore, pointText } from '../src/tenis/game.js';
import { HALF_L, HALF_W, STEP, canReach, hitBall, newRally, packRally, sideOf, stepRally, swingPower, unpackRally } from '../src/tenis/sim.js';

const ctx = { now: 0 };

test('tenis: el tanteo cuenta 15, 30, 40, iguales, ventaja y juego', () => {
  let s = newScore();
  s = addPoint(s, 0); assert.equal(pointText(s), '15 – 0');
  s = addPoint(s, 0); s = addPoint(s, 1); assert.equal(pointText(s), '30 – 15');
  s = addPoint(s, 0); s = addPoint(s, 1); s = addPoint(s, 1); assert.equal(pointText(s), 'Iguales');
  s = addPoint(s, 1); assert.equal(pointText(s), 'Ventaja');
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
  assert.equal(applyAction(r, { type: 'start', playerId: 'pc' }, ctx), null, 'faltan calibrar los celulares');
  r = applyAction(r, { type: 'calibrate', playerId: 'a' }, ctx);
  r = applyAction(r, { type: 'calibrate', playerId: 'b' }, ctx);
  assert.equal(applyAction(r, { type: 'calibrate', playerId: 'b' }, ctx), null, 'ya estaba calibrado');
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

test('tenis: en el 2v2 hay cuatro lugares, dos por equipo, y el QR de cada compu llena los de su equipo', () => {
  let r = newRoom('pc', 'Tele', '📺');
  r = applyAction(r, { type: 'setOptions', playerId: 'pc', options: { format: '2v2', mode: 'online' } }, ctx);
  assert.equal(applyAction(r, { type: 'start', playerId: 'pc' }, ctx), null);
  r = applyAction(r, { type: 'join', playerId: 'a', name: 'Ana', team: 1 }, ctx);
  r = applyAction(r, { type: 'join', playerId: 'b', name: 'Beto', team: 1 }, ctx);
  assert.deepEqual(r.players.map((p) => p.slot), [1, 3]);
  assert.equal(applyAction(r, { type: 'join', playerId: 'c', name: 'Caro', team: 1 }, ctx), null, 'el equipo azul ya está lleno');
  assert.equal(applyAction(r, { type: 'start', playerId: 'pc' }, ctx), null, 'en el online falta la otra compu');
  r = applyAction(r, { type: 'screenJoin', playerId: 'pc2', name: 'Compu de Beto' }, ctx);
  assert.equal(r.screens[1].team, 1);
  assert.equal(applyAction(r, { type: 'screenJoin', playerId: 'pc3', name: 'Otra' }, ctx), null, 'son dos compus');
  for (const p of r.players) r = applyAction(r, { type: 'calibrate', playerId: p.id }, ctx);
  assert.equal(applyAction(r, { type: 'start', playerId: 'pc2' }, ctx), null, 'arranca el anfitrión');
  r = applyAction(r, { type: 'start', playerId: 'pc' }, ctx);
  assert.equal(r.phase, 'playing');
  r = applyAction(r, { type: 'leave', playerId: 'pc2' }, ctx);
  assert.equal(r.phase, 'lobby', 'si se va la otra compu, se pausa');
  r = applyAction(r, { type: 'setOptions', playerId: 'pc', options: { format: '1v1' } }, ctx);
  assert.deepEqual(r.players.map((p) => p.slot), [1], 'al pasar a 1v1, el de la red se queda sin lugar');
  r = applyAction(r, { type: 'setOptions', playerId: 'pc', options: { mode: 'local' } }, ctx);
  assert.equal(applyAction(r, { type: 'screenJoin', playerId: 'pc2', name: 'X' }, ctx), null, 'en el local hay una sola compu');
});

test('tenis: en el 2v2 la pelota llega a los de la red y a los del fondo, y se definen puntos', () => {
  let hits = 0, net = 0, points = 0;
  for (let n = 0; n < 20; n++) {
    const r = newRally(n % 2, 4);
    let over = null;
    for (let i = 0; i < 120 * 30 && !over; i++) {
      for (let p = 0; p < 4; p++) if (r.hits < 8 && canReach(r, p)) { hitBall(r, p, 0.5, ((i * 7 + n) % 9) / 4.5 - 1); hits += 1; if (p >= 2) net += 1; }
      over = stepRally(r);
    }
    if (over) points += 1;
  }
  assert.ok(hits > 40 && net > 3, `peloteo (${hits} golpes, ${net} en la red)`);
  assert.ok(points >= 18);
});

test('tenis: la pelota y los jugadores viajan a la otra compu y llegan iguales', () => {
  const r = newRally(1, 4);
  hitBall(r, 1, 0.7, 0.3);
  for (let i = 0; i < 40; i++) stepRally(r);
  const copy = unpackRally(packRally(r), null);
  assert.ok(Math.abs(copy.ball.z - r.ball.z) < 0.01 && copy.players.length === 4);
  assert.equal(copy.serving, false);
});

test('tenis: el golpe del celular no tiene ayuda: plano y medio entra, a fondo se va largo, torcido se va ancho', async () => {
  const S = await import('../src/tenis/sim.js');
  const play = (opts) => {
    const r = S.newRally(0); r.serving = false; r.ball.y = 1.1; r.ball.vy = 0; r.ball.z = r.players[0].z;
    S.hitSwing(r, 0, opts);
    for (let i = 0; i < 600; i++) { const o = S.stepRally(r); if (o) return o; if (r.bounces === 1) return { in: true, x: r.ball.x, z: r.ball.z }; }
    return null;
  };
  assert.ok(play({ power: 0.5 }).in, 'golpe medio y derecho: adentro');
  assert.equal(play({ power: 1 }).in, undefined, 'a fondo y plano: se va');
  assert.equal(play({ power: 0.5, yaw: 0.9 }).in, undefined, 'muy torcido: se va ancho');
  const late = S.newRally(0); late.serving = false; late.ball.z = late.players[0].z + 1.2;
  assert.ok(S.timingOf(late, 0) < -0.4, 'la pelota ya pasó: tarde');
});
