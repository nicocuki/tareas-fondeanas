// La tragamonedas «La cámara de la momia»: una grilla de 3 × 3 que gira (las columnas frenan de a una) y, si sale un
// patrón del mismo símbolo, se iluminan las celdas y se cobra. Las reglas están en `games.js`.
import React from 'react';
import { SLOT_SYMBOLS, slotsEval } from './games.js';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { SLOT_ART, Pixels } from './Pixels.jsx';
import { SLOTS_MS, fmtMoney } from './game.js';

const IDLE = [0, 1, 2, 3, 0, 1, 2, 3, 0];
const PATTERN_NAME = { line: 'línea', diamond: 'rombo', x: 'X', full: '¡TABLERO LLENO!' };
const fmtMult = (m) => String(Math.round(m * 100) / 100).replace('.', ',');

export default function SlotsPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'slots', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const play = () => { const amount = bet.take(); if (amount) onAct({ type: 'spin', amount }); };
  const grid = t.grid || IDLE;
  const result = spin.played && !spin.running ? slotsEval(grid) : null;
  const hit = new Set(result ? result.hits.flatMap((h) => h.cells) : []);
  const best = result?.hits.reduce((a, h) => (!a || h.m > a.m ? h : a), null);

  return (
    <Shell title="LA CÁMARA DE LA MOMIA" name="slots" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-slots">
        <div className="tbg-reels">
          {grid.map((sym, i) => {
            const stopAt = SLOTS_MS * (0.4 + (i % 3) * 0.2);
            const spinning = spin.running && spin.elapsed < stopAt;
            const shown = spinning ? (Math.floor(spin.elapsed / 70) * 5 + i * 3) % 4 : sym;
            return (
              <div key={i} className={`tbg-reel${spinning ? ' is-spinning' : ''}${hit.has(i) ? ' is-hit' : ''}`}>
                <Pixels art={SLOT_ART[SLOT_SYMBOLS[shown].id]} size={56} />
              </div>
            );
          })}
        </div>
        <div className={`tbg-result${result ? (t.pay > t.bet ? ' is-win' : t.pay === t.bet ? ' is-push' : ' is-lose') : ''}`} data-result>
          {!spin.played && 'Elegí cuánto apostar y tocá GIRAR.'}
          {spin.running && 'Girando…'}
          {result && (t.pay > 0
            ? <><b>{best ? (best.k === 'full' ? PATTERN_NAME.full : `${PATTERN_NAME[best.k]} de ${SLOT_SYMBOLS[best.sym].name}`) : 'Premio'}</b> ×{fmtMult(result.mult)} · {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>
            : <><b>Sin premio</b> · −{fmtMoney(t.bet)}</>)}
        </div>
        <ul className="tbg-legend">
          {SLOT_SYMBOLS.map((s) => <li key={s.id}><Pixels art={SLOT_ART[s.id]} size={22} /> ×{fmtMult(s.value)}</li>)}
          <li className="is-text">línea ×2 · rombo ×5 · X ×20 · lleno ×59</li>
        </ul>
        <div className="tbg-actions">
          <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">GIRAR</button>
        </div>
      </div>
    </Shell>
  );
}
