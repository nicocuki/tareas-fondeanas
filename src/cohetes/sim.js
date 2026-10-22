// Física de Cohete Royale, sin React ni red. Unidades: casillas del mapa (y crece hacia abajo) y segundos.
//
// Como en Rocket Bot Royale:
// - El tanque **se pega a cualquier superficie**: maneja por el piso, las paredes y los techos, y gira
//   con ella. D siempre lo lleva para el mismo lado *del tanque* (el de su derecha): arriba de un bloque
//   va para la derecha y, cabeza abajo en la parte de abajo, para la izquierda. Solo se despega cuando
//   lo empuja algo (el retroceso de un tiro, una explosión, el jetpack, un remolino).
// - Los cohetes van **derecho** (sin gravedad). Hay 3 y se recargan de a uno.
// - Al empezar hay dos helicópteros: uno sale de la izquierda y otro de la derecha, suben hasta el medio
//   y bajan hasta el otro lado. Cada uno salta cuando quiere y baja en paracaídas.
// - Inventario de 4 casillas (teclas 1 a 4): la 1 es el cohete, infinito; las otras se llenan con lo
//   que se agarra (cajas del mapa y las que caen en paracaídas).
import { TOP, seeded, solid, surfaceY } from './terrain.js';

export const STEP = 1 / 120;
export const TANK_R = 6.5;       // radio de choque del tanque (su centro es el medio del cuerpo)
export const GRAVITY = 210;
export const DRIVE = 52;         // velocidad manejando
export const MAX_FALL = 320;
export const CHUTE_FALL = 38;    // caída con paracaídas
export const CHUTE_SIDE = 50;
export const RECOIL = 95;        // empujón para atrás al disparar: así se mueve por el aire
export const KNOCK = 0.75;       // cuánto empujan las explosiones (sobre lo de cada arma)
export const UNSTICK = 45;       // un empujón más fuerte que esto lo despega de la superficie
export const HP = 100;
export const MUZZLE = 11;
export const MAX_AMMO = 3;       // cohetes en el cargador
export const RELOAD = 0.85;      // segundos por cohete que vuelve
export const SHOT_GAP = 0.16;    // entre tiro y tiro
export const KILL_CREDIT = 6;    // si te hundís hasta 6 s después de un golpe, la baja es del que te pegó
export const SHIP_TIME = 18;     // lo que tardan los helicópteros en cruzar el mapa
export const SHIP_LOW = TOP - 35; // altura de los helicópteros en las puntas
export const SHIP_RISE = 105;    // lo que suben hasta el medio
export const DEPLOY_AFTER = 1;   // segundos de partida antes de poder saltar
export const SLOTS = 4;          // casillas del inventario (la primera es el cohete)
export const LASER_CHARGE = 2;   // el láser carga 2 s antes de salir
export const SHIELD_TIME = 5;
export const SHIELD_R = 15;
export const JET_TIME = 1.5;
export const JET_ACCEL = 420;
export const HEAL = 30;          // la curita: +30 % de la vida

