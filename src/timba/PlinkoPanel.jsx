// Plinko: la bolita baja por 8 filas de clavos y en cada una va para un lado u otro; cae en uno de 9 casilleros y los de las
// puntas pagan más. El camino ya viene decidido en la sala (`t.path`): acá solo se anima. Las reglas están en `newgames.js`.
import React from 'react';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { PLINKO_MULTS, PLINKO_ROWS } from './newgames.js';

const W = 300;
const DX = 28;
const TOP = 34;
const DY = 25;
const xAt = (path, r) => W / 2 + (path.slice(0, r).reduce((a, b) => a + b, 0) - r / 2) * DX;
const yAt = (r) => TOP + r * DY;
const ease = (u) => u * u * (3 - 2 * u);
const binColor = (m) => (m >= 5 ? '#e0525a' : m >= 2 ? '#f08a3c' : m >= 1 ? '#f0c33c' : '#4a6be8');
const fmtM = (m) => `${String(m).replace('.', ',')}x`;

export default function PlinkoPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'plinko', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'spin', amount }); };

  // dónde se ve la bolita: bajando fila por fila, o ya en su casillero
  const path = t.path || [];
  let ball = { x: W / 2, y: 12 };
  if (path.length) {
    const p = spin.running ? Math.min(1, spin.elapsed / Math.max(1, t.ms - 300)) : 1;
    const s = p * PLINKO_ROWS;
    const r = Math.min(PLINKO_ROWS - 1, Math.floor(s));
    const f = p >= 1 ? 1 : s - r;
    const x0 = xAt(path, r); const x1 = xAt(path, r + 1);
    ball = { x: x0 + (x1 - x0) * ease(f), y: yAt(r) - 9 + DY * f - Math.sin(f * Math.PI) * 9 };
    if (p >= 1) ball = { x: xAt(path, PLINKO_ROWS), y: yAt(PLINKO_ROWS) - 2 };
  }
  const landed = spin.played && !spin.running;

  let text = 'Elegí cuánto apostar y tocá SOLTAR.';
  let tone = '';
  if (spin.running) text = 'Cayendo…';
  else if (landed) {
    tone = t.pay > t.bet ? ' is-win' : t.pay === t.bet ? ' is-push' : ' is-lose';
    text = <><b>{fmtM(PLINKO_MULTS[t.bin])}</b> {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>;
  }

  return (
    <Shell title="PLINKO" name="plinko" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-plinkobox">
        <svg className="tbg-plinko" viewBox={`0 0 ${W} 290`} role="img" aria-label="Tablero de Plinko" shapeRendering="crispEdges" data-plinko>
          <rect x="4" y="4" width={W - 8} height="282" fill="#1a1238" stroke="#0b0814" strokeWidth="4" />
          {Array.from({ length: PLINKO_ROWS }, (_, r) => Array.from({ length: r + 1 }, (_, k) => (
            <rect key={`${r}-${k}`} x={W / 2 + (k - r / 2) * DX - 3} y={yAt(r) - 3} width="6" height="6" fill="#f4e6b0" />
          )))}
          {PLINKO_MULTS.map((m, b) => {
            const hit = landed && t.bin === b;
            return (
              <g key={b} data-bin={b}>
                <rect x={W / 2 + (b - PLINKO_ROWS / 2) * DX - 12} y={yAt(PLINKO_ROWS) + 4} width="24" height="24" fill={binColor(m)} stroke={hit ? '#fff' : '#0b0814'} strokeWidth={hit ? 3 : 2} />
                <text x={W / 2 + (b - PLINKO_ROWS / 2) * DX} y={yAt(PLINKO_ROWS) + 20} textAnchor="middle" className="tbg-plinko-text">{String(m).replace('.', ',')}</text>
              </g>
            );
          })}
          <rect x={ball.x - 6} y={ball.y - 6} width="12" height="12" fill="#fff" stroke="#e0525a" strokeWidth="3" data-ball />
        </svg>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">SOLTAR</button>
      </div>
    </Shell>
  );
}
