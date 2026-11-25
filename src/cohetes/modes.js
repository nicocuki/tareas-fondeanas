// Modos de juego y modificadores de Cohete Royale, sin React ni red.
// - Un **modo** es cómo se gana: todos contra todos, por equipos o roba la bandera.
// - Los **modificadores** se acumulan, uno de cada bloque: la zona (qué cierra el mapa), la vida y un extra.
// Todas las pantallas leen `room.options` y calculan lo mismo, así que nada de esto viaja por la red.
import { TOP, seeded } from './terrain.js';

export const STORM_DPS = 10;       // la tormenta no mata al toque: saca 10 de vida por segundo
export const STORM_START = 30;     // segundos quietos mientras bajan todos de los helicópteros

// Los modos. `teams`: se juega de a dos equipos. `soon`: todavía no se puede elegir.
export const GAME_MODES = {
  ffa: { name: 'Todos contra todos', tag: 'Clásico', icon: 'skull', teams: false, blurb: 'Cada uno por su cuenta: gana el último tanque que queda.' },
  teams: { name: 'Por equipos', tag: 'Equipos', icon: 'crown', teams: true, blurb: 'Dos equipos, rojo y azul. Los compañeros no se hacen daño y gana el último equipo en pie.' },
  ctf: { name: 'Roba la bandera', tag: 'Nuevo', icon: 'flag', teams: true, blurb: 'Robá la bandera del otro equipo y llevala hasta la tuya. Se reaparece, no hay helicópteros y el mapa es ancho.' },
  soon: { name: 'Próximamente…', tag: 'Pronto', icon: 'hit', teams: false, soon: true, blurb: 'Se viene otro modo. Todavía no se puede elegir.' },
};
export const MODE_CARDS = Object.keys(GAME_MODES);                                  // las tarjetas que se ven
export const GAME_MODE_LIST = MODE_CARDS.filter((k) => !GAME_MODES[k].soon);        // las que se pueden elegir
export const DEFAULT_GAME_MODE = 'ffa';

// Los modificadores: cada bloque es de elegir uno solo; entre bloques se acumulan.
// zone: qué cierra el mapa · hp: vida de cada tanque · machines: bots que buscan a los jugadores.
export const MODIFIERS = {
  zone: {
    title: 'Zona', hint: 'Qué va cerrando el mapa.', default: 'water',
    choices: {
      water: { name: 'Marea', icon: ['wave'], blurb: 'El agua sube de a poco y se lleva a los que quedan abajo.' },
      storm: { name: 'Tormenta', icon: ['storm'], blurb: 'Un círculo se cierra hacia el medio: afuera te saca 10 de vida por segundo.' },
      none: { name: 'Sin peligro', icon: [], blurb: 'El mapa no se cierra. Solo te hundís si te caés al fondo.' },
      both: { name: 'Peligro total', icon: ['wave', 'storm'], blurb: 'La marea sube y la tormenta se cierra al mismo tiempo.' },
    },
  },
  life: {
    title: 'Vida', hint: 'Cuánta vida tiene cada tanque.', default: 'normal',
    choices: {
      normal: { name: 'Normal', hp: 100, blurb: '100 de vida.' },
      titans: { name: 'Titanes', hp: 200, blurb: '200 de vida: duelos largos.' },
      fragile: { name: 'Frágil', hp: 40, blurb: '40 de vida: cualquier explosión duele.' },
    },
  },
  extra: {
    title: 'Extra', hint: 'Algo más en el mapa.', default: 'none',
    choices: {
      none: { name: 'Nada nuevo', icon: [], blurb: 'Sin extras.' },
      machines: { name: 'Máquinas', icon: ['robot'], blurb: 'Tanques-robot sin nombre que patrullan el mapa buscando a quién eliminar.' },
    },
  },
};

