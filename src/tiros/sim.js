// Física de A los Tiros, sin React ni red: movimiento del jugador, balas y choques. Todo en
// unidades del mundo (64 × 36) y segundos, a paso fijo (`STEP`). Las mismas balas se simulan en
// todas las pantallas a partir del disparo (posición, ángulo, hora y semilla), así no hace falta
// mandarlas por la red: con las cartas del que tiró alcanza para saber cómo se mueven.
import { WORLD_H, WORLD_W } from './maps.js';

export const STEP = 1 / 120;
export const PLAYER_R = 1.1;
export const GRAVITY = 70;
export const MOVE_SPEED = 14;
export const GROUND_ACCEL = 140;
export const AIR_ACCEL = 75;
export const JUMP_SPEED = 26;
export const WALL_JUMP_X = 17;
export const WALL_JUMP_Y = 24;
export const WALL_SLIDE = 7;
export const MAX_FALL = 42;
export const BULLET_SPEED = 62;
export const BULLET_GRAVITY = 22;
export const BULLET_R = 0.32;
export const BULLET_LIFE = 6;
export const BURST_GAP = 0.08;    // segundos entre balas de una ráfaga
export const BLOCK_TIME = 0.3;    // cuánto dura el escudo
export const OUT_DAMAGE = 0.2;    // fracción de la vida máxima que se pierde al salirse
export const OUT_LAUNCH = 70;     // velocidad hacia arriba al caerse del mapa (llega cerca del techo)
export const OUT_PUSH = 36;       // empujón de vuelta al salirse por un costado
export const FX_RADIUS = 9;       // alcance de los efectos del escudo

// Números al azar repetibles a partir de una semilla (mulberry32).
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Choque de un círculo contra un rectángulo: devuelve la normal (hacia afuera) y cuánto se mete.
export function circleRect(x, y, r, [rx, ry, rw, rh]) {
  const cx = clamp(x, rx, rx + rw);
  const cy = clamp(y, ry, ry + rh);
  let dx = x - cx;
  let dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // El centro quedó adentro: sale por el lado más cercano.
  const left = x - rx, right = rx + rw - x, top = y - ry, bottom = ry + rh - y;
  const m = Math.min(left, right, top, bottom);
  if (m === top) { dx = 0; dy = -1; } else if (m === bottom) { dx = 0; dy = 1; } else if (m === left) { dx = -1; dy = 0; } else { dx = 1; dy = 0; }
  return { nx: dx, ny: dy, depth: m + r };
}

export function newPlayerState(x, y, stats) {
  return {
    x, y, vx: 0, vy: 0, onGround: false, wall: 0, jumpWas: false, jumpCut: true,
    hp: stats.hp, maxHp: stats.hp, dead: false, phoenix: stats.phoenix,
    ammo: stats.ammo, reloadAt: 0, nextShotAt: 0, lastShotAt: 0, burstLeft: 0, burstAt: 0,
    blockUntil: 0, blockReadyAt: 0, slowUntil: 0, slowAmount: 0, rushUntil: 0, outUntil: 0,
    poison: [], // [{ dps, until, by }]
  };
}

// Un paso de movimiento del jugador propio. `input`: { left, right, jump } (teclas apretadas).
// `opts`: { rects, stats, now, enemyX } → devuelve eventos ({ out: true } si se salió del mundo).
export function stepPlayer(p, input, dt, { rects, stats, now, enemyX }) {
  const events = {};
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let mult = 1;
  if (now < p.slowUntil) mult *= 1 - p.slowAmount;
  if (stats.bloodRush && now < p.rushUntil) mult *= 1.5;
  if (stats.chase && enemyX != null && dir !== 0 && Math.sign(enemyX - p.x) === dir) mult *= 1.6;
  const target = dir * MOVE_SPEED * mult;
  const accel = (p.onGround ? GROUND_ACCEL : AIR_ACCEL) * Math.max(0.4, mult);
  if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);

  // Salto: en el piso, o desde una pared (se puede trepar saltando de pared en pared).
  const pressed = input.jump && !p.jumpWas;
  p.jumpWas = Boolean(input.jump);
  if (pressed) {
    if (p.onGround) { p.vy = -JUMP_SPEED; p.jumpCut = false; } else if (p.wall) {
      p.vy = -WALL_JUMP_Y;
      p.vx = -p.wall * WALL_JUMP_X;
      p.jumpCut = false;
    }
  }
  if (!input.jump && p.vy < 0 && !p.jumpCut) { p.vy *= 0.55; p.jumpCut = true; } // salto corto si se suelta

  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
  if (p.wall && p.vy > WALL_SLIDE && dir === p.wall) p.vy = WALL_SLIDE;

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.onGround = false;
  p.wall = 0;
  // Mientras sale disparado para arriba atraviesa los bloques (si no, debajo de un piso que llega
  // al borde rebotaría contra él y se caería una y otra vez).
  if (p.launching && p.vy >= 0) p.launching = false;
  for (const rect of rects) {
    if (p.launching) break;
    const hit = circleRect(p.x, p.y, PLAYER_R, rect);
    if (!hit) continue;
    p.x += hit.nx * hit.depth;
    p.y += hit.ny * hit.depth;
    const vn = p.vx * hit.nx + p.vy * hit.ny;
    if (vn < 0) { p.vx -= vn * hit.nx; p.vy -= vn * hit.ny; }
    if (hit.ny < -0.6) p.onGround = true;
    else if (Math.abs(hit.nx) > 0.6) p.wall = hit.nx > 0 ? -1 : 1;
  }

  // Fuera del mundo (como en el original): el que se cae sale disparado para arriba, casi hasta el
  // techo, y pierde vida; por los costados lo empuja de vuelta hacia adentro.
  if (now >= p.outUntil && (p.x < -1 || p.x > WORLD_W + 1 || p.y > WORLD_H + 1 || p.y < -10)) {
    if (p.y > WORLD_H + 1) { p.vy = -OUT_LAUNCH; p.vx *= 0.4; p.launching = true; p.jumpCut = true; events.out = 'bottom'; }
    if (p.x < -1) { p.vx = OUT_PUSH; p.vy = Math.min(p.vy, -18); events.out = 'left'; }
    if (p.x > WORLD_W + 1) { p.vx = -OUT_PUSH; p.vy = Math.min(p.vy, -18); events.out = 'right'; }
    if (p.y < -10) { p.vy = 14; events.out = 'top'; }
    p.outUntil = now + 0.35;
  }
  return events;
}

