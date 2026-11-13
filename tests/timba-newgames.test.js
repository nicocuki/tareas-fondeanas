// La Timba: los juegos del piso 2 en adelante (Crash, Penguin Cross, Keno, Plinko, Rueda del dinero, Baccarat, Mayor o menor
// y Buscaminas) y los límites de apuesta que crecen con los días.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEV_MS, LIMO_MS, applyAction, fmtMoney, newRoom } from '../src/timba/game.js';
import { LIMITS, NAMES, betLimits, limitsFor } from '../src/timba/games.js';
import {
  BACCARAT_SIDES, KENO_MAX_PICK, MINES_OPTIONS, MWHEEL, MWHEEL_COUNTS, MWHEEL_PAYS, NEW_KINDS, NEW_LIMITS, PENGUIN_CUBES, PLINKO_MULTS, PLINKO_ROWS, RTP,
  baccaratMult, crashMsAt, crashMultAt, crashPay, crashPoint, dealBaccarat, handTotal, hiloOdds, hiloStepMult, kenoOdds, kenoRtp, minesMult, newSpin,
  minesPay, penguinMult, penguinPay, pickDistinct,
} from '../src/timba/newgames.js';
import { QUOTA_MULTIPLIERS, TOTAL_DAYS, betScale } from '../src/timba/quota.js';
import { floorTables } from '../src/timba/scenes.js';

// Un azar que devuelve lo que se le dice, en orden (y después sigue con 0,5).
const fixed = (...vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); };
// Un azar que saca justo esas cartas (de 1 a 13) cuando se las pide con `drawRank`.
const cards = (...ranks) => fixed(...ranks.map((r) => (r - 1) / 13 + 0.01));

// ─── Límites que crecen con los días ─────────────────────────────────────────
test('timba: los límites de apuesta crecen con los días: el día 12 son de miles y hasta cientos de miles', () => {
  assert.equal(betScale(1), 1);
  assert.ok(Math.abs(betScale(TOTAL_DAYS) - QUOTA_MULTIPLIERS.slice(0, 11).reduce((a, b) => a * b, 1)) < 1e-9);
  for (const kind of Object.keys(LIMITS)) assert.deepEqual(limitsFor(kind, 1), LIMITS[kind], `${kind}: el día 1 son los de siempre`);
  assert.deepEqual(betLimits('bj', 1e9, 12), { min: 64000, max: 640000 });
  assert.deepEqual(betLimits('bj', 1000, 1), { min: 36, max: 360 });
  for (const kind of Object.keys(LIMITS)) {
    let last = limitsFor(kind, 1);
    for (let d = 2; d <= TOTAL_DAYS; d++) {
      const lim = limitsFor(kind, d);
      assert.ok(lim[0] >= last[0] && lim[1] >= last[1] && lim[1] > lim[0], `${kind}: los límites no bajan (día ${d})`);
      last = lim;
    }
    assert.ok(last[1] >= 100000, `${kind}: el día 12 el máximo es de cientos de miles`);
  }
  assert.equal(betLimits('bj', 100, 12), null, 'con poca plata no se apuesta');
});

test('timba: el dinero se muestra con K, M y B', () => {
  assert.deepEqual([75, 64000, 640000, 1250000, 6612000, 730000000, 4850000000].map(fmtMoney), ['$75', '$64K', '$640K', '$1.25M', '$6.61M', '$730M', '$4.85B']);
  assert.equal(fmtMoney(999999), '$1M');
  assert.equal(fmtMoney(-2500), '$-2.5K');
});

test('timba: cada juego nuevo tiene nombre y límites', () => {
  assert.equal(NEW_KINDS.length, 8);
  for (const kind of NEW_KINDS) { assert.ok(NAMES[kind]); assert.ok(NEW_LIMITS[kind][0] < NEW_LIMITS[kind][1]); }
});

