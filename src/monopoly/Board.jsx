// El tablero: 40 casilleros alrededor de una grilla de 11 × 11, con las fichas encima.
// El centro lo llena quien use el componente (dados, botones, avisos).
import React, { useEffect, useRef, useState } from 'react';
import { GROUPS, JAIL_POS, SQUARES, TOKEN_COLORS } from './board.js';

// Fila y columna (1 a 11) de cada casillero, empezando abajo a la derecha y dando la vuelta hacia la izquierda.
export function cellOf(pos) {
  if (pos === 0) return { row: 11, col: 11, side: 'corner' };
  if (pos < 10) return { row: 11, col: 11 - pos, side: 'bottom' };
  if (pos === 10) return { row: 11, col: 1, side: 'corner' };
  if (pos < 20) return { row: 11 - (pos - 10), col: 1, side: 'left' };
  if (pos === 20) return { row: 1, col: 1, side: 'corner' };
  if (pos < 30) return { row: 1, col: 1 + (pos - 20), side: 'top' };
  if (pos === 30) return { row: 1, col: 11, side: 'corner' };
  return { row: 1 + (pos - 30), col: 11, side: 'right' };
}

const ICONS = { go: '🏁', jail: '🔒', parking: '🅿️', gotojail: '🚔', chance: '❓', chest: '📦', tax: '🧾', station: '🚆' };
const SHORT = { go: 'Salida', jail: 'Cárcel', parking: 'Descanso', gotojail: 'Andá a la cárcel' };

export const tokenColor = (p) => TOKEN_COLORS[p.color % TOKEN_COLORS.length];

export function Token({ player, size, current, jailed }) {
  return (
    <span
      className={`mp-token${current ? ' is-current' : ''}${jailed ? ' is-jailed' : ''}${player.out ? ' is-out' : ''}`}
      style={{ '--tk': tokenColor(player), ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.5) } : {}) }}
      title={player.name}
      data-token={player.name}
    >
      {player.avatar}
    </span>
  );
}

// Lo que muestra cada ficha mientras camina: avanza de a un casillero (el dibujo es solo visual).
function useShownPositions(players) {
  const [shown, setShown] = useState(() => Object.fromEntries(players.map((p) => [p.id, p.pos])));
  const target = useRef({});
  target.current = Object.fromEntries(players.map((p) => [p.id, p.pos]));
  useEffect(() => {
    const timer = setInterval(() => {
      setShown((prev) => {
        let changed = false;
        const next = {};
        for (const [id, goal] of Object.entries(target.current)) {
          const at = prev[id] ?? goal;
          const ahead = (goal - at + 40) % 40;
          next[id] = at === goal ? at : ahead > 0 && ahead <= 13 ? (at + 1) % 40 : goal;
          if (next[id] !== at) changed = true;
        }
        return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
      });
    }, 130);
    return () => clearInterval(timer);
  }, []);
  return shown;
}

function Square({ pos, room, here, onPick, selected }) {
  const sq = SQUARES[pos];
  const { row, col, side } = cellOf(pos);
  const st = room.props[pos];
  const owner = st && room.players.find((p) => p.id === st.o);
  const group = sq.g && GROUPS[sq.g];
  const mark = SHORT[sq.t] || sq.name;
  return (
    <button
      type="button"
      className={`mp-sq mp-sq-${sq.t} mp-side-${side}${st?.m ? ' is-mortgaged' : ''}${selected ? ' is-selected' : ''}${owner ? ' is-owned' : ''}`}
      style={{ gridRow: row, gridColumn: col, ...(owner ? { '--own': tokenColor(owner) } : {}) }}
      onClick={() => onPick(pos)}
      data-square={pos}
      aria-label={`${sq.name}${sq.price && sq.t !== 'tax' ? `, $${sq.price}` : ''}${owner ? `, de ${owner.name}` : ''}${st?.m ? ', hipotecada' : ''}`}
    >
      {group && (
        <i className="mp-band" style={{ background: group.color }}>
          {st?.h === 5 ? <b className="mp-hotel" /> : Array.from({ length: st?.h || 0 }, (_, i) => <b key={i} className="mp-house" />)}
        </i>
      )}
      <span className="mp-sq-body">
        {!group && <span className="mp-sq-icon" aria-hidden="true">{sq.icon || ICONS[sq.t]}</span>}
        <span className="mp-sq-name">{mark}</span>
        {sq.price && <span className="mp-sq-price">${sq.price}</span>}
        {sq.t === 'go' && <span className="mp-sq-price">+$200</span>}
        {sq.t === 'parking' && room.options.freeParking && <span className="mp-sq-price">pozo ${room.pot}</span>}
        {sq.t === 'jail' && <span className="mp-sq-price">de visita</span>}
      </span>
      {owner && <span className="mp-owner" aria-hidden="true">{owner.avatar}</span>}
      {st?.m ? <span className="mp-mort" aria-hidden="true">H</span> : null}
      {here.length > 0 && (
        <span className="mp-tokens">
          {here.map((p) => <Token key={p.id} player={p} current={p.id === room.current} jailed={pos === JAIL_POS && p.jail > 0} />)}
        </span>
      )}
    </button>
  );
}

export default function Board({ room, onPick, selected, children }) {
  const shown = useShownPositions(room.players);
  const byPos = {};
  for (const p of room.players) {
    if (p.out) continue;
    const at = shown[p.id] ?? p.pos;
    (byPos[at] ||= []).push(p);
  }
  return (
    <div className="mp-board" data-board>
      {SQUARES.map((_, pos) => <Square key={pos} pos={pos} room={room} here={byPos[pos] || []} onPick={onPick} selected={selected === pos} />)}
      <div className="mp-center">{children}</div>
    </div>
  );
}
