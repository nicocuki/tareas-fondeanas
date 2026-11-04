import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_BY_ID, DEFAULT_DECK, DECK_SIZE, TPS, validDeck } from '../src/arena/cards.js';
import {
  BRIDGES, H, LEAD, RIVER_Y, W, createRunner, newMatch, placeProblem, stepSim,
} from '../src/arena/sim.js';
import {
  COUNTDOWN_MS, MAX_CMDS, MAX_PLAYERS, applyAction, findPlayer, newRoom, startProblem, tickAt,
} from '../src/arena/game.js';
import { SPRITES } from '../src/arena/sprites.js';
import { chosenCards, decksFromPicks, draftOffers, rivalIndex } from '../src/arena/draft.js';
import { serializeRoom } from '../src/codigo-secreto/game.js';
import { summarizeRoom } from '../src/ui/roomSummary.js';

const ALL = CARDS.map((c) => c.id);
const deckWith = (...ids) => [...ids, ...ALL.filter((id) => !ids.includes(id))].slice(0, DECK_SIZE);

// Partida de dos con el mazo de cada uno armado a mano: la carta `first` queda en el primer lugar de la mano.
function duel(deckA = DEFAULT_DECK, deckB = DEFAULT_DECK, seed = 7) {
  const st = newMatch({ seed, minutes: 3, players: [{ team: 0, deck: deckA }, { team: 1, deck: deckB }] });
  return st;
}
// Pone en la mano de `seat` la carta `id` (en el lugar 0) con elixir de sobra.
function give(st, seat, id) {
  const p = st.players[seat];
  const at = p.hand.indexOf(id);
  if (at >= 0) [p.hand[0], p.hand[at]] = [p.hand[at], p.hand[0]];
  else { const q = p.queue.indexOf(id); if (q >= 0) p.queue.splice(q, 1); p.hand[0] = id; }
  p.elixir = 10;
}
const play = (st, seat, id, x, y) => { give(st, seat, id); stepSim(st, [[st.tick + 1, seat, 0, Math.round(x * 10), Math.round(y * 10)]]); };
const run = (st, ticks) => { for (let i = 0; i < ticks && !st.over; i++) stepSim(st); };
const units = (st, card) => st.units.filter((u) => u.card === card);
const tower = (st, team, kind, side = 0) => st.towers.find((t) => t.team === team && t.kind === kind && t.side === side);

test('cartas: hay 50, con datos completos y un mazo inicial válido', () => {
  assert.equal(CARDS.length, 50);
  assert.equal(new Set(ALL).size, 50);
  assert.ok(validDeck(DEFAULT_DECK));
  for (const c of CARDS) {
    assert.ok(c.name && c.desc && ['common', 'rare', 'epic'].includes(c.rarity), c.id);
    assert.equal(c.emoji, undefined, `${c.id}: las cartas no llevan emojis`);
    assert.ok(SPRITES[c.id], `${c.id}: tiene su dibujo`);
    assert.ok(c.cost >= 1 && c.cost <= 8, `${c.id}: costo`);
    if (c.kind === 'spell') assert.ok(c.radius > 0 && (c.dmg > 0 || c.heal > 0 || c.drop) && c.delay > 0, c.id);
    else assert.ok(c.hp > 0 && c.dmg > 0 && c.hit > 0 && c.range > 0 && c.radius > 0 && ['ground', 'both', 'buildings'].includes(c.targets), c.id);
    if (c.kind === 'building') assert.ok(c.life > 0, c.id);
  }
  assert.ok(!validDeck(['caballero']));
  assert.ok(!validDeck(Array(DECK_SIZE).fill('caballero')));
  assert.ok(!validDeck([...DEFAULT_DECK.slice(1), 'inventada']));
});

test('arena: la partida arranca con 6 torres, 5 de elixir y una mano de 4', () => {
  const st = duel();
  assert.equal(st.towers.length, 6);
  assert.equal(st.towers.filter((t) => t.kind === 'king').length, 2);
  for (const p of st.players) {
    assert.equal(p.elixir, 5);
    assert.equal(p.hand.length, 4);
    assert.equal(p.queue.length, 4);
    assert.deepEqual([...p.hand, ...p.queue].sort(), [...DEFAULT_DECK].sort());
  }
  assert.equal(tower(st, 0, 'princess', 0).y, 25.5);
  assert.equal(tower(st, 1, 'princess', 0).y, H - 25.5, 'las del otro equipo son el espejo');
});

test('poner cartas: elixir, zona de cada equipo, río y torres', () => {
  const st = duel();
  give(st, 0, 'caballero');
  assert.equal(placeProblem(st, 0, 0, 9, 22), null);
  assert.match(placeProblem(st, 0, 0, 9, 8), /mitad/, 'no se pone en la mitad enemiga');
  assert.match(placeProblem(st, 0, 0, RIVER_Y, RIVER_Y), /mitad/, 'ni en el río');
  assert.match(placeProblem(st, 0, 0, 3.5, 25.5), /torre/);
  assert.match(placeProblem(st, 0, 0, -3, 22), /afuera/);
  st.players[0].elixir = 2;
  assert.match(placeProblem(st, 0, 0, 9, 22), /elixir/);
  give(st, 1, 'caballero');
  assert.equal(placeProblem(st, 1, 0, 9, 8), null, 'el equipo 1 juega arriba');
  assert.match(placeProblem(st, 1, 0, 9, 22), /mitad/);
  give(st, 0, 'bola-de-fuego');
  assert.equal(placeProblem(st, 0, 0, 9, 4), null, 'los hechizos van donde quieras');
});

