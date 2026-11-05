// Buscaminas: una grilla de 5 × 5 con 1, 3, 5 o 10 minas escondidas. Cada casillero sin mina que se destapa sube el
// multiplicador y se puede retirar en cualquier momento; una mina se lleva todo. Dónde están las minas ya viene decidido en
// la sala (`t.mines`) y recién se muestran al terminar la ronda. Las reglas están en `newgames.js`.
import React, { useEffect, useRef, useState } from 'react';
import { BetPad, Shell, useBet } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { MINES_OPTIONS, MINES_SIZE, minesMult, minesPay } from './newgames.js';
import { Pixels } from './Pixels.jsx';

const GEM_ART = ['..cccc..', '.cwcccc.', 'cwccccbc', 'cccccbbc', '.ccccbc.', '..ccbc..', '...cb...', '........'];
const BOMB_ART = ['......o.', '.....o..', '..dddd..', '.ddwddd.', '.dddddd.', '.dddddd.', '..dddd..', '........'];
const fmtX = (n) => `×${n.toFixed(2).replace('.', ',')}`;

export default function MinesPanel({ room, table: t, onAct, onClose, toast }) {
  const running = t.bet > 0 && !t.res;
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(3);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const bet = useBet({ kind: 'mines', money: room.money, day: room.day.n, active: !running && !busy, toast });

  const send = async (action) => {
    if (busy) return;
    setBusy(true);
    await onAct(action);
    if (alive.current) setBusy(false);
  };
  const start = () => { const amount = bet.take(); if (amount) send({ type: 'minesBet', amount, mines: count }); };
  const cash = () => { if (running && t.open.length) send({ type: 'minesCash' }); };
  const pick = (i) => { if (running && !t.open.includes(i)) send({ type: 'minesPick', i }); };
  const enter = () => { if (running) cash(); else start(); };

  const mines = t.count || count;
  const safe = t.open?.length || 0;
  const over = t.bet > 0 && Boolean(t.res);
  const nowMult = safe ? minesMult(mines, safe) : 1;
  const nextMult = minesMult(mines, safe + 1);
  const pay = t.bet > 0 && running && safe ? minesPay(t.bet, mines, safe) : 0;

  let text = 'Elegí cuántas minas, cuánto apostar y tocá APOSTAR.';
  let tone = '';
  if (running) text = safe ? <span>Llevás <strong>{fmtMoney(pay)}</strong> ({fmtX(nowMult)}). El próximo casillero paga {fmtX(nextMult)}.</span> : 'Destapá un casillero. ¡Cuidado con las minas!';
  else if (t.res === 'lose') { tone = ' is-lose'; text = <><b>¡BOOM!</b> Pisaste una mina · −{fmtMoney(t.bet)}</>; } else if (t.res === 'cash') { tone = t.pay > t.bet ? ' is-win' : ' is-push'; text = <><b>¡RETIRASTE!</b> {fmtX(nowMult)} · {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>; } else if (t.res === 'win') { tone = ' is-win'; text = <><b>¡LIMPIASTE EL TABLERO!</b> +{fmtMoney(t.pay - t.bet)}</>; }

  return (
    <Shell title="BUSCAMINAS" name="mines" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!running && !busy} shown={t.bet > 0 ? t.bet : undefined} onEnter={enter} />}>
      <div className="tbg-minesbox">
        <div className="tbg-minesgrid" role="group" aria-label="Casilleros" data-mines>
          {Array.from({ length: MINES_SIZE }, (_, i) => {
            const open = t.open?.includes(i);
            const isMine = over && t.mines?.includes(i);
            const boom = over && t.hit === i;
            return (
              <button key={i} type="button" className={`tbg-mc${open ? ' is-safe' : ''}${isMine ? ' is-mine' : ''}${boom ? ' is-boom' : ''}`} disabled={!running || busy || open} onClick={() => pick(i)} data-cell={i}>
                {open && <Pixels art={GEM_ART} size={34} />}
                {isMine && <Pixels art={BOMB_ART} size={34} />}
              </button>
            );
          })}
        </div>
        <div className="tbg-picks tbg-minepicks" role="group" aria-label="Cuántas minas">
          {MINES_OPTIONS.map((m) => (
            <button key={m} type="button" className={`tbg-pick${(running || over ? mines : count) === m ? ' is-picked' : ''}`} disabled={running || busy} onClick={() => setCount(m)} data-mines-count={m}>
              {m} {m === 1 ? 'mina' : 'minas'}
            </button>
          ))}
        </div>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={running || busy} onClick={start} data-act="bet">APOSTAR</button>
        <button type="button" className="tbg-act is-stand" disabled={!running || busy || !safe} onClick={cash} data-act="cash">RETIRAR</button>
      </div>
    </Shell>
  );
}
