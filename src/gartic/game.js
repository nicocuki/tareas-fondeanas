// Lógica pura: el reparto rota una posición por ronda; nadie repite una cadena.
export const MODES = [
  { id: 'normal', name: 'Normal', icon: '🎨', description: 'Escribí → dibujá → interpretá → repetí', kind: 'Texto y dibujo', available: true },
  { id: 'imitation', name: 'Imitación', icon: '👀', description: 'Memorizá → copiá cada vez más rápido', kind: 'Dibujo de memoria', available: true },
  { id: 'story', name: 'Historia', icon: '📖', description: 'Frase → continuación → continuación', kind: 'Solo escritura', available: true },
  { id: 'sandwich', name: 'Sandwich', icon: '🥪', description: 'Escribir → muchos dibujos → descripción final', kind: 'Texto y dibujo', available: true },
  ...[
    ['animation', 'Animación', 'Creá una animación frame por frame'],
    ['icebreaker', 'Rompehielos', 'Una pregunta → respuestas dibujadas'],
    ['corpse', 'Cadáver exquisito', 'Cabeza → cuerpo → piernas'],
    ['complement', 'Complementar', 'Boceto → completar → transformar'],
    ['masterpiece', 'Obra maestra', 'Un solo dibujo → sin límite de tiempo'],
    ['missing', 'Falta una parte', 'Completá → se pierde una parte → completá otra vez'],
    ['secret', 'Secreto', 'Jugá sin conocer toda la información'],
    ['coop', 'En equipo', 'Una frase → un único dibujo colaborativo'],
    ['score', 'Puntuación', 'Mantené el significado y conseguí puntos'],
    ['background', 'Fondo', 'Fondo fijo → animación encima'],
    ['solo', 'Solo', '5 frames → tu propia animación'],
  ].map(([id, name, description]) => ({ id, name, description, icon: '🔒', kind: 'Próximamente', available: false })),
];
export const MAX_PLAYERS = 20;
export const MAX_TEXT = 300;
export const MAX_DRAWING = 600000;
// Los trazos de cada dibujo, para verlo dibujarse en el álbum. Si se pasan, el álbum muestra la imagen sola.
export const MAX_STROKES = 400000;
export const TIMEOUT_GRACE = 5000;
// Tiempos por ronda (segundos). El anfitrión puede escribir otro entre MIN_SECONDS y MAX_SECONDS.
export const TIME_CHOICES = [15, 30, 45, 60, 90, 120, 180, 300];
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 600;
export const DEFAULT_SETTINGS = { maxPlayers: 12, seconds: 90, writeSeconds: 45, autoShow: true };
export const cleanName = (name) => String(name || '').trim().slice(0, 24);
export const cleanSeconds = (value, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, n)) : fallback;
};
// Las salas creadas antes tenían un solo tiempo (`seconds`) para todo.
export function roomSettings(settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  return {
    maxPlayers: s.maxPlayers,
    seconds: cleanSeconds(s.seconds, DEFAULT_SETTINGS.seconds),
    writeSeconds: cleanSeconds(settings?.writeSeconds ?? s.seconds, DEFAULT_SETTINGS.writeSeconds),
    autoShow: s.autoShow !== false,
  };
}
export function stepType(mode, round, count) {
  if (mode === 'story') return 'text';
  if (mode === 'imitation') return 'drawing';
  if (mode === 'sandwich') return round === 0 || round === count - 1 ? 'text' : 'drawing';
  return round % 2 === 0 ? 'text' : 'drawing';
}
// `timing` es un número (el mismo tiempo para todo) o { draw, write } en segundos.
export function roundDuration(mode, round, timing, count) {
  const draw = typeof timing === 'number' ? timing : timing.draw;
  const write = typeof timing === 'number' ? timing : timing.write;
  if (mode === 'imitation') return Math.max(15, draw - round * 10) * 1000;
  return (stepType(mode, round, count) === 'text' ? write : draw) * 1000;
}
const timingOf = (state) => ({ draw: state.seconds, write: state.writeSeconds ?? state.seconds });
export function makeState(players, mode, timing, match, startedAt, autoShow = true) {
  const roster = Object.keys(players);
  if (roster.length < 3 || roster.length > MAX_PLAYERS) throw new Error('Necesitan entre 3 y 20 jugadores.');
  if (!MODES.some((m) => m.id === mode && m.available)) throw new Error('Ese modo todavía no está disponible.');
  const draw = typeof timing === 'number' ? timing : timing.draw;
  const write = typeof timing === 'number' ? timing : timing.write;
  const state = {
    phase: 'playing', match, round: 0, count: roster.length, mode, seconds: draw, writeSeconds: write, autoShow,
    order: Object.fromEntries(roster.map((id, i) => [i, id])),
    positions: Object.fromEntries(roster.map((id, i) => [id, i])),
    startedAt,
  };
  return { ...state, duration: roundDuration(mode, 0, timingOf(state), state.count) };
}
export function nextState(state, readyCount, now, startedAt = now) {
  if (state.phase !== 'playing') return null;
  if (readyCount < state.count && now < state.startedAt + state.duration + TIMEOUT_GRACE) return null;
  const round = state.round + 1;
  if (round === state.count) {
    // La presentación del final: el anfitrión la maneja y todos ven lo mismo.
    return { ...state, round, phase: 'reveal', startedAt, duration: 0, show: { index: 0, playing: state.autoShow !== false, at: startedAt } };
  }
  return { ...state, round, startedAt, duration: roundDuration(state.mode, round, timingOf(state), state.count) };
}
export function previousAuthor(state, id) {
  return state.order[(state.positions[id] - 1 + state.count) % state.count];
}
export function chainOwner(state, originalIndex, round) {
  return state.order[(originalIndex + round) % state.count];
}
export function buildAlbums(state, steps, players) {
  return Array.from({ length: state.count }, (_, chain) => {
    const originalPlayer = state.order[chain];
    return {
      id: originalPlayer, name: players[originalPlayer]?.name || 'Jugador',
      steps: Array.from({ length: state.count }, (_, round) => {
        const authorId = chainOwner(state, chain, round);
        return { type: stepType(state.mode, round, state.count), content: '', ...steps?.[round]?.[authorId], authorId, order: round, name: players[authorId]?.name || 'Jugador' };
      }),
    };
  });
}

