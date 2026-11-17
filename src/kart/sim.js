// Fondo Kart: la física de los karts, los ítems y los bots. Puro (sin Three.js, red ni reloj propio): la pantalla que es
// dueña de cada kart lo mueve con `stepKart` a paso fijo (STEP) y los tests lo prueban con valores fijos.
//
// Mecánicas del género (los números son nuestros, medidos a ojo para que se sienta como un kart de consola):
//   - Acelerar, frenar/marcha atrás y doblar: se dobla más fuerte a poca velocidad y un poco menos a fondo.
//   - Derrape: con un giro, apretar derrapar hace saltar el kart; si al caer seguís doblando y con derrape apretado, derrapa
//     para ese lado. Mientras derrapa carga el mini turbo (más rápido si cerrás el giro): azul, naranja y violeta. Al soltar,
//     un turbo que dura más cuanto más cargó.
//   - Turbo de largada: acelerar justo cuando aparece el «2» de la cuenta. Antes de tiempo, el motor se ahoga.
//   - Rebufo: ir pegado atrás de otro kart un rato da un turbo corto.
//   - Banquina lenta (salvo con estrella o turbo), paredes que frenan y, en el castillo y el espacio, caerse y volver.
//   - Aceleradores en el piso.
import { LAPS, nearest, yawOf } from './tracks.js';

export const STEP = 1 / 60;
export const CC_VALUES = [50, 100, 150];
export const CC = { 50: { max: 19, acc: 0.95 }, 100: { max: 24, acc: 0.85 }, 150: { max: 29, acc: 0.78 } };
const OFF_SLOW = { pasto: 0.5, arena: 0.45, nieve: 0.5, vereda: 0.6 };
export const MT_TIMES = [0, 0.7, 1.3, 2.0];      // turbo al soltar el derrape, según el nivel cargado
export const MT_CHARGE = [0, 1.0, 2.0, 3.2];     // segundos de carga para cada nivel (azul, naranja, violeta)
export const GRAVITY = 22;
export const HOP_V = 4.6;
export const KART_R = 1.15;                      // radio para choques entre karts y con ítems
export const START_WINDOW = [-1.5, -0.6];        // segundos antes de la largada en que acelerar da turbo
const SPIN_TIME = { banana: 1.0, verde: 1.4, rojo: 1.4, azul: 2.0, bomba: 1.8, bocina: 1.2, estrella: 1.2, caida: 0 };

export function newKart(id, slot, track) {
  const g = track.grid[slot % track.grid.length];
  return {
    id, x: g.x, z: g.z, y: 0, vy: 0, yaw: g.yaw, speed: 0, slide: 0, kx: 0, kz: 0, steer: 0,
    drift: 0, charge: 0, hop: false, prevD: false,
    boost: 0, boostPow: 1.3, star: 0, gold: 0, shrink: 0, spin: 0, spinKind: '', inv: 0, fall: 0, slip: 0, slipCd: 0,
    idx: g.i, safe: g.i, ps: null, half: true, lap: 0, prog: 0, off: false, finished: false, finishT: 0,
    item: '', itemN: 0, rolling: 0, pending: '', pressAt: null, started: false, line: 0, botMul: 1,
  };
}

