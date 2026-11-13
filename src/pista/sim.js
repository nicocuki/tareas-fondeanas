// Pista Loca: la física del robot, pura (sin dibujo ni red). Cada pantalla mueve solo al suyo, a paso fijo (STEP).
// Las plataformas son bloques fijos; las baldosas se rompen (`broken`); barras, martillos y empujadores salen de la hora.
import { PUSHER_DEPTH, barAngle, hammerHead, pusherBox } from './courses.js';

export const STEP = 1 / 60;
export const RADIUS = 0.45;
export const HEIGHT = 1.6;
export const RUN = 7.2;
export const GRAVITY = 26;
export const JUMP_V = 9.2;
export const DIVE_PUSH = 5.5;   // empujón para adelante al tirarse de cabeza
export const STUN_S = 0.7;      // después de un golpe, casi no se controla
export const TILE_FALL_S = 0.9;  // una baldosa pisada se cae a este tiempo
const BAR_R = 0.3;
const HAMMER_R = 1.05;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function newRobot(x, y, z, yaw = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, grounded: true, diving: false, getUp: 0, stun: 0, run: 0, onTile: -1, cp: 0, hitAt: -9 };
}

// Lo más alto que hay debajo del robot (dentro del bloque o un poquito arriba).
function groundUnder(course, r, broken) {
  let best = -Infinity;
  for (const p of course.platforms) {
    if (p.tile != null && broken.has(p.tile)) continue;
    if (r.x < p.x0 - 0.1 || r.x > p.x1 + 0.1 || r.z < p.z0 - 0.1 || r.z > p.z1 + 0.1) continue;
    if (p.top <= r.y + 0.35 && p.top > best) best = p.top, r._tile = p.tile ?? -1;
  }
  return best;
}

// Empuja al robot afuera de un bloque (en planta) si está metido de costado.
function pushOut(r, b, yTop, yBot) {
  // Si en el paso anterior estaba arriba, está aterrizando: lo para el piso, no el costado.
  if (r.y >= yTop - 0.05 || r.py >= yTop - 0.05 || r.y + HEIGHT <= yBot) return false;
  const cx = clamp(r.x, b.x0, b.x1), cz = clamp(r.z, b.z0, b.z1);
  const dx = r.x - cx, dz = r.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= RADIUS * RADIUS) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), k = (RADIUS - d) / d;
    r.x += dx * k; r.z += dz * k;
    if (Math.abs(dx) > Math.abs(dz)) r.vx = 0; else r.vz = 0;
  } else {
    // El centro quedó adentro: sale por el lado más cercano.
    const opts = [[b.x0 - RADIUS - r.x, 0], [b.x1 + RADIUS - r.x, 0], [0, b.z0 - RADIUS - r.z], [0, b.z1 + RADIUS - r.z]];
    opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
    r.x += opts[0][0]; r.z += opts[0][1];
  }
  return true;
}

function knock(r, vx, vz, vy, t) {
  r.vx = vx; r.vz = vz; r.vy = Math.max(r.vy, vy);
  r.grounded = false; r.stun = STUN_S; r.diving = false; r.hitAt = t;
}

// Golpes de los obstáculos. Devuelve 'bar' | 'hammer' | 'pusher' si algo le pegó en este paso.
export function obstacleHits(course, r, t) {
  let hit = null;
  for (const b of course.bars) {
    const top = course.start?.top ?? 0;
    const y = top + b.h;
    if (r.y > y + BAR_R || r.y + HEIGHT < y - BAR_R) continue;
    const a = barAngle(b, t);
    // Dos brazos (una barra entera que pasa por el centro).
    const ex = Math.cos(a) * b.r, ez = Math.sin(a) * b.r;
    const px = r.x - b.x, pz = r.z - b.z;
    const k = clamp((px * ex + pz * ez) / (b.r * b.r), -1, 1);
    const dx = px - ex * k, dz = pz - ez * k;
    const d = Math.hypot(dx, dz);
    if (d < BAR_R + RADIUS && Math.abs(k) > 0.04) {
      // Para el lado en que gira la barra en ese punto, y un poco hacia afuera.
      const s = Math.sign(b.w) * Math.sign(k || 1);
      const tx = -Math.sin(a) * s, tz = Math.cos(a) * s;
      // La barra de la supervivencia (`soft`) empuja menos: hay que saltarla, pero un golpe no te tira siempre al agua.
      const sp = b.soft ? 5.5 : 9 + Math.abs(b.w) * Math.abs(k) * b.r * 0.9;
      knock(r, tx * sp + (dx / (d || 1)) * 2, tz * sp + (dz / (d || 1)) * 2, 4.5, t);
      hit = 'bar';
    }
  }
  for (const hm of course.hammers) {
    const h = hammerHead(hm, t, 0);
    const dy = r.y + HEIGHT / 2 - h.y;
    if (Math.hypot(r.x - h.x, dy, r.z - h.z) < HAMMER_R + RADIUS) {
      const dir = Math.sign(Math.cos(hm.w * t + hm.ph)) || 1; // hacia dónde va el martillo
      knock(r, dir * 15, (r.z - h.z) * 2, 7, t);
      hit = 'hammer';
    }
  }
  for (const p of course.pushers) {
    const b = pusherBox(p, t);
    if (r.y > 1.6 || r.y + HEIGHT < 0) continue;
    if (r.x + RADIUS > b.x0 && r.x - RADIUS < b.x1 && r.z + RADIUS > b.z0 && r.z - RADIUS < b.z1) {
      r.x = b.face - p.side * (RADIUS + 0.02);
      if (r.vx * -p.side < 12) knock(r, -p.side * 13, r.vz * 0.3, 3.5, t);
      hit = 'pusher';
    }
  }
  void PUSHER_DEPTH;
  return hit;
}