test('poner una carta gasta el elixir, rota la mano y suma el elixir que viene entrando', () => {
  const st = duel();
  give(st, 0, 'caballero');
  const next = st.players[0].queue[0];
  stepSim(st, [[1, 0, 0, 90, 220]]);
  assert.equal(units(st, 'caballero').length, 1);
  assert.equal(st.players[0].hand[0], next, 'entra la que seguía');
  assert.equal(st.players[0].queue.at(-1), 'caballero', 'la usada va al fondo');
  assert.ok(Math.abs(st.players[0].elixir - (10 - 3 + 1 / 56)) < 1e-9);
});

test('las cartas de varios (esqueletos, esbirros) salen todas juntas', () => {
  const st = duel(deckWith('esqueletos', 'esbirros'), deckWith('esqueletos', 'esbirros'));
  play(st, 0, 'esqueletos', 9, 22);
  play(st, 0, 'esbirros', 9, 24);
  assert.equal(units(st, 'esqueletos').length, 3);
  assert.equal(units(st, 'esbirros').length, 6);
});

test('una tropa recién puesta tarda un segundo en activarse', () => {
  const st = duel();
  play(st, 0, 'caballero', 9, 22);
  const k = units(st, 'caballero')[0];
  const y0 = k.y;
  run(st, TPS - 2);
  assert.equal(k.y, y0, 'todavía no se movió');
  run(st, 8);
  assert.ok(k.y < y0, 'ya camina hacia las torres enemigas');
});

test('el suelo cruza el río solo por los puentes y el Montapuercos lo salta', () => {
  const st = duel(deckWith('caballero', 'montapuercos'), deckWith('esqueletos'));
  play(st, 0, 'caballero', 9, 19);
  play(st, 0, 'montapuercos', 9, 19);
  let crossedKnight = false;
  let hogCrossedOffBridge = false;
  for (let i = 0; i < 400; i++) {
    stepSim(st);
    const k = units(st, 'caballero')[0];
    const h = units(st, 'montapuercos')[0];
    if (k && Math.abs(k.y - RIVER_Y) < 1) { crossedKnight = true; assert.ok(BRIDGES.some((b) => Math.abs(k.x - b) <= 1.5), `el caballero estaba en el río en x=${k.x}`); }
    if (h && Math.abs(h.y - RIVER_Y) < 1 && !BRIDGES.some((b) => Math.abs(h.x - b) <= 1.5)) hogCrossedOffBridge = true;
  }
  assert.ok(crossedKnight, 'el caballero llegó al río');
  assert.ok(hogCrossedOffBridge, 'el Montapuercos saltó por cualquier lado');
});

test('el Gigante ignora a las tropas y va a las torres; el Caballero se frena a pelear', () => {
  const st = duel(deckWith('gigante', 'caballero'), deckWith('caballero', 'esqueletos'));
  play(st, 1, 'caballero', 9, 11);
  play(st, 0, 'gigante', 9, 19);
  const giant = units(st, 'gigante')[0];
  for (let i = 0; i < 20 * 20; i++) {
    stepSim(st);
    assert.ok(giant.tg < 10, 'su objetivo nunca es una tropa (los ids de las torres son 1 a 6)');
  }
  assert.ok(giant.hp > 0, 'el gigante sigue vivo');
  assert.ok(giant.y < RIVER_Y, 'cruzó el río por un puente rumbo a las torres');
});

test('los que van solo a edificios eligen la estructura más cercana, aunque haya una torre', () => {
  const st = duel(deckWith('gigante'), deckWith('canon', 'esqueletos'));
  play(st, 0, 'gigante', 9, 19);
  const giant = units(st, 'gigante')[0];
  run(st, 25);
  assert.ok(giant.tg > 0 && giant.tg < 10, 'sin estructuras cerca va a una torre');
  play(st, 1, 'canon', 9, 12);
  run(st, 25);
  const cannon = units(st, 'canon')[0];
  assert.equal(giant.tg, cannon.id, 'el cañón está más cerca que cualquier torre: va al cañón');
  cannon.hp = 0; // lo derriban: vuelve a las torres
  run(st, 4);
  assert.ok(giant.tg > 0 && giant.tg < 10, 'sin el cañón, otra vez a una torre');
});

test('el Montapuercos también se desvía a un cañón que quedó más cerca que su torre', () => {
  const st = duel(deckWith('montapuercos'), deckWith('canon', 'esqueletos'));
  play(st, 1, 'canon', 14.5, 13);
  play(st, 0, 'montapuercos', 14.5, 19);
  const hog = units(st, 'montapuercos')[0];
  const cannon = units(st, 'canon')[0];
  run(st, 25);
  assert.equal(hog.tg, cannon.id);
});

