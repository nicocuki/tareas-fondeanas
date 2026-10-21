import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS, EJECT_MS, GAME_TYPE, MAX_PLAYERS, REACTOR_MS, ROLES_MS, applyAction, findPlayer, maxImpostors, newRoom, taskProgress, winnerOf,
} from '../src/nave/game.js';
import { BUTTON, H, LIGHTS_PANEL, REACTOR_HANDS, ROOMS, STATIONS, VENTS, W, isBlocked, isFloor, spawnPoint } from '../src/nave/map.js';
import { TASKS, stepsFor } from '../src/nave/tasks.js';
import { HALF, boxFree, canSee, castRay, step } from '../src/nave/sim.js';

// Números al azar repetibles.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lobby(n = 5) {
  let room = newRoom('p0', 'Nico', '🐸', 0);
  for (let i = 1; i < n; i++) room = applyAction(room, { type: 'join', playerId: `p${i}`, name: `J${i}` }, { now: 0 });
  return room;
}
function started(n = 5, seed = 1, options = null) {
  let room = lobby(n);
  if (options) room = applyAction(room, { type: 'setOptions', playerId: 'p0', options }, { now: 0 });
  room = applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand: seeded(seed) });
  room = applyAction(room, { type: 'tick', playerId: 'p1', phase: 'roles', game: room.game }, { now: 1000 + ROLES_MS });
  return room;
}
const impostor = (room) => room.players.find((p) => p.impostor);
const crew = (room) => room.players.filter((p) => !p.impostor);

// ─── Mapa ────────────────────────────────────────────────────────────────────
test('nave: desde la cafetería se llega a todas las salas', () => {
  const seen = new Uint8Array(W * H);
  const queue = [[BUTTON.x - 4, BUTTON.y]];
  seen[BUTTON.y * W + BUTTON.x - 4] = 1;
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!isBlocked(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; queue.push([nx, ny]); }
    }
  }
  for (const r of ROOMS) {
    let reached = false;
    for (let y = r.y; y < r.y + r.h && !reached; y++) for (let x = r.x; x < r.x + r.w; x++) if (seen[y * W + x]) { reached = true; break; }
    assert.ok(reached, `no se llega a ${r.name}`);
  }
});

test('nave: estaciones, ventilaciones y lugares de salida están en el piso y libres', () => {
  for (const [id, [x, y]] of Object.entries(STATIONS)) assert.ok(boxFree(x, y), `estación ${id} trabada`);
  for (const [i, v] of VENTS.entries()) {
    assert.ok(boxFree(v.x, v.y), `ventilación ${i} trabada`);
    for (const t of v.to) assert.ok(VENTS[t].to.includes(i), `la ventilación ${t} no vuelve a ${i}`);
  }
  for (let i = 0; i < MAX_PLAYERS; i++) { const s = spawnPoint(i, MAX_PLAYERS); assert.ok(boxFree(s.x, s.y), `salida ${i} trabada`); }
  assert.ok(boxFree(LIGHTS_PANEL.x, LIGHTS_PANEL.y));
  for (const h of REACTOR_HANDS) assert.ok(boxFree(h.x, h.y));
  for (const t of Object.values(TASKS)) for (const s of stepsFor(Object.keys(TASKS).find((k) => TASKS[k] === t), seeded(3))) assert.ok(STATIONS[s], `falta la estación ${s}`);
});

test('nave: no se atraviesan las paredes, pero los fantasmas sí', () => {
  // En la cafetería, caminando hacia arriba se frena en la pared de arriba (y = 2).
  const p = { x: 52, y: 4, facing: 1 };
  for (let i = 0; i < 120; i++) step(p, { x: 0, y: -1 }, 1 / 60, { speed: 6.5 });
  assert.ok(p.y >= 2 + HALF - 0.01 && p.y < 2.5, `quedó en ${p.y}`);
  assert.ok(isFloor(Math.floor(p.x), Math.floor(p.y)));
  const g = { x: 52, y: 4, facing: 1 };
  for (let i = 0; i < 60; i++) step(g, { x: 0, y: -1 }, 1 / 60, { speed: 6.5, ghost: true });
  assert.ok(g.y < 1.5, 'el fantasma pasa la pared');
});

