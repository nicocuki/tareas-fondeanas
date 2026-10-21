// Física de Cohete Royale, sin React ni red: el tanque, los cohetes y las armas, las explosiones, y
// dónde están las monedas y las cajas. Unidades: casillas del terreno (y crece hacia abajo) y segundos.
import { seeded, solid, surfaceY } from './terrain.js';

export const STEP = 1 / 120;
export const TANK_HW = 7;        // medio ancho del tanque
export const TANK_H = 9;         // alto (la posición del tanque es el medio de las orugas, abajo)
export const GRAVITY = 330;
export const DRIVE = 78;         // velocidad manejando
export const CLIMB = 3;          // escalón que sube solo manejando
export const MAX_FALL = 420;
export const RECOIL = 115;       // empujón hacia atrás al disparar: así se mueve por el aire
export const HP = 100;
export const MUZZLE = 12;        // largo del caño
export const KILL_CREDIT = 6;    // si caés al agua hasta 6 s después de un golpe, el punto es del que te pegó

// Armas. `crater`: radio del pozo; `radius`: alcance del daño y del empujón; `damage` en el centro;
// `knock`: empujón en el centro. El cohete común no se gasta; las demás vienen en las cajas.
export const WEAPONS = {
  rocket: { name: 'Cohete', speed: 340, gravity: 230, crater: 17, radius: 30, damage: 34, knock: 230, cooldown: 0.55 },
  triple: { name: 'Triple', speed: 330, gravity: 230, crater: 13, radius: 24, damage: 24, knock: 180, cooldown: 0.7, spread: 0.16, count: 3, ammo: 5 },
  grenade: { name: 'Granada', speed: 260, gravity: 330, crater: 22, radius: 36, damage: 44, knock: 260, cooldown: 0.8, bounces: 3, fuse: 2.6, ammo: 4 },
  homing: { name: 'Teledirigido', speed: 230, gravity: 0, crater: 16, radius: 30, damage: 38, knock: 220, cooldown: 0.9, homing: true, life: 4, ammo: 3 },
  nuke: { name: 'Bomba gorda', speed: 240, gravity: 260, crater: 52, radius: 80, damage: 75, knock: 420, cooldown: 1.2, ammo: 1 },
  laser: { name: 'Láser', speed: 1300, gravity: 0, crater: 8, radius: 16, damage: 30, knock: 150, cooldown: 0.5, life: 1.2, ammo: 4 },
  mine: { name: 'Mina', speed: 150, gravity: 330, crater: 26, radius: 40, damage: 55, knock: 300, cooldown: 0.6, mine: true, trigger: 20, life: 60, ammo: 3 },
};
export const CRATE_WEAPONS = ['triple', 'grenade', 'homing', 'nuke', 'laser', 'mine'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Tanque ──────────────────────────────────────────────────────────────────
export function newTank(x, y) {
  return { x, y, vx: 0, vy: 0, hp: HP, dead: false, onGround: false, weapon: 'rocket', ammo: 0, readyAt: 0, lastBy: null, lastHitAt: -99, treads: 0 };
}

// ¿El cuerpo del tanque, parado con las orugas en y, toca tierra?
export function blocked(t, x, y) {
  for (let dy = 1; dy <= TANK_H; dy += 2) {
    for (let dx = -TANK_HW; dx <= TANK_HW; dx += 2) if (solid(t, x + dx, y - dy)) return true;
  }
  return false;
}
const grounded = (t, x, y) => {
  for (let dx = -TANK_HW + 1; dx <= TANK_HW - 1; dx += 2) if (solid(t, x + dx, y)) return true;
  return false;
};

// Un paso del tanque propio. `dir`: −1, 0 o 1 (A/D).
export function stepTank(p, dir, dt, t) {
  p.onGround = grounded(t, p.x, p.y + 0.5);
  if (p.onGround) {
    // Manejando: llega rápido a la velocidad pedida y frena enseguida al soltar.
    p.vx += (dir * DRIVE - p.vx) * Math.min(1, dt * 12);
    if (p.vy > 0) p.vy = 0;
  } else {
    // En el aire se conserva el impulso (de un disparo o una explosión), con un poco de control.
    p.vx *= 1 - Math.min(1, dt * 0.35);
    if (dir && Math.abs(p.vx) < DRIVE * 0.7) p.vx += dir * 120 * dt;
  }
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);

  // Horizontal, de a una casilla: sube los escalones chicos manejando.
  let dx = p.vx * dt;
  while (Math.abs(dx) > 1e-6) {
    const s = Math.sign(dx) * Math.min(1, Math.abs(dx));
    dx -= s;
    if (!blocked(t, p.x + s, p.y)) { p.x += s; continue; }
    let climbed = false;
    for (let c = 1; c <= CLIMB && p.onGround; c++) {
      if (!blocked(t, p.x + s, p.y - c)) { p.x += s; p.y -= c; climbed = true; break; }
    }
    if (!climbed) { p.vx = 0; break; }
  }
  // Vertical, de a una casilla.
  let dy = p.vy * dt;
  while (Math.abs(dy) > 1e-6) {
    const s = Math.sign(dy) * Math.min(1, Math.abs(dy));
    dy -= s;
    // Aterriza: las orugas quedan justo arriba de la fila de tierra.
    if (s > 0 && grounded(t, p.x, p.y + s)) { p.y = Math.max(p.y, Math.floor(p.y + s) - 0.001); p.vy = 0; p.onGround = true; break; }
    if (s < 0 && blocked(t, p.x, p.y + s)) { p.vy = 0; break; }
    p.y += s;
  }
  // Bajando una pendiente manejando se queda pegado al piso.
  if (p.onGround && p.vy >= 0) {
    for (let c = 1; c <= CLIMB + 1; c++) {
      if (grounded(t, p.x, p.y + c)) { p.y += c - 1; break; }
    }
  }
  // Si quedó adentro de la tierra (le cayó un pedazo encima), se lo saca para arriba.
  for (let n = 0; n < 30 && blocked(t, p.x, p.y); n++) p.y -= 1;
  p.x = clamp(p.x, -40, t.W + 40);
  p.treads += Math.abs(p.vx) * dt;
}