test('los hechizos dañan por área, aturden y a las torres les pegan el 35 %', () => {
  const st = duel(deckWith('caballero', 'bola-de-fuego', 'descarga', 'flechas'), deckWith('caballero', 'esbirros', 'duendes'));
  play(st, 1, 'duendes', 9, 5);
  const hp0 = units(st, 'duendes')[0].hp;
  run(st, 22); // se activan
  play(st, 0, 'descarga', 9, 5);
  run(st, 3);
  const g = units(st, 'duendes')[0];
  assert.ok(g.hp < hp0, 'la descarga daña');
  assert.ok(g.stun > 0, 'y aturde');
  const king = tower(st, 1, 'king');
  const before = st.towers.filter((t) => t.team === 1).map((t) => t.hp);
  play(st, 0, 'bola-de-fuego', tower(st, 1, 'princess', 0).x, tower(st, 1, 'princess', 0).y);
  run(st, 14);
  const princess = tower(st, 1, 'princess', 0);
  assert.ok(Math.abs((princess.max - princess.hp) - CARD_BY_ID['bola-de-fuego'].dmg * 0.35) < 1e-6, `daño a la torre: ${princess.max - princess.hp}`);
  assert.equal(king.hp, before[2], 'el rey no se tocó');
});

test('el Globo Bomba, al caer, suelta una bomba que daña al suelo', () => {
  const st = duel(deckWith('globo', 'caballero'), deckWith('caballero'));
  play(st, 1, 'caballero', 9, 9);
  const k = units(st, 'caballero')[0];
  run(st, 22);
  play(st, 0, 'globo', 9, 22);
  const balloon = units(st, 'globo')[0];
  balloon.x = k.x; balloon.y = k.y; // lo llevamos al lugar de la caída
  balloon.hp = 0; // lo bajan
  stepSim(st);
  assert.equal(units(st, 'globo').length, 0);
  assert.equal(st.fx.filter((f) => f.k === 'bomb').length, 1);
  const hp = k.hp;
  run(st, 22);
  assert.ok(k.hp < hp, 'la bomba le pegó al caballero');
});

test('un edificio se va gastando y desaparece a los 30 segundos', () => {
  const st = duel(deckWith('canon'), deckWith('esqueletos'));
  play(st, 0, 'canon', 9, 20);
  assert.equal(units(st, 'canon').length, 1);
  run(st, 20 * 25);
  assert.equal(units(st, 'canon').length, 1, 'a los 25 s sigue');
  run(st, 20 * 8);
  assert.equal(units(st, 'canon').length, 0, 'a los 33 s ya no está');
});

test('el Mortero no le pega a lo que tiene muy cerca y el Cañón no apunta al aire', () => {
  const st = duel(deckWith('mortero', 'canon'), deckWith('esqueletos', 'esbirros'));
  play(st, 0, 'mortero', 9, 22);
  play(st, 1, 'esqueletos', 9, 18.5);
  run(st, 20 * 3);
  const mortar = units(st, 'mortero')[0];
  assert.equal(mortar.tg, 0, 'con alguien pegado no tiene a quién');
  const st2 = duel(deckWith('canon'), deckWith('esbirros'));
  play(st2, 0, 'canon', 9, 22);
  play(st2, 1, 'esbirros', 9, 18);
  run(st2, 20 * 2);
  const cannon = units(st2, 'canon')[0];
  assert.ok(units(st2, 'esbirros').every((e) => e.hp === e.max) || cannon.hp > 0);
  assert.equal(cannon.tg === 0 || units(st2, 'esbirros').every((e) => e.id !== cannon.tg), true, 'no apunta a voladores');
});

test('el Príncipe carga: tras 2 segundos corriendo pega el doble', () => {
  const st = duel(deckWith('principe'), deckWith('pekka'));
  play(st, 0, 'principe', 3.5, 19);
  const prince = units(st, 'principe')[0];
  run(st, 20 + 2 * TPS + 4);
  assert.ok(prince.charge >= CARD_BY_ID.principe.charge, 'cargado');
});

test('cae una princesa: suma una corona y el rey se despierta; cae el rey y termina', () => {
  const st = duel();
  const p = tower(st, 1, 'princess', 0);
  const king = tower(st, 1, 'king');
  assert.equal(king.awake, false);
  p.hp = 0;
  stepSim(st);
  assert.equal(p.dead, true);
  assert.deepEqual(st.crowns, [1, 0]);
  assert.equal(king.awake, true);
  assert.equal(st.over, null);
  assert.equal(placeProblem((() => { give(st, 0, 'caballero'); return st; })(), 0, 0, 3.5, 13), null, 'bolsillo: se puede poner más adelante en ese carril');
  assert.match(placeProblem(st, 0, 0, 14.5, 13), /mitad/, 'pero no en el otro');
  king.hp = 0;
  stepSim(st);
  assert.deepEqual(st.over, { winner: 0, reason: 'king', tick: st.tick });
  assert.deepEqual(st.crowns, [4, 0]);
});

