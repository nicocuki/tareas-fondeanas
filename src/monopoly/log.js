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
    case 'at': return { icon: '📍', text: `${p} cayó en ${sq(e.s)}.` };
    case 'auction': return { icon: '🔨', text: `¡Salió subasta${e.c ? ` (había ${e.c} % de chances)` : ''}! Se subasta ${sq(e.s)}.` };
    case 'noauction': return { icon: '🎰', text: `No salió la subasta (${e.c} % de chances): ${sq(e.s)} sigue sin dueño.` };
    case 'resumed': return { icon: '▶️', text: 'Se retomó la partida guardada.' };
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

// ─── Avisos en pantalla ──────────────────────────────────────────────────────
// Lo mismo que `describe`, pero hablándole a `meId` en segunda persona y con un tono para colorear el aviso:
//   gain (me entra plata) · loss (me sale plata o me pasa algo malo) · good (hice algo bueno) · info (le pasa a otro)
// `weak`: aviso de relleno que se descarta si inmediatamente después viene algo más importante.
// `big`: momento fuerte (cárcel, quiebra, victoria): el aviso dura más y se sacude.
// null: no se avisa (los dados y las cartas ya tienen su propia animación).
export function announce(e, room, meId) {
  const name = (id) => room.players.find((p) => p.id === id)?.name || 'Alguien';
  const sq = (pos) => SQUARES[pos]?.name || '?';
  const mine = e.p === meId;
  const toMe = e.o === meId;
  const out = (icon, text, tone = 'info', extra = {}) => ({ icon, text, tone, ...extra });
  const base = describe(e, room);
  switch (e.k) {
    case 'roll': case 'card': return null;
    case 'at': return out('📍', mine ? `Caíste en ${sq(e.s)}.` : `${name(e.p)} cayó en ${sq(e.s)}.`, 'info', { weak: true });
    case 'go': return mine ? out('🏁', `¡Pasaste por la Salida! Cobrás ${money(e.n)}.`, 'gain') : out(base.icon, base.text, 'info', { weak: true });
    case 'rent':
      if (mine) return out('💸', `Pagás ${money(e.n)} de alquiler a ${name(e.o)} por ${sq(e.s)}${e.d ? ` (dados: ${e.d})` : ''}.`, 'loss');
      if (toMe) return out('💰', `¡${name(e.p)} te paga ${money(e.n)} de alquiler por ${sq(e.s)}!`, 'gain');
      return out(base.icon, base.text);
    case 'tax': return mine ? out('🧾', `Pagás ${money(e.n)} de ${sq(e.s).toLowerCase()}.`, 'loss') : out(base.icon, base.text);
    case 'cardpay':
      if (mine) return out('💸', e.o ? `Le pagás ${money(e.n)} a ${name(e.o)}.` : `Pagás ${money(e.n)}.`, 'loss');
      if (toMe) return out('💰', `${name(e.p)} te paga ${money(e.n)}.`, 'gain');
      return out(base.icon, base.text);
    case 'pot': return mine ? out('🅿️', `¡Te llevás los ${money(e.n)} del Descanso!`, 'gain', { big: true }) : out(base.icon, base.text);
    case 'buy': return mine ? out('🏷️', `¡Compraste ${sq(e.s)} por ${money(e.n)}!`, 'good') : out(base.icon, base.text);
    case 'sold': return mine ? out('🔨', `¡Ganaste la subasta! ${sq(e.s)} es tuya por ${money(e.n)}.`, 'good') : out(base.icon, base.text);
    case 'build': return mine ? out(e.h === 5 ? '🏨' : '🏠', `Construiste ${e.h === 5 ? 'un hotel' : 'una casa'} en ${sq(e.s)}.`, 'good') : out(base.icon, base.text);
    case 'jail': return mine ? out('🚔', `¡Vas a la cárcel! ${e.w === 'triple' ? 'Sacaste tres dobles seguidos.' : e.w === 'square' ? 'Caíste en «Andá a la cárcel».' : 'Lo dice la carta.'}`, 'loss', { big: true }) : out(base.icon, base.text, 'info', { big: true });
    case 'freed': return mine ? out('🔓', `¡Saliste de la cárcel! (${FREED[e.w]})`, 'good') : out(base.icon, base.text);
    case 'debt': return mine ? out('⚠️', `No te alcanza el efectivo para pagar ${money(e.n)}. Juntalos hipotecando, vendiendo casas o con un trato.`, 'loss', { big: true }) : out(base.icon, base.text, 'info', { big: true });
    case 'bankrupt': return mine ? out('💀', 'Quebraste. Podés seguir mirando la partida.', 'loss', { big: true }) : out(base.icon, base.text, 'info', { big: true });
    case 'offer': return toMe ? out('🤝', `${name(e.p)} te propone un trato.`, 'good') : out(base.icon, base.text);
    case 'auction': case 'noauction': return out(base.icon, base.text, 'info', { big: true });
    case 'win': return mine ? out('🏆', '¡Ganaste la partida!', 'gain', { big: true }) : out(base.icon, base.text, 'info', { big: true });
    default: return base.text ? out(base.icon, base.text) : null;
  }
}
