// Mapas de A los Tiros, copiados de capturas del original (1920 × 1080 px = 64 × 36 unidades, 30 px
// cada una). El mundo crece hacia abajo. Cada mapa tiene:
//   shapes  piezas sólidas (ver `shapes.js`: rect, poly, circle, capsule, group)
//   decor   piezas oscuras de fondo que no chocan (pilares)
//   boxes   cajas sueltas [x, y, lado]: se caen, giran y las empujan las balas y los jugadores
//   spawns  cuatro lugares donde aparecen los jugadores (del 5.º en adelante, ver `spawnPoint`)
// Fuera del mundo no hay paredes: el que se cae sale disparado para arriba y pierde vida (ver `sim.js`).
import { compileShape, touchesAny } from './shapes.js';

export const WORLD_W = 64;
export const WORLD_H = 36;
export const BOX_SIZE = 1.8;
// Las sombras salen de un punto de luz arriba y al medio, y se abren hacia abajo.
export const LIGHT = [32, -4];

// Colores de cada mapa. `fill`: un color, o varios para degradés (uno distinto por pieza);
// `texture`: 'facets' (triángulos), 'paint' (manchas de otro color) o nada; `shadow`: [color, opacidad].
export const THEMES = {
  rosa: { bg: ['#123344', '#0a1a25'], fill: ['#ff2459'], texture: 'facets', shadow: ['#03081e', 0.62], light: 'rgba(170,220,255,0.05)' },
  burbujas: { bg: ['#25353b', '#0b151a'], fill: ['#e46cc0', '#a066e0', '#e8b2b8', '#c86ad0'], shadow: ['#020616', 0.7], light: 'rgba(200,225,230,0.09)' },
  copas: { bg: ['#0f3b3f', '#08212a'], fill: ['#19b2bf'], texture: 'paint', paint: '#62d052', shadow: ['#040a28', 0.66], light: 'rgba(170,255,240,0.05)' },
  castillo: { bg: ['#0f3b40', '#0a2631'], fill: ['#7b3538'], dark: '#2b2a37', shadow: ['#050c30', 0.7], light: 'rgba(170,255,240,0.05)' },
  // `accent`: color de las piezas que el mapa marca en `accent` (los pedestales amarillos de Andamios).
  madera: { bg: ['#14243a', '#0a1322'], fill: ['#93502e'], accent: '#ffb52e', dark: '#262633', shadow: ['#03060f', 0.68], light: 'rgba(255,200,140,0.05)' },
  hielo: { bg: ['#17435a', '#0b2233'], fill: ['#e8f4fb', '#cfe6f3'], texture: 'paint', paint: '#8cc6e6', shadow: ['#041020', 0.6], light: 'rgba(200,240,255,0.08)' },
  pradera: { bg: ['#123c3f', '#081d26'], fill: ['#7ad84a', '#2fbf9f', '#5fd065', '#22b5b8'], texture: 'paint', paint: '#d9ff6a', shadow: ['#02101c', 0.66], light: 'rgba(190,255,220,0.06)' },
};

// Una copa: rectángulo arriba y punta recortada abajo.
const cup = (x0, x1, top, side, bottom, cut) => ['poly', [[x0, top], [x1, top], [x1, side], [x1 - cut, bottom], [x0 + cut, bottom], [x0, side]]];

// Pentágono con la punta para abajo (`s`: medio ancho), girado `rot` radianes alrededor de su centro.
const pent = (cx, cy, s, rot = 0) => ['poly', [[-s, -s], [s, -s], [s, s * 0.4], [0, s * 1.3], [-s, s * 0.4]].map(([x, y]) => turn(cx, cy, x, y, rot))];
// Cuadrado de lado `side` girado `rot` radianes.
const diamond = (cx, cy, side, rot) => ['poly', [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => turn(cx, cy, (x * side) / 2, (y * side) / 2, rot))];
function turn(cx, cy, x, y, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [Math.round((cx + x * c - y * s) * 100) / 100, Math.round((cy + x * s + y * c) * 100) / 100];
}
// Un polígono de piso sin entrantes: lo parte en franjas verticales convexas desde el contorno de arriba hasta el fondo.
const ground = (top, bottom = WORLD_H) => ['group', top.slice(1).map((b, i) => {
  const a = top[i];
  return ['poly', [a, b, [b[0], bottom], [a[0], bottom]]];
})];

