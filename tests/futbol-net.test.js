import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTRAP_MAX_MS, GOAL_PAUSE_MS, KICKOFF_COUNTDOWN_MS, MIN_DELAY_MS, PHYSICS_STEP_MS, SEND_INTERVAL_MS, fixedSteps,
  applyPlayerSnapshot, claimBeats, createRemote, goalMatch, initialMatch, latestWriter, matchPhase, switchToDirect,
  packBall, packInput, packPlayer, receiveSnapshot, sameMotion, sampleRemote, targetDelay, unpackInput, updateDelay,
} from '../src/futbol/net.js';
import { advanceBall, createGameState, stepPhysics } from '../src/futbol/physics.js';
import { applyAction, newRoom } from '../src/futbol/game.js';

const snap = (t, x, extra = {}) => ({ m: 1, k: 0, t, x, y: 100, vx: 200, vy: 0, ...extra });

function remoteWith(snaps, lagMs = 100) {
  const remote = createRemote();
  for (const s of snaps) receiveSnapshot(remote, s, s.t + lagMs);
  return remote;
}

// ─── fotos ──────────────────────────────────────────────────────────────────

test('red: la foto de un auto es compacta y sirve para reconstruirlo', () => {
  const car = { x: 100.123, y: 200.987, vx: 120.4, vy: -3.6, angle: 1.23456, steerAngle: 0.5, boost: 33.3, isBoosting: true, isFlipping: false, flipTime: 0 };
  const s = packPlayer(car, true, 2, 1, 1000.4, { accelerate: true, turnLeft: true });
  assert.deepEqual(
    { x: s.x, y: s.y, vx: s.vx, vy: s.vy, a: s.a, b: s.b, bo: s.bo },
    { x: 100.1, y: 201, vx: 120, vy: -4, a: 1.235, b: 33, bo: 1 },
  );
  assert.equal(s.f, undefined, 'lo que es falso no viaja');
  assert.deepEqual(unpackInput(s.in), { accelerate: true, turnLeft: true });
  assert.ok(JSON.stringify(s).length < 120, `pesa ${JSON.stringify(s).length} bytes`);

  const back = {};
  applyPlayerSnapshot(back, s, true);
  assert.equal(back.angle, 1.235);
  assert.equal(back.isBoosting, true);
  assert.equal(back.isFlipping, false);
});

test('red: la foto de un jugador a pie lleva la patada y la estámina solo si hacen falta', () => {
  const s = packPlayer({ x: 1, y: 2, vx: 0, vy: 0, isKicking: true, stamina: 100 }, false, 1, 0, 5, {});
  assert.equal(s.ki, 1);
  assert.equal(s.st, undefined, 'con la estámina llena no hace falta mandarla');
  assert.equal(s.in, undefined, 'sin teclas no hace falta mandarlas');
  const back = {};
  applyPlayerSnapshot(back, s, false);
  assert.equal(back.stamina, 100);
  assert.equal(back.isKicking, true);
});

test('red: las teclas viajan como bits y vuelven iguales', () => {
  const input = { up: true, kick: true, boost: true };
  assert.deepEqual(unpackInput(packInput(input)), input);
  assert.equal(packInput({}), 0);
  assert.equal(packInput(undefined), 0);
});

test('red: dos fotos que solo difieren en la hora son el mismo movimiento', () => {
  assert.ok(sameMotion(snap(1, 10), snap(2, 10)));
  assert.ok(!sameMotion(snap(1, 10), snap(2, 11)));
  assert.ok(!sameMotion(null, snap(1, 10)));
});

// ─── búfer e interpolación ──────────────────────────────────────────────────

test('red: las fotos quedan en orden y se descartan las viejas o repetidas', () => {
  const remote = createRemote();
  assert.ok(receiveSnapshot(remote, snap(100, 0), 200));
  assert.ok(receiveSnapshot(remote, snap(150, 10), 250));
  assert.equal(receiveSnapshot(remote, snap(150, 99), 260), false, 'repetida');
  assert.equal(receiveSnapshot(remote, snap(120, 99), 270), false, 'llegó tarde y desordenada');
  assert.deepEqual(remote.snaps.map((s) => s.t), [100, 150]);
});

test('red: después de un gol el remoto vuelve a su lugar de golpe, sin deslizarse', () => {
  const remote = remoteWith([snap(100, 500), snap(150, 510)]);
  receiveSnapshot(remote, { ...snap(200, 20), k: 1 }, 300);
  assert.deepEqual(remote.snaps.map((s) => s.x), [20]);
});