// ─── Reglas puras ────────────────────────────────────────────────────────────
test('crash: sube 0,01 por paso (60 por segundo) y el choque tiene la distribución típica (retirar rinde 0,95)', () => {
  assert.equal(crashMultAt(0), 100);
  assert.equal(crashMultAt(1000), 160);
  assert.equal(crashMultAt(1000 / 60 - 1), 100, 'todavía no completó el primer paso');
  assert.equal(crashMsAt(160), 1000);
  assert.ok(crashMultAt(crashMsAt(7777)) >= 7777, 'el tiempo para llegar a un multiplicador alcanza');
  assert.equal(crashPay(100, 150), 150);
  assert.equal(crashPay(33, 150), 49);
  assert.equal(crashPoint(() => 0), 100, 'el 5 % de las veces choca enseguida');
  assert.equal(crashPoint(() => 0.5), 190);
  assert.equal(crashPoint(() => 0.9999999), 10000, 'tope de 100x');
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const N = 200000;
  const points = Array.from({ length: N }, () => crashPoint(rnd));
  assert.ok(points.every((p) => p >= 100 && p <= 10000));
  for (const x of [150, 200, 500, 1000]) {
    const ev = (points.filter((p) => p > x).length / N) * (x / 100);
    assert.ok(Math.abs(ev - RTP) < 0.04, `retirando a ${x / 100}x se gana en promedio ${ev.toFixed(3)}`);
  }
});

test('penguin: 9 cubos son 8 saltos, cada uno multiplica por 1,5', () => {
  assert.equal(PENGUIN_CUBES, 9);
  assert.equal(penguinMult(0), 1);
  assert.equal(penguinMult(2), 2.25);
  assert.equal(penguinMult(8), 25.62890625);
  assert.equal(penguinPay(100, 3), 337);
  assert.equal(penguinPay(100, 8), 2562);
});

test('mines: cuantas más minas, más paga cada casillero seguro', () => {
  assert.ok(Math.abs(minesMult(3, 1) - (0.95 * 25) / 22) < 1e-12);
  for (const m of MINES_OPTIONS) {
    for (let k = 1; k < 25 - m; k++) assert.ok(minesMult(m, k + 1) > minesMult(m, k), `con ${m} minas sube en cada casillero`);
  }
  assert.ok(minesMult(10, 3) > minesMult(3, 3));
  assert.deepEqual(pickDistinct(25, 5, () => 0.3).length, 5);
  const mines = pickDistinct(25, 24, Math.random);
  assert.equal(new Set(mines).size, 24);
  assert.ok(mines.every((n) => n >= 0 && n < 25));
});

test('hilo: la chance de acertar sale de las cartas que quedan y el multiplicador la compensa', () => {
  assert.equal(hiloOdds(1, 'lo'), 0, 'con el As no se puede ir más abajo');
  assert.equal(hiloOdds(13, 'hi'), 0, 'con el K no se puede ir más arriba');
  assert.ok(Math.abs(hiloOdds(7, 'hi') - 6 / 13) < 1e-12);
  assert.ok(Math.abs(hiloStepMult(7, 'hi') - 0.95 / (6 / 13)) < 1e-12);
  assert.ok(hiloStepMult(12, 'hi') > hiloStepMult(2, 'hi'), 'arriesgar más paga más');
  for (let c = 2; c < 13; c++) assert.ok(Math.abs(hiloOdds(c, 'hi') * hiloStepMult(c, 'hi') - RTP) < 1e-9);
});

test('keno: cada cantidad elegida vuelve 0,95 en promedio y paga más cuanto más se acierta', () => {
  for (let n = 1; n <= KENO_MAX_PICK; n++) {
    assert.ok(Math.abs(kenoRtp(n) - RTP) < 0.01, `eligiendo ${n} vuelve ${kenoRtp(n).toFixed(3)}`);
    let total = 0;
    for (let h = 0; h <= n; h++) total += kenoOdds(n, h);
    assert.ok(Math.abs(total - 1) < 1e-9, 'las chances suman 1');
  }
  const win = newSpin('keno', { picks: [0, 1, 2, 3] }, () => 0);
  assert.equal(win.state.draw.length, 10);
  assert.ok(win.state.hits >= 0 && win.state.hits <= 4);
  assert.equal(newSpin('keno', { picks: [] }, Math.random), null);
  assert.equal(newSpin('keno', { picks: [1, 1] }, Math.random), null, 'sin repetidos');
  assert.equal(newSpin('keno', { picks: [40] }, Math.random), null);
  assert.equal(newSpin('keno', { picks: Array.from({ length: 11 }, (_, i) => i) }, Math.random), null);
});