export const MAPS = [
  {
    name: 'Valle', theme: 'rosa',
    shapes: [
      ['poly', [[0, 10.6], [1.4, 10.6], [13.2, 22.2], [13.4, 36], [0, 36]]],
      ['poly', [[13.2, 24.8], [15.1, 24.2], [24.1, 33.2], [24.1, 36], [13.2, 36]]],
      ['rect', 24, 33.2, 16, 2.8],
      ['poly', [[39.9, 33.2], [64, 9.1], [64, 36], [39.9, 36]]],
      ['rect', 31.1, 2.9, 1.8, 4.4], ['rect', 31.1, 10.1, 1.8, 4.4], ['rect', 31.1, 17.3, 1.8, 4.4],
      ['rect', 31.1, 24.5, 1.8, 4.4], ['rect', 31.1, 31.7, 1.8, 1.6],
      ['poly', [[21.1, 23.1], [23, 21.2], [24.9, 23.1], [23, 25]]],
      ['poly', [[39.1, 23.1], [41, 21.2], [42.9, 23.1], [41, 25]]],
    ],
    decor: [],
    boxes: [],
    spawns: [[9.5, 16.6], [54.5, 16.6], [27.5, 31.9], [36.5, 31.9]],
  },
  {
    name: 'Burbujas', theme: 'burbujas',
    shapes: [
      ['group', [['circle', 19.2, 8.4, 2.1], ['capsule', 19.2, 9.5, 19.2, 12.25, 0.95]]],
      ['group', [['circle', 44.8, 8.4, 2.1], ['capsule', 44.8, 9.5, 44.8, 12.25, 0.95]]],
      ['circle', 32, 14, 5.45],
      ['group', [['circle', 5.2, 18, 2.1], ['capsule', 6, 18, 8.75, 18, 0.95]]],
      ['group', [['circle', 58.8, 18, 2.1], ['capsule', 55.25, 18, 58, 18, 0.95]]],
      ['group', [['capsule', 15.05, 18, 15.05, 21, 0.95], ['circle', 15.05, 22.3, 2.1]]],
      ['group', [['capsule', 48.95, 18, 48.95, 21, 0.95], ['circle', 48.95, 22.3, 2.1]]],
      ['group', [['capsule', 23.3, 16.3, 23.3, 22.3, 0.95], ['capsule', 19.3, 19.3, 23.3, 19.3, 0.95]]],
      ['group', [['capsule', 40.7, 16.3, 40.7, 22.3, 0.95], ['capsule', 40.7, 19.3, 44.7, 19.3, 0.95]]],
      ['circle', 8.1, 26.3, 2.1], ['circle', 55.9, 26.3, 2.1],
      ['group', [['circle', 32, 27.2, 4.25], ['rect', 27.75, 27.2, 1.6, 8.8], ['rect', 34.65, 27.2, 1.6, 8.8]]],
      ['group', [['circle', 0, 26.2, 3.3], ['rect', 0, 26.2, 3.3, 9.8], ['rect', 0, 32.2, 7.9, 3.8], ['circle', 7.9, 35.8, 3.6]]],
      ['group', [['circle', 64, 26.2, 3.3], ['rect', 60.7, 26.2, 3.3, 9.8], ['rect', 56.1, 32.2, 7.9, 3.8], ['circle', 56.1, 35.8, 3.6]]],
      ['group', [['capsule', 15.6, 32.9, 22.8, 32.9, 0.65], ['circle', 15.6, 32.9, 1.25], ['circle', 22.8, 32.9, 1.25]]],
      ['group', [['capsule', 41.2, 32.9, 48.4, 32.9, 0.65], ['circle', 41.2, 32.9, 1.25], ['circle', 48.4, 32.9, 1.25]]],
    ],
    decor: [],
    boxes: [],
    spawns: [[8.1, 23], [55.9, 23], [19.2, 5.1], [44.8, 5.1]],
  },
  {
    name: 'Copas', theme: 'copas',
    shapes: [
      ['poly', [[8, 29.8], [11, 29], [53, 29], [56, 29.8], [54.5, 36], [9.5, 36]]],
      cup(3.7, 6.9, 25, 28.1, 29.8, 0.8), cup(57.1, 60.3, 25, 28.1, 29.8, 0.8),
      cup(8.5, 10.9, 20, 21.6, 22.8, 0.6), cup(53.1, 55.5, 20, 21.6, 22.8, 0.6),
      cup(15.2, 17.6, 17.3, 18.8, 20.1, 0.6), cup(46.4, 48.8, 17.3, 18.8, 20.1, 0.6),
      cup(23, 25.4, 15.7, 17.6, 18.5, 0.6), cup(30.8, 33.2, 15.7, 17.6, 18.5, 0.6), cup(38.6, 41, 15.7, 17.6, 18.5, 0.6),
      cup(29.9, 34.1, 21.1, 24.3, 25.5, 1.2),
      ['group', [cup(23, 25.4, 24.5, 26.1, 27.4, 0.8), ['rect', 23.8, 27.4, 0.8, 1.7]]],
      ['group', [cup(38.6, 41, 24.5, 26.1, 27.4, 0.8), ['rect', 39.4, 27.4, 0.8, 1.7]]],
    ],
    decor: [],
    boxes: [],
    spawns: [[5.3, 23.8], [58.7, 23.8], [20, 27.8], [44, 27.8]],
  },
  {
    name: 'Castillo', theme: 'castillo',
    shapes: [
      // Las cuatro torres de abajo: franja de arriba, banda del medio y patas.
      ...[0, 15.4, 31, 46.4].flatMap((dx, i) => [
        ['rect', [3.6, 19, 34.2, 49.6][i], 24, 10.8, 0.8],
        ['rect', 1.6 + dx, 24.8, 5.4, 1.8], ['rect', 10.6 + dx, 24.8, 5.4, 1.8],
        ['rect', 1.6 + dx, 26.6, 1.8, 9.4], ['rect', 5.2 + dx, 26.6, 1.8, 9.4],
        ['rect', 10.6 + dx, 26.6, 1.8, 9.4], ['rect', 14.2 + dx, 26.6, 1.8, 9.4],
      ]),
      // Plataformas en U (los postes son cajas sueltas).
      ['rect', 11.4, 17.6, 11, 1], ['rect', 26.6, 12.2, 10.8, 1], ['rect', 41.6, 17.6, 11, 1],
      // Pedestales de las cajas chicas.
      ['rect', 8, 22.2, 1.8, 1.8], ['rect', 23.4, 22.2, 1.8, 1.8], ['rect', 38.8, 22.2, 1.8, 1.8], ['rect', 54.2, 22.2, 1.8, 1.8],
    ],
    decor: [
      ['rect', 12.6, 18.6, 1.8, 5.4], ['rect', 19, 18.6, 1.8, 5.4], ['rect', 43.2, 18.6, 1.8, 5.4], ['rect', 49.6, 18.6, 1.8, 5.4],
      ['rect', 28, 13.2, 1.8, 10.8], ['rect', 34.2, 13.2, 1.8, 10.8],
    ],
    boxes: [
      [11.4, 15.8], [20.6, 15.8], [20.6, 14], [26.6, 10.4], [35.6, 10.4], [41.6, 15.8], [41.6, 14], [50.8, 15.8],
      [8, 20.4], [23.4, 20.4], [38.8, 20.4], [54.2, 20.4],
    ].map(([x, y]) => [x, y, BOX_SIZE]),
    spawns: [[16.5, 16.4], [47.5, 16.4], [5.3, 22.8], [58.7, 22.8]],
  },
  // Los cuatro que siguen salen de capturas del original: la de la carta «Abyssal Countdown» de la wiki
  // de ROUNDS y tres del press kit de Landfall (Round7, Round8 y Round9). Esas capturas tienen la cámara
  // un poco más cerca, así que las medidas están llevadas a nuestras 64 × 36 unidades.
  {
    name: 'Corona', theme: 'rosa',
    shapes: [
      ground([[12, 24], [13.6, 24], [18, 27.7], [21.1, 27.7], [30.4, 22.2], [33.6, 22.2], [42.9, 27.7], [46, 27.7], [50.4, 24], [52, 24]]),
      ['poly', [[29.9, 9.5], [34.1, 9.5], [34.1, 13.2], [32, 15.5], [29.9, 13.2]]],
      pent(18.4, 11.7, 1.5, 0.35), pent(45.6, 11.7, 1.5, -0.35),
      diamond(19.5, 20.1, 2.9, 0.5), diamond(24.9, 16.9, 2.9, 0.5), diamond(39.1, 16.9, 2.9, -0.5), diamond(44.5, 20.1, 2.9, -0.5),
      pent(6.7, 23.4, 1.35), pent(57.3, 23.4, 1.35),
    ],
    decor: [],
    boxes: [],
    spawns: [[6.7, 20.85], [57.3, 20.85], [19.5, 26.5], [44.5, 26.5]],
  },
  {
    name: 'Andamios', theme: 'madera',
    shapes: [
      // La torre de la izquierda: tres tablones, el bloque de abajo y sus dos patas.
      ['rect', 13.2, 1, 17.4, 1.4], ['rect', 12.4, 8.2, 17.2, 1.5], ['rect', 13.2, 15.5, 17.4, 1.4],
      ['rect', 17.6, 16.9, 8.7, 2.9], ['rect', 17.3, 19.8, 2.8, 14.3], ['rect', 24, 19.8, 3, 14.3],
      ['rect', 17, 34.1, 10.5, 1.9],
      // Postes sueltos, el pilar del medio y la estructura de la derecha.
      ['rect', 6.3, 19.8, 2.7, 16.2], ['rect', 11.5, 25.6, 2.8, 10.4],
      ['rect', 39, 19.3, 2.7, 14.8], ['rect', 38.4, 34.1, 5.6, 1.9],
      ['rect', 55, 12.2, 9, 7.6], ['rect', 50.6, 15.3, 4.4, 1.5], ['rect', 57.6, 19.8, 2.6, 14.3], ['rect', 55.6, 34.1, 6.8, 1.9],
    ],
    accent: [6, 10, 14],
    decor: [['rect', 16, 2.4, 2.8, 13.1], ['rect', 24.7, 2.4, 3.1, 13.1]],
    boxes: [[38.9, 16.3, 3], [56, 9.2, 3], [25.5, 5.4, 2.8]],
    spawns: [[21.9, 14.3], [61.8, 11], [7.6, 18.6], [52.8, 14.1]],
  },
  {
    name: 'Hielo', theme: 'hielo',
    shapes: [
      ['rect', 3.5, 4.9, 5.8, 8], ['rect', 21.5, 4.9, 5.8, 2.7],
      ['group', [['rect', 43.5, 5.1, 5.7, 9.7], ['rect', 33.9, 14.8, 19.3, 2.5]]],
      ['rect', 13.5, 17.6, 5.8, 2.5], ['rect', 28.8, 23.9, 7.9, 2.6], ['rect', 55.7, 24.7, 5.9, 2.6],
      ['rect', 3.5, 26.7, 5.8, 9.3],
      ['group', [['rect', 15.6, 31.1, 3.2, 3.5], ['rect', 15.6, 34.6, 24.6, 1.4]]],
      ['rect', 48.2, 33.6, 5.7, 2.4],
    ],
    decor: [],
    boxes: [],
    spawns: [[6.4, 3.7], [46.3, 3.9], [32.7, 22.7], [58.6, 23.5]],
  },
  {
    name: 'Pradera', theme: 'pradera',
    shapes: [
      ground([[0, 23.2], [6.1, 21.6], [8.6, 21.6], [27.5, 32.6], [33.6, 33.1], [41.7, 25.1], [45.3, 25.1]]),
      ['poly', [[1.7, 0], [9.8, 0], [9.8, 4.6], [5.6, 8.1], [1.7, 4.6]]],
      ['poly', [[29.5, 0], [35.8, 0], [35.1, 1.5], [30.5, 4.1], [29.5, 3]]],
      ['poly', [[18.3, 6.3], [24.7, 10.5], [21.2, 16.1], [15, 11.9]]],
      ['poly', [[29.5, 12.5], [35.5, 16.3], [31.8, 22.2], [25.7, 18.6]]],
      ['poly', [[53.3, 21.3], [59, 21.3], [59, 24.4], [56.2, 27.3], [53.3, 24.4]]],
    ],
    decor: [],
    boxes: [],
    spawns: [[7.3, 20.4], [56.2, 20.1], [43.5, 23.9], [30.5, 31.5]],
  },
];

// Los sólidos de cada mapa, armados una sola vez.
for (const map of MAPS) map.solids = map.shapes.flatMap(compileShape);

// Dónde aparece el jugador `i` de la pelea. Los mapas tienen cuatro lugares (los del original); del
// quinto en adelante (hasta 15) cada uno aparece corrido al costado de uno de esos, y si queda adentro
// de un bloque se lo sube hasta que quede libre (después cae al piso).
export function spawnPoint(map, i) {
  const base = map.spawns[i % map.spawns.length];
  const k = Math.floor(i / map.spawns.length);
  if (!k) return base;
  const side = base[0] < WORLD_W / 2 ? 1 : -1; // hacia el medio del mapa
  const x = Math.max(2, Math.min(WORLD_W - 2, base[0] + side * k * 2.2));
  let y = base[1] - 0.4;
  for (let n = 0; n < 40 && touchesAny(x, y, 0.95, map.solids); n++) y -= 0.5;
  return [x, Math.max(1, y)];
}

export const themeOf = (map) => THEMES[map?.theme] || THEMES.rosa;
