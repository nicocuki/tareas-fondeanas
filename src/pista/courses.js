// Pista Loca: las pistas y los obstáculos. Todo es puro y sale de la hora de la ronda (`t`, en segundos desde la largada),
// así todas las pantallas ven las barras, los martillos y los empujadores en el mismo lugar sin mandarse nada.
//
// Se corre hacia -z. Cada plataforma: { x0, x1, z0, z1, top, color, tile? } (es un bloque de 1 m de alto debajo de `top`).
// Obstáculos: `bar` (barra que gira alrededor de un eje vertical), `hammer` (martillo que se balancea de costado) y
// `pusher` (pistón que sale de un costado y empuja hacia el otro).

export const ROUND_KINDS = ['race', 'survive', 'final'];

const plat = (x0, x1, z0, z1, top, color) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, color });

// Una cuadrícula de baldosas que se caen al pisarlas. `id` = capa × 100 + número.
function tiles(layer, n, pitch, size, top, colors) {
  const out = [];
  const half = ((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -half + i * pitch, z = -half + j * pitch;
    out.push({ ...plat(x - size / 2, x + size / 2, z - size / 2, z + size / 2, top, colors[(i + j) % colors.length]), tile: layer * 100 + i * n + j });
  }
  return out;
}

export const COURSES = {
  // Ronda 1: carrera. Clasifican los primeros.
  race: {
    name: 'Engranajes', title: 'Carrera', goal: '¡Llegá a la meta! Clasifican los primeros.',
    seconds: 120, finishZ: -97, fallY: -12,
    platforms: [
      plat(-8, 8, -12, 3, 0, 0x5bc0eb),
      plat(-6, 6, -43, -12, 0, 0xfde74c),
      plat(-4, 1, -49, -45.5, 0, 0x9bc53d), plat(-1, 4, -55, -51.5, 0, 0x9bc53d), plat(-4, 1, -61, -57.5, 0, 0x9bc53d),
      plat(-5, 5, -91, -63.5, 0, 0xe55934),
      plat(-7, 7, -104, -91, 0, 0x5bc0eb),
    ],
    walls: [plat(-5.6, -5, -91, -63.5, 1.4, 0x8d99ae), plat(5, 5.6, -91, -63.5, 1.4, 0x8d99ae)],
    bars: [{ x: 0, z: -19, r: 6, h: 0.55, w: 1.5 }, { x: 0, z: -28, r: 6, h: 0.55, w: -1.9 }, { x: 0, z: -37, r: 6, h: 0.55, w: 2.3 }],
    hammers: [],
    pushers: [
      { side: -1, edge: -5, z: -68, d: 7, w: 1.6, ph: 0 }, { side: 1, edge: 5, z: -73, d: 7, w: 1.6, ph: 1.5 },
      { side: -1, edge: -5, z: -78, d: 7, w: 1.9, ph: 3 }, { side: 1, edge: 5, z: -83, d: 7, w: 1.9, ph: 0.7 }, { side: -1, edge: -5, z: -87.5, d: 7, w: 2.2, ph: 2.2 },
    ],
    checkpoints: [{ z: 0, x: 0 }, { z: -14, x: 0 }, { z: -63, x: 0 }, { z: -92, x: 0 }],
    start: { z: -2, x0: -6, x1: 6 },
  },
  // Ronda 2: supervivencia. Dos pisos de baldosas que se caen y una barra que barre el de arriba.
  survive: {
    name: 'Baldosas', title: 'Supervivencia', goal: '¡No te caigas! Las baldosas desaparecen al pisarlas.',
    seconds: 75, fallY: -16,
    platforms: [...tiles(0, 9, 2.4, 2.25, 0, [0xff7f50, 0xffd166]), ...tiles(1, 9, 2.4, 2.25, -7, [0x06d6a0, 0x118ab2])],
    walls: [],
    bars: [{ x: 0, z: 0, r: 11.5, h: 0.6, w: 0.8, accel: 0.01, soft: true }],
    hammers: [],
    pushers: [],
    checkpoints: [],
    start: { ring: 5, top: 0 },
  },
  // Ronda 3: la final. El primero que llega gana.
  final: {
    name: 'Martillazo', title: 'Final', goal: '¡El primero que llega a la meta gana la corona!',
    seconds: 150, finishZ: -108, fallY: -12,
    platforms: [
      plat(-8, 8, -12, 3, 0, 0xf15bb5),
      plat(-2.5, 2.5, -50, -12, 0, 0xfee440),
      plat(-7, 7, -71, -50, 0, 0x00bbf9),
      plat(-4, 4, -101, -71, 0, 0x00f5d4),
      plat(-7, 7, -114, -101, 0, 0x9b5de5),
    ],
    walls: [plat(-4.6, -4, -101, -71, 1.4, 0x8d99ae), plat(4, 4.6, -101, -71, 1.4, 0x8d99ae)],
    bars: [{ x: 0, z: -56, r: 7, h: 0.55, w: 2.0 }, { x: 0, z: -65, r: 7, h: 0.55, w: -2.4 }],
    hammers: [{ z: -20, L: 6, A: 1.05, w: 1.7, ph: 0 }, { z: -28, L: 6, A: 1.05, w: 1.9, ph: 1.4 }, { z: -36, L: 6, A: 1.05, w: 2.1, ph: 2.6 }, { z: -44, L: 6, A: 1.05, w: 2.3, ph: 0.6 }],
    pushers: [
      { side: -1, edge: -4, z: -76, d: 6, w: 1.8, ph: 0 }, { side: 1, edge: 4, z: -81, d: 6, w: 2.0, ph: 1.2 },
      { side: -1, edge: -4, z: -86, d: 6, w: 2.2, ph: 2.4 }, { side: 1, edge: 4, z: -91, d: 6, w: 2.4, ph: 0.4 }, { side: -1, edge: -4, z: -96, d: 6, w: 2.6, ph: 1.8 },
    ],
    checkpoints: [{ z: 0, x: 0 }, { z: -14, x: 0 }, { z: -51, x: 0 }, { z: -72, x: 0 }, { z: -102, x: 0 }],
    start: { z: -2, x0: -6, x1: 6 },
  },
};

// ─── Dónde está cada obstáculo a los `t` segundos ────────────────────────────
export const barAngle = (b, t) => b.w * t + (b.accel ? b.accel * t * t * Math.sign(b.w) : 0);
export const hammerAngle = (hm, t) => hm.A * Math.sin(hm.w * t + hm.ph);
export const hammerHead = (hm, t, top = 0) => { const a = hammerAngle(hm, t); return { x: hm.L * Math.sin(a), y: top + 1 + hm.L * (1 - Math.cos(a)), z: hm.z, a }; };
// Cuánto salió el pistón (0 = metido en la pared, 1 = afuera del todo). Sale rápido y vuelve despacio.
export function pusherOut(p, t) {
  const c = ((p.w * t + p.ph) / (Math.PI * 2)) % 1;
  if (c < 0.15) return c / 0.15;
  if (c < 0.35) return 1;
  if (c < 0.75) return 1 - (c - 0.35) / 0.4;
  return 0;
}
export const PUSHER_DEPTH = 2.2; // largo (en z) de la cara del pistón
export function pusherBox(p, t) {
  const e = pusherOut(p, t) * p.d;
  const inner = p.edge - p.side * e; // la cara que empuja (side -1 sale desde la izquierda hacia +x)
  const back = p.edge + p.side * 1.5;
  return { x0: Math.min(inner, back), x1: Math.max(inner, back), z0: p.z - PUSHER_DEPTH / 2, z1: p.z + PUSHER_DEPTH / 2, face: inner };
}

// Dónde larga cada uno: en filas sobre la línea de partida, o en anillo en la supervivencia.
export function startSpot(course, index, count) {
  const s = course.start;
  if (s.ring) {
    const a = (index / Math.max(1, count)) * Math.PI * 2;
    return { x: Math.cos(a) * s.ring, z: Math.sin(a) * s.ring, y: s.top, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
  }
  const perRow = 6;
  const row = Math.floor(index / perRow), col = index % perRow;
  const n = Math.min(perRow, count - row * perRow);
  const x = n <= 1 ? 0 : s.x0 + ((s.x1 - s.x0) * col) / (n - 1);
  return { x, z: s.z + row * 2, y: 0, yaw: 0 };
}
