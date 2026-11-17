// Fondo Kart: las 7 pistas. Puro (sin Three.js ni red): lo usan la física, los bots, el dibujo y los tests.
//
// Cada pista es un circuito cerrado: puntos de control (en metros, x/z en el piso) por los que pasa una curva suave
// (Catmull-Rom). `buildTrack` la muestrea cada ~1,5 m: posición, dirección, normal (hacia la izquierda), distancia
// recorrida `s` y curvatura. Todo lo demás (largada, cajas de ítems, aceleradores) se ubica por `s` y por cuánto se
// corre del centro.
//
// Qué hay afuera del asfalto (`edge`):
//   - `wall`: banquina lenta (`off`, pasto/arena/nieve) y una pared a `wallAt` metros del borde.
//   - `lava` / `void`: pasado `fallAt` metros del borde te caés y volvés a la pista (el castillo y el espacio).
export const LAPS = 3;

export const TRACKS = [
  {
    id: 'pradera', name: 'Pradera del Fondo', emoji: '🌳', theme: 'pradera', width: 15, edge: 'wall', off: 'pasto', wallAt: 5,
    pts: [[0, -120], [70, -120], [120, -80], [130, -10], [100, 40], [40, 50], [10, 90], [30, 140], [-20, 170], [-90, 150], [-120, 80], [-110, 0], [-80, -80], [-50, -115]],
    boxes: [0.2, 0.52, 0.8], pads: [0.36, 0.67],
  },
  {
    id: 'playa', name: 'Playa Pomelo', emoji: '🏖️', theme: 'playa', width: 15, edge: 'wall', off: 'arena', wallAt: 6,
    pts: [[0, -100], [80, -110], [150, -70], [170, 0], [140, 60], [80, 70], [40, 40], [0, 60], [-30, 110], [-100, 120], [-160, 70], [-160, -20], [-110, -80], [-50, -100]],
    boxes: [0.18, 0.47, 0.76], pads: [0.3, 0.62, 0.9],
  },
  {
    id: 'desierto', name: 'Cañón Cactus', emoji: '🌵', theme: 'desierto', width: 14, edge: 'wall', off: 'arena', wallAt: 5,
    pts: [[0, -140], [60, -150], [110, -120], [110, -60], [60, -40], [50, 0], [110, 30], [130, 90], [80, 140], [0, 130], [-30, 80], [-80, 100], [-130, 60], [-120, -20], [-80, -60], [-60, -120]],
    boxes: [0.15, 0.45, 0.74], pads: [0.28, 0.58, 0.86],
  },
  {
    id: 'nieve', name: 'Cumbre Helada', emoji: '❄️', theme: 'nieve', width: 15, edge: 'wall', off: 'nieve', wallAt: 5,
    pts: [[0, -130], [90, -120], [140, -60], [110, 0], [140, 60], [100, 120], [20, 110], [-20, 60], [-70, 110], [-140, 90], [-150, 10], [-100, -30], [-130, -90], [-70, -130]],
    boxes: [0.2, 0.5, 0.79], pads: [0.35, 0.64],
  },
  {
    id: 'lava', name: 'Castillo Volcán', emoji: '🌋', theme: 'lava', width: 14, edge: 'lava', fallAt: 3,
    pts: [[0, -120], [100, -120], [140, -70], [90, -30], [140, 20], [130, 90], [60, 120], [0, 80], [-60, 120], [-130, 90], [-140, 20], [-90, -10], [-130, -70], [-80, -120]],
    boxes: [0.17, 0.48, 0.77], pads: [0.32, 0.63, 0.9],
  },
  {
    id: 'ciudad', name: 'Ciudad Neón', emoji: '🌃', theme: 'ciudad', width: 15, edge: 'wall', off: 'vereda', wallAt: 3,
    pts: [[0, -130], [110, -130], [130, -110], [130, -20], [110, 0], [40, 0], [20, 20], [20, 90], [40, 110], [110, 110], [130, 130], [110, 160], [-100, 160], [-130, 130], [-130, -110], [-110, -130]],
    boxes: [0.16, 0.44, 0.72], pads: [0.3, 0.58, 0.88],
  },
  {
    id: 'espacio', name: 'Ruta Estelar', emoji: '🌈', theme: 'espacio', width: 14, edge: 'void', fallAt: 1,
    pts: [[0, -150], [90, -140], [150, -80], [130, 0], [170, 70], [110, 140], [30, 110], [-10, 150], [-90, 160], [-150, 100], [-110, 40], [-160, -30], [-120, -110], [-60, -150]],
    boxes: [0.19, 0.49, 0.78], pads: [0.27, 0.4, 0.6, 0.88],
  },
];
// La casilla 8 de la votación: «?» elige una al azar.
export const RANDOM_PICK = TRACKS.length;