test('plinko: 9 casilleros, los de las puntas pagan más, y la casa se queda un poco', () => {
  assert.equal(PLINKO_MULTS.length, PLINKO_ROWS + 1);
  const comb = [1, 8, 28, 56, 70, 56, 28, 8, 1];
  const rtp = PLINKO_MULTS.reduce((a, m, i) => a + (m * comb[i]) / 256, 0);
  assert.ok(rtp > 0.9 && rtp < 1, `vuelve ${rtp}`);
  const drop = newSpin('plinko', {}, fixed(0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9));
  assert.equal(drop.state.bin, 4);
  assert.equal(drop.mult, PLINKO_MULTS[4]);
  assert.equal(newSpin('plinko', {}, () => 0.1).state.bin, 0);
  assert.equal(newSpin('plinko', {}, () => 0.9).mult, 9);
});

test('rueda del dinero: 54 casilleros y cada apuesta vuelve cerca de 0,93', () => {
  assert.equal(MWHEEL.length, 54);
  for (const [spot, n] of Object.entries(MWHEEL_COUNTS)) {
    assert.equal(MWHEEL.filter((s) => s === spot).length, n);
    const rtp = (n / 54) * MWHEEL_PAYS[spot];
    assert.ok(rtp > 0.88 && rtp < 0.96, `${spot}: vuelve ${rtp.toFixed(3)}`);
  }
  const seg = MWHEEL.indexOf('5');
  const won = newSpin('mwheel', { spot: '5' }, () => (seg + 0.5) / 54);
  assert.equal(won.state.seg, seg);
  assert.equal(won.mult, MWHEEL_PAYS[5]);
  assert.equal(newSpin('mwheel', { spot: '5' }, () => (MWHEEL.indexOf('1') + 0.5) / 54).mult, 0);
  assert.equal(newSpin('mwheel', { spot: '7' }, Math.random), null);
});

test('baccarat: se reparte, se saca la tercera carta con las reglas del punto banco y se paga', () => {
  assert.equal(handTotal([10, 12]), 0, 'figuras valen 0');
  assert.equal(handTotal([7, 8]), 5);
  // jugador 9 (natural): nadie saca más
  let hand = dealBaccarat(cards(4, 5, 2, 3));
  assert.deepEqual(hand, { p: [4, 5], b: [2, 3], res: 'player' });
  // jugador 5 saca; el banco con 3 saca salvo que el jugador sacó un 8
  hand = dealBaccarat(cards(2, 3, 1, 2, 6, 9));
  assert.equal(hand.p.length, 3, 'el jugador con 5 saca');
  assert.equal(hand.b.length, 3, 'el banco con 3 saca con un 6');
  hand = dealBaccarat(cards(2, 3, 1, 2, 8, 9));
  assert.equal(hand.b.length, 2, 'el banco con 3 no saca si el jugador sacó un 8');
  // jugador 6 se planta; el banco con 5 saca
  hand = dealBaccarat(cards(2, 4, 2, 3, 9));
  assert.equal(hand.p.length, 2);
  assert.equal(hand.b.length, 3, 'el banco con 5 saca si el jugador se plantó');
  // pagos
  assert.equal(baccaratMult('player', 'player'), 2);
  assert.equal(baccaratMult('banker', 'banker'), 1.95);
  assert.equal(baccaratMult('tie', 'tie'), 9);
  assert.equal(baccaratMult('player', 'tie'), 1, 'con empate se devuelve');
  assert.equal(baccaratMult('banker', 'player'), 0);
  assert.equal(baccaratMult('tie', 'banker'), 0);
  assert.equal(newSpin('baccarat', { side: 'nada' }, Math.random), null);
  for (const side of BACCARAT_SIDES) assert.ok(newSpin('baccarat', { side }, Math.random));
});

// ─── La sala: Crash y Penguin Cross en el piso 2 ───────────────────────────
let clock = 1000;
const act = (room, id, action, now = clock, rand = Math.random) => applyAction(room, { ...action, playerId: id }, { now, rand });