// Las balas de un disparo. `shot`: { k, t, x, y, a, sd } (hora en segundos del servidor).
// Cada una arranca en su hora (`t0`): las de una ráfaga salen escalonadas.
export function bulletsForShot(shot, owner, stats) {
  const rand = seeded(shot.sd);
  const list = [];
  for (let j = 0; j < stats.burst; j++) {
    for (let i = 0; i < stats.bullets; i++) {
      const offset = stats.bullets > 1 ? -stats.spread / 2 + (stats.spread * i) / (stats.bullets - 1) : 0;
      const a = shot.a + offset + (rand() - 0.5) * 2 * stats.inaccuracy;
      const speed = BULLET_SPEED * stats.speed * (stats.bullets > 1 ? 0.9 + rand() * 0.2 : 1);
      const ox = Math.cos(a), oy = Math.sin(a);
      list.push({
        k: `${shot.k}:${j}:${i}`,
        owner,
        t0: shot.t + j * BURST_GAP,
        x: shot.x + ox * (PLAYER_R + 0.5),
        y: shot.y + oy * (PLAYER_R + 0.5),
        vx: ox * speed,
        vy: oy * speed,
        r: BULLET_R * stats.size,
        age: 0,
        dist: 0,
        bouncesLeft: stats.bounces,
        bounced: 0,
        drillLeft: stats.drill,
        stuckAt: 0,
        done: false,
      });
    }
  }
  return list;
}

export const bulletDamage = (b, stats) => stats.dmg * (1 + stats.grow * b.dist) * (1 + stats.trickster * b.bounced);

function steer(b, tx, ty, rate, dt) {
  const speed = Math.hypot(b.vx, b.vy) || 1;
  const want = Math.atan2(ty - b.y, tx - b.x);
  const now = Math.atan2(b.vy, b.vx);
  let diff = want - now;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const a = now + clamp(diff, -rate * dt, rate * dt);
  b.vx = Math.cos(a) * speed;
  b.vy = Math.sin(a) * speed;
}

// Un paso de una bala. `ctx`: { rects, stats, aim (mouse del dueño), targets: [{ x, y, id }] }.
// Devuelve { impact: { x, y } } si pegó en una pared sin rebotes, o null.
export function stepBullet(b, dt, { rects, stats, aim, targets }) {
  if (b.done || b.stuckAt) return null;
  b.age += dt;
  if (b.age > BULLET_LIFE) { b.done = true; return null; }
  if (stats.remote && aim) steer(b, aim.x, aim.y, 7, dt);
  else if (stats.homing && b.bounced > 0 && targets?.length) {
    let best = null;
    for (const t of targets) {
      if (t.id === b.owner) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (!best || d < best.d) best = { d, t };
    }
    if (best) steer(b, best.t.x, best.t.y, 6, dt);
  }
  if (!stats.remote) b.vy += BULLET_GRAVITY * dt;
  const speed = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.4));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.dist += speed * h;
    for (const rect of rects) {
      const hit = circleRect(b.x, b.y, b.r, rect);
      if (!hit) continue;
      if (b.drillLeft > 0) { b.drillLeft -= speed * h; continue; }
      if (b.bouncesLeft > 0) {
        b.x += hit.nx * hit.depth;
        b.y += hit.ny * hit.depth;
        const vn = b.vx * hit.nx + b.vy * hit.ny;
        if (vn < 0) { b.vx -= 2 * vn * hit.nx; b.vy -= 2 * vn * hit.ny; }
        if (stats.bounceSlow) { b.vx *= 0.5; b.vy *= 0.5; }
        b.bouncesLeft -= 1;
        b.bounced += 1;
        break;
      }
      b.x += hit.nx * hit.depth;
      b.y += hit.ny * hit.depth;
      if (stats.timedBomb) { b.stuckAt = b.t0 + b.age; return null; }
      b.done = true;
      return { impact: { x: b.x, y: b.y } };
    }
  }
  if (b.x < -6 || b.x > WORLD_W + 6 || b.y > WORLD_H + 6 || b.y < -40) b.done = true;
  return null;
}

export const touches = (b, x, y, r = PLAYER_R) => Math.hypot(b.x - x, b.y - y) < r + b.r;

// Hacia dónde apunta la teletransportación: hasta 10 unidades, frenando antes de una pared.
export function teleportTarget(p, angle, rects) {
  let x = p.x, y = p.y;
  for (let d = 0; d < 10; d += 0.25) {
    const nx = p.x + Math.cos(angle) * d;
    const ny = p.y + Math.sin(angle) * d;
    if (rects.some((r) => circleRect(nx, ny, PLAYER_R, r))) break;
    if (nx < 0 || nx > WORLD_W || ny < -5 || ny > WORLD_H) break;
    x = nx; y = ny;
  }
  return { x, y };
}
