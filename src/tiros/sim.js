// Física de A los Tiros, sin React ni red: movimiento del jugador, balas y choques. Todo en
// unidades del mundo (64 × 36) y segundos, a paso fijo (`STEP`). Las mismas balas se simulan en
// todas las pantallas a partir del disparo (posición, ángulo, hora y semilla), así no hace falta
// mandarlas por la red: con las cartas del que tiró alcanza para saber cómo se mueven.
import { WORLD_H, WORLD_W } from './maps.js';
import { hitSolid } from './shapes.js';
import { BASE } from './cards.js';

export const STEP = 1 / 120;
export const PLAYER_R = 0.8;   // cuerpo y piernas: los pies tocan el piso en y + PLAYER_R
// Medido de un video de ROUNDS (720 px de alto = nuestras 36 unidades): cae con ~110 u/s², el salto
// sube rápido (0,3 s) y, al soltar, la velocidad de costado se va a la mitad cada ~0,07 s.
export const GRAVITY = 110;
export const MOVE_SPEED = 14;
export const MOVE_RESPONSE = 10;   // por segundo: qué tan rápido se acerca a la velocidad pedida (arranque y frenada)
export const JUMP_SPEED = 38;
// Saltos como en ROUNDS (PlayerJump.Jump, en el PlayerJumpPatch de Rounds-Modding): el salto es un
// empujón que se suma a la velocidad, pero antes anula la caída; el de la pared sale en la dirección
// (0,4 hacia afuera, 0,8 para arriba), y el del piso suma una parte de la velocidad de costado.
export const WALL_JUMP_X = 0.4 * JUMP_SPEED;
export const WALL_JUMP_Y = 0.8 * JUMP_SPEED;
export const JUMP_SIDE = 0.25;     // fracción de la velocidad de costado que suma el salto del piso
export const AIR_DRAG = 1.5;       // por segundo: cómo se gasta en el aire lo que pasa de la velocidad normal
export const MAX_RISE = 1.5 * JUMP_SPEED; // tope de subida al encadenar saltos de pared
export const JUMP_COOLDOWN = 0.1;  // segundos entre saltos (sinceJump del original)
export const WALL_COYOTE = 0.1;    // se puede saltar de la pared hasta este tiempo después de soltarla
export const WALL_SLIDE = 1.2;     // apretando hacia la pared casi no se cae: queda agarrado
export const MAX_FALL = 42;
// Medido de un video del original: la bala común va a ~37 u/s y cae con ~64 u/s² (en media pantalla
// baja unas 6 unidades). Con cartas de velocidad de bala la gravedad se divide por el cuadrado del
// multiplicador, así que esas van casi derechas.
export const BULLET_SPEED = 37;
export const BULLET_GRAVITY = 64;
export const BULLET_R = 0.32;
export const BULLET_LIFE = 6;
export const BURST_GAP = 0.08;    // segundos entre balas de una ráfaga
export const BLOCK_TIME = 0.3;    // cuánto dura el escudo
export const OUT_DAMAGE = 0.2;    // fracción de la vida máxima que se pierde al salirse
export const OUT_LAUNCH = 88;     // velocidad hacia arriba al caerse del mapa (llega cerca del techo)
export const OUT_PUSH = 36;       // empujón de vuelta al salirse por un costado
export const FX_RADIUS = 9;       // alcance de los efectos del escudo
export const EMPOWER_SPEED = 1.6; // el tiro potenciado (Potenciar) va más rápido…
export const EMPOWER_DAMAGE = 1.5; // …y pega más fuerte

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