test('tiempo: gana quien tiene más coronas; si empatan hay tiempo extra donde gana la primera', () => {
  const st = duel();
  st.tick = st.reg - 1;
  tower(st, 1, 'princess', 1).hp = 0;
  stepSim(st);
  assert.equal(st.over.winner, 0);
  assert.equal(st.over.reason, 'time');

  const tie = duel();
  tie.tick = tie.reg - 1;
  stepSim(tie);
  assert.equal(tie.over, null, 'empate: sigue en tiempo extra');
  tower(tie, 0, 'princess', 0).hp = 0;
  stepSim(tie);
  assert.deepEqual([tie.over.winner, tie.over.reason], [1, 'overtime']);

  const hp = duel();
  hp.tick = hp.reg + hp.ot - 1;
  tower(hp, 1, 'princess', 0).hp = 700; // sin coronas: gana el que tiene más vida en las torres
  stepSim(hp);
  assert.deepEqual([hp.over.winner, hp.over.reason], [0, 'hp']);
});

test('el elixir va al doble en el último minuto y no pasa de 10', () => {
  const st = duel();
  st.players[0].elixir = 0;
  stepSim(st);
  const slow = st.players[0].elixir;
  st.tick = st.reg - 20 * 60;
  st.players[0].elixir = 0;
  stepSim(st);
  assert.ok(Math.abs(st.players[0].elixir - slow * 2) < 1e-9);
  st.players[0].elixir = 9.999;
  stepSim(st);
  assert.equal(st.players[0].elixir, 10);
});

// ─── Determinismo y rollback ─────────────────────────────────────────────────
// Un partido jugado «a las apuradas»: cada tanto, cada asiento pone la primera carta que le alcanza.
function scriptedCmds(init, every = 36, until = 4200) {
  const probe = newMatch(init);
  const cmds = [];
  let r = 12345;
  const rnd = () => { r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  for (let t = 20; t < until; t += every) {
    for (let seat = 0; seat < init.players.length; seat++) {
      const team = init.players[seat].team;
      const slot = Math.floor(rnd() * 4);
      const x = 1 + Math.floor(rnd() * 16);
      const y = team === 0 ? 18 + Math.floor(rnd() * 12) : 2 + Math.floor(rnd() * 12);
      cmds.push([t + seat, seat, slot, x * 10, y * 10]);
    }
  }
  void probe;
  return cmds;
}

const INIT = { seed: 99, minutes: 3, players: [{ team: 0, deck: ALL.slice(0, 8) }, { team: 1, deck: ALL.slice(8, 16) }] };

test('simulación: una partida entera termina, sin números rotos y con todas las cartas jugables', () => {
  const cmds = scriptedCmds(INIT);
  const r = createRunner(INIT);
  r.addCmds(cmds);
  r.advanceTo(5000);
  const st = r.state;
  assert.ok(st.over, `terminó (tick ${st.tick})`);
  assert.ok(st.over.tick <= st.reg + st.ot);
  for (const u of st.units) for (const k of ['x', 'y', 'hp']) assert.ok(Number.isFinite(u[k]), `${u.card}.${k}`);
  for (const u of st.units) assert.ok(u.x >= 0 && u.x <= W && u.y >= 0 && u.y <= H);
  assert.ok(st.players.every((p) => p.played > 5), 'jugaron varias cartas');
});

test('determinismo: dos corridas con las mismas jugadas dan exactamente lo mismo', () => {
  const cmds = scriptedCmds(INIT);
  const a = createRunner(INIT);
  const b = createRunner(INIT);
  a.addCmds(cmds); a.advanceTo(3000);
  for (let i = 0; i < 3000; i += 7) b.advanceTo(i); // a otro ritmo de cuadros
  b.addCmds(cmds); b.advanceTo(3000);
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('rollback: una jugada que llega tarde deja la partida igual que si hubiera llegado a tiempo', () => {
  const cmds = scriptedCmds(INIT);
  const onTime = createRunner(INIT);
  onTime.addCmds(cmds);
  onTime.advanceTo(2400);

  const late = createRunner(INIT);
  const early = cmds.filter((_, i) => i % 5 !== 3);
  const missing = cmds.filter((_, i) => i % 5 === 3);
  late.addCmds(early);
  late.advanceTo(1500);
  // llegan con 40 pasos de atraso (y la lista de la sala conserva el orden de anotación)
  const all = [...early];
  for (const c of missing) if (c[0] <= 1500) all.push(c);
  late.addCmds(all);
  late.advanceTo(1800);
  const rest = cmds.filter((c) => !all.includes(c));
  late.addCmds([...all, ...rest]);
  late.advanceTo(2400);
  const ref = createRunner(INIT);
  ref.addCmds([...all, ...rest]);
  ref.advanceTo(2400);
  assert.equal(JSON.stringify(late.state), JSON.stringify(ref.state), 'el rollback no cambia el resultado');
  assert.notEqual(JSON.stringify(late.state), '');
  assert.ok(onTime.state.tick === 2400);
});

test('2 contra 2: cuatro asientos, cada uno con su mano y su elixir', () => {
  const init = { seed: 5, minutes: 3, players: [{ team: 0, deck: ALL.slice(0, 8) }, { team: 0, deck: ALL.slice(4, 12) }, { team: 1, deck: ALL.slice(8, 16) }, { team: 1, deck: ALL.slice(12, 20) }] };
  const r = createRunner(init);
  r.addCmds(scriptedCmds(init, 30, 3000));
  r.advanceTo(3300);
  assert.equal(r.state.players.length, 4);
  assert.ok(r.state.players.every((p) => p.played > 0));
});

// ─── La sala ─────────────────────────────────────────────────────────────────
const NOW = 10000;
function act(room, who, action, ctx = {}) {
  const out = applyAction(room, { ...action, playerId: who }, { now: NOW, rand: () => 0.5, ...ctx });
  assert.ok(out, `se rechazó ${action.type} de ${who}`);
  return out;
}
function lobby() {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  room = act(room, 'b', { type: 'join', name: 'Beto', avatar: '🦊' });
  return room;
}

test('sala: los que entran se reparten entre los equipos, de a dos por equipo', () => {
  let room = lobby();
  assert.deepEqual(room.players.map((p) => p.team), [0, 1]);
  room = act(room, 'c', { type: 'join', name: 'Cata' });
  room = act(room, 'd', { type: 'join', name: 'Dani' });
  assert.deepEqual(room.players.map((p) => p.team), [0, 1, 0, 1]);
  assert.equal(applyAction(room, { type: 'join', playerId: 'e', name: 'Eli' }, { now: NOW }), null, 'hay 4 como máximo');
  assert.equal(applyAction(room, { type: 'setTeam', playerId: 'a', team: 1 }, { now: NOW }), null, 'el equipo 1 está lleno');
  const solo = act(lobby(), 'a', { type: 'setTeam', playerId: 'a', team: 1 });
  assert.equal(findPlayer(solo, 'a').team, 1);
});

test('sala: el mazo se valida y las opciones las cambia el anfitrión', () => {
  const room = lobby();
  const deck = ALL.slice(0, 8);
  assert.deepEqual(findPlayer(act(room, 'b', { type: 'setDeck', deck }), 'b').deck, deck);
  assert.equal(applyAction(room, { type: 'setDeck', playerId: 'b', deck: ALL.slice(0, 7) }, { now: NOW }), null);
  assert.equal(applyAction(room, { type: 'setDeck', playerId: 'b', deck: Array(8).fill('pekka') }, { now: NOW }), null);
  assert.equal(act(room, 'a', { type: 'setOptions', options: { minutes: 5 } }).options.minutes, 5);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'b', options: { minutes: 5 } }, { now: NOW }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'a', options: { minutes: 7 } }, { now: NOW }), null);
});

