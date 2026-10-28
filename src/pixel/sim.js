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
    inv: [{ w: 'pistol', mag: WEAPONS.pistol.mag }, null, null], sel: 0, air: null, aboard: false, open: 0,
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

// ─── Cofres ─────────────────────────────────────────────────────────────────
// Solo hay cofres: nada tirado en el piso. Abrir uno (mantener Espacio) te da el contenido directo,
// sin que caiga nada al suelo. El contenido sale de la semilla y del número del cofre: todas las
// pantallas lo calculan igual y la sala solo anota quién lo abrió primero.
export const OPEN_TIME = 0.9;   // segundos manteniendo Espacio
export const OPEN_RANGE = 15;   // a qué distancia se abre

const CHEST_WEAPONS = {
  1: [['pistol', 4], ['smg', 16], ['shotgun', 16], ['rifle', 10], ['sniper', 2], ['bazooka', 1]],
  2: [['smg', 8], ['shotgun', 12], ['rifle', 18], ['sniper', 6], ['bazooka', 3]],
  3: [['rifle', 10], ['sniper', 12], ['bazooka', 8], ['shotgun', 6]],
};
const CHEST_ITEMS = [['bandage', 14], ['medkit', 8], ['shield', 12], ['grenade', 10]];

function roll(rng, table) {
  const total = table.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [kind, w] of table) { r -= w; if (r <= 0) return kind; }
  return table[0][0];
}

// Qué trae un cofre: un arma y algunas cosas para curarse o tirar. `extra` suma lo del cofre del cielo.
export function chestContents(seed, i, tier, extra = null) {
  const rng = mulberry32(seed ^ (0x5bd1e995 + i * 7919));
  const w = roll(rng, CHEST_WEAPONS[tier] || CHEST_WEAPONS[1]);
  const items = { ...(extra || {}) };
  for (let k = 0; k < (tier >= 2 ? 3 : 2); k++) {
    const kind = roll(rng, CHEST_ITEMS);
    const n = kind === 'bandage' ? 2 + Math.floor(rng() * 3) : kind === 'grenade' ? 1 + Math.floor(rng() * 2) : 1;
    items[kind] = (items[kind] || 0) + n;
  }
  return { w, items };
}

// Se queda con lo que entre: el arma va a un lugar libre (o cambia la que tenés en la mano si es mejor)
// y las cosas hasta su tope. Devuelve los nombres de lo que se llevó.
export function giveContents(p, c) {
  const got = [];
  if (c.w) {
    const held = p.inv[p.sel];
    if (canTake(p, c.w)) { const slot = take(p, c.w); if (slot !== null) { if (!p.inv[p.sel]) p.sel = slot; got.push(WEAPONS[c.w].name); } }
    else if (!held || WEAPONS[c.w].rarity > WEAPONS[held.w].rarity) { swapHeld(p, c.w); got.push(WEAPONS[c.w].name); }
  }
  for (const [kind, n] of Object.entries(c.items)) {
    const before = p.items[kind];
    p.items[kind] = Math.min(ITEMS[kind].max, before + n);
    if (p.items[kind] > before) got.push(`${ITEMS[kind].name} x${p.items[kind] - before}`);
  }
  return got;
}

// Los cofres del cielo: cada tanto cae uno adentro de la zona de ese momento, con lo mejor.
export const DROP_BASE = 200; // los números de los cofres del cielo empiezan acá
export const MAX_DROPS = 8;
export const LOOT_LIMIT = DROP_BASE + MAX_DROPS;
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
  return { n, i: DROP_BASE + n, at, x: pos.x, y: pos.y, tier: 3, extra: { medkit: 1, shield: 1 } };
}
// Todos los cofres de la partida, los del mapa y los del cielo, con su contenido.
export const chestOf = (t, seed, i, speed = 1) => (i >= DROP_BASE ? dropInfo(t, seed, i - DROP_BASE, speed) : t.chests[i]);
export const contentsOf = (t, seed, i, speed = 1) => {
  const ch = chestOf(t, seed, i, speed);
  return ch ? chestContents(seed, i, ch.tier, ch.extra) : null;
};

