// Royale 3D: armas con rarezas, botín, movimiento (piso, caída libre, planeador), tiros, explosiones y construcción.
// Lógica pura (sin React, sin red, sin Three.js): todo lo que necesita entra por parámetro, así se prueba con
// valores fijos y todas las pantallas simulan lo mismo. Sin `Math.random()`.
import { DROP_BASE, STEP_H, WADE_MIN, chestOf, rng } from './map.js';

export const STEP = 1 / 60;
export const PLAYER_R = 0.45;
export const PLAYER_H = 1.8;
export const EYE_H = 1.55;
export const HEAD_Y = 1.38;       // por encima de esto (desde los pies) es la cabeza
export const MAX_HP = 100;
export const MAX_SHIELD = 100;
export const WALK = 5.6;
export const SPRINT = 8.4;
export const JUMP_V = 7.4;
export const GRAVITY = 22;
export const SLOTS = 5;           // el 0 es siempre el pico; del 1 al 4, las armas
export const COUNTDOWN_MS = 15000; // la isla de espera: se camina y se prueba la pistola antes de subir al bus

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Rarezas ─────────────────────────────────────────────────────────────────
// Mejoran el daño, la cadencia, el cargador y la recarga de cada arma.
export const RARITIES = [
  { name: 'Común', color: '#c9ccd6', dmg: 1, rate: 1, mag: 1, reload: 1 },
  { name: 'Poco común', color: '#5ed36b', dmg: 1.06, rate: 1.04, mag: 1.1, reload: 0.94 },
  { name: 'Rara', color: '#4aa0ff', dmg: 1.12, rate: 1.08, mag: 1.2, reload: 0.88 },
  { name: 'Épica', color: '#c46bff', dmg: 1.19, rate: 1.12, mag: 1.3, reload: 0.82 },
  { name: 'Legendaria', color: '#ffb83d', dmg: 1.27, rate: 1.17, mag: 1.4, reload: 0.76 },
];

// ─── Armas ───────────────────────────────────────────────────────────────────
// dmg por bala (o por perdigón), rate = segundos entre tiros, mag = balas por cargador, spread en radianes,
// range en metros, hs = multiplicador de la cabeza. `look` = qué tan cerca se acerca la cámara al apuntar.
export const WEAPONS = {
  pickaxe: { name: 'Pico', dmg: 22, solid: 30, pellets: 1, rate: 0.44, mag: 1, reload: 0, spread: 0, range: 3.4, auto: true, melee: true, hs: 1 },
  pistol: { name: 'Pistola', dmg: 20, pellets: 1, rate: 0.22, mag: 14, reload: 1.3, spread: 0.012, range: 130, auto: false, hs: 1.8, kick: 0.012 },
  revolver: { name: 'Revólver', dmg: 46, pellets: 1, rate: 0.62, mag: 6, reload: 2.1, spread: 0.006, range: 150, auto: false, hs: 2, kick: 0.035 },
  smg: { name: 'Metralleta', dmg: 10, pellets: 1, rate: 0.072, mag: 32, reload: 1.7, spread: 0.04, range: 90, auto: true, hs: 1.6, kick: 0.007 },
  shotgun: { name: 'Escopeta', dmg: 12, pellets: 9, rate: 0.9, mag: 5, reload: 2.5, spread: 0.07, range: 45, auto: false, hs: 1.4, kick: 0.05, falloff: 10 },
  rifle: { name: 'Fusil de asalto', dmg: 20, pellets: 1, rate: 0.115, mag: 30, reload: 2.2, spread: 0.018, range: 170, auto: true, hs: 1.8, kick: 0.01 },
  burst: { name: 'Fusil de ráfaga', dmg: 24, pellets: 1, rate: 0.5, burst: 3, burstGap: 0.065, mag: 30, reload: 2.1, spread: 0.012, range: 180, auto: true, hs: 1.9, kick: 0.012 },
  sniper: { name: 'Francotirador', dmg: 95, pellets: 1, rate: 1.4, mag: 4, reload: 3, spread: 0.0008, range: 420, auto: false, hs: 2.4, kick: 0.07, zoom: 2.6, scope: true, minR: 2 },
  bazooka: { name: 'Bazooka', dmg: 0, pellets: 1, rate: 1.8, mag: 1, reload: 3.3, spread: 0.006, range: 220, auto: false, hs: 1, kick: 0.05, rocket: true, speed: 46, blast: 'rocket', minR: 2 },
  launcher: { name: 'Lanzagranadas', dmg: 0, pellets: 1, rate: 0.7, mag: 6, reload: 3.2, spread: 0.01, range: 160, auto: false, hs: 1, kick: 0.03, grenade: true, speed: 24, blast: 'launcher', minR: 1 },
  minigun: { name: 'Minigun', dmg: 7, pellets: 1, rate: 0.045, mag: 120, reload: 4.8, spread: 0.055, range: 110, auto: true, hs: 1.4, kick: 0.004, heavy: true, minR: 3 },
};
export const WEAPON_LIST = Object.keys(WEAPONS).filter((k) => !WEAPONS[k].melee);
export const isWeapon = (kind) => Boolean(WEAPONS[kind]);

// Las estadísticas reales de un arma (la base mejorada por su rareza).
export function statsOf(item) {
  const b = WEAPONS[item.w], r = RARITIES[item.r || 0];
  return {
    ...b, dmg: b.dmg * r.dmg, rate: b.rate / r.rate, mag: Math.max(1, Math.round(b.mag * (b.mag > 1 ? r.mag : 1))), reload: b.reload * r.reload,
    burstGap: b.burstGap ? b.burstGap / r.rate : 0,
  };
}
export const magOf = (item) => statsOf(item).mag;

// Explosiones: r = radio en metros, dmg al jugador (más fuerte en el centro), solid = daño a lo que se rompe.
export const BLASTS = {
  rocket: { r: 6, dmg: 105, solid: 300, knock: 14 },
  grenade: { r: 5.5, dmg: 85, solid: 260, knock: 12 },
  launcher: { r: 4.6, dmg: 60, solid: 200, knock: 10 },
};
export const GRENADE_FUSE = 2.1;
export const LAUNCHER_FUSE = 1.5;
export const GRENADE_GAP = 0.7;