test('sala: empezar pide al anfitrión y gente en los dos equipos; deja todo en la sala para simular', () => {
  const solo = newRoom('a', 'Ana', '🐸', NOW);
  assert.equal(applyAction(solo, { type: 'start', playerId: 'a' }, { now: NOW }), null, 'solo no se puede');
  const room = lobby();
  assert.equal(applyAction(room, { type: 'start', playerId: 'b' }, { now: NOW }), null, 'solo el anfitrión');
  const playing = act(room, 'a', { type: 'start' }, { rand: () => 0.25 });
  assert.equal(playing.phase, 'playing');
  assert.equal(playing.match.startsAt, NOW + COUNTDOWN_MS);
  assert.ok(playing.match.seed > 0);
  assert.deepEqual(playing.match.seats.map((s) => [s.id, s.team]), [['a', 0], ['b', 1]]);
  assert.ok(validDeck(playing.match.seats[0].deck));
  const sim = newMatch({ seed: playing.match.seed, minutes: playing.match.minutes, players: playing.match.seats });
  assert.equal(sim.players.length, 2);
  assert.equal(applyAction(playing, { type: 'join', playerId: 'z', name: 'Z' }, { now: NOW }), null, 'no se entra a mitad de partida');
});

test('sala: una jugada se anota con el paso que le toca según la hora del servidor', () => {
  const playing = act(lobby(), 'a', { type: 'start' });
  const start = playing.match.startsAt;
  assert.equal(applyAction(playing, { type: 'play', playerId: 'a', slot: 0, x: 9, y: 20 }, { now: start - 100 }), null, 'antes de arrancar no');
  const after = applyAction(playing, { type: 'play', playerId: 'b', slot: 2, x: 4.26, y: 7 }, { now: start + 1000 });
  assert.deepEqual(after.match.cmds, [[tickAt(playing.match, start + 1000) + LEAD, 1, 2, 43, 70]]);
  assert.equal(tickAt(playing.match, start + 1000), 20);
  for (const bad of [{ slot: 4 }, { slot: -1 }, { slot: 1.5 }, { slot: 0, x: NaN }]) {
    assert.equal(applyAction(playing, { type: 'play', playerId: 'a', slot: 0, x: 9, y: 20, ...bad }, { now: start + 50 }), null);
  }
  assert.equal(applyAction(playing, { type: 'play', playerId: 'zz', slot: 0, x: 9, y: 20 }, { now: start + 50 }), null, 'solo los que juegan');
});

