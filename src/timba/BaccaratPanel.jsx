// Baccarat (punto banco): se apuesta a «jugador», «banco» o «empate» y se reparten dos manos; gana la que más se acerca a 9
// (el 10 y las figuras valen 0, y cuentan los últimos dígitos de la suma). Las cartas ya vienen decididas en la sala
// (`t.p` y `t.b`): acá se van mostrando de a una. Las reglas están en `newgames.js`.
import React, { useState } from 'react';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { BACCARAT_SIDES, baccaratMult, handTotal } from './newgames.js';

const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SIDE_NAME = { player: 'JUGADOR', banker: 'BANCO', tie: 'EMPATE' };
const SIDE_LABEL = { player: 'Jugador', banker: 'Banco', tie: 'Empate' };
const fmtX = (n) => `×${String(n).replace('.', ',')}`;
const STEP_MS = 520; // cada carta aparece un rato después de la anterior

// El orden en que se reparten: jugador, banco, jugador, banco, y las terceras cartas.
function dealOrder(p, b) {
  const order = [['p', 0], ['b', 0], ['p', 1], ['b', 1]];
  if (p.length > 2) order.push(['p', 2]);
  if (b.length > 2) order.push(['b', 2]);
  return order;
}

function Card({ rank, n }) {
  return <span className={`tbg-bcard${rank >= 10 || rank === 1 ? ' is-face' : ''}`} style={{ '--n': n }} data-card={rank}>{RANK[rank]}</span>;
}

export default function BaccaratPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'baccarat', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const [side, setSide] = useState('player');
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'spin', amount, side }); };
  const shownSide = spin.played ? t.side : side;

  // las cartas que ya se repartieron
  const p = t.p || [];
  const b = t.b || [];
  const order = spin.played ? dealOrder(p, b) : [];
  const dealt = spin.running ? Math.min(order.length, Math.max(0, Math.floor((spin.elapsed - 250) / STEP_MS) + 1)) : order.length;
  const seen = { p: [], b: [] };
  order.slice(0, dealt).forEach(([who, i]) => seen[who].push((who === 'p' ? p : b)[i]));
  const done = spin.played && !spin.running;

  let text = 'Elegí a quién le apostás, cuánto, y tocá REPARTIR.';
  let tone = '';
  if (spin.running) text = 'Repartiendo…';
  else if (done) {
    const winName = t.res === 'tie' ? 'Empate' : SIDE_LABEL[t.res];
    tone = t.pay > t.bet ? ' is-win' : t.pay === t.bet ? ' is-push' : ' is-lose';
    text = <><b>{winName}</b> {handTotal(p)} a {handTotal(b)} · {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>;
  }

  return (
    <Shell title="BACCARAT" name="baccarat" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-baccbox">
        <div className="tbg-baccfelt" data-felt>
          {['p', 'b'].map((who) => (
            <div key={who} className={`tbg-bhand${done && t.res === (who === 'p' ? 'player' : 'banker') ? ' is-won' : ''}`}>
              <span className="tbg-label">{who === 'p' ? 'JUGADOR' : 'BANCO'}</span>
              <div className="tbg-cards">{seen[who].map((r, i) => <Card key={`${who}${i}`} rank={r} n={i} />)}{!seen[who].length && <span className="tbg-slot" />}</div>
              <span className="tbg-total" data-total={who}>{seen[who].length ? handTotal(seen[who]) : '·'}</span>
            </div>
          ))}
        </div>
        <div className="tbg-picks tbg-sidepicks" role="group" aria-label="A quién le apostás">
          {BACCARAT_SIDES.map((s) => (
            <button key={s} type="button" className={`tbg-pick${shownSide === s ? ' is-picked' : ''}`} disabled={spin.pending} onClick={() => setSide(s)} data-pick={s}>
              {SIDE_NAME[s]}<small>{fmtX(baccaratMult(s, s === 'tie' ? 'tie' : s))}</small>
            </button>
          ))}
        </div>
        <p className="tbg-pickline">Con empate, jugador y banco se devuelven. Banco paga ×1,95.</p>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">REPARTIR</button>
      </div>
    </Shell>
  );
}