// Punta del caño, desde donde salen los tiros.
export function muzzle(p, angle) {
  return { x: p.x + Math.cos(angle) * MUZZLE, y: p.y - TANK_H * 0.7 + Math.sin(angle) * MUZZLE };
}

// ─── Tiros ───────────────────────────────────────────────────────────────────
// Un disparo viaja como { k, t, x, y, a, w } y cada pantalla arma sus proyectiles igual.
export function projectilesFor(shot, owner) {
  const w = WEAPONS[shot.w] || WEAPONS.rocket;
  const count = w.count || 1;
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = shot.a + (count > 1 ? (i - (count - 1) / 2) * w.spread : 0);
    list.push({
      k: `${shot.k}.${i}`, owner, w: shot.w, x: shot.x, y: shot.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      age: 0, bounces: w.bounces || 0, stuck: false, done: false, trail: [],
    });
  }
  return list;
}

// Un paso de un proyectil. `targets`: tanques a los que puede pegarle [{ id, x, y }] (no el dueño).
// Devuelve { x, y } si explotó.
export function stepProjectile(b, dt, t, targets = []) {
  const w = WEAPONS[b.w] || WEAPONS.rocket;
  b.age += dt;
  if (b.stuck) {
    // Mina apoyada: explota si alguien se acerca, o al final de su vida.
    if (b.age > w.life) return boom(b);
    for (const tk of targets) if (Math.hypot(tk.x - b.x, tk.y - TANK_H / 2 - b.y) < w.trigger) return boom(b);
    return null;
  }
  if (w.homing && targets.length) {
    let best = null, bd = Infinity;
    for (const tk of targets) { const d = Math.hypot(tk.x - b.x, tk.y - b.y); if (d < bd) { bd = d; best = tk; } }
    if (best && b.age > 0.25) {
      const want = Math.atan2(best.y - TANK_H / 2 - b.y, best.x - b.x);
      const now = Math.atan2(b.vy, b.vx);
      let diff = want - now;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = clamp(diff, -3.2 * dt, 3.2 * dt);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(now + turn) * sp;
      b.vy = Math.sin(now + turn) * sp;
    }
  }
  if ((w.life && b.age > w.life) || (w.fuse && b.age > w.fuse)) return boom(b);
  b.vy += w.gravity * dt;
  // Pasos chicos: el láser es muy rápido y no tiene que atravesar nada.
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / 1.5));
  for (let i = 0; i < n; i++) {
    const nx = b.x + (b.vx * dt) / n, ny = b.y + (b.vy * dt) / n;
    for (const tk of targets) {
      if (Math.abs(nx - tk.x) < TANK_HW + 1 && ny > tk.y - TANK_H - 1 && ny < tk.y + 1) { b.x = nx; b.y = ny; return boom(b); }
    }
    if (solid(t, nx, ny)) {
      if (w.mine) { b.stuck = true; b.age = 0; return null; }
      if (b.bounces > 0) {
        b.bounces -= 1;
        // Rebote: se da vuelta la componente que chocó.
        if (solid(t, nx, b.y)) b.vx *= -0.55; else b.vy *= -0.55;
        if (!solid(t, b.x, ny) && solid(t, nx, b.y)) b.vy *= 0.8;
        return null;
      }
      b.x = nx; b.y = ny;
      return boom(b);
    }
    b.x = nx; b.y = ny;
  }
  if (b.y > t.H + 40 || b.x < -200 || b.x > t.W + 200) { b.done = true; return null; }
  b.trail.push(b.x, b.y);
  if (b.trail.length > 16) b.trail.splice(0, 2);
  return null;
}