// Lo que vale en una sala: el modo y los tres modificadores ya resueltos. Roba la bandera siempre es «Sin peligro».
export function settingsOf(options) {
  const gameMode = GAME_MODE_LIST.includes(options?.gameMode) ? options.gameMode : DEFAULT_GAME_MODE;
  const pick = (group, value) => (MODIFIERS[group].choices[value] ? value : MODIFIERS[group].default);
  const zone = gameMode === 'ctf' ? 'none' : pick('zone', options?.zone);
  const life = pick('life', options?.life);
  return {
    gameMode, mode: GAME_MODES[gameMode], ctf: gameMode === 'ctf', teams: GAME_MODES[gameMode].teams,
    zone, life, hp: MODIFIERS.life.choices[life].hp, machines: options?.extra === 'machines',
    label: `${GAME_MODES[gameMode].name} · ${MODIFIERS.zone.choices[zone].name}`,
  };
}
export const hasWater = (s) => s.zone === 'water' || s.zone === 'both';
export const hasStorm = (s) => s.zone === 'storm' || s.zone === 'both';

// ─── La tormenta ─────────────────────────────────────────────────────────────
// Un círculo que arranca cubriendo todo el mapa y se cierra por fases, cada una adentro de la anterior. Entre fase y fase el
// círculo espera (y se ve el próximo marcado) y después se achica. El último llega casi a cero: siempre termina.
const HOLD = 13;                 // segundos que espera cada fase antes de cerrarse
const SHRINK = 24;               // segundos que tarda en cerrarse
const FRACTIONS = [0.6, 0.38, 0.22, 0.12, 0.06, 0.012];
const MIN_R = 14;

export function stormPhases(seed, W, H) {
  const rand = seeded((seed ^ 0x5702) >>> 0);
  const r0 = Math.hypot(W, H) / 2 + 30;
  const phases = [{ x: W / 2, y: H / 2, r: r0 }];
  const yMin = TOP + 60, yMax = H - 160;
  for (const f of FRACTIONS) {
    const prev = phases[phases.length - 1];
    const r = Math.max(MIN_R, r0 * f * (H / Math.hypot(W, H)) * 1.9);
    const room = Math.max(0, prev.r - r);
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * room * 0.85;
    let x = Math.max(r, Math.min(W - r, prev.x + Math.cos(a) * d));
    let y = Math.max(yMin, Math.min(yMax, prev.y + Math.sin(a) * d));
    const off = Math.hypot(x - prev.x, y - prev.y);
    if (off > room) { const k = room / off; x = prev.x + (x - prev.x) * k; y = prev.y + (y - prev.y) * k; }
    phases.push({ x, y, r: Math.min(r, prev.r) });
  }
  return phases;
}

// El círculo a los `s` segundos de partida. `speed`: 0,6 lenta, 1 normal, 1,6 rápida (las esperas y los cierres duran menos).
// Devuelve { x, y, r, phase, shrinking, next, left } (`next`: el círculo que viene, `left`: segundos hasta que empieza o termina de cerrarse).
export function stormAt(s, seed, W, H, speed = 1) {
  const phases = stormPhases(seed, W, H);
  const hold = HOLD / speed, shrink = SHRINK / speed;
  let t = s - STORM_START;
  if (t < 0) return { ...phases[0], phase: 0, shrinking: false, next: phases[1], left: -t + hold };
  for (let k = 1; k < phases.length; k++) {
    const a = phases[k - 1], b = phases[k];
    if (t < hold) return { ...a, phase: k - 1, shrinking: false, next: b, left: hold - t };
    t -= hold;
    if (t < shrink) {
      const f = t / shrink;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f, phase: k - 1, shrinking: true, next: b, left: shrink - t };
    }
    t -= shrink;
  }
  const last = phases[phases.length - 1];
  return { ...last, phase: phases.length - 1, shrinking: false, next: null, left: 0 };
}

export const inStorm = (storm, x, y) => Math.hypot(x - storm.x, y - storm.y) > storm.r;
