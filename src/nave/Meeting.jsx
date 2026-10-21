// Pantallas de Entre Nosotros que tapan la nave: quién sos al empezar, la reunión con su chat,
// los resultados de la votación y la expulsión.
import React, { useEffect, useRef, useState } from 'react';
import Bean from './Bean.jsx';
import { CHAT_LEN, EJECT_MS, RESULTS_MS, colorOf, findPlayer, inGame } from './game.js';

const seconds = (ms) => Math.max(0, Math.ceil(ms / 1000));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ─── Quién sos ───────────────────────────────────────────────────────────────
export function Roles({ room, me }) {
  const imps = inGame(room).filter((p) => p.impostor);
  const shown = me.impostor ? imps : inGame(room);
  return (
    <div className={`nv-screen nv-roles${me.impostor ? ' is-impostor' : ''}`}>
      <p className="nv-roles-hint">{me.impostor ? 'Matá a los tripulantes sin que te descubran.' : `Hay ${plural(imps.length, 'impostor', 'impostores')} entre nosotros`}</p>
      <h1>{me.impostor ? 'Impostor' : 'Tripulante'}</h1>
      <div className="nv-roles-beans">
        {shown.map((p) => (
          <figure key={p.id} className={p.id === me.id ? 'is-me' : ''}>
            <Bean color={colorOf(p).body} size={p.id === me.id ? 120 : 84} />
            <figcaption style={{ color: me.impostor ? '#ff4d4d' : undefined }}>{p.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────
// `ghostOnly`: el chat de los fantasmas durante la partida. Los vivos no ven el de los fantasmas.
export function ChatBox({ room, me, onSend, ghostOnly = false, disabled = false, placeholder }) {
  const [text, setText] = useState('');
  const list = useRef(null);
  const dead = !me.alive;
  const messages = room.chat.filter((c) => (ghostOnly ? c.g : dead || !c.g));
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [messages.length]);
  return (
    <div className={`nv-chat${ghostOnly ? ' is-ghost' : ''}`}>
      <ol ref={list} data-chat-list>
        {messages.length === 0 && <li className="nv-chat-empty">{ghostOnly ? 'Charla entre fantasmas: los vivos no la ven.' : 'Todavía nadie dijo nada.'}</li>}
        {messages.map((c, i) => {
          const p = findPlayer(room, c.id);
          return (
            <li key={`${c.at}-${i}`} className={`${c.id === me.id ? 'is-me' : ''}${c.g ? ' is-ghost' : ''}`}>
              <Bean color={colorOf(p).body} size={26} ghost={Boolean(c.g)} />
              <div><strong style={{ color: colorOf(p).body }}>{p?.name || '¿?'}{c.g ? ' 👻' : ''}</strong><p>{c.x}</p></div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onSend(text); setText(''); }}>
        <input className="tf-input" value={text} maxLength={CHAT_LEN} disabled={disabled} placeholder={placeholder || (dead ? 'Mensaje para los fantasmas…' : 'Escribí algo…')} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="tf-btn tf-btn-soft" disabled={disabled || !text.trim()}>Mandar</button>
      </form>
    </div>
  );
}

// ─── Reunión ─────────────────────────────────────────────────────────────────
export function Meeting({ room, me, now, onDispatch }) {
  const m = room.meeting;
  const [picked, setPicked] = useState(null);
  const caller = findPlayer(room, m.caller);
  const victim = m.body ? findPlayer(room, m.body) : null;
  const voting = now >= m.votingAt;
  const myVote = m.votes[me.id];
  const canVote = voting && me.alive && me.inGame && !myVote;
  const vote = (target) => { setPicked(null); onDispatch({ type: 'vote', target, meeting: m.n }); };
  const sameTeam = (p) => me.impostor && p.impostor;
  return (
    <div className="nv-screen nv-meeting">
      <div className="nv-meeting-board">
        <header>
          <h1>¿Quién es el impostor?</h1>
          <p>{victim ? `${caller?.name} encontró el cuerpo de ${victim.name}.` : `${caller?.name} llamó a una reunión de emergencia.`}</p>
          <span className="nv-meeting-clock">{voting ? `La votación termina en ${seconds(m.endsAt - now)} s` : `Votación en ${seconds(m.votingAt - now)} s`}</span>
        </header>
        <ul className="nv-vote-grid">
          {inGame(room).map((p) => {
            const voted = Boolean(m.votes[p.id]);
            const choosable = canVote && p.alive;
            return (
              <li key={p.id} className={`${p.alive ? '' : 'is-dead'}${picked === p.id ? ' is-picked' : ''}${myVote === p.id ? ' is-my-vote' : ''}`}>
                <button type="button" disabled={!choosable} onClick={() => setPicked(p.id)} data-vote={p.name}>
                  <Bean color={colorOf(p).body} size={44} dead={!p.alive} />
                  <span className="nv-vote-name" style={{ color: sameTeam(p) ? '#ff4d4d' : undefined }}>{p.name}{p.id === me.id ? ' (vos)' : ''}</span>
                  {p.id === m.caller && <span className="nv-vote-tag" title="Llamó a la reunión">📢</span>}
                  {voted && p.alive && <span className="nv-vote-tag is-voted">Votó</span>}
                </button>
                {picked === p.id && (
                  <span className="nv-vote-confirm">
                    <button type="button" className="is-yes" onClick={() => vote(p.id)} aria-label={`Votar a ${p.name}`}>✓</button>
                    <button type="button" className="is-no" onClick={() => setPicked(null)} aria-label="Cancelar">✕</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <footer>
          {picked === 'skip' ? (
            <span className="nv-vote-confirm is-inline">
              Saltear la votación
              <button type="button" className="is-yes" onClick={() => vote('skip')} aria-label="Saltear">✓</button>
              <button type="button" className="is-no" onClick={() => setPicked(null)} aria-label="Cancelar">✕</button>
            </span>
          ) : (
            <button type="button" className="tf-btn tf-btn-soft" disabled={!canVote} onClick={() => setPicked('skip')} data-vote="skip">Saltear</button>
          )}
          <span className="nv-meeting-status">
            {!me.alive ? 'Sos un fantasma: no votás.' : myVote ? (myVote === 'skip' ? 'Salteaste.' : `Votaste a ${findPlayer(room, myVote)?.name}.`) : voting ? 'Elegí a quién expulsar.' : 'Hablen: todavía no se vota.'}
          </span>
        </footer>
      </div>
      <ChatBox room={room} me={me} onSend={(text) => onDispatch({ type: 'chat', text })} />
    </div>
  );
}

// ─── Resultados y expulsión ──────────────────────────────────────────────────
export function Ejection({ room, me, now }) {
  const e = room.ejection;
  const m = room.meeting;
  const elapsed = now - (room.phaseEndsAt - EJECT_MS);
  const ejected = e.id ? findPlayer(room, e.id) : null;
  if (elapsed < RESULTS_MS && m) {
    const byTarget = {};
    for (const [voter, target] of Object.entries(m.votes)) (byTarget[target] ||= []).push(voter);
    const dots = (ids) => (ids || []).map((id) => {
      const p = findPlayer(room, id);
      return <i key={id} className="nv-dot" style={{ background: room.options.anonymousVotes ? '#8a8f99' : colorOf(p).body }} title={room.options.anonymousVotes ? '' : p?.name} />;
    });
    return (
      <div className="nv-screen nv-meeting">
        <div className="nv-meeting-board">
          <header><h1>Resultados</h1></header>
          <ul className="nv-vote-grid is-results">
            {inGame(room).map((p) => (
              <li key={p.id} className={`${p.alive || p.id === e.id ? '' : 'is-dead'}${p.id === e.id ? ' is-picked' : ''}`}>
                <div className="nv-vote-row"><Bean color={colorOf(p).body} size={40} dead={!p.alive && p.id !== e.id} /><span className="nv-vote-name">{p.name}</span><span className="nv-dots">{dots(byTarget[p.id])}</span></div>
              </li>
            ))}
          </ul>
          <footer><span>Saltearon:</span><span className="nv-dots">{dots(byTarget.skip)}</span></footer>
        </div>
      </div>
    );
  }
  let line;
  if (!ejected) line = `Nadie fue expulsado. ${e.tie ? '(Empate)' : '(Saltearon)'}`;
  else if (!room.options.confirmEjects) line = `${ejected.name} fue expulsado.`;
  else line = `${ejected.name} ${e.impostor ? 'era' : 'no era'} ${room.players.filter((p) => p.impostor).length > 1 ? 'un impostor' : 'el impostor'}.`;
  const shown = Math.min(line.length, Math.floor((elapsed - RESULTS_MS) / 55));
  return (
    <div className="nv-screen nv-eject">
      {ejected && <div className="nv-eject-bean" style={{ animationDuration: `${(EJECT_MS - RESULTS_MS) / 1000}s` }}><Bean color={colorOf(ejected).body} size={110} /></div>}
      <p className="nv-eject-text">{line.slice(0, shown)}<span className="nv-caret" /></p>
      {room.options.confirmEjects && shown >= line.length && <p className="nv-eject-sub">{e.impostorsLeft === 1 ? 'Queda 1 impostor.' : `Quedan ${e.impostorsLeft} impostores.`}</p>}
      {me.id === e.id && shown >= line.length && <p className="nv-eject-sub">Ahora sos un fantasma.</p>}
    </div>
  );
}