// Consumibles: se usan con una tecla y tardan un rato en hacer efecto (si te pegan, se corta).
export const ITEMS = {
  bandage: { name: 'Vendas', key: 'Q', cast: 1.2, max: 15, heal: 15, icon: '🩹' },
  medkit: { name: 'Botiquín', key: 'F', cast: 3.2, max: 5, heal: 70, icon: '🧰' },
  shield: { name: 'Escudo chico', key: 'H', cast: 1.8, max: 6, shield: 25, icon: '🧪' },
  bigshield: { name: 'Escudo grande', key: 'J', cast: 3.2, max: 3, shield: 60, icon: '💙' },
  grenade: { name: 'Granada', key: 'G', max: 8, icon: '💣' },
};
export const ITEM_LIST = Object.keys(ITEMS);

// ─── El jugador ──────────────────────────────────────────────────────────────
export function newPlayer(x, y, z, yaw = 0) {
  return {
    x, y, z, vy: 0, yaw, pitch: 0, hp: MAX_HP, shield: 0, dead: false, mode: 'ground', grounded: true, moving: false, sprinting: false,
    inv: [{ w: 'pickaxe', r: 0, mag: 1 }, null, null, null, null], sel: 0, wood: 0, build: null, lvl: 0, knock: { x: 0, y: 0, z: 0 },
    items: { bandage: 0, medkit: 0, shield: 0, bigshield: 0, grenade: 0 },
    nextShot: 0, reloadUntil: 0, burstLeft: 0, burstAt: 0, cast: null, grenadeAt: 0, buildAt: 0,
    lastBy: null, lastW: null, lastHitAt: 0, hurtUntil: 0, walked: 0, vx: 0, vz: 0, glide: false, aboard: false,
  };
}
export const held = (p) => p.inv[p.sel];

// Daño: primero se gasta el escudo. Si te pegan, se corta lo que estabas usando.
export function hurt(p, amount, by, weapon, now) {
  let left = amount;
  if (p.shield > 0) {
    const used = Math.min(p.shield, left);
    p.shield -= used;
    left -= used;
  }
  p.hp -= left;
  p.cast = null;
  if (by) { p.lastBy = by; p.lastW = weapon; p.lastHitAt = now; }
  p.hurtUntil = now + 0.15;
}

export function startReload(p, now) {
  const gun = held(p);
  if (!gun || p.reloadUntil || WEAPONS[gun.w].melee || gun.mag >= magOf(gun)) return false;
  p.reloadUntil = now + statsOf(gun).reload;
  p.burstLeft = 0;
  return true;
}
export function finishReload(p, now) {
  if (!p.reloadUntil || now < p.reloadUntil) return false;
  const gun = held(p);
  if (gun) gun.mag = magOf(gun);
  p.reloadUntil = 0;
  return true;
}
export function selectSlot(p, slot) {
  if (slot === p.sel || !p.inv[slot]) return false;
  p.sel = slot;
  p.reloadUntil = 0; // cambiar de arma corta la recarga
  p.burstLeft = 0;
  p.build = null;
  return true;
}

// Empieza a usar un consumible. Devuelve false si no hay o no hace falta.
export function startCast(p, kind, now) {
  const it = ITEMS[kind];
  if (!it?.cast || p.cast || p.items[kind] <= 0) return false;
  if (it.heal && p.hp >= MAX_HP) return false;
  if (it.shield && p.shield >= MAX_SHIELD) return false;
  p.cast = { kind, from: now, until: now + it.cast };
  return true;
}
export function finishCast(p, now) {
  if (!p.cast || now < p.cast.until) return null;
  const kind = p.cast.kind, it = ITEMS[kind];
  p.cast = null;
  p.items[kind] -= 1;
  if (it.heal) p.hp = Math.min(MAX_HP, p.hp + it.heal);
  if (it.shield) p.shield = Math.min(MAX_SHIELD, p.shield + it.shield);
  return kind;
}

// ─── Piso, choques y movimiento ──────────────────────────────────────────────
const tmp = [];

// Altura de la rampa `s` en (x, z), o null si el punto queda afuera.
export function rampY(s, x, z) {
  if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) return null;
  const t = s.dir === 0 ? (x - s.x0) / (s.x1 - s.x0) : s.dir === 2 ? (s.x1 - x) / (s.x1 - s.x0) : s.dir === 1 ? (z - s.z0) / (s.z1 - s.z0) : (s.z1 - z) / (s.z1 - s.z0);
  return s.y0 + clamp(t, 0, 1) * s.rise;
}

// El piso bajo (x, z): el terreno o lo más alto que se pueda pisar desde `yFeet` (un escalón de STEP_H).
export function floorAt(w, x, z, yFeet, r = 0.32) {
  let best = w.height(x, z);
  w.near(x - r, z - r, x + r, z + r, tmp);
  const lim = yFeet + STEP_H + 0.02;
  for (const s of tmp) {
    let top;
    if (s.k === 'ramp') { top = rampY(s, x, z); if (top === null) continue; } else if (s.k === 'cyl') {
      if ((x - s.cx) ** 2 + (z - s.cz) ** 2 > (s.r + r) ** 2) continue;
      top = s.y1;
    } else {
      if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
      top = s.y1;
    }
    if (top <= lim && top > best) best = top;
  }
  return best;
}

// ¿Un cuerpo de radio `r` en (x, z) toca el sólido `s` (en planta)?
function overlaps(s, x, z, r) {
  if (s.k === 'cyl') return (x - s.cx) ** 2 + (z - s.cz) ** 2 < (s.r + r) ** 2;
  const nx = clamp(x, s.x0, s.x1), nz = clamp(z, s.z0, s.z1);
  return (x - nx) ** 2 + (z - nz) ** 2 < r * r;
}

