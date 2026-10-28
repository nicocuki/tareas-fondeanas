// Pixel Royale: armas, botín, balas, granadas y el movimiento del jugador. Lógica pura: todo lo que
// necesita (mapa, hora) entra por parámetro, así se prueba con valores fijos y las pantallas
// simulan lo mismo a partir de los mismos datos.
import { T, TILE, blocksShot, circleBlocked, damageTile, isSolid, mulberry32, moveCircle, nearestWalkable, tileAt, zoneAt } from './map.js';

export const STEP = 1 / 60;
export const PLAYER_R = 5;
export const SPEED = 82;
export const HP = 100;
export const MAX_SHIELD = 100;
export const SLOTS = 3;

// ─── Armas ──────────────────────────────────────────────────────────────────
// dmg por bala, rate = segundos entre tiros, mag = balas por cargador, speed en px/s, range en px.
// kick = empujón hacia atrás, look = cuánto se adelanta la cámara hacia donde apuntás.
export const WEAPONS = {
  pistol: { name: 'Pistola', rarity: 0, dmg: 14, pellets: 1, rate: 0.26, mag: 12, reload: 1.0, speed: 290, range: 210, spread: 0.025, auto: false, kick: 14, look: 0.4, len: 7 },
  smg: { name: 'Metralleta', rarity: 1, dmg: 6, pellets: 1, rate: 0.08, mag: 30, reload: 1.5, speed: 310, range: 160, spread: 0.1, auto: true, kick: 8, look: 0.45, len: 8 },
  shotgun: { name: 'Escopeta', rarity: 1, dmg: 9, pellets: 7, rate: 0.8, mag: 5, reload: 1.9, speed: 270, range: 110, spread: 0.26, auto: false, kick: 40, look: 0.4, len: 9 },
  rifle: { name: 'Fusil', rarity: 2, dmg: 12, pellets: 1, rate: 0.13, mag: 24, reload: 1.8, speed: 350, range: 270, spread: 0.04, auto: true, kick: 10, look: 0.65, len: 11 },
  sniper: { name: 'Francotirador', rarity: 3, dmg: 75, pellets: 1, rate: 1.15, mag: 4, reload: 2.3, speed: 580, range: 500, spread: 0.004, auto: false, kick: 30, look: 1, len: 14 },
  bazooka: { name: 'Bazooka', rarity: 3, dmg: 0, pellets: 1, rate: 1.4, mag: 1, reload: 2.6, speed: 175, range: 340, spread: 0.01, auto: false, kick: 36, look: 0.5, len: 12, blast: 'rocket' },
};
export const WEAPON_LIST = Object.keys(WEAPONS);
export const RARITY_COLORS = ['#c9ccd6', '#5ed36b', '#4aa0ff', '#c46bff'];

// Explosiones: r = radio en px, dmg al jugador (más fuerte en el centro), tile = daño a lo que se rompe.
export const BLASTS = {
  rocket: { r: 36, dmg: 70, tile: 130 },
  grenade: { r: 38, dmg: 60, tile: 110 },
};

// Consumables: se usan con una tecla y tardan un rato en hacer efecto (si te pegan, se corta).
export const ITEMS = {
  bandage: { name: 'Vendas', key: 'Q', cast: 0.8, max: 10, heal: 20 },
  medkit: { name: 'Botiquín', key: 'E', cast: 2.2, max: 4, heal: 60 },
  shield: { name: 'Escudo', key: 'F', cast: 1.5, max: 4, shield: 50 },
  grenade: { name: 'Granada', key: 'G', max: 6 },
};
export const ITEM_LIST = Object.keys(ITEMS);
export const GRENADE_FUSE = 1.7;
export const GRENADE_GAP = 0.6;

export const isWeapon = (kind) => Boolean(WEAPONS[kind]);

// ─── El jugador ─────────────────────────────────────────────────────────────
export function newPlayer(x, y) {
  return {
    x, y, kx: 0, ky: 0, hp: HP, shield: 0, dead: false,
    inv: [{ w: 'pistol', mag: WEAPONS.pistol.mag }, null, null], sel: 0,
    items: { bandage: 0, medkit: 0, shield: 0, grenade: 0 },
    readyAt: 0, reloadUntil: 0, cast: null, grenadeAt: 0,
    lastBy: null, lastW: null, lastHitAt: 0, hurtUntil: 0, walked: 0,
  };
}
export const held = (p) => p.inv[p.sel];

