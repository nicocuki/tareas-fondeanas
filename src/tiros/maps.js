// Mapas de A los Tiros, copiados de capturas del original (1920 × 1080 px = 64 × 36 unidades, 30 px
// cada una). El mundo crece hacia abajo. Cada mapa tiene:
//   shapes  piezas sólidas (ver `shapes.js`: rect, poly, circle, capsule, group)
//   decor   piezas oscuras de fondo que no chocan (pilares)
//   boxes   cajas sueltas [x, y, lado]: se caen, giran y las empujan las balas y los jugadores
//   spawns  cuatro lugares donde aparecen los jugadores
// Fuera del mundo no hay paredes: el que se cae sale disparado para arriba y pierde vida (ver `sim.js`).
import { compileShape } from './shapes.js';

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
};

// Una copa: rectángulo arriba y punta recortada abajo.
const cup = (x0, x1, top, side, bottom, cut) => ['poly', [[x0, top], [x1, top], [x1, side], [x1 - cut, bottom], [x0 + cut, bottom], [x0, side]]];

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
];

// Los sólidos de cada mapa, armados una sola vez.
for (const map of MAPS) map.solids = map.shapes.flatMap(compileShape);

export const themeOf = (map) => THEMES[map?.theme] || THEMES.rosa;
