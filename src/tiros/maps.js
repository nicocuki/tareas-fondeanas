// Mapas de A los Tiros. El mundo mide 64 × 36 unidades (y crece hacia abajo). Cada mapa es una lista
// de rectángulos [x, y, ancho, alto, tipo] y cuatro lugares donde aparecen los jugadores.
// Tipo: 'b' bloque de color (el que se omite), 'd' pilar oscuro, 'r' bloque colgado de una soga.
// Fuera del mundo no hay paredes: el que se cae sale disparado para arriba y pierde vida (ver `sim.js`).
export const WORLD_W = 64;
export const WORLD_H = 36;

// Colores de cada mapa: fondo (arriba y abajo), bloque, cara de arriba del bloque y pilares.
export const THEMES = {
  naranja: { bg: ['#14283a', '#070f18'], block: '#b9592c', top: '#d9773f', dark: '#1d2633', light: 'rgba(255,214,170,0.07)' },
  rojo: { bg: ['#123a3c', '#071a1d'], block: '#a9434b', top: '#c75a5e', dark: '#1a2a30', light: 'rgba(190,255,240,0.07)' },
  hielo: { bg: ['#123049', '#06121f'], block: '#d6e6ef', top: '#f4fbff', dark: '#22364a', light: 'rgba(200,235,255,0.08)' },
  violeta: { bg: ['#251a3d', '#0c0816'], block: '#8a4fc0', top: '#a86bdc', dark: '#211a33', light: 'rgba(230,200,255,0.07)' },
  verde: { bg: ['#132f26', '#06140f'], block: '#4f9a5a', top: '#6dbb72', dark: '#18282a', light: 'rgba(210,255,215,0.07)' },
};

export const MAPS = [
  {
    name: 'Clásico', theme: 'naranja',
    rects: [[22, 24, 20, 2], [5, 17, 13, 2], [46, 17, 13, 2], [0, 31, 18, 5], [46, 31, 18, 5], [29, 10, 6, 2]],
    spawns: [[10, 14], [54, 14], [11, 28], [53, 28]],
  },
  {
    name: 'Colgados', theme: 'naranja',
    rects: [[3.5, 30, 3, 3, 'r'], [9.5, 27, 3, 3, 'r'], [15.5, 24.5, 3, 3, 'r'], [21.5, 23, 3, 3, 'r'], [30.5, 20, 3, 3, 'r'],
      [39.5, 23, 3, 3, 'r'], [45.5, 24.5, 3, 3, 'r'], [51.5, 27, 3, 3, 'r'], [57.5, 30, 3, 3, 'r'], [27, 25.5, 3, 3, 'r'], [34, 25.5, 3, 3, 'r']],
    spawns: [[17, 22], [47, 22], [11, 24.5], [53, 24.5]],
  },
  {
    name: 'Andamios', theme: 'rojo',
    rects: [[4, 19, 22, 1.4], [4, 27, 22, 1.4], [6, 20.4, 1.6, 15.6, 'd'], [14.2, 20.4, 1.6, 6.6, 'd'], [22.4, 20.4, 1.6, 15.6, 'd'],
      [7.5, 15.5, 3, 3.5], [19.5, 15.5, 3, 3.5], [12.5, 24, 5, 3],
      [38, 19, 22, 1.4], [38, 27, 22, 1.4], [40, 20.4, 1.6, 15.6, 'd'], [48.2, 20.4, 1.6, 6.6, 'd'], [56.4, 20.4, 1.6, 15.6, 'd'],
      [41.5, 15.5, 3, 3.5], [53.5, 15.5, 3, 3.5], [46.5, 24, 5, 3],
      [28.5, 12, 7, 2], [28.5, 19, 7, 2], [29.2, 14, 1.2, 5, 'd'], [33.6, 14, 1.2, 5, 'd'], [29, 26, 6, 10]],
    spawns: [[9, 13], [55, 13], [12.5, 17.5], [51.5, 17.5]],
  },
  {
    name: 'Torres', theme: 'violeta',
    rects: [[12, 13, 5, 23, 'd'], [47, 13, 5, 23, 'd'], [11, 11, 7, 2], [46, 11, 7, 2], [24, 9, 16, 2], [0, 33, 22, 3], [42, 33, 22, 3], [26, 23, 12, 2]],
    spawns: [[6, 30], [58, 30], [14.5, 8.5], [49.5, 8.5]],
  },
  {
    name: 'Escalones', theme: 'verde',
    rects: [[0, 30, 14, 6], [14, 25, 10, 2], [27, 20, 10, 2], [40, 25, 10, 2], [50, 30, 14, 6], [30, 31, 4, 5, 'd']],
    spawns: [[7, 27], [57, 27], [19, 22], [45, 22]],
  },
  {
    name: 'Hielo', theme: 'hielo',
    rects: [[3, 6, 8, 9], [22, 6, 9, 3], [42, 9, 8, 13], [33, 22, 21, 3], [13, 23, 8, 3], [3, 31, 8, 5], [24, 33, 14, 3], [56, 31, 6, 5], [52, 4, 8, 3]],
    spawns: [[7, 3], [56, 1.5], [17, 20], [52, 20]],
  },
  {
    name: 'Puentes', theme: 'rojo',
    rects: [[4, 12, 10, 1.5], [50, 12, 10, 1.5], [19, 17, 26, 1.5], [4, 23, 12, 1.5], [48, 23, 12, 1.5], [22, 29, 20, 1.5], [8, 13.5, 1.2, 9.5, 'd'], [54.8, 13.5, 1.2, 9.5, 'd']],
    spawns: [[11, 9], [53, 9], [12, 20], [52, 20]],
  },
  {
    name: 'El pozo', theme: 'violeta',
    rects: [[0, 28, 24, 8], [40, 28, 24, 8], [29, 14, 6, 6], [6, 18, 8, 2], [50, 18, 8, 2]],
    spawns: [[8, 25], [56, 25], [10, 15], [54, 15]],
  },
  {
    name: 'Pilares', theme: 'verde',
    rects: [[0, 32, 64, 4], [15, 20, 3, 12, 'd'], [30.5, 14, 3, 18, 'd'], [46, 20, 3, 12, 'd'], [14, 18.5, 5, 1.5], [45, 18.5, 5, 1.5], [6, 13, 8, 2], [50, 13, 8, 2], [22, 8, 20, 2]],
    spawns: [[7, 29], [57, 29], [10, 10], [54, 10]],
  },
];

export const themeOf = (map) => THEMES[map?.theme] || THEMES.naranja;
export const kindOf = (rect) => rect[4] || 'b';
