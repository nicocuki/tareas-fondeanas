// Fondo Kart: las pistas. Puro (sin Three.js ni red): lo usan la física, los bots, el dibujo y los tests.
//
// Cada pista es un circuito cerrado con alturas: puntos de control `[x, z, y]` (metros; y es la altura del asfalto) por
// los que pasa una curva suave (Catmull-Rom). `buildTrack` la muestrea cada 1,5 m: posición, altura, dirección, normal,
// distancia recorrida `s` y curvatura. Lo demás se ubica con un punto `[x, z]` (la muestra más cercana) y cuánto se corre
// del centro (`lat`, en fracción del medio ancho):
//   - `zones`: tramos con nombre (se anuncian al entrar), qué hay al costado (`edge`: `wall` banquina y pared, `lava` o
//     `void` te caés) y cómo se dibujan (`kind`: `tunnel`, `bridge`, `rainbow`…).
//   - `jumps`: rampas que te tiran al aire; con `glide` se abre el planeador y la pista sigue después de un pozo (`gap`)
//     que hay que cruzar volando, con monedas en el aire.
//   - `cuts`: atajos (un camino angosto por afuera de la pista, de tierra: conviene con un hongo).
//   - `obstacles`: cosas que se mueven solas según la hora de la carrera (prensas, barras de fuego, autos, rocas que
//     ruedan, géiseres, vacas, péndulos). `lap` = desde qué vuelta aparecen (las «fases»).
//   - `boxes` (filas de cajas de ítems), `pads` (aceleradores), `coins` (filas de monedas).
export const LAPS = 3;