test('nave: la vista frena en las paredes', () => {
  // Desde la cafetería no se ve Administración aunque esté cerca en línea recta.
  assert.equal(canSee(70, 20, 84, 35, 30), false);
  assert.equal(canSee(55, 10, 70, 10, 30), true);
  assert.ok(castRay(63, 6, 0, -1, 20) < 5, 'el rayo hacia arriba choca la pared de la cafetería');
});

// ─── Sala ────────────────────────────────────────────────────────────────────
test('nave: se arranca con al menos 4, y con 5 hay un solo impostor', () => {
  assert.equal(applyAction(lobby(3), { type: 'start', playerId: 'p0' }, { now: 0, rand: seeded(1) }), null);
  let room = lobby(5);
  room = applyAction(room, { type: 'setOptions', playerId: 'p0', options: { impostors: 3 } }, { now: 0 });
  room = applyAction(room, { type: 'start', playerId: 'p0' }, { now: 1000, rand: seeded(1) });
  assert.equal(room.gameType, GAME_TYPE);
  assert.equal(room.phase, 'roles');
  assert.equal(room.players.filter((p) => p.impostor).length, 1, 'con 5 jugadores entra uno solo');
  assert.equal(maxImpostors(7), 2);
  assert.equal(maxImpostors(9), 3);
  assert.ok(room.players.every((p) => p.tasks.length === 4), '1 común + 1 larga + 2 cortas');
  const common = room.players[0].tasks[0].k;
  assert.ok(room.players.every((p) => p.tasks[0].k === common), 'la común es la misma para todos');
});

test('nave: solo el anfitrión cambia opciones y los colores no se repiten', () => {
  let room = lobby(3);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p1', options: { speed: 2 } }, { now: 0 }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'p0', options: { speed: 7 } }, { now: 0 }), null);
  assert.equal(new Set(room.players.map((p) => p.color)).size, 3);
  assert.equal(applyAction(room, { type: 'color', playerId: 'p1', color: room.players[0].color }, { now: 0 }), null);
  room = applyAction(room, { type: 'color', playerId: 'p1', color: COLORS.length - 1 }, { now: 0 });
  assert.equal(findPlayer(room, 'p1').color, COLORS.length - 1);
});

test('nave: el impostor mata con el enfriamiento y deja un cuerpo', () => {
  let room = started();
  const imp = impostor(room), victim = crew(room)[0];
  const kill = { type: 'kill', playerId: imp.id, target: victim.id, x: 60, y: 20, game: room.game };
  const t0 = room.killReadyAt[imp.id];
  assert.equal(applyAction(room, kill, { now: t0 - 1 }), null, 'todavía en enfriamiento');
  assert.equal(applyAction(room, { ...kill, playerId: victim.id, target: imp.id }, { now: t0 }), null, 'un tripulante no mata');
  room = applyAction(room, kill, { now: t0 });
  assert.equal(findPlayer(room, victim.id).alive, false);
  assert.deepEqual(room.bodies.map((b) => b.id), [victim.id]);
  assert.equal(applyAction(room, { ...kill, target: crew(room)[1].id }, { now: t0 + 1000 }), null, 'otra vez en enfriamiento');
});

test('nave: reportar arranca una reunión, se vota y se expulsa al más votado', () => {
  let room = started(5, 2);
  const imp = impostor(room), [a, b, c, d] = crew(room);
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: a.id, x: 60, y: 20, game: room.game }, { now: room.killReadyAt[imp.id] });
  room = applyAction(room, { type: 'report', playerId: b.id, body: a.id, game: room.game }, { now: 50000 });
  assert.equal(room.phase, 'meeting');
  assert.equal(room.bodies.length, 0, 'la reunión levanta los cuerpos');
  const m = room.meeting;
  const vote = (who, target) => ({ type: 'vote', playerId: who, target, meeting: m.n, game: room.game });
  assert.equal(applyAction(room, vote(b.id, imp.id), { now: m.votingAt - 1 }), null, 'todavía se discute');
  assert.equal(applyAction(room, vote(a.id, imp.id), { now: m.votingAt }), null, 'los muertos no votan');
  room = applyAction(room, vote(b.id, imp.id), { now: m.votingAt });
  room = applyAction(room, vote(c.id, imp.id), { now: m.votingAt });
  room = applyAction(room, vote(d.id, 'skip'), { now: m.votingAt });
  room = applyAction(room, vote(imp.id, b.id), { now: m.votingAt });
  assert.equal(room.phase, 'ejection', 'votaron todos: se cuenta enseguida');
  assert.equal(room.ejection.id, imp.id);
  assert.equal(room.ejection.impostor, true);
  room = applyAction(room, { type: 'tick', playerId: b.id, phase: 'ejection', game: room.game }, { now: m.votingAt + EJECT_MS });
  assert.equal(room.phase, 'final');
  assert.equal(room.winner, 'crew');
});

