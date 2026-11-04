// La apertura de la partida, como en la mesa y solo de dibujo (la sala ya tiene todo repartido):
//   1) Misiones secretas: se mezcla el mazo, sale una carta para cada jugador y la tuya llega boca abajo (se espía manteniéndola apretada).
//   2) Reparto de países: el mazo de 50 cartas se mezcla y las cartas salen disparadas, una por una, al país que les toca. Al impactar,
//      el país se ilumina del color de su dueño y cae la ficha con un «1» que rebota.
// Se ve una vez por partida y por pestaña (`sessionStorage`): recargar no lo repite. Se puede saltar.
import React, { useEffect, useMemo, useState } from 'react';
import { backgroundInterval, backgroundTimeout } from '../ticker.js';
import { ARMY_COLORS, COUNTRIES, SYMBOL_ICONS, cardSymbol, objectiveById } from './board.js';
import { MAP_H, MAP_W } from './geo.js';
import { Chip, SecretCard } from './Panels.jsx';

const STEP_MS = 85; // una carta cada tanto
const FLIGHT_MS = 460; // lo que tarda en volar
const LAG = Math.ceil(FLIGHT_MS / STEP_MS); // pasos entre que sale y que impacta
const SHUFFLE_STEPS = 18; // el mazo se mezcla antes de repartir
const HOLD_MS = 2200; // el cartel final
const DECK = [MAP_W / 2, MAP_H / 2 + 20]; // de dónde salen las cartas (en el mapa)

const seenKey = (room) => `tg:apertura:${room.startedAt}`;
const wasSeen = (room) => { try { return sessionStorage.getItem(seenKey(room)) === '1'; } catch { return false; } };
const markSeen = (room) => { try { sessionStorage.setItem(seenKey(room), '1'); } catch {} };