function boom(b) {
  b.done = true;
  return { x: b.x, y: b.y };
}

// Explosión que viaja por la red: { k, x, y, w, o }. Cuánto daño y empujón le hace a un tanque.
export function blastOn(p, ex) {
  const w = WEAPONS[ex.w] || WEAPONS.rocket;
  const cx = p.x, cy = p.y - TANK_H / 2;
  const d = Math.hypot(cx - ex.x, cy - ex.y);
  if (d >= w.radius) return null;
  const f = 1 - d / w.radius;
  const nx = d > 0.01 ? (cx - ex.x) / d : 0;
  const ny = d > 0.01 ? (cy - ex.y) / d : -1;
  return { damage: w.damage * (0.4 + 0.6 * f), vx: nx * w.knock * f, vy: ny * w.knock * f - 60 * f };
}

// ─── Monedas y cajas ─────────────────────────────────────────────────────────
export const COIN_COUNT = 40;
export const CRATE_EVERY = 11;     // segundos entre cajas
export const MAX_CRATES = 40;

// Dónde están las monedas: flotando un poco arriba del terreno original.
export function coinSpots(t, seed) {
  const rand = seeded(seed ^ 0x51ed);
  return Array.from({ length: COIN_COUNT }, () => {
    const x = t.W * (0.1 + rand() * 0.8);
    return { x, y: surfaceY(t, x) - 10 - rand() * 30 };
  });
}

// La caja i: cuándo cae (segundos de partida), dónde y qué arma trae. Cae desde arriba hasta la tierra.
export function crateInfo(i, seed, W) {
  const rand = seeded((seed ^ 0xc2a7e) + i * 7919);
  return { at: 8 + i * CRATE_EVERY, x: W * (0.12 + rand() * 0.76), weapon: CRATE_WEAPONS[Math.floor(rand() * CRATE_WEAPONS.length)] };
}

// Hasta dónde baja el tanque en x: lo más alto de la tierra debajo de todo su ancho.
export function groundUnder(t, x) {
  let y = t.H;
  for (let dx = -TANK_HW; dx <= TANK_HW; dx++) y = Math.min(y, surfaceY(t, x + dx));
  return y;
}

// Dónde arranca el jugador i de n: repartidos a lo ancho de la isla, apoyados en la tierra.
export function spawnFor(t, i, n) {
  const x = t.W * 0.14 + (n > 1 ? (i / (n - 1)) * t.W * 0.72 : t.W * 0.36);
  return { x, y: groundUnder(t, x) - 0.001 };
}