// Armas y objetos (los de la wiki de Rocket Bot Royale, más la curita). `kind`:
//   shot    dispara proyectiles     self    se usa encima (escudo, jetpack, curita)
//   charge  carga y después dispara (láser)    zone  deja un remolino delante
// En los proyectiles: `crater` radio del pozo, `radius` alcance del daño y del empujón, `damage` en el
// centro, `knock` empujón en el centro.
export const ITEMS = {
  rocket: { name: 'Cohete', icon: '🚀', kind: 'shot', speed: 290, gravity: 0, crater: 15, radius: 30, damage: 34, knock: 240, life: 2.4 },
  nuke: { name: 'Bomba nuclear', icon: '☢️', kind: 'shot', speed: 210, gravity: 60, crater: 44, radius: 88, damage: 96, knock: 420, life: 3.5, big: true },
  mine: { name: 'Mina', icon: '💣', kind: 'shot', speed: 160, gravity: 260, crater: 24, radius: 40, damage: 55, knock: 300, mine: true, trigger: 20, life: 45 },
  rapid: { name: 'Ráfaga', icon: '⏩', kind: 'shot', speed: 320, gravity: 0, crater: 8, radius: 18, damage: 15, knock: 120, life: 2, burst: 5, small: true },
  shield: { name: 'Escudo', icon: '🛡️', kind: 'self' },
  flak: { name: 'Metralla', icon: '💥', kind: 'shot', speed: 470, gravity: 0, crater: 6, radius: 16, damage: 17, knock: 150, life: 0.32, count: 7, spread: 0.09, small: true },
  grenade: { name: 'Granadas', icon: '🧨', kind: 'shot', speed: 230, gravity: 300, crater: 14, radius: 28, damage: 26, knock: 210, life: 6, count: 3, spread: 0.2, fuse: 0.35, ball: true },
  drill: { name: 'Taladro', icon: '🔩', kind: 'shot', speed: 210, gravity: 150, crater: 14, radius: 26, damage: 30, knock: 200, life: 4, drill: 130 },
  homing: { name: 'Teledirigido', icon: '🎯', kind: 'shot', speed: 190, gravity: 0, crater: 15, radius: 30, damage: 34, knock: 240, homing: true, life: 5 },
  whirl: { name: 'Remolino', icon: '🌪️', kind: 'zone', length: 95, width: 42, time: 4, push: 520 },
  jetpack: { name: 'Jetpack', icon: '🎒', kind: 'self' },
  poison: { name: 'Veneno', icon: '🧪', kind: 'shot', speed: 240, gravity: 300, crater: 0, radius: 0, damage: 0, knock: 0, life: 6, zone: 'poison', ball: true },
  laser: { name: 'Láser', icon: '⚡', kind: 'charge', speed: 3200, gravity: 0, crater: 6, radius: 15, damage: 34, knock: 200, life: 0.22 },
  smoke: { name: 'Humo', icon: '💨', kind: 'shot', speed: 250, gravity: 300, crater: 0, radius: 0, damage: 0, knock: 0, life: 6, zone: 'smoke', ball: true },
  heal: { name: 'Curita', icon: '✚', kind: 'self' },
};
export const ITEM_LIST = ['nuke', 'mine', 'rapid', 'shield', 'flak', 'grenade', 'drill', 'homing', 'whirl', 'jetpack', 'poison', 'laser', 'smoke', 'heal'];
// Zonas que quedan en el mapa: el veneno lastima a todos los que están adentro (también al que lo tiró).
export const ZONES = {
  poison: { radius: 46, time: 6, dps: 12 },
  smoke: { radius: 58, time: 5.6, dps: 0 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Inventario ──────────────────────────────────────────────────────────────
// `inv`: las casillas 2 a 4, cada una { w, n } o null. Agarrar algo que ya tenés suma uno; si no, va a
// la primera libre. Devuelve el inventario nuevo, o null si no hay lugar.
export function addItem(inv, w) {
  const same = inv.findIndex((s) => s?.w === w);
  if (same >= 0) return inv.map((s, i) => (i === same ? { w, n: s.n + 1 } : s));
  const free = inv.findIndex((s) => !s);
  if (free < 0) return null;
  return inv.map((s, i) => (i === free ? { w, n: 1 } : s));
}
// Gasta uno de la casilla `slot` (1 a 3 dentro de `inv`); si se termina, queda vacía.
export function useItem(inv, slot) {
  return inv.map((s, i) => (i === slot - 1 ? (s.n > 1 ? { w: s.w, n: s.n - 1 } : null) : s));
}

// ─── Tanque ──────────────────────────────────────────────────────────────────
// `mode`: 'ship' (en el helicóptero), 'chute' (en paracaídas) o 'tank' (manejando o volando).
export function newTank(x, y, mode = 'tank') {
  return {
    x, y, vx: 0, vy: 0, nx: 0, ny: -1, stuck: false, mode, hp: HP, dead: false,
    inv: [null, null, null], sel: 0, shots: MAX_AMMO, reloadAt: 0, readyAt: 0, lastBy: null, lastW: 'rocket', lastHitAt: -99, treads: 0,
    shieldUntil: 0, jetUntil: 0, jetA: 0, chargeUntil: 0, burst: 0, burstAt: 0,
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

// Una aceleración sostenida (jetpack, remolino): lo despega y lo empuja.
export function thrust(p, ax, ay, dt) {
  if (p.mode !== 'tank') return;
  if (p.stuck) { p.stuck = false; p.vx = 0; p.vy = 0; }
  p.vx += ax * dt;
  p.vy += ay * dt;
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
    // Siempre sobre la tangente con el mismo signo: D va para la derecha *del tanque*.
    const sp = dir * DRIVE;
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

// Jetpack: empuja para el lado contrario al que apunta; apuntando vertical, a un cuarto de la fuerza.
export function jetForce(angle) {
  const a = angle + Math.PI;
  const k = 1 - 0.75 * Math.abs(Math.sin(angle));
  return { x: Math.cos(a) * JET_ACCEL * k, y: Math.sin(a) * JET_ACCEL * k };
}

// ─── Los helicópteros del principio ──────────────────────────────────────────
// El 0 sale de la izquierda y el 1 de la derecha. Suben hasta el medio y bajan hasta el otro lado, donde
// quedan a la misma altura que al salir. Arrancan con la cuenta regresiva (5 s antes de la partida).
export function shipAt(s, W, k = 0) {
  const f = clamp((s + 5) / (SHIP_TIME + 5), 0, 1);
  const span = W + 120;
  const x = k === 0 ? -60 + f * span : W + 60 - f * span;
  const y = SHIP_LOW - Math.sin(f * Math.PI) * SHIP_RISE + Math.sin(s * 1.5 + k) * 3;
  return { x, y, dir: k === 0 ? 1 : -1, f, gone: f >= 1 };
}
// En cuál va cada uno: se reparten de a uno.
export const shipFor = (order, id) => Math.max(0, order.indexOf(id)) % 2;

// ─── Tiros ───────────────────────────────────────────────────────────────────
// Un disparo viaja como { k, t, x, y, a, w } y cada pantalla arma sus proyectiles igual.
export function projectilesFor(shot, owner) {
  const w = ITEMS[shot.w] || ITEMS.rocket;
  if (w.kind === 'zone' || w.kind === 'self') return [];
  const count = w.count || 1;
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = shot.a + (count > 1 ? (i - (count - 1) / 2) * w.spread : 0);
    list.push({
      k: `${shot.k}.${i}`, owner, w: shot.w, x: shot.x, y: shot.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      age: 0, stuck: false, done: false, trail: [], dug: 0, lastDig: 0, tunnels: [], reflectedBy: null,
    });
  }
  return list;
}

// El remolino que deja un disparo de remolino: una franja delante del tanque, en la dirección del tiro.
export function zoneFromShot(shot) {
  const w = ITEMS.whirl;
  return { kind: 'whirl', k: shot.k, x: shot.x + Math.cos(shot.a) * (w.length / 2), y: shot.y + Math.sin(shot.a) * (w.length / 2), a: shot.a, until: shot.t + w.time, o: null };
}
// ¿(x, y) está adentro del remolino?
export function inWhirl(z, x, y) {
  const w = ITEMS.whirl;
  const dx = x - z.x, dy = y - z.y;
  const along = dx * Math.cos(z.a) + dy * Math.sin(z.a);
  const across = -dx * Math.sin(z.a) + dy * Math.cos(z.a);
  return Math.abs(along) < w.length / 2 && Math.abs(across) < w.width / 2;
}

// Un paso de un proyectil. `targets`: tanques a los que puede pegarle [{ id, x, y, shield }]. Un escudo
// lo devuelve (y desde ahí es del dueño del escudo). Devuelve { x, y } si explotó. El taladro deja en
// `b.tunnels` los puntos por donde cavó.
export function stepProjectile(b, dt, t, targets = []) {
  const w = ITEMS[b.w] || ITEMS.rocket;
  b.age += dt;
  if (b.stuck) {
    if (w.mine) {
      // Mina apoyada: explota si alguien se acerca, o al final de su vida.
      if (b.age > w.life) return boom(b);
      for (const tk of targets) if (Math.hypot(tk.x - b.x, tk.y - b.y) < w.trigger) return boom(b);
      return null;
    }
    // Granada que ya tocó algo: explota al ratito.
    return b.age >= b.fuseAt ? boom(b) : null;
  }
  if (w.homing && targets.length && b.age > 0.3) {
    let best = null, bd = Infinity;
    for (const tk of targets) { const d = Math.hypot(tk.x - b.x, tk.y - b.y); if (d < bd) { bd = d; best = tk; } }
    if (bd < 260) {
      const want = Math.atan2(best.y - b.y, best.x - b.x);
      const now = Math.atan2(b.vy, b.vx);
      let diff = want - now;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = clamp(diff, -3.4 * dt, 3.4 * dt);
      // Cuando ya encontró a quién perseguir, acelera.
      const sp = Math.min(380, Math.hypot(b.vx, b.vy) + 160 * dt);
      b.vx = Math.cos(now + turn) * sp;
      b.vy = Math.sin(now + turn) * sp;
    }
  }
  if (b.age > w.life) return boom(b);
  b.vy += w.gravity * dt;
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / 1.5));
  for (let i = 0; i < n; i++) {
    const nx = b.x + (b.vx * dt) / n, ny = b.y + (b.vy * dt) / n;
    for (const tk of targets) {
      const d = Math.hypot(nx - tk.x, ny - tk.y);
      if (tk.shield && d < SHIELD_R && !b.reflectedBy) {
        // El escudo lo devuelve por donde vino.
        b.vx = -b.vx; b.vy = -b.vy; b.reflectedBy = tk.id; b.owner = tk.id;
        return null;
      }
      if (d < TANK_R + 1.5 && tk.id !== b.reflectedBy) {
        b.x = nx; b.y = ny;
        if (w.fuse) { b.stuck = true; b.fuseAt = b.age + w.fuse; return null; }
        return boom(b);
      }
    }
    if (solid(t, nx, ny)) {
      if (w.drill && b.dug < w.drill) {
        // El taladro atraviesa la tierra y deja un túnel.
        b.dug += Math.hypot(nx - b.x, ny - b.y);
        if (b.dug - b.lastDig >= 7) { b.lastDig = b.dug; b.tunnels.push({ x: nx, y: ny }); }
        b.x = nx; b.y = ny;
        continue;
      }
      if (w.mine) { b.stuck = true; b.age = 0; return null; }
      if (w.fuse) { b.stuck = true; b.fuseAt = b.age + w.fuse; return null; }
      b.x = nx; b.y = ny;
      return boom(b);
    }
    if (w.drill && b.dug > 0) return boom(b); // salió del otro lado: explota
    b.x = nx; b.y = ny;
  }
  if (b.y > t.H + 60 || b.y < -400 || b.x < -200 || b.x > t.W + 200) { b.done = true; return null; }
  b.trail.push(b.x, b.y);
  if (b.trail.length > (b.w === 'laser' ? 60 : 20)) b.trail.splice(0, 2);
  return null;
}

function boom(b) {
  b.done = true;
  return { x: b.x, y: b.y };
}

// Explosión que viaja por la red: { k, x, y, w, o }. Cuánto daño y empujón le hace a un tanque.
export function blastOn(p, ex) {
  const w = ITEMS[ex.w] || ITEMS.rocket;
  if (!w.radius) return null;
  const d = Math.hypot(p.x - ex.x, p.y - ex.y);
  if (d >= w.radius) return null;
  const f = 1 - d / w.radius;
  const nx = d > 0.01 ? (p.x - ex.x) / d : 0;
  const ny = d > 0.01 ? (p.y - ex.y) / d : -1;
  return { damage: w.damage * (0.4 + 0.6 * f), vx: nx * w.knock * f * KNOCK, vy: (ny * w.knock * f - 40 * f) * KNOCK };
}

// ─── Monedas y cajas ─────────────────────────────────────────────────────────
export const MAX_COINS = 80;
export const CRATE_EVERY = 10;     // segundos entre cajas que caen en paracaídas
export const MAX_DROPS = 40;       // cajas que caen (índices 0 a 39)
export const MAP_ITEMS = 24;       // cajas que ya están en el mapa (índices 40 a 63)
export const MAX_CRATES = MAX_DROPS + MAP_ITEMS;

// Monedas en fila adentro de los huecos (como en el original), solo donde hay aire.
export function coinSpots(t, seed) {
  const rand = seeded(seed ^ 0x51ed);
  const list = [];
  for (const h of t.holes) {
    if (list.length >= MAX_COINS) break;
    if (rand() < 0.35 || h.w < 20) continue;
    const n = Math.min(6, Math.floor(h.w / 18));
    const y = h.y + h.h - 14;
    for (let i = 0; i < n && list.length < MAX_COINS; i++) {
      const c = { x: h.x + (h.w * (i + 0.5)) / n, y };
      if (!solid(t, c.x, c.y) && !solid(t, c.x, c.y - 4)) list.push(c);
    }
  }
  return list;
}

// La caja que cae i: cuándo (segundos de partida), dónde y qué trae. Baja en paracaídas desde arriba.
export function crateInfo(i, seed, W) {
  const rand = seeded((seed ^ 0xc2a7e) + i * 7919);
  return { at: 14 + i * CRATE_EVERY, x: 140 + rand() * (W - 280), weapon: ITEM_LIST[Math.floor(rand() * ITEM_LIST.length)] };
}

// Las cajas que ya están en el mapa al empezar: apoyadas arriba de alguna forma.
export function mapItems(t, seed) {
  const rand = seeded(seed ^ 0x17e5);
  const list = [];
  for (let tries = 0; list.length < MAP_ITEMS && tries < MAP_ITEMS * 20; tries++) {
    const x = 130 + rand() * (t.W - 260);
    const from = Math.floor(TOP - 10 + rand() * 300);
    const y = surfaceY(t, x, from);
    // Si arrancó adentro de una forma no es una superficie: tiene que haber aire arriba.
    if (y <= from || y >= t.H - 70 || solid(t, x, y - 1) || solid(t, x, y - 12)) continue;
    if (list.some((c) => Math.hypot(c.x - x, c.y - y) < 60)) continue;
    list.push({ i: MAX_DROPS + list.length, x, y, weapon: ITEM_LIST[Math.floor(rand() * ITEM_LIST.length)] });
  }
  return list;
}