export const TRACKS = [
  {
    id: 'valle', name: 'Valle Ventoso', emoji: '🌾', theme: 'valle', width: 15, edge: 'wall', off: 'pasto', wallAt: 6, fallAt: 1.5,
    pts: [[0, 0, 0], [90, 0, 0], [170, -10, 2], [232, -52, 6], [252, -122, 10], [222, -190, 12], [150, -222, 11], [80, -206, 7],
      [30, -200, 6], [-10, -200, 6], [-50, -200, 3], [-90, -200, 1], [-130, -200, 0], [-195, -182, 0], [-248, -122, 2],
      [-262, -40, 5], [-232, 40, 6], [-180, 92, 3], [-110, 112, 0], [-62, 78, 0], [-62, 24, 0], [-40, 0, 0]],
    zones: [
      { at: [0, 0], name: 'Pradera de largada' },
      { at: [200, -40], name: 'Subida del molino' },
      { at: [40, -200], name: 'Salto del río', kind: 'river' },
      { at: [-180, -186], name: 'Campo de girasoles' },
      { at: [-258, -70], name: 'Túnel del cerro', kind: 'tunnel' },
      { at: [-200, 80], name: 'Granja de las vacas' },
    ],
    jumps: [{ at: [20, -200], glide: true, gap: [-6, -110] }, { at: [-120, 110] }, { at: [130, -5] }],
    cuts: [{ pts: [[-140, -196], [-190, -160], [-228, -120], [-246, -88]], w: 7, pad: [-190, -160] }],
    boxes: [[60, 0], [235, -150], [-160, -192], [-205, 72]],
    pads: [[200, -30, 0.3], [-100, -201, -0.3], [-240, 30, 0]],
    coins: [[110, -2, 0, 6], [180, -180, 0.3, 5], [-225, 52, -0.3, 5], [-70, 100, 0, 5]],
    obstacles: [
      { type: 'cow', at: [-150, 106], range: 0.8, speed: 0.35 },
      { type: 'cow', at: [-80, 98], range: 0.8, speed: 0.5, ph: 2 },
      { type: 'cow', at: [-200, 82], range: 0.7, speed: 0.6, ph: 1, lap: 2 },
      { type: 'pendulum', at: [-258, -10], swing: 0.8, period: 3.2 },
      { type: 'pendulum', at: [-252, 18], swing: 0.8, period: 3.2, ph: 1.6, lap: 2 },
      { type: 'boulder', at: [250, -115], speed: 14, len: 120, lap: 3 },
    ],
    deco: { windmills: [[270, -80], [200, -250], [110, -250]], river: true },
  },
  {
    id: 'volcan', name: 'Volcán Vértigo', emoji: '🌋', theme: 'volcan', width: 14, edge: 'lava', fallAt: 1.5, wallAt: 4, off: 'pasto',
    pts: [[0, 230, 0], [100, 220, 2], [180, 170, 5], [220, 90, 9], [225, 0, 13], [190, -80, 17], [120, -140, 21], [30, -165, 25],
      [-60, -155, 29], [-130, -110, 33], [-165, -45, 37], [-195, -15, 38], [-235, 15, 30], [-275, 45, 18], [-315, 75, 6], [-340, 100, 0],
      [-352, 160, 0], [-320, 215, 0], [-250, 252, 0], [-160, 262, 0], [-80, 248, 0]],
    zones: [
      { at: [0, 230], name: 'Base del volcán' },
      { at: [222, 40], name: 'Espiral de fuego', edge: 'lava' },
      { at: [-100, -135], name: 'Borde del cráter', edge: 'lava' },
      { at: [-230, 12], name: 'Vuelo sobre la lava', kind: 'glide' },
      { at: [-348, 130], name: 'Castillo del dragón', edge: 'wall', kind: 'castle' },
      { at: [-120, 258], name: 'Puente de obsidiana', kind: 'bridge' },
    ],
    jumps: [{ at: [-190, -18], glide: true, gap: [-215, -330] }, { at: [200, 130] }, { at: [-60, -155] }],
    cuts: [],
    boxes: [[60, 226], [225, 40], [-20, -162], [-330, 190], [-200, 258]],
    pads: [[150, 190, 0], [80, -155, 0.3], [-280, 238, 0], [-120, -128, -0.3]],
    coins: [[205, 120, 0, 5], [160, -110, -0.3, 5], [-345, 150, 0, 5], [-40, 245, 0, 6]],
    obstacles: [
      { type: 'firebar', at: [225, 0], len: 0.85, speed: 1.6 },
      { type: 'firebar', at: [30, -165], len: 0.85, speed: -1.9 },
      { type: 'geyser', at: [190, -80], lat: 0.4, period: 4, ph: 0 },
      { type: 'geyser', at: [-130, -110], lat: -0.35, period: 3.6, ph: 1.5 },
      { type: 'boulder', at: [-150, -80], speed: 13, len: 200, lap: 2 },
      { type: 'crusher', at: [-352, 165], lat: -0.45, period: 2.8, ph: 0 },
      { type: 'crusher', at: [-340, 185], lat: 0.45, period: 2.8, ph: 1.4 },
      { type: 'crusher', at: [-305, 225], lat: 0, period: 3.2, ph: 0.7 },
      { type: 'firebar', at: [-250, 252], len: 0.9, speed: 2.2, lap: 3 },
    ],
    deco: { volcano: true, castle: [-330, 170] },
  },
  {
    id: 'neon', name: 'Ruta Neón', emoji: '🌃', theme: 'neon', width: 15, edge: 'wall', off: 'vereda', wallAt: 3, fallAt: 1.5,
    pts: [[-150, 0, 0], [-60, 0, 0], [0, 0, 0], [60, 0, 0], [150, 10, 0], [222, -40, 2], [242, -120, 5], [192, -190, 8], [110, -205, 10],
      [40, -152, 10], [8, -72, 10], [0, 0, 10], [-8, 72, 10], [-30, 150, 10], [-45, 205, 9], [-62, 262, 7], [-82, 318, 6],
      [-150, 368, 13], [-240, 360, 19], [-305, 290, 22], [-325, 195, 18], [-302, 110, 12], [-262, 40, 6], [-212, 10, 2]],
    zones: [
      { at: [-100, 0], name: 'Avenida Neón', kind: 'city' },
      { at: [240, -100], name: 'Autopista', kind: 'city' },
      { at: [6, -40], name: 'Paso elevado', kind: 'bridge' },
      { at: [-30, 150], name: 'Azoteas', kind: 'roof' },
      { at: [-200, 368], name: 'Ruta del cielo', edge: 'void', kind: 'rainbow' },
      { at: [-290, 80], name: 'Bajada a la ciudad', kind: 'city' },
    ],
    jumps: [{ at: [-36, 172], glide: true, gap: [-44, -76] }, { at: [180, -170] }, { at: [-322, 150] }],
    cuts: [{ pts: [[165, 2], [205, -30], [228, -70], [238, -98]], w: 6, pad: [205, -30] }],
    boxes: [[-100, 0], [242, -95], [20, -110], [-110, 350], [-318, 230]],
    pads: [[100, 4, 0], [-260, 370, 0.3], [-290, 300, -0.3], [-260, 42, 0]],
    coins: [[-50, 0, 0.3, 6], [150, -205, 0, 5], [-200, 368, 0, 6], [-310, 160, 0, 5]],
    obstacles: [
      { type: 'car', from: [-150, 0], to: [150, 10], lat: 0.4, speed: 12 },
      { type: 'car', from: [-150, 0], to: [150, 10], lat: -0.4, speed: 9, ph: 0.5 },
      { type: 'car', from: [222, -40], to: [110, -205], lat: 0.35, speed: 11, ph: 0.3, lap: 2 },
      { type: 'car', from: [-262, 40], to: [-150, 0], lat: -0.3, speed: 10, ph: 0.2, lap: 2 },
      { type: 'pendulum', at: [-240, 360], swing: 0.85, period: 2.6 },
      { type: 'pendulum', at: [-305, 290], swing: 0.85, period: 2.6, ph: 1.3, lap: 3 },
    ],
    deco: { city: true },
  },
];
// La casilla de la votación con «?» elige una al azar.
export const RANDOM_PICK = TRACKS.length;

