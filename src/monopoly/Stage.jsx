// Lo que le da suspenso y claridad a la partida. Todo es dibujo: la sala ya cambió en el servidor, pero cada pantalla
// la muestra de a poco:
//   1. los dados giran sobre el tablero y se frenan mostrando lo que salió,
//   2. la ficha camina hasta el casillero,
//   3. recién ahí aparecen las consecuencias (plata, cartas, avisos), una por una.
import React, { useEffect, useRef, useState } from 'react';
import { backgroundTimeout } from '../ticker.js';
import { announce } from './log.js';
import { findPlayer } from './game.js';
import { Die } from './ActionPanel.jsx';
import { play } from './sfx.js';

export const DICE_MS = 1750; // girando + frenado
const LAND_AT = 1050; // desde acá se ve lo que salió
const STEP_MS = 130; // lo que tarda la ficha por casillero (el mismo valor que Board.jsx)

// Devuelve la sala que hay que mostrar ahora (`shown`) y, mientras hay una tirada en escena, `stage`.
// Mientras dura la escena se muestra la sala de antes de tirar; en el tramo de la caminata, la misma pero con la ficha
// ya en su casillero. Después se pasa a la sala de verdad.
export function useStagedRoom(room) {
  const [seenRoll, setSeenRoll] = useState(room.rollN);
  const [hold, setHold] = useState(null);
  const shownRef = useRef(room);
  const latest = useRef(room);
  latest.current = room;

  if (room.rollN !== seenRoll) { // se ajusta durante el render para que no se vea ni un cuadro de la sala nueva
    setSeenRoll(room.rollN);
    const before = shownRef.current;
    if (room.rollN > seenRoll && room.phase === 'playing' && before.phase === 'playing') {
      setHold({ before, phase: 'dice', key: room.rollN, roller: before.current, dice: room.dice });
    }
  }

  const active = hold && room.phase === 'playing';
  let shown = room;
  if (active) {
    shown = hold.before;
    const target = room.players.find((p) => p.id === hold.roller)?.pos;
    if (hold.phase === 'walk' && target !== undefined) {
      shown = { ...hold.before, players: hold.before.players.map((p) => (p.id === hold.roller ? { ...p, pos: target } : p)) };
    }
  }
  shownRef.current = shown;

  useEffect(() => {
    if (!hold) return undefined;
    if (!active) { setHold(null); return undefined; }
    if (hold.phase === 'dice') return backgroundTimeout(() => setHold((h) => (h && h.key === hold.key ? { ...h, phase: 'walk' } : h)), DICE_MS);
    const from = hold.before.players.find((p) => p.id === hold.roller)?.pos ?? 0;
    const to = latest.current.players.find((p) => p.id === hold.roller)?.pos ?? from;
    const steps = (to - from + 40) % 40;
    const ms = steps === 0 ? 0 : steps <= 13 ? steps * STEP_MS + 350 : 450;
    return backgroundTimeout(() => setHold((h) => (h && h.key === hold.key ? null : h)), ms);
  }, [hold?.key, hold?.phase, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return { shown, stage: active ? { phase: hold.phase, dice: hold.dice, roller: hold.roller, key: hold.key } : null };
}

// ─── Los dados sobre el tablero ──────────────────────────────────────────────
export function DiceRoll({ stage, room, meId }) {
  const [faces, setFaces] = useState([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
  const [landed, setLanded] = useState(false);
  const who = findPlayer(room, stage.roller);
  useEffect(() => {
    play('dice');
    const spin = setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 85);
    const stop = backgroundTimeout(() => { clearInterval(spin); setFaces(stage.dice); setLanded(true); play('land'); }, LAND_AT);
    return () => { clearInterval(spin); stop(); };
  }, [stage.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = landed ? stage.dice : faces;
  const double = landed && stage.dice[0] === stage.dice[1];
  return (
    <div className="mp-diceroll" aria-live="polite" data-diceroll>
      <p className="mp-diceroll-who">
        {!who ? 'Tiran los dados…' : who.id === meId ? (landed ? '¡Sacaste!' : 'Tirás los dados…') : (landed ? `${who.name} sacó…` : `${who.name} tira los dados…`)}
      </p>
      <div className={`mp-diceroll-dice${landed ? ' is-landed' : ''}`}>
        <Die value={a} rolling={!landed} />
        <Die value={b} rolling={!landed} />
      </div>
      <p className={`mp-diceroll-total${landed ? ' is-on' : ''}`}>
        {landed ? <>= <b>{stage.dice[0] + stage.dice[1]}</b></> : ' '}
      </p>
      {double && <p className="mp-diceroll-double">¡DOBLES!</p>}
    </div>
  );
}

// ─── Avisos de lo que pasa ───────────────────────────────────────────────────
const SHOW_MS = 2700;
const BIG_MS = 4200;

// Muestra de a uno, abajo del borde de arriba del tablero, cada cosa que apareció en la bitácora y los cambios de turno.
// Si se acumulan muchos, van más rápido para no quedar atrasados.
export function Announcer({ room, meId, onSquare }) {
  const seen = useRef(room.logN ?? room.log.length);
  const turn = useRef(room.current);
  const counter = useRef(0);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const total = room.logN ?? room.log.length;
    const fresh = total > seen.current ? room.log.slice(-Math.min(total - seen.current, room.log.length)) : [];
    seen.current = total;
    const items = fresh.map((e) => {
      const a = announce(e, room, meId);
      return a && { ...a, s: e.s, p: e.p };
    }).filter(Boolean)
      .filter((a, i, list) => !a.weak || i === list.length - 1);
    if (room.current !== turn.current) {
      turn.current = room.current;
      const next = findPlayer(room, room.current);
      if (next && room.phase === 'playing') {
        items.push(next.id === meId
          ? { icon: '🎲', text: '¡Es tu turno! Tirá los dados.', tone: 'good', turn: true }
          : { icon: '▶️', text: `Ahora juega ${next.name}.`, tone: 'info', weak: true, turn: true });
      }
    }
    if (items.length) setQueue((q) => [...q, ...items.map((a) => ({ ...a, id: ++counter.current }))].slice(-8));
  }, [room.logN, room.log.length, room.current]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current || !queue.length) return undefined;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    if (next.s !== undefined) onSquare?.(next.s);
    if (next.turn) { if (next.tone === 'good') play('turn'); } else if (next.big && next.tone === 'loss') play('bad');
    else if (next.tone === 'gain' || next.tone === 'good' || next.tone === 'loss') play(next.tone);
    return undefined;
  }, [current, queue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuánto dura el aviso que se está viendo (menos si hay varios esperando). Aparte del efecto de arriba, que se
  // vuelve a correr al sacar el siguiente de la cola y se llevaría puesto este reloj.
  const waiting = useRef(0);
  waiting.current = queue.length;
  useEffect(() => {
    if (!current) return undefined;
    const base = current.big ? BIG_MS : SHOW_MS;
    return backgroundTimeout(() => setCurrent(null), waiting.current > 2 ? base * 0.45 : base);
  }, [current]);

  if (!current) return null;
  return (
    <div className="mp-announce" aria-live="polite">
      <button type="button" key={current.id} className={`mp-toast is-${current.tone}${current.big ? ' is-big' : ''}`} onClick={() => setCurrent(null)} data-toast>
        <span className="mp-toast-icon" aria-hidden="true">{current.icon}</span>
        <span>{current.text}</span>
      </button>
    </div>
  );
}

// ─── La plata que sube y baja ────────────────────────────────────────────────
export function CashAmount({ value }) {
  const prev = useRef(value);
  const [delta, setDelta] = useState(null);
  useEffect(() => {
    if (value === prev.current) return undefined;
    const d = typeof value === 'number' && typeof prev.current === 'number' ? value - prev.current : 0;
    prev.current = value;
    if (!d) return undefined;
    setDelta({ d, key: Math.random() });
    return backgroundTimeout(() => setDelta(null), 2000);
  }, [value]);
  return (
    <span className="mp-cash-wrap">
      <b className={`mp-cash-amount${delta ? (delta.d > 0 ? ' is-up' : ' is-down') : ''}`} data-cash>{typeof value === 'number' ? `$${value}` : '—'}</b>
      {delta && <i key={delta.key} className={`mp-delta ${delta.d > 0 ? 'is-up' : 'is-down'}`}>{delta.d > 0 ? '+' : '−'}${Math.abs(delta.d)}</i>}
    </span>
  );
}