// `phase`: 'mission', 'deal' o null (nada en pantalla). `shown`: la sala tapada para el mapa. `k`: cartas de países ya lanzadas.
export function useOpening(room, me) {
  const total = COUNTRIES.length;
  const fresh = room.stage === 'setup1' && room.dealt?.length === total && room.arm.every((a) => a === 1) && !wasSeen(room);
  const [phase, setPhase] = useState(() => (fresh ? (room.options.goal === 'secret' && me?.obj ? 'mission' : 'deal') : null));
  const [k, setK] = useState(-SHUFFLE_STEPS);
  const active = room.stage === 'setup1' && room.dealt?.length === total;

  useEffect(() => {
    if (phase !== 'deal') return undefined;
    if (k < total + LAG) return backgroundInterval(() => setK((v) => Math.min(total + LAG, v + 1)), STEP_MS);
    return backgroundTimeout(() => { markSeen(room); setPhase(null); }, HOLD_MS);
  }, [phase, k >= total + LAG]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si la partida avanzó (o se volvió a la sala) mientras se miraba, se corta.
  useEffect(() => { if (!active && phase) setPhase(null); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const landed = phase === 'deal' ? Math.max(0, k) - LAG : 0; // cuántas ya impactaron
  const shown = useMemo(() => {
    if (!phase) return room;
    const hidden = new Set(phase === 'mission' ? room.dealt : room.dealt.slice(Math.max(0, landed)));
    return { ...room, own: room.own.map((o, c) => (hidden.has(c) ? -1 : o)), arm: room.arm.map((a, c) => (hidden.has(c) ? 0 : a)) };
  }, [room, phase, landed]);

  return {
    phase, k, landed, shown,
    toDeal: () => { setK(-SHUFFLE_STEPS); setPhase('deal'); },
    skip: () => { markSeen(room); setPhase(null); },
  };
}

// ─── 1) Misiones secretas ────────────────────────────────────────────────────
const SEAT_MS = 520; // entre carta y carta
const seatAt = (i, mi, n) => {
  const a = ((i - mi + n) % n) * ((Math.PI * 2) / n);
  return [50 + 40 * Math.sin(a), 44 + 31 * Math.cos(a)];
};

export function MissionScene({ room, me, mi, onNext, onSkip }) {
  const n = room.players.length;
  const [stage, setStage] = useState('shuffle'); // shuffle → deal → ready
  const o = objectiveById(me.obj);
  useEffect(() => {
    if (stage === 'shuffle') return backgroundTimeout(() => setStage('deal'), 1900);
    if (stage === 'deal') return backgroundTimeout(() => setStage('ready'), n * SEAT_MS + 900);
    return undefined;
  }, [stage, n]);
  return (
    <div className="tg-mission" data-mission={stage} role="dialog" aria-label="Reparto de misiones secretas">
      <div className="tg-mission-top">
        <h2>🎯 Misiones secretas</h2>
        <button type="button" className="tg-link" data-act="skipOpening" onClick={onSkip}>Saltar</button>
      </div>
      <div className="tg-mission-table">
        <div className={`tg-mdeck${stage === 'shuffle' ? ' is-shuffle' : ''}${stage === 'shuffle' ? '' : ' is-spent'}`} aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
        </div>
        {room.players.map((p, i) => {
          const [x, y] = seatAt(i, mi, n);
          const mine = i === mi;
          const dealt = stage !== 'shuffle';
          return (
            <div
              key={p.id} className={`tg-seat${mine ? ' is-me' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, '--dx': `${50 - x}`, '--dy': `${44 - y}`, '--d': `${i * SEAT_MS}ms`, '--who': ARMY_COLORS[p.color].color }}
            >
              {dealt && !mine && <div className="tg-mcard" />}
              {mine && dealt && (
                <div className="tg-mine-card">
                  <SecretCard text={o.text} note={o.destroy !== undefined ? 'Si otro jugador lo destruye antes que vos, pasás a tener que ocupar 30 países.' : ''} big />
                </div>
              )}
              <span className="tg-seat-name"><Chip player={p} size={12} /> {mine ? 'Vos' : p.name}</span>
            </div>
          );
        })}
      </div>
      <div className="tg-mission-foot">
        {stage !== 'ready'
          ? <p>{stage === 'shuffle' ? 'Se mezclan las misiones…' : 'Cada uno recibe una carta boca abajo…'}</p>
          : (
            <>
              <p><b>Mantené apretada tu carta</b> para espiarla: al soltar se tapa sola. Que no la vea nadie.</p>
              <button type="button" className="tf-btn tf-btn-primary" data-act="missionNext" onClick={onNext}>Ya la vi · repartir los países ➜</button>
            </>
          )}
      </div>
    </div>
  );
}

// ─── 2) Reparto de países ────────────────────────────────────────────────────
// Dentro del SVG del mapa: el mazo en el centro y las cartas que están volando.
export function DealFly({ room, k, landed }) {
  const n = room.players.length;
  const total = room.dealt.length;
  const launched = Math.min(total, Math.max(0, k));
  const flying = [];
  for (let i = Math.max(0, landed); i < launched; i++) flying.push(i);
  const shuffling = k < 0;
  return (
    <g className="tg-dealfx" pointerEvents="none">
      {launched < total && (
        <g transform={`translate(${DECK[0]} ${DECK[1]})`} className={shuffling ? 'tg-deck is-shuffle' : 'tg-deck'}>
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} style={{ '--i': i }} className="tg-deck-card">
              <rect x="-20" y="-28" width="40" height="56" rx="5" />
              <path d="M-14,-18 h28 M-14,18 h28 M-12,-14 l24,28 M12,-14 l-24,28" />
              <text y="4" textAnchor="middle">TEG</text>
            </g>
          ))}
        </g>
      )}
      {flying.map((i) => {
        const c = COUNTRIES[room.dealt[i]];
        const owner = room.players[i % n];
        const dx = c.x - DECK[0];
        const dy = c.y - DECK[1];
        return (
          <g key={i} transform={`translate(${DECK[0]} ${DECK[1]})`}>
            <g className="tg-fly" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--rot': `${((i * 37) % 40) - 20}deg`, animationDuration: `${FLIGHT_MS}ms` }}>
              <g className="tg-fly-arc" style={{ animationDuration: `${FLIGHT_MS}ms` }}>
                <rect x="-17" y="-24" width="34" height="48" rx="4" style={{ stroke: ARMY_COLORS[owner.color].color }} />
                <text y="-4" textAnchor="middle" className="n">{c.name}</text>
                <text y="14" textAnchor="middle" className="s">{SYMBOL_ICONS[cardSymbol(room.dealt[i])]}</text>
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
}

// El cartel de arriba mientras se reparte: a quién le toca y cuántos lleva cada uno.
export function DealBar({ room, k, landed, me, onSkip }) {
  const n = room.players.length;
  const total = room.dealt.length;
  const dealt = Math.min(total, Math.max(0, landed));
  const done = landed >= total;
  const counts = room.players.map((_, i) => Math.max(0, Math.ceil((dealt - i) / n)));
  const receiver = k > 0 && !done ? room.players[(Math.min(total, k) - 1) % n] : null;
  return (
    <div className="tg-dealbar" data-deal={dealt} aria-live="polite">
      <div className="tg-dealbar-head">
        <strong>🃏 {done ? 'Países repartidos' : k < 0 ? 'Se mezclan las cartas de países…' : 'Repartiendo los países…'}</strong>
        <span>{dealt} / {total}</span>
        <button type="button" className="tg-link" data-act="skipDeal" onClick={onSkip}>{done ? 'Seguir' : 'Saltar'}</button>
      </div>
      <ul className="tg-dealbar-hands">
        {room.players.map((p, i) => (
          <li key={p.id} className={receiver?.id === p.id ? 'is-now' : ''}>
            <Chip player={p} /> {p.id === me.id ? 'Vos' : p.name}: <b>{counts[i]}</b>
          </li>
        ))}
      </ul>
      <div className="tg-deal-bar"><i style={{ width: `${(dealt / total) * 100}%` }} /></div>
    </div>
  );
}
