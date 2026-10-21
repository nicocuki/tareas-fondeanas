// Física de Cohete Royale, sin React ni red. Unidades: casillas del mapa (y crece hacia abajo) y segundos.
//
// Como en Rocket Bot Royale:
// - El tanque **se pega a cualquier superficie**: maneja por el piso, las paredes y los techos, y gira
//   con ella. Solo se despega cuando lo empuja algo (el retroceso de un tiro, una explosión).
// - Los cohetes van **derecho** (sin gravedad). Hay 3 y se recargan de a uno.
// - Al empezar todos van en una nave que cruza el mapa; cada uno salta cuando quiere y baja en paracaídas.
import { SHIP_Y, seeded, solid } from './terrain.js';

export const STEP = 1 / 120;
export const TANK_R = 6.5;       // radio de choque del tanque (su centro es el medio del cuerpo)
export const GRAVITY = 300;
export const DRIVE = 72;         // velocidad manejando
export const MAX_FALL = 380;
export const CHUTE_FALL = 42;    // caída con paracaídas
export const CHUTE_SIDE = 55;
export const RECOIL = 135;       // empujón para atrás al disparar: así se mueve por el aire
export const UNSTICK = 50;       // un empujón más fuerte que esto lo despega de la superficie
export const HP = 100;
export const MUZZLE = 11;
export const MAX_AMMO = 3;       // cohetes en el cargador
export const RELOAD = 0.85;      // segundos por cohete que vuelve
export const SHOT_GAP = 0.16;    // entre tiro y tiro
export const KILL_CREDIT = 6;    // si te hundís hasta 6 s después de un golpe, la baja es del que te pegó
export const SHIP_TIME = 16;     // lo que tarda la nave en cruzar el mapa
export const DEPLOY_AFTER = 1;   // segundos de partida antes de poder saltar

// Armas. `crater`: radio del pozo; `radius`: alcance del daño y del empujón; `damage` en el centro;
// `knock`: empujón en el centro. El cohete común es infinito (con su cargador); las otras vienen en
// las cajas y se usan en vez del cohete hasta gastarlas.
export const WEAPONS = {
  rocket: { name: 'Cohete', icon: '🚀', speed: 290, gravity: 0, crater: 15, radius: 30, damage: 34, knock: 240, life: 2.4 },
  triple: { name: 'Triple', icon: '🔱', speed: 280, gravity: 0, crater: 12, radius: 24, damage: 24, knock: 190, life: 2.2, spread: 0.18, count: 3, ammo: 5 },
  grenade: { name: 'Granada', icon: '💣', speed: 230, gravity: 300, crater: 22, radius: 38, damage: 44, knock: 270, bounces: 3, fuse: 2.6, ammo: 4 },
  homing: { name: 'Teledirigido', icon: '🎯', speed: 200, gravity: 0, crater: 15, radius: 30, damage: 38, knock: 230, homing: true, life: 4, ammo: 3 },
  nuke: { name: 'Bomba gorda', icon: '☢️', speed: 190, gravity: 0, crater: 50, radius: 80, damage: 75, knock: 430, life: 3.5, ammo: 1 },
  laser: { name: 'Láser', icon: '⚡', speed: 1300, gravity: 0, crater: 7, radius: 16, damage: 30, knock: 160, life: 1.2, ammo: 4 },
  mine: { name: 'Mina', icon: '🧲', speed: 150, gravity: 300, crater: 26, radius: 40, damage: 55, knock: 300, mine: true, trigger: 20, life: 60, ammo: 3 },
};
export const CRATE_WEAPONS = ['triple', 'grenade', 'homing', 'nuke', 'laser', 'mine'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Tanque ──────────────────────────────────────────────────────────────────
// `mode`: 'ship' (en la nave), 'chute' (en paracaídas) o 'tank' (manejando o volando).
export function newTank(x, y, mode = 'tank') {
  return {
    x, y, vx: 0, vy: 0, nx: 0, ny: -1, stuck: false, mode, hp: HP, dead: false,
    weapon: 'rocket', ammo: 0, shots: MAX_AMMO, reloadAt: 0, readyAt: 0, lastBy: null, lastHitAt: -99, treads: 0, side: 1, lastDir: 0,
  };
}

// ¿El círculo del tanque toca tierra?
export function overlaps(t, x, y, r = TANK_R) {
  const r2 = r * r;
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!solid(t, cx, cy)) continue;
      const dx = Math.max(cx - x, 0, x - cx - 1), dy = Math.max(cy - y, 0, y - cy - 1);
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
}