test('sala: terminar anota al ganador una sola vez; salirse en plena partida regala la victoria', () => {
  const playing = act(lobby(), 'a', { type: 'start' });
  const start = playing.match.startsAt;
  const ended = applyAction(playing, { type: 'finish', playerId: 'a', winner: 1 }, { now: start + 5000 });
  assert.equal(ended.phase, 'ended');
  assert.equal(ended.winnerTeam, 1);
  assert.equal(findPlayer(ended, 'b').wins, 1);
  assert.equal(applyAction(ended, { type: 'finish', playerId: 'b', winner: 0 }, { now: start + 6000 }), null, 'la segunda no cuenta');
  assert.equal(applyAction(playing, { type: 'finish', playerId: 'a', winner: 5 }, { now: start + 5000 }), null);
  const forfeit = act(playing, 'a', { type: 'leave' });
  assert.equal(forfeit.phase, 'ended');
  assert.equal(forfeit.winnerTeam, 1);
  const again = act(forfeit, 'b', { type: 'toLobby' });
  assert.equal(again.phase, 'lobby');
  assert.deepEqual(again.players.map((p) => p.id), ['b']);
});

test('sala: otra partida desde el final y vuelta a la sala de espera', () => {
  const playing = act(lobby(), 'a', { type: 'start' }, { rand: () => 0.1 });
  const ended = applyAction(playing, { type: 'finish', playerId: 'a', winner: 0 }, { now: playing.match.startsAt + 100 });
  const again = act(ended, 'a', { type: 'start' }, { rand: () => 0.9 });
  assert.equal(again.phase, 'playing');
  assert.equal(again.matchN, 2);
  assert.deepEqual(again.match.cmds, []);
  assert.notEqual(again.match.seed, playing.match.seed);
  assert.equal(act(ended, 'a', { type: 'toLobby' }).phase, 'lobby');
});

test('sala: el peor caso (4 jugadores, tope de jugadas) entra con holgura en los 30.000 caracteres', () => {
  let room = newRoom('a', 'N'.repeat(20), '🐸', NOW);
  for (const id of ['b', 'c', 'd']) room = act(room, id, { type: 'join', name: id.repeat(20), avatar: '🦊' });
  room = act(room, 'a', { type: 'start' });
  for (let i = 0; i < MAX_CMDS + 10; i++) {
    const next = applyAction(room, { type: 'play', playerId: 'abcd'[i % 4], slot: i % 4, x: 17.5, y: 31.5 }, { now: room.match.startsAt + 100000 + i * 3000 });
    if (next) room = next;
  }
  assert.equal(room.match.cmds.length, MAX_CMDS);
  const size = serializeRoom(room).length;
  assert.ok(size < 16000, `pesa ${size}`);
});

test('sala: se lee como Arena Royale en el resumen de salas', () => {
  const sum = summarizeRoom('ABCD', null, serializeRoom(lobby()));
  assert.equal(sum.game, 'arena');
  assert.equal(sum.max, MAX_PLAYERS);
  assert.equal(sum.players, 2);
});

// ─── Cartas nuevas ───────────────────────────────────────────────────────────
test('cartas nuevas: cada una de las 50 se puede jugar sin romper nada, y el golemita no se juega solo', () => {
  assert.ok(CARD_BY_ID.golemita.hidden);
  assert.ok(!ALL.includes('golemita'));
  assert.ok(SPRITES.golemita, 'el golemita tiene dibujo');
  assert.ok(!validDeck([...DEFAULT_DECK.slice(1), 'golemita']), 'no entra en un mazo');
  for (const id of ALL) {
    const st = duel(deckWith(id), deckWith('caballero'));
    play(st, 0, id, 9, 22);
    run(st, 20 * 12);
    for (const u of st.units) for (const k of ['x', 'y', 'hp']) assert.ok(Number.isFinite(u[k]), `${id}: ${u.card}.${k}`);
  }
});

test('Bruja y Tumba invocan esqueletos cada tanto', () => {
  const st = duel();
  play(st, 0, 'tumba', 9, 22);
  run(st, 20 * 8);
  assert.ok(units(st, 'esqueletos').length >= 3, 'la tumba saca tres esqueletos');
  assert.ok(units(st, 'esqueletos').every((u) => u.team === 0 && u.owner === 0));
  const st2 = duel();
  play(st2, 0, 'bruja', 9, 22);
  run(st2, 20 * 9);
  assert.ok(units(st2, 'esqueletos').length >= 3, 'la bruja invoca');
});

test('el Golem suelta dos golemitas al romperse y el Sabueso de Lava, murciélagos', () => {
  const st = duel();
  play(st, 0, 'golem', 9, 22);
  run(st, 25);
  units(st, 'golem')[0].hp = 0;
  run(st, 2);
  assert.equal(units(st, 'golemita').length, 2);
  const st2 = duel();
  play(st2, 0, 'sabueso-de-lava', 9, 22);
  run(st2, 25);
  units(st2, 'sabueso-de-lava')[0].hp = 0;
  run(st2, 2);
  assert.equal(units(st2, 'murcielagos').length, 3);
});

