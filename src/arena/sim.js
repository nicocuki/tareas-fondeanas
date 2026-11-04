// Arena Royale: la simulación de la partida. Es lógica pura y DETERMINISTA: las dos (o cuatro) pantallas parten de la
// misma semilla y de la misma lista de jugadas y tienen que llegar al mismo estado, así que acá no hay `Math.random()`,
// ni `Date.now()`, ni trigonometría (`Math.sin` y compañía pueden dar resultados distintos entre navegadores):
// solo sumas, restas, productos, divisiones y raíces cuadradas, que el estándar IEEE deja exactas.
//
// Una jugada es `[tick, asiento, lugar de la mano, x × 10, y × 10]`. Se aplica en el paso `tick`. Si una jugada llega
// tarde (ya simulamos más allá de su tick), el `Runner` vuelve a un punto guardado y repite el tramo (rollback).
import {
  CARD_BY_ID, DEPLOY_TICKS, HAND_SIZE, LOAD_TICKS, T, TOWER_SPELL, TPS,
} from './cards.js';

export const W = 18;
export const H = 32;
export const RIVER_Y = 16;
export const BAND = 1;                  // medio ancho del río (los puentes lo cruzan)
export const BRIDGES = [3.5, 14.5];     // centro de cada puente
export const BRIDGE_HALF = 1.5;
export const LEAD = 6;                  // una jugada se aplica 6 pasos (0,3 s) después de que la sala la anota
export const MAX_ELIXIR = 10;
const SIGHT = 5.5;
const EV_KEEP = 10;                     // cuántos pasos se guardan los avisos de dibujo (golpes, explosiones)

const PRINCESS = { hp: 1400, dmg: 50, hit: T(0.8), range: 7.5, r: 1.4 };
const KING = { hp: 2400, dmg: 50, hit: T(1), range: 7, r: 1.8 };
const TOWER_SPOTS = [
  // equipo 0 abajo, equipo 1 arriba (espejo)
  { kind: 'princess', side: 0, x: 3.5, y: 25.5 },
  { kind: 'princess', side: 1, x: 14.5, y: 25.5 },
  { kind: 'king', side: 0, x: 9, y: 29.5 },
];

const D = (u) => CARD_BY_ID[u.card];
const dist = (a, b) => { const dx = a.x - b.x; const dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };
const alive = (e) => (e.tw ? !e.dead : e.hp > 0);
const isFly = (u) => Boolean(D(u).fly);

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Arranque ────────────────────────────────────────────────────────────────
// `init`: { seed, minutes, players: [{ team, deck }] }.
export function newMatch(init) {
  const rand = mulberry32(init.seed);
  const towers = [];
  let id = 1;
  for (const team of [0, 1]) {
    for (const spot of TOWER_SPOTS) {
      const base = spot.kind === 'king' ? KING : PRINCESS;
      towers.push({
        id: id++, tw: true, team, kind: spot.kind, side: spot.side, x: spot.x, y: team === 0 ? spot.y : H - spot.y,
        r: base.r, hp: base.hp, max: base.hp, dmg: base.dmg, hit: base.hit, range: base.range, cd: 0, tg: 0, awake: spot.kind !== 'king', dead: false,
      });
    }
  }
  const players = init.players.map((p, seat) => {
    const order = shuffle(p.deck, rand);
    return { seat, team: p.team, elixir: 5, hand: order.slice(0, HAND_SIZE), queue: order.slice(HAND_SIZE), played: 0 };
  });
  return {
    tick: 0, nid: 10, towers, units: [], fx: [], ev: [], players, crowns: [0, 0],
    reg: Math.round(init.minutes * 60 * TPS), ot: 60 * TPS, over: null,
  };
}

// ─── Poner una carta ─────────────────────────────────────────────────────────
function zoneOk(st, team, x, y) {
  if (Math.abs(y - RIVER_Y) < BAND + 0.5) return false; // ni el río ni los puentes
  if (team === 0 ? y > RIVER_Y : y < RIVER_Y) return true;
  // Bolsillo: si cayó la princesa enemiga de ese lado, se puede poner un poco más adelante.
  const side = x < W / 2 ? 0 : 1;
  const down = st.towers.find((t) => t.team === 1 - team && t.kind === 'princess' && t.side === side)?.dead;
  if (!down) return false;
  return team === 0 ? y >= RIVER_Y - 5 : y <= RIVER_Y + 5;
}