// ¿Algo sólido frena a un jugador parado con los pies en `y` si se mueve a (x, z)? Lo que ya lo tocaba antes no cuenta
// (así se puede salir de una pared que apareció encima).
export function blockedAt(w, x, z, y, fromX, fromZ) {
  w.near(x - PLAYER_R, z - PLAYER_R, x + PLAYER_R, z + PLAYER_R, tmp);
  for (const s of tmp) {
    if (s.y1 <= y + STEP_H || s.y0 >= y + PLAYER_H) {
      if (s.k !== 'ramp' || s.y0 >= y + PLAYER_H) continue;
    }
    if (s.k === 'ramp') {
      const top = rampY(s, x, z);
      if (top !== null && top > y + STEP_H + 0.02 && s.y0 < y + PLAYER_H) {
        const here = rampY(s, fromX, fromZ);
        if (here === null || top > here) return true;
      }
      continue;
    }
    if (overlaps(s, x, z, PLAYER_R) && !overlaps(s, fromX, fromZ, PLAYER_R)) return true;
  }
  return false;
}

const inWorld = (w, x, z) => x * x + z * z <= w.worldR * w.worldR;

// Intenta mover en x y en z por separado (así se desliza por las paredes). Devuelve true si se movió.
function slide(p, dx, dz, w, ignoreWater = false) {
  let moved = false;
  for (const [mx, mz] of [[dx, 0], [0, dz]]) {
    if (!mx && !mz) continue;
    const nx = p.x + mx, nz = p.z + mz;
    if (!inWorld(w, nx, nz)) continue;
    if (!ignoreWater && w.height(nx, nz) < WADE_MIN && p.grounded) continue;
    if (blockedAt(w, nx, nz, p.y, p.x, p.z)) continue;
    p.x = nx; p.z = nz; moved = true;
  }
  return moved;
}

// Dirección en el mundo de las teclas: adelante es (-sin yaw, -cos yaw), como una cámara de Three.js con rotation.y = yaw.
function wishDir(p, input) {
  const fwd = (input.f ? 1 : 0) - (input.b ? 1 : 0), side = (input.r ? 1 : 0) - (input.l ? 1 : 0);
  if (!fwd && !side) return null;
  const len = Math.hypot(fwd, side), sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  return { x: (-sy * fwd + cy * side) / len, z: (-cy * fwd - sy * side) / len, fwd };
}

// Un paso de movimiento a pie. `input`: { f, b, l, r, jump, sprint }.
export function stepGround(p, input, dt, w) {
  const dir = wishDir(p, input);
  p.moving = Boolean(dir);
  const shallow = w.height(p.x, p.z) < 0.15;
  let speed = (input.sprint && dir?.fwd > 0 && !p.cast ? SPRINT : WALK) * (shallow ? 0.7 : 1) * (p.cast ? 0.55 : 1) * (held(p)?.w === 'minigun' && input.fire ? 0.55 : 1);
  p.sprinting = speed >= SPRINT - 0.01;
  if (p.reloadUntil) speed *= 0.93;
  const air = p.grounded ? 1 : 0.75;
  const x0 = p.x, z0 = p.z;
  slide(p, ((dir?.x || 0) * speed * air + p.knock.x) * dt, ((dir?.z || 0) * speed * air + p.knock.z) * dt, w);
  const decay = Math.exp(-6 * dt);
  p.knock.x *= decay; p.knock.z *= decay;
  if (Math.abs(p.knock.x) < 0.05) p.knock.x = 0;
  if (Math.abs(p.knock.z) < 0.05) p.knock.z = 0;
  p.walked += Math.hypot(p.x - x0, p.z - z0);
  if (input.jump && p.grounded) { p.vy = JUMP_V; p.grounded = false; }
  const yPrev = p.y;
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt + p.knock.y * dt;
  p.knock.y *= decay;
  const floor = floorAt(w, p.x, p.z, Math.max(p.y, yPrev));
  if (p.y <= floor + 1e-6 && p.vy <= 0.5) { p.y = floor; p.vy = 0; p.grounded = true; } else if (p.grounded && p.y - floor < 0.35 && p.vy <= 0) { p.y = floor; p.vy = 0; } else p.grounded = false;
}

// ─── Bus, caída libre y planeador ────────────────────────────────────────────
export const FALL_V = 40;       // m/s de caída libre
export const FALL_H = 17;       // m/s de avance horizontal en caída
export const DIVE_H = 27;       // con W: en picada
export const GLIDE_V = 7;
export const GLIDE_H = 15;
export const GLIDE_AT = 75;     // a esta altura sobre el piso se abre el planeador solo
export function boardBus(p, bus) {
  p.mode = 'bus'; p.aboard = true; p.glide = false; p.grounded = false;
  p.x = bus.x; p.y = bus.y; p.z = bus.z; p.vy = 0; p.vx = 0; p.vz = 0;
}
export function jumpOff(p, bus, route) {
  p.mode = 'fall'; p.aboard = false; p.glide = false;
  p.x = bus.x; p.y = bus.y - 1; p.z = bus.z;
  p.vx = route.dx * 18; p.vz = route.dz * 18; p.vy = -4;
}
export function openGlider(p) {
  if (p.mode !== 'fall') return false;
  p.mode = 'glide'; p.glide = true;
  return true;
}
// Un lugar libre cerca del punto (por si aterrizás en el mar).
export function landSpot(w, x, z) {
  let px = x, pz = z;
  for (let i = 0; i < 40 && w.height(px, pz) < 0.2; i++) { px *= 0.96; pz *= 0.96; }
  return { x: px, z: pz };
}
// Avanza en el aire. Devuelve 'landed' al llegar al piso.
export function stepAir(p, input, dt, w) {
  const dir = wishDir(p, input);
  const gl = p.mode === 'glide';
  const sp = gl ? GLIDE_H : dir?.fwd > 0 && !gl ? DIVE_H : FALL_H;
  const tx = (dir ? dir.x * sp : 0) + (gl ? 0 : p.vx), tz = (dir ? dir.z * sp : 0) + (gl ? 0 : p.vz);
  const f = Math.min(1, dt * 2.2);
  p.knock.x += (tx - p.knock.x) * f; p.knock.z += (tz - p.knock.z) * f;
  slide(p, p.knock.x * dt, p.knock.z * dt, w, true);
  p.vx *= Math.exp(-0.5 * dt); p.vz *= Math.exp(-0.5 * dt);
  const targetV = gl ? -GLIDE_V : dir?.fwd > 0 ? -(FALL_V + 6) : -FALL_V;
  p.vy += (targetV - p.vy) * Math.min(1, dt * (gl ? 2.5 : 1.6));
  const yPrev = p.y;
  p.y += p.vy * dt;
  const floor = floorAt(w, p.x, p.z, Math.max(p.y, yPrev));
  if (p.mode === 'fall' && p.y - floor <= GLIDE_AT) { p.mode = 'glide'; p.glide = true; }
  if (p.y > floor) return null;
  const spot = landSpot(w, p.x, p.z);
  p.x = spot.x; p.z = spot.z;
  p.y = floorAt(w, p.x, p.z, p.y + 3);
  p.mode = 'ground'; p.glide = false; p.grounded = true; p.vy = 0; p.knock.x = 0; p.knock.z = 0; p.vx = 0; p.vz = 0;
  return 'landed';
}

