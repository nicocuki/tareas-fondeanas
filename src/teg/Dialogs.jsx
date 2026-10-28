// Ventanas del juego: atacar (con los dados a la vista), pasar ejércitos al conquistar y reagrupar.
import React, { useEffect, useRef, useState } from 'react';
import { COUNTRIES } from './board.js';
import { MAX_DICE, movable } from './game.js';

export function Modal({ title, onClose, children, label }) {
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose; // siempre el último, sin volver a armar los eventos en cada render
  useEffect(() => {
    box.current?.focus(); // solo al abrir: si no, se le robaría el foco al que está escribiendo
    const onKey = (e) => { if (e.key === 'Escape') close.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="tg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="tg-modal" role="dialog" aria-modal="true" aria-label={label || title} tabIndex={-1} ref={box}>
        <div className="tg-modal-head">
          <h2>{title}</h2>
          {onClose && <button type="button" className="tg-x" aria-label="Cerrar" onClick={onClose}>✕</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function Die({ value, kind, win }) {
  return (
    <span className={`tg-die is-${kind}${win === undefined ? '' : win ? ' is-win' : ' is-lose'}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[value]?.includes(i) ? 'on' : ''} />)}
    </span>
  );
}

// Los dados de la última batalla, enfrentados de mayor a menor: la pareja ganadora queda marcada.
export function BattleReport({ last }) {
  const rows = Math.max(last.a.length, last.d.length);
  const pairs = Array.from({ length: rows }, (_, k) => ({ a: last.a[k], d: last.d[k], attackerWins: last.a[k] !== undefined && last.d[k] !== undefined ? last.a[k] > last.d[k] : undefined }));
  return (
    <div className="tg-report" data-report>
      <div className="tg-report-side"><b>Ataque</b>{pairs.map((p, k) => (p.a === undefined ? <span key={k} className="tg-die-gap" /> : <Die key={k} value={p.a} kind="atk" win={p.attackerWins} />))}</div>
      <div className="tg-report-side"><b>Defensa</b>{pairs.map((p, k) => (p.d === undefined ? <span key={k} className="tg-die-gap" /> : <Die key={k} value={p.d} kind="def" win={p.attackerWins === undefined ? undefined : !p.attackerWins} />))}</div>
      <p className="tg-report-sum">
        {last.rounds > 1 ? `En ${last.rounds} tiradas: ` : ''}
        el atacante perdió <b>{last.tl}</b> y el defensor perdió <b>{last.td}</b>.
        {last.won ? ' ¡Conquistado!' : ''}
      </p>
    </div>
  );
}

const nameOf = (c) => COUNTRIES[c].name;

// ─── Atacar ──────────────────────────────────────────────────────────────────
export function AttackDialog({ room, from, to, onAttack, onBlitz, onClose }) {
  const mine = room.arm[from];
  const theirs = room.arm[to];
  const defender = room.players[room.own[to]];
  const maxDice = Math.min(MAX_DICE, mine - 1);
  const last = room.last && room.last.f === from && room.last.t === to ? room.last : null;
  const canAttack = room.own[to] !== room.current && maxDice >= 1;
  return (
    <Modal title="⚔️ Atacar" onClose={onClose} label={`Atacar ${nameOf(to)} desde ${nameOf(from)}`}>
      <div className="tg-duel">
        <div><small>Ataca</small><strong>{nameOf(from)}</strong><span className="tg-big">{mine}</span><small>ejércitos</small></div>
        <span className="tg-vs" aria-hidden="true">➜</span>
        <div><small>Defiende {defender?.name}</small><strong>{nameOf(to)}</strong><span className="tg-big">{theirs}</span><small>ejércitos</small></div>
      </div>
      {last && <BattleReport last={last} />}
      {canAttack ? (
        <>
          <p className="tg-note">Elegí con cuántos dados atacás (como máximo, uno menos que tus ejércitos). El defensor tira hasta 3. Se comparan de mayor a menor y <b>los empates los gana el defensor</b>.</p>
          <div className="tg-dice-row">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className="tf-btn tf-btn-primary" disabled={n > maxDice} data-act={`attack${n}`} onClick={() => onAttack(n)}>
                {n} {n === 1 ? 'dado' : 'dados'}
              </button>
            ))}
          </div>
          <button type="button" className="tf-btn tf-btn-soft tf-btn-block" data-act="blitz" onClick={onBlitz}>⚔️ Atacar hasta el final</button>
          <p className="tg-hint">«Hasta el final» tira con todos los dados que pueda hasta conquistar o quedarse con un solo ejército.</p>
        </>
      ) : (
        <p className="tg-note">{last?.won ? '¡Conquistaste el país!' : 'Ya no podés seguir atacando desde acá: te queda un solo ejército.'}</p>
      )}
    </Modal>
  );
}

// ─── Pasar ejércitos al conquistar ───────────────────────────────────────────
function Stepper({ min, max, value, onChange }) {
  return (
    <div className="tg-stepper">
      <button type="button" className="tf-btn tf-btn-soft" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label="Uno menos">−</button>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Cantidad de ejércitos" />
      <button type="button" className="tf-btn tf-btn-soft" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label="Uno más">+</button>
      <b className="tg-count" data-count>{value}</b>
    </div>
  );
}

export function OccupyDialog({ room, onOccupy }) {
  const { from, to, min, max } = room.pending;
  const [n, setN] = useState(max);
  return (
    <Modal title="🚩 ¡Conquistaste!" label="Pasar ejércitos">
      <p className="tg-note">
        Ganaste <b>{nameOf(to)}</b>. Pasale ejércitos desde <b>{nameOf(from)}</b> (te quedan {room.arm[from] - n} allá).
        {min > 1 ? ` Tenés que pasar al menos ${min}: tantos como dados tiraste.` : ' Tenés que pasar al menos uno.'}
      </p>
      <Stepper min={min} max={max} value={n} onChange={setN} />
      <div className="tg-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" data-act="occupy" onClick={() => onOccupy(n)}>Pasar {n}</button>
      </div>
    </Modal>
  );
}

// ─── Reagrupar ───────────────────────────────────────────────────────────────
export function MoveDialog({ room, from, to, onMove, onClose }) {
  const max = movable(room, from);
  const [n, setN] = useState(max);
  return (
    <Modal title="🚚 Reagrupar" onClose={onClose} label="Pasar ejércitos">
      <p className="tg-note">
        Pasá ejércitos de <b>{nameOf(from)}</b> a <b>{nameOf(to)}</b>. Siempre queda uno en el país de origen, y los que lleguen
        no se pueden volver a mover en este turno.
      </p>
      {max >= 1 ? <Stepper min={1} max={max} value={n} onChange={setN} /> : <p className="tg-problem">No tenés ejércitos para mover desde acá.</p>}
      <div className="tg-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={max < 1} data-act="move" onClick={() => onMove(n)}>Pasar {n}</button>
        <button type="button" className="tf-btn tf-btn-soft" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