// Devuelve por qué no se puede poner la carta del lugar `slot` en (x, y), o null si se puede.
export function placeProblem(st, seat, slot, x, y) {
  const p = st.players[seat];
  if (!p || st.over) return 'La partida terminó.';
  const card = CARD_BY_ID[p.hand[slot]];
  if (!card) return 'Esa carta no está en tu mano.';
  if (p.elixir < card.cost) return 'Te falta elixir.';
  if (!(x >= 0.5 && x <= W - 0.5 && y >= 0.5 && y <= H - 0.5)) return 'Eso queda afuera de la arena.';
  if (card.kind === 'spell') return null;
  if (!zoneOk(st, p.team, x, y)) return 'Solo en tu mitad (o donde cayó una torre).';
  if (st.towers.some((t) => !t.dead && dist(t, { x, y }) < t.r + 0.4)) return 'Eso es una torre.';
  return null;
}

const OFFSETS = {
  1: [[0, 0]],
  2: [[-0.5, 0], [0.5, 0]],
  3: [[0, -0.5], [-0.55, 0.4], [0.55, 0.4]],
  6: [[-0.9, -0.35], [0, -0.55], [0.9, -0.35], [-0.9, 0.5], [0, 0.55], [0.9, 0.5]],
};

function spawn(st, seat, team, card, x, y) {
  const n = card.count || 1;
  for (const [ox, oy] of OFFSETS[n] || OFFSETS[1]) {
    st.units.push({
      id: st.nid++, card: card.id, team, owner: seat, x: Math.min(W - 0.3, Math.max(0.3, x + ox)), y: Math.min(H - 0.3, Math.max(0.3, y + oy)),
      hp: card.hp, max: card.hp, r: card.radius, cd: LOAD_TICKS, tg: 0, wait: DEPLOY_TICKS, stun: 0, charge: 0, bld: card.kind === 'building', born: st.tick,
    });
  }
}

function playCard(st, [, seat, slot, x10, y10]) {
  const x = x10 / 10;
  const y = y10 / 10;
  if (placeProblem(st, seat, slot, x, y)) return;
  const p = st.players[seat];
  const card = CARD_BY_ID[p.hand[slot]];
  p.elixir -= card.cost;
  p.played += 1;
  p.queue.push(p.hand[slot]);
  p.hand[slot] = p.queue.shift();
  st.ev.push({ k: 'put', x, y, t: st.tick, team: p.team, c: card.id });
  if (card.kind === 'spell') {
    st.fx.push({ k: 'spell', c: card.id, style: card.style, at: st.tick + card.delay, t0: st.tick, x, y, r: card.radius, dmg: card.dmg, stun: card.stun || 0, team: p.team, air: true, tm: TOWER_SPELL });
  } else {
    spawn(st, seat, p.team, card, x, y);
  }
}

// ─── Daño ────────────────────────────────────────────────────────────────────
function hurt(e, dmg, tick) {
  e.hp -= dmg;
  if (e.tw) {
    e.hurt = tick;
    if (e.kind === 'king') e.awake = true;
  }
}

// Un hechizo (o la bomba del globo) cae: daña a las tropas del área y, con `tm`, a las torres.
function resolveFx(st, f) {
  for (const e of st.units) {
    if (e.team === f.team || e.hp <= 0 || (!f.air && isFly(e))) continue;
    if (dist(e, f) <= f.r + e.r * 0.5) {
      hurt(e, f.dmg, st.tick);
      if (f.stun) { e.stun = Math.max(e.stun, f.stun); e.cd = Math.max(e.cd, LOAD_TICKS); e.charge = 0; }
    }
  }
  for (const e of st.towers) {
    if (e.team === f.team || e.dead) continue;
    if (dist(e, f) <= f.r + e.r * 0.6) hurt(e, f.dmg * f.tm, st.tick);
  }
  st.ev.push({ k: 'boom', style: f.style, x: f.x, y: f.y, r: f.r, t: st.tick, team: f.team });
}

// ─── Objetivos y caminos ─────────────────────────────────────────────────────
function canHit(d, e) {
  if (d.targets === 'buildings') return Boolean(e.tw || e.bld);
  if (d.targets === 'ground') return Boolean(e.tw || !isFly(e));
  return true;
}

