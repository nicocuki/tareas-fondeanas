// Arena Royale: los modos de elegir las cartas. Lógica pura, sin React ni red.
//
// - Clásico (`classic`): cada uno arma su mazo de 8 en la sala de espera.
// - Doble elección (`double`): te muestran 2 cartas, 4 veces. La que no elegís se la queda tu rival.
//   Tu mazo son tus 4 elegidas más las 4 que descartó tu rival.
// - Triple elección (`triple`): te muestran 3 cartas, 8 veces. Las que no elegís se descartan.
//
// Lo que se ofrece sale de la semilla (`draft.seed`), así que la sala solo guarda qué opción tocó cada uno
// (`draft.picks[asiento]` = lista de índices) y todas las pantallas calculan las mismas ofertas.
import { CARDS, DECK_SIZE } from './cards.js';
import { mulberry32 } from './sim.js';

export const MODES = ['classic', 'double', 'triple'];
export const MODE_INFO = {
  classic: { label: 'Clásico', size: 0, rounds: 0, hint: 'Cada uno arma su mazo de 8 en la sala de espera.' },
  double: { label: 'Doble elección', size: 2, rounds: 4, hint: 'Te dan a elegir entre 2 cartas, 4 veces. La que no elegís se la queda tu rival.' },
  triple: { label: 'Triple elección', size: 3, rounds: 8, hint: 'Te dan a elegir entre 3 cartas, 8 veces. Las que no elegís se descartan.' },
};
export const PICK_SECONDS = 12;            // tiempo por elección (el reloj corre para todos a la vez)
export const draftMs = (mode) => MODE_INFO[mode].rounds * PICK_SECONDS * 1000;
export const isDraft = (mode) => mode === 'double' || mode === 'triple';
export const modeOf = (room) => (MODES.includes(room?.options?.mode) ? room.options.mode : 'classic');

const POOL = CARDS.map((c) => c.id);

function shuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// El asiento rival de cada uno: el que ocupa su mismo lugar en el otro equipo (los equipos tienen que ser parejos).
// `seats`: [{ id, team }] ya ordenados por equipo.
export function rivalIndex(seats, i) {
  const mine = seats[i];
  const rank = seats.filter((s, k) => s.team === mine.team && k < i).length;
  const others = seats.map((s, k) => [s, k]).filter(([s]) => s.team !== mine.team);
  return others.length ? others[rank % others.length][1] : -1;
}

// Las ofertas de cada asiento: `offers[asiento][ronda]` = lista de ids.
export function draftOffers(seed, seats, mode) {
  const { size, rounds } = MODE_INFO[mode];
  const rand = mulberry32(seed);
  const offers = seats.map(() => []);
  const cut = (cards) => Array.from({ length: rounds }, (_, r) => cards.slice(r * size, r * size + size));
  if (mode === 'double') {
    // Cada pareja de rivales reparte 16 cartas distintas, así tu mazo final nunca repite una.
    const done = new Set();
    seats.forEach((_, i) => {
      if (done.has(i)) return;
      const j = rivalIndex(seats, i);
      const cards = shuffle(POOL, rand);
      offers[i] = cut(cards.slice(0, rounds * size));
      done.add(i);
      if (j >= 0 && j !== i) { offers[j] = cut(cards.slice(rounds * size, rounds * size * 2)); done.add(j); }
    });
  } else {
    seats.forEach((_, i) => { offers[i] = cut(shuffle(POOL, rand).slice(0, rounds * size)); });
  }
  return offers;
}

export const roundOf = (draft, seat) => draft.picks[seat].length;
export const seatDone = (draft, seat) => draft.picks[seat].length >= MODE_INFO[draft.mode].rounds;
export const allDone = (draft) => draft.seats.every((_, i) => seatDone(draft, i));

// Las cartas que ya elegiste (en orden).
export function chosenCards(offers, picks, seat) {
  return picks[seat].map((idx, r) => offers[seat][r][idx]);
}

// Los mazos finales de cada asiento. Con la elección doble suman lo que descartó el rival.
export function decksFromPicks(draft) {
  const offers = draftOffers(draft.seed, draft.seats, draft.mode);
  return draft.seats.map((_, i) => {
    const mine = chosenCards(offers, draft.picks, i);
    if (draft.mode !== 'double') return mine;
    const j = rivalIndex(draft.seats, i);
    const theirs = offers[j].map((round, r) => round[1 - draft.picks[j][r]]);
    return [...mine, ...theirs];
  });
}

// Un mazo armado con elecciones tiene que tener justo 8 cartas distintas.
export const draftDeckOk = (deck) => deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE;
