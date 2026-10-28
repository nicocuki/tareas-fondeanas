// La bitácora de la partida: cada entrada es un objeto chico ({ k: tipo, p: quién, … }) y acá se pasa a texto.
// Se guarda así (y no como frases) para que la sala pese poco.
import { CARDS, DECK_NAMES, SQUARES } from './board.js';

const money = (n) => `$${n}`;
const FREED = {
  doubles: 'sacó dobles y salió de la cárcel',
  turns: 'no sacó dobles en tres intentos: pagó $50 y salió',
  bail: 'pagó $50 y salió de la cárcel',
  card: 'usó la carta y salió de la cárcel',
};
const JAILED = {
  triple: 'sacó tres dobles seguidos: ¡va a la cárcel!',
  square: 'cayó en «Andá a la cárcel».',
  card: 'va directo a la cárcel.',
};

// { icon, text } de una entrada. `room` sirve para buscar los nombres.
export function describe(e, room) {
  const name = (id) => room.players.find((p) => p.id === id)?.name || 'Alguien';
  const sq = (pos) => SQUARES[pos]?.name || '?';
  const p = name(e.p);
  switch (e.k) {
    case 'roll': return { icon: '🎲', text: `${p} sacó ${e.d[0]} y ${e.d[1]}${e.d[0] === e.d[1] ? ' (doble)' : ''}.` };
    case 'go': return { icon: '🏁', text: `${p} pasó por la Salida y cobró ${money(e.n)}.` };
    case 'jail': return { icon: '🚔', text: `${p} ${JAILED[e.w] || 'va a la cárcel.'}` };
    case 'freed': return { icon: '🔓', text: `${p} ${FREED[e.w]}.` };
    case 'stay': return { icon: '🔒', text: `${p} no sacó dobles y sigue en la cárcel.` };
    case 'bail': return { icon: '💸', text: `${p} pagó ${money(e.n)} de fianza.` };
    case 'buy': return { icon: '🏷️', text: `${p} compró ${sq(e.s)} por ${money(e.n)}.` };
    case 'auction': return { icon: '🔨', text: `Se subasta ${sq(e.s)}.` };
    case 'bid': return { icon: '✋', text: `${p} ofrece ${money(e.n)} por ${sq(e.s)}.` };
    case 'drop': return { icon: '🙅', text: `${p} se baja de la subasta de ${sq(e.s)}.` };
    case 'sold': return { icon: '🔨', text: `${p} se quedó con ${sq(e.s)} por ${money(e.n)}.` };
    case 'unsold': return { icon: '🔨', text: `Nadie quiso ${sq(e.s)}: sigue sin dueño.` };
    case 'rent': return { icon: '💰', text: `${p} le pagó ${money(e.n)} de alquiler a ${name(e.o)} por ${sq(e.s)}${e.d ? ` (dados: ${e.d})` : ''}.` };
    case 'nomortgage': return { icon: '🏚️', text: `${sq(e.s)} está hipotecada: ${p} no paga alquiler.` };
    case 'tax': return { icon: '🧾', text: `${p} pagó ${money(e.n)} de ${sq(e.s).toLowerCase()}.` };
    case 'cardpay': return { icon: '💸', text: e.o ? `${p} le pagó ${money(e.n)} a ${name(e.o)}.` : `${p} pagó ${money(e.n)}.` };
    case 'card': return { icon: e.d === 'chance' ? '❓' : '📦', text: `${p} sacó una carta de ${DECK_NAMES[e.d]}: ${CARDS[e.d][e.i].text}` };
    case 'pot': return { icon: '🅿️', text: `${p} se llevó los ${money(e.n)} del Descanso.` };
    case 'build': return { icon: e.h === 5 ? '🏨' : '🏠', text: `${p} construyó ${e.h === 5 ? 'un hotel' : 'una casa'} en ${sq(e.s)}.` };
    case 'sellb': return { icon: '🧱', text: `${p} vendió ${e.h === 4 ? 'el hotel' : 'una casa'} de ${sq(e.s)}.` };
    case 'mortgage': return { icon: '🏦', text: `${p} hipotecó ${sq(e.s)}.` };
    case 'unmortgage': return { icon: '✅', text: `${p} levantó la hipoteca de ${sq(e.s)}.` };
    case 'offer': return { icon: '🤝', text: `${p} le propuso un trato a ${name(e.o)}.` };
    case 'refused': return { icon: '🚫', text: `${p} rechazó el trato de ${name(e.o)}.` };
    case 'traded': return { icon: '🤝', text: `${p} y ${name(e.o)} cerraron un trato.` };
    case 'debt': return { icon: '⚠️', text: `${p} no tiene ${money(e.n)} a mano para pagar${e.o ? ` a ${name(e.o)}` : ''}: tiene que juntarlos.` };
    case 'paid': return { icon: '✅', text: `${p} pagó su deuda de ${money(e.n)}${e.o ? ` a ${name(e.o)}` : ''}.` };
    case 'bankrupt': return { icon: '💀', text: e.w === 'left' ? `${p} se fue de la partida.` : `${p} quebró${e.o ? `: sus bienes pasan a ${name(e.o)}` : ': sus bienes vuelven al banco'}.` };
    case 'win': return { icon: '🏆', text: `¡${p} ganó la partida!` };
    default: return { icon: '•', text: '' };
  }
}
