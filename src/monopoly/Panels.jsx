// Paneles al costado del tablero: jugadores, mis propiedades, bitácora y reglas.
import React, { useState } from 'react';
import { GROUPS, GROUP_KEYS, SQUARES, groupSquares, houseCost, mortgageValue, unmortgageCost } from './board.js';
import {
  buildProblem, debtTotal, findPlayer, hotelsLeft, housesLeft, mortgageProblem, netWorth, ownedBy, ownsGroup,
  sellBuildingProblem, unmortgageProblem,
} from './game.js';
import { describe } from './log.js';
import { Token, tokenColor } from './Board.jsx';

const money = (n) => `$${n}`;

// Los puntitos de color de las propiedades de alguien (llenos si tiene la tanda completa).
function Deeds({ room, id, onPick }) {
  const list = ownedBy(room, id);
  if (!list.length) return <small className="mp-none">Sin propiedades</small>;
  return (
    <span className="mp-deeds">
      {list.map((pos) => {
        const sq = SQUARES[pos];
        const st = room.props[pos];
        return (
          <button
            key={pos} type="button" onClick={() => onPick(pos)}
            className={`mp-dot${st.m ? ' is-mortgaged' : ''}`}
            style={{ background: sq.g ? GROUPS[sq.g].color : sq.t === 'station' ? '#444' : '#c9b24a' }}
            title={`${sq.name}${st.m ? ' (hipotecada)' : st.h ? ` · ${st.h === 5 ? 'hotel' : `${st.h} casa${st.h > 1 ? 's' : ''}`}` : ''}`}
            aria-label={sq.name}
          >
            {sq.t === 'station' ? '🚆' : sq.t === 'utility' ? sq.icon : ''}
          </button>
        );
      })}
    </span>
  );
}

export function PlayersPanel({ room, me, onPick, onTrade, onKick }) {
  const host = room.hostId === me?.id;
  const [asking, setAsking] = useState(null);
  return (
    <section className="mp-panel" data-players aria-label="Jugadores">
      <h2>Jugadores</h2>
      <ul className="mp-players">
        {room.players.filter((p) => !p.left || room.phase === 'ended').map((p) => {
          const mineRow = p.id === me?.id;
          const debt = debtTotal(room, p.id);
          return (
            <li key={p.id} className={`${p.id === room.current && room.phase === 'playing' ? 'is-turn' : ''}${p.out ? ' is-out' : ''}${mineRow ? ' is-me' : ''}`} data-player={p.name}>
              <div className="mp-player-top">
                <Token player={p} size={34} current={p.id === room.current && room.phase === 'playing'} />
                <div className="mp-player-name">
                  <strong>{p.name}{mineRow ? ' (vos)' : ''}</strong>
                  <small>
                    {p.out ? (p.left ? '🚪 se fue' : '💀 quebró') : p.id === room.current && room.phase === 'playing' ? '▶ le toca' : p.id === room.hostId ? '👑 anfitrión' : ''}
                    {p.jail > 0 && !p.out ? ' · 🔒 en la cárcel' : ''}
                    {p.jf.length > 0 ? ` · 🎟 ${p.jf.length}` : ''}
                  </small>
                </div>
                <b className="mp-cash-amount" data-cash>{p.out ? '—' : money(p.cash)}</b>
              </div>
              {debt > 0 && <small className="mp-owes">Debe {money(debt)}</small>}
              <Deeds room={room} id={p.id} onPick={onPick} />
              {!p.out && !mineRow && me && !me.out && room.phase === 'playing' && (
                <div className="mp-player-actions">
                  <button type="button" className="mp-link" data-act="tradeWith" onClick={() => onTrade(p.id)}>🤝 Tratar</button>
                  {host && asking !== p.id && <button type="button" className="mp-link mp-danger" onClick={() => setAsking(p.id)}>Sacar</button>}
                  {host && asking === p.id && (
                    <>
                      <button type="button" className="mp-link mp-danger" data-act="kickSure" onClick={() => { setAsking(null); onKick(p.id); }}>Sí, sacarlo</button>
                      <button type="button" className="mp-link" onClick={() => setAsking(null)}>No</button>
                    </>
                  )}
                </div>
              )}
              {room.phase === 'ended' && <small className="mp-networth">Patrimonio: {money(netWorth(room, p.id))}</small>}
            </li>
          );
        })}
      </ul>
      {host && room.phase === 'playing' && <p className="mp-hint">Como anfitrión podés sacar a alguien que se fue sin avisar: pierde todo contra el banco.</p>}
    </section>
  );
}