// Un jugador en el piso 2 (se gana el día 4), con la caja llena.
function inCasino2(money = 100000) {
  let room = applyAction(newRoom('a', 'Ana', '🐸', 0), { type: 'start', playerId: 'a' }, { now: 1000, rand: Math.random });
  room.day.n = 4;
  room.money = money;
  clock = 1000;
  room = act(room, 'a', { type: 'loc', to: 'limo' });
  clock += LIMO_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  room = act(room, 'a', { type: 'loc', to: 'elevator' });
  room = act(room, 'a', { type: 'floor', to: 2 }, clock);
  clock += ELEV_MS + 10;
  room = act(room, 'a', { type: 'tick' }, clock);
  return act(room, 'a', { type: 'loc', to: 'f2' });
}
const tableOf = (kind) => floorTables(2).find((t) => t.kind === kind);
const sitAt = (room, kind) => act(room, 'a', { type: 'sit', table: tableOf(kind).id });

test('crash: lanzar descuenta la apuesta, retirar paga lo que llegó y chocar antes la pierde', () => {
  assert.ok(tableOf('crash'), 'el piso 5 tiene mesa de crash');
  assert.equal(act(inCasino2(), 'a', { type: 'sit', table: floorTables(1).find((t) => t.kind === 'bj').id }), null, 'las mesas son de su piso');
  let room = sitAt(inCasino2(), 'crash');
  const money0 = room.money;
  assert.equal(act(room, 'a', { type: 'crashLaunch', amount: 1 }, clock), null, 'menos del mínimo del día 4');
  const t0 = clock + 100;
  room = act(room, 'a', { type: 'crashLaunch', amount: 100 }, t0, () => 0.5); // choca a 1,90x
  const tb = Object.values(room.tb)[0];
  assert.equal(tb.point, 190);
  assert.equal(room.money, money0 - 100);
  assert.equal(act(room, 'a', { type: 'crashLaunch', amount: 100 }, t0 + 10), null, 'ya hay una ronda en marcha');
  const t150 = t0 + crashMsAt(150);
  assert.equal(act(room, 'a', { type: 'crashCash', mult: 190 }, t150), null, 'no se puede retirar donde ya chocó');
  assert.ok(act(room, 'a', { type: 'crashCash', mult: 180 }, t150), 'un poco de margen para el atraso de la pantalla');
  const high = act(sitAt(inCasino2(), 'crash'), 'a', { type: 'crashLaunch', amount: 100 }, t0, () => 0.9); // choca a 9,5x
  assert.equal(act(high, 'a', { type: 'crashCash', mult: 400 }, t0 + crashMsAt(150)), null, 'no se puede retirar en un multiplicador que todavía no llegó');
  assert.equal(act(room, 'a', { type: 'crashCash', mult: 99 }, t150), null);
  const cashed = act(room, 'a', { type: 'crashCash', mult: 150 }, t150);
  assert.equal(cashed.money, money0 - 100 + 150);
  assert.equal(cashed.net.a, 50);
  assert.equal(Object.values(cashed.tb)[0].res, 'win');
  assert.equal(act(cashed, 'a', { type: 'crashCash', mult: 150 }, t150), null, 'no se retira dos veces');
  // chocó: se anota la pérdida
  assert.equal(act(room, 'a', { type: 'crashEnd' }, t0 + crashMsAt(190) - 5), null, 'todavía no chocó');
  const lost = act(room, 'a', { type: 'crashEnd' }, t0 + crashMsAt(190));
  assert.equal(lost.money, money0 - 100);
  assert.equal(lost.net.a, -100);
  assert.equal(Object.values(lost.tb)[0].res, 'lose');
  // se puede volver a lanzar
  assert.ok(act(lost, 'a', { type: 'crashLaunch', amount: 100 }, t0 + 9000, () => 0.5));
});