test('red: si estaba quieto, el arranque no se estira; si se movía, se interpola a través del hueco', () => {
  const still = remoteWith([{ ...snap(0, 0), vx: 0 }]);
  receiveSnapshot(still, snap(600, 10), 700);
  assert.deepEqual(still.snaps.map((s) => s.t), [0, 550, 600], 'agrega una copia justo antes de moverse');

  const moving = remoteWith([snap(0, 0)]);
  receiveSnapshot(moving, snap(300, 60), 400);
  assert.deepEqual(moving.snaps.map((s) => s.t), [0, 300], 'se perdieron fotos, pero se interpola');
});

test('red: entre dos fotos se interpola, y el ángulo gira por el camino corto', () => {
  const remote = remoteWith([snap(100, 0, { a: 3.1 }), snap(150, 10, { a: -3.1 })]);
  const mid = sampleRemote(remote, 125);
  assert.equal(mid.x, 5);
  assert.equal(mid.ex, undefined);
  assert.ok(Math.abs(Math.abs(mid.a) - Math.PI) < 0.01, `por el camino corto queda cerca de ±π, no en 0 (${mid.a})`);
});

test('red: si faltan fotos se sigue la trayectoria, marcado como adivinado, y con un límite', () => {
  const remote = remoteWith([snap(100, 0), snap(150, 10)]);
  const guess = sampleRemote(remote, 250);
  assert.equal(guess.ex, true);
  assert.equal(guess.x, 10 + 200 * 0.1);
  const far = sampleRemote(remote, 150 + EXTRAP_MAX_MS * 3);
  assert.equal(far.x, 10 + 200 * (EXTRAP_MAX_MS / 1000), 'no se va al infinito');
  assert.equal(sampleRemote(remote, 50).x, 0, 'antes de la primera foto, se queda en la primera');
  assert.equal(sampleRemote(createRemote(), 100), null);
});

test('red: se puede adivinar con física de verdad, y la foto original no se toca', () => {
  const remote = remoteWith([snap(100, 0), snap(150, 10)]);
  const last = remote.snaps.at(-1);
  const guess = sampleRemote(remote, 200, (s, ms) => ({ ...s, x: s.x + ms }));
  assert.equal(guess.x, 60);
  assert.equal(last.x, 10);
});

// ─── cuánto en el pasado dibujar ─────────────────────────────────────────────

test('red: el retraso cubre casi todas las demoras, pero un pico aislado no lo arrastra', () => {
  const remote = createRemote();
  for (let i = 0; i < 40; i++) receiveSnapshot(remote, snap(i * 50, i), i * 50 + 250);
  receiveSnapshot(remote, snap(2000, 50), 2000 + 900); // un pico
  const delay = targetDelay(remote);
  assert.ok(delay >= 250 + SEND_INTERVAL_MS, `cubre la demora normal (${delay})`);
  assert.ok(delay < 600, `no se va a 900 por un solo pico (${delay})`);
});

test('red: una ráfaga de fotos tardías sí sube el retraso', () => {
  const remote = createRemote();
  for (let i = 0; i < 20; i++) receiveSnapshot(remote, snap(i * 50, i), i * 50 + 250);
  for (let i = 20; i < 26; i++) receiveSnapshot(remote, snap(i * 50, i), i * 50 + 700);
  assert.ok(targetDelay(remote) > 700);
});

test('red: el retraso sube rápido y baja despacio, sin saltos', () => {
  const remote = createRemote();
  for (let i = 0; i < 10; i++) receiveSnapshot(remote, snap(i * 50, i), i * 50 + 100);
  const start = updateDelay(remote, 16);
  for (let i = 10; i < 16; i++) receiveSnapshot(remote, snap(i * 50, i), i * 50 + 600);
  const up = updateDelay(remote, 16);
  assert.ok(up > start && up - start <= 16 * 0.6 + 1e-9, 'sube, pero de a poco por cuadro');
  remote.delay = 900;
  const down = updateDelay(remote, 16);
  assert.ok(down < 900 && 900 - down <= 16 * 0.1 + 1e-9, 'baja más despacio');
  assert.ok(targetDelay(createRemote()) >= MIN_DELAY_MS);
});

// ─── pelota ─────────────────────────────────────────────────────────────────

