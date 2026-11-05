// La ventana del blackjack: la mesa (croupier y mano), los cuatro botones de la mano (doblar, plantarse, pedir
// y jugar) y el panel de apuesta (en `BetPad.jsx`).
// Las cartas llegan volando desde el zapato, la tapada del croupier se da vuelta y el resultado cae como un sello.
import React, { useMemo } from 'react';
import { handValue, isRed, rankOf, suitOf } from './bj.js';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { RESULT_MS, fmtMoney } from './game.js';

// Una carta con dos caras: la de atrás (roja) y la de adelante. `up` la da vuelta con una transición.
function Card({ c, up, delay = 0, from = 'dealer' }) {
  return (
    <span className={`tbg-card is-from-${from}${isRed(c) ? ' is-red' : ''}`} style={{ '--ry': up ? '180deg' : '0deg', '--delay': `${delay}s` }}>
      <span className="tbg-face tbg-back" />
      <span className="tbg-face tbg-front"><b>{rankOf(c)}</b><i>{suitOf(c)}</i><em>{suitOf(c)}</em></span>
    </span>
  );
}

const RESULT_TEXT = { win: '¡GANASTE!', bj: '¡BLACKJACK!', push: 'EMPATE', lose: 'PERDISTE', bust: 'TE PASASTE' };

// Al repartir: primero uno para el jugador, después uno para el croupier, y así (como en una mesa de verdad).
const DEAL_DELAY = { player: [0, 0.5], dealer: [0.25, 0.75] };

function Hand({ hand, who, hideSecond }) {
  const v = handValue(hand);
  const shown = hideSecond ? handValue([hand[0]]).total : v.total;
  return (
    <div className="tbg-hand">
      <div className="tbg-cards">
        {hand.map((c, i) => {
          const delay = i < 2 ? DEAL_DELAY[who][i] : who === 'dealer' ? 0.55 + (i - 2) * 0.5 : 0;
          return <Card key={`${i}-${c}`} c={c} up={!(hideSecond && i === 1)} delay={delay} from={who} />;
        })}
        {hand.length === 0 && <><span className="tbg-slot" /><span className="tbg-slot" /></>}
      </div>
      {hand.length > 0 && <small key={shown} className="tbg-total">{shown}{!hideSecond && v.soft && v.total <= 21 ? ' blando' : ''}</small>}
    </div>
  );
}

// Monedas y estrellitas que saltan cuando se gana.
export function Burst() {
  const parts = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * 110;
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 40, c: ['#f0c33c', '#4ee06a', '#ff6a6a', '#6ab4ff'][i % 4], s: 6 + (i % 3) * 3, delay: (i % 4) * 0.04 };
  }), []);
  return (
    <div className="tbg-burst" aria-hidden="true">
      {parts.map((p, i) => <span key={i} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, background: p.c, width: p.s, height: p.s, animationDelay: `${p.delay}s` }} />)}
    </div>
  );
}

export default function BjPanel({ room, me, table: t, now, onAct, onClose, toast }) {
  const canBet = !room.day.over && ((t.phase === 'bet' && !t.ready) || (t.phase === 'result' && now >= t.resultAt + RESULT_MS));
  const bet = useBet({ kind: 'bj', money: room.money, active: canBet, toast });
  const myTurn = t.phase === 'play' && t.st === 'play';
  const canDouble = myTurn && t.hand.length === 2 && room.money >= t.bet;
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'bjBet', amount }); };
  const won = t.phase === 'result' && (t.res === 'win' || t.res === 'bj');

  let status = 'Elegí cuánto apostar y tocá JUGAR.';
  if (myTurn) status = 'Te toca: pedí, plantate o doblá.';
  else if (t.phase === 'play') status = 'Juega el croupier…';
  else if (t.phase === 'result') status = canBet ? 'Apostá para la próxima mano.' : 'Mirá cómo salió…';
  else if (t.ready) status = 'Repartiendo…';

  return (
    <Shell title="BLACKJACK" name="bj" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={canBet} shown={t.ready && !canBet ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-felt">
        <span className="tbg-shoe" aria-hidden="true"><i /><i /><i /></span>
        <div className="tbg-dealer">
          <span className="tbg-label">CROUPIER</span>
          <Hand key={`d${t.n}`} hand={t.dealer} who="dealer" hideSecond={t.phase === 'play'} />
        </div>
        <div className="tbg-seats">
          <div className={`tbg-seat is-me${t.st === 'play' ? ' is-playing' : ''}`} style={{ '--c': me.color }}>
            <span className="tbg-label">{me.name} (vos)</span>
            <Hand key={`p${t.n}`} hand={t.hand} who="player" />
            <span key={`${t.n}-${t.bet}`} className={`tbg-chip${t.ready ? ' is-on' : ''}`}>{t.ready ? fmtMoney(t.bet) : '—'}</span>
          </div>
        </div>
        {!(t.phase === 'result' && t.res) && <p className="tbg-status">{status}</p>}
        {t.phase === 'result' && t.res && (
          <div key={`r${t.n}`} className={`tbg-stamp is-${t.res}`}>
            <strong>{RESULT_TEXT[t.res]}</strong>
            <span>{t.pay > t.bet ? `+${fmtMoney(t.pay - t.bet)}` : t.res === 'push' ? 'apuesta devuelta' : `−${fmtMoney(t.bet)}`}</span>
          </div>
        )}
        {won && <Burst key={`b${t.n}`} />}
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-double" disabled={!canDouble} onClick={() => onAct({ type: 'bjDouble' })} data-act="double">DOBLAR</button>
        <button type="button" className="tbg-act is-stand" disabled={!myTurn} onClick={() => onAct({ type: 'bjStand' })} data-act="stand">PLANTARME</button>
        <button type="button" className="tbg-act is-hit" disabled={!myTurn} onClick={() => onAct({ type: 'bjHit' })} data-act="hit">PEDIR</button>
        <button type="button" className="tbg-act is-play" disabled={!canBet} onClick={play} data-act="play">JUGAR</button>
      </div>
    </Shell>
  );
}
