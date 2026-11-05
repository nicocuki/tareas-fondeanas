// Penguin Cross: un pingüino salta por 9 cubos de hielo (contando el primero). Cada salto tiene 1/2 de que caiga al agua;
// cada uno bien dado multiplica por 1,5 lo apostado, y se puede retirar la plata en cualquier momento. Si llega al último
// cubo cobra solo. Las reglas están en `newgames.js`.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { PENGUIN_CUBES, penguinMult, penguinPay } from './newgames.js';
import { Pixels } from './Pixels.jsx';

const PENGUIN_ART = [
  '....dddd....', '...dddddd...', '..dwddddwd..', '..dddooddd..', '.ddwwwwwwdd.', '.dwwwwwwwwd.',
  'ddwwwwwwwwdd', 'ddwwwwwwwwdd', '.dwwwwwwwwd.', '..dwwwwwwd..', '..ddwwwwdd..', '..oo....oo..',
];
const CUBE = 46; // lo que mide cada cubo
const fmtX = (n) => `×${String(Math.round(n * 100) / 100).replace('.', ',')}`;

export default function PenguinPanel({ room, table: t, onAct, onClose, toast }) {
  const running = t.bet > 0 && !t.res;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const bet = useBet({ kind: 'penguin', money: room.money, day: room.day.n, active: !running && !busy, toast });

  const start = async () => {
    const amount = bet.take();
    if (!amount || busy) return;
    setBusy(true);
    await onAct({ type: 'penguinBet', amount });
    if (alive.current) setBusy(false);
  };
  const step = async () => {
    if (!running || busy) return;
    setBusy(true);
    await onAct({ type: 'penguinStep' });
    setTimeout(() => { if (alive.current) setBusy(false); }, 450); // deja terminar el salto
  };
  const cash = async () => {
    if (!running || busy || t.pos < 1) return;
    setBusy(true);
    await onAct({ type: 'penguinCash' });
    if (alive.current) setBusy(false);
  };
  const enter = () => { if (running) step(); else start(); };

  const fell = t.res === 'fall';
  const at = fell ? t.pos + 1 : t.pos; // dónde se ve el pingüino (si cae, en el cubo al que quiso saltar)
  const nowPay = t.bet > 0 ? (t.res === 'fall' ? 0 : penguinPay(t.bet, t.pos)) : 0;

  let text = 'Elegí cuánto apostar y tocá APOSTAR.';
  let tone = '';
  if (running) text = t.pos ? <span>Vas por el cubo {t.pos + 1} de {PENGUIN_CUBES} · llevás <strong>{fmtMoney(nowPay)}</strong>. ¿Seguís o retirás?</span> : 'Apostaste. ¡Hacelo saltar!';
  else if (fell) { tone = ' is-lose'; text = <><b>¡AL AGUA!</b> El pingüino se cayó · −{fmtMoney(t.bet)}</>; } else if (t.res === 'win') { tone = ' is-win'; text = <><b>¡CRUZÓ TODO!</b> {fmtX(penguinMult(t.pos))} · +{fmtMoney(t.pay - t.bet)}</>; } else if (t.res === 'cash') { tone = ' is-win'; text = <><b>¡RETIRASTE!</b> {fmtX(penguinMult(t.pos))} · {t.pay >= t.bet ? '+' : '−'}{fmtMoney(Math.abs(t.pay - t.bet))}</>; }

  return (
    <Shell title="CRUCE DEL PINGÜINO" name="penguin" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!running && !busy} shown={t.bet > 0 ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-penbox">
        <div className="tbg-penwater" data-pen>
          <div className="tbg-penrow" style={{ width: PENGUIN_CUBES * CUBE + (PENGUIN_CUBES - 1) * 8 }}>
            {Array.from({ length: PENGUIN_CUBES }, (_, i) => (
              <div key={i} className={`tbg-cube${i === t.pos && t.bet > 0 ? ' is-here' : ''}${i < t.pos ? ' is-done' : ''}${fell && i === t.pos + 1 ? ' is-sunk' : ''}`} style={{ left: i * (CUBE + 8) }} data-cube={i}>
                <span>{i === 0 ? 'SALIDA' : fmtX(penguinMult(i))}</span>
              </div>
            ))}
            <div key={t.n} className={`tbg-penguin${running || t.bet > 0 ? '' : ' is-idle'}${fell ? ' is-fall' : ''}`} style={{ left: at * (CUBE + 8) + 5 }} data-penguin={t.pos}>
              <Pixels art={PENGUIN_ART} size={36} />
            </div>
          </div>
        </div>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={busy} onClick={running ? step : start} data-act={running ? 'step' : 'bet'}>{running ? 'SEGUIR' : 'APOSTAR'}</button>
        <button type="button" className="tbg-act is-stand" disabled={!running || busy || t.pos < 1} onClick={cash} data-act="cash">RETIRAR</button>
      </div>
    </Shell>
  );
}