test('red: si los relojes de las dos pantallas difieren, eso no se convierte en atraso', () => {
  // Conexión directa de 15 ms, pero mi hora de servidor estimada va 270 ms atrás de la del otro:
  // las demoras medidas dan negativas.
  for (const diff of [-270, 0, 270]) {
    const remote = createRemote();
    for (let i = 0; i < 60; i++) receiveSnapshot(remote, snap(i * 16, i), i * 16 + 15 + diff);
    const real = targetDelay(remote) - diff; // lo que de verdad se ve atrasado
    assert.ok(real > 15 && real < 80, `con ${diff} ms de diferencia se lo ve ${real} ms atrás`);
  }
});

test('red: la copia de respaldo por Firebase entra al búfer pero su demora no atrasa el dibujo', () => {
  // Jugador quieto por conexión directa: un latido cada 500 ms, con 20 ms de demora.
  const remote = createRemote();
  for (let i = 0; i < 6; i++) receiveSnapshot(remote, { ...snap(i * 500, 0), vx: 0 }, i * 500 + 20);
  const directo = targetDelay(remote);
  // Llega la copia de Firebase de una foto más nueva que el último latido, 400 ms tarde.
  assert.equal(receiveSnapshot(remote, { ...snap(2600, 0), vx: 0 }, 3000, false), true, 'entra al búfer');
  assert.equal(remote.snaps.at(-1).t, 2600);
  assert.equal(targetDelay(remote), directo, 'el retraso sigue siendo el del canal directo');
  // Si la misma copia contara (sin canal directo), sí lo subiría.
  const sinCanal = createRemote();
  for (let i = 0; i < 6; i++) receiveSnapshot(sinCanal, { ...snap(i * 500, 0), vx: 0 }, i * 500 + 20);
  receiveSnapshot(sinCanal, { ...snap(2600, 0), vx: 0 }, 3000);
  assert.ok(targetDelay(sinCanal) > directo + 300);
});

test('red: gana el reclamo de la pelota con más cambios de dueño; si empatan, las dos pantallas coinciden', () => {
  assert.ok(claimBeats({ s: 3, o: 'a' }, { s: 2, o: 'z' }));
  assert.ok(!claimBeats({ s: 2, o: 'z' }, { s: 3, o: 'a' }));
  const a = { s: 4, o: 'ana' };
  const b = { s: 4, o: 'beto' };
  assert.notEqual(claimBeats(a, b), claimBeats(b, a), 'en un empate gana uno solo');
  assert.ok(claimBeats(a, null));
  const ball = packBall({ x: 1.26, y: 2, vx: 3.7, vy: 0 }, 1, 2, 'ana', 5, 99);
  assert.deepEqual(ball, { m: 1, k: 2, t: 99, o: 'ana', s: 5, x: 1.3, y: 2, vx: 4, vy: 0 });
});

test('red: la pelota adivinada rebota en la pared en vez de atravesarla', () => {
  const state = createGameState([{ id: 'a', team: 'red', name: 'A' }, { id: 'b', team: 'blue', name: 'B' }], {});
  const ball = { x: state.field.width - 40, y: 60, vx: 500, vy: 0 };
  advanceBall(ball, state.field, 300);
  assert.ok(ball.x < state.field.width, `quedó adentro (${ball.x})`);
  assert.ok(ball.vx < 0, 'rebotó');
});

// ─── escrituras sin cola ─────────────────────────────────────────────────────

test('red: el escritor nunca acumula: si está lleno, se queda solo con la más nueva', async () => {
  const pending = [];
  const sent = [];
  const write = (data) => new Promise((resolve) => { sent.push(data); pending.push(resolve); });
  const writer = latestWriter(write, 2);
  for (let i = 1; i <= 5; i++) writer(i);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sent, [1, 2], 'solo 2 en vuelo');
  pending.shift()();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sent, [1, 2, 5], 'al liberarse un lugar sale la más nueva; 3 y 4 no se mandan nunca');
});

// ─── estado del partido ─────────────────────────────────────────────────────

test('red: el partido arranca con cuenta regresiva y después corre el reloj compartido', () => {
  const match = initialMatch(1, 10_000, 60_000);
  assert.equal(matchPhase(match, 10_500, true).phase, 'countdown');
  const playing = matchPhase(match, match.at + 5_000, true);
  assert.equal(playing.phase, 'playing');
  assert.equal(playing.clock, 55_000);
  assert.equal(matchPhase(match, match.at + 61_000, true).phase, 'ended');
  const unlimited = initialMatch(1, 10_000, 0);
  assert.equal(matchPhase(unlimited, unlimited.at + 5_000, false).clock, 5_000, 'sin límite cuenta para arriba');
});

