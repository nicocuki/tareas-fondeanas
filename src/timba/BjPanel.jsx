// La ventana del blackjack: la mesa (croupier y manos), los cuatro botones de la mano (doblar, plantarse, pedir
// y jugar) y el panel de apuesta (teclado numérico, la cantidad a la vista y los botones rápidos).
import React, { useEffect, useRef, useState } from 'react';
import { BJ_MAX, BJ_MIN, betLimits, handValue, isRed, quickBet, rankOf, suitOf } from './bj.js';
import { RESULT_MS, fmtMoney } from './game.js';

function Card({ c, hidden }) {
  if (hidden) return <span className="tb-card is-back" />;
  return (
    <span className={`tb-card${isRed(c) ? ' is-red' : ''}`}>
      <b>{rankOf(c)}</b>
      <i>{suitOf(c)}</i>
    </span>
  );
}

const RESULT_TEXT = { win: '¡GANÓ!', bj: '¡BLACKJACK!', push: 'EMPATE', lose: 'PERDIÓ', bust: 'SE PASÓ' };

function Hand({ hand, hideSecond }) {
  const v = handValue(hand);
  return (
    <div className="tb-hand">
      <div className="tb-cards">{hand.map((c, i) => <Card key={`${i}-${c}`} c={c} hidden={hideSecond && i === 1} />)}</div>
      {hand.length > 0 && <small className="tb-total">{hideSecond ? handValue([hand[0]]).total : v.total}{!hideSecond && v.soft && v.total <= 21 ? ' (blando)' : ''}</small>}
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

  const waiting = bj.phase === 'bet' && seat?.ready ? bj.seats.filter((s) => !s.ready).map((s) => room.players.find((p) => p.id === s.id)?.name || '¿?') : [];
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '¿?';
  const colorOf = (id) => room.players.find((p) => p.id === id)?.color || '#888';

  return (
    <div className="tb-modal tb-bj" role="dialog" aria-label="Blackjack" data-bj>
      <button type="button" className="tb-close" onClick={onClose} aria-label="Levantarse de la mesa">✕</button>
      <h2 className="tb-title">BLACKJACK</h2>
      <div className="tb-bj-body">
        <div className="tb-bj-left">
          <div className="tb-felt">
            <div className="tb-dealer">
              <span className="tb-label">CROUPIER</span>
              {bj.dealer.length ? <Hand hand={bj.dealer} hideSecond={bj.phase === 'play'} /> : <div className="tb-cards"><span className="tb-card is-empty" /><span className="tb-card is-empty" /></div>}
            </div>
            <div className="tb-seats">
              {bj.seats.map((s) => (
                <div key={s.id} className={`tb-seat${s.id === me.id ? ' is-me' : ''}${s.st === 'play' ? ' is-playing' : ''}`} style={{ '--c': colorOf(s.id) }}>
                  <span className="tb-label">{nameOf(s.id)}{s.id === me.id ? ' (vos)' : ''}</span>
                  <Hand hand={s.hand} />
                  <span className="tb-chip">{s.ready ? fmtMoney(s.bet) : '—'}</span>
                  {bj.phase === 'result' && s.res && <span className={`tb-res is-${s.res}`}>{RESULT_TEXT[s.res]}{s.pay > s.bet ? ` +${fmtMoney(s.pay - s.bet)}` : s.res === 'lose' || s.res === 'bust' ? ` −${fmtMoney(s.bet)}` : ''}</span>}
                  {bj.phase === 'play' && s.st === 'stand' && <span className="tb-res is-wait">SE PLANTÓ</span>}
                  {bj.phase === 'play' && s.st === 'bust' && <span className="tb-res is-bust">SE PASÓ</span>}
                </div>
              ))}
            </div>
            <p className="tb-status">
              {!seat ? 'Sentándote…'
                : myTurn ? 'Te toca: pedí, plantate o doblá.'
                  : bj.phase === 'play' ? 'Juegan los demás…'
                    : bj.phase === 'result' ? (canBet ? 'Apostá para la próxima mano.' : 'Mirá cómo salió…')
                      : seat.ready ? `Esperando a ${waiting.join(', ') || 'repartir'}…` : 'Elegí cuánto apostar y tocá JUGAR.'}
            </p>
          </div>
          <div className="tb-actions">
            <button type="button" className="tb-act is-double" disabled={!canDouble} onClick={() => onAct({ type: 'bjDouble' })} data-act="double">DOBLAR</button>
            <button type="button" className="tb-act is-stand" disabled={!myTurn} onClick={() => onAct({ type: 'bjStand' })} data-act="stand">PLANTARSE</button>
            <button type="button" className="tb-act is-hit" disabled={!myTurn} onClick={() => onAct({ type: 'bjHit' })} data-act="hit">PEDIR</button>
            <button type="button" className="tb-act is-play" disabled={!canBet} onClick={play} data-act="play">JUGAR</button>
          </div>
        </div>

        <div className={`tb-betpanel${canBet ? '' : ' is-off'}`} data-bet-panel>
          <div className="tb-pad">
            {KEYS.map((k) => <button key={k} type="button" className={`tb-key${k === 'C' ? ' is-clear' : ''}`} disabled={!canBet} onClick={() => press(k)} data-key={k}>{k}</button>)}
          </div>
          <div className="tb-display">
            <p className="tb-limits">MÍN: {fmtMoney(BJ_MIN)}<br />MÁX: {fmtMoney(BJ_MAX)}</p>
            <strong className={`tb-amount${overMax && canBet ? ' is-over' : ''}`} data-amount>{seat?.ready && !canBet ? fmtMoney(seat.bet) : fmtMoney(amount)}</strong>
            <p className={`tb-maxbet${overMax && canBet ? ' is-over' : ''}`}>APUESTA MÁX: {fmtMoney(lim ? lim.max : 0)}</p>
            <small className="tb-bank">En la caja: {fmtMoney(room.money)}</small>
          </div>
          <div className="tb-quick">
            <button type="button" disabled={!canBet} onClick={() => quick('min')} data-quick="min">MÍN</button>
            <button type="button" disabled={!canBet} onClick={() => quick('q')} data-quick="q">1/4</button>
            <button type="button" disabled={!canBet} onClick={() => quick('h')} data-quick="h">1/2</button>
            <button type="button" disabled={!canBet} onClick={() => quick('all')} data-quick="all">TODO</button>
          </div>
        </div>
      </div>
    </div>
  );
}