function pickTarget(st, u, d) {
  let best = null;
  let bd = Infinity;
  const consider = (e, limit) => {
    if (!alive(e) || e.team === u.team || !canHit(d, e)) return;
    // Las que van solo a edificios miden la distancia al centro: una estructura (cañón, mortero) más cerca que una torre es la elegida.
    const gap = d.targets === 'buildings' ? dist(u, e) : dist(u, e) - e.r;
    if (gap > limit || (d.minRange && gap < d.minRange)) return;
    if (gap < bd) { bd = gap; best = e; }
  };
  const limit = u.bld ? d.range : d.targets === 'buildings' ? Infinity : (d.sight || SIGHT);
  for (const e of st.units) consider(e, limit);
  for (const e of st.towers) consider(e, limit);
  return best;
}

// A qué torre va una tropa que no tiene nada a la vista: a la de su carril y, si ya cayó, al rey.
function marchTarget(st, u) {
  const side = u.x < W / 2 ? 0 : 1;
  const enemy = st.towers.filter((t) => t.team !== u.team && !t.dead);
  return enemy.find((t) => t.kind === 'princess' && t.side === side) || enemy.find((t) => t.kind === 'king') || enemy[0] || { x: W / 2, y: u.team === 0 ? 0 : H };
}

const onBridge = (x) => BRIDGES.some((b) => Math.abs(x - b) <= BRIDGE_HALF - 0.1);

// El punto al que hay que caminar ahora para llegar a (gx, gy): el suelo cruza el río solo por los puentes.
function goalPoint(u, d, gx, gy) {
  if (d.fly || d.jump) return [gx, gy];
  const side = u.y < RIVER_Y ? -1 : 1;
  const gside = gy < RIVER_Y ? -1 : 1;
  const inBand = Math.abs(u.y - RIVER_Y) < BAND;
  if (side === gside && !inBand) return [gx, gy];
  const bx = Math.abs(u.x - BRIDGES[0]) <= Math.abs(u.x - BRIDGES[1]) ? BRIDGES[0] : BRIDGES[1];
  if (!inBand) {
    if (Math.abs(u.x - bx) > 0.6) return [bx, RIVER_Y + side * (BAND + 0.7)];
    return [bx, RIVER_Y];
  }
  return [bx, RIVER_Y + gside * (BAND + 0.9)];
}

function moveToward(u, gx, gy, step) {
  const dx = gx - u.x;
  const dy = gy - u.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return;
  const m = Math.min(step, len);
  u.x += (dx / len) * m;
  u.y += (dy / len) * m;
}

function fixRiver(u) {
  const d = D(u);
  if (d.fly || d.jump) return;
  const dy = u.y - RIVER_Y;
  if (Math.abs(dy) < BAND && !onBridge(u.x)) u.y = RIVER_Y + (dy < 0 ? -BAND : BAND);
}

// ─── Ataques ─────────────────────────────────────────────────────────────────
function attack(st, u, d, tg) {
  let dmg = d.dmg;
  if (d.charge && u.charge >= d.charge) dmg *= 2;
  u.charge = 0;
  if (d.splash) {
    const c = d.selfSplash ? u : tg;
    for (const e of st.units) {
      if (e.team === u.team || e.hp <= 0 || (d.targets !== 'both' && isFly(e))) continue;
      if (dist(e, c) <= d.splash + e.r * 0.5) hurt(e, dmg, st.tick);
    }
    for (const e of st.towers) {
      if (e.team !== u.team && !e.dead && dist(e, c) <= d.splash + e.r * 0.6) hurt(e, dmg, st.tick);
    }
  } else {
    hurt(tg, dmg, st.tick);
  }
  u.cd = d.hit;
  st.ev.push({ k: 'hit', c: u.card, u: u.id, x: u.x, y: u.y, x2: tg.x, y2: tg.y, t: st.tick, team: u.team });
}

