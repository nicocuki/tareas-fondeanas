// Cubolandia: el mundo, generado entero desde una semilla. Todas las pantallas arman el mismo, sin
// mandarse nada por la red. Sin Math.random(): todo sale de `mulberry32` y de un ruido determinístico.
// Las coordenadas son bloques; y crece hacia abajo (y = 0 es el cielo, y = H - 1 el lecho de roca).
import { B, isSolid } from './blocks.js';

export const W = 512;
export const H = 128;
export const SEA = 45; // el agua llega hasta acá (y de la superficie del mar)
export const BIOMES = {
  plains: { name: 'Llanura', top: 'grass', color: '#7bb85a' },
  forest: { name: 'Bosque', top: 'grass', color: '#4e9a45' },
  desert: { name: 'Desierto', top: 'sand', color: '#e3cf8e' },
  snow: { name: 'Tundra nevada', top: 'snow', color: '#e8f1f8' },
  mountains: { name: 'Montañas', top: 'stone', color: '#8f9399' },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise1(x, seed) {
  const i = Math.floor(x), f = smooth(x - i);
  return hash(i, 0, seed) * (1 - f) + hash(i + 1, 0, seed) * f;
}
function noise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const fbm1 = (x, seed) => noise1(x, seed) * 0.6 + noise1(x * 2.1, seed + 7) * 0.28 + noise1(x * 4.3, seed + 13) * 0.12;
const fbm2 = (x, y, seed) => noise2(x, y, seed) * 0.65 + noise2(x * 2.3, y * 2.3, seed + 5) * 0.35;

export const at = (w, x, y) => (x < 0 || x >= W ? B.bedrock : y < 0 ? B.air : y >= H ? B.bedrock : w.t[y * W + x]);
export const setAt = (w, x, y, id) => { if (x >= 0 && x < W && y >= 0 && y < H) w.t[y * W + x] = id; };
export const solidAt = (w, x, y) => isSolid(at(w, x, y));

export function makeWorld(seed) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const t = new Uint8Array(W * H);
  const surf = new Int16Array(W);
  const biome = new Array(W);

  // Biomas y alturas por columna.
  for (let x = 0; x < W; x++) {
    const temp = fbm1(x / 150, seed + 1), moist = fbm1(x / 95, seed + 2), peak = fbm1(x / 110, seed + 3), sea = fbm1(x / 200, seed + 4);
    const mountain = smooth(Math.max(0, Math.min(1, (peak - 0.56) / 0.2)));
    let h = 41 + (fbm1(x / 38, seed + 5) - 0.5) * 12 - mountain * 24;
    if (sea > 0.66) h = Math.max(h, SEA + 3 + (sea - 0.66) * 60); // océano
    surf[x] = Math.max(8, Math.min(H - 40, Math.round(h)));
    biome[x] = mountain > 0.5 ? 'mountains' : temp > 0.6 && moist < 0.5 ? 'desert' : temp < 0.36 ? 'snow' : moist > 0.52 ? 'forest' : 'plains';
  }
  // Los biomas no cambian columna a columna: se suavizan los parpadeos de una sola.
  for (let x = 1; x < W - 1; x++) if (biome[x - 1] === biome[x + 1] && biome[x] !== biome[x - 1]) biome[x] = biome[x - 1];

  for (let x = 0; x < W; x++) {
    const s = surf[x], bio = biome[x], under = s > SEA - 1; // el fondo del mar es de arena y grava
    for (let y = s; y < H; y++) {
      const d = y - s;
      let id = B.stone;
      if (under) id = d === 0 ? B.sand : d < 4 ? (hash(x, y, seed) < 0.4 ? B.gravel : B.sand) : B.stone;
      else if (bio === 'desert') id = d < 4 ? B.sand : d < 8 ? B.sandstone : B.stone;
      else if (bio === 'mountains') id = d === 0 && y > 26 ? B.grass : B.stone;
      else if (bio === 'snow') id = d === 0 ? B.snow : d < 4 ? B.dirt : B.stone;
      else id = d === 0 ? B.grass : d < 4 ? B.dirt : B.stone;
      if (bio === 'mountains' && !under && d === 0 && y <= 26) id = B.snow;
      t[y * W + x] = id;
    }
    // Agua del mar y de los lagos.
    for (let y = SEA; y < s; y++) t[y * W + x] = B.water;
  }

  // Cuevas: túneles finitos y salones, solo bien por debajo de la superficie (con algunas bocas).
  for (let x = 0; x < W; x++) {
    for (let y = surf[x] + 3; y < H - 3; y++) {
      const a = Math.abs(fbm2(x / 16, y / 11, seed + 20) - 0.5), b = Math.abs(fbm2(x / 20 + 90, y / 13, seed + 21) - 0.5);
      const hall = fbm2(x / 24, y / 17, seed + 22);
      const deep = y > 60 ? 1 : 0.7;
      if ((a < 0.034 * deep && b < 0.09) || hall > 0.77 || (a < 0.028 && y < 60 && y > surf[x] + 5)) t[y * W + x] = y > H - 14 ? B.lava : B.air;
    }
  }
  // Lava en el fondo de todo, lagos de lava sueltos en las cuevas hondas.
  for (let x = 0; x < W; x++) for (let y = H - 14; y < H - 3; y++) if (t[y * W + x] === B.air && y > H - 12) t[y * W + x] = B.lava;

  // Lecho de roca: abajo del todo, irregular.
  for (let x = 0; x < W; x++) {
    t[(H - 1) * W + x] = B.bedrock;
    for (let k = 1; k < 4; k++) if (rand() < 0.6 - k * 0.17) t[(H - 1 - k) * W + x] = B.bedrock;
  }

  // Menas: vetas por profundidad (y). Reemplazan solo piedra.
  const vein = (block, count, size, y0, y1) => {
    for (let n = 0; n < count; n++) {
      let x = Math.floor(rand() * W), y = Math.floor(y0 + rand() * (y1 - y0));
      for (let k = 0; k < size; k++) {
        if (x > 0 && x < W && y > 0 && y < H - 4 && t[y * W + x] === B.stone) t[y * W + x] = block;
        x += Math.floor(rand() * 3) - 1;
        y += Math.floor(rand() * 3) - 1;
      }
    }
  };
  vein(B.gravel, 90, 14, 40, 110);
  vein(B.dirt, 80, 14, 40, 100);
  vein(B.coal_ore, 260, 8, 30, 120);
  vein(B.iron_ore, 170, 6, 52, 118);
  vein(B.gold_ore, 60, 5, 88, 122);
  vein(B.diamond_ore, 38, 4, 102, 123);

  // Árboles, cactus y plantas.
  let lastTree = -9;
  for (let x = 3; x < W - 3; x++) {
    const s = surf[x], bio = biome[x];
    if (s >= SEA) continue; // playa o fondo del mar
    const top = t[s * W + x];
    if (t[(s - 1) * W + x] !== B.air) continue;
    if (bio === 'desert') {
      if (top === B.sand && rand() < 0.045 && x - lastTree > 3) {
        const h = 1 + Math.floor(rand() * 3);
        for (let k = 1; k <= h; k++) t[(s - k) * W + x] = B.cactus;
        lastTree = x;
      }
      continue;
    }
    if (top !== B.grass && top !== B.snow) continue;
    const dens = bio === 'forest' ? 0.16 : bio === 'plains' ? 0.035 : bio === 'snow' ? 0.06 : 0.015;
    if (rand() < dens && x - lastTree > 3) {
      const h = 4 + Math.floor(rand() * 3);
      for (let k = 1; k <= h; k++) t[(s - k) * W + x] = B.treelog;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy >= 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          const lx = x + dx, ly = s - h + dy;
          if (ly > 0 && t[ly * W + lx] === B.air) t[ly * W + lx] = B.treeleaves;
        }
      }
      lastTree = x;
    } else if (top === B.grass && rand() < 0.2) t[(s - 1) * W + x] = rand() < 0.2 ? B.flower : B.tallgrass;
  }

  return { t, surf, biome, seed };
}