// Mueve al jugador: `ax`, `ay` son la dirección (-1 a 1). En el agua baja es más lento, curando también.
export function stepPlayer(p, ax, ay, dt, t) {
  const len = Math.hypot(ax, ay);
  const tile = tileAt(t, Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  let speed = SPEED * (tile === T.SHALLOW ? 0.6 : 1) * (p.cast ? 0.55 : 1);
  if (p.reloadUntil) speed *= 0.92;
  const vx = len ? (ax / len) * speed : 0, vy = len ? (ay / len) * speed : 0;
  const x0 = p.x, y0 = p.y;
  moveCircle(t, p, (vx + p.kx) * dt, (vy + p.ky) * dt, PLAYER_R);
  // El empujón (retroceso, explosiones) se va apagando.
  const decay = Math.exp(-7 * dt);
  p.kx *= decay; p.ky *= decay;
  if (Math.abs(p.kx) < 1) p.kx = 0;
  if (Math.abs(p.ky) < 1) p.ky = 0;
  p.walked += Math.hypot(p.x - x0, p.y - y0);
}
export function shove(p, vx, vy) { p.kx += vx; p.ky += vy; }

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
  if (!gun || p.reloadUntil || gun.mag >= WEAPONS[gun.w].mag) return false;
  p.reloadUntil = now + WEAPONS[gun.w].reload;
  return true;
}
export function finishReload(p, now) {
  if (!p.reloadUntil || now < p.reloadUntil) return false;
  const gun = held(p);
  if (gun) gun.mag = WEAPONS[gun.w].mag;
  p.reloadUntil = 0;
  return true;
}
export function selectSlot(p, slot) {
  if (slot === p.sel || !p.inv[slot]) return false;
  p.sel = slot;
  p.reloadUntil = 0; // cambiar de arma corta la recarga
  return true;
}

// Empieza a usar un consumible. Devuelve false si no hay o no hace falta.
export function startCast(p, kind, now) {
  const it = ITEMS[kind];
  if (!it?.cast || p.cast || p.items[kind] <= 0) return false;
  if (it.heal && p.hp >= HP) return false;
  if (it.shield && p.shield >= MAX_SHIELD) return false;
  p.cast = { kind, from: now, until: now + it.cast };
  return true;
}
export function finishCast(p, now) {
  if (!p.cast || now < p.cast.until) return null;
  const kind = p.cast.kind, it = ITEMS[kind];
  p.cast = null;
  p.items[kind] -= 1;
  if (it.heal) p.hp = Math.min(HP, p.hp + it.heal);
  if (it.shield) p.shield = Math.min(MAX_SHIELD, p.shield + it.shield);
  return kind;
}

// Levantar del suelo. Armas: al lugar libre (o recarga la que ya tenés); consumibles hasta su tope.
// Devuelve el slot donde quedó el arma, 'item' o null si no entra.
export function canTake(p, kind) {
  if (isWeapon(kind)) return p.inv.some((g) => g?.w === kind) || p.inv.some((g) => !g);
  return p.items[kind] < ITEMS[kind].max;
}
export function take(p, kind) {
  if (isWeapon(kind)) {
    const same = p.inv.findIndex((g) => g?.w === kind);
    if (same >= 0) { p.inv[same].mag = WEAPONS[kind].mag; return same; }
    const free = p.inv.findIndex((g) => !g);
    if (free < 0) return null;
    p.inv[free] = { w: kind, mag: WEAPONS[kind].mag };
    return free;
  }
  if (p.items[kind] >= ITEMS[kind].max) return null;
  p.items[kind] += 1;
  return 'item';
}
// Cambia el arma en la mano por la del suelo (cuando no hay lugar).
export function swapHeld(p, kind) {
  p.inv[p.sel] = { w: kind, mag: WEAPONS[kind].mag };
  p.reloadUntil = 0;
}

// ─── Balas ──────────────────────────────────────────────────────────────────
// Un disparo viaja en la foto como { k, t, x, y, a, w, sd }; cada pantalla arma las mismas balas
// (la semilla `sd` fija el abanico de la escopeta y el desvío).
export function bulletsForShot(shot, owner) {
  const wp = WEAPONS[shot.w];
  if (!wp) return [];
  const rng = mulberry32(shot.sd | 0);
  const list = [];
  for (let i = 0; i < wp.pellets; i++) {
    const a = shot.a + (rng() * 2 - 1) * wp.spread;
    const sp = wp.speed * (wp.pellets > 1 ? 0.9 + rng() * 0.2 : 1);
    list.push({
      k: wp.pellets > 1 ? `${shot.k}.${i}` : shot.k, x: shot.x, y: shot.y, px: shot.x, py: shot.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: shot.w, dmg: wp.dmg, left: wp.range, by: owner, done: false, age: 0,
    });
  }
  return list;
}