export const mtLevel = (charge) => (charge >= MT_CHARGE[3] ? 3 : charge >= MT_CHARGE[2] ? 2 : charge >= MT_CHARGE[1] ? 1 : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const fwd = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

function respawn(k, track) {
  const n = track.count;
  const i = (k.safe - 4 + n) % n;
  const sm = track.samples[i];
  k.x = sm.x; k.z = sm.z; k.y = 0; k.vy = 0; k.yaw = yawOf(sm.tx, sm.tz);
  k.speed = 0; k.drift = 0; k.charge = 0; k.slide = 0; k.kx = 0; k.kz = 0; k.idx = i; k.inv = 1.5;
}

// Un golpe (cáscara, caparazón, bomba…). Con estrella o recién golpeado no pasa nada. Devuelve si pegó.
export function hitKart(k, kind) {
  if (k.star > 0 || k.inv > 0 || k.fall > 0) return false;
  k.spin = SPIN_TIME[kind] ?? 1.2; k.spinKind = kind; k.inv = k.spin + 0.6;
  k.drift = 0; k.charge = 0; k.boost = 0; k.gold = 0;
  if (kind !== 'banana') k.vy = Math.max(k.vy, 5);
  return true;
}

// `inp`: { s (−1 a 1, + a la derecha), a, b, d } · `env`: { cc, t (segundos desde la largada; negativo en la cuenta) }.
export function stepKart(k, inp, dt, track, env) {
  const C = CC[env.cc] || CC[150];
  for (const key of ['boost', 'star', 'shrink', 'spin', 'inv', 'gold', 'slipCd', 'rolling']) if (k[key] > 0) k[key] = Math.max(0, k[key] - dt);
  if (k.rolling === 0 && k.pending) { k.item = k.pending; k.itemN = ITEMS[k.pending]?.n || 1; k.pending = ''; }
  if (k.fall > 0) { k.fall -= dt; if (k.fall <= 0) { k.fall = 0; respawn(k, track); } return; }
  // La cuenta regresiva: quieto, pero se anota cuándo empezó a acelerar.
  if (env.t < 0) {
    if (inp.a && k.pressAt == null) k.pressAt = env.t;
    if (!inp.a) k.pressAt = null;
    k.prevD = Boolean(inp.d);
    return;
  }
  if (!k.started) {
    k.started = true;
    if (k.pressAt != null && k.pressAt >= START_WINDOW[0] && k.pressAt <= START_WINDOW[1]) { k.boost = 1.4; k.boostPow = 1.35; k.startBoost = true; }
    else if (k.pressAt != null && k.pressAt < START_WINDOW[0]) { k.spin = 0.9; k.spinKind = 'ahogo'; }
  }
  const spinning = k.spin > 0;
  const c = spinning ? { s: 0, a: false, b: false, d: false } : inp;
  const s = clamp(Number(c.s) || 0, -1, 1);
  k.steer += (s - k.steer) * Math.min(1, dt * 12);

  // ─── Velocidad ─────────────────────────────────────────────────────────────
  let max = C.max * (k.botMul || 1) * (k.shrink > 0 ? 0.7 : 1);
  if (k.off && k.star <= 0 && k.boost <= 0) max *= OFF_SLOW[track.off] || 0.5;
  if (k.star > 0) max *= 1.18;
  if (k.boost > 0) max *= k.boostPow || 1.3;
  if (spinning) k.speed *= Math.exp(-2.6 * dt);
  else if (k.boost > 0) k.speed += (max - k.speed) * Math.min(1, 5 * dt);
  else if (c.b) k.speed = k.speed > 0 ? Math.max(-1, k.speed - 32 * dt) : Math.max(-7, k.speed - 9 * dt);
  else if (c.a) k.speed += (max - k.speed) * Math.min(1, (k.speed > max ? 2.2 : C.acc) * dt);
  else k.speed *= Math.exp(-(k.speed > max ? 2 : 0.7) * dt);

  // ─── Salto y derrape ───────────────────────────────────────────────────────
  const dEdge = c.d && !k.prevD;
  k.prevD = Boolean(c.d);
  if (dEdge && k.y <= 0 && k.vy <= 0 && k.speed > 6) { k.vy = HOP_V; k.hop = true; }
  if (k.y > 0 || k.vy > 0) {
    k.vy -= GRAVITY * dt; k.y += k.vy * dt;
    if (k.y <= 0) {
      k.y = 0; k.vy = 0;
      if (k.hop) { k.hop = false; if (c.d && Math.abs(s) > 0.2 && k.speed > 10) { k.drift = Math.sign(s); k.charge = 0; } }
    }
  }
  if (k.drift) {
    if (!c.d || k.speed < 8 || spinning || c.b || k.off && k.star <= 0 && k.boost <= 0 && OFF_SLOW[track.off] < 0.55) {
      const lv = mtLevel(k.charge);
      if (!c.d && !spinning && lv) { k.boost = Math.max(k.boost, MT_TIMES[lv]); k.boostPow = 1.3; k.lastMt = lv; }
      k.drift = 0; k.charge = 0;
    } else k.charge += dt * (0.7 + 0.8 * Math.max(0, s * k.drift));
  }

  // ─── Giro ──────────────────────────────────────────────────────────────────
  const spf = clamp(Math.abs(k.speed) / 6, 0, 1);
  let turn = k.drift ? k.drift * (1.05 + 0.6 * s * k.drift) * spf : k.steer * 2.1 * spf * (1 - 0.3 * clamp(k.speed / C.max, 0, 1));
  if (k.speed < 0) turn = -turn;
  if (k.y > 0 && !k.drift) turn *= 0.6;
  k.yaw = wrap(k.yaw - turn * dt);
  if (spinning) k.yaw = wrap(k.yaw + dt * 9);
  k.slide += ((k.drift ? k.drift * 0.32 : 0) - k.slide) * Math.min(1, 8 * dt);
  const m = k.yaw + k.slide;
  const [fx, fz] = fwd(m);
  k.x += (fx * k.speed + k.kx) * dt;
  k.z += (fz * k.speed + k.kz) * dt;
  const kd = Math.exp(-6 * dt); k.kx *= kd; k.kz *= kd;

  // ─── La pista ──────────────────────────────────────────────────────────────
  const nr = nearest(track, k.x, k.z, k.idx);
  k.idx = nr.i;
  const sm = track.samples[nr.i];
  const away = Math.abs(nr.lat) - track.half;
  k.off = away > 0;
  if (!k.off) k.safe = nr.i;
  if (track.edge === 'wall') {
    if (away > track.wallAt) {
      const sg = Math.sign(nr.lat), lim = track.half + track.wallAt;
      k.x -= sm.nx * sg * (Math.abs(nr.lat) - lim); k.z -= sm.nz * sg * (Math.abs(nr.lat) - lim);
      // Contra la pared no se frena en seco: se pierde lo que iba de frente a la pared y el kart se acomoda a lo largo
      // de ella (si no, apretando contra la pared quedaba trabado).
      const outward = (fx * sm.nx + fz * sm.nz) * sg;
      if (outward > 0) {
        const along = Math.abs(fx * sm.tx + fz * sm.tz);
        const dir = Math.sign(fx * sm.tx + fz * sm.tz) || 1;
        const want = yawOf(sm.tx * dir, sm.tz * dir);
        k.yaw = wrap(k.yaw + wrap(want - k.yaw) * 0.2);
        k.speed *= 0.9 + 0.1 * along;
        if (env.t - (k.bumpAt ?? -9) > 0.4) { k.kx -= sm.nx * sg * 3; k.kz -= sm.nz * sg * 3; k.bumpAt = env.t; }
      }
    }
  } else if (away > track.fallAt && k.y < 0.5) {
    k.fall = 1.3; k.speed = 0; k.drift = 0; k.charge = 0;
  }

  // ─── Aceleradores del piso ────────────────────────────────────────────────
  if (k.y < 1) for (const p of track.pads) if ((p.x - k.x) ** 2 + (p.z - k.z) ** 2 < p.r * p.r) { k.boost = Math.max(k.boost, 1.0); k.boostPow = 1.35; }

  // ─── Vueltas ───────────────────────────────────────────────────────────────
  const L = track.length, sNow = nr.s;
  if (k.ps != null) {
    if (k.ps > L * 0.75 && sNow < L * 0.25) { if (k.half) { k.lap += 1; k.half = false; } }
    else if (k.ps < L * 0.25 && sNow > L * 0.75 && k.lap > 0) { k.lap -= 1; k.half = true; }
    if (sNow > L * 0.4 && sNow < L * 0.6) k.half = true;
  }
  k.ps = sNow;
  k.prog = k.lap * L + sNow;
  if (!k.finished && k.lap > LAPS) { k.finished = true; k.finishT = env.t; }
}

// Rebufo: si va pegado atrás de otro (hasta 14 m, casi en línea) un rato, turbo corto.
export function slipstream(k, others, dt) {
  if (k.slipCd > 0 || k.speed < 12 || k.drift) { k.slip = 0; return false; }
  const [fx, fz] = fwd(k.yaw);
  const behind = others.some((o) => {
    if (o.id === k.id) return false;
    const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz);
    return d > 2 && d < 14 && (dx * fx + dz * fz) / d > 0.96;
  });
  k.slip = behind ? k.slip + dt : Math.max(0, k.slip - dt * 2);
  if (k.slip > 1.3) { k.slip = 0; k.slipCd = 3; k.boost = Math.max(k.boost, 0.9); k.boostPow = 1.25; return true; }
  return false;
}