const STEP_M = 1.5;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

const cache = new Map();
// La pista lista para usar: `{ ...def, samples: [{ x, z, tx, tz, nx, nz, s, k }], length, half, boxes: [{ x, z }], pads: [...], grid }`.
export function buildTrack(index) {
  if (cache.has(index)) return cache.get(index);
  const def = TRACKS[index] || TRACKS[0];
  const P = def.pts, n = P.length;
  // Curva densa y después remuestreo a paso parejo.
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let j = 0; j < 40; j++) dense.push(catmull(p0, p1, p2, p3, j / 40));
  }
  let total = 0;
  const acc = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; total += Math.hypot(b[0] - a[0], b[1] - a[1]); acc.push(total); }
  const count = Math.round(total / STEP_M);
  const samples = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * total;
    while (acc[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const u = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    samples.push({ x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, s });
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 1 + count) % count], b = samples[(i + 1) % count], c = samples[i];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    c.tx = dx / l; c.tz = dz / l;
    c.nx = c.tz; c.nz = -c.tx; // normal: a la izquierda de la dirección de avance... visto desde arriba con z hacia abajo
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 3 + count) % count], b = samples[(i + 3) % count];
    let d = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    samples[i].k = d / (STEP_M * 6); // radianes por metro (+ dobla para un lado, − para el otro)
  }
  const half = def.width / 2;
  const at = (frac, lat) => { const sm = samples[Math.floor(frac * count) % count]; return { x: sm.x + sm.nx * lat, z: sm.z + sm.nz * lat, i: Math.floor(frac * count) % count }; };
  const boxes = [];
  for (const f of def.boxes) for (const lat of [-0.6, -0.2, 0.2, 0.6]) boxes.push(at(f, lat * half));
  const pads = def.pads.map((f, k) => ({ ...at(f, (k % 3 - 1) * half * 0.35), r: 2.6 }));
  // Largada: 8 lugares detrás de la línea, de a dos, escalonados.
  const grid = [];
  for (let g = 0; g < 8; g++) {
    const back = 6 + g * 4.5;
    const i = (count - Math.round(back / STEP_M)) % count;
    const sm = samples[i];
    const lat = (g % 2 === 0 ? 1 : -1) * half * 0.42;
    grid.push({ x: sm.x + sm.nx * lat, z: sm.z + sm.nz * lat, yaw: yawOf(sm.tx, sm.tz), i });
  }
  const track = { ...def, index, samples, length: total, half, boxes, pads, grid, count };
  cache.set(index, track);
  return track;
}

// El ángulo que usa la física: avanzar es ir hacia (−sin yaw, −cos yaw), como la cámara de Three.js.
export const yawOf = (tx, tz) => Math.atan2(-tx, -tz);

// La muestra más cercana a (x, z), buscando alrededor de `hint` (o en toda la pista si no hay pista de por dónde anda).
export function nearest(track, x, z, hint = -1) {
  const S = track.samples, n = S.length;
  let best = 0, bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < n; i += 2) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    hint = best;
  }
  bd = Infinity;
  for (let o = -25; o <= 25; o++) {
    const i = (hint + o + n) % n;
    const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const sm = S[best];
  const lat = (x - sm.x) * sm.nx + (z - sm.z) * sm.nz;
  return { i: best, lat, s: sm.s };
}