// ─── Rayos: terreno, sólidos y jugadores ─────────────────────────────────────
// Distancia a la que un rayo (origen `o`, dirección unitaria `d`) pega contra una caja o un cilindro; null si no.
function rayBox(o, d, s, max) {
  let t0 = 0, t1 = max;
  const slab = (oo, dd, lo, hi) => {
    if (Math.abs(dd) < 1e-9) return oo >= lo && oo <= hi;
    let a = (lo - oo) / dd, b = (hi - oo) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(o.x, d.x, s.x0, s.x1) || !slab(o.y, d.y, s.y0, s.y1) || !slab(o.z, d.z, s.z0, s.z1)) return null;
  return t0;
}
function rayCyl(o, d, s, max) {
  const a = d.x * d.x + d.z * d.z;
  let t0, t1;
  if (a < 1e-9) { if ((o.x - s.cx) ** 2 + (o.z - s.cz) ** 2 > s.r * s.r) return null; t0 = 0; t1 = max; } else {
    const ox = o.x - s.cx, oz = o.z - s.cz;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - s.r * s.r;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    t0 = (-b - sq) / a; t1 = (-b + sq) / a;
    if (t1 < 0 || t0 > max) return null;
  }
  t0 = Math.max(0, t0);
  // Entre las alturas del cilindro.
  let lo = t0, hi = Math.min(t1, max);
  if (Math.abs(d.y) < 1e-9) { if (o.y < s.y0 || o.y > s.y1) return null; } else {
    let ya = (s.y0 - o.y) / d.y, yb = (s.y1 - o.y) / d.y;
    if (ya > yb) [ya, yb] = [yb, ya];
    lo = Math.max(lo, ya); hi = Math.min(hi, yb);
  }
  return lo <= hi ? lo : null;
}