// Choque entre karts: solo se corre el propio (el otro lo corre su pantalla). Con estrella, el otro sale girando.
export function bump(k, o) {
  const dx = k.x - o.x, dz = k.z - o.z, d = Math.hypot(dx, dz);
  const min = KART_R * 2 * (k.shrink > 0 ? 0.6 : 1);
  if (d <= 0.01 || d >= min) return false;
  const push = (min - d) / d;
  k.x += dx * push * 0.6; k.z += dz * push * 0.6;
  k.kx += dx / d * 3; k.kz += dz / d * 3;
  return true;
}

// ─── Los ítems ───────────────────────────────────────────────────────────────
// `n`: cuántas veces se usa. Los nombres y los dibujos son nuestros; qué hace cada uno sigue el género.
export const ITEMS = {
  banana: { name: 'Cáscara', icon: '🍌', n: 1 },
  banana3: { name: 'Tres cáscaras', icon: '🍌', n: 3 },
  verde: { name: 'Caparazón rebotador', icon: '🟢', n: 1 },
  verde3: { name: 'Tres rebotadores', icon: '🟢', n: 3 },
  rojo: { name: 'Caparazón buscador', icon: '🔴', n: 1 },
  rojo3: { name: 'Tres buscadores', icon: '🔴', n: 3 },
  hongo: { name: 'Hongo turbo', icon: '🍄', n: 1 },
  hongo3: { name: 'Tres hongos', icon: '🍄', n: 3 },
  dorado: { name: 'Hongo dorado', icon: '🌟', n: 1 },
  estrella: { name: 'Estrella', icon: '⭐', n: 1 },
  rayo: { name: 'Rayo', icon: '⚡', n: 1 },
  bomba: { name: 'Bomba', icon: '💣', n: 1 },
  azul: { name: 'Caparazón alado', icon: '🔵', n: 1 },
  bocina: { name: 'Bocinazo', icon: '📯', n: 1 },
};
export const ITEM_IDS = Object.keys(ITEMS);
// Qué sale según el puesto (como en el género: adelante cosas para defenderse, atrás para alcanzar).
const TABLES = {
  front: { banana: 30, verde: 24, banana3: 10, bocina: 8, hongo: 10, verde3: 6, bomba: 6, rojo: 6 },
  mid: { banana: 8, verde: 10, rojo: 20, hongo: 15, bomba: 9, verde3: 8, rojo3: 8, hongo3: 10, bocina: 6, azul: 3, banana3: 3 },
  back: { hongo3: 20, rojo3: 14, estrella: 16, dorado: 14, rayo: 8, azul: 8, bomba: 6, hongo: 10, rojo: 4 },
};
export function rollItem(rank, total, rand) {
  const f = total <= 1 ? 0.5 : rank / (total - 1);
  const table = rank === 0 && total > 1 ? TABLES.front : f < 0.6 ? TABLES.mid : TABLES.back;
  const entries = Object.entries(table);
  const sum = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand() * sum;
  for (const [id, w] of entries) { r -= w; if (r <= 0) return id; }
  return entries[0][0];
}
export const ROLL_TIME = 1.2;
export const BOX_RESPAWN = 2.5;
export const BOX_R = 2.0;
export const STAR_TIME = 7.5;
export const GOLD_TIME = 7;
export const SHRINK_TIME = 4.5;
export const BOMB_FUSE = 2.6;
export const BOMB_R = 7.5;
export const HORN_R = 9;
export const BLUE_R = 7;