test('crash: levantarse en pleno vuelo retira lo que llegó; si ya chocó, pierde; con choque inmediato, pierde', () => {
  let room = sitAt(inCasino2(), 'crash');
  const money0 = room.money;
  const t0 = clock + 100;
  room = act(room, 'a', { type: 'crashLaunch', amount: 100 }, t0, () => 0.9); // choca a 9,5x
  const mid = act(room, 'a', { type: 'stand' }, t0 + crashMsAt(200));
  assert.ok(mid.money > money0 - 100 && mid.money <= money0 - 100 + crashPay(100, 201), 'cobra lo que llegó');
  assert.deepEqual(mid.tb, {});
  const late = act(room, 'a', { type: 'stand' }, t0 + crashMsAt(950) + 100);
  assert.equal(late.money, money0 - 100, 'ya había chocado');
  assert.equal(late.net.a, -100);
  const instant = act(act(sitAt(inCasino2(), 'crash'), 'a', { type: 'crashLaunch', amount: 100 }, t0, () => 0), 'a', { type: 'crashEnd' }, t0);
  assert.equal(Object.values(instant.tb)[0].res, 'lose', 'choca a 1,00x: se pierde al toque');
});

test('penguin: cada salto tiene 1/3 de caer, cada acierto multiplica por 1,5 y retirar paga', () => {
  let room = sitAt(inCasino2(), 'penguin');
  const money0 = room.money;
  assert.equal(act(room, 'a', { type: 'penguinStep' }), null, 'sin apuesta no se salta');
  room = act(room, 'a', { type: 'penguinBet', amount: 100 });
  assert.equal(room.money, money0 - 100);
  assert.equal(act(room, 'a', { type: 'penguinCash' }), null, 'sin saltar no hay nada que retirar');
  assert.equal(act(room, 'a', { type: 'penguinBet', amount: 100 }), null, 'ya hay una ronda');
  for (let i = 0; i < 3; i++) room = act(room, 'a', { type: 'penguinStep' }, clock, () => 0.9);
  const tb = Object.values(room.tb)[0];
  assert.equal(tb.pos, 3);
  assert.equal(tb.res, '');
  const cashed = act(room, 'a', { type: 'penguinCash' });
  assert.equal(cashed.money, money0 - 100 + 337);
  assert.equal(cashed.net.a, 237);
  // cae
  const fell = act(room, 'a', { type: 'penguinStep' }, clock, () => 0.3);
  assert.equal(Object.values(fell.tb)[0].res, 'fall', 'con menos de 1/3 cae');
  assert.equal(Object.values(act(room, 'a', { type: 'penguinStep' }, clock, () => 0.4).tb)[0].res, '', 'con más de 1/3 avanza');
  assert.equal(fell.money, money0 - 100);
  assert.equal(fell.net.a, -100);
  assert.equal(act(fell, 'a', { type: 'penguinStep' }, clock, () => 0.9), null, 'caído, no sigue');
  // llega al último cubo y cobra solo
  let run = act(sitAt(inCasino2(), 'penguin'), 'a', { type: 'penguinBet', amount: 100 });
  for (let i = 0; i < 8; i++) run = act(run, 'a', { type: 'penguinStep' }, clock, () => 0.9);
  const done = Object.values(run.tb)[0];
  assert.equal(done.res, 'win');
  assert.equal(run.money, money0 - 100 + 2562);
  // se levanta con saltos hechos: cobra; sin saltos: devuelve
  const walked = act(act(sitAt(inCasino2(), 'penguin'), 'a', { type: 'penguinBet', amount: 100 }), 'a', { type: 'stand' });
  assert.equal(walked.money, money0);
});

test('mesas nuevas: la plata nunca queda negativa ni con decimales jugando cosas al azar', () => {
  let room = sitAt(inCasino2(5000), 'crash');
  let seed = 99;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const kinds = ['crash', 'penguin'];
  const types = ['crashLaunch', 'crashCash', 'crashEnd', 'penguinBet', 'penguinStep', 'penguinCash', 'stand', 'sit'];
  for (let i = 0; i < 1500; i++) {
    const type = types[Math.floor(rnd() * types.length)];
    clock += 300 + Math.floor(rnd() * 900);
    const action = { type, amount: 5 + Math.floor(rnd() * 200), mult: 100 + Math.floor(rnd() * 400), table: tableOf(kinds[Math.floor(rnd() * 2)]).id };
    const next = applyAction(room, { ...action, playerId: 'a' }, { now: clock, rand: rnd });
    if (next) room = next;
    assert.ok(room.money >= 0 && Number.isInteger(room.money), `plata ${room.money} en el paso ${i} (${type})`);
    for (const t of Object.values(room.tb)) assert.ok(Number.isInteger(t.bet) && t.bet >= 0);
  }
});