test('hechizos nuevos: la Curación cura, el Granizo frena, el Veneno pega varias veces y el Tronco no toca el aire', () => {
  const st = duel();
  play(st, 0, 'caballero', 9, 22);
  run(st, 25);
  const k = units(st, 'caballero')[0];
  k.hp = 100;
  play(st, 0, 'curacion', k.x, k.y);
  run(st, 12);
  assert.equal(k.hp, 320, 'cura 220');

  const st2 = duel();
  play(st2, 1, 'caballero', 9, 10);
  run(st2, 25);
  play(st2, 0, 'granizo', units(st2, 'caballero')[0].x, units(st2, 'caballero')[0].y);
  run(st2, 12);
  assert.ok(units(st2, 'caballero')[0].slow > 0);
  assert.ok(units(st2, 'caballero')[0].hp < 690);

  const st3 = duel();
  play(st3, 1, 'caballero', 9, 10);
  run(st3, 25);
  const kk = units(st3, 'caballero')[0];
  const hp0 = kk.hp;
  play(st3, 0, 'veneno', kk.x, kk.y);
  run(st3, 20 * 3);
  const mid = kk.hp;
  run(st3, 20 * 6);
  assert.ok(mid < hp0 && kk.hp < mid, 'sigue pegando con los segundos');
  assert.equal(st3.fx.length, 0, 'se termina');

  const st4 = duel();
  play(st4, 1, 'murcielagos', 9, 10);
  run(st4, 25);
  const b = units(st4, 'murcielagos')[0];
  play(st4, 0, 'tronco', b.x, b.y);
  run(st4, 12);
  assert.ok(units(st4, 'murcielagos').every((u) => u.hp === CARD_BY_ID.murcielagos.hp), 'el aire no se toca');
});

test('Barril de Duendes: suelta tres duendes en tu mitad y no se tira en la del rival', () => {
  const st = duel();
  give(st, 0, 'barril');
  assert.match(placeProblem(st, 0, 0, 9, 8), /mitad/);
  play(st, 0, 'barril', 9, 22);
  run(st, 25);
  assert.equal(units(st, 'duendes').length, 3);
});

test('Minero: se pone en cualquier lado; Electromago y Mago de Hielo pegan con efecto', () => {
  const st = duel();
  give(st, 0, 'minero');
  assert.equal(placeProblem(st, 0, 0, 9, 6), null, 'en la mitad enemiga también');
  const st2 = duel();
  play(st2, 0, 'electromago', 9, 22);
  play(st2, 1, 'caballero', 9, 14);
  let stunned = false;
  for (let i = 0; i < 20 * 14 && !stunned; i++) { stepSim(st2); stunned = units(st2, 'caballero').some((u) => u.stun > 0); }
  assert.ok(stunned, 'el electromago aturde');
  const st3 = duel();
  play(st3, 0, 'mago-de-hielo', 9, 22);
  play(st3, 1, 'caballero', 9, 14);
  let slowed = false;
  for (let i = 0; i < 20 * 14 && !slowed; i++) { stepSim(st3); slowed = units(st3, 'caballero').some((u) => u.slow > 0); }
  assert.ok(slowed, 'el mago de hielo frena');
});

// ─── Elegir cartas ───────────────────────────────────────────────────────────
function draftRoom(mode, four = false) {
  let room = newRoom('a', 'Ana', '🐸', NOW);
  room = act(room, 'b', { type: 'join', name: 'Beto' });
  if (four) { room = act(room, 'c', { type: 'join', name: 'Cata' }); room = act(room, 'd', { type: 'join', name: 'Dani' }); }
  room = act(room, 'a', { type: 'setOptions', options: { mode } });
  return room;
}

test('modos: solo cambia el anfitrión y la doble elección pide equipos parejos', () => {
  const room = draftRoom('double');
  assert.equal(room.options.mode, 'double');
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'b', options: { mode: 'triple' } }, { now: NOW }), null);
  assert.equal(applyAction(room, { type: 'setOptions', playerId: 'a', options: { mode: 'quintuple' } }, { now: NOW }), null);
  const uneven = act(room, 'c', { type: 'join', name: 'Cata' });
  assert.match(startProblem(uneven), /parejos/);
  assert.equal(applyAction(uneven, { type: 'start', playerId: 'a' }, { now: NOW }), null);
  assert.equal(startProblem(room), null);
});

