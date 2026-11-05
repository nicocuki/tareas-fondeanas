// El craps (la línea de pase): se apuesta y se tira con dados de pixel art que saltan. En la primera tirada gana el 7 o el 11
// y pierde el 2, el 3 o el 12; cualquier otro número queda como «punto» y se sigue tirando hasta que salga el punto
// (gana) o un 7 (pierde). Paga 1 a 1. Las reglas están en `games.js`; los dados los tira esta pantalla y avisa cómo cayeron.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';

const ROLL_MS = 1200;
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const d6 = () => 1 + Math.floor(Math.random() * 6);

// Un dado de pixel art de 11 × 11 (el borde, el fondo y los puntos son rectángulos sin suavizar).
function Die({ value, rolling, n }) {
  return (
    <svg className={`tbg-die${rolling ? ' is-rolling' : ''}`} style={{ '--n': n }} viewBox="0 0 11 11" width="96" height="96" shapeRendering="crispEdges" aria-label={`Dado: ${value}`}>
      <rect x="1" y="0" width="9" height="11" fill="#14101c" />
      <rect x="0" y="1" width="11" height="9" fill="#14101c" />
      <rect x="1" y="1" width="9" height="9" fill="#f4efe2" />
      <rect x="1" y="8" width="9" height="2" fill="#d8cfb8" />
      {PIPS[value].map(([x, y]) => <rect key={`${x}${y}`} x={2 + x * 3} y={2 + y * 3} width="2" height="2" fill="#14101c" />)}
    </svg>
  );
}

export default function CrapsPanel({ room, table: t, onAct, onClose, toast }) {
  const alive = useRef(true);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState([1, 1]);
  const roundOn = t.bet > 0 && !t.res;
  const bet = useBet({ kind: 'craps', money: room.money, active: !roundOn && !rolling, toast });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const placeBet = () => { const amount = bet.take(); if (amount) onAct({ type: 'crapsBet', amount }); };
  // Los dados saltan cambiando de cara un rato y se frenan en lo que sale (se avisa a la sala al frenar).
  const roll = async () => {
    if (!roundOn || rolling) return;
    setRolling(true);
    const id = setInterval(() => setFaces([d6(), d6()]), 90);
    await new Promise((resolve) => setTimeout(resolve, ROLL_MS));
    clearInterval(id);
    if (!alive.current) return;
    const dice = [d6(), d6()];
    setFaces(dice);
    await onAct({ type: 'crapsRoll', dice });
    if (alive.current) setRolling(false);
  };
  const enter = () => { if (roundOn) roll(); else placeBet(); };
  const shown = rolling || !t.dice.length ? faces : t.dice;

  const sum = t.dice.length ? t.dice[0] + t.dice[1] : 0;
  let rule = <>Primera tirada: <b className="is-good">GANÁS CON 7 / 11</b> · <b className="is-bad">PERDÉS CON 2 / 3 / 12</b></>;
  if (roundOn && t.point) rule = <>Punto: <b>{t.point}</b> · <b className="is-good">GANÁS SI SALE EL {t.point}</b> · <b className="is-bad">PERDÉS CON 7</b></>;
  let text = 'Elegí cuánto apostar y tocá APOSTAR.';
  let tone = '';
  if (rolling) text = 'Los dados ruedan…';
  else if (t.res) {
    tone = t.res === 'win' ? ' is-win' : ' is-lose';
    text = t.res === 'win' ? <><b>¡GANASTE!</b> Salió {t.dice[0]} + {t.dice[1]} = {sum} · +{fmtMoney(t.pay - t.bet)}</> : <><b>PERDISTE</b> Salió {t.dice[0]} + {t.dice[1]} = {sum} · −{fmtMoney(t.bet)}</>;
  } else if (roundOn && t.n) text = <>Salió {t.dice[0]} + {t.dice[1]} = {sum}. Se sigue tirando.</>;
  else if (roundOn) text = 'Apostaste. ¡Tirá los dados!';

  return (
    <Shell title="STREET CRAPS" name="craps" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!roundOn && !rolling} shown={roundOn || t.res ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-crapsbox">
        <p className="tbg-rule" data-rule>{rule}</p>
        <div className="tbg-dice" data-dice><Die value={shown[0]} rolling={rolling} n={0} /><Die value={shown[1]} rolling={rolling} n={1} /></div>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={roundOn || rolling} onClick={placeBet} data-act="play">APOSTAR</button>
        <button type="button" className="tbg-act is-hit" disabled={!roundOn || rolling} onClick={roll} data-act="roll">TIRAR</button>
      </div>
    </Shell>
  );
}
