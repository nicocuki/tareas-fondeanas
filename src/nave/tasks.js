// Las tareas de Entre Nosotros, como las de The Skeld. Puro: lo usan el reducer y la pantalla.
//
// Cada tarea tiene uno o más pasos, y cada paso se hace en una estación del mapa (`tarea:sala`,
// ver STATIONS en map.js). Los minijuegos están en Minigames.jsx (uno por `game`).
// Como en el original: las comunes le tocan igual a todos; las largas y las cortas, al azar.
// En la sala, una tarea es { k: tarea, s: [estación de cada paso], d: pasos hechos }.

export const TASKS = {
  // Comunes
  wires: { name: 'Arreglar cables', type: 'common', game: 'wires', steps: { pick: 3, from: ['wires:electrical', 'wires:storage', 'wires:admin', 'wires:navigation', 'wires:cafeteria', 'wires:security'] } },
  card: { name: 'Pasar la tarjeta', type: 'common', game: 'card', steps: ['card:admin'] },
  // Largas
  download: { name: 'Descargar y subir datos', type: 'long', game: 'download', steps: { one: ['download:cafeteria', 'download:weapons', 'download:navigation', 'download:communications', 'download:electrical'], then: ['upload:admin'] } },
  garbage: { name: 'Vaciar la basura', type: 'long', game: 'garbage', steps: { one: ['garbage:cafeteria', 'garbage:o2'], then: ['garbage:storage'] } },
  asteroids: { name: 'Destruir asteroides', type: 'long', game: 'asteroids', steps: ['asteroids:weapons'] },
  reactorStart: { name: 'Encender el reactor', type: 'long', game: 'simon', steps: ['reactorStart:reactor'] },
  fuel: { name: 'Cargar combustible', type: 'long', game: 'fuel', steps: ['fuel:storage', 'fuel:upperEngine', 'fuel:storage', 'fuel:lowerEngine'] },
  // Cortas
  engines: { name: 'Alinear los motores', type: 'short', game: 'engines', steps: ['engines:upperEngine', 'engines:lowerEngine'] },
  distributor: { name: 'Calibrar el distribuidor', type: 'short', game: 'distributor', steps: ['distributor:electrical'] },
  scan: { name: 'Escanearse', type: 'short', game: 'scan', steps: ['scan:medbay'] },
  manifolds: { name: 'Desbloquear el colector', type: 'short', game: 'manifolds', steps: ['manifolds:reactor'] },
  shields: { name: 'Activar los escudos', type: 'short', game: 'shields', steps: ['shields:shields'] },
  steering: { name: 'Estabilizar la dirección', type: 'short', game: 'steering', steps: ['steering:navigation'] },
  chart: { name: 'Trazar el rumbo', type: 'short', game: 'chart', steps: ['chart:navigation'] },
  o2filter: { name: 'Limpiar el filtro de O2', type: 'short', game: 'leaves', steps: ['o2filter:o2'] },
  divert: { name: 'Desviar energía', type: 'short', game: 'divert', steps: { then0: ['divert:electrical'], one: ['accept:shields', 'accept:weapons', 'accept:navigation', 'accept:communications', 'accept:o2', 'accept:security', 'accept:upperEngine', 'accept:lowerEngine'] } },
};

export const TASK_IDS = Object.keys(TASKS);
const byType = (type) => TASK_IDS.filter((k) => TASKS[k].type === type);

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pickOne = (list, rand) => list[Math.floor(rand() * list.length)];

// Los pasos concretos de una tarea para un jugador.
export function stepsFor(k, rand) {
  const steps = TASKS[k].steps;
  if (Array.isArray(steps)) return [...steps];
  if (steps.pick) return shuffle(steps.from, rand).slice(0, steps.pick);
  return [...(steps.then0 || []), ...(steps.one ? [pickOne(steps.one, rand)] : []), ...(steps.then || [])];
}

// Las comunes se eligen una vez para todos; las demás, para cada uno.
export function commonTasks(count, rand) {
  return shuffle(byType('common'), rand).slice(0, count).map((k) => ({ k, s: stepsFor(k, rand), d: 0 }));
}
export function playerTasks(common, { longTasks, shortTasks }, rand) {
  const long = shuffle(byType('long'), rand).slice(0, longTasks);
  const short = shuffle(byType('short'), rand).slice(0, shortTasks);
  return [
    ...common.map((t) => ({ ...t, s: [...t.s], d: 0 })),
    ...[...long, ...short].map((k) => ({ k, s: stepsFor(k, rand), d: 0 })),
  ];
}

export const taskDone = (t) => t.d >= t.s.length;
export const currentStation = (t) => (taskDone(t) ? null : t.s[t.d]);