// Puestos: los que llegaron por su tiempo (`finish`: ms de la sala, o el `finishT` propio) y los demás por cuánto avanzaron.
export function rankingOf(karts, finish = {}) {
  const done = (k) => (finish[k.id] != null ? finish[k.id] / 1000 : k.finished ? k.finishT ?? Infinity : null);
  return [...karts].sort((a, b) => {
    const fa = done(a), fb = done(b);
    if (fa != null && fb != null) return fa - fb;
    if (fa != null) return -1;
    if (fb != null) return 1;
    return b.prog - a.prog;
  }).map((k) => k.id);
}

// ─── Proyectiles ─────────────────────────────────────────────────────────────
// Un proyectil: { key, w, o (dueño), x, z, y, yaw, v, born (s de carrera), tgt, idx, landed, gone }.
// Los simula cada pantalla desde que lo conoce; lo que golpea lo decide la pantalla del golpeado.
export const SHOT_SPEED = { verde: 50, rojo: 46, azul: 60 };
export const SHOT_LIFE = { verde: 7, rojo: 10, azul: 20, banana: 120, bomba: BOMB_FUSE + 0.6 };

export function spawnShot(w, owner, k, key, born, tgt = '') {
  const [fx, fz] = fwd(k.yaw);
  const ahead = w === 'banana' ? -2.6 : 2.4;
  const p = { key, w, o: owner, x: k.x + fx * ahead, z: k.z + fz * ahead, y: w === 'azul' ? 6 : 0.4, yaw: k.yaw, v: SHOT_SPEED[w] || 0, born, tgt, idx: k.idx, vy: 0, landed: w === 'banana' };
  if (w === 'bomba') { p.v = 22 + Math.max(0, k.speed) * 0.5; p.vy = 7; p.y = 1.2; }
  return p;
}

