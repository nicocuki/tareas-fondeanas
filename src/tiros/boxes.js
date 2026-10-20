// Cajas sueltas de A los Tiros: cuadrados con física propia (caen, giran, se apilan) que empujan las
// balas y los jugadores, como en el original. Sin React ni red, a paso fijo (`STEP`).
//
// Cada caja la simula una sola pantalla: la del último que la tocó (su jugador o una bala suya), igual
// que la pelota del fútbol. Tocarla la reclama: sube `s` y el dueño `o` pasa a ser ese jugador; gana el
// `s` mayor y, si empatan, el id mayor (`claimBeats`). El dueño manda la caja en su foto; las demás
// pantallas la mueven con la última velocidad conocida hasta la foto siguiente.
import { GRAVITY, PLAYER_R } from './sim.js';
import { WORLD_H } from './maps.js';
import { hitSolid, polyContacts, polygon } from './shapes.js';

const MASS = 1;
const FRICTION = 0.55;
const BOUNCE = 0.1;
const ITERATIONS = 6;
const SLOP = 0.01;          // lo que se deja meter sin corregir, para que no tiemblen apoyadas
const CORRECT = 0.6;        // fracción de lo metido que se corrige en cada paso
const SLEEP_SPEED = 0.2;
const SLEEP_AFTER = 0.6;    // segundos quieta antes de dormirse
const PLAYER_PUSH = 0.6;    // fracción de la velocidad del jugador que pasa a la caja que empuja

export function newBoxes(defs) {
  return defs.map(([x, y, size], i) => {
    const h = size / 2;
    const m = MASS;
    return { i, x: x + h, y: y + h, a: 0, vx: 0, vy: 0, w: 0, h, m, I: (m * (size * size * 2)) / 12, sleep: true, still: 0, gone: false, o: '', s: 0, heardAt: 0 };
  });
}

// El cuadrado de la caja en su lugar, como sólido (`boxIndex` dice de qué caja es).
export function boxSolid(b) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  const pts = [[-b.h, -b.h], [b.h, -b.h], [b.h, b.h], [-b.h, b.h]].map(([px, py]) => [b.x + px * c - py * s, b.y + px * s + py * c]);
  const poly = polygon(pts);
  poly.boxIndex = b.i;
  return poly;
}

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

// Empujón en un punto (una bala, una explosión): cambia la velocidad y el giro, y la despierta.
export function pushBox(b, px, py, ix, iy) {
  b.vx += ix / b.m;
  b.vy += iy / b.m;
  b.w += cross(px - b.x, py - b.y, ix, iy) / b.I;
  b.sleep = false;
  b.still = 0;
}

export function claimBox(b, me) {
  if (b.o === me) return false;
  b.o = me;
  b.s += 1;
  return true;
}

export const claimBeats = (s, id, b) => s > b.s || (s === b.s && id > b.o);

