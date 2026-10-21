// El mapa de Entre Nosotros: una copia de The Skeld (la nave de Among Us) sobre una grilla.
//
// Una casilla = una unidad del mundo. El piso es la unión de las salas y los pasillos (rectángulos
// que se tocan de costado: así quedan conectados); lo de afuera es pared. Los obstáculos (mesas,
// cajas, el reactor) no se pueden atravesar, pero no tapan la vista. Todo es puro: lo usan la física,
// la vista, el dibujo y los tests.

export const W = 126;
export const H = 75;

// Salas: id, nombre, rectángulo (en casillas) y color del piso.
export const ROOMS = [
  { id: 'upperEngine', name: 'Motor superior', x: 10, y: 6, w: 14, h: 13, floor: '#6b6f78' },
  { id: 'reactor', name: 'Reactor', x: 1, y: 24, w: 12, h: 18, floor: '#5f6772' },
  { id: 'security', name: 'Seguridad', x: 23, y: 27, w: 10, h: 11, floor: '#636a74' },
  { id: 'lowerEngine', name: 'Motor inferior', x: 10, y: 48, w: 14, h: 13, floor: '#6b6f78' },
  { id: 'medbay', name: 'Enfermería', x: 33, y: 18, w: 13, h: 11, floor: '#7d8a92' },
  { id: 'cafeteria', name: 'Cafetería', x: 50, y: 2, w: 26, h: 22, floor: '#79808c' },
  { id: 'electrical', name: 'Electricidad', x: 36, y: 42, w: 13, h: 12, floor: '#6e6a5e' },
  { id: 'storage', name: 'Depósito', x: 56, y: 44, w: 16, h: 22, floor: '#6f6a62' },
  { id: 'admin', name: 'Administración', x: 78, y: 30, w: 14, h: 11, floor: '#6c7a6f' },
  { id: 'weapons', name: 'Armas', x: 88, y: 4, w: 14, h: 13, floor: '#6a7180' },
  { id: 'o2', name: 'O2', x: 84, y: 21, w: 10, h: 7, floor: '#6c7c7a' },
  { id: 'navigation', name: 'Navegación', x: 110, y: 26, w: 14, h: 15, floor: '#68748a' },
  { id: 'shields', name: 'Escudos', x: 90, y: 54, w: 14, h: 13, floor: '#6a7180' },
  { id: 'communications', name: 'Comunicaciones', x: 74, y: 64, w: 13, h: 9, floor: '#69707c' },
];
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

// Pasillos de 4 casillas de ancho (los cortitos que unen una sala con otro pasillo, 2).
export const HALLS = [
  { x: 24, y: 9, w: 26, h: 4 },   // motor superior ↔ cafetería
  { x: 38, y: 13, w: 4, h: 5 },   // enfermería ↑ pasillo de arriba
  { x: 15, y: 19, w: 4, h: 29 },  // pasillo oeste: motor superior ↔ motor inferior
  { x: 13, y: 31, w: 2, h: 4 },   // reactor ↔ pasillo oeste
  { x: 19, y: 30, w: 4, h: 4 },   // seguridad ↔ pasillo oeste
  { x: 24, y: 56, w: 32, h: 4 },  // motor inferior ↔ depósito
  { x: 41, y: 54, w: 4, h: 2 },   // electricidad ↓ pasillo de abajo
  { x: 61, y: 24, w: 4, h: 20 },  // cafetería ↔ depósito
  { x: 65, y: 33, w: 13, h: 4 },  // administración ↔ pasillo del medio
  { x: 76, y: 8, w: 12, h: 4 },   // cafetería ↔ armas
  { x: 96, y: 17, w: 4, h: 37 },  // pasillo este: armas ↔ escudos
  { x: 94, y: 23, w: 2, h: 4 },   // O2 ↔ pasillo este
  { x: 100, y: 31, w: 10, h: 4 }, // pasillo este ↔ navegación
  { x: 72, y: 58, w: 18, h: 4 },  // depósito ↔ escudos
  { x: 79, y: 62, w: 4, h: 2 },   // comunicaciones ↑ pasillo de abajo
];

// Obstáculos: no se pasa, pero se ve por encima (mesas, cajas, camas, el núcleo del reactor).
export const OBSTACLES = [
  { x: 54, y: 6, w: 3, h: 3, kind: 'table' }, { x: 69, y: 6, w: 3, h: 3, kind: 'table' },
  { x: 54, y: 17, w: 3, h: 3, kind: 'table' }, { x: 69, y: 17, w: 3, h: 3, kind: 'table' },
  { x: 61, y: 11, w: 4, h: 4, kind: 'button' }, // la mesa del botón de emergencia
  { x: 62, y: 51, w: 4, h: 4, kind: 'crate' }, { x: 66, y: 57, w: 3, h: 3, kind: 'crate' }, { x: 58, y: 55, w: 2, h: 2, kind: 'crate' },
  { x: 5, y: 31, w: 4, h: 6, kind: 'core' },
  { x: 83, y: 34, w: 5, h: 3, kind: 'table' },
  { x: 35, y: 20, w: 3, h: 2, kind: 'bed' }, { x: 42, y: 20, w: 3, h: 2, kind: 'bed' },
  { x: 26, y: 33, w: 4, h: 2, kind: 'desk' },
];

