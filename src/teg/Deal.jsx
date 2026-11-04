// El reparto inicial, como en la mesa: las cartas de países salen de a una, en ronda, y cada país se pinta del color de
// quien lo recibe. Es solo dibujo: la sala ya tiene los países repartidos (`room.dealt` es el orden en que salieron).
// Se ve una vez por partida en cada pestaña (`sessionStorage`), así recargar no lo repite.
import React, { useEffect, useMemo, useState } from 'react';
import { backgroundInterval, backgroundTimeout } from '../ticker.js';
import { ARMY_COLORS, CONTINENTS, COUNTRIES, SYMBOL_ICONS, cardSymbol } from './board.js';
import { Chip } from './Panels.jsx';

const STEP_MS = 110; // cada carta
const HOLD_MS = 2600; // el cartel final, antes de seguir

const seenKey = (room) => `tg:reparto:${room.startedAt}`;
function wasSeen(room) {
  try { return sessionStorage.getItem(seenKey(room)) === '1'; } catch { return false; }
}
function markSeen(room) {
  try { sessionStorage.setItem(seenKey(room), '1'); } catch {}
}

// Cuántas cartas se ven repartidas (`dealt`, o null si no hay reparto en pantalla), la sala tapada para el mapa
// (los países que todavía no salieron, sin dueño) y `skip` para cortarlo.
export function useDeal(room) {
  const active = room.stage === 'setup1' && room.dealt?.length === COUNTRIES.length;
  const [k, setK] = useState(() => (active && !wasSeen(room) ? 0 : null));
  const total = COUNTRIES.length;

  useEffect(() => {
    if (k === null) return undefined;
    if (k < total) return backgroundInterval(() => setK((v) => (v === null ? null : Math.min(total, v + 1))), STEP_MS);
    return backgroundTimeout(() => { markSeen(room); setK(null); }, HOLD_MS);
  }, [k === null, k === total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si la partida avanzó (o se volvió a la sala) mientras se miraba, se corta.
  useEffect(() => { if (!active && k !== null) setK(null); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    if (k === null) return room;
    const out = new Set(room.dealt.slice(k));
    return { ...room, own: room.own.map((o, c) => (out.has(c) ? -1 : o)), arm: room.arm.map((a, c) => (out.has(c) ? 0 : a)) };
  }, [room, k]);

  return { dealt: k, shown, skip: () => { markSeen(room); setK(null); } };
}

export function DealScene({ room, dealt, me, onSkip }) {
  const done = dealt >= room.dealt.length;
  const last = dealt > 0 ? room.dealt[dealt - 1] : null;
  const n = room.players.length;
  const receiver = last === null ? null : room.players[(dealt - 1) % n];
  const counts = room.players.map((_, i) => Math.max(0, Math.ceil((dealt - i) / n)));
  const country = last === null ? null : COUNTRIES[last];
  const symbol = last === null ? null : cardSymbol(last);
  return (
    <div className="tg-deal" data-deal={dealt} aria-live="polite">
      <div className="tg-deal-head">
        <strong>🃏 {done ? 'Países repartidos' : 'Repartiendo las cartas de países…'}</strong>
        <button type="button" className="tg-link" data-act="skipDeal" onClick={onSkip}>{done ? 'Seguir' : 'Saltar'}</button>
      </div>
      <div className="tg-deal-body">
        {country ? (
          <div key={dealt} className="tg-deal-card" style={{ '--cont': CONTINENTS[country.continent].color }}>
            <small>{CONTINENTS[country.continent].name}</small>
            <strong>{country.name}</strong>
            <span aria-hidden="true">{SYMBOL_ICONS[symbol]}</span>
          </div>
        ) : <div className="tg-deal-card is-back" aria-hidden="true">T.E.G.</div>}
        <div className="tg-deal-info">
          {receiver && !done && (
            <p className="tg-deal-to" style={{ '--who': ARMY_COLORS[receiver.color].color }}>
              para <Chip player={receiver} /> <b>{receiver.id === me.id ? 'vos' : receiver.name}</b>
            </p>
          )}
          {done && <p className="tg-deal-to">Cada uno pone <b>un ejército en cada país que le tocó</b> y las cartas vuelven al mazo. Ahora, los ejércitos iniciales.</p>}
          <ul className="tg-deal-hands">
            {room.players.map((p, i) => (
              <li key={p.id} className={receiver?.id === p.id && !done ? 'is-now' : ''}>
                <Chip player={p} /> {p.id === me.id ? 'Vos' : p.name}: <b>{counts[i]}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="tg-deal-bar"><i style={{ width: `${(dealt / room.dealt.length) * 100}%` }} /></div>
    </div>
  );
}