const along = [];
// El primer choque del rayo: { dist, s (el sólido, o null si es el terreno), ground }. `skip` = ids de sólidos que se ignoran.
export function rayCast(w, o, d, max = 200) {
  let best = max, solid = null, ground = false;
  // Sólidos de las celdas por donde pasa.
  const seen = new Set();
  const steps = Math.max(1, Math.ceil(max / 5));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * max, x = o.x + d.x * t, z = o.z + d.z * t;
    w.near(x - 5, z - 5, x + 5, z + 5, along);
    for (const s of along) {
      if (seen.has(s)) continue;
      seen.add(s);
      let dist = null;
      if (s.k === 'cyl') dist = rayCyl(o, d, s, best);
      else if (s.k === 'box') dist = rayBox(o, d, s, best);
      else dist = rayBox(o, d, { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, y0: s.y0, y1: s.y1 }, best); // la rampa, como su caja (un poco de más)
      if (dist !== null && dist < best) { best = dist; solid = s; }
    }
  }
  // Terreno: se camina de a 1 m y se afina.
  let prev = 0;
  for (let t = 0.5; t <= best; t += 1) {
    if (o.y + d.y * t < w.height(o.x + d.x * t, o.z + d.z * t)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (o.y + d.y * m < w.height(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
      best = lo; solid = null; ground = true;
      break;
    }
    prev = t;
  }
  return { dist: best, s: solid, ground };
}
export const rayLength = (w, o, d, max = 200) => rayCast(w, o, d, max).dist;

export const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
// Hacia dónde mira la cámara (yaw y pitch), como vector.
export const lookDir = (yaw, pitch) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
export const eyeOf = (p) => ({ x: p.x, y: p.y + EYE_H, z: p.z });

// Cámara por encima del hombro: detrás y arriba del jugador, y nunca adentro del terreno ni de una pared.
export function cameraFor(w, p, { dist = 3.7, shoulder = 0.7, aim = false } = {}) {
  const dir = lookDir(p.yaw, p.pitch);
  const eye = eyeOf(p);
  const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  const sh = aim ? shoulder * 0.8 : shoulder;
  const base = { x: eye.x + right.x * sh, y: eye.y + 0.25, z: eye.z + right.z * sh };
  const back = unit({ x: -dir.x, y: -dir.y, z: -dir.z });
  const d = aim ? dist * 0.55 : dist;
  const hit = rayCast(w, base, back, d + 0.4).dist - 0.4;
  const len = clamp(hit, 0.3, d);
  const pos = { x: base.x + back.x * len, y: base.y + back.y * len, z: base.z + back.z * len };
  const ground = w.height(pos.x, pos.z) + 0.35;
  if (pos.y < ground) pos.y = ground;
  return { pos, dir };
}

// El tiro sale del ojo hacia donde apunta la mira de la cámara (así la mira no miente aunque el personaje tape el centro).
export function aimPoint(w, p, camOpts) {
  const { pos, dir } = cameraFor(w, p, camOpts);
  const start = { x: pos.x + dir.x * 3.6, y: pos.y + dir.y * 3.6, z: pos.z + dir.z * 3.6 };
  const len = rayLength(w, start, dir, 300);
  return { point: { x: start.x + dir.x * len, y: start.y + dir.y * len, z: start.z + dir.z * len }, dist: len, cam: pos };
}
export function aimShot(w, p, camOpts) {
  const eye = eyeOf(p);
  const { point } = aimPoint(w, p, camOpts);
  return { o: eye, d: unit({ x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z }) };
}

// ¿A qué jugador le da el rayo? `targets`: [{ id, x, y, z }] (los pies). El cuerpo es un cilindro y la cabeza, una esfera.
export function rayPlayers(o, d, targets, max) {
  let best = null;
  for (const t of targets) {
    const ox = o.x - t.x, oz = o.z - t.z;
    const a = d.x * d.x + d.z * d.z;
    let t0 = 0, t1 = max;
    if (a > 1e-9) {
      const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - 0.5 * 0.5;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      t0 = Math.max(0, (-b - sq) / a); t1 = Math.min(max, (-b + sq) / a);
      if (t0 > t1) continue;
    } else if (ox * ox + oz * oz > 0.25) continue;
    // Altura del cuerpo.
    let lo = t0, hi = t1;
    if (Math.abs(d.y) > 1e-9) {
      let ya = (t.y - o.y) / d.y, yb = (t.y + PLAYER_H + 0.08 - o.y) / d.y;
      if (ya > yb) [ya, yb] = [yb, ya];
      lo = Math.max(lo, ya); hi = Math.min(hi, yb);
    } else if (o.y < t.y || o.y > t.y + PLAYER_H) continue;
    if (lo > hi) continue;
    const dist = lo;
    const y = o.y + d.y * dist - t.y;
    if (!best || dist < best.dist) best = { id: t.id, dist, head: y > HEAD_Y, y };
  }
  return best;
}

// ─── Disparo ─────────────────────────────────────────────────────────────────
// Un disparo viaja en la foto como { k, t, w, r, o, d, sd, l, h, s }; cada pantalla arma los mismos perdigones con la semilla `sd`.
export function pelletDirs(d, count, spread, sd) {
  const rand = rng(sd | 0);
  if (count === 1 && !spread) return [d];
  // Dos ejes perpendiculares a `d` para abrir el abanico.
  const up = Math.abs(d.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = unit({ x: d.y * up.z - d.z * up.y, y: d.z * up.x - d.x * up.z, z: d.x * up.y - d.y * up.x });
  const ry = { x: d.y * rx.z - d.z * rx.y, y: d.z * rx.x - d.x * rx.z, z: d.x * rx.y - d.y * rx.x };
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    out.push(unit({ x: d.x + rx.x * ca + ry.x * sa, y: d.y + rx.y * ca + ry.y * sa, z: d.z + rx.z * ca + ry.z * sa }));
  }
  return out;
}

// El daño de una bala según la distancia (la escopeta pierde fuerza lejos).
export const falloff = (st, dist) => (st.falloff ? 1 - clamp((dist - st.falloff) / (st.range - st.falloff), 0, 1) * 0.7 : 1);

// Resuelve un tiro de arma de fuego (no cohetes ni granadas). Devuelve el evento y el daño a sólidos.
// `spreadMul` = qué tan abierto (moverse, saltar, apuntar). `targets`: los otros jugadores en pie.
export function resolveShot(w, o, d, item, targets, spreadMul, sd) {
  const st = statsOf(item);
  const dirs = pelletDirs(d, st.pellets, st.spread * spreadMul, sd);
  const hits = new Map(); // id -> { dmg, head }
  const solids = new Map(); // id -> daño
  let far = 0;
  for (const dir of dirs) {
    const wall = rayCast(w, o, dir, st.range);
    const hit = rayPlayers(o, dir, targets, wall.dist);
    const len = hit ? hit.dist : wall.dist;
    far = Math.max(far, len);
    if (hit) {
      const dmg = st.dmg * (hit.head ? st.hs : 1) * falloff(st, hit.dist);
      const h = hits.get(hit.id) || { dmg: 0, head: false };
      h.dmg += dmg; h.head = h.head || hit.head;
      hits.set(hit.id, h);
    } else if (wall.s) {
      const sd2 = st.melee ? st.solid : st.dmg * falloff(st, wall.dist);
      solids.set(wall.s.id, (solids.get(wall.s.id) || 0) + sd2);
    }
  }
  return { st, dirs, len: far, hits: [...hits].map(([id, h]) => ({ id, dmg: Math.round(h.dmg), head: h.head })), solids: [...solids].map(([id, dmg]) => ({ id, dmg: Math.round(dmg) })) };
}

// Puede disparar ahora: el arma, la recarga y el ritmo.
export function canShoot(p, now) {
  const gun = held(p);
  if (!gun || p.dead || p.cast || now < p.nextShot || now < p.reloadUntil || p.mode !== 'ground') return false;
  return WEAPONS[gun.w].melee || gun.mag > 0;
}

// ─── Proyectiles: cohetes y granadas ─────────────────────────────────────────
export function solidAt(w, x, y, z) {
  if (y < w.height(x, z)) return true;
  w.near(x - 0.1, z - 0.1, x + 0.1, z + 0.1, tmp);
  for (const s of tmp) {
    if (s.k === 'cyl') { if (y >= s.y0 && y <= s.y1 && (x - s.cx) ** 2 + (z - s.cz) ** 2 <= s.r * s.r) return true; continue; }
    if (s.k === 'ramp') { const top = rampY(s, x, z); if (top !== null && y <= top && y >= s.y0 - 0.5) return true; continue; }
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && y >= s.y0 && y <= s.y1) return true;
  }
  return false;
}

export function rocketFor(ev, owner) {
  const st = WEAPONS[ev.w];
  return { k: ev.k, x: ev.o[0], y: ev.o[1], z: ev.o[2], vx: ev.d[0] * st.speed, vy: ev.d[1] * st.speed, vz: ev.d[2] * st.speed, by: owner, w: ev.w, life: st.range / st.speed, age: 0, done: false };
}
// Avanza el cohete. Devuelve null o { x, y, z } donde chocó. `targets` solo los pasa la pantalla del dueño.
export function stepRocket(r, dt, w, targets = []) {
  r.vy -= 2.5 * dt;
  const px = r.x, py = r.y, pz = r.z;
  const dist = Math.hypot(r.vx, r.vy, r.vz) * dt;
  const sub = Math.max(1, Math.ceil(dist / 0.8));
  for (let i = 1; i <= sub; i++) {
    const x = px + (r.x + r.vx * dt - px) * (i / sub), y = py + (r.y + r.vy * dt - py) * (i / sub), z = pz + (r.z + r.vz * dt - pz) * (i / sub);
    if (solidAt(w, x, y, z)) { r.done = true; r.x = x; r.y = y; r.z = z; return { x, y, z }; }
    for (const t of targets) if ((x - t.x) ** 2 + (z - t.z) ** 2 < 0.6 * 0.6 && y > t.y && y < t.y + PLAYER_H) { r.done = true; r.x = x; r.y = y; r.z = z; return { x, y, z }; }
  }
  r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
  r.age += dt;
  if (r.age >= r.life) { r.done = true; return { x: r.x, y: r.y, z: r.z }; }
  return null;
}

