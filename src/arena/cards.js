// Arena Royale: las 20 cartas. Los valores y cómo se ve cada una están explicados en docs/ARENA.md.
// Datos puros, sin React: los usan la simulación (sim.js), el dibujo (render.js) y las pantallas.
export const TPS = 20;                 // pasos de simulación por segundo
export const TICK_MS = 1000 / TPS;
export const T = (seconds) => Math.round(seconds * TPS);
export const TOWER_SPELL = 0.35;       // los hechizos pegan el 35 % a las torres
export const DEPLOY_TICKS = T(1);      // una tropa recién puesta tarda 1 s en activarse
export const LOAD_TICKS = T(0.3);      // lo que tarda el primer golpe

// Tamaño de la mano y del mazo.
export const HAND_SIZE = 4;
export const DECK_SIZE = 8;

// `look` es solo dibujo (render.js): colores del cuerpo y la cabeza, el arma y detalles.
//   weapon: sword | dagger | bow | gun | axe | hammer | lance | wand | fists | none
export const CARDS = [
  {
    id: 'esqueletos', name: 'Esqueletos', cost: 1, kind: 'troop', emoji: '💀', count: 3, hp: 55, dmg: 55, hit: T(1), speed: 1.5, range: 0.6, radius: 0.34, targets: 'ground',
    desc: 'Tres esqueletos baratos y rápidos.', look: { body: '#e8e2cf', head: '#f4efe0', weapon: 'none', eyes: '#222' },
  },
  {
    id: 'duendes', name: 'Duendes', cost: 2, kind: 'troop', emoji: '👺', count: 3, hp: 130, dmg: 80, hit: T(1.1), speed: 2, range: 0.6, radius: 0.38, targets: 'ground',
    desc: 'Tres duendes muy rápidos con daga.', look: { body: '#7cae3a', head: '#8fc84a', weapon: 'dagger', ears: true, belt: '#7a4b22' },
  },
  {
    id: 'arqueras', name: 'Arqueras', cost: 3, kind: 'troop', emoji: '🏹', count: 2, hp: 125, dmg: 45, hit: T(0.9), speed: 1, range: 5, radius: 0.4, targets: 'both',
    desc: 'Dos arqueras que pegan desde lejos, al suelo y al aire.', look: { body: '#4f9d4a', head: '#f1c9a5', hair: '#f06fa3', weapon: 'bow' },
  },
  {
    id: 'caballero', name: 'Caballero', cost: 3, kind: 'troop', emoji: '⚔️', hp: 690, dmg: 79, hit: T(1.2), speed: 1, range: 0.8, radius: 0.55, targets: 'ground',
    desc: 'Un tanque barato y aguantador.', look: { body: '#6f86a8', head: '#f1c9a5', hat: 'helmet', hatColor: '#9aa3ad', mustache: '#7a4b22', weapon: 'sword' },
  },
  {
    id: 'flechas', name: 'Flechas', cost: 3, kind: 'spell', emoji: '🌧️', radius: 4, dmg: 115, delay: T(0.3), air: true, style: 'arrows',
    desc: 'Una lluvia de flechas: limpia grupos chicos.',
  },
  {
    id: 'mini-pekka', name: 'Mini P.E.K.K.A', cost: 4, kind: 'troop', emoji: '🤖', hp: 610, dmg: 325, hit: T(1.6), speed: 1.5, range: 0.8, radius: 0.5, targets: 'ground',
    desc: 'Rápido y con un golpe durísimo.', look: { body: '#566074', head: '#6d7a92', hat: 'horns', hatColor: '#c9ced6', eyes: '#ff5fa8', weapon: 'sword' },
  },
  {
    id: 'mosquetera', name: 'Mosquetera', cost: 4, kind: 'troop', emoji: '🎯', hp: 340, dmg: 100, hit: T(1), speed: 1, range: 6, radius: 0.45, targets: 'both',
    desc: 'Dispara desde muy lejos, al suelo y al aire.', look: { body: '#3f6cc4', head: '#f1c9a5', hair: '#9b59d0', hat: 'pointed', hatColor: '#2f4f9a', weapon: 'gun' },
  },
  {
    id: 'valquiria', name: 'Valquiria', cost: 4, kind: 'troop', emoji: '🪓', hp: 880, dmg: 100, hit: T(1.5), speed: 1, range: 0.8, radius: 0.55, targets: 'ground', splash: 1.8, selfSplash: true,
    desc: 'Su hacha pega en círculo a todos los que la rodean.', look: { body: '#3f6cc4', head: '#f1c9a5', hair: '#f28c28', bigHair: true, weapon: 'axe' },
  },
  {
    id: 'bola-de-fuego', name: 'Bola de Fuego', cost: 4, kind: 'spell', emoji: '🔥', radius: 2.5, dmg: 330, delay: T(0.5), air: true, style: 'fire',
    desc: 'Una explosión que pega fuerte en un área.',
  },
  {
    id: 'montapuercos', name: 'Montapuercos', cost: 4, kind: 'troop', emoji: '🐗', hp: 800, dmg: 160, hit: T(1.6), speed: 2, range: 0.8, radius: 0.5, targets: 'buildings', jump: true,
    desc: 'Salta el río y va directo a un edificio o torre.', look: { body: '#8a5a2b', head: '#f1c9a5', hair: '#222', mount: '#8a5a2b', weapon: 'hammer' },
  },
  {
    id: 'bebe-dragon', name: 'Bebé Dragón', cost: 4, kind: 'troop', emoji: '🐲', hp: 800, dmg: 100, hit: T(1.5), speed: 1.5, range: 3.5, radius: 0.55, targets: 'both', fly: true, splash: 1.5,
    desc: 'Vuela y escupe fuego que pega en área.', look: { body: '#4fb59a', head: '#66cdb0', belly: '#d9f1c9', wings: '#2f8f7c', weapon: 'none' },
  },
  {
    id: 'principe', name: 'Príncipe', cost: 5, kind: 'troop', emoji: '🐴', hp: 1000, dmg: 130, hit: T(1.4), speed: 1, range: 0.8, radius: 0.6, targets: 'ground', charge: T(2),
    desc: 'Si corre 2 segundos carga: el doble de rápido y de daño.', look: { body: '#c9a227', head: '#f1c9a5', hat: 'helmet', hatColor: '#e6c44a', mount: '#8a5a2b', weapon: 'lance' },
  },
  {
    id: 'gigante', name: 'Gigante', cost: 5, kind: 'troop', emoji: '💪', hp: 2000, dmg: 126, hit: T(1.5), speed: 0.75, range: 0.9, radius: 0.85, targets: 'buildings',
    desc: 'Enorme y lento: solo ataca edificios y torres.', look: { body: '#d9822b', head: '#e8a05a', beard: '#b3401f', belt: '#7a4b22', weapon: 'fists' },
  },
  {
    id: 'globo', name: 'Globo Bomba', cost: 5, kind: 'troop', emoji: '🎈', hp: 1000, dmg: 400, hit: T(3), speed: 1, range: 0.5, radius: 0.7, targets: 'buildings', fly: true, death: { dmg: 130, radius: 2, delay: T(0.8) },
    desc: 'Vuela hasta una torre. Al caer suelta una bomba.', look: { body: '#e0482f', head: '#f4efe0', weapon: 'none', balloon: true },
  },
  {
    id: 'esbirros', name: 'Horda de Esbirros', cost: 5, kind: 'troop', emoji: '😈', count: 6, hp: 90, dmg: 45, hit: T(1), speed: 1.5, range: 1.6, radius: 0.34, targets: 'both', fly: true,
    desc: 'Seis voladores veloces.', look: { body: '#6f7f9a', head: '#8796b2', hat: 'horns', hatColor: '#3b4660', wings: '#4a5873', weapon: 'none' },
  },
  {
    id: 'canon', name: 'Cañón', cost: 3, kind: 'building', emoji: '💥', hp: 600, dmg: 80, hit: T(0.9), range: 5.5, radius: 0.8, targets: 'ground', life: T(30),
    desc: 'Edificio que dispara al suelo. Dura 30 segundos.', look: { body: '#3a3d44', base: '#8a5a2b', weapon: 'cannon' },
  },
  {
    id: 'descarga', name: 'Descarga', cost: 2, kind: 'spell', emoji: '⚡', radius: 2.5, dmg: 80, delay: T(0.1), stun: T(0.5), air: true, style: 'zap',
    desc: 'Un rayo que daña y aturde medio segundo.',
  },
  {
    id: 'mago', name: 'Mago', cost: 5, kind: 'troop', emoji: '🧙', hp: 340, dmg: 130, hit: T(1.4), speed: 1, range: 5.5, radius: 0.45, targets: 'both', splash: 1.5,
    desc: 'Sus bolas de fuego pegan en área.', look: { body: '#e0a02f', head: '#f1c9a5', hair: '#f4d26b', beard: '#f4d26b', hat: 'pointed', hatColor: '#e0a02f', weapon: 'wand' },
  },
  {
    id: 'mortero', name: 'Mortero', cost: 4, kind: 'building', emoji: '🛢️', hp: 700, dmg: 80, hit: T(5), range: 11.5, minRange: 3.5, radius: 0.8, targets: 'ground', splash: 1.5, life: T(30),
    desc: 'Pega desde muy lejos, pero no de cerca. Dura 30 segundos.', look: { body: '#7a7468', base: '#8a5a2b', weapon: 'mortar' },
  },
  {
    id: 'pekka', name: 'P.E.K.K.A', cost: 7, kind: 'troop', emoji: '🦾', hp: 3000, dmg: 600, hit: T(1.8), speed: 0.75, range: 0.9, radius: 0.8, targets: 'ground',
    desc: 'El que más pega y más aguanta. Cuesta 7.', look: { body: '#2f3346', head: '#454a66', hat: 'horns', hatColor: '#c9ced6', eyes: '#ff5fa8', weapon: 'sword' },
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const DEFAULT_DECK = ['caballero', 'arqueras', 'gigante', 'mosquetera', 'bola-de-fuego', 'flechas', 'esqueletos', 'mini-pekka'];

// Un mazo vale si son exactamente 8 cartas distintas y existentes.
export function validDeck(deck) {
  return Array.isArray(deck) && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every((id) => typeof id === 'string' && CARD_BY_ID[id]);
}

export const averageCost = (deck) => deck.reduce((n, id) => n + (CARD_BY_ID[id]?.cost || 0), 0) / (deck.length || 1);

// Cuántos segundos dice la carta (para mostrarlo).
export const seconds = (ticks) => Math.round((ticks / TPS) * 10) / 10;