export const STEP_M = 1.5;
export const GLIDE_MIN = 22;    // planeando, la velocidad queda entre estas dos
export const GLIDE_MAX = 26;
export const JUMP_V = 8.5;      // velocidad para arriba al salir de una rampa común
export const GLIDE_V = 9;       // y de una rampa con planeador
export const GLIDE_G = 6;       // gravedad mientras planea, hasta que baja a `sink` metros por segundo

// Altura (respecto de la rampa) a los `t` segundos de salir planeando: sube, frena y baja parejo a `sink` m/s.
export function glideY(t, sink) {
  const tc = (GLIDE_V + sink) / GLIDE_G;
  if (t < tc) return GLIDE_V * t - 0.5 * GLIDE_G * t * t;
  return GLIDE_V * tc - 0.5 * GLIDE_G * tc * tc - sink * (t - tc);
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

// Índice de la muestra más cercana a un punto (sin pista de por dónde anda: recorre todas).
const closest = (S, x, z) => { let b = 0, bd = Infinity; for (let i = 0; i < S.length; i++) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; };

const cache = new Map();
export function buildTrack(index) {
  if (cache.has(index)) return cache.get(index);
  const def = TRACKS[index] || TRACKS[0];
  const P = def.pts, n = P.length;
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
    samples.push({ x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, s });
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 1 + count) % count], b = samples[(i + 1) % count], c = samples[i];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    c.tx = dx / l; c.tz = dz / l;
    c.nx = c.tz; c.nz = -c.tx; // normal: hacia la izquierda del que avanza
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 3 + count) % count], b = samples[(i + 3) % count];
    let d = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    samples[i].k = d / (STEP_M * 6);
  }
  const half = def.width / 2;
  const idxOf = (pt) => closest(samples, pt[0], pt[1]);
  const at = (i, lat) => { const sm = samples[i % count]; return { x: sm.x + sm.nx * lat, z: sm.z + sm.nz * lat, y: sm.y, i: i % count }; };
  const inRange = (i, a, b) => (a <= b ? i >= a && i <= b : i >= a || i <= b);

  // Zonas: cada muestra sabe en qué zona está, qué tiene al costado y cómo se dibuja.
  const zones = (def.zones || []).map((z) => ({ ...z, i: idxOf(z.at) })).sort((a, b) => a.i - b.i);
  const zoneAt = new Int16Array(count), edgeAt = [], kindAt = [];
  for (let i = 0; i < count; i++) {
    let zi = zones.length - 1;
    for (let k = 0; k < zones.length; k++) if (zones[k].i <= i) zi = k;
    zoneAt[i] = zi;
    edgeAt.push(zones[zi]?.edge || def.edge);
    kindAt.push(zones[zi]?.kind || '');
  }
  // Rampas y pozos. El pozo de una rampa con planeador va del punto `gap[0]` al `gap[1]` (x de la recta).
  const gapAt = new Uint8Array(count);
  const jumps = (def.jumps || []).map((jp) => {
    const i = idxOf(jp.at);
    let gap = null;
    if (jp.gap) {
      // El pozo arranca y termina en las muestras más cercanas a esos x sobre la recta (después de la rampa).
      const near = (gx) => { let b = i, bd = Infinity; for (let o = 0; o < 140; o++) { const k = (i + o) % count, d = Math.abs(samples[k].x - gx) + Math.abs((samples[k].z - samples[i].z) * 0); if (d < bd) { bd = d; b = k; } } return b; };
      gap = [near(jp.gap[0]), near(jp.gap[1])];
      for (let k = gap[0]; k !== (gap[1] + 1) % count; k = (k + 1) % count) gapAt[k] = 1;
    }
    return { i, glide: Boolean(jp.glide), gap, ...at(i, 0) };
  });
  // Atajos: polilíneas con ancho.
  const cuts = (def.cuts || []).map((c) => ({ pts: c.pts, w: c.w, pad: c.pad, y: samples[idxOf(c.pts[0])].y }));
  const boxes = [];
  for (const b of def.boxes) { const i = idxOf(b); for (const lat of [-0.6, -0.2, 0.2, 0.6]) boxes.push(at(i, lat * half)); }
  const pads = def.pads.map(([x, z, lat]) => ({ ...at(idxOf([x, z]), lat * half), r: 2.6 }));
  for (const c of cuts) if (c.pad) pads.push({ x: c.pad[0], z: c.pad[1], y: c.y, i: idxOf(c.pad), r: 2.4, cut: true });
  // Monedas: filas en la pista y arcos en el aire sobre cada pozo de planeo (por donde pasa volando el que planea).
  const coins = [];
  for (const [x, z, lat, nCoins] of def.coins || []) {
    const i0 = idxOf([x, z]);
    for (let k = 0; k < nCoins; k++) coins.push({ ...at(i0 + k * 3, lat * half), y: samples[(i0 + k * 3) % count].y + 0.8 });
  }
  // Cada rampa con planeador calcula a qué velocidad baja (`sink`) para aterrizar apenas pasado el pozo yendo a la
  // velocidad mínima de planeo; las monedas del aire van por esa misma curva.
  for (const jp of jumps) if (jp.glide && jp.gap) {
    const steps = (jp.gap[1] - jp.i + count) % count + 4;
    const target = samples[(jp.i + steps) % count].y - jp.y;
    const T = (steps * STEP_M) / GLIDE_MIN;
    let lo = 0.5, hi = 40;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (glideY(T, mid) > target) lo = mid; else hi = mid; }
    jp.sink = (lo + hi) / 2;
    const len = steps * STEP_M - 8;
    for (let d = 12; d < len; d += 8) {
      const k = (jp.i + Math.round(d / STEP_M)) % count;
      coins.push({ x: samples[k].x, z: samples[k].z, y: jp.y + glideY(d / GLIDE_MIN, jp.sink) + 0.6, i: k, air: true, lat: Math.sin(d * 0.12) * 3 });
    }
  }
  for (const c of coins) if (c.air) { const sm = samples[c.i]; c.x += sm.nx * c.lat; c.z += sm.nz * c.lat; }
  // Obstáculos: se guarda su muestra (y, los autos, de qué muestra a cuál andan).
  const obstacles = (def.obstacles || []).map((o, k) => ({ ...o, k, i: o.at ? idxOf(o.at) : idxOf(o.from), j: o.to ? idxOf(o.to) : null }));
  // Largada: 8 lugares detrás de la línea, de a dos, escalonados.
  const grid = [];
  for (let g = 0; g < 8; g++) {
    const back = 6 + g * 4.5;
    const i = (count - Math.round(back / STEP_M)) % count;
    const sm = samples[i];
    const lat = (g % 2 === 0 ? 1 : -1) * half * 0.42;
    grid.push({ x: sm.x + sm.nx * lat, z: sm.z + sm.nz * lat, y: sm.y, yaw: yawOf(sm.tx, sm.tz), i });
  }
  const track = { ...def, index, samples, length: total, half, zones, zoneAt, edgeAt, kindAt, gapAt, jumps, cuts, boxes, pads, coins, obstacles, grid, count, inRange };
  cache.set(index, track);
  return track;
}