// Un paso de las cajas que simula esta pantalla. `players`: [{ x, y, vx, vy, r }] (los empujan, pero no
// los mueve: a cada jugador lo corrige su propia pantalla). `mine(caja)` dice cuáles simula esta.
// Devuelve los índices de las cajas que tocó algún jugador (para reclamarlas).
export function stepBoxes(boxes, dt, solids, players, mine) {
  const live = boxes.filter((b) => !b.gone && mine(b));
  const touched = new Set();
  // Los jugadores despiertan a las que tocan.
  const polys = new Map(live.map((b) => [b, boxSolid(b)]));
  for (const b of live) {
    for (const p of players) {
      if (hitSolid(p.x, p.y, (p.r || PLAYER_R) + 0.05, polys.get(b))) { touched.add(b.i); if (b.sleep && Math.hypot(p.vx, p.vy) > 0.5) { b.sleep = false; b.still = 0; } }
    }
  }
  const awake = live.filter((b) => !b.sleep);
  if (!awake.length) return touched;

  for (const b of awake) {
    b.vy += GRAVITY * dt;
    b.vx *= 1 - 0.15 * dt;
    b.w *= 1 - 0.6 * dt;
  }

  // Contactos: contra el mapa, contra otras cajas y contra los jugadores.
  const contacts = [];
  for (const b of awake) {
    const poly = polys.get(b);
    for (const s of solids) for (const c of polyContacts(poly, s)) contacts.push({ a: b, other: null, ...c });
    for (const o of live) {
      if (o === b || (!o.sleep && o.i < b.i)) continue; // cada par despierto, una sola vez
      for (const c of polyContacts(poly, polys.get(o))) contacts.push({ a: b, other: o.sleep ? null : o, ...c });
    }
    for (const p of players) {
      const r = p.r || PLAYER_R;
      const hit = hitSolid(p.x, p.y, r, poly);
      if (!hit) continue;
      contacts.push({ a: b, other: null, kin: { vx: p.vx * PLAYER_PUSH, vy: p.vy * PLAYER_PUSH }, nx: -hit.nx, ny: -hit.ny, depth: hit.depth * 0.5, x: p.x - hit.nx * r, y: p.y - hit.ny * r });
    }
  }

  // Impulsos acumulados (como Box2D): que no se metan, con un poco de rebote y fricción. Acumular
  // reparte bien entre los contactos; resolviéndolos sueltos, una caja apoyada se ponía a girar.
  const relVel = (c) => {
    const A = c.a, B = c.other;
    let rvx = A.vx - A.w * c.ray, rvy = A.vy + A.w * c.rax;
    if (B) { rvx -= B.vx - B.w * c.rby; rvy -= B.vy + B.w * c.rbx; }
    if (c.kin) { rvx -= c.kin.vx; rvy -= c.kin.vy; }
    return [rvx, rvy];
  };
  const apply = (c, ix, iy) => {
    const A = c.a, B = c.other;
    A.vx += ix / A.m; A.vy += iy / A.m; A.w += cross(c.rax, c.ray, ix, iy) / A.I;
    if (B) { B.vx -= ix / B.m; B.vy -= iy / B.m; B.w -= cross(c.rbx, c.rby, ix, iy) / B.I; }
  };
  for (const c of contacts) {
    const A = c.a, B = c.other;
    c.rax = c.x - A.x; c.ray = c.y - A.y;
    c.rbx = B ? c.x - B.x : 0; c.rby = B ? c.y - B.y : 0;
    c.tx = -c.ny; c.ty = c.nx;
    const mass = (rx, ry, rbx2, rby2, ax, ay) => {
      const ra = cross(rx, ry, ax, ay), rb = cross(rbx2, rby2, ax, ay);
      return 1 / (1 / A.m + (ra * ra) / A.I + (B ? 1 / B.m + (rb * rb) / B.I : 0));
    };
    c.mN = mass(c.rax, c.ray, c.rbx, c.rby, c.nx, c.ny);
    c.mT = mass(c.rax, c.ray, c.rbx, c.rby, c.tx, c.ty);
    const [rvx, rvy] = relVel(c);
    const vn = rvx * c.nx + rvy * c.ny;
    c.bias = vn < -1 ? -BOUNCE * vn : 0;
    c.jn = 0; c.jt = 0;
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (const c of contacts) {
      let [rvx, rvy] = relVel(c);
      const vn = rvx * c.nx + rvy * c.ny;
      const jn = Math.max(0, c.jn + (c.bias - vn) * c.mN);
      const dn = jn - c.jn;
      c.jn = jn;
      apply(c, c.nx * dn, c.ny * dn);
      [rvx, rvy] = relVel(c);
      const vt = rvx * c.tx + rvy * c.ty;
      const maxF = FRICTION * c.jn;
      const jt = Math.max(-maxF, Math.min(maxF, c.jt - vt * c.mT));
      const dt2 = jt - c.jt;
      c.jt = jt;
      apply(c, c.tx * dt2, c.ty * dt2);
    }
  }

  for (const b of awake) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.w * dt;
  }
  // Lo que quedó metido se corrige de a poco (entre dos cajas, mitad cada una).
  for (const c of contacts) {
    const fix = (Math.max(0, c.depth - SLOP) * CORRECT) / (c.other ? 2 : 1);
    c.a.x += c.nx * fix; c.a.y += c.ny * fix;
    if (c.other) { c.other.x -= c.nx * fix; c.other.y -= c.ny * fix; }
  }

  for (const b of awake) {
    if (b.y > WORLD_H + 6) { b.gone = true; continue; }
    const slow = Math.hypot(b.vx, b.vy) < SLEEP_SPEED && Math.abs(b.w) < SLEEP_SPEED;
    b.still = slow ? b.still + dt : 0;
    if (b.still > SLEEP_AFTER) { b.sleep = true; b.vx = 0; b.vy = 0; b.w = 0; }
  }
  return touched;
}

// Las cajas de otro: siguen con su última velocidad hasta la foto siguiente (si el dueño dejó de
// mandar fotos hace rato, se quedan quietas).
export function driftBoxes(boxes, dt, mine, now) {
  for (const b of boxes) {
    if (b.gone || b.sleep || mine(b)) continue;
    if (now - b.heardAt > 1) { b.sleep = true; b.vx = 0; b.vy = 0; b.w = 0; continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
  }
}

const r2 = (v) => Math.round(v * 100) / 100;
// En la foto: [índice, x, y, ángulo, vx, vy, giro, reclamo, dormida, caída].
export const encodeBox = (b) => [b.i, r2(b.x), r2(b.y), r2(b.a), r2(b.vx), r2(b.vy), r2(b.w), b.s, b.sleep ? 1 : 0, b.gone ? 1 : 0];

export function applyBox(boxes, entry, sender, now) {
  const [i, x, y, a, vx, vy, w, s, sleep, gone] = entry;
  const b = boxes[i];
  if (!b || !(claimBeats(s, sender, b) || (s === b.s && sender === b.o))) return;
  Object.assign(b, { x, y, a, vx, vy, w, s, o: sender, sleep: Boolean(sleep), gone: Boolean(gone), still: 0, heardAt: now });
}