function PropRow({ room, me, pos, dispatch, onPick }) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  const build = buildProblem(room, me.id, pos);
  const sell = sellBuildingProblem(room, me.id, pos);
  const mort = mortgageProblem(room, me.id, pos);
  const unmort = unmortgageProblem(room, me.id, pos);
  return (
    <li className={st.m ? 'is-mortgaged' : ''} data-prop={sq.name}>
      <button type="button" className="mp-prop-name" onClick={() => onPick(pos)}>
        <span>{sq.name}</span>
        <small>{st.m ? 'hipotecada' : st.h === 5 ? '🏨 hotel' : st.h ? `${'🏠'.repeat(st.h)}` : sq.t === 'street' ? `alquiler ${money(sq.rent[0])}` : ''}</small>
      </button>
      <span className="mp-prop-btns">
        {sq.t === 'street' && !st.m && (
          <>
            <button type="button" className="mp-mini" disabled={Boolean(build)} title={build || `Construir (${money(houseCost(pos))})`} aria-label={`Construir en ${sq.name}`} data-act="build" data-pos={pos} onClick={() => dispatch({ type: 'build', pos })}>+🏠</button>
            {st.h > 0 && <button type="button" className="mp-mini" disabled={Boolean(sell)} title={sell || `Vender una casa (+${money(Math.floor(houseCost(pos) / 2))})`} aria-label={`Vender una casa de ${sq.name}`} data-act="sellBuilding" data-pos={pos} onClick={() => dispatch({ type: 'sellBuilding', pos })}>−🏠</button>}
          </>
        )}
        {!st.m
          ? <button type="button" className="mp-mini" disabled={Boolean(mort)} title={mort || `Hipotecar (+${money(mortgageValue(pos))})`} aria-label={`Hipotecar ${sq.name}`} data-act="mortgage" data-pos={pos} onClick={() => dispatch({ type: 'mortgage', pos })}>🏦 +{money(mortgageValue(pos))}</button>
          : <button type="button" className="mp-mini" disabled={Boolean(unmort)} title={unmort || `Levantar la hipoteca (-${money(unmortgageCost(pos))})`} aria-label={`Levantar la hipoteca de ${sq.name}`} data-act="unmortgage" data-pos={pos} onClick={() => dispatch({ type: 'unmortgage', pos })}>✅ −{money(unmortgageCost(pos))}</button>}
      </span>
    </li>
  );
}

export function PropertiesPanel({ room, me, dispatch, onPick }) {
  if (!me || me.out) return null;
  const list = ownedBy(room, me.id);
  const kindOf = (pos) => SQUARES[pos].g || SQUARES[pos].t; // el color, o 'station' / 'utility'
  const groups = [...GROUP_KEYS, 'station', 'utility'].filter((g) => list.some((pos) => kindOf(pos) === g));
  return (
    <section className="mp-panel" data-mine aria-label="Mis propiedades">
      <h2>Mis propiedades</h2>
      {list.length === 0 && <p className="mp-hint">Todavía no tenés ninguna. Cuando caigas en una sin dueño, vas a poder comprarla.</p>}
      {groups.map((g) => {
        const isGroup = GROUPS[g];
        const members = list.filter((pos) => kindOf(pos) === g);
        const total = isGroup ? groupSquares(g).length : 0;
        const full = isGroup && ownsGroup(room, me.id, g);
        return (
          <div key={g} className="mp-group">
            <h3>
              <i style={{ background: isGroup ? GROUPS[g].color : '#555' }} />
              {isGroup ? GROUPS[g].name : g === 'station' ? 'Estaciones' : 'Compañías'}
              {isGroup && <small>{full ? `✓ tanda completa: podés construir (${money(GROUPS[g].house)} por casa)` : `${members.length} de ${total}: te faltan para construir`}</small>}
              {g === 'station' && <small>{members.length} de 4: el alquiler sube con cada una</small>}
              {g === 'utility' && <small>{members.length} de 2: se paga según los dados</small>}
            </h3>
            <ul>{members.map((pos) => <PropRow key={pos} room={room} me={me} pos={pos} dispatch={dispatch} onPick={onPick} />)}</ul>
          </div>
        );
      })}
      {list.length > 0 && <p className="mp-hint">Casas libres en el banco: {housesLeft(room)} · Hoteles: {hotelsLeft(room)}. Para construir hace falta toda la tanda y hay que ir parejo.</p>}
    </section>
  );
}