// ─── La sala: los juegos de una tirada (Keno, Plinko, Rueda del dinero y Baccarat) ───
// Juega una tirada con el azar dado y la cobra cuando termina la animación.
function playSpin(kind, extra, rand) {
  let room = sitAt(inCasino2(), kind);
  const money0 = room.money;
  const bet = betLimits(kind, room.money, 4).min;
  const t0 = clock + 50;
  room = act(room, 'a', { type: 'spin', amount: bet, ...extra }, t0, rand);
  assert.ok(room, `${kind}: la tirada vale`);
  const tb = Object.values(room.tb)[0];
  assert.equal(room.money, money0 - bet, 'la apuesta sale de la caja');
  assert.equal(act(room, 'a', { type: 'settle' }, t0 + tb.ms - 1), null, 'no se cobra antes de que termine');
  const paid = act(room, 'a', { type: 'settle' }, t0 + tb.ms);
  assert.equal(paid.money, money0 - bet + tb.pay, 'se cobra el premio');
  assert.equal(paid.net.a, tb.pay - bet);
  assert.equal(act(paid, 'a', { type: 'settle' }, t0 + tb.ms + 10), null, 'no se cobra dos veces');
  return { room, paid, tb, bet, money0 };
}

test('keno: se eligen números, salen 10 y se paga según los aciertos', () => {
  const { tb, bet } = playSpin('keno', { picks: [0, 1, 2, 3, 4] }, () => 0); // con azar 0 salen del 0 al 9: acierta los 5
  assert.deepEqual(tb.draw, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(tb.hits, 5);
  assert.equal(tb.pay, Math.floor(bet * 455.62));
  const miss = playSpin('keno', { picks: [30, 31, 32] }, () => 0);
  assert.equal(miss.tb.hits, 0);
  assert.equal(miss.tb.pay, 0);
  const room = sitAt(inCasino2(), 'keno');
  for (const picks of [[], [1, 1], [40], Array.from({ length: 11 }, (_, i) => i), 'x', undefined]) {
    assert.equal(act(room, 'a', { type: 'spin', amount: 10, picks }), null, `picks ${JSON.stringify(picks)} no valen`);
  }
});

test('plinko: la bolita cae por el camino que sale y paga el casillero', () => {
  const { tb, bet } = playSpin('plinko', {}, () => 0.1);
  assert.deepEqual(tb.path, Array(8).fill(0));
  assert.equal(tb.bin, 0);
  assert.equal(tb.pay, Math.floor(bet * 9));
  const mid = playSpin('plinko', {}, fixed(0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9));
  assert.equal(mid.tb.bin, 4);
  assert.equal(mid.tb.pay, Math.floor(mid.bet * 0.4));
});

test('rueda del dinero: se apuesta a un casillero y paga solo si sale', () => {
  const seg = MWHEEL.indexOf('1');
  const win = playSpin('mwheel', { spot: '1' }, () => (seg + 0.5) / 54);
  assert.equal(win.tb.seg, seg);
  assert.equal(win.tb.pay, Math.floor(win.bet * 2.1));
  const lose = playSpin('mwheel', { spot: '20' }, () => (seg + 0.5) / 54);
  assert.equal(lose.tb.pay, 0);
  const room = sitAt(inCasino2(), 'mwheel');
  assert.equal(act(room, 'a', { type: 'spin', amount: 10, spot: '7' }), null);
  assert.equal(act(room, 'a', { type: 'spin', amount: 10 }), null);
});

test('baccarat: jugador, banco o empate, con las cartas que salen', () => {
  const win = playSpin('baccarat', { side: 'player' }, cards(4, 5, 2, 3)); // jugador 9 contra banco 5
  assert.equal(win.tb.res, 'player');
  assert.equal(win.tb.pay, win.bet * 2);
  const bank = playSpin('baccarat', { side: 'banker' }, cards(4, 5, 2, 3));
  assert.equal(bank.tb.pay, 0);
  const tie = playSpin('baccarat', { side: 'player' }, cards(4, 4, 4, 4)); // 8 a 8: empate, se devuelve
  assert.equal(tie.tb.res, 'tie');
  assert.equal(tie.tb.pay, tie.bet);
  const tieBet = playSpin('baccarat', { side: 'tie' }, cards(4, 4, 4, 4));
  assert.equal(tieBet.tb.pay, tieBet.bet * 9);
  const room = sitAt(inCasino2(), 'baccarat');
  assert.equal(act(room, 'a', { type: 'spin', amount: 10, side: 'nadie' }), null);
});

test('mesas nuevas: levantarse con una tirada sin cobrar la cobra al toque', () => {
  let room = sitAt(inCasino2(), 'plinko');
  const money0 = room.money;
  const bet = betLimits('plinko', room.money, 4).min;
  room = act(room, 'a', { type: 'spin', amount: bet }, clock + 10, () => 0.1);
  const left = act(room, 'a', { type: 'stand' }, clock + 20);
  assert.equal(left.money, money0 - bet + Math.floor(bet * 9));
  assert.deepEqual(left.tb, {});
});

test('los juegos nuevos están en los pisos 2 a 4 y no en el piso 1', () => {
  const kindsOf = (n) => new Set(floorTables(n).map((t) => t.kind));
  for (let n = 1; n <= 1; n++) for (const kind of ['crash', 'penguin', 'keno', 'plinko', 'mwheel', 'baccarat', 'hilo', 'mines']) assert.ok(!kindsOf(n).has(kind), `el piso ${n} no tiene ${kind}`);
  for (let n = 2; n <= 4; n++) {
    for (const kind of ['bj', 'slots', 'wheel', 'roulette', 'duck', 'craps', 'crash', 'penguin', 'keno', 'plinko', 'mwheel', 'baccarat', 'hilo', 'mines']) assert.ok(kindsOf(n).has(kind), `el piso ${n} tiene ${kind}`);
  }
});

// ─── La sala: Buscaminas y Mayor o menor ─────────────────────────────────────
test('mines: se destapan casilleros seguros, se retira, o una mina se lo lleva todo', () => {
  let room = sitAt(inCasino2(), 'mines');
  const money0 = room.money;
  const bet = betLimits('mines', room.money, 4).min;
  assert.equal(act(room, 'a', { type: 'minesBet', amount: bet, mines: 4 }), null, 'solo 1, 3, 5 o 10 minas');
  assert.equal(act(room, 'a', { type: 'minesPick', i: 5 }), null, 'sin apuesta no se destapa');
  room = act(room, 'a', { type: 'minesBet', amount: bet, mines: 3 }, clock, () => 0); // con azar 0 las minas quedan en 0, 1 y 2
  assert.equal(room.money, money0 - bet);
  const tb = () => Object.values(room.tb)[0];
  assert.deepEqual(tb().mines, [0, 1, 2]);
  assert.equal(act(room, 'a', { type: 'minesCash' }), null, 'sin destapar nada no hay qué retirar');
  assert.equal(act(room, 'a', { type: 'minesPick', i: 25 }), null);
  const safe = act(room, 'a', { type: 'minesPick', i: 10 });
  assert.deepEqual(Object.values(safe.tb)[0].open, [10]);
  assert.equal(act(safe, 'a', { type: 'minesPick', i: 10 }), null, 'no se destapa dos veces');
  const two = act(safe, 'a', { type: 'minesPick', i: 11 });
  const cashed = act(two, 'a', { type: 'minesCash' });
  assert.equal(cashed.money, money0 - bet + minesPay(bet, 3, 2));
  assert.equal(Object.values(cashed.tb)[0].res, 'cash');
  // mina
  const boom = act(safe, 'a', { type: 'minesPick', i: 1 });
  assert.equal(Object.values(boom.tb)[0].res, 'lose');
  assert.equal(boom.money, money0 - bet);
  assert.equal(boom.net.a, -bet);
  assert.equal(act(boom, 'a', { type: 'minesPick', i: 12 }), null, 'perdida la ronda no se sigue');
  // destapar todo lo seguro cobra solo
  let all = room;
  for (let i = 3; i < 25; i++) all = act(all, 'a', { type: 'minesPick', i });
  assert.equal(Object.values(all.tb)[0].res, 'win');
  assert.equal(all.money, money0 - bet + minesPay(bet, 3, 22));
  // levantarse con casilleros destapados cobra; sin destapar devuelve
  assert.equal(act(safe, 'a', { type: 'stand' }).money, money0 - bet + minesPay(bet, 3, 1));
  assert.equal(act(room, 'a', { type: 'stand' }).money, money0);
});

test('hilo: se adivina mayor o menor, cada acierto multiplica y se puede retirar', () => {
  let room = sitAt(inCasino2(), 'hilo');
  const money0 = room.money;
  const bet = betLimits('hilo', room.money, 4).min;
  assert.equal(act(room, 'a', { type: 'hiloGuess', dir: 'hi' }), null, 'sin apuesta no se adivina');
  room = act(room, 'a', { type: 'hiloBet', amount: bet }, clock, cards(7)); // sale un 7
  const tb = () => Object.values(room.tb)[0];
  assert.equal(tb().card, 7);
  assert.equal(room.money, money0 - bet);
  assert.equal(act(room, 'a', { type: 'hiloCash' }), null, 'sin acertar no se retira');
  assert.equal(act(room, 'a', { type: 'hiloGuess', dir: 'nada' }), null);
  const won = act(room, 'a', { type: 'hiloGuess', dir: 'hi' }, clock, cards(10)); // sale un 10: mayor
  assert.equal(Object.values(won.tb)[0].card, 10);
  assert.equal(Object.values(won.tb)[0].n, 1);
  assert.ok(Math.abs(Object.values(won.tb)[0].m - hiloStepMult(7, 'hi')) < 1e-6);
  const cashed = act(won, 'a', { type: 'hiloCash' });
  assert.equal(cashed.money, money0 - bet + Math.floor(bet * Object.values(won.tb)[0].m + 1e-9));
  // perder: sale una más baja, o igual
  for (const [dir, next] of [['hi', 3], ['lo', 9], ['hi', 7], ['lo', 7]]) {
    const lost = act(room, 'a', { type: 'hiloGuess', dir }, clock, cards(next));
    assert.equal(Object.values(lost.tb)[0].res, 'lose', `${dir} contra ${next}: se pierde`);
    assert.equal(lost.money, money0 - bet);
    assert.equal(lost.net.a, -bet);
  }
  // con As no se puede ir más abajo, con K más arriba
  const ace = act(sitAt(inCasino2(), 'hilo'), 'a', { type: 'hiloBet', amount: bet }, clock, cards(1));
  assert.equal(act(ace, 'a', { type: 'hiloGuess', dir: 'lo' }), null);
  assert.ok(act(ace, 'a', { type: 'hiloGuess', dir: 'hi' }, clock, cards(5)));
  const king = act(sitAt(inCasino2(), 'hilo'), 'a', { type: 'hiloBet', amount: bet }, clock, cards(13));
  assert.equal(act(king, 'a', { type: 'hiloGuess', dir: 'hi' }), null);
});

test('mesas por pasos: la plata nunca queda negativa ni con decimales con las cuatro a la vez', () => {
  let room = sitAt(inCasino2(5000), 'mines');
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const kinds = ['crash', 'penguin', 'mines', 'hilo'];
  const types = ['crashLaunch', 'crashCash', 'crashEnd', 'penguinBet', 'penguinStep', 'penguinCash', 'minesBet', 'minesPick', 'minesCash', 'hiloBet', 'hiloGuess', 'hiloCash', 'stand', 'sit'];
  for (let i = 0; i < 3000; i++) {
    const type = types[Math.floor(rnd() * types.length)];
    clock += 200 + Math.floor(rnd() * 900);
    const action = {
      type, amount: 5 + Math.floor(rnd() * 200), mult: 100 + Math.floor(rnd() * 400), mines: MINES_OPTIONS[Math.floor(rnd() * 4)], i: Math.floor(rnd() * 25),
      dir: rnd() < 0.5 ? 'hi' : 'lo', table: tableOf(kinds[Math.floor(rnd() * 4)]).id,
    };
    const next = applyAction(room, { ...action, playerId: 'a' }, { now: clock, rand: rnd });
    if (next) room = next;
    assert.ok(room.money >= 0 && Number.isInteger(room.money), `plata ${room.money} en el paso ${i} (${type})`);
    for (const t of Object.values(room.tb)) assert.ok(Number.isInteger(t.bet) && t.bet >= 0);
  }
});