// Avanza un proyectil `dt` segundos. `find(id)` da dónde anda un kart (o null). Devuelve false si se terminó.
export function stepShot(p, dt, track, find, t) {
  if (p.gone) return false;
  if (t - p.born > (SHOT_LIFE[p.w] || 8)) return false;
  if (p.w === 'banana') return true;
  if (p.w === 'bomba') {
    if (!p.landed) {
      const [fx, fz] = fwd(p.yaw);
      p.x += fx * p.v * dt; p.z += fz * p.v * dt;
      p.vy -= GRAVITY * dt; p.y += p.vy * dt;
      if (p.y <= 0.4) { p.y = 0.4; p.landed = true; }
    }
    return true;
  }
  if (p.w === 'azul') {
    const tg = find(p.tgt);
    if (tg) {
      const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
      const want = yawOf(dx / (d || 1), dz / (d || 1));
      p.yaw = wrap(p.yaw + clamp(wrap(want - p.yaw), -4 * dt, 4 * dt));
      p.y += ((d < 18 ? 0.6 : 6) - p.y) * Math.min(1, dt * 2);
    }
    const [fx, fz] = fwd(p.yaw);
    p.x += fx * p.v * dt; p.z += fz * p.v * dt;
    return true;
  }
  // Caparazones por el piso.
  let want = null;
  if (p.w === 'rojo') {
    const tg = find(p.tgt);
    if (tg && Math.hypot(tg.x - p.x, tg.z - p.z) < 40) want = Math.atan2(-(tg.x - p.x), -(tg.z - p.z));
    else { const sm = track.samples[(p.idx + 10) % track.count]; want = Math.atan2(-(sm.x - p.x), -(sm.z - p.z)); }
    p.yaw = wrap(p.yaw + clamp(wrap(want - p.yaw), -3.2 * dt, 3.2 * dt));
  }
  const [fx, fz] = fwd(p.yaw);
  p.x += fx * p.v * dt; p.z += fz * p.v * dt;
  const nr = nearest(track, p.x, p.z, p.idx);
  p.idx = nr.i;
  const away = Math.abs(nr.lat) - track.half;
  if (track.edge === 'wall') {
    if (away > track.wallAt - 0.4) {
      if (p.w === 'rojo') return false;
      const sm = track.samples[nr.i], sg = Math.sign(nr.lat);
      // Rebota: se refleja la dirección contra la pared.
      const dn = fx * sm.nx + fz * sm.nz;
      if (dn * sg > 0) { const rx = fx - 2 * dn * sm.nx, rz = fz - 2 * dn * sm.nz; p.yaw = Math.atan2(-rx, -rz); }
      const lim = track.half + track.wallAt - 0.5;
      p.x -= sm.nx * sg * (Math.abs(nr.lat) - lim); p.z -= sm.nz * sg * (Math.abs(nr.lat) - lim);
    }
  } else if (away > track.fallAt + 1) return false;
  return true;
}

// ─── Bots ────────────────────────────────────────────────────────────────────
// Miran un punto adelante en la pista (corrido a su carril), doblan hacia él, derrapan en las curvas cerradas y frenan
// un poco si se pasaron de ángulo. Puro: el carril y el azar los pone la pantalla.
export function botInput(k, track) {
  const n = track.count;
  const look = Math.round((9 + Math.max(0, k.speed) * 0.45) / 1.5);
  const sm = track.samples[(k.idx + look) % n];
  const tx = sm.x + sm.nx * k.line, tz = sm.z + sm.nz * k.line;
  const want = yawOf(tx - k.x, tz - k.z);
  const diff = wrap(want - k.yaw);
  let curv = 0;
  for (let o = 4; o < 26; o += 2) curv += track.samples[(k.idx + o) % n].k;
  curv /= 11;
  const s = clamp(-diff * 2.6, -1, 1);
  const sharp = Math.abs(curv) > 0.022 && k.speed > 14;
  const turnSide = curv > 0 ? -1 : 1; // + curvatura dobla a la izquierda → giro negativo
  if (k.drift) return { s: clamp(s + k.drift * 0.25, -1, 1), a: true, b: false, d: Math.abs(curv) > 0.012 };
  return { s, a: true, b: Math.abs(diff) > 1.0 && k.speed > 12, d: sharp && Math.sign(s || turnSide) === turnSide };
}