// Un paso. `input`: { mx, mz } (dirección deseada en el mundo, largo ≤ 1), `jump`, `dive` (flancos). `broken`: baldosas rotas (Set).
// Devuelve la baldosa que pisó en este paso (o -1), para avisar a los demás.
export function stepRobot(r, input, course, broken, t, dt = STEP) {
  const control = r.stun > 0 ? 0.12 : r.getUp > 0 ? 0 : r.diving ? 0.15 : 1;
  const want = Math.hypot(input.mx, input.mz);
  const tx = input.mx * RUN, tz = input.mz * RUN;
  const rate = (r.grounded ? 14 : 3.2) * control;
  r.vx += (tx - r.vx) * Math.min(1, rate * dt);
  r.vz += (tz - r.vz) * Math.min(1, rate * dt);
  if (r.stun > 0 && r.grounded) { r.vx *= 1 - Math.min(1, 4 * dt); r.vz *= 1 - Math.min(1, 4 * dt); }
  if (want > 0.1 && control > 0.5) {
    const target = Math.atan2(-input.mx, -input.mz);
    let d = target - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    r.yaw += d * Math.min(1, 14 * dt);
  }
  if (input.jump && r.grounded && control > 0.5) { r.vy = JUMP_V; r.grounded = false; }
  if (input.dive && !r.diving && r.getUp <= 0 && r.stun <= 0) {
    r.diving = true;
    r.vx += -Math.sin(r.yaw) * DIVE_PUSH; r.vz += -Math.cos(r.yaw) * DIVE_PUSH;
    r.vy = Math.max(r.vy, 3.5); r.grounded = false;
  }
  r.vy -= GRAVITY * dt;
  r.py = r.y;
  r.x += r.vx * dt; r.z += r.vz * dt; r.y += r.vy * dt;
  r.stun = Math.max(0, r.stun - dt);
  r.getUp = Math.max(0, r.getUp - dt);
  // Costados de las plataformas y las paredes.
  for (const p of course.platforms) if (p.tile == null || !broken.has(p.tile)) pushOut(r, p, p.top, p.top - 1);
  for (const w of course.walls) pushOut(r, w, w.top, -1);
  // Piso.
  r._tile = -1;
  const g = groundUnder(course, r, broken);
  const wasAir = !r.grounded;
  if (r.y <= g && r.vy <= 0) {
    r.y = g; r.vy = 0; r.grounded = true;
    if (wasAir && r.diving) { r.diving = false; r.getUp = 0.45; }
  } else if (r.y > g + 0.05) r.grounded = false;
  const tile = r.grounded ? r._tile : -1;
  obstacleHits(course, r, t);
  if (r.grounded && Math.hypot(r.vx, r.vz) > 0.5) r.run += dt * Math.hypot(r.vx, r.vz) * 1.6;
  return tile;
}

// Que dos robots no se metan uno adentro del otro: se mueve solo el propio.
export function bumpRobots(r, others) {
  for (const o of others) {
    const dx = r.x - o.x, dz = r.z - o.z, d = Math.hypot(dx, dz);
    if (d < RADIUS * 2 && d > 1e-4 && Math.abs(r.y - o.y) < HEIGHT) { const k = (RADIUS * 2 - d) / d * 0.5; r.x += dx * k; r.z += dz * k; }
  }
}

// El último lugar seguro por el que pasó (para volver ahí si se cae en una carrera).
export function checkpointFor(course, r) {
  let cp = r.cp;
  course.checkpoints.forEach((c, i) => { if (r.z <= c.z && i > cp) cp = i; });
  return cp;
}
