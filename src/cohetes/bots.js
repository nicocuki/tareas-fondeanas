// Las máquinas (modificador «Máquinas»): tanques-robot sin nombre que patrullan el mapa y buscan a quién eliminar.
// Los corre la pantalla del anfitrión (como los bichos de Cubolandia) y viajan en su foto (`bt`); acá está la parte pura:
// dónde aparecen, qué deciden (hacia dónde manejar y cuándo y a dónde disparar).
import { ITEMS, TANK_R, newTank, overlaps } from './sim.js';
import { TOP, seeded, solid } from './terrain.js';

export const BOT_HP = 60;
export const BOT_GAP = 2.2;        // segundos entre tiros
export const BOT_SIGHT = 480;      // a qué distancia los ve
export const BOT_RANGE = 330;      // a qué distancia les dispara
export const BOT_KEEP = 140;       // no se les acerca más que esto
export const BOT_DRIVE = 0.7;      // velocidad (sobre la de un tanque)
export const BOT_RESPAWN = 12;     // segundos hasta que una máquina destruida vuelve
export const BOT_PREFIX = 'bot:';  // en los ids de los jugadores no hay «:», así que no se confunden

export const botId = (i) => `${BOT_PREFIX}${i}`;
export const isBot = (id) => typeof id === 'string' && id.startsWith(BOT_PREFIX);
export const botCount = (players) => Math.min(8, 2 + Math.ceil(players / 3));

// Un lugar de la semilla para la máquina `i` de `n` (cada `round` es una aparición nueva), repartidas a lo ancho y con suelo abajo.
export function botSpot(t, seed, i, n, round = 0) {
  const rand = seeded((seed ^ 0xb07b07 ^ Math.imul(i + 1, 7919) ^ Math.imul(round, 104729)) >>> 0);
  const slot = (t.W - 240) / n;
  for (let k = 0; k < 90; k++) {
    const x = 120 + (i + 0.15 + rand() * 0.7) * slot;
    const y = TOP + 20 + rand() * (t.H - TOP - 260);
    if (overlaps(t, x, y, TANK_R + 6)) continue;
    if (t.bases && t.bases.some((b) => Math.hypot(b.x - x, b.y - y) < 240)) continue; // lejos de las banderas
    for (let d = 8; d <= 220; d += 8) if (solid(t, x, y + d)) return { x, y };
  }
  return { x: 120 + (i + 0.5) * slot, y: TOP + 20 };
}

export function newBot(t, seed, i, n, round = 0) {
  const s = botSpot(t, seed, i, n, round);
  return { ...newTank(s.x, s.y, 'tank', BOT_HP), id: botId(i), i, round, aim: -Math.PI / 2, dir: 1, turnAt: 0, readyAt: 0, dead: false, respawnAt: 0 };
}

// El ángulo (de pantalla, y para abajo) para que un cohete llegue de `from` a `to`, o null si no alcanza.
export function aimAt(from, to, w = ITEMS.rocket, g = 1) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const grav = w.gravity * g, v2 = w.speed * w.speed;
  const disc = v2 * v2 - grav * (grav * dx * dx - 2 * dy * v2);
  if (disc < 0) return null;
  const tan = (v2 - Math.sqrt(disc)) / (grav * Math.abs(dx) || 1e-6); // el tiro tenso
  const up = Math.atan(tan);
  const side = dx >= 0 ? 1 : -1;
  return Math.atan2(-Math.sin(up), side * Math.cos(up));
}

// Qué hace una máquina ahora: { dir, fire }. `targets`: los tanques que puede atacar ({ x, y }).
export function botThink(b, targets, now, rand = Math.random) {
  let near = null, nd = Infinity;
  for (const tk of targets) { const d = Math.hypot(tk.x - b.x, tk.y - b.y); if (d < nd) { nd = d; near = tk; } }
  if (near && nd < BOT_SIGHT) {
    // Se acerca por la superficie hacia el objetivo (D va para el lado derecho del tanque: la tangente).
    const toward = (near.x - b.x) * -b.ny + (near.y - b.y) * b.nx;
    b.dir = nd > BOT_KEEP ? (Math.sign(toward) || 1) : 0;
    let fire = null;
    const a = aimAt({ x: b.x, y: b.y }, near);
    b.aim = a ?? Math.atan2(near.y - b.y, near.x - b.x);
    if (nd < BOT_RANGE && a != null && now >= b.readyAt) {
      fire = a + (rand() - 0.5) * 0.14;
      b.readyAt = now + BOT_GAP + rand() * 0.8;
    }
    return { dir: b.dir, fire };
  }
  // Sin nadie a la vista, patrulla: cambia de rumbo cada tanto.
  if (now >= b.turnAt) { b.dir = [-1, 0, 1, 1, -1][Math.floor(rand() * 5)]; b.turnAt = now + 2 + rand() * 3; }
  b.aim = b.dir >= 0 ? -0.45 : -Math.PI + 0.45;
  return { dir: b.dir, fire: null };
}