// Una granada que sale de la mano (o del lanzagranadas) con la velocidad que le dio quien la tiró.
export function grenadeFor(ev, owner) {
  return { k: ev.k, x: ev.o[0], y: ev.o[1], z: ev.o[2], vx: ev.v[0], vy: ev.v[1], vz: ev.v[2], fuse: ev.f, by: owner, w: ev.w, spin: 0, done: false };
}
// Avanza la granada (rebota). Devuelve true cuando le toca explotar.
export function stepGrenade(g, dt, w, targets = []) {
  g.vy -= 17 * dt;
  const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
  const floor = w.height(nx, nz);
  if (solidAt(w, nx, g.y, g.z) && !solidAt(w, g.x, g.y, g.z)) g.vx = -g.vx * 0.45; else g.x = nx;
  if (solidAt(w, g.x, g.y, nz) && !solidAt(w, g.x, g.y, g.z)) g.vz = -g.vz * 0.45; else g.z = nz;
  if (ny < floor || solidAt(w, g.x, ny, g.z)) {
    if (g.vy < 0) { g.vy = -g.vy * 0.4; g.vx *= 0.72; g.vz *= 0.72; if (Math.abs(g.vy) < 1.2) g.vy = 0; }
    g.y = Math.max(g.y, floor);
    if (ny < floor) g.y = floor + 0.02;
  } else g.y = ny;
  g.spin += dt * 10;
  g.fuse -= dt;
  if (g.w === 'launcher') for (const t of targets) if ((g.x - t.x) ** 2 + (g.z - t.z) ** 2 < 0.8 * 0.8 && g.y > t.y && g.y < t.y + PLAYER_H) return true;
  return g.fuse <= 0;
}

// ─── Explosiones ─────────────────────────────────────────────────────────────
// Daño y empujón a un jugador (centro del cuerpo a 1 m de los pies). Baja del 100 % al 30 % hacia afuera.
export function blastOn(p, ev) {
  const b = BLASTS[ev.w];
  if (!b) return null;
  const dx = p.x - ev.x, dy = p.y + 1 - ev.y, dz = p.z - ev.z;
  const d = Math.hypot(dx, dy, dz);
  const reach = Math.max(0, d - PLAYER_R);
  if (reach >= b.r) return null;
  const k = 1 - (reach / b.r) * 0.7;
  const n = d > 0.01 ? { x: dx / d, y: dy / d, z: dz / d } : { x: 0, y: 1, z: 0 };
  return { damage: Math.round(b.dmg * k), vx: n.x * b.knock * k, vy: Math.max(0.3, n.y) * b.knock * k * 0.8, vz: n.z * b.knock * k };
}
// Los sólidos que alcanza una explosión, con el daño que les toca.
export function blastSolids(w, ev) {
  const b = BLASTS[ev.w];
  const out = [];
  if (!b) return out;
  for (const s of w.near(ev.x - b.r, ev.z - b.r, ev.x + b.r, ev.z + b.r, [])) {
    if (!(s.hp > 0)) continue;
    const cx = s.k === 'cyl' ? s.cx : (s.x0 + s.x1) / 2, cz = s.k === 'cyl' ? s.cz : (s.z0 + s.z1) / 2, cy = (s.y0 + s.y1) / 2;
    const d = Math.hypot(cx - ev.x, cy - ev.y, cz - ev.z);
    if (d > b.r + 2) continue;
    out.push({ id: s.id, dmg: Math.round(b.solid * (1 - Math.min(1, d / (b.r + 2)) * 0.6)) });
  }
  return out;
}

// ─── Cofres y botín ──────────────────────────────────────────────────────────
// Abrir un cofre (mantener E) deja su contenido en el piso, alrededor, y cada cosa se agarra apretando E cerca.
// El contenido sale de la semilla y del número del cofre: todas las pantallas lo calculan igual y la sala solo anota
// quién abrió el cofre y quién agarró cada cosa.
export const OPEN_TIME = 0.9;   // segundos manteniendo E
export const OPEN_RANGE = 2.3;  // a qué distancia se abre
export const PICK_RANGE = 2.2;  // a qué distancia se agarra algo del piso
export const MAX_PILES = 8;     // un cofre deja a lo sumo dos armas y cinco pilas
export const MAX_TOOK = 260;    // tope de lo anotado en la sala (por el límite de 30.000 caracteres)

const WEAPON_POOLS = {
  1: [['pistol', 14], ['revolver', 7], ['smg', 14], ['shotgun', 12], ['rifle', 7], ['burst', 5], ['launcher', 1.5], ['sniper', 0.8]],
  2: [['smg', 10], ['shotgun', 12], ['rifle', 14], ['burst', 10], ['revolver', 8], ['sniper', 4], ['launcher', 4], ['bazooka', 2.5], ['minigun', 0.8]],
  3: [['rifle', 12], ['burst', 10], ['sniper', 10], ['bazooka', 8], ['launcher', 7], ['minigun', 5], ['shotgun', 8], ['smg', 5]],
};
const RARITY_WEIGHTS = { 1: [58, 28, 11, 3, 0], 2: [28, 34, 24, 11, 3], 3: [6, 22, 34, 25, 13] };
const ITEM_POOL = [['bandage', 14], ['medkit', 7], ['shield', 12], ['bigshield', 5], ['grenade', 9]];

function roll(rand, table) {
  const total = table.reduce((n, [, wt]) => n + wt, 0);
  let r = rand() * total;
  for (const [kind, wt] of table) { r -= wt; if (r <= 0) return kind; }
  return table[0][0];
}
function rollWeapon(rand, tier) {
  const w = roll(rand, WEAPON_POOLS[tier] || WEAPON_POOLS[1]);
  const weights = RARITY_WEIGHTS[tier] || RARITY_WEIGHTS[1];
  let r = roll(rand, weights.map((wt, i) => [i, wt]));
  r = Math.max(r, WEAPONS[w].minR || 0);
  return { w, r };
}

