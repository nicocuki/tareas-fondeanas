// Blackjack de La Timba: lo puro (cartas, valores, mazo, croupier y pagos). Sin React ni red; el reducer de
// la sala (`game.js`) lo usa dentro de la transacción y recibe el azar por parámetro.
//
// Una carta es un número de 0 a 51: `c % 13` es el valor (0 = As, 1 a 9 = 2 a 10, 10 a 12 = J, Q, K) y
// `Math.floor(c / 13)` el palo.
export const DECKS = 4;          // el mazo es de 4 barajas juntas
export const RESHUFFLE_UNDER = 60; // con menos cartas que esto se vuelve a mezclar antes de repartir

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const rankOf = (c) => RANKS[c % 13];
export const suitOf = (c) => SUITS[Math.floor(c / 13) % 4];
export const isRed = (c) => Math.floor(c / 13) % 4 === 1 || Math.floor(c / 13) % 4 === 2;

const points = (c) => { const r = c % 13; return r === 0 ? 1 : r >= 9 ? 10 : r + 1; };

// Total de una mano: el As vale 11 mientras no se pase de 21 (`soft`).
export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) { total += points(c); if (c % 13 === 0) aces++; }
  let soft = false;
  if (aces && total + 10 <= 21) { total += 10; soft = true; }
  return { total, soft };
}
export const isNatural = (hand) => hand.length === 2 && handValue(hand).total === 21;

export function freshDeck(rand) {
  const deck = [];
  for (let i = 0; i < DECKS * 52; i++) deck.push(i % 52);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// El croupier pide hasta tener 17 o más y se planta en 17 blando.
export function dealerPlay(dealer, draw) {
  while (handValue(dealer).total < 17) dealer.push(draw());
}

// Cuánto vuelve a la caja por esta mano, contando lo apostado (0 = perdió). El blackjack natural paga 3 a 2.
export function payoutFor(bet, hand, dealer, busted) {
  if (busted) return 0;
  const dealerNatural = isNatural(dealer);
  if (isNatural(hand)) return dealerNatural ? bet : Math.floor(bet * 2.5);
  if (dealerNatural) return 0;
  const mine = handValue(hand).total;
  const theirs = handValue(dealer).total;
  if (theirs > 21 || mine > theirs) return bet * 2;
  return mine === theirs ? bet : 0;
}
