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
export const TIMEOUT_GRACE = 5000;
export const cleanName = (name) => String(name || '').trim().slice(0, 24);
export function stepType(mode, round, count) {
  if (mode === 'story') return 'text';
  if (mode === 'imitation') return 'drawing';
  if (mode === 'sandwich') return round === 0 || round === count - 1 ? 'text' : 'drawing';
  return round % 2 === 0 ? 'text' : 'drawing';
}
export function roundDuration(mode, round, seconds) {
  return (mode === 'imitation' ? Math.max(15, seconds - round * 10) : seconds) * 1000;
}
export function makeState(players, mode, seconds, match, startedAt) {
  const roster = Object.keys(players);
  if (roster.length < 3 || roster.length > MAX_PLAYERS) throw new Error('Necesitan entre 3 y 20 jugadores.');
  if (!MODES.some((m) => m.id === mode && m.available)) throw new Error('Ese modo todavía no está disponible.');
  return {
    phase: 'playing', match, round: 0, count: roster.length, mode, seconds,
    order: Object.fromEntries(roster.map((id, i) => [i, id])),
    positions: Object.fromEntries(roster.map((id, i) => [id, i])),
    startedAt, duration: roundDuration(mode, 0, seconds),
  };
}
export function nextState(state, readyCount, now, startedAt = now) {
  if (state.phase !== 'playing') return null;
  if (readyCount < state.count && now < state.startedAt + state.duration + TIMEOUT_GRACE) return null;
  const round = state.round + 1;
  return {
    ...state, round, phase: round === state.count ? 'reveal' : 'playing', startedAt,
    duration: round === state.count ? 0 : roundDuration(state.mode, round, state.seconds),
  };
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