// El ángulo que usa la física: avanzar es ir hacia (−sin yaw, −cos yaw), como la cámara de Three.js.
export const yawOf = (tx, tz) => Math.atan2(-tx, -tz);

// La muestra más cercana a (x, z), buscando alrededor de `hint`. Sin pista (`hint` < 0) recorre todas y, si se le pasa
// `y`, prefiere la de altura parecida (en el cruce de Ruta Neón hay dos tramos uno arriba del otro).
// Devuelve { i, lat, s, y }: `y` es la altura del asfalto ahí (interpolada entre muestras).
export function nearest(track, x, z, hint = -1, y = null) {
  const S = track.samples, n = S.length;
  let best = 0, bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < n; i++) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2 + (y == null ? 0 : ((S[i].y - y) * 3) ** 2);
      if (d < bd) { bd = d; best = i; }
    }
  } else {
    for (let o = -25; o <= 25; o++) {
      const i = (hint + o + n) % n;
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  }
  const sm = S[best];
  const lat = (x - sm.x) * sm.nx + (z - sm.z) * sm.nz;
  const along = (x - sm.x) * sm.tx + (z - sm.z) * sm.tz;
  const other = S[(best + (along >= 0 ? 1 : n - 1)) % n];
  const u = Math.min(1, Math.abs(along) / STEP_M);
  return { i: best, lat, s: sm.s, y: sm.y + (other.y - sm.y) * u };
}

