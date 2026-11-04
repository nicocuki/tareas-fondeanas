// La ventana del blackjack: la mesa (croupier y mano), los cuatro botones de la mano (doblar, plantarse, pedir
// y jugar) y el panel de apuesta (teclado numérico, la cantidad a la vista y los botones rápidos).
// Las cartas llegan volando desde el zapato, la tapada del croupier se da vuelta y el resultado cae como un sello.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BJ_MAX, BJ_MIN, betLimits, handValue, isRed, quickBet, rankOf, suitOf } from './bj.js';
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
function Burst() {
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

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '000'];

export default function BjPanel({ room, me, now, onAct, onClose, toast }) {
  const bj = room.bj;
  const seat = bj.seats.find((s) => s.id === me.id);
  const lim = betLimits(room.money);
  // `typed`: si el próximo dígito se agrega a lo escrito (true) o empieza un número nuevo (después de un botón rápido).
  const [bet, setBet] = useState({ amount: BJ_MIN, typed: false });
  const { amount } = bet;
  const live = useRef({});
  const canBet = Boolean(seat) && !room.day.over && ((bj.phase === 'bet' && !seat.ready) || (bj.phase === 'result' && now >= bj.resultAt + RESULT_MS));
  const myTurn = Boolean(seat) && bj.phase === 'play' && seat.st === 'play';
  const canDouble = myTurn && seat.hand.length === 2 && room.money >= seat.bet;
  const overMax = lim ? amount > lim.max : true;

  const press = (k) => {
    if (!canBet) return;
    if (k === 'C') { setBet({ amount: 0, typed: false }); return; }
    setBet((prev) => ({ amount: Math.min(999999, Number((prev.typed ? String(prev.amount) : '') + k) || 0), typed: true }));
  };
  const quick = (kind) => { if (canBet) setBet({ amount: quickBet(kind, room.money), typed: false }); };
  const play = () => {
    if (!canBet) return;
    if (!lim) { toast(`Con menos de ${fmtMoney(BJ_MIN)} en la caja no se puede apostar.`); return; }
    if (amount < lim.min) { toast(`La apuesta mínima es ${fmtMoney(lim.min)}.`); return; }
    if (amount > lim.max) { setBet({ amount: lim.max, typed: false }); toast(`La apuesta máxima es ${fmtMoney(lim.max)}.`); return; }
    onAct({ type: 'bjBet', amount });
  };
  live.current = { press, play, canBet, onAct, myTurn };

  // El teclado también sirve para escribir la apuesta: dígitos, Retroceso (borrar) y Enter (jugar).
  useEffect(() => {
    const onKey = (e) => {
      const L = live.current;
      if (/^[0-9]$/.test(e.key)) { L.press(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { L.press('C'); e.preventDefault(); } else if (e.key === 'Enter') { L.play(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '¿?';
  const colorOf = (id) => room.players.find((p) => p.id === id)?.color || '#888';
  const won = bj.phase === 'result' && seat && (seat.res === 'win' || seat.res === 'bj');

  let status = 'Elegí cuánto apostar y tocá JUGAR.';
  if (!seat) status = 'Sentándote…';
  else if (myTurn) status = 'Te toca: pedí, plantate o doblá.';
  else if (bj.phase === 'play') status = 'Juega el croupier…';
  else if (bj.phase === 'result') status = canBet ? 'Apostá para la próxima mano.' : 'Mirá cómo salió…';
  else if (seat.ready) status = 'Repartiendo…';

  return (
    <div className="tbg-modal tbg-bj" role="dialog" aria-label="Blackjack" data-bj>
      <button type="button" className="tbg-close" onClick={onClose} aria-label="Levantarse de la mesa">✕</button>
      <h2 className="tbg-title">BLACKJACK</h2>
      <div className="tbg-bj-body">
        <div className="tbg-bj-left">
          <div className="tbg-felt">
            <span className="tbg-shoe" aria-hidden="true"><i /><i /><i /></span>
            <div className="tbg-dealer">
              <span className="tbg-label">CROUPIER</span>
              <Hand key={`d${bj.n}`} hand={bj.dealer} who="dealer" hideSecond={bj.phase === 'play'} />
            </div>
            <div className="tbg-seats">
              {bj.seats.map((s) => (
                <div key={s.id} className={`tbg-seat${s.id === me.id ? ' is-me' : ''}${s.st === 'play' ? ' is-playing' : ''}`} style={{ '--c': colorOf(s.id) }}>
                  <span className="tbg-label">{nameOf(s.id)}{s.id === me.id ? ' (vos)' : ''}</span>
                  <Hand key={`p${bj.n}`} hand={s.hand} who="player" />
                  <span key={`${bj.n}-${s.bet}`} className={`tbg-chip${s.ready ? ' is-on' : ''}`}>{s.ready ? fmtMoney(s.bet) : '—'}</span>
                </div>
              ))}
            </div>
            {!(bj.phase === 'result' && seat?.res) && <p className="tbg-status">{status}</p>}
            {bj.phase === 'result' && seat?.res && (
              <div key={`r${bj.n}`} className={`tbg-stamp is-${seat.res}`}>
                <strong>{RESULT_TEXT[seat.res]}</strong>
                <span>{seat.pay > seat.bet ? `+${fmtMoney(seat.pay - seat.bet)}` : seat.res === 'push' ? 'apuesta devuelta' : `−${fmtMoney(seat.bet)}`}</span>
              </div>
            )}
            {won && <Burst key={`b${bj.n}`} />}
          </div>
          <div className="tbg-actions">
            <button type="button" className="tbg-act is-double" disabled={!canDouble} onClick={() => onAct({ type: 'bjDouble' })} data-act="double">DOBLAR</button>
            <button type="button" className="tbg-act is-stand" disabled={!myTurn} onClick={() => onAct({ type: 'bjStand' })} data-act="stand">PLANTARME</button>
            <button type="button" className="tbg-act is-hit" disabled={!myTurn} onClick={() => onAct({ type: 'bjHit' })} data-act="hit">PEDIR</button>
            <button type="button" className="tbg-act is-play" disabled={!canBet} onClick={play} data-act="play">JUGAR</button>
          </div>
        </div>

        <div className={`tbg-betpanel${canBet ? '' : ' is-off'}`} data-bet-panel>
          <div className="tbg-display">
            <p className="tbg-limits">MÍN {fmtMoney(BJ_MIN)} · MÁX {fmtMoney(BJ_MAX)}</p>
            <strong className={`tbg-amount${overMax && canBet ? ' is-over' : ''}`} data-amount>{seat?.ready && !canBet ? fmtMoney(seat.bet) : fmtMoney(amount)}</strong>
            <p className={`tbg-maxbet${overMax && canBet ? ' is-over' : ''}`}>APUESTA MÁXIMA: {fmtMoney(lim ? lim.max : 0)}</p>
            <small className="tbg-bank">En la caja: {fmtMoney(room.money)}</small>
          </div>
          <div className="tbg-padwrap">
            <div className="tbg-pad">
              {KEYS.map((k) => <button key={k} type="button" className={`tbg-key${k === 'C' ? ' is-clear' : ''}`} disabled={!canBet} onClick={() => press(k)} data-key={k} aria-label={k === 'C' ? 'Borrar' : k}>{k === 'C' ? '⌫' : k}</button>)}
            </div>
            <div className="tbg-quick">
              <button type="button" disabled={!canBet} onClick={() => quick('min')} data-quick="min">MÍN</button>
              <button type="button" disabled={!canBet} onClick={() => quick('q')} data-quick="q">1/4</button>
              <button type="button" disabled={!canBet} onClick={() => quick('h')} data-quick="h">1/2</button>
              <button type="button" disabled={!canBet} onClick={() => quick('all')} data-quick="all">TODO</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