// Avanza la bala. Devuelve null o { kind: 'tile' | 'range', x, y, tx, ty }.
export function stepBullet(b, dt, t) {
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const sub = Math.max(1, Math.ceil(dist / 4));
  b.px = b.x; b.py = b.y;
  for (let i = 0; i < sub; i++) {
    b.x += (b.vx * dt) / sub;
    b.y += (b.vy * dt) / sub;
    const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
    if (blocksShot(t, tx, ty)) { b.done = true; return { kind: 'tile', x: b.x, y: b.y, tx, ty }; }
  }
  b.left -= dist;
  b.age += dt;
  if (b.left <= 0) { b.done = true; return { kind: 'range', x: b.x, y: b.y }; }
  return null;
}

// ¿La bala (desde su punto anterior hasta el actual) toca un círculo?
export function bulletHits(b, cx, cy, r) {
  const dx = b.x - b.px, dy = b.y - b.py;
  const len2 = dx * dx + dy * dy;
  let k = len2 ? ((cx - b.px) * dx + (cy - b.py) * dy) / len2 : 0;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(b.px + dx * k - cx, b.py + dy * k - cy) < r + 1.2;
}

// ─── Granadas ───────────────────────────────────────────────────────────────
// Salen de la mano con una velocidad que se va frenando: llegan hasta donde apuntás.
export function grenadeFor(ev, owner) {
  const d = Math.min(ev.d, 150);
  const v = d * 2.4;
  return { k: ev.k, x: ev.x, y: ev.y, vx: Math.cos(ev.a) * v, vy: Math.sin(ev.a) * v, fuse: GRENADE_FUSE, by: owner, spin: 0 };
}
export function stepGrenade(g, dt, t) {
  const f = Math.exp(-2.4 * dt);
  g.vx *= f; g.vy *= f;
  const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
  if (isSolid(t, Math.floor(nx / TILE), Math.floor(g.y / TILE)) && tileAt(t, Math.floor(nx / TILE), Math.floor(g.y / TILE)) !== T.DEEP) g.vx = -g.vx * 0.5;
  else g.x = nx;
  if (isSolid(t, Math.floor(g.x / TILE), Math.floor(ny / TILE)) && tileAt(t, Math.floor(g.x / TILE), Math.floor(ny / TILE)) !== T.DEEP) g.vy = -g.vy * 0.5;
  else g.y = ny;
  g.fuse -= dt;
  g.spin += dt * 9;
  return g.fuse <= 0;
}

// ─── Explosiones ────────────────────────────────────────────────────────────
// Daño y empujón a un jugador. Cuenta desde el borde del cuerpo y baja hacia afuera (del 100 % al 30 %).
export function blastOn(p, ev) {
  const b = BLASTS[ev.w];
  if (!b) return null;
  const d = Math.hypot(p.x - ev.x, p.y - ev.y);
  const reach = Math.max(0, d - PLAYER_R);
  if (reach >= b.r) return null;
  const k = 1 - (reach / b.r) * 0.7;
  const away = d > 0.01 ? { x: (p.x - ev.x) / d, y: (p.y - ev.y) / d } : { x: 0, y: -1 };
  return { damage: Math.round(b.dmg * k), vx: away.x * 190 * k, vy: away.y * 190 * k };
}
// Rompe lo que alcance la explosión. Devuelve las casillas que se rompieron.
export function blastTiles(t, ev) {
  const b = BLASTS[ev.w];
  const broken = [];
  if (!b) return broken;
  const x0 = Math.floor((ev.x - b.r) / TILE), x1 = Math.floor((ev.x + b.r) / TILE);
  const y0 = Math.floor((ev.y - b.r) / TILE), y1 = Math.floor((ev.y + b.r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const d = Math.hypot(tx * TILE + TILE / 2 - ev.x, ty * TILE + TILE / 2 - ev.y);
      if (d > b.r + TILE / 2) continue;
      if (damageTile(t, tx, ty, b.tile * (1 - (d / (b.r + TILE / 2)) * 0.6))) broken.push({ tx, ty });
    }
  }
  return broken;
}