// ¿(x, z) está sobre un atajo? Devuelve el atajo o null.
export function cutAt(track, x, z) {
  for (const c of track.cuts) {
    for (let k = 0; k < c.pts.length - 1; k++) {
      const [ax, az] = c.pts[k], [bx, bz] = c.pts[k + 1];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if ((ax + vx * t - x) ** 2 + (az + vz * t - z) ** 2 < (c.w / 2) ** 2) return c;
    }
  }
  return null;
}

// ─── Obstáculos ──────────────────────────────────────────────────────────────
// Dónde está cada parte que golpea a la hora `t` (segundos de carrera). Todo sale de la hora: las pantallas ven lo mismo
// sin mandarse nada. Devuelve [{ x, z, y, r, kind, ...dibujo }]. `up` (prensas) es cuánto está levantada (0 = abajo).
export function obstacleParts(track, o, t) {
  const S = track.samples, n = S.length, half = track.half;
  const base = S[o.i];
  const ph = o.ph || 0;
  switch (o.type) {
    case 'cow': case 'pendulum': {
      const per = o.period || 1 / (o.speed || 0.5) * 2;
      const lat = Math.sin((t + ph) * (Math.PI * 2) / per) * (o.range || o.swing || 0.7) * half;
      return [{ x: base.x + base.nx * lat, z: base.z + base.nz * lat, y: base.y, r: o.type === 'cow' ? 1.6 : 1.5, kind: o.type, lat, ang: Math.cos((t + ph) * (Math.PI * 2) / per) }];
    }
    case 'boulder': {
      // Rueda para atrás (cuesta abajo) por la pista, de la muestra de arriba hasta `len` metros, y vuelve a empezar.
      const steps = Math.round((o.len || 120) / 1.5);
      const prog = ((t + ph) * (o.speed || 12)) / 1.5 % steps;
      const i = (o.i - Math.floor(prog) + n) % n;
      const sm = S[i];
      return [{ x: sm.x, z: sm.z, y: sm.y, r: 2.6, kind: 'boulder', roll: (t + ph) * (o.speed || 12) / 2.6 }];
    }
    case 'car': {
      const steps = (o.j - o.i + n) % n || 1;
      const prog = (((t + (ph || 0) * 30) * (o.speed || 10)) / 1.5) % steps;
      const i = (o.i + Math.floor(prog)) % n;
      const sm = S[i], lat = (o.lat || 0) * half;
      return [{ x: sm.x + sm.nx * lat, z: sm.z + sm.nz * lat, y: sm.y, r: 1.9, kind: 'car', yaw: Math.atan2(-sm.tx, -sm.tz), k: o.k }];
    }
    case 'firebar': {
      // Barra de bolas de fuego que gira sobre un poste al medio de la pista.
      const ang = (t + ph) * (o.speed || 1.5);
      const len = (o.len || 0.85) * half;
      const parts = [];
      for (let f = 1; f <= 5; f++) { const d = (f / 5) * len; parts.push({ x: base.x + Math.cos(ang) * d, z: base.z + Math.sin(ang) * d, y: base.y + 1, r: 0.9, kind: 'fire', ang, len }); }
      return parts;
    }
    case 'geyser': {
      const per = o.period || 4, c = ((t + ph) % per + per) % per;
      const active = c > per - 1.2;
      const lat = (o.lat || 0) * half;
      return [{ x: base.x + base.nx * lat, z: base.z + base.nz * lat, y: base.y, r: active ? 2.4 : 0, kind: 'geyser', h: active ? Math.sin(((c - (per - 1.2)) / 1.2) * Math.PI) : 0 }];
    }
    case 'crusher': {
      // Prensa: sube despacio, se queda arriba y cae de golpe; mientras está abajo, aplasta.
      const per = o.period || 3, c = ((t + ph) % per + per) % per;
      const up = c < per * 0.55 ? Math.min(1, c / (per * 0.4)) : c < per * 0.7 ? 1 : c < per * 0.76 ? 1 - (c - per * 0.7) / (per * 0.06) : 0;
      const lat = (o.lat || 0) * half;
      return [{ x: base.x + base.nx * lat, z: base.z + base.nz * lat, y: base.y, r: up < 0.15 ? 2.4 : 0, kind: 'crusher', up, yaw: Math.atan2(-base.tx, -base.tz) }];
    }
    default: return [];
  }
}