test('doble elección: 2 cartas, 4 veces; lo que no elegís se lo queda el rival', () => {
  const room = act(draftRoom('double'), 'a', { type: 'start' }, { rand: () => 0.3 });
  assert.equal(room.phase, 'drafting');
  assert.equal(room.match, null);
  const { draft } = room;
  assert.equal(draft.mode, 'double');
  const offers = draftOffers(draft.seed, draft.seats, 'double');
  assert.equal(offers.length, 2);
  for (const o of offers) { assert.equal(o.length, 4); assert.ok(o.every((r) => r.length === 2)); }
  assert.equal(new Set(offers.flat(2)).size, 16, 'las 16 ofertas de la pareja son distintas');
  assert.equal(rivalIndex(draft.seats, 0), 1);

  assert.equal(applyAction(room, { type: 'draftPick', playerId: 'a', index: 2, round: 0 }, { now: NOW }), null, 'solo 0 o 1');
  assert.equal(applyAction(room, { type: 'draftPick', playerId: 'zz', index: 0, round: 0 }, { now: NOW }), null);
  assert.equal(applyAction(room, { type: 'draftPick', playerId: 'a', index: 0, round: 3 }, { now: NOW }), null, 'una vieja que llega tarde');
  let r = room;
  for (let i = 0; i < 4; i++) {
    assert.equal(r.phase, 'drafting');
    r = act(r, 'a', { type: 'draftPick', index: 0, round: i });
  }
  assert.equal(applyAction(r, { type: 'draftPick', playerId: 'a', index: 0 }, { now: NOW }), null, 'ya eligió todo');
  assert.equal(r.phase, 'drafting', 'espera al otro');
  for (let i = 0; i < 4; i++) r = act(r, 'b', { type: 'draftPick', index: 1, round: i });
  assert.equal(r.phase, 'playing');
  assert.equal(r.draft, null);
  const [da, db] = r.match.seats.map((s) => s.deck);
  assert.ok(validDeck(da) && validDeck(db), 'mazos de 8 sin repetir');
  assert.deepEqual(da, [...offers[0].map((o) => o[0]), ...offers[1].map((o) => o[0])]); // B descartó la 0
  assert.deepEqual(db, [...offers[1].map((o) => o[1]), ...offers[0].map((o) => o[1])]); // A descartó la 1
  assert.equal(r.match.startsAt, NOW + COUNTDOWN_MS);
});

test('triple elección: 3 cartas, 8 veces; las demás se descartan', () => {
  let r = act(draftRoom('triple'), 'a', { type: 'start' }, { rand: () => 0.6 });
  const { draft } = r;
  const offers = draftOffers(draft.seed, draft.seats, 'triple');
  for (const o of offers) { assert.equal(o.length, 8); assert.ok(o.every((x) => x.length === 3)); assert.equal(new Set(o.flat()).size, 24); }
  for (let i = 0; i < 8; i++) r = act(r, 'a', { type: 'draftPick', index: i % 3, round: i });
  for (let i = 0; i < 8; i++) r = act(r, 'b', { type: 'draftPick', index: 2, round: i });
  assert.equal(r.phase, 'playing');
  assert.deepEqual(r.match.seats[0].deck, offers[0].map((o, i) => o[i % 3]));
  assert.ok(r.match.seats.every((s) => validDeck(s.deck)));
});

test('elegir cartas: se acaba el tiempo y eligen la primera; irse en plena elección no frena a nadie', () => {
  const room = act(draftRoom('triple'), 'a', { type: 'start' }, { rand: () => 0.2 });
  assert.equal(applyAction(room, { type: 'draftTimeout', playerId: 'a' }, { now: room.draft.deadline - 1 }), null, 'todavía no');
  const out = applyAction(room, { type: 'draftTimeout', playerId: 'b' }, { now: room.draft.deadline, rand: () => 0.5 });
  assert.equal(out.phase, 'playing');
  const offers = draftOffers(room.draft.seed, room.draft.seats, 'triple');
  assert.deepEqual(out.match.seats[1].deck, offers[1].map((o) => o[0]));

  // en 2 contra 2 se va uno: su compañero y los rivales siguen
  const four = act(draftRoom('double', true), 'a', { type: 'start' }, { rand: () => 0.4 });
  let r = act(four, 'c', { type: 'leave' });
  assert.equal(r.phase, 'drafting');
  for (const who of ['a', 'b', 'd']) for (let i = 0; i < 4; i++) r = act(r, who, { type: 'draftPick', index: 0, round: i });
  assert.equal(r.phase, 'playing');
  assert.equal(r.match.seats.length, 3);
  // si se va todo un equipo, termina
  const lone = act(draftRoom('triple'), 'a', { type: 'start' });
  assert.equal(act(lone, 'b', { type: 'leave' }).phase, 'ended');
  assert.equal(act(lone, 'a', { type: 'toLobby' }).draft, null);
});

test('elegir cartas: la revancha vuelve a elegir', () => {
  let r = act(draftRoom('triple'), 'a', { type: 'start' }, { rand: () => 0.2 });
  r = applyAction(r, { type: 'draftTimeout', playerId: 'a' }, { now: r.draft.deadline, rand: () => 0.5 });
  r = applyAction(r, { type: 'finish', playerId: 'a', winner: 0 }, { now: r.match.startsAt + 100 });
  assert.equal(r.phase, 'ended');
  const again = act(r, 'a', { type: 'start' }, { rand: () => 0.9 });
  assert.equal(again.phase, 'drafting');
  const picks = again.draft.seats.map(() => Array(8).fill(0));
  const decks = decksFromPicks({ ...again.draft, picks });
  assert.ok(decks.every((d) => d.length === 8));
  assert.deepEqual(chosenCards(draftOffers(again.draft.seed, again.draft.seats, 'triple'), picks, 0), decks[0]);
});
