// El craps (la línea de pase): se apuesta y se tira con dados en 3D y física de verdad. En la primera tirada gana el 7 o el 11
// y pierde el 2, el 3 o el 12; cualquier otro número queda como «punto» y se sigue tirando hasta que salga el punto
// (gana) o un 7 (pierde). Paga 1 a 1. Las reglas están en `games.js`; los dados los tira esta pantalla y avisa cómo cayeron.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';

export default function CrapsPanel({ room, table: t, onAct, onClose, toast }) {
  const canvasRef = useRef(null);
  const diceRef = useRef(null);
  const alive = useRef(true);
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [cocked, setCocked] = useState(false);
  const roundOn = t.bet > 0 && !t.res;
  const bet = useBet({ kind: 'craps', money: room.money, active: !roundOn && !rolling, toast });

  useEffect(() => {
    alive.current = true;
    let dice = null;
    import('./craps3d.js').then((m) => m.createDice(canvasRef.current)).then((d) => {
      if (!alive.current) { d.dispose(); return; }
      dice = d;
      diceRef.current = d;
      setReady(true);
    }).catch(() => toast('No se pudieron cargar los dados.'));
    return () => { alive.current = false; dice?.dispose(); diceRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const placeBet = () => { const amount = bet.take(); if (amount) onAct({ type: 'crapsBet', amount }); };
  const roll = async () => {
    if (!roundOn || rolling || !diceRef.current) return;
    setRolling(true);
    const dice = await diceRef.current.roll(() => setCocked(true));
    if (!alive.current) return;
    setCocked(false);
    await onAct({ type: 'crapsRoll', dice });
    if (alive.current) setRolling(false);
  };
  const enter = () => { if (roundOn) roll(); else placeBet(); };

  const sum = t.dice.length ? t.dice[0] + t.dice[1] : 0;
  let rule = <>Primera tirada: <b className="is-good">GANÁS CON 7 / 11</b> · <b className="is-bad">PERDÉS CON 2 / 3 / 12</b></>;
  if (roundOn && t.point) rule = <>Punto: <b>{t.point}</b> · <b className="is-good">GANÁS SI SALE EL {t.point}</b> · <b className="is-bad">PERDÉS CON 7</b></>;
  let text = 'Elegí cuánto apostar y tocá APOSTAR.';
  let tone = '';
  if (cocked) text = '¡Dado montado! Se tira de nuevo.';
  else if (rolling) text = 'Los dados ruedan…';
  else if (t.res) {
    tone = t.res === 'win' ? ' is-win' : ' is-lose';
    text = t.res === 'win' ? <><b>¡GANASTE!</b> Salió {t.dice[0]} + {t.dice[1]} = {sum} · +{fmtMoney(t.pay - t.bet)}</> : <><b>PERDISTE</b> Salió {t.dice[0]} + {t.dice[1]} = {sum} · −{fmtMoney(t.bet)}</>;
  } else if (roundOn && t.n) text = <>Salió {t.dice[0]} + {t.dice[1]} = {sum}. Se sigue tirando.</>;
  else if (roundOn) text = 'Apostaste. ¡Tirá los dados!';

  return (
    <Shell title="STREET CRAPS" name="craps" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!roundOn && !rolling} shown={roundOn || t.res ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-crapsbox">
        <p className="tbg-rule" data-rule>{rule}</p>
        <canvas ref={canvasRef} className="tbg-dice" data-dice-canvas />
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={roundOn || rolling || !ready} onClick={placeBet} data-act="play">APOSTAR</button>
        <button type="button" className="tbg-act is-hit" disabled={!roundOn || rolling || !ready} onClick={roll} data-act="roll">TIRAR</button>
      </div>
    </Shell>
  );
}