// Qué trae un cofre: un arma (dos si es del cielo o de tier 3) y cosas para curarse o tirar. `extra` suma lo del cofre del cielo.
export function chestContents(seed, i, tier, extra = null) {
  const rand = rng(seed ^ (0x5bd1e995 + i * 7919));
  const weapons = [rollWeapon(rand, tier)];
  if (tier >= 3) weapons.push(rollWeapon(rand, tier === 3 && extra ? 3 : 2));
  const items = { ...(extra || {}) };
  for (let k = 0; k < (tier >= 2 ? 3 : 2); k++) {
    const kind = roll(rand, ITEM_POOL);
    const n = kind === 'bandage' ? 2 + Math.floor(rand() * 4) : kind === 'grenade' ? 1 + Math.floor(rand() * 2) : 1;
    items[kind] = (items[kind] || 0) + n;
  }
  return { weapons, items };
}

// Lo que queda en el piso al abrir un cofre: las armas y una pila de cada cosa, repartidas alrededor.
// La clave de cada cosa es «cofre:número» (el cofre tiene que estar abierto).
export function groundItems(seed, ch) {
  const c = chestContents(seed, ch.i, ch.tier, ch.extra);
  const list = [];
  for (const g of c.weapons) list.push({ kind: g.w, r: g.r, n: 1 });
  for (const [kind, n] of Object.entries(c.items)) list.push({ kind, n });
  const a0 = rng(seed ^ (0x2545f491 + ch.i * 131))() * Math.PI * 2;
  return list.map((it, k) => {
    const a = a0 + (k / list.length) * Math.PI * 2;
    const rr = 1.5 + (list.length > 5 ? 0.4 : 0);
    return { ...it, key: `${ch.i}:${k}`, x: Math.round((ch.x + Math.cos(a) * rr) * 10) / 10, z: Math.round((ch.z + Math.sin(a) * rr) * 10) / 10, y: ch.y };
  });
}

// El lugar del arma que se cambia al agarrar otra con el inventario lleno: la que tenés en la mano o, si tenés
// el pico, la peor de las otras. El pico no se toca nunca.
export function swapSlot(p) {
  if (p.sel >= 1 && p.sel < SLOTS && p.inv[p.sel]) return p.sel;
  let worst = null;
  const score = (g) => (g.r || 0) * 10 + WEAPON_LIST.indexOf(g.w) * 0.1;
  for (let i = 1; i < SLOTS; i++) if (p.inv[i] && (worst === null || score(p.inv[i]) < score(p.inv[worst]))) worst = i;
  return worst;
}

// Qué pasa si agarrás `item`: 'take' (entra), 'swap' (cambia el arma de la mano) o 'full' (no entra).
export function pickAction(p, item) {
  if (isWeapon(item.kind)) {
    if (p.inv.some((g) => g && g.w === item.kind && (g.r || 0) >= (item.r || 0))) return p.inv.some((g, i) => i && !g) ? 'take' : 'full';
    return p.inv.some((g, i) => i && !g) ? 'take' : swapSlot(p) === null ? 'full' : 'swap';
  }
  return p.items[item.kind] < ITEMS[item.kind].max ? 'take' : 'full';
}

// Agarra `item`. Devuelve null si no entra o { name, dropped }: `dropped` es el arma que tenías y que tiene que quedar en el piso.
export function pickUp(p, item) {
  const how = pickAction(p, item);
  if (how === 'full') return null;
  if (!isWeapon(item.kind)) {
    const before = p.items[item.kind];
    p.items[item.kind] = Math.min(ITEMS[item.kind].max, before + item.n);
    return { name: `${ITEMS[item.kind].name} x${p.items[item.kind] - before}`, dropped: null };
  }
  const entry = { w: item.kind, r: item.r || 0, mag: item.mag ?? magOf({ w: item.kind, r: item.r || 0 }) };
  const label = `${WEAPONS[item.kind].name} ${RARITIES[entry.r].name.toLowerCase()}`;
  const free = p.inv.findIndex((g, i) => i > 0 && !g);
  if (free >= 0) { p.inv[free] = entry; if (p.sel === 0) selectSlot(p, free); return { name: label, dropped: null }; }
  const slot = swapSlot(p);
  const dropped = p.inv[slot];
  p.inv[slot] = entry;
  p.reloadUntil = 0;
  return { name: label, dropped };
}

// ─── Madera y construcción ───────────────────────────────────────────────────
// Un solo material: madera. Cualquier cosa que rompas (con el pico, a tiros o con explosiones) te da. Con madera armás
// paredes (frenan balas y cuerpos), pisos (se pisan, también sobre el agua) y rampas. Todo se rompe como el resto.
export const MAX_WOOD = 300;
export const WOOD_HIT = 6;       // por cada golpe de pico a algo que se rompe
export const WOOD_BREAK = { tree: 22, crate: 14, wood: 24, stone: 12, sand: 6, build: 4 }; // al romperlo
export const GRID = 4;           // lado de cada pieza
export const BUILD_KINDS = { wall: { cost: 10, hp: 160, code: 1, key: 'Z', name: 'Pared' }, floor: { cost: 10, hp: 130, code: 2, key: 'X', name: 'Piso' }, ramp: { cost: 10, hp: 130, code: 3, key: 'C', name: 'Rampa' } };
export const BUILD_KIND_BY_CODE = { 1: 'wall', 2: 'floor', 3: 'ramp' };
export const BUILD_RANGE = 8;
export const BUILD_GAP = 0.14;   // segundos entre piezas (se puede mantener apretado)
export const LEVEL_H = 3;

const cellOf = (v) => Math.floor(v / GRID);
const centerOf = (c) => (c + 0.5) * GRID;
const cornerMax = (w, cx, cz) => Math.max(w.height(cx * GRID, cz * GRID), w.height((cx + 1) * GRID, cz * GRID), w.height(cx * GRID, (cz + 1) * GRID), w.height((cx + 1) * GRID, (cz + 1) * GRID), w.height(centerOf(cx), centerOf(cz)));

