// Lo que comparten las ventanas de los juegos del casino: el marco con el título y la ✕, el panel de apuesta (la
// cantidad a la vista, el teclado numérico y los botones rápidos) y el reloj de los juegos de una tirada.
import React, { useEffect, useRef, useState } from 'react';
import { LIMITS, betLimits, quickBet } from './games.js';
import { fmtMoney } from './game.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '000'];

// La apuesta que se está escribiendo. `typed`: si el próximo dígito se agrega a lo escrito (true) o empieza un número nuevo
// (después de un botón rápido). `take()` devuelve la apuesta ya revisada (o 0 y avisa por qué no).
export function useBet({ kind, money, active, toast }) {
  const lim = betLimits(kind, money);
  const [bet, setBet] = useState({ amount: LIMITS[kind][0], typed: false });
  const press = (k) => {
    if (!active) return;
    if (k === 'C') { setBet({ amount: 0, typed: false }); return; }
    setBet((prev) => ({ amount: Math.min(999999, Number((prev.typed ? String(prev.amount) : '') + k) || 0), typed: true }));
  };
  const quick = (button) => { if (active) setBet({ amount: quickBet(kind, button, money), typed: false }); };
  const take = () => {
    if (!active) return 0;
    if (!lim) { toast(`Con menos de ${fmtMoney(LIMITS[kind][0])} en la caja no se puede apostar.`); return 0; }
    if (bet.amount < lim.min) { toast(`La apuesta mínima es ${fmtMoney(lim.min)}.`); return 0; }
    if (bet.amount > lim.max) { setBet({ amount: lim.max, typed: false }); toast(`La apuesta máxima es ${fmtMoney(lim.max)}.`); return 0; }
    return bet.amount;
  };
  return { kind, lim, amount: bet.amount, press, quick, take, overMax: lim ? bet.amount > lim.max : true };
}

// El panel de apuesta. `shown`: si se pasa, es lo que se muestra en lugar de lo que se escribe (la apuesta en marcha).
export function BetPad({ bet, money, active, shown, onEnter }) {
  const live = useRef({});
  live.current = { bet, active, onEnter };
  // El teclado también sirve para escribir la apuesta: dígitos, Retroceso (borrar) y Enter (jugar).
  useEffect(() => {
    const onKey = (e) => {
      const L = live.current;
      if (/^[0-9]$/.test(e.key)) { L.bet.press(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { L.bet.press('C'); e.preventDefault(); } else if (e.key === 'Enter') { L.onEnter?.(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [lo, hi] = LIMITS[bet.kind];
  const over = bet.overMax && active;
  return (
    <div className={`tbg-betpanel${active ? '' : ' is-off'}`} data-bet-panel>
      <div className="tbg-display">
        <p className="tbg-limits">MÍN {fmtMoney(lo)} · MÁX {fmtMoney(hi)}</p>
        <strong className={`tbg-amount${over ? ' is-over' : ''}`} data-amount>{fmtMoney(shown ?? bet.amount)}</strong>
        <p className={`tbg-maxbet${over ? ' is-over' : ''}`}>APUESTA MÁXIMA: {fmtMoney(bet.lim ? bet.lim.max : 0)}</p>
        <small className="tbg-bank">En la caja: {fmtMoney(money)}</small>
      </div>
      <div className="tbg-padwrap">
        <div className="tbg-pad">
          {KEYS.map((k) => <button key={k} type="button" className={`tbg-key${k === 'C' ? ' is-clear' : ''}`} disabled={!active} onClick={() => bet.press(k)} data-key={k} aria-label={k === 'C' ? 'Borrar' : k}>{k === 'C' ? '⌫' : k}</button>)}
        </div>
        <div className="tbg-quick">
          {[['min', 'MÍN'], ['q', '1/4'], ['h', '1/2'], ['all', 'TODO']].map(([k, label]) => <button key={k} type="button" disabled={!active} onClick={() => bet.quick(k)} data-quick={k}>{label}</button>)}
        </div>
      </div>
    </div>
  );
}

// El marco: el título, la ✕ para levantarse, lo del juego a la izquierda y el panel de apuesta a la derecha.
export function Shell({ title, name, onClose, children, pad }) {
  return (
    <div className={`tbg-modal tbg-bj tbg-game-${name}`} role="dialog" aria-label={title} data-bj={name === 'bj' ? '' : undefined} data-game={name}>
      <button type="button" className="tbg-close" onClick={onClose} aria-label="Levantarse de la mesa">✕</button>
      <h2 className="tbg-title">{title}</h2>
      <div className="tbg-bj-body">
        <div className="tbg-bj-left">{children}</div>
        {pad}
      </div>
    </div>
  );
}

// El reloj de un juego de una tirada: mientras dura la animación se redibuja seguido, y al terminar cobra el premio
// (`settle`; si no llega a la primera, insiste). `elapsed` es Infinity cuando ya cobró y vale 0 si nunca se jugó.
export function useSpin(t, clock, onAct) {
  const [, force] = useState(0);
  const act = useRef(onAct);
  act.current = onAct;
  const played = t.bet > 0;
  const pending = played && !t.paid;
  useEffect(() => {
    if (!pending) return undefined;
    const id = setInterval(() => force((n) => n + 1), 40);
    return () => clearInterval(id);
  }, [pending, t.at]);
  const elapsed = pending ? clock() - t.at : played ? Infinity : 0;
  const done = pending && elapsed >= t.ms;
  useEffect(() => {
    if (!done) return undefined;
    act.current({ type: 'settle' });
    const id = setInterval(() => act.current({ type: 'settle' }), 800);
    return () => clearInterval(id);
  }, [done, t.at]);
  return { played, pending, running: pending && !done, elapsed };
}
