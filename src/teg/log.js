// La bitácora de la partida: cada entrada es un objeto chico ({ k: tipo, p: jugador, … }) y acá se pasa a texto.
// `p`, `v` son posiciones en `room.players`; `f`, `t` son países. Así la sala pesa poco.
import { COUNTRIES } from './board.js';

export function describe(e, room) {
  const name = (i) => room.players[i]?.name || 'Alguien';
  const country = (c) => COUNTRIES[c]?.name || '?';
  switch (e.k) {
    case 'conquer': return { icon: '🚩', text: `${name(e.p)} conquistó ${country(e.t)} (desde ${country(e.f)}).` };
    case 'elim': return { icon: '💀', text: `${name(e.p)} eliminó a ${name(e.v)} y se quedó con sus cartas.` };
    case 'trade': return { icon: '🃏', text: `${name(e.p)} canjeó cartas: +${e.n} ejércitos${e.b ? ` (y +${e.b} en países de las cartas)` : ''}.` };
    case 'left': return { icon: '🚪', text: `${name(e.p)} se fue de la partida. Sus países quedan sin jugar.` };
    case 'win': return { icon: '🏆', text: `¡${name(e.p)} cumplió su objetivo y ganó la partida!` };
    default: return { icon: '•', text: '' };
  }
}
