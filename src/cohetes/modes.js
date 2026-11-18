// Modos de juego de Cohete Royale, sin React ni red. Un modo es un paquete de reglas: qué cierra el mapa (el agua,
// la tormenta o las dos) y unos cuantos ajustes (gravedad, vida, recarga, cajas, arsenal inicial).
// Todas las pantallas leen `room.options.mode` y calculan lo mismo, así que nada de esto viaja por la red.
import { ITEM_LIST } from './sim.js';
import { TOP, seeded } from './terrain.js';

export const STORM_DPS = 10;       // la tormenta no mata al toque: saca 10 de vida por segundo
export const STORM_START = 30;     // segundos quietos mientras bajan todos de los helicópteros

// zone: 'water' (sube el agua), 'storm' (círculo que se cierra) o 'both' (las dos juntas).
// g: gravedad · hp: vida · reload: tiempo entre cohetes · crates: segundos entre cajas · kit: objetos al arrancar · knock: empuje de las explosiones
export const MODES = {
  water: { name: 'Marea alta', zone: 'water', blurb: 'El clásico: el agua sube y los bloques se rompen. Gana el último que queda.', tag: 'Clásico', g: 1, hp: 100, reload: 1, crates: 10, kit: 0, knock: 1 },
  storm: { name: 'Tormenta', zone: 'storm', blurb: 'Una tormenta cierra el mapa desde los bordes hasta el medio. No mata al toque, pero saca 10 de vida por segundo.', tag: 'Nuevo', g: 1, hp: 100, reload: 1, crates: 10, kit: 0, knock: 1 },
  frenzy: { name: 'Frenesí', zone: 'water', blurb: 'Llueven cajas cada pocos segundos y los cohetes se recargan el doble de rápido. Puro caos.', tag: 'Caos', g: 1, hp: 100, reload: 0.5, crates: 3, kit: 0, knock: 1 },
  arsenal: { name: 'Arsenal', zone: 'storm', blurb: 'Arrancás con tres objetos al azar y cada tanto cae una caja nueva. La tormenta cierra el círculo.', tag: 'Armado', g: 1, hp: 100, reload: 1, crates: 7, kit: 3, knock: 1 },
  moon: { name: 'Luna', zone: 'water', blurb: 'Poca gravedad: los cohetes flotan, las explosiones te mandan lejos y todo es más largo y más loco.', tag: 'Flotante', g: 0.42, hp: 100, reload: 1, crates: 10, kit: 0, knock: 1.25 },
  titans: { name: 'Titanes', zone: 'storm', blurb: 'Todos con 200 de vida: duelos largos, y la tormenta aprieta igual.', tag: 'Resistente', g: 1, hp: 200, reload: 1, crates: 8, kit: 0, knock: 0.9 },
  glass: { name: 'Cristal', zone: 'water', blurb: 'Con 40 de vida, cualquier explosión duele y te manda volando. Un descuido y estás afuera.', tag: 'Frágil', g: 1, hp: 40, reload: 0.8, crates: 8, kit: 1, knock: 1.5 },
  apocalypse: { name: 'Apocalipsis', zone: 'both', blurb: 'La tormenta se cierra y el agua sube al mismo tiempo. No hay dónde esconderse.', tag: 'Extremo', g: 1, hp: 100, reload: 0.8, crates: 6, kit: 1, knock: 1 },
};
export const MODE_LIST = Object.keys(MODES);
export const DEFAULT_MODE = 'water';
export const modeOf = (options) => MODES[options?.mode] || MODES[DEFAULT_MODE];
export const hasWater = (mode) => mode.zone !== 'storm';
export const hasStorm = (mode) => mode.zone !== 'water';

// Lo que cada tanque recibe al arrancar (modos con `kit`): objetos al azar y distintos, siempre iguales para ese jugador.
function hashId(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function startKit(seed, id, n) {
  if (!n) return [];
  const rand = seeded((seed ^ hashId(id)) >>> 0);
  const pool = ITEM_LIST.filter((w) => w !== 'heal');
  const kit = [];
  while (kit.length < Math.min(n, pool.length)) {
    const w = pool[Math.floor(rand() * pool.length)];
    if (!kit.includes(w)) kit.push(w);
  }
  return kit;
}

// ─── La tormenta ─────────────────────────────────────────────────────────────
// Un círculo que arranca cubriendo todo el mapa y se cierra por fases, cada una adentro de la anterior. Entre fase y fase el
// círculo espera (y se ve el próximo marcado) y después se achica. El último llega casi a cero: siempre termina.
const HOLD = 13;                 // segundos que espera cada fase antes de cerrarse
const SHRINK = 24;               // segundos que tarda en cerrarse
const FRACTIONS = [0.6, 0.38, 0.22, 0.12, 0.06, 0.012];
const MIN_R = 14;

export function stormPhases(seed, W, H) {
  const rand = seeded((seed ^ 0x5702) >>> 0);
  const r0 = Math.hypot(W, H) / 2 + 30;
  const phases = [{ x: W / 2, y: H / 2, r: r0 }];
  const yMin = TOP + 60, yMax = H - 160;
  for (const f of FRACTIONS) {
    const prev = phases[phases.length - 1];
    const r = Math.max(MIN_R, r0 * f * (H / Math.hypot(W, H)) * 1.9);
    const room = Math.max(0, prev.r - r);
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * room * 0.85;
    let x = Math.max(r, Math.min(W - r, prev.x + Math.cos(a) * d));
    let y = Math.max(yMin, Math.min(yMax, prev.y + Math.sin(a) * d));
    const off = Math.hypot(x - prev.x, y - prev.y);
    if (off > room) { const k = room / off; x = prev.x + (x - prev.x) * k; y = prev.y + (y - prev.y) * k; }
    phases.push({ x, y, r: Math.min(r, prev.r) });
  }
  return phases;
}

// El círculo a los `s` segundos de partida. `speed`: 0,6 lenta, 1 normal, 1,6 rápida (las esperas y los cierres duran menos).
// Devuelve { x, y, r, phase, shrinking, next, left } (`next`: el círculo que viene, `left`: segundos hasta que empieza o termina de cerrarse).
export function stormAt(s, seed, W, H, speed = 1) {
  const phases = stormPhases(seed, W, H);
  const hold = HOLD / speed, shrink = SHRINK / speed;
  let t = s - STORM_START;
  if (t < 0) return { ...phases[0], phase: 0, shrinking: false, next: phases[1], left: -t + hold };
  for (let k = 1; k < phases.length; k++) {
    const a = phases[k - 1], b = phases[k];
    if (t < hold) return { ...a, phase: k - 1, shrinking: false, next: b, left: hold - t };
    t -= hold;
    if (t < shrink) {
      const f = t / shrink;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f, phase: k - 1, shrinking: true, next: b, left: shrink - t };
    }
    t -= shrink;
  }
  const last = phases[phases.length - 1];
  return { ...last, phase: phases.length - 1, shrinking: false, next: null, left: 0 };
}

export const inStorm = (storm, x, y) => Math.hypot(x - storm.x, y - storm.y) > storm.r;