test('nave: empate o saltear no expulsa a nadie y se vuelve a jugar', () => {
  let room = started(4, 5);
  room = applyAction(room, { type: 'emergency', playerId: 'p0', game: room.game }, { now: room.emergencyReadyAt });
  assert.equal(room.phase, 'meeting');
  assert.equal(findPlayer(room, 'p0').meetingsLeft, 0);
  const m = room.meeting;
  const [w, x, y, z] = room.players.map((p) => p.id);
  for (const [who, target] of [[w, x], [x, w], [y, 'skip']]) room = applyAction(room, { type: 'vote', playerId: who, target, meeting: m.n, game: room.game }, { now: m.votingAt });
  assert.equal(room.phase, 'meeting', 'falta uno');
  room = applyAction(room, { type: 'tick', playerId: z, phase: 'meeting', meeting: m.n, game: room.game }, { now: m.endsAt });
  assert.equal(room.ejection.id, null);
  assert.equal(room.ejection.tie, true);
  const round = room.round;
  room = applyAction(room, { type: 'tick', playerId: z, phase: 'ejection', game: room.game }, { now: m.endsAt + EJECT_MS });
  assert.equal(room.phase, 'playing');
  assert.equal(room.round, round + 1);
});

test('nave: los impostores ganan cuando son tantos como los tripulantes vivos', () => {
  let room = started(4, 7);
  const imp = impostor(room);
  const [a, b] = crew(room);
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: a.id, x: 60, y: 20, game: room.game }, { now: room.killReadyAt[imp.id] });
  assert.equal(room.phase, 'playing');
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: b.id, x: 60, y: 20, game: room.game }, { now: room.killReadyAt[imp.id] });
  assert.equal(room.phase, 'final');
  assert.equal(room.winner, 'impostor');
});

test('nave: las tareas se hacen paso por paso, también de fantasma, y completarlas gana', () => {
  let room = started(4, 9);
  const imp = impostor(room);
  assert.equal(applyAction(room, { type: 'task', playerId: imp.id, task: 0, step: 0, game: room.game }, { now: 20000 }), null, 'el impostor no hace tareas');
  const victim = crew(room)[0];
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: victim.id, x: 60, y: 20, game: room.game }, { now: room.killReadyAt[imp.id] });
  assert.equal(applyAction(room, { type: 'task', playerId: victim.id, task: 0, step: 1, game: room.game }, { now: 20000 }), null, 'el paso tiene que ser el que sigue');
  for (const p of crew(room)) {
    findPlayer(room, p.id).tasks.forEach((t, i) => {
      for (let s = 0; s < t.s.length; s++) room = applyAction(room, { type: 'task', playerId: p.id, task: i, step: s, game: room.game }, { now: 20000 }) || room;
    });
  }
  const { done, total } = taskProgress(room);
  assert.equal(done, total);
  assert.equal(room.phase, 'final');
  assert.equal(room.winner, 'crew');
  assert.equal(room.reason, 'tasks');
});

