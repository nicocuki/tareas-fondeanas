// La rueda del dinero: 54 casilleros (1, 2, 5, 10, 20, comodín y logo). Se apuesta a uno de los 7 y, si la rueda frena ahí, paga.
// El casillero que sale ya viene decidido en la sala (`t.seg`): acá solo se anima. Las reglas están en `newgames.js`.
import React, { useState } from 'react';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { MWHEEL, MWHEEL_PAYS, MWHEEL_SPOTS } from './newgames.js';

const SEG = 360 / MWHEEL.length;
const SIZE = 300;
const MID = SIZE / 2;
const RAD = 140;
const COLORS = { 1: '#4a6be8', 2: '#f0c33c', 5: '#e0525a', 10: '#4ee06a', 20: '#b46bf0', joker: '#14101c', logo: '#f08a3c' };
const NAME = { 1: '1', 2: '2', 5: '5', 10: '10', 20: '20', joker: 'COMODÍN', logo: 'LOGO' };
const point = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [MID + r * Math.cos(a), MID + r * Math.sin(a)]; };
const wedge = (i) => {
  const [x1, y1] = point(i * SEG, RAD);
  const [x2, y2] = point((i + 1) * SEG, RAD);
  return `M${MID} ${MID} L${x1.toFixed(1)} ${y1.toFixed(1)} A${RAD} ${RAD} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
};
const ease = (u) => 1 - (1 - u) ** 3;
const fmtX = (n) => `×${String(n).replace('.', ',')}`;

export default function MoneyWheelPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'mwheel', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const [pick, setPick] = useState('1');
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'spin', amount, spot: pick }); };
  const shown = spin.played ? t.spot : pick;

  // cuánto gira: 4 vueltas y frena con el casillero ganador bajo la flecha
  const target = t.seg !== undefined ? ((-(t.seg + 0.5) * SEG) % 360 + 360) % 360 : 0;
  const total = 360 * 4 + target;
  const u = spin.running ? Math.max(0, Math.min(1, spin.elapsed / Math.max(1, t.ms - 500))) : 1;
  const angle = t.seg === undefined ? 0 : total * ease(u);
  const landed = spin.played && !spin.running;
  const won = landed && t.pay > 0;

  let text = 'Elegí un casillero, cuánto apostar y tocá GIRAR.';
  let tone = '';
  if (spin.running) text = 'Girando…';
  else if (landed) {
    tone = won ? ' is-win' : ' is-lose';
    text = <><b>Salió {NAME[MWHEEL[t.seg]]}</b> {won ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet)}`}</>;
  }

  return (
    <Shell title="RUEDA DEL DINERO" name="mwheel" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-wheelbox">
        <svg className="tbg-wheel" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Rueda del dinero" data-mwheel>
          <circle cx={MID} cy={MID} r={RAD + 8} fill="#3a2418" stroke="#14101c" strokeWidth="3" />
          <g transform={`rotate(${angle.toFixed(2)} ${MID} ${MID})`}>
            {MWHEEL.map((v, i) => (
              <path key={i} d={wedge(i)} fill={COLORS[v]} stroke="#f4e6b0" strokeWidth="1" />
            ))}
            {MWHEEL.map((v, i) => (v === 'joker' || v === 'logo' || v === '20' || v === '10'
              ? <text key={`t${i}`} x={MID} y={MID - RAD + 16} transform={`rotate(${(i + 0.5) * SEG} ${MID} ${MID})`} textAnchor="middle" className="tbg-wheel-text">{v === 'joker' ? '★' : v === 'logo' ? '♦' : v}</text>
              : null))}
          </g>
          <circle cx={MID} cy={MID} r="28" fill="#3a2418" stroke="#14101c" strokeWidth="3" />
          <circle cx={MID} cy={MID} r="20" fill="#f0c33c" />
          <polygon points={`${MID - 12},2 ${MID + 12},2 ${MID},26`} fill="#14101c" stroke="#f4e6b0" strokeWidth="2" />
        </svg>
        <div className="tbg-picks tbg-mwpicks" role="group" aria-label="Elegí un casillero">
          {MWHEEL_SPOTS.map((spot) => (
            <button key={spot} type="button" className={`tbg-pick${shown === spot ? ' is-picked' : ''}`} style={{ borderBottomColor: COLORS[spot], borderBottomWidth: 8 }} disabled={spin.pending} onClick={() => setPick(spot)} data-pick={spot}>
              {NAME[spot]}<small>{fmtX(MWHEEL_PAYS[spot])}</small>
            </button>
          ))}
        </div>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">GIRAR</button>
      </div>
    </Shell>
  );
}
