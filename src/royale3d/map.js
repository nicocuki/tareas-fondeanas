// Royale 3D: la isla. Todo sale de la semilla de la partida, sin `Math.random()`: todas las pantallas
// arman el mismo terreno, los mismos árboles y la misma tormenta sin mandarse nada por la red.
// Unidades: metros. El agua está en y = 0; el mundo es plano en (x, z) y la altura es y.

export const ISLAND_R = 62;      // desde el centro hasta donde el terreno se hunde en el mar
export const WORLD_R = 74;       // más lejos de acá no se puede ir
export const WADE_MIN = -0.9;    // se camina por la orilla hasta esta profundidad; más hondo es mar abierto

// Número al azar de a uno (mulberry32), parejo en todos los navegadores.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valores: una grilla de números al azar con interpolación suave (solo sumas y productos).
function lattice(seed, ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise(seed, x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = lattice(seed, ix, iz), b = lattice(seed, ix + 1, iz), c = lattice(seed, ix, iz + 1), d = lattice(seed, ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Altura del terreno en un punto. Colinas suaves en el medio y playa que se hunde hacia el borde.
export function heightAt(seed, x, z) {
  const r = Math.sqrt(x * x + z * z);
  const edge = Math.max(0, Math.min(1, (ISLAND_R - r) / 22));
  const hills = noise(seed, x / 16, z / 16) * 7 + noise(seed + 101, x / 6, z / 6) * 2 - 1.5;
  const land = 1.8 + Math.max(0, hills) * edge;
  return smooth(edge) * land - (1 - smooth(edge)) * 3;
}

// Qué hay en la isla: árboles y rocas (cilindros) y cabañas (cajas). Todo se esquiva con los mismos choques.
export function makeWorld(seed) {
  const rand = rng(seed ^ 0x51ed);
  const trees = [], rocks = [], cabins = [];
  const taken = [];
  const free = (x, z, r) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + r) ** 2);
  const land = (x, z, min = 0.9) => heightAt(seed, x, z) > min && x * x + z * z < (ISLAND_R - 7) ** 2;
  const place = (count, r, make, tries = 40) => {
    for (let n = 0; n < count; n++) {
      for (let t = 0; t < tries; t++) {
        const x = (rand() * 2 - 1) * (ISLAND_R - 8), z = (rand() * 2 - 1) * (ISLAND_R - 8);
        if (!land(x, z) || (x * x + z * z < 36) || !free(x, z, r)) continue;
        const item = make(x, z);
        taken.push({ x, z, r });
        return item;
      }
    }
    return null;
  };
  for (let i = 0; i < 7; i++) {
    const w = 5 + Math.floor(rand() * 3), d = 5 + Math.floor(rand() * 3);
    const c = place(1, Math.max(w, d), (x, z) => ({ x, z, w, d, h: 3.2, y: heightAt(seed, x, z) }), 80);
    if (c) cabins.push(c);
  }
  for (let i = 0; i < 80; i++) {
    const t = place(1, 1.4, (x, z) => ({ x, z, r: 0.5, h: 5 + rand() * 3, y: heightAt(seed, x, z), k: rand() }));
    if (t) trees.push(t);
  }
  for (let i = 0; i < 22; i++) {
    const t = place(1, 1.6, (x, z) => ({ x, z, r: 0.9 + rand() * 0.9, h: 1.4 + rand() * 1.6, y: heightAt(seed, x, z) - 0.4, k: rand() }));
    if (t) rocks.push(t);
  }
  return { seed, trees, rocks, cabins };
}

// Dónde aparece el jugador número `index` de `size`: repartidos en un anillo sobre tierra firme, mirando al centro.
// Con `world` esquiva árboles, rocas y cabañas (deja 1,5 m libres alrededor).
export function spawnPoint(seed, index, size, world = null) {
  const a = (index / Math.max(1, size)) * Math.PI * 2 + 0.4;
  const clear = (x, z) => !world || (
    world.trees.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + 1.5) ** 2)
    && world.rocks.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + 1.5) ** 2)
    && world.cabins.every((c) => Math.abs(c.x - x) > c.w / 2 + 1.5 || Math.abs(c.z - z) > c.d / 2 + 1.5)
  );
  for (let r = ISLAND_R * 0.62; r > 8; r -= 1) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(seed, x, z) > 1 && clear(x, z)) return { x, z, yaw: Math.atan2(x, z) };
  }
  return { x: 0, z: 0, yaw: 0 };
}

// ─── La tormenta ─────────────────────────────────────────────────────────────
// Círculos que se achican y se meten uno dentro del otro. Cada fase: espera, achica y deja el círculo nuevo.
export const STORM_PHASES = [
  { wait: 50, shrink: 40, r: 44, dps: 1 },
  { wait: 30, shrink: 35, r: 28, dps: 2 },
  { wait: 25, shrink: 30, r: 15, dps: 4 },
  { wait: 20, shrink: 25, r: 7, dps: 6 },
  { wait: 15, shrink: 20, r: 1.5, dps: 9 },
];
export const STORM_START_R = 80;
export const STORM_SPEEDS = { normal: 1, rapida: 0.6 };

// Centros de cada fase: cada círculo nuevo cabe adentro del anterior.
export function stormCenters(seed) {
  const rand = rng(seed ^ 0x7a31);
  let cx = 0, cz = 0, r0 = STORM_START_R;
  const out = [{ x: 0, z: 0, r: STORM_START_R }];
  for (const ph of STORM_PHASES) {
    let ox = 0, oz = 0;
    for (let i = 0; i < 20; i++) { ox = rand() * 2 - 1; oz = rand() * 2 - 1; if (ox * ox + oz * oz <= 1) break; }
    const reach = Math.max(0, r0 - ph.r) * 0.85;
    cx += ox * reach; cz += oz * reach; r0 = ph.r;
    out.push({ x: cx, z: cz, r: ph.r });
  }
  return out;
}

// La tormenta a los `t` segundos de empezar: { x, z, r, phase (0 = antes de la primera), shrinking, next (segundos para que cambie), dps }.
export function stormAt(seed, t, speed = 1, centers = stormCenters(seed)) {
  let left = Math.max(0, t);
  for (let i = 0; i < STORM_PHASES.length; i++) {
    const ph = STORM_PHASES[i];
    const wait = ph.wait * speed, shrink = ph.shrink * speed;
    const from = centers[i], to = centers[i + 1];
    if (left < wait) return { x: from.x, z: from.z, r: from.r, phase: i, shrinking: false, next: wait - left, dps: i === 0 ? 0 : STORM_PHASES[i - 1].dps };
    left -= wait;
    if (left < shrink) {
      const k = left / shrink;
      return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k, r: from.r + (to.r - from.r) * k, phase: i, shrinking: true, next: shrink - left, dps: ph.dps };
    }
    left -= shrink;
  }
  const last = centers[centers.length - 1];
  return { x: last.x, z: last.z, r: last.r, phase: STORM_PHASES.length, shrinking: false, next: 0, dps: STORM_PHASES[STORM_PHASES.length - 1].dps };
}