// Hacia dónde mira la superficie que hay cerca (la normal, hacia afuera), o null si no hay nada a `reach`.
export function surfaceNormal(t, x, y, reach = TANK_R + 2.5) {
  let sx = 0, sy = 0, n = 0;
  const r2 = reach * reach;
  for (let cy = Math.floor(y - reach); cy <= Math.floor(y + reach); cy++) {
    for (let cx = Math.floor(x - reach); cx <= Math.floor(x + reach); cx++) {
      if (!solid(t, cx, cy)) continue;
      const dx = x - (cx + 0.5), dy = y - (cy + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const w = 1 / Math.max(1, d2);
      sx += dx * w; sy += dy * w; n++;
    }
  }
  const len = Math.hypot(sx, sy);
  return n && len > 1e-6 ? { x: sx / len, y: sy / len } : null;
}

// Lo saca de adentro de la tierra empujándolo hacia afuera.
function pushOut(t, p) {
  for (let i = 0; i < 24 && overlaps(t, p.x, p.y); i++) {
    const n = surfaceNormal(t, p.x, p.y, TANK_R + 1) || { x: 0, y: -1 };
    p.x += n.x * 0.5;
    p.y += n.y * 0.5;
  }
}

// Un empujón (retroceso, explosión): si es fuerte, lo despega de la superficie.
export function push(p, vx, vy) {
  if (p.mode !== 'tank') return;
  if (p.stuck) {
    if (Math.hypot(vx, vy) < UNSTICK) return;
    p.stuck = false;
    p.vx = 0; p.vy = 0;
  }
  p.vx += vx;
  p.vy += vy;
}

// Un paso del tanque propio. `dir`: −1, 0 o 1 (A/D).
export function stepTank(p, dir, dt, t) {
  if (p.mode === 'ship') return;
  if (p.mode === 'chute') {
    p.vx += (dir * CHUTE_SIDE - p.vx) * Math.min(1, dt * 3);
    p.vy = Math.min(CHUTE_FALL, p.vy + GRAVITY * dt);
    if (moveFree(t, p, dt)) { p.mode = 'tank'; stick(t, p); }
    return;
  }
  if (p.stuck) {
    // Hacia qué lado se maneja: se decide al apretar (según la pantalla) y se mantiene mientras se
    // sostiene la tecla, así se puede dar toda la vuelta a un anillo sin trabarse en las esquinas.
    const tx = -p.ny, ty = p.nx; // tangente
    if (dir !== p.lastDir) p.side = Math.abs(tx) > 0.3 ? Math.sign(tx) : 1;
    p.lastDir = dir;
    const sp = dir * p.side * DRIVE;
    let step = sp * dt;
    while (Math.abs(step) > 1e-6) {
      const d = Math.sign(step) * Math.min(1, Math.abs(step));
      step -= d;
      const ox = p.x, oy = p.y;
      p.x += -p.ny * d;
      p.y += p.nx * d;
      // Se pega otra vez a la superficie: en una esquina de afuera la busca un poco más adentro.
      let n = surfaceNormal(t, p.x, p.y);
      for (let k = 0; !n && k < 4; k++) { p.x -= p.nx; p.y -= p.ny; n = surfaceNormal(t, p.x, p.y); }
      if (!n) { p.stuck = false; p.vx = -p.ny * sp; p.vy = p.nx * sp; break; }
      p.nx += (n.x - p.nx) * 0.35;
      p.ny += (n.y - p.ny) * 0.35;
      const len = Math.hypot(p.nx, p.ny) || 1;
      p.nx /= len; p.ny /= len;
      pushOut(t, p);
      // Mantiene la distancia justa: se acerca si quedó separado.
      for (let k = 0; k < 3 && !overlaps(t, p.x - p.nx * 0.6, p.y - p.ny * 0.6); k++) { p.x -= p.nx * 0.6; p.y -= p.ny * 0.6; }
      p.treads += Math.hypot(p.x - ox, p.y - oy);
    }
    if (p.stuck && !surfaceNormal(t, p.x, p.y)) p.stuck = false;
    return;
  }
  // Volando: gravedad y lo que traiga del empujón; se pega a lo primero que toca.
  p.vx *= 1 - Math.min(1, dt * 0.3);
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
  if (moveFree(t, p, dt)) stick(t, p);
  // Mientras vuela, el tanque se va enderezando.
  p.nx += (0 - p.nx) * Math.min(1, dt * 3);
  p.ny += (-1 - p.ny) * Math.min(1, dt * 3);
  const len = Math.hypot(p.nx, p.ny) || 1;
  p.nx /= len; p.ny /= len;
}

// Mueve sin pegarse, de a una casilla. Devuelve true si tocó algo (y queda justo afuera).
function moveFree(t, p, dt) {
  const dist = Math.hypot(p.vx, p.vy) * dt;
  const n = Math.max(1, Math.ceil(dist));
  for (let i = 0; i < n; i++) {
    const nx = p.x + (p.vx * dt) / n, ny = p.y + (p.vy * dt) / n;
    if (overlaps(t, nx, ny)) return true;
    p.x = nx; p.y = ny;
  }
  if (p.y > t.H + 80) p.y = t.H + 80;
  return false;
}

function stick(t, p) {
  const n = surfaceNormal(t, p.x, p.y);
  if (!n) return;
  p.stuck = true;
  p.vx = 0; p.vy = 0;
  p.nx = n.x; p.ny = n.y;
  pushOut(t, p);
}

// Punta del caño y centro de giro de la torreta.
export function turret(p) {
  return { x: p.x + p.nx * 2.5, y: p.y + p.ny * 2.5 };
}
export function muzzle(p, angle) {
  const c = turret(p);
  return { x: c.x + Math.cos(angle) * MUZZLE, y: c.y + Math.sin(angle) * MUZZLE };
}

// Cargador: cuántos cohetes hay ahora (se recargan de a uno).
export function reload(p, now) {
  if (p.shots >= MAX_AMMO) { p.reloadAt = now + RELOAD; return; }
  while (p.shots < MAX_AMMO && now >= p.reloadAt) { p.shots += 1; p.reloadAt += RELOAD; }
  if (p.shots >= MAX_AMMO) p.reloadAt = now + RELOAD;
}

// ─── La nave del principio ───────────────────────────────────────────────────
// Cruza el mapa de izquierda a derecha durante SHIP_TIME segundos desde que arranca la partida (que
// empieza con la cuenta regresiva, 5 s antes). Igual en todas las pantallas.
export function shipAt(s, W) {
  const f = clamp((s + 5) / (SHIP_TIME + 5), 0, 1);
  return { x: -60 + f * (W + 120), y: SHIP_Y + Math.sin(s * 1.5) * 4, gone: f >= 1 };
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
    for (const tk of targets) if (Math.hypot(tk.x - b.x, tk.y - b.y) < w.trigger) return boom(b);
    return null;
  }
  if (w.homing && targets.length && b.age > 0.25) {
    let best = null, bd = Infinity;
    for (const tk of targets) { const d = Math.hypot(tk.x - b.x, tk.y - b.y); if (d < bd) { bd = d; best = tk; } }
    const want = Math.atan2(best.y - b.y, best.x - b.x);
    const now = Math.atan2(b.vy, b.vx);
    let diff = want - now;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = clamp(diff, -3.2 * dt, 3.2 * dt);
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(now + turn) * sp;
    b.vy = Math.sin(now + turn) * sp;
  }
  if ((w.life && b.age > w.life) || (w.fuse && b.age > w.fuse)) return boom(b);
  b.vy += w.gravity * dt;
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / 1.5));
  for (let i = 0; i < n; i++) {
    const nx = b.x + (b.vx * dt) / n, ny = b.y + (b.vy * dt) / n;
    for (const tk of targets) {
      if (Math.hypot(nx - tk.x, ny - tk.y) < TANK_R + 1.5) { b.x = nx; b.y = ny; return boom(b); }
    }
    if (solid(t, nx, ny)) {
      if (w.mine) { b.stuck = true; b.age = 0; return null; }
      if (b.bounces > 0) {
        b.bounces -= 1;
        if (solid(t, nx, b.y)) b.vx *= -0.55; else b.vy *= -0.55;
        return null;
      }
      b.x = nx; b.y = ny;
      return boom(b);
    }
    b.x = nx; b.y = ny;
  }
  if (b.y > t.H + 60 || b.y < -300 || b.x < -200 || b.x > t.W + 200) { b.done = true; return null; }
  b.trail.push(b.x, b.y);
  if (b.trail.length > 20) b.trail.splice(0, 2);
  return null;
}