function unitStep(st, u, byId) {
  const d = D(u);
  if (u.cd > 0) u.cd -= 1;
  if (u.wait > 0) { u.wait -= 1; return; }
  if (d.life) u.hp -= d.hp / d.life; // los edificios se van gastando
  if (u.hp <= 0) return;
  if (u.stun > 0) { u.stun -= 1; return; }

  let tg = u.tg ? byId.get(u.tg) : null;
  if (tg && !(alive(tg) && canHit(d, tg))) tg = null;
  if (tg && !u.bld && d.targets !== 'buildings' && dist(u, tg) - tg.r > (d.sight || SIGHT) + 1.5) tg = null;
  if (tg && u.bld && dist(u, tg) - tg.r > d.range) tg = null;
  if (d.targets === 'buildings') {
    // Mientras no esté pegando, siempre va a la estructura o torre más cercana (si apareció un cañón más cerca, cambia). Un margen evita que dude.
    const near = tg && dist(u, tg) - tg.r <= d.range;
    if (!near) {
      const best = pickTarget(st, u, d);
      if (best && (!tg || dist(u, best) < dist(u, tg) - 0.5)) tg = best;
    }
  }
  if (!tg) tg = pickTarget(st, u, d);
  u.tg = tg ? tg.id : 0;

  const gap = tg ? dist(u, tg) - tg.r : Infinity;
  if (tg && gap <= d.range && (!d.minRange || gap >= d.minRange)) {
    if (u.cd <= 0) attack(st, u, d, tg);
    return;
  }
  if (u.bld) return;

  const goal = tg || marchTarget(st, u);
  const [px, py] = goalPoint(u, d, goal.x, goal.y);
  let spd = d.speed / TPS;
  if (d.charge) {
    if (u.charge >= d.charge) spd *= 2;
    u.charge += 1;
  }
  moveToward(u, px, py, spd);
  fixRiver(u);
}

function towerStep(st, tw) {
  if (tw.dead || (tw.kind === 'king' && !tw.awake)) return;
  if (tw.cd > 0) tw.cd -= 1;
  let tg = tw.tg ? st.units.find((u) => u.id === tw.tg) : null;
  if (!tg || tg.hp <= 0 || dist(tw, tg) - tg.r > tw.range) {
    tg = null;
    let bd = Infinity;
    for (const u of st.units) {
      if (u.team === tw.team || u.hp <= 0) continue;
      const gap = dist(tw, u) - u.r;
      if (gap <= tw.range && gap < bd) { bd = gap; tg = u; }
    }
  }
  tw.tg = tg ? tg.id : 0;
  if (tg && tw.cd <= 0) {
    hurt(tg, tw.dmg, st.tick);
    tw.cd = tw.hit;
    st.ev.push({ k: 'hit', c: tw.kind, x: tw.x, y: tw.y, x2: tg.x, y2: tg.y, t: st.tick, team: tw.team });
  }
}

// Las tropas de tierra no se pisan ni atraviesan edificios y torres.
function separate(st) {
  const us = st.units;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.bld || a.hp <= 0) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.bld || b.hp <= 0 || isFly(a) !== isFly(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        if (dx * dx + dy * dy >= min * min) continue;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = len < 1e-4 ? (i % 2 ? 1 : -1) : dx / len;
        const ny = len < 1e-4 ? 0 : dy / len;
        const push = (min - len) * 0.25;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
  const solids = [...us.filter((u) => u.bld && u.hp > 0), ...st.towers.filter((t) => !t.dead)];
  for (const u of us) {
    if (u.bld || u.hp <= 0 || isFly(u)) continue;
    for (const s of solids) {
      const len = dist(u, s);
      const min = s.r + u.r * 0.6;
      if (len < min) {
        const nx = len < 1e-4 ? 0 : (u.x - s.x) / len;
        const ny = len < 1e-4 ? (u.team === 0 ? -1 : 1) : (u.y - s.y) / len;
        u.x += nx * (min - len);
        u.y += ny * (min - len);
      }
    }
  }
  for (const u of us) {
    u.x = Math.min(W - 0.3, Math.max(0.3, u.x));
    u.y = Math.min(H - 0.3, Math.max(0.3, u.y));
    fixRiver(u);
  }
}

// ─── Fin de la partida ───────────────────────────────────────────────────────
const towerHp = (st, team) => st.towers.filter((t) => t.team === team).reduce((n, t) => n + Math.max(0, t.hp), 0);

function evaluate(st) {
  const crowns = [0, 0];
  const kingDead = [false, false];
  for (const t of st.towers) {
    if (!t.dead) continue;
    crowns[1 - t.team] += t.kind === 'king' ? 3 : 1;
    if (t.kind === 'king') kingDead[t.team] = true;
  }
  st.crowns = crowns;
  const by = () => (crowns[0] > crowns[1] ? 0 : crowns[1] > crowns[0] ? 1 : -1);
  if (kingDead[0] || kingDead[1]) { st.over = { winner: kingDead[0] && kingDead[1] ? by() : kingDead[0] ? 1 : 0, reason: 'king', tick: st.tick }; return; }
  if (st.tick >= st.reg && crowns[0] !== crowns[1]) { st.over = { winner: by(), reason: st.tick === st.reg ? 'time' : 'overtime', tick: st.tick }; return; }
  if (st.tick >= st.reg + st.ot) {
    const a = towerHp(st, 0);
    const b = towerHp(st, 1);
    st.over = { winner: a > b ? 0 : b > a ? 1 : -1, reason: 'hp', tick: st.tick };
  }
}

