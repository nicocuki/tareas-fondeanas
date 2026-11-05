// Mayor o menor: sale una carta de 1 (As) a 13 (K) y se adivina si la que sigue es mayor o menor (si sale igual, se pierde).
// Cada acierto multiplica por 0,95 sobre la chance de acertar: arriesgar más paga más. Se puede retirar después del primer
// acierto. Las reglas están en `newgames.js`.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { hiloOdds, hiloPay, hiloStepMult } from './newgames.js';

const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const fmtX = (n) => `×${n.toFixed(2).replace('.', ',')}`;
const pct = (p) => `${Math.round(p * 100)} %`;

function Card({ rank, small }) {
  return <span className={`tbg-hlcard${small ? ' is-small' : ''}${rank >= 10 || rank === 1 ? ' is-face' : ''}`} data-card={rank}>{RANK[rank]}</span>;
}

export default function HiLoPanel({ room, table: t, onAct, onClose, toast }) {
  const running = t.bet > 0 && !t.res;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const bet = useBet({ kind: 'hilo', money: room.money, day: room.day.n, active: !running && !busy, toast });

  const send = async (action) => {
    if (busy) return;
    setBusy(true);
    await onAct(action);
    if (alive.current) setBusy(false);
  };
  const start = () => { const amount = bet.take(); if (amount) send({ type: 'hiloBet', amount }); };
  const guess = (dir) => { if (running) send({ type: 'hiloGuess', dir }); };
  const cash = () => { if (running && t.n > 0) send({ type: 'hiloCash' }); };
  const enter = () => { if (running) cash(); else start(); };

  const card = t.card || 0;
  const over = t.bet > 0 && Boolean(t.res);
  const hiP = running ? hiloOdds(card, 'hi') : 0;
  const loP = running ? hiloOdds(card, 'lo') : 0;
  const pay = running && t.n ? hiloPay(t.bet, t.m) : 0;

  let text = 'Elegí cuánto apostar y tocá APOSTAR.';
  let tone = '';
  if (running) text = t.n ? <span>Llevás <strong>{fmtMoney(pay)}</strong> ({fmtX(t.m)}). ¿Mayor, menor o retirás?</span> : 'Salió la primera carta. ¿La que sigue es mayor o menor?';
  else if (t.res === 'lose') { tone = ' is-lose'; text = <><b>¡Era {RANK[card]}!</b> Perdiste · −{fmtMoney(t.bet)}</>; } else if (t.res === 'cash') { tone = ' is-win'; text = <><b>¡RETIRASTE!</b> {fmtX(t.m)} · +{fmtMoney(t.pay - t.bet)}</>; }

  return (
    <Shell title="MAYOR O MENOR" name="hilo" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!running && !busy} shown={t.bet > 0 ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-hilobox">
        <div className="tbg-hilofelt" data-hilo>
          <div className="tbg-hlside">{t.prev ? <><span className="tbg-label">ANTES</span><Card rank={t.prev} small key={`p${t.n}`} /></> : null}</div>
          <div className="tbg-hlmain">
            {card ? <Card rank={card} key={`c${t.n}${t.res}`} /> : <span className="tbg-hlcard is-back" />}
            <span className="tbg-hlmult" data-mult>{t.bet > 0 ? fmtX(t.m || 1) : '×1,00'}</span>
          </div>
          <div className="tbg-hlside" />
        </div>
        <div className="tbg-hlbtns">
          <button type="button" className="tbg-hlbtn is-hi" disabled={!running || busy || hiP <= 0} onClick={() => guess('hi')} data-act="hi">
            MAYOR ▲<small>{running && hiP > 0 ? `${pct(hiP)} · ${fmtX(hiloStepMult(card, 'hi'))}` : '—'}</small>
          </button>
          <button type="button" className="tbg-hlbtn is-lo" disabled={!running || busy || loP <= 0} onClick={() => guess('lo')} data-act="lo">
            MENOR ▼<small>{running && loP > 0 ? `${pct(loP)} · ${fmtX(hiloStepMult(card, 'lo'))}` : '—'}</small>
          </button>
        </div>
        <p className="tbg-pickline">Si sale la misma carta, se pierde.</p>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={running || busy} onClick={start} data-act="bet">APOSTAR</button>
        <button type="button" className="tbg-act is-stand" disabled={!running || busy || !t.n} onClick={cash} data-act="cash">RETIRAR</button>
      </div>
    </Shell>
  );
}
