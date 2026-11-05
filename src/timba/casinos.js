// La Timba: el casino tiene 4 pisos y se van abriendo de a uno, uno cada 3 días. Lógica pura, sin dibujo ni red.
//
// Días 1-3: solo el piso 1. Días 4-6: se suma el piso 2. Días 7-9: el 3. Días 10-12: el 4. Cuanto más alto el piso,
// más lujoso se ve (el dibujo de cada uno está en `render.js`, según `theme`).
export const DAYS_PER_FLOOR = 3;
export const FLOOR_COUNT = 4;

export const FLOOR_LOOKS = [
  { id: 1, name: 'Piso Clásico', theme: 'classic' },
  { id: 2, name: 'Piso Terciopelo', theme: 'velvet' },
  { id: 3, name: 'Piso Mármol', theme: 'marble' },
  { id: 4, name: 'Piso Dorado', theme: 'gold' },
];

const clampFloor = (n) => Math.max(1, Math.min(FLOOR_COUNT, n));
export const lookOfFloor = (n) => FLOOR_LOOKS[clampFloor(n) - 1];
// El piso más alto al que se llega el día `day`.
export const topFloor = (day) => clampFloor(Math.ceil(day / DAYS_PER_FLOOR));
// Los pisos que se pueden visitar el día `day`: del 1 hasta el que se ganó.
export const floorsOfDay = (day) => Array.from({ length: topFloor(day) }, (_, i) => i + 1);

// Dónde está cada uno: `outside` es la puerta del casino (piso 0) y `f1`…`f4` son los pisos.
export const locOfFloor = (n) => (n === 0 ? 'outside' : `f${n}`);
export const floorOfLoc = (loc) => {
  const m = /^f(\d+)$/.exec(loc);
  return m ? Number(m[1]) : null;
};