// ─── El bus de batalla ──────────────────────────────────────────────────────
// Cruza la isla en línea recta. Sale de la semilla, así que todas las pantallas lo ven en el mismo
// lugar sin avisarse nada. Cada uno decide cuándo saltar (Espacio); si no, lo tira al llegar al final.
export const BUS_SPEED = 70;     // px/s
export const PREGAME = 25;       // segundos de bus y caída antes de que corra el reloj de la tormenta
export function busRoute(t, seed) {
  const rng = mulberry32(seed ^ 0x1b873593);
  const ang = rng() * Math.PI * 2;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const off = (rng() - 0.5) * 0.5 * t.W;
  const mx = t.W / 2 - dy * off, my = t.H / 2 + dx * off;
  const half = t.W * 0.6;
  return { x0: mx - dx * half, y0: my - dy * half, x1: mx + dx * half, y1: my + dy * half, dx, dy, ang, len: half * 2 };
}
export function busAt(route, elapsed) {
  const d = Math.min(route.len, Math.max(0, elapsed) * BUS_SPEED);
  return { x: route.x0 + route.dx * d, y: route.y0 + route.dy * d, d, done: d >= route.len };
}

// ─── Caída y planeador ──────────────────────────────────────────────────────
// Al saltar arrancás a gran altura (`z` = 1) en caída libre: rápido y sin poder disparar. Cuando bajás
// de GLIDE_AT se abre el planeador solo (o antes, con Espacio): más lento y más suave. En el aire
// nada te toca. Al llegar al piso (z = 0) aterrizás en un lugar libre.
export const FALL_SPEED = 135;
export const GLIDE_SPEED = 58;
export const GLIDE_AT = 0.3;
export function boardBus(p, bus) {
  p.aboard = true; p.air = null;
  p.x = bus.x; p.y = bus.y;
}
export function jump(p, bus, route) {
  p.aboard = false;
  p.air = { z: 1, glide: false, vx: route.dx * BUS_SPEED * 0.8, vy: route.dy * BUS_SPEED * 0.8 };
  p.x = bus.x; p.y = bus.y;
}
export function openGlider(p) {
  if (!p.air || p.air.glide) return false;
  p.air.glide = true;
  return true;
}
// Un lugar donde entre un jugador, cerca del punto (por si aterrizás sobre una pared o el mar).
export function landSpot(t, x, y) {
  const free = (px, py) => !circleBlocked(t, px, py, PLAYER_R) && tileAt(t, Math.floor(px / TILE), Math.floor(py / TILE)) !== T.DEEP;
  if (free(x, y)) return { x, y };
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = (cx + dx) * TILE + TILE / 2, py = (cy + dy) * TILE + TILE / 2;
        if (free(px, py)) return { x: px, y: py };
      }
    }
  }
  return nearestWalkable(t, x, y);
}
// Avanza la caída. Devuelve 'landed' cuando toca el piso.
export function stepAir(p, ax, ay, dt, t) {
  const a = p.air;
  if (!a) return null;
  const len = Math.hypot(ax, ay);
  const sp = a.glide ? GLIDE_SPEED : FALL_SPEED;
  p.x += ((len ? (ax / len) * sp : 0) + a.vx) * dt;
  p.y += ((len ? (ay / len) * sp : 0) + a.vy) * dt;
  const decay = Math.exp(-0.8 * dt);
  a.vx *= decay; a.vy *= decay;
  p.x = Math.max(-40, Math.min(t.W + 40, p.x));
  p.y = Math.max(-40, Math.min(t.H + 40, p.y));
  a.z -= dt * (a.glide ? 0.036 : 0.105);
  if (!a.glide && a.z <= GLIDE_AT) a.glide = true;
  if (a.z > 0) return null;
  const spot = landSpot(t, p.x, p.y);
  p.x = spot.x; p.y = spot.y;
  p.air = null;
  return 'landed';
}

// ─── Aparición ──────────────────────────────────────────────────────────────
// En la isla de espera, todos arrancan repartidos en un anillo alrededor del centro.
export function spawnPoint(t, seed, index, size) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const phase = rng() * Math.PI * 2;
  const a = phase + (index / Math.max(1, size)) * Math.PI * 2;
  const r = t.W / 2 * 0.4;
  return nearestWalkable(t, t.W / 2 + Math.cos(a) * r, t.H / 2 + Math.sin(a) * r);
}

// ¿Está este punto libre para un jugador? (para los tests)
export const standable = (t, x, y) => !circleBlocked(t, x, y, PLAYER_R);
