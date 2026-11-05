// La ruleta (europea, del 0 al 36): se elige una apuesta en el paño (un número, color, par o impar, mitad o docena), se
// gira y la bolita frena en un casillero. El número ya viene decidido en la sala (`t.n`): acá solo se anima. Las reglas
// están en `games.js`.
import React, { useState } from 'react';
import { ROULETTE_WHEEL, colorOf } from './games.js';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { ROULETTE_MS, fmtMoney } from './game.js';

const N = ROULETTE_WHEEL.length;
const CELL = 360 / N;
const FILL = { red: '#c8303a', black: '#1c1826', green: '#2f8a3f' };
const point = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
const wedge = (i, r0, r1) => {
  const [a1, b1] = point(i * CELL, r1); const [a2, b2] = point((i + 1) * CELL, r1);
  const [c1, d1] = point((i + 1) * CELL, r0); const [c2, d2] = point(i * CELL, r0);
  return `M${a1.toFixed(1)} ${b1.toFixed(1)} A${r1} ${r1} 0 0 1 ${a2.toFixed(1)} ${b2.toFixed(1)} L${c1.toFixed(1)} ${d1.toFixed(1)} A${r0} ${r0} 0 0 0 ${c2.toFixed(1)} ${d2.toFixed(1)} Z`;
};
const TURNS = 6;

// Las apuestas de afuera.
const OUTSIDE = [['low', '1-18', 2], ['even', 'PAR', 2], ['red', 'ROJO', 2], ['black', 'NEGRO', 2], ['odd', 'IMPAR', 2], ['high', '19-36', 2], ['d1', '1ª DOCENA', 3], ['d2', '2ª DOCENA', 3], ['d3', '3ª DOCENA', 3]];
const spotLabel = (spot) => (spot[0] === 'n' ? `el ${spot.slice(1)}` : OUTSIDE.find((o) => o[0] === spot)?.[1] ?? spot);
const spotPays = (spot) => (spot[0] === 'n' ? 36 : OUTSIDE.find((o) => o[0] === spot)?.[2] ?? 0);
// El paño: el 0 a la izquierda y tres filas de 12 (3, 6, 9… arriba; 1, 4, 7… abajo).
const ROWS = [0, 1, 2].map((r) => Array.from({ length: 12 }, (_, c) => c * 3 + (3 - r)));

export default function RoulettePanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'roulette', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const [spot, setSpot] = useState('red');
  const play = () => {
    const amount = bet.take();
    if (amount) onAct({ type: 'spin', amount, spot });
  };

  // La rueda gira despacio y la bolita, que da varias vueltas en sentido contrario, se acerca y frena en su casillero.
  const u = spin.running ? Math.min(1, spin.elapsed / ROULETTE_MS) : spin.played ? 1 : 0;
  const wheel = (spin.running ? spin.elapsed : spin.played ? t.ms : 0) * 0.03;
  const pocket = spin.played ? ROULETTE_WHEEL.indexOf(t.n) * CELL + CELL / 2 : 0;
  const settle = 1 - (1 - u) ** 3;
  const ballDeg = wheel + pocket - (1 - settle) * 360 * TURNS;
  const drop = Math.max(0, Math.min(1, (u - 0.55) / 0.35));
  const [bx, by] = point(ballDeg, 82 - 16 * drop * drop);
  const shownSpot = spin.played ? t.spot : spot;

  let text = 'Elegí una apuesta en el paño y tocá GIRAR.';
  let tone = '';
  if (spin.running) text = 'No va más…';
  else if (spin.played) {
    tone = t.pay > t.bet ? ' is-win' : ' is-lose';
    text = <><b>Salió el {t.n} ({{ red: 'rojo', black: 'negro', green: 'verde' }[colorOf(t.n)]})</b> · {t.pay > 0 ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet)}`}</>;
  }

  return (
    <Shell title="RULETA" name="roulette" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-roulette">
        <svg className="tbg-rwheel" viewBox="0 0 200 200" role="img" aria-label="Ruleta">
          <circle cx="100" cy="100" r="98" fill="#5a3420" stroke="#14101c" strokeWidth="3" />
          <g transform={`rotate(${wheel.toFixed(2)} 100 100)`}>
            {ROULETTE_WHEEL.map((n, i) => (
              <g key={n}>
                <path d={wedge(i, 52, 90)} fill={FILL[colorOf(n)]} stroke="#f0c33c" strokeWidth="0.8" />
                <text x="100" y="24" transform={`rotate(${(i + 0.5) * CELL} 100 100)`} textAnchor="middle" className="tbg-rtext">{n}</text>
              </g>
            ))}
          </g>
          <circle cx="100" cy="100" r="48" fill="#3a2418" stroke="#f0c33c" strokeWidth="1.5" />
          <circle cx="100" cy="100" r="22" fill="#d8c079" />
          {u > 0 && <circle cx={bx.toFixed(1)} cy={by.toFixed(1)} r="3.6" fill="#fff" stroke="#14101c" strokeWidth="0.8" />}
          {!spin.running && spin.played && <text x="100" y="108" textAnchor="middle" className="tbg-rcenter">{t.n}</text>}
        </svg>
        <div className="tbg-board" aria-label="Paño de la ruleta">
          <button type="button" className={`tbg-spot is-green${shownSpot === 'n0' ? ' is-picked' : ''}`} disabled={spin.pending} onClick={() => setSpot('n0')} data-spot="n0">0</button>
          <div className="tbg-nums">
            {ROWS.flat().map((n) => (
              <button key={n} type="button" className={`tbg-spot is-${colorOf(n)}${shownSpot === `n${n}` ? ' is-picked' : ''}`} disabled={spin.pending} onClick={() => setSpot(`n${n}`)} data-spot={`n${n}`}>{n}</button>
            ))}
          </div>
          <div className="tbg-outside">
            {OUTSIDE.map(([id, name]) => (
              <button key={id} type="button" className={`tbg-spot is-out${id === 'red' ? ' is-red' : id === 'black' ? ' is-black' : ''}${shownSpot === id ? ' is-picked' : ''}`} disabled={spin.pending} onClick={() => setSpot(id)} data-spot={id}>{name}</button>
            ))}
          </div>
        </div>
        <p className="tbg-pickline">Apuesta: <b>{spotLabel(shownSpot)}</b> · paga ×{spotPays(shownSpot)}</p>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">GIRAR</button>
      </div>
    </Shell>
  );
}