// Dónde aparece cada uno: repartidos a lo ancho del mundo, en tierra firme (no en el agua ni sobre un cactus).
export function spawnPoint(w, index, size) {
  const span = W - 80;
  let x = Math.round(40 + (span * (index + 0.5)) / Math.max(1, size));
  for (let k = 0; k < W; k++) {
    for (const cx of [x + k, x - k]) {
      if (cx < 6 || cx >= W - 6) continue;
      const s = w.surf[cx];
      if (s < SEA - 1 && at(w, cx, s - 1) === B.air && at(w, cx, s - 2) === B.air && at(w, cx, s) !== B.cactus && ![-1, 1].some((d) => at(w, cx + d, s - 1) === B.cactus)) return { x: cx + 0.5, y: s - 0.001 };
    }
  }
  return { x: x + 0.5, y: w.surf[x] - 0.001 };
}

// Los bichos del principio: vacas y cerdos sobre el pasto, de la semilla. Cada uno tiene su número.
export function animalSpawns(w) {
  const rand = mulberry32(w.seed ^ 0x5bd1e995);
  const out = [];
  for (let x = 12; x < W - 12; x += 5) {
    const bio = w.biome[x], s = w.surf[x];
    if (bio === 'desert' || bio === 'mountains' || s >= SEA - 1 || at(w, x, s - 1) !== B.air) continue;
    if (rand() < (bio === 'forest' ? 0.55 : 0.45)) out.push({ id: out.length, kind: rand() < 0.5 ? 'cow' : 'pig', x: x + 0.5, y: s - 0.001 });
  }
  return out;
}