export function newPlayerState(x, y, stats) {
  return {
    x, y, vx: 0, vy: 0, onGround: false, wall: 0, jumpWas: false, jumpCut: true,
    sinceJump: 1, sinceWall: 1, lastWall: 0,
    hp: stats.hp, maxHp: stats.hp, dead: false, phoenix: stats.phoenix,
    ammo: stats.ammo, reloadAt: 0, nextShotAt: 0, lastShotAt: 0, burstLeft: 0, burstAt: 0,
    blockUntil: 0, blockReadyAt: 0, slowUntil: 0, slowAmount: 0, rushUntil: 0, outUntil: 0,
    poison: [], // [{ dps, until, by }]
    stunUntil: 0, silenceUntil: 0, thrust: null, sawUntil: 0, empowered: false,
    echoAt: 0, chargeUntil: 0, abyssCharge: 0, abyssUntil: 0, abyssBlockAt: 0, waveAt: 0,
    brawlUntil: 0, brawlExtra: 0, boosted: false, refreshAt: 0,
  };
}

// Un paso de movimiento del jugador propio. `input`: { left, right, jump } (teclas apretadas).
// `opts`: { solids (los del mapa y las cajas, ver shapes.js), stats, now, enemyX } → devuelve eventos ({ out: true } si se salió del mundo).
export function stepPlayer(p, input, dt, { solids, stats, now, enemyX }) {
  const events = {};
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let mult = 1;
  if (now < p.slowUntil) mult *= 1 - p.slowAmount;
  if (stats.bloodRush && now < p.rushUntil) mult *= 1.5;
  if (stats.chase && enemyX != null && dir !== 0 && Math.sign(enemyX - p.x) === dir) mult *= 1.6;
  const target = dir * MOVE_SPEED * mult;
  const cap = MOVE_SPEED * mult;
  if (!p.onGround && Math.abs(p.vx) > cap && dir !== -Math.sign(p.vx)) {
    // Impulso de costado: en el aire, lo que pasa de la velocidad normal se gasta de a poco,
    // salvo que se apriete para el otro lado.
    const excess = (Math.abs(p.vx) - cap) * Math.max(0, 1 - AIR_DRAG * dt);
    p.vx = Math.sign(p.vx) * (cap + excess);
  } else {
    // Como en ROUNDS, se acerca a la velocidad pedida de a poco (en el piso y en el aire):
    // arranca rápido y, al soltar, frena deslizando un poco en vez de pararse en seco.
    p.vx += (target - p.vx) * Math.min(1, MOVE_RESPONSE * Math.max(0.4, mult) * dt);
    if (Math.abs(p.vx - target) < 0.01) p.vx = target;
  }

  // Salto: en el piso, o desde una pared (se puede trepar saltando de pared en pared).
  if (p.wall) { p.sinceWall = 0; p.lastWall = p.wall; } else p.sinceWall = (p.sinceWall ?? 1) + dt;
  p.sinceJump = (p.sinceJump ?? 1) + dt;
  const pressed = input.jump && !p.jumpWas;
  p.jumpWas = Boolean(input.jump);
  const fromWall = !p.onGround && p.sinceWall < WALL_COYOTE;
  if (pressed && p.sinceJump >= JUMP_COOLDOWN && (p.onGround || fromWall)) {
    if (p.vy > 0) p.vy = 0; // el salto corta la caída en seco
    if (fromWall) {
      p.vy -= WALL_JUMP_Y;
      p.vx -= p.lastWall * WALL_JUMP_X;
      p.sinceWall = WALL_COYOTE;
    } else {
      p.vy -= JUMP_SPEED;
      p.vx = clamp(p.vx * (1 + JUMP_SIDE), -2 * MOVE_SPEED, 2 * MOVE_SPEED);
    }
    p.vy = Math.max(p.vy, -MAX_RISE);
    p.sinceJump = 0;
    p.onGround = false;
    p.jumpCut = false;
  }
  if (!input.jump && p.vy < 0 && !p.jumpCut) { p.vy *= 0.55; p.jumpCut = true; } // salto corto si se suelta

  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
  if (p.wall && p.vy > WALL_SLIDE && dir === p.wall) p.vy = WALL_SLIDE; // agarrado de la pared

  // Lo que empuja contra las cajas: la velocidad que quiere tener (si aprieta para un lado), no la que
  // le queda después de chocar con la caja, que ya viene frenada.
  p.pushVx = dir ? target : p.vx;
  p.pushVy = p.vy;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const wasGround = p.onGround;
  p.onGround = false;
  p.wall = 0;
  p.touching = null;
  // Mientras sale disparado para arriba atraviesa los bloques (si no, debajo de un piso que llega
  // al borde rebotaría contra él y se caería una y otra vez).
  if (p.launching && p.vy >= 0) p.launching = false;
  for (const solid of solids) {
    if (p.launching) break;
    const hit = hitSolid(p.x, p.y, PLAYER_R, solid);
    if (!hit) continue;
    if (solid.boxIndex !== undefined) (p.touching ||= []).push(solid.boxIndex);
    if (hit.ny < -0.6) {
      // Piso (también en rampa o encima de un círculo): se lo sube derecho, así no se resbala
      // estando quieto, y subiendo una rampa no pierde velocidad.
      p.y -= hit.depth / -hit.ny;
      if (p.vy > 0) p.vy = 0;
      p.onGround = true;
      continue;
    }
    p.x += hit.nx * hit.depth;
    p.y += hit.ny * hit.depth;
    const vn = p.vx * hit.nx + p.vy * hit.ny;
    if (vn < 0) { p.vx -= vn * hit.nx; p.vy -= vn * hit.ny; }
    if (Math.abs(hit.nx) > 0.6) p.wall = hit.nx > 0 ? -1 : 1;
  }
  // Bajando una rampa caminando, se lo pega al piso en vez de dejarlo saltando en el aire.
  if (wasGround && !p.onGround && !p.launching && p.vy >= 0 && p.sinceJump > JUMP_COOLDOWN) {
    const probe = Math.abs(p.vx) * dt * 1.5 + 0.05;
    let lift = null;
    for (const solid of solids) {
      const hit = hitSolid(p.x, p.y + probe, PLAYER_R, solid);
      if (hit && hit.ny < -0.6) lift = Math.min(lift ?? Infinity, probe - hit.depth / -hit.ny);
    }
    if (lift !== null && lift >= 0) { p.y += lift; p.vy = 0; p.onGround = true; }
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

// Daño por caerse del mundo: el 20 % de la vida, salvo que tenga el escudo activo en ese momento
// (como en el original: sale disparado igual, pero no pierde vida).
export const outDamage = (p, now) => (now < p.blockUntil ? 0 : OUT_DAMAGE * p.maxHp);

// Las balas de un disparo. `shot`: { k, t, x, y, a, sd } (hora en segundos del servidor).
// Cada una arranca en su hora (`t0`): las de una ráfaga salen escalonadas.
export function bulletsForShot(shot, owner, stats) {
  const rand = seeded(shot.sd);
  const list = [];
  for (let j = 0; j < stats.burst; j++) {
    for (let i = 0; i < stats.bullets; i++) {
      const offset = stats.bullets > 1 ? -stats.spread / 2 + (stats.spread * i) / (stats.bullets - 1) : 0;
      const a = shot.a + offset + (rand() - 0.5) * 2 * stats.inaccuracy;
      const speed = BULLET_SPEED * stats.speed * (stats.bullets > 1 ? 0.9 + rand() * 0.2 : 1) * (shot.em ? EMPOWER_SPEED : 1);
      const ox = Math.cos(a), oy = Math.sin(a);
      list.push({
        em: shot.em ? 1 : 0,
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

export const bulletDamage = (b, stats) => stats.dmg * (1 + stats.grow * b.dist) * (1 + stats.trickster * b.bounced) * (b.em ? EMPOWER_DAMAGE : 1);

// Balas que salen del escudo (PEM y ¡Bombas!): no usan las cartas del que se cubrió sino las suyas
// propias (`b.st`). Salen en anillo desde el lugar del escudo, iguales en todas las pantallas.
export const EMP_STATS = { ...BASE, dmg: 8, slow: 0.7, straight: true, size: 0.7 };
export const BOMB_STATS = { ...BASE, dmg: 24, timedBomb: true, explode: 3.2, size: 0.9 };
export function ringBullets(ev, owner, kind) {
  const emp = kind === 'emp';
  const st = emp ? EMP_STATS : BOMB_STATS;
  const n = emp ? 12 : 7;
  const list = [];
  for (let i = 0; i < n; i++) {
    // El PEM sale parejo para todos lados; las bombitas, para arriba y a los costados.
    const a = emp ? (i / n) * Math.PI * 2 : -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 2.6;
    const speed = emp ? 24 : 15 + (i % 3) * 2.5;
    list.push({
      k: `${ev.k}:${kind}${i}`, owner, st, em: 0, t0: ev.t, glow: emp ? '#8fe3ff' : '#ff9a3c',
      x: ev.x + Math.cos(a) * (PLAYER_R + 0.6), y: ev.y + Math.sin(a) * (PLAYER_R + 0.6),
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: BULLET_R * st.size,
      age: 0, dist: 0, bouncesLeft: 0, bounced: 0, drillLeft: 0, stuckAt: 0, done: false,
    });
  }
  return list;
}

function nearestTarget(b, targets) {
  let best = null;
  for (const t of targets || []) {
    if (t.id === b.owner) continue;
    const d = Math.hypot(t.x - b.x, t.y - b.y);
    if (!best || d < best.d) best = { d, t };
  }
  return best?.t || null;
}

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

// Un paso de una bala. `ctx`: { solids, stats, aim (mouse del dueño), targets: [{ x, y, id }], onBox }.
// `onBox(índice, bala)` avisa cuando pega (o rebota) en una caja, para empujarla.
// Devuelve { impact: { x, y } } si pegó en una pared sin rebotes, o null.
export function stepBullet(b, dt, { solids, stats, aim, targets, onBox }) {
  if (b.done || b.stuckAt) return null;
  b.age += dt;
  if (b.age > BULLET_LIFE) { b.done = true; return null; }
  if (stats.remote && aim) steer(b, aim.x, aim.y, 7, dt);
  else if ((stats.seek || (stats.homing && b.bounced > 0)) && targets?.length) {
    const t = nearestTarget(b, targets);
    if (t) steer(b, t.x, t.y, stats.seek ? 3.5 : 6, dt);
  }
  // Escurridizas: si lo que tiene adelante es piso o pared, dobla para el otro lado.
  if (stats.sneaky && solids) {
    const ahead = 0.18;
    for (const solid of solids) {
      const hit = hitSolid(b.x + b.vx * ahead, b.y + b.vy * ahead, b.r + 0.5, solid);
      if (hit) { b.vx += hit.nx * 90 * dt; b.vy += hit.ny * 90 * dt; break; }
    }
  }
  if (!stats.remote && !stats.straight && !stats.seek) b.vy += (BULLET_GRAVITY / Math.max(1, stats.speed) ** 2) * dt;
  const speed = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.4));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.dist += speed * h;
    for (const solid of solids) {
      const hit = hitSolid(b.x, b.y, b.r, solid);
      if (!hit) continue;
      if (b.drillLeft > 0) { b.drillLeft -= speed * h; continue; }
      if (solid.boxIndex !== undefined) onBox?.(solid.boxIndex, b);
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
export function teleportTarget(p, angle, solids) {
  let x = p.x, y = p.y;
  for (let d = 0; d < 10; d += 0.25) {
    const nx = p.x + Math.cos(angle) * d;
    const ny = p.y + Math.sin(angle) * d;
    if (solids.some((sol) => hitSolid(nx, ny, PLAYER_R, sol))) break;
    if (nx < 0 || nx > WORLD_W || ny < -5 || ny > WORLD_H) break;
    x = nx; y = ny;
  }
  return { x, y };
}
