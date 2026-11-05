// La rueda de la fortuna: 20 casilleros con su multiplicador. Se apuesta, gira y el que frena bajo la flecha decide el
// pago; «gira otra vez» la hace girar de nuevo. Los giros ya vienen decididos en la sala (`t.spins`): acá solo se
// anima. Las reglas están en `games.js`.
import React from 'react';
import { WHEEL } from './games.js';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { WHEEL_SPIN_MS, fmtMoney } from './game.js';

const SEG = 360 / WHEEL.length;
const SIZE = 300;
const MID = SIZE / 2;
const RAD = 140;
const COLORS = { again: '#4a4a6a', 0: '#c8303a', 0.1: '#e8602a', 0.25: '#f0a030', 0.5: '#a8b83a', 2: '#4a8a8a', 3: '#5a6aa8', 5: '#b04a7a' };
const label = (v) => (v === 'again' ? 'OTRA VEZ' : `${String(v).replace('.', ',')}x`);
const point = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [MID + r * Math.cos(a), MID + r * Math.sin(a)]; };
const wedge = (i) => {
  const [x1, y1] = point(i * SEG, RAD);
  const [x2, y2] = point((i + 1) * SEG, RAD);
  return `M${MID} ${MID} L${x1.toFixed(1)} ${y1.toFixed(1)} A${RAD} ${RAD} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
};
const ease = (u) => 1 - (1 - u) ** 3;

// Cuánto tiene que girar la rueda en cada giro (en grados, hacia la derecha) para que el casillero `i` quede bajo la flecha.
function plan(spins) {
  let from = 0;
  return spins.map((i) => {
    const target = ((-(i + 0.5) * SEG) % 360 + 360) % 360;
    const to = from + 360 * 3 + ((target - (from % 360) + 360) % 360);
    const step = { from, to };
    from = to;
    return step;
  });
}

function angleAt(steps, elapsed) {
  if (!steps.length) return 0;
  if (elapsed === Infinity) return steps[steps.length - 1].to;
  const k = Math.min(steps.length - 1, Math.floor(elapsed / WHEEL_SPIN_MS));
  const u = Math.max(0, Math.min(1, (elapsed - k * WHEEL_SPIN_MS) / (WHEEL_SPIN_MS - 600)));
  return steps[k].from + (steps[k].to - steps[k].from) * ease(u);
}

export default function WheelPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'wheel', money: room.money, active: !spin.pending, toast });
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'spin', amount }); };
  const steps = plan(t.spins || []);
  const angle = angleAt(steps, spin.elapsed);
  const spinNo = spin.running ? Math.min(steps.length - 1, Math.floor(spin.elapsed / WHEEL_SPIN_MS)) : steps.length - 1;
  const last = t.spins ? WHEEL[t.spins[t.spins.length - 1]] : null;

  let text = 'Elegí cuánto apostar y tocá GIRAR.';
  let tone = '';
  if (spin.running) text = spinNo > 0 ? '¡Gira otra vez!' : 'Girando…';
  else if (spin.played) {
    tone = t.pay > t.bet ? ' is-win' : t.pay === t.bet ? ' is-push' : ' is-lose';
    text = <><b>{label(last)}</b> · {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>;
  }

  return (
    <Shell title="RUEDA DE LA FORTUNA" name="wheel" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-wheelbox">
        <svg className="tbg-wheel" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Rueda de la fortuna">
          <circle cx={MID} cy={MID} r={RAD + 8} fill="#7a3f1d" stroke="#14101c" strokeWidth="3" />
          <g transform={`rotate(${angle.toFixed(2)} ${MID} ${MID})`} data-wheel-angle={angle.toFixed(0)}>
            {WHEEL.map((v, i) => (
              <g key={i}>
                <path d={wedge(i)} fill={COLORS[v]} stroke="#f0c33c" strokeWidth="2" />
                <text x={MID} y={MID - RAD + 18} transform={`rotate(${(i + 0.5) * SEG} ${MID} ${MID})`} textAnchor="middle" className="tbg-wheel-text">{label(v)}</text>
              </g>
            ))}
          </g>
          <circle cx={MID} cy={MID} r="30" fill="#3a2418" stroke="#14101c" strokeWidth="3" />
          <circle cx={MID} cy={MID} r="22" fill="#7ad94a" />
          <polygon points={`${MID - 12},2 ${MID + 12},2 ${MID},26`} fill="#14101c" stroke="#f4e6b0" strokeWidth="2" />
        </svg>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">GIRAR</button>
      </div>
    </Shell>
  );
}