test('nave: sabotajes: las luces se arreglan con las palancas y el reactor entre dos o explota', () => {
  let room = started(5, 11);
  const imp = impostor(room), [a, b] = crew(room);
  const now = room.sabotageReadyAt;
  room = applyAction(room, { type: 'sabotage', playerId: imp.id, kind: 'lights', game: room.game }, { now });
  assert.equal(room.sabotage.kind, 'lights');
  assert.equal(applyAction(room, { type: 'sabotage', playerId: imp.id, kind: 'reactor', game: room.game }, { now }), null, 'uno por vez');
  room.sabotage.switches.forEach((on, i) => { if (!on) room = applyAction(room, { type: 'fixLights', playerId: a.id, switch: i, game: room.game }, { now }); });
  assert.equal(room.sabotage, null);
  const later = room.sabotageReadyAt;
  room = applyAction(room, { type: 'sabotage', playerId: imp.id, kind: 'reactor', game: room.game }, { now: later });
  assert.equal(applyAction(room, { type: 'emergency', playerId: a.id, game: room.game }, { now: later }), null, 'con el reactor no se toca el botón');
  room = applyAction(room, { type: 'holdReactor', playerId: a.id, side: 0, on: true, game: room.game }, { now: later });
  assert.equal(applyAction(room, { type: 'holdReactor', playerId: b.id, side: 0, on: true, game: room.game }, { now: later }), null, 'ese lado ya lo tiene otro');
  const exploding = room;
  room = applyAction(room, { type: 'holdReactor', playerId: b.id, side: 1, on: true, game: room.game }, { now: later });
  assert.equal(room.sabotage, null, 'entre dos se arregla');
  const boom = applyAction(exploding, { type: 'tick', playerId: a.id, phase: 'playing', game: room.game }, { now: later + REACTOR_MS });
  assert.equal(boom.winner, 'impostor');
  assert.equal(boom.reason, 'reactor');
});

test('nave: el chat: los vivos hablan en las reuniones y los fantasmas entre ellos', () => {
  let room = started(5, 13);
  const imp = impostor(room), [a, b] = crew(room);
  assert.equal(applyAction(room, { type: 'chat', playerId: b.id, text: 'hola', game: room.game }, { now: 1 }), null, 'jugando no se habla');
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: a.id, x: 60, y: 20, game: room.game }, { now: room.killReadyAt[imp.id] });
  room = applyAction(room, { type: 'chat', playerId: a.id, text: 'fue el rojo', game: room.game }, { now: 1 });
  assert.equal(room.chat.at(-1).g, 1, 'el fantasma habla en el canal de fantasmas');
  room = applyAction(room, { type: 'report', playerId: b.id, body: a.id, game: room.game }, { now: 2 });
  room = applyAction(room, { type: 'chat', playerId: b.id, text: 'lo encontré en Electricidad', game: room.game }, { now: 3 });
  assert.equal(room.chat.at(-1).g, 0);
});

test('nave: el que entra con la partida empezada solo mira', () => {
  let room = started(4, 15);
  room = applyAction(room, { type: 'join', playerId: 'tarde', name: 'Tardío' }, { now: 1 });
  const late = findPlayer(room, 'tarde');
  assert.equal(late.inGame, false);
  assert.equal(applyAction(room, { type: 'emergency', playerId: 'tarde', game: room.game }, { now: room.emergencyReadyAt }), null);
  assert.equal(winnerOf(room), null);
});

test('nave: el peor caso de sala entra en el tope de 30.000 caracteres', () => {
  let room = started(MAX_PLAYERS, 17, { commonTasks: 2, longTasks: 3, shortTasks: 5 });
  const imp = impostor(room);
  room = applyAction(room, { type: 'kill', playerId: imp.id, target: crew(room)[0].id, x: 60.123, y: 20.456, game: room.game }, { now: room.killReadyAt[imp.id] });
  room = applyAction(room, { type: 'report', playerId: crew(room)[1].id, body: crew(room)[0].id, game: room.game }, { now: 99999 });
  for (let i = 0; i < 80; i++) {
    const p = room.players[1 + (i % 9)];
    room = applyAction(room, { type: 'chat', playerId: p.id, text: '"'.repeat(120), game: room.game }, { now: 100000 + i }) || room;
  }
  const size = JSON.stringify(JSON.stringify(room)).length;
  assert.ok(size < 26000, `la sala pesa ${size} (el tope es 30.000)`);
});