// La pieza que corresponde a unos parámetros: el sólido, la clave que la identifica y la base. `e` es el borde (paredes: 0 = +x,
// 1 = +z, 2 = -x, 3 = -z) o hacia dónde sube la rampa (0 = +x, 1 = +z, 2 = -x, 3 = -z). Es lo que viaja por la red (`bd`).
export function pieceAt(w, kind, cx, cz, e, lvl, anchor = cornerMax(w, cx, cz)) {
  const gx = centerOf(cx), gz = centerOf(cz), half = GRID / 2;
  const B = anchor + lvl * LEVEL_H;
  let key, def;
  if (kind === 'wall') {
    key = `p:wall:${cx}:${cz}:${e}:${lvl}`;
    const horizontal = e === 1 || e === 3; // la pared corre a lo largo de x
    const wx = e === 0 ? gx + half : e === 2 ? gx - half : gx, wz = e === 1 ? gz + half : e === 3 ? gz - half : gz;
    const box = horizontal ? { x0: wx - half, x1: wx + half, z0: wz - 0.15, z1: wz + 0.15 } : { x0: wx - 0.15, x1: wx + 0.15, z0: wz - half, z1: wz + half };
    def = { k: 'box', ...box, y0: lvl ? B - 0.3 : B - 1.4, y1: B + LEVEL_H, mat: 'build', hp: BUILD_KINDS.wall.hp };
  } else if (kind === 'floor') {
    key = `p:floor:${cx}:${cz}:${lvl}`;
    def = { k: 'box', x0: gx - half, x1: gx + half, z0: gz - half, z1: gz + half, y0: lvl ? B - 0.4 : B - 1.4, y1: B, mat: 'build', hp: BUILD_KINDS.floor.hp };
  } else {
    key = `p:ramp:${cx}:${cz}:${e}:${lvl}`;
    def = { k: 'ramp', x0: gx - half, x1: gx + half, z0: gz - half, z1: gz + half, y0: B, rise: LEVEL_H, dir: e, mat: 'build', hp: BUILD_KINDS.ramp.hp };
  }
  return { kind, key, cx, cz, lvl, e, B, anchor, def, code: BUILD_KINDS[kind].code };
}

// La pieza que saldría si apuntás a `aim`: pared sobre el borde que da hacia vos, piso en la celda, rampa que sube hacia donde mirás.
// `manualLvl` suma pisos (tecla V); si estás parado en algo alto, ya cuenta solo.
export function pieceFor(w, kind, aim, p, manualLvl = 0) {
  const cx = cellOf(aim.x), cz = cellOf(aim.z);
  const gx = centerOf(cx), gz = centerOf(cz);
  // Las piezas de un mismo lugar comparten la base (la de la más cercana), así lo que construís arriba empalma aunque el terreno suba o baje.
  let anchor = null, bd = 1e9;
  for (const s of w.near(aim.x - 7, aim.z - 7, aim.x + 7, aim.z + 7, [])) {
    if (!s.piece || s.baseY == null) continue;
    const d = Math.hypot((s.bx0 + s.bx1) / 2 - aim.x, (s.bz0 + s.bz1) / 2 - aim.z);
    if (d < bd) { bd = d; anchor = s.baseY; }
  }
  if (anchor === null) anchor = cornerMax(w, cx, cz);
  const auto = p.y - anchor > 1.6 ? clamp(Math.round((p.y - anchor) / LEVEL_H), 0, 4) : 0;
  const lvl = clamp(auto + manualLvl, 0, 5);
  let e = 0;
  if (kind === 'wall') { const sx = p.x - gx, sz = p.z - gz; e = Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? 0 : 2) : (sz > 0 ? 1 : 3); }
  if (kind === 'ramp') { const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); e = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3); }
  return pieceAt(w, kind, cx, cz, e, lvl, anchor);
}

// ¿Se puede poner la pieza? Devuelve null si sí, o el motivo. `others` = posiciones de los demás jugadores.
export function buildProblem(w, piece, p, others = []) {
  if (!piece) return 'Ahí no se puede';
  const d = piece.def, mx = (d.x0 + d.x1) / 2, mz = (d.z0 + d.z1) / 2;
  if (Math.hypot(mx - p.x, mz - p.z) > BUILD_RANGE + 2) return 'Muy lejos';
  if (!inWorld(w, mx, mz)) return 'Fuera del mapa';
  if (w.byId.has(piece.key) && !w.byId.get(piece.key).dead) return 'Ya hay una';
  if (p.wood < BUILD_KINDS[piece.kind].cost) return 'Falta madera';
  if (piece.kind !== 'floor') {
    for (const o of [p, ...others]) {
      const nx = clamp(o.x, d.x0, d.x1), nz = clamp(o.z, d.z0, d.z1);
      if (piece.kind === 'wall' && (o.x - nx) ** 2 + (o.z - nz) ** 2 < (PLAYER_R + 0.2) ** 2 && o.y < d.y1 && o.y + PLAYER_H > d.y0) return 'Hay alguien ahí';
    }
  }
  return null;
}
// Pone la pieza en el mundo (sin cobrar nada). Devuelve el sólido.
export function placePiece(w, piece) {
  const old = w.byId.get(piece.key);
  if (old && !old.dead) return old;
  const d = piece.def;
  const s = d.k === 'ramp' ? w.addRamp(d.x0, d.x1, d.z0, d.z1, d.y0, d.rise, d.dir, { id: piece.key, hp: d.hp }) : w.addBox(d.x0, d.x1, d.z0, d.z1, d.y0, d.y1, { id: piece.key, mat: 'build', hp: d.hp });
  s.piece = piece.kind;
  s.lvl = piece.lvl;
  s.baseY = piece.anchor;
  w.byId.set(piece.key, s);
  return s;
}

// Los cofres cuyo lugar está al alcance de (x, z), para abrir.
export function chestNear(w, p, opened, speed, dropsLanded = []) {
  let best = null, bd = OPEN_RANGE;
  const consider = (ch) => {
    if (!ch || opened[ch.i]) return;
    const d = Math.hypot(ch.x - p.x, ch.z - p.z);
    if (d < bd && Math.abs(ch.y - p.y) < 2.2) { best = ch; bd = d; }
  };
  for (const ch of w.chests) consider(ch);
  for (const n of dropsLanded) consider(chestOf(w, DROP_BASE + n, speed));
  return best;
}