test('red: un gol suma, congela el reloj, festeja y arranca otro saque', () => {
  const start = initialMatch(1, 0, 60_000);
  const goal = goalMatch(start, 'blue', start.at + 10_000, true, 0);
  assert.equal(goal.k, 1);
  assert.deepEqual([goal.sr, goal.sb], [0, 1]);
  assert.equal(goal.c, 50_000);
  assert.equal(matchPhase(goal, goal.gt + 100, true).phase, 'goal');
  assert.equal(matchPhase(goal, goal.gt + GOAL_PAUSE_MS + 100, true).phase, 'countdown');
  const back = matchPhase(goal, goal.gt + GOAL_PAUSE_MS + KICKOFF_COUNTDOWN_MS + 1_000, true);
  assert.equal(back.phase, 'playing');
  assert.equal(back.clock, 49_000, 'el festejo no gasta tiempo de partido');
});

test('red: al llegar a los goles para ganar, el partido termina después del festejo', () => {
  let match = initialMatch(1, 0, 0);
  match = goalMatch(match, 'red', match.at + 1_000, false, 2);
  assert.equal(match.end, 0);
  match = goalMatch(match, 'red', match.at + 1_000, false, 2);
  assert.ok(match.end > match.gt);
  assert.equal(matchPhase(match, match.end + 1, false).phase, 'ended');
});

// ─── física: cada pantalla simula solo a su jugador ─────────────────────────

const pair = (opts = {}) => createGameState([{ id: 'yo', team: 'red', name: 'Yo' }, { id: 'otro', team: 'blue', name: 'Otro' }], opts);

test('red: con opts.local, el remoto no se mueve acá aunque tenga teclas', () => {
  const state = pair();
  const before = { ...state.players.otro };
  const { nextState } = stepPhysics(state, { yo: { right: true }, otro: { right: true } }, 100, { local: new Set(['yo']) });
  assert.ok(nextState.players.yo.x > state.players.yo.x, 'el local se mueve');
  assert.equal(nextState.players.otro.x, before.x, 'el remoto queda donde dijo su foto');
});

test('red: en un choque solo se corrige al local; el remoto se corrige en su pantalla', () => {
  const state = pair();
  state.players.otro.x = state.players.yo.x + 5;
  state.players.otro.y = state.players.yo.y;
  const remoteX = state.players.otro.x;
  const { nextState } = stepPhysics(state, {}, 16, { local: new Set(['yo']) });
  assert.equal(nextState.players.otro.x, remoteX);
  assert.ok(nextState.players.yo.x < state.players.yo.x, 'el local se separó');
});

test('red: solo el local toca la pelota, y el paso avisa cuando la tocó', () => {
  const state = pair();
  state.ball = { x: state.players.otro.x - 5, y: state.players.otro.y, vx: 0, vy: 0 };
  const remote = stepPhysics(state, {}, 16, { local: new Set(['yo']) });
  assert.equal(remote.touched, false);
  assert.equal(remote.nextState.ball.x, state.ball.x, 'la pelota atraviesa al remoto: la toca él en su pantalla');

  state.ball = { x: state.players.yo.x + 5, y: state.players.yo.y, vx: 0, vy: 0 };
  const mine = stepPhysics(state, {}, 16, { local: new Set(['yo']) });
  assert.equal(mine.touched, true);
});

test('red: en modo coches, solo el auto local agarra turbo y el paso dice cuál', () => {
  const state = pair({ vehicleMode: 'coches' });
  const pickup = state.boostPickups[0];
  state.players.yo.x = pickup.x;
  state.players.yo.y = pickup.y;
  state.players.yo.boost = 0;
  const { pickupsTaken, nextState } = stepPhysics(state, {}, 16, { local: new Set(['yo']) });
  assert.deepEqual(pickupsTaken, [0]);
  assert.ok(nextState.players.yo.boost > 0);
});

test('red: sin opts.local se simula a todos, como en una sola pantalla', () => {
  const state = pair();
  const { nextState } = stepPhysics(state, { otro: { left: true } }, 100);
  assert.ok(nextState.players.otro.x < state.players.otro.x);
});

// ─── sala ───────────────────────────────────────────────────────────────────