// Presentación sincronizada. Los pasos de todos los álbumes van en fila (álbum 0 paso 0, álbum 0
// paso 1, …). `show` = { index, playing, at }: desde `at` (hora del servidor) y si `playing`,
// avanza solo según cuánto dura cada paso; si no, se queda en `index` hasta que el anfitrión siga.
export const SHOW_TEXT_MS = 3000;
export const SHOW_DRAWING_MS = 6000; // los primeros REPLAY_MS se ve el dibujo haciéndose
export const REPLAY_MS = 4000;
export const SHOW_ALBUM_PAUSE_MS = 2500;
export function showDurations(state) {
  const out = [];
  for (let album = 0; album < state.count; album++) {
    for (let round = 0; round < state.count; round++) {
      const base = stepType(state.mode, round, state.count) === 'drawing' ? SHOW_DRAWING_MS : SHOW_TEXT_MS;
      out.push(base + (round === state.count - 1 ? SHOW_ALBUM_PAUSE_MS : 0));
    }
  }
  return out;
}
// Devuelve { index, since }: el paso que se ve y hace cuántos ms apareció (Infinity si no se sabe).
export function showPosition(show, now, durations) {
  const last = durations.length - 1;
  let index = Math.max(0, Math.min(last, Number(show?.index) || 0));
  if (!show?.playing || typeof show.at !== 'number') return { index, since: Infinity };
  let left = Math.max(0, now - show.at);
  while (index < last && left >= durations[index]) { left -= durations[index]; index++; }
  return { index, since: left };
}
export const showDone = (show, now, durations) => showPosition(show, now, durations).index >= durations.length - 1;