// ─── Botín ──────────────────────────────────────────────────────────────────
const WORLD_TABLE = [['pistol', 6], ['smg', 14], ['shotgun', 14], ['rifle', 10], ['sniper', 3], ['bazooka', 2], ['bandage', 17], ['medkit', 7], ['shield', 10], ['grenade', 11]];
const HOUSE_TABLE = [['pistol', 3], ['smg', 14], ['shotgun', 14], ['rifle', 14], ['sniper', 6], ['bazooka', 4], ['bandage', 12], ['medkit', 9], ['shield', 12], ['grenade', 10]];
const DROP_TABLE = [['rifle', 3], ['sniper', 4], ['bazooka', 4], ['shotgun', 2]];
const SUPPLY_TABLE = [['medkit', 3], ['shield', 3], ['grenade', 2]];

function roll(rng, table) {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [kind, w] of table) { r -= w; if (r <= 0) return kind; }
  return table[0][0];
}

// El botín de la isla: adentro de las casas y desparramado afuera. Todas las pantallas arman lo mismo.
export const DROP_BASE = 200; // los índices de las cajas que caen empiezan acá
export const MAX_DROPS = 8;
export const LOOT_LIMIT = DROP_BASE + MAX_DROPS * 2;

export function lootSpots(t, seed) {
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const spots = [];
  const add = (tx, ty, table) => spots.push({ i: spots.length, x: tx * TILE + TILE / 2 + Math.round((rng() - 0.5) * 4), y: ty * TILE + TILE / 2 + Math.round((rng() - 0.5) * 4), kind: roll(rng, table) });
  for (const b of t.buildings) {
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const tx = b.x + 1 + Math.floor(rng() * (b.w - 2)), ty = b.y + 1 + Math.floor(rng() * (b.h - 2));
        if (tileAt(t, tx, ty) === T.FLOOR && !spots.some((s) => Math.floor(s.x / TILE) === tx && Math.floor(s.y / TILE) === ty)) { add(tx, ty, HOUSE_TABLE); break; }
      }
    }
  }
  for (let k = 0, tries = 0; k < t.cfg.scatter && tries < 4000; tries++) {
    const tx = 2 + Math.floor(rng() * (t.N - 4)), ty = 2 + Math.floor(rng() * (t.N - 4));
    const tile = tileAt(t, tx, ty);
    if (tile !== T.GRASS && tile !== T.FOREST && tile !== T.SAND) continue;
    if (spots.some((s) => Math.hypot(s.x - tx * TILE, s.y - ty * TILE) < 40)) continue;
    add(tx, ty, WORLD_TABLE);
    k++;
  }
  return spots;
}

// Las cajas que caen del cielo: cada tanto, adentro de la zona de ese momento. Cada una trae dos cosas.
export const DROP_FIRST = 50;
export const DROP_EVERY = 45;
export const DROP_FALL = 4; // segundos que tarda en bajar
export function dropInfo(t, seed, n, speed = 1) {
  const ts = t.cfg.zoneTime / speed;
  const at = (DROP_FIRST + n * DROP_EVERY) * ts;
  const rng = mulberry32(seed ^ (0x7f4a7c15 + n * 977));
  const z = zoneAt(t, at, speed);
  const a = rng() * Math.PI * 2, d = rng() * z.r * 0.6;
  const pos = nearestWalkable(t, z.cx + Math.cos(a) * d, z.cy + Math.sin(a) * d);
  return { n, at, x: pos.x, y: pos.y, kinds: [roll(rng, DROP_TABLE), roll(rng, SUPPLY_TABLE)] };
}

// ─── Aparición ──────────────────────────────────────────────────────────────
// Todos arrancan repartidos en un anillo alrededor del centro de la isla.
export function spawnPoint(t, seed, index, size) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const phase = rng() * Math.PI * 2;
  const a = phase + (index / Math.max(1, size)) * Math.PI * 2;
  const r = t.W / 2 * 0.5;
  return nearestWalkable(t, t.W / 2 + Math.cos(a) * r, t.H / 2 + Math.sin(a) * r);
}

// ¿Está este punto libre para un jugador? (para los tests)
export const standable = (t, x, y) => !circleBlocked(t, x, y, PLAYER_R);
