import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, ROUND_END_MS, applyAction, newRoom, quotaFor } from '../src/pista/game.js';
import { COURSES, barAngle, startSpot } from '../src/pista/courses.js';
import { STEP, newRobot, stepRobot } from '../src/pista/sim.js';

const ctx = (now) => ({ now, rand: () => 0.5 });
function room(n) {
  let r = newRoom('p0', 'P0', '🐸', 0);
  for (let i = 1; i < n; i++) r = applyAction(r, { type: 'join', playerId: `p${i}`, name: `P${i}` }, ctx(0));
  return applyAction(r, { type: 'start', playerId: 'p0' }, ctx(0));
}

test('pista: cuántos pasan en cada ronda', () => {
  assert.equal(quotaFor('race', 10), 6);
  assert.equal(quotaFor('survive', 6), 3);
  assert.equal(quotaFor('race', 2), 2);
  assert.equal(quotaFor('final', 3), 1);
});

test('pista: carrera → supervivencia → final, con eliminados y una corona', () => {
  let r = room(5);
  const t = COUNTDOWN_MS + 100;
  assert.equal(r.round.kind, 'race');
  assert.equal(applyAction(r, { type: 'finish', playerId: 'p1', round: 1 }, ctx(10)), null, 'antes de la largada no vale');
  for (const id of ['p3', 'p1', 'p4']) r = applyAction(r, { type: 'finish', playerId: id, round: 1 }, ctx(t));
  assert.equal(r.phase, 'roundEnd');
  assert.deepEqual(r.round.result.qualified, ['p3', 'p1', 'p4']);
  r = applyAction(r, { type: 'tick', playerId: 'p0', round: 1 }, ctx(t + ROUND_END_MS));
  assert.equal(r.round.kind, 'survive');
  assert.equal(r.round.quota, 2);
  const t2 = t + ROUND_END_MS + COUNTDOWN_MS + 100;
  assert.equal(applyAction(r, { type: 'fall', playerId: 'p0', round: 2 }, ctx(t2)), null, 'el que quedó afuera ya no juega');
  r = applyAction(r, { type: 'fall', playerId: 'p1', round: 2 }, ctx(t2));
  assert.equal(r.phase, 'roundEnd');
  assert.deepEqual(r.round.result.qualified, ['p3', 'p4']);
  r = applyAction(r, { type: 'tick', playerId: 'p3', round: 2 }, ctx(t2 + ROUND_END_MS));
  assert.equal(r.round.kind, 'final');
  const t3 = t2 + ROUND_END_MS + COUNTDOWN_MS + 100;
  r = applyAction(r, { type: 'finish', playerId: 'p4', round: 3 }, ctx(t3));
  assert.equal(r.winner, 'p4');
  r = applyAction(r, { type: 'tick', playerId: 'p0', round: 3 }, ctx(t3 + ROUND_END_MS));
  assert.equal(r.phase, 'final');
  assert.equal(r.players.find((p) => p.id === 'p4').wins, 1);
});

test('pista: con dos se salta la supervivencia y si se acaba el tiempo sin que llegue nadie, siguen todos', () => {
  let r = room(2);
  r = applyAction(r, { type: 'tick', playerId: 'p0', round: 1 }, ctx(COUNTDOWN_MS + 120000));
  assert.deepEqual(r.round.result.qualified, ['p0', 'p1']);
  r = applyAction(r, { type: 'tick', playerId: 'p0', round: 1 }, ctx(COUNTDOWN_MS + 120000 + ROUND_END_MS));
  assert.equal(r.round.kind, 'final');
});

test('pista: se puede jugar solo para practicar', () => {
  let r = room(1);
  r = applyAction(r, { type: 'finish', playerId: 'p0', round: 1 }, ctx(COUNTDOWN_MS + 1));
  assert.equal(r.phase, 'roundEnd');
});

// Corre derecho hacia -z, saltando cada tanto: sin obstáculos tiene que poder llegar a la meta (la pista no tiene huecos imposibles).
for (const kind of ['race', 'final']) {
  test(`pista: la pista «${kind}» se puede recorrer de punta a punta`, () => {
    const course = { ...COURSES[kind], bars: [], hammers: [], pushers: [] };
    const sp = startSpot(course, 0, 1);
    const r = newRobot(0, 0, sp.z);
    let t = 0;
    for (let i = 0; i < 60 * 40 && r.z > course.finishZ; i++, t += STEP) {
      // Salta antes de cada borde.
      const ahead = course.platforms.some((p) => r.x >= p.x0 && r.x <= p.x1 && r.z - 1.6 >= p.z0 && r.z - 1.6 <= p.z1);
      const targetX = course.platforms.find((p) => r.z - 3 >= p.z0 && r.z - 3 <= p.z1);
      const mx = targetX ? Math.max(-1, Math.min(1, ((targetX.x0 + targetX.x1) / 2 - r.x) * 0.5)) : 0;
      stepRobot(r, { mx: mx * 0.6, mz: -1, jump: !ahead }, course, new Set(), t);
      assert.ok(r.y > course.fallY, `se cayó en z=${r.z.toFixed(1)}`);
    }
    assert.ok(r.z <= course.finishZ, `no llegó (quedó en z=${r.z.toFixed(1)})`);
  });
}

test('pista: una barra que gira tira al que está parado en su camino', () => {
  const course = COURSES.race;
  const b = course.bars[0];
  // Lo paro justo donde va a pasar la barra.
  const t = 1.0, a = barAngle(b, t);
  const r = newRobot(b.x + Math.cos(a) * 3, 0, b.z + Math.sin(a) * 3);
  stepRobot(r, { mx: 0, mz: 0 }, course, new Set(), t);
  assert.ok(r.stun > 0 && Math.hypot(r.vx, r.vz) > 5, 'lo empujó');
});

test('pista: las baldosas pisadas se rompen y el robot cae al piso de abajo', () => {
  const course = COURSES.survive;
  const r = newRobot(0, 0, 0);
  const tile = stepRobot(r, { mx: 0, mz: 0 }, course, new Set(), 0);
  assert.ok(tile >= 0, 'avisa qué baldosa pisó');
  const broken = new Set([tile]);
  for (let i = 0; i < 120; i++) stepRobot(r, { mx: 0, mz: 0 }, course, broken, i * STEP);
  assert.ok(Math.abs(r.y - -7) < 0.05, `cayó al piso de abajo (${r.y.toFixed(2)})`);
});
