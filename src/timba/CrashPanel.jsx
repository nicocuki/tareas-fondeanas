// Crash: se aprieta LANZAR y el cohete sube (0,01x por paso, 60 pasos por segundo). En cualquier momento puede chocar: si
// se retira antes, se cobra lo apostado por lo que llegó; si choca antes, se pierde (la línea verde se pone roja). Dónde
// choca ya viene decidido en la sala (`t.point`, en centésimos); acá solo se anima. Las reglas están en `newgames.js`.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { crashMultAt, crashPay } from './newgames.js';

const fmtMult = (m) => `${(m / 100).toFixed(2)}x`;
const W = 300;
const H = 170;

// La curva de lo que subió el cohete: arranca bajita y se levanta (solo es dibujo).
function curve(mult, steps = 48) {
  const span = Math.max(1, mult - 100);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push([14 + u * (W - 40), H - 16 - (u ** 1.8) * (H - 44)]);
  }
  return { pts, span };
}

function Rocket({ x, y, angle, crashed, flame }) {
  if (crashed) {
    return (
      <g transform={`translate(${x} ${y})`} shapeRendering="crispEdges">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="-1.5" y="-12" width="3" height="9" fill={a % 90 ? '#ff9a3a' : '#ffe27a'} transform={`rotate(${a})`} />)}
        <rect x="-5" y="-5" width="10" height="10" fill="#ff4a4a" />
        <rect x="-2" y="-2" width="4" height="4" fill="#fff" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} shapeRendering="crispEdges">
      <rect x="-12" y="-2" width={4 + flame} height="4" fill="#ff9a3a" />
      <rect x="-9" y="-1" width={2 + flame} height="2" fill="#ffe27a" />
      <rect x="-8" y="-4" width="14" height="8" fill="#f4f0e6" />
      <rect x="-8" y="-4" width="14" height="2" fill="#c8c4d8" />
      <rect x="6" y="-3" width="3" height="6" fill="#e0525a" />
      <rect x="-4" y="-2" width="4" height="4" fill="#4fd8e8" />
      <rect x="-9" y="-7" width="5" height="3" fill="#e0525a" />
      <rect x="-9" y="4" width="5" height="3" fill="#e0525a" />
    </g>
  );
}

export default function CrashPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const [, force] = useState(0);
  const act = useRef(onAct);
  act.current = onAct;
  const running = t.bet > 0 && !t.res;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => force((n) => n + 1), 33);
    return () => clearInterval(id);
  }, [running, t.at]);

  const elapsed = running ? clock() - t.at : 0;
  const raw = running ? crashMultAt(elapsed) : 100;
  const crashed = running && raw >= t.point;
  // lo que se ve: el multiplicador en vivo, o en el que terminó la ronda
  const mult = running ? Math.min(raw, t.point) : t.res === 'win' ? t.cash : t.bet > 0 ? t.point : 100;
  const lost = t.res === 'lose' || crashed;
  const bet = useBet({ kind: 'crash', money: room.money, day: room.day.n, active: !running, toast });

  // Cuando el cohete choca se avisa a la sala (y se insiste hasta que se anota).
  useEffect(() => {
    if (!crashed) return undefined;
    act.current({ type: 'crashEnd' });
    const id = setInterval(() => act.current({ type: 'crashEnd' }), 800);
    return () => clearInterval(id);
  }, [crashed, t.at]);

  const launch = () => { const amount = bet.take(); if (amount) onAct({ type: 'crashLaunch', amount }); };
  const cash = () => {
    if (!running || crashed) return;
    const m = Math.min(crashMultAt(clock() - t.at), t.point - 1);
    if (m >= 100) onAct({ type: 'crashCash', mult: m });
  };
  const enter = () => { if (running) cash(); else launch(); };

  const { pts } = curve(mult);
  const reach = running || t.bet > 0 ? 1 - 1 / (1 + (mult - 100) / 250) : 0; // cuánto de la curva se ve: sube rápido y después se va frenando
  const shown = pts.slice(0, 2 + Math.round(reach * (pts.length - 2)));
  const end = shown[shown.length - 1];
  const prev = shown[shown.length - 2] || end;
  const angle = (Math.atan2(end[1] - prev[1], end[0] - prev[0]) * 180) / Math.PI;
  const path = shown.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const money = running ? crashPay(t.bet, mult) : t.res === 'win' ? t.pay : t.bet > 0 ? 0 : bet.amount;

  let text = 'Elegí cuánto apostar y tocá LANZAR.';
  let tone = '';
  if (running && !crashed) text = '¡Despegó! Retirá antes de que choque.';
  else if (lost && t.bet > 0) { tone = ' is-lose'; text = <><b>¡CHOCÓ!</b> El cohete explotó a {fmtMult(t.point)} · −{fmtMoney(t.bet)}</>; } else if (t.res === 'win') { tone = ' is-win'; text = <><b>¡RETIRASTE!</b> A {fmtMult(t.cash)} · +{fmtMoney(t.pay - t.bet)}</>; }

  return (
    <Shell title="CRASH" name="crash" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!running} shown={running || t.bet > 0 ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-crashbox">
        <div className={`tbg-crashscreen${lost ? ' is-crashed' : ''}`} data-crash>
          <span className="tbg-crashmult" data-mult>{fmtMult(mult)}</span>
          <span className="tbg-crashmoney" data-money-now>{fmtMoney(money)}</span>
          <svg className="tbg-crashgraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
            <path d={`M14 ${H - 16} H${W - 20}`} stroke="#3a3a5a" strokeWidth="2" />
            <path d={path} fill="none" stroke={lost ? '#ff4a4a' : '#4ee06a'} strokeWidth="3" />
            <Rocket x={end[0]} y={end[1]} angle={angle} crashed={lost && t.bet > 0} flame={Math.floor(elapsed / 90) % 2 ? 4 : 2} />
          </svg>
          <span className="tbg-crashlow">1.00x</span>
          <span className="tbg-crashhigh" data-reach>{running || t.bet > 0 ? fmtMult(Math.max(mult, 100)) : ''}</span>
        </div>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={running} onClick={launch} data-act="launch">LANZAR</button>
        <button type="button" className="tbg-act is-stand" disabled={!running || crashed} onClick={cash} data-act="cash">RETIRAR</button>
      </div>
    </Shell>
  );
}
