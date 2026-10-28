// Paneles al costado del mapa: jugadores, mi objetivo, mis cartas, continentes, bitácora y reglas.
import React, { useState } from 'react';
import {
  ARMY_COLORS, CONTINENTS, COUNTRIES, COUNTRY_COUNT, SYMBOL_ICONS, SYMBOL_NAMES, cardSymbol, countriesOf, objectiveById,
} from './board.js';
import {
  FORCED_TRADE, armiesOf, countOf, inGame, objectiveProgress, ownedIn, ownsContinent, reinforcements, tradeProblem, tradeValue, validSet,
} from './game.js';
import { describe } from './log.js';

export const Chip = ({ player, size = 14 }) => (
  <i className="tg-chip" style={{ background: ARMY_COLORS[player.color].color, width: size, height: size }} title={`Ejército ${ARMY_COLORS[player.color].name.toLowerCase()}`} />
);

export function PlayersPanel({ room, me, onKick }) {
  const host = room.hostId === me?.id;
  const [asking, setAsking] = useState(null);
  const setup = room.stage === 'setup1' || room.stage === 'setup2';
  return (
    <section className="tg-panel" data-players aria-label="Jugadores">
      <h2>Jugadores</h2>
      <ul className="tg-players">
        {room.players.map((p, i) => {
          const turn = room.phase === 'playing' && !setup && room.current === i && inGame(p);
          return (
            <li key={p.id} className={`${turn ? 'is-turn' : ''}${!inGame(p) ? ' is-out' : ''}${p.id === me?.id ? ' is-me' : ''}`} data-player={p.name}>
              <div className="tg-player-top">
                <Chip player={p} size={18} />
                <strong>{p.avatar} {p.name}{p.id === me?.id ? ' (vos)' : ''}</strong>
                {turn && <span className="tg-turn">▶ juega</span>}
                {p.out && <span className="tg-tag">{p.left ? '🚪 se fue' : '💀 eliminado'}</span>}
                {!p.out && p.left && <span className="tg-tag">🚪 se fue</span>}
              </div>
              <div className="tg-player-stats">
                <span title="Países">🗺️ <b data-countries>{countOf(room, i)}</b></span>
                <span title="Ejércitos">🪖 <b>{armiesOf(room, i)}</b></span>
                <span title="Cartas en la mano">🃏 <b>{p.cards.length}</b></span>
                {setup && inGame(p) && <span className={p.pend ? 'tg-pending' : 'tg-done'}>{p.pend ? `faltan ${p.pend}` : '✓ listo'}</span>}
              </div>
              {host && room.phase === 'playing' && p.id !== me.id && !p.left && !p.out && (
                <div className="tg-player-actions">
                  {asking !== p.id && <button type="button" className="tg-link tg-danger" onClick={() => setAsking(p.id)}>Sacar</button>}
                  {asking === p.id && (
                    <>
                      <button type="button" className="tg-link tg-danger" data-act="kickSure" onClick={() => { setAsking(null); onKick(p.id); }}>Sí, sacarlo</button>
                      <button type="button" className="tg-link" onClick={() => setAsking(null)}>No</button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {host && room.phase === 'playing' && <p className="tg-hint">Como anfitrión podés sacar a alguien que se fue sin avisar: sus países quedan sin jugar.</p>}
    </section>
  );
}

// ─── Mi objetivo ─────────────────────────────────────────────────────────────
export function ObjectivePanel({ room, me, mi }) {
  const [shown, setShown] = useState(true);
  if (mi < 0) return null;
  const o = objectiveById(me.obj);
  const prog = objectiveProgress(room, mi);
  return (
    <section className="tg-panel tg-objective" data-objective aria-label="Mi objetivo">
      <div className="tg-panel-head">
        <h2>Tu objetivo secreto</h2>
        <button type="button" className="tg-link" onClick={() => setShown((v) => !v)}>{shown ? '🙈 Ocultar' : '👁 Ver'}</button>
      </div>
      {shown ? (
        <>
          <p className="tg-obj-text">{o.text}</p>
          {o.destroy !== undefined && <p className="tg-hint">Si otro jugador lo destruye antes que vos, pasás a tener que ocupar 30 países.</p>}
          <ul className="tg-progress">
            {prog.lines.map((l) => (
              <li key={l.label}>
                <span>{l.label}</span>
                <b>{l.have} / {l.need}</b>
                <i style={{ '--p': `${Math.min(100, Math.round((l.have / l.need) * 100))}%` }} />
              </li>
            ))}
          </ul>
          <p className="tg-hint">Además, <b>cualquiera gana con 30 países</b>. Tu objetivo es secreto: no lo muestres.</p>
        </>
      ) : <p className="tg-hint">Oculto. Tocá «Ver» cuando nadie mire tu pantalla.</p>}
    </section>
  );
}

// ─── Mis cartas y canje ──────────────────────────────────────────────────────
export function HandPanel({ room, me, mi, dispatch }) {
  const [picked, setPicked] = useState([]);
  if (mi < 0) return null;
  const set = picked.filter((c) => me.cards.includes(c));
  const problem = set.length === 3 ? tradeProblem(room, mi, set) : null;
  const armies = tradeValue(room.tradeN);
  const forced = me.cards.length >= FORCED_TRADE && room.current === mi && room.stage === 'reinforce';
  const toggle = (card) => setPicked((list) => (list.includes(card) ? list.filter((c) => c !== card) : list.length < 3 ? [...list, card] : list));
  const bonus = set.filter((c) => c < COUNTRY_COUNT && room.own[c] === mi).length * 2;
  return (
    <section className="tg-panel" data-hand aria-label="Mis cartas">
      <h2>Mis cartas <small>({me.cards.length})</small></h2>
      {me.cards.length === 0 && <p className="tg-hint">Todavía no tenés cartas. Te llevás una al final de cada turno en el que conquistes un país.</p>}
      <ul className="tg-cards">
        {me.cards.map((card) => {
          const sym = cardSymbol(card);
          const owned = card < COUNTRY_COUNT && room.own[card] === mi;
          return (
            <li key={card}>
              <button type="button" className={`tg-hcard is-${sym}${set.includes(card) ? ' is-picked' : ''}`} aria-pressed={set.includes(card)} onClick={() => toggle(card)} data-card={card}>
                <span className="tg-hcard-icon" aria-hidden="true">{SYMBOL_ICONS[sym]}</span>
                <span className="tg-hcard-name">{card < COUNTRY_COUNT ? COUNTRIES[card].name : 'Comodín'}</span>
                <small>{SYMBOL_NAMES[sym]}{owned ? ' · tuyo' : ''}</small>
              </button>
            </li>
          );
        })}
      </ul>
      {me.cards.length > 0 && (
        <>
          <p className="tg-hint">
            Canje: <b>3 cartas del mismo símbolo</b> o <b>3 símbolos distintos</b> (el comodín vale por cualquiera). El próximo canje de la partida da <b>{armies} ejércitos</b>
            {set.length === 3 && bonus > 0 ? <>, más <b>{bonus}</b> en tus países de esas cartas</> : ' (y +2 en cada país de las cartas que sea tuyo)'}. Solo en tu turno, antes de atacar.
          </p>
          {forced && <p className="tg-problem">Tenés {FORCED_TRADE} cartas: tenés que canjear antes de seguir.</p>}
          {set.length === 3 && !validSet(set) && <p className="tg-problem">Esas tres no hacen un canje.</p>}
          {set.length === 3 && validSet(set) && problem && <p className="tg-problem">{problem}</p>}
          <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={set.length !== 3 || Boolean(problem)} data-act="trade" onClick={() => { dispatch({ type: 'trade', cards: set }); setPicked([]); }}>
            🃏 Canjear por {armies} ejércitos
          </button>
        </>
      )}
    </section>
  );
}

// ─── Continentes ─────────────────────────────────────────────────────────────
export function ContinentsPanel({ room, me, mi }) {
  return (
    <section className="tg-panel" aria-label="Continentes">
      <h2>Continentes</h2>
      <p className="tg-hint">Al empezar tu turno cobrás refuerzos: la mitad de tus países (mínimo 3) y el bonus de cada continente que tengas entero.</p>
      <ul className="tg-continents">
        {Object.entries(CONTINENTS).map(([key, c]) => {
          const total = countriesOf(key).length;
          const owner = room.players.find((_, i) => ownsContinent(room, i, key));
          return (
            <li key={key}>
              <i style={{ background: c.color }} />
              <span>{c.name}</span>
              <small>{total} países</small>
              <b>+{c.bonus}</b>
              <em>{owner ? <><Chip player={owner} /> {owner.id === me?.id ? 'es tuyo' : owner.name}</> : mi >= 0 ? `tenés ${ownedIn(room, mi, key)}` : ''}</em>
            </li>
          );
        })}
      </ul>
      {mi >= 0 && me && inGame(me) && <p className="tg-hint">Tus refuerzos ahora: <b>{reinforcements(room, mi)}</b>.</p>}
    </section>
  );
}

export function LogPanel({ room }) {
  const entries = [...room.log].reverse();
  return (
    <section className="tg-panel" aria-label="Qué pasó">
      <h2>Qué pasó</h2>
      <ol className="tg-log" data-log>
        {entries.length === 0 && <li className="tg-hint">Todavía no pasó nada.</li>}
        {entries.map((e, i) => {
          const { icon, text } = describe(e, room);
          const who = room.players[e.p];
          return (
            <li key={room.log.length - i} style={who ? { '--who': ARMY_COLORS[who.color].color } : undefined}>
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
  ['Objetivo', 'Cumplir tu objetivo secreto (conquistar ciertos continentes o países, o destruir a un ejército de un color) antes que los demás. Siempre vale también conquistar 30 países. En la sala el anfitrión puede dejar solo esa meta común.'],
  ['Cómo empieza', 'Los 50 países se reparten al azar y cada uno arranca con un ejército. Después todos ponen a la vez 5 ejércitos propios y luego 3 más, donde quieran de sus países.'],
  ['Tu turno', '1) Refuerzos: repartís los ejércitos nuevos entre tus países. 2) Ataque: atacás las veces que quieras. 3) Reagrupe: movés ejércitos entre tus países vecinos. Al terminar, si conquistaste al menos un país, te llevás una carta.'],
  ['Refuerzos', 'Recibís la mitad de tus países (redondeando para abajo, mínimo 3) más el bonus de cada continente que tengas entero: Asia 7, Europa 5, América del Norte 5, América del Sur 3, África 3 y Oceanía 2.'],
  ['Atacar', 'Elegís un país tuyo con al menos 2 ejércitos y un vecino enemigo (las líneas punteadas cruzan el mar). Atacás con 1, 2 o 3 dados (siempre queda un ejército en tu país) y el defensor tira hasta 3. Se comparan de mayor a menor: el que saca menos pierde un ejército y, si empatan, pierde el atacante.'],
  ['Conquistar', 'Si dejás al defensor sin ejércitos, el país es tuyo: tenés que pasarle al menos tantos ejércitos como dados tiraste, y podés pasar más. Si era el último país de un jugador, lo eliminás y te quedás con sus cartas.'],
  ['Reagrupar', 'Al final del turno podés pasar ejércitos de un país tuyo a un vecino tuyo, las veces que quieras. Siempre queda uno atrás y los que llegan no se pueden volver a mover en ese turno.'],
  ['Cartas y canje', 'Cada carta tiene un país y un símbolo (cañón, barco o globo); hay 2 comodines. Con 3 del mismo símbolo, o 3 distintos, canjeás por ejércitos: 4, 7, 10, y de ahí de a 5 más (el contador es de toda la partida). Por cada carta de un país tuyo ponés 2 ejércitos extra ahí. Con 5 cartas es obligatorio canjear.'],
];

export function RulesPanel() {
  return (
    <section className="tg-panel" aria-label="Reglas">
      <h2>Reglas</h2>
      <div className="tg-rules">
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