// Grilla: `floor` = adentro de la nave; `solid` = obstáculo.
const floorGrid = new Uint8Array(W * H);
const solidGrid = new Uint8Array(W * H);
const roomGrid = new Int8Array(W * H).fill(-1);
function fill(grid, r, value) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y * W + x] = value;
}
ROOMS.forEach((r, i) => { fill(floorGrid, r, 1); fill(roomGrid, r, i); });
HALLS.forEach((r) => fill(floorGrid, r, 1));
OBSTACLES.forEach((r) => fill(solidGrid, r, 1));

const inside = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;
export const isFloor = (cx, cy) => inside(cx, cy) && floorGrid[cy * W + cx] === 1;
export const isSolid = (cx, cy) => inside(cx, cy) && solidGrid[cy * W + cx] === 1;
// No se puede pisar: pared u obstáculo.
export const isBlocked = (cx, cy) => !isFloor(cx, cy) || isSolid(cx, cy);
// Tapa la vista: solo las paredes.
export const isOpaque = (cx, cy) => !isFloor(cx, cy);
// En qué sala está un punto (null en un pasillo).
export function roomAt(x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!inside(cx, cy)) return null;
  const i = roomGrid[cy * W + cx];
  return i >= 0 ? ROOMS[i] : null;
}

// Dónde se hace cada tarea: `${tarea}:${sala}` → punto. Ver tasks.js.
export const STATIONS = {
  'wires:electrical': [38.5, 43.5], 'wires:storage': [58, 46], 'wires:admin': [80, 31.5],
  'wires:navigation': [112, 28], 'wires:cafeteria': [52, 4], 'wires:security': [31, 29],
  'card:admin': [89.5, 38],
  'download:cafeteria': [73, 4], 'download:weapons': [99.5, 6], 'download:navigation': [121.5, 28.5],
  'download:communications': [84.5, 66], 'download:electrical': [47, 44], 'upload:admin': [81, 39],
  'garbage:cafeteria': [74, 21.5], 'garbage:o2': [92, 26], 'garbage:storage': [69.5, 63.5],
  'engines:upperEngine': [12, 8.5], 'engines:lowerEngine': [12, 50.5],
  'distributor:electrical': [44, 52.5],
  'scan:medbay': [39.5, 26],
  'asteroids:weapons': [95, 10.5],
  'reactorStart:reactor': [3, 33.5], 'manifolds:reactor': [10.5, 26],
  'shields:shields': [97, 64.5],
  'steering:navigation': [122, 34], 'chart:navigation': [120, 39.5],
  'fuel:storage': [59.5, 63.5], 'fuel:upperEngine': [21.5, 17], 'fuel:lowerEngine': [21.5, 59],
  'o2filter:o2': [86, 23],
  'divert:electrical': [46.5, 43.5],
  'accept:shields': [101.5, 56], 'accept:weapons': [90.5, 15], 'accept:navigation': [112, 39.5],
  'accept:communications': [76, 70.5], 'accept:o2': [85.5, 26.5], 'accept:security': [24.5, 36],
  'accept:upperEngine': [22, 8], 'accept:lowerEngine': [22, 50],
};

export const BUTTON = { x: 63, y: 13 };        // botón de emergencia (centro de su mesa)
export const LIGHTS_PANEL = { x: 37.5, y: 52.5 }; // tablero de las luces, en Electricidad
export const REACTOR_HANDS = [{ x: 2, y: 25.5 }, { x: 2, y: 40.5 }]; // los dos lectores de mano

// Ventilaciones: cada una lleva a las de su grupo, como en el original.
export const VENTS = [
  { x: 89.5, y: 39.5, room: 'admin', to: [1, 2] },
  { x: 74.5, y: 15.5, room: 'cafeteria', to: [0, 2] },
  { x: 63, y: 41, room: null, to: [0, 1] },                 // pasillo de abajo del depósito
  { x: 118.5, y: 27.5, room: 'navigation', to: [4] },
  { x: 100.5, y: 13.5, room: 'weapons', to: [3] },
  { x: 118.5, y: 39.5, room: 'navigation', to: [6] },
  { x: 102.5, y: 58.5, room: 'shields', to: [5] },
  { x: 40, y: 50.5, room: 'electrical', to: [8, 9] },
  { x: 34.5, y: 27, room: 'medbay', to: [7, 9] },
  { x: 24.5, y: 28.5, room: 'security', to: [7, 8] },
  { x: 7, y: 25.5, room: 'reactor', to: [11] },
  { x: 16.5, y: 7.5, room: 'upperEngine', to: [10] },
  { x: 7, y: 40.5, room: 'reactor', to: [13] },
  { x: 16.5, y: 59.5, room: 'lowerEngine', to: [12] },
];

// Dónde aparece cada uno al empezar y después de cada reunión: alrededor de la mesa del botón.
export function spawnPoint(i, count) {
  const a = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  return { x: BUTTON.x + Math.cos(a) * 5, y: BUTTON.y + Math.sin(a) * 5 };
}