test('sala: cada partido tiene su número y el mismo gol no se cuenta dos veces', () => {
  let room = newRoom('h', 'Host');
  room = applyAction(room, { type: 'join', playerId: 'c', name: 'Cli' });
  room = applyAction(room, { type: 'startGame', playerId: 'h' });
  assert.equal(room.matchNumber, 1);
  room = applyAction(room, { type: 'goalScored', playerId: 'h', team: 'red', kickoff: 0 });
  room = applyAction(room, { type: 'goalScored', playerId: 'c', team: 'red', kickoff: 0 });
  assert.equal(room.score.red, 1, 'el segundo aviso del mismo gol se ignora');
  room = applyAction(room, { type: 'goalScored', playerId: 'c', team: 'blue', kickoff: 1 });
  assert.deepEqual(room.score, { red: 1, blue: 1 });
  room = applyAction(room, { type: 'toLobby', playerId: 'h' });
  room = applyAction(room, { type: 'startGame', playerId: 'h' });
  assert.equal(room.matchNumber, 2);
  room = applyAction(room, { type: 'goalScored', playerId: 'h', team: 'red', kickoff: 0 });
  assert.equal(room.score.red, 1, 'en el partido nuevo el saque 0 vuelve a valer');
});

// ─── paso fijo y conexión directa ───────────────────────────────────────────

test('red: con fotos por conexión directa (una por cuadro) el retraso baja mucho', () => {
  const firebase = createRemote();
  const direct = createRemote();
  for (let i = 0; i < 60; i++) receiveSnapshot(firebase, snap(i * 50, i), i * 50 + 250);
  for (let i = 0; i < 200; i++) receiveSnapshot(direct, snap(i * 15, i), i * 15 + 30);
  const d = targetDelay(direct);
  assert.ok(d >= 30 + 15, `cubre la demora y el hueco entre fotos (${d})`);
  assert.ok(d < 80, `mucho menos que por Firebase (${d} contra ${targetDelay(firebase)})`);
});

test('física: el paso fijo simula lo mismo con 60 que con 144 cuadros por segundo', () => {
  const run = (frameMs, totalSteps) => {
    let state = createGameState([{ id: 'a', name: 'A', team: 'red' }], {});
    state.ball.vx = 900;
    state.ball.vy = 300;
    const clock = { acc: 0 };
    let done = 0;
    while (done < totalSteps) {
      const { steps } = fixedSteps(clock, frameMs);
      for (let i = 0; i < steps && done < totalSteps; i++, done++) {
        state = stepPhysics(state, { a: { right: true } }, PHYSICS_STEP_MS, { local: ['a'] }).nextState;
      }
    }
    return state;
  };
  // Un segundo de juego: la cantidad de pasos no depende de los cuadros por segundo de la pantalla.
  const slow = run(1000 / 60, 120);
  const fast = run(1000 / 144, 120);
  assert.ok(Math.abs(slow.ball.x - fast.ball.x) < 1e-6 && Math.abs(slow.ball.y - fast.ball.y) < 1e-6, 'la pelota termina en el mismo lugar');
  assert.ok(Math.abs(slow.players.a.x - fast.players.a.x) < 1e-6, 'el jugador también');
});

test('física: si la pestaña se trabó, no intenta recuperar todo de golpe', () => {
  const clock = { acc: 0 };
  const { steps, alpha } = fixedSteps(clock, 5000);
  assert.ok(steps <= 8);
  assert.ok(alpha >= 0 && alpha < 1);
});

test('red: el derrape viaja en la foto del auto y en las teclas', () => {
  const s = packPlayer({ x: 0, y: 0, vx: 100, vy: 0, angle: 0, isDrifting: true }, true, 1, 0, 5, { drift: true, accelerate: true });
  assert.equal(s.dr, 1);
  assert.deepEqual(unpackInput(s.in), { accelerate: true, drift: true });
  const back = {};
  applyPlayerSnapshot(back, s, true);
  assert.equal(back.isDrifting, true);
  applyPlayerSnapshot(back, packPlayer({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 }, true, 1, 0, 6, {}), true);
  assert.equal(back.isDrifting, false);
});

test('red: al abrirse la conexión directa se olvidan las demoras de Firebase', () => {
  const remote = createRemote();
  // Quieto y por Firebase: pocas fotos, con 400 ms de demora.
  for (let i = 0; i < 8; i++) receiveSnapshot(remote, snap(i * 500, 0, { vx: 0 }), i * 500 + 400);
  updateDelay(remote, 16);
  assert.ok(remote.delay > 400);
  assert.equal(switchToDirect(remote), true);
  assert.equal(switchToDirect(remote), false, 'solo la primera vez');
  for (let i = 0; i < 5; i++) receiveSnapshot(remote, snap(4000 + i * 15, i), 4000 + i * 15 + 20);
  assert.ok(updateDelay(remote, 16) < 80, `se dibuja casi al día (${remote.delay})`);
});
