// Abismo: los niveles de rareza, la profundidad y cómo se normaliza una respuesta. Sin React ni red:
// lo usan el reducer, las pantallas y el juez del Worker (worker/juez.js), así los tres cuentan igual.

// De la más obvia a la más nicho. `pts` son los puntos (y la profundidad en metros es pts × 10);
// `max` es la rareza (0 a 100, la estima el juez) hasta la que llega cada nivel.
export const TIERS = [
  { id: 'plancton', name: 'Plancton', pts: 10, max: 18, color: '#8fa3c4', icon: '🦠', blurb: 'Lo primero que se le ocurre a cualquiera.' },
  { id: 'vivillo', name: 'Vivillo', pts: 15, max: 34, color: '#ff9f43', icon: '🐠', blurb: 'La «rara» que dicen todos los que se hacen los vivos.' },
  { id: 'cardumen', name: 'Cardumen', pts: 30, max: 54, color: '#4de3ff', icon: '🐟', blurb: 'Conocida, pero no la primera que sale.' },
  { id: 'raro', name: 'Raro', pts: 60, max: 74, color: '#ff5252', icon: '🦑', blurb: 'Poco común de verdad. Bien ahí.' },
  { id: 'abisal', name: 'Abisal', pts: 85, max: 91, color: '#9d7bff', icon: '🐙', blurb: 'Casi nadie la conoce. Esto es nicho.' },
  { id: 'krill', name: 'Uno en un millón', pts: 100, max: 101, color: '#ffd166', icon: '🦐', blurb: 'La perla. Nadie más iba a decir eso.' },
];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));
export const MAX_PTS = TIERS[TIERS.length - 1].pts;
// Los dos niveles que cuentan como «nicho» para el ranking.
export const NICHE_TIERS = ['abisal', 'krill'];

export const tierById = (id) => TIER_BY_ID[id] || null;
export const isNiche = (id) => NICHE_TIERS.includes(id);
// Cada punto son 10 metros: 700 puntos = 7.000 m.
export const depthOf = (pts) => Math.round(Number(pts) || 0) * 10;

// De la rareza que estima el juez (0 = lo más obvio, 100 = nadie la conoce) al nivel.
export function tierForRarity(rarity) {
  const r = Math.max(0, Math.min(100, Number(rarity) || 0));
  return TIERS.find((t) => r < t.max) || TIERS[TIERS.length - 1];
}

// Topes chicos a propósito: la sala guarda hasta 10 jugadores × 10 rondas de respuestas y tiene que quedar
// lejos de los 30.000 caracteres (hay un test).
export const MAX_ANSWER = 32;
export const MAX_NOTE = 60;

// Lo que escribió el jugador, prolijo: espacios de más afuera y con tope.
export function cleanAnswer(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
}

// La clave con la que se guarda y se compara una respuesta: minúsculas, sin tildes ni signos.
// «Pingüino Emperador» y «pinguino emperador» son la misma respuesta.
export function answerKey(text) {
  // La ñ se protege antes de sacar las tildes: NFD la parte en «n» + virgulilla y se perdería.
  return cleanAnswer(text)
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Los metros, para mostrar: 1.250 m.
export const fmtDepth = (m) => `${Math.round(Number(m) || 0).toLocaleString('es-AR')} m`;