export function LogPanel({ room }) {
  const entries = [...room.log].reverse();
  return (
    <section className="mp-panel" aria-label="Qué pasó">
      <h2>Qué pasó</h2>
      <ol className="mp-log" data-log>
        {entries.length === 0 && <li className="mp-hint">Todavía no pasó nada.</li>}
        {entries.map((e, i) => {
          const { icon, text } = describe(e, room);
          const who = e.p ? findPlayer(room, e.p) : null;
          return (
            <li key={room.log.length - i} className={`mp-log-${e.k}`} style={who ? { '--who': tokenColor(who) } : undefined}>
              <span aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const RULES = [
  ['Objetivo', 'Quedarte con toda la plata del tablero. Cuando un jugador no puede pagar lo que debe, quiebra y sale. Gana el último que queda.'],
  ['Tu turno', 'Tirás los dos dados y avanzás esa cantidad de casilleros. Según donde caigas: comprás la propiedad si no tiene dueño, pagás alquiler si es de otro, sacás una carta, pagás un impuesto, etc. Si sacás dobles (los dos dados iguales) tirás otra vez; tres dobles seguidos te mandan a la cárcel. Cada vez que pasás por la Salida cobrás $200.'],
  ['Comprar y subastar', 'Si caés en una propiedad sin dueño podés comprarla al precio de lista. Si no la querés (o no podés), se subasta entre todos por turnos: cada uno sube la oferta o se baja, y gana la oferta más alta.'],
  ['Alquileres', 'Cuando caés en una propiedad ajena le pagás alquiler al dueño. Si el dueño tiene todas las calles de un color (una «tanda»), el alquiler básico se duplica. Las estaciones cobran más cuantas más tenga el dueño, y las compañías cobran según lo que sacaste con los dados. Una propiedad hipotecada no cobra.'],
  ['Construir', 'Con la tanda completa podés comprar casas (hasta 4) y después un hotel en cada calle. Cada casa sube mucho el alquiler. Hay que construir parejo: no podés poner la 2.ª casa en una calle si otra del color tiene 0. Solo se construye en tu turno, y el banco tiene 32 casas y 12 hoteles.'],
  ['Hipotecas', 'Si necesitás plata, hipotecá una propiedad: el banco te da la mitad de su precio, pero deja de cobrar alquiler. Para levantar la hipoteca devolvés lo que te dieron más un 10 %. Si hay casas en el color, primero hay que venderlas (el banco te paga la mitad de lo que costaron).'],
  ['Cárcel', 'Vas a la cárcel si caés en «Andá a la cárcel», si sacás tres dobles seguidos o si lo dice una carta. Para salir: pagás $50, usás una carta de «Salir gratis», o tirás buscando dobles (hasta 3 intentos; al tercero, si no salen, pagás $50 igual). Preso, igual cobrás alquileres.'],
  ['Tratos', 'Podés proponerle a otro jugador un intercambio de propiedades, plata y cartas de la cárcel, en cualquier momento. Si acepta, se hace todo junto. No se pueden tratar propiedades con edificios en su color.'],
  ['Deudas y quiebra', 'Si tenés que pagar más plata de la que tenés, juntala hipotecando, vendiendo casas o haciendo tratos, y después pagá. Si ni vendiendo todo llegás, declarás la quiebra: le das todo al acreedor (o, si le debías al banco, todo se subasta) y quedás afuera.'],
];

export function RulesPanel() {
  return (
    <section className="mp-panel" aria-label="Reglas">
      <h2>Reglas</h2>
      <div className="mp-rules">
        {RULES.map(([title, text]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p>{text}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
