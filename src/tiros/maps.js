// Mapas de A los Tiros. El mundo mide 64 × 36 unidades (y crece hacia abajo). Cada mapa es una lista
// de rectángulos [x, y, ancho, alto] y cuatro lugares donde aparecen los jugadores.
// Fuera del mundo no hay paredes: el que se sale vuelve rebotando y pierde vida (ver `sim.js`).
export const WORLD_W = 64;
export const WORLD_H = 36;

export const MAPS = [
  {
    name: 'Clásico',
    rects: [[22, 24, 20, 2], [5, 17, 13, 2], [46, 17, 13, 2], [0, 31, 18, 5], [46, 31, 18, 5], [29, 10, 6, 2]],
    spawns: [[10, 14], [54, 14], [11, 28], [53, 28]],
  },
  {
    name: 'Torres',
    rects: [[12, 13, 5, 23], [47, 13, 5, 23], [24, 9, 16, 2], [0, 33, 64, 3], [26, 23, 12, 2]],
    spawns: [[6, 30], [58, 30], [14.5, 10], [49.5, 10]],
  },
  {
    name: 'Escalones',
    rects: [[0, 30, 14, 6], [14, 25, 10, 2], [27, 20, 10, 2], [40, 25, 10, 2], [50, 30, 14, 6], [30, 31, 4, 5]],
    spawns: [[7, 27], [57, 27], [19, 22], [45, 22]],
  },
  {
    name: 'La caja',
    rects: [[8, 31, 48, 2], [8, 8, 2, 18], [54, 8, 2, 18], [8, 6, 20, 2], [36, 6, 20, 2], [24, 19, 16, 2]],
    spawns: [[16, 28], [48, 28], [28, 16], [36, 16]],
  },
  {
    name: 'Puentes',
    rects: [[4, 12, 10, 1.5], [50, 12, 10, 1.5], [19, 17, 26, 1.5], [4, 23, 12, 1.5], [48, 23, 12, 1.5], [22, 29, 20, 1.5], [0, 34, 64, 2]],
    spawns: [[9, 9], [55, 9], [10, 20], [54, 20]],
  },
  {
    name: 'El pozo',
    rects: [[0, 28, 24, 8], [40, 28, 24, 8], [24, 34, 16, 2], [29, 14, 6, 6], [6, 18, 8, 2], [50, 18, 8, 2]],
    spawns: [[8, 25], [56, 25], [10, 15], [54, 15]],
  },
  {
    name: 'Pilares',
    rects: [[0, 32, 64, 4], [15, 20, 3, 12], [30.5, 14, 3, 18], [46, 20, 3, 12], [6, 13, 8, 2], [50, 13, 8, 2], [22, 8, 20, 2]],
    spawns: [[7, 29], [57, 29], [10, 10], [54, 10]],
  },
];