function boom(b) {
  b.done = true;
  return { x: b.x, y: b.y };
}

// Explosión que viaja por la red: { k, x, y, w, o }. Cuánto daño y empujón le hace a un tanque.
export function blastOn(p, ex) {
  const w = WEAPONS[ex.w] || WEAPONS.rocket;
  const d = Math.hypot(p.x - ex.x, p.y - ex.y);
  if (d >= w.radius) return null;
  const f = 1 - d / w.radius;
  const nx = d > 0.01 ? (p.x - ex.x) / d : 0;
  const ny = d > 0.01 ? (p.y - ex.y) / d : -1;
  return { damage: w.damage * (0.4 + 0.6 * f), vx: nx * w.knock * f, vy: ny * w.knock * f - 40 * f };
}

// ─── Monedas y cajas ─────────────────────────────────────────────────────────
export const MAX_COINS = 80;
export const CRATE_EVERY = 10;     // segundos entre cajas
export const MAX_CRATES = 40;

// Monedas en fila adentro de los anillos (como en el original) y algunas sueltas.
export function coinSpots(t, seed) {
  const rand = seeded(seed ^ 0x51ed);
  const list = [];
  for (const h of t.holes) {
    if (list.length >= MAX_COINS) break;
    if (rand() < 0.35) continue;
    const n = Math.min(6, Math.floor(h.w / 18));
    const y = h.y + h.h - 14;
    for (let i = 0; i < n && list.length < MAX_COINS; i++) list.push({ x: h.x + (h.w * (i + 0.5)) / n, y });
  }
  return list;
}

// La caja i: cuándo cae (segundos de partida), dónde y qué arma trae. Baja en paracaídas desde arriba.
export function crateInfo(i, seed, W) {
  const rand = seeded((seed ^ 0xc2a7e) + i * 7919);
  return { at: 14 + i * CRATE_EVERY, x: 140 + rand() * (W - 280), weapon: CRATE_WEAPONS[Math.floor(rand() * CRATE_WEAPONS.length)] };
}