// ─── Un paso ─────────────────────────────────────────────────────────────────
export function stepSim(st, cmds) {
  if (st.over) return st;
  st.tick += 1;
  const t = st.tick;
  if (cmds) for (const c of cmds) playCard(st, c);

  const rate = (t > st.reg - T(60) ? 2 : 1) / (2.8 * TPS); // en el último minuto el elixir va al doble
  for (const p of st.players) p.elixir = Math.min(MAX_ELIXIR, p.elixir + rate);

  const due = st.fx.filter((f) => f.at <= t);
  if (due.length) {
    for (const f of due) resolveFx(st, f);
    st.fx = st.fx.filter((f) => f.at > t);
  }

  const byId = new Map();
  for (const e of st.towers) byId.set(e.id, e);
  for (const e of st.units) byId.set(e.id, e);
  for (const u of [...st.units]) if (u.hp > 0) unitStep(st, u, byId);
  for (const tw of st.towers) towerStep(st, tw);
  separate(st);

  // Los que murieron.
  for (const u of st.units) {
    if (u.hp > 0) continue;
    const d = D(u);
    if (d.death) st.fx.push({ k: 'bomb', style: 'bomb', at: t + d.death.delay, t0: t, x: u.x, y: u.y, r: d.death.radius, dmg: d.death.dmg, stun: 0, team: u.team, air: false, tm: 1 });
    st.ev.push({ k: 'die', c: u.card, x: u.x, y: u.y, t, team: u.team });
  }
  st.units = st.units.filter((u) => u.hp > 0);
  for (const tw of st.towers) {
    if (tw.dead || tw.hp > 0) continue;
    tw.dead = true;
    st.ev.push({ k: 'tdie', c: tw.kind, x: tw.x, y: tw.y, t, team: tw.team });
    if (tw.kind === 'princess') for (const k of st.towers) if (k.team === tw.team && k.kind === 'king') k.awake = true;
  }
  st.ev = st.ev.filter((e) => t - e.t < EV_KEEP);
  evaluate(st);
  return st;
}

// Segundos que faltan (o -1 si ya está en tiempo extra).
export const secondsLeft = (st) => Math.max(0, Math.ceil((st.reg - st.tick) / TPS));
export const inOvertime = (st) => st.tick >= st.reg;
export const isDouble = (st) => st.tick > st.reg - T(60);

// ─── Rollback ────────────────────────────────────────────────────────────────
// Guarda la partida y las jugadas que va recibiendo. Si llega una con un tick que ya pasó, vuelve a un punto
// guardado anterior y repite la simulación: así las pantallas siempre terminan en el mismo estado.
const SNAP_EVERY = 20;
const SNAP_KEEP = 40;

export function createRunner(init) {
  const base = newMatch(init);
  let st = structuredClone(base);
  let snaps = [{ tick: 0, st: structuredClone(base) }];
  const buckets = new Map();
  let seen = 0;

  function advanceTo(target) {
    while (st.tick < target && !st.over) {
      const next = st.tick + 1;
      stepSim(st, buckets.get(next));
      if (next % SNAP_EVERY === 0) {
        snaps.push({ tick: next, st: structuredClone(st) });
        if (snaps.length > SNAP_KEEP) snaps = [snaps[0], ...snaps.slice(-(SNAP_KEEP - 1))];
      }
    }
  }

  return {
    get state() { return st; },
    // `list`: todas las jugadas de la sala, en el orden en que se anotaron.
    addCmds(list) {
      let earliest = Infinity;
      for (; seen < list.length; seen++) {
        const c = list[seen];
        if (!buckets.has(c[0])) buckets.set(c[0], []);
        buckets.get(c[0]).push(c);
        if (c[0] <= st.tick) earliest = Math.min(earliest, c[0]);
      }
      if (earliest === Infinity) return false;
      const was = st.tick;
      let from = snaps[0];
      for (const s of snaps) if (s.tick < earliest) from = s;
      snaps = snaps.filter((s) => s.tick <= from.tick);
      st = structuredClone(from.st);
      advanceTo(was);
      return true;
    },
    advanceTo,
  };
}
