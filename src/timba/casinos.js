// La Timba: los cuatro casinos y sus pisos. Lógica pura, sin dibujo ni red.
//
// Cada casino dura 3 días y tiene 3 pisos: casino 1 = días 1-3 y pisos 1-3, casino 2 = días 4-6 y pisos 4-6, y así
// hasta el casino 4 (días 10-12, pisos 10-12). Cuanto más se avanza, más lujoso se ve (el dibujo de cada uno está en
// `render.js`, según `theme`).
export const DAYS_PER_CASINO = 3;
export const FLOORS_PER_CASINO = 3;

export const CASINOS = [
  { id: 1, name: 'Casino Clásico', theme: 'classic' },
  { id: 2, name: 'Casino Terciopelo', theme: 'velvet' },
  { id: 3, name: 'Casino Mármol', theme: 'marble' },
  { id: 4, name: 'Casino Dorado', theme: 'gold' },
];
export const CASINO_COUNT = CASINOS.length;
export const FLOOR_COUNT = CASINO_COUNT * FLOORS_PER_CASINO;

const clampCasino = (c) => Math.max(1, Math.min(CASINO_COUNT, c));
export const casinoOfDay = (day) => clampCasino(Math.ceil(day / DAYS_PER_CASINO));
export const casinoOfFloor = (floor) => clampCasino(Math.ceil(floor / FLOORS_PER_CASINO));
export const casinoById = (id) => CASINOS[clampCasino(id) - 1];

// Los pisos que se pueden visitar el día `day` (los 3 de su casino).
export const floorsOfDay = (day) => {
  const first = (casinoOfDay(day) - 1) * FLOORS_PER_CASINO + 1;
  return Array.from({ length: FLOORS_PER_CASINO }, (_, i) => first + i);
};

// Dónde está cada uno: `outside` es la puerta del casino (piso 0) y `f1`…`f12` son los pisos.
export const locOfFloor = (n) => (n === 0 ? 'outside' : `f${n}`);
export const floorOfLoc = (loc) => {
  const m = /^f(\d+)$/.exec(loc);
  return m ? Number(m[1]) : null;
};
