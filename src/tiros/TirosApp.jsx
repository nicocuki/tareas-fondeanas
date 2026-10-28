// A los Tiros: entrada, sala de espera, elegir cartas, la pelea y el final.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval } from '../ticker.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import { CARDS } from './cards.js';
import {
  GAME_TYPE, MAX_CARD_LIMIT, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, currentPicker, findPlayer, makeId, newRoom, ranking,
} from './game.js';
import TirosGame from './TirosGame.jsx';
import PickStage from './PickStage.jsx';
import './tiros.css';
import { isKicked } from '../lobby/kick.js';

const GAME = 'tiros';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
const setUrlCode = (code) => window.history.replaceState(null, '', gameUrl(GAME, code));

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  // Con el link de una sala se ve directo «te estás uniendo a la sala de…».
  const [invite, setInvite] = useState(() => codeFromUrl().length === 4);
  const save = () => setProfile({ name, avatar });
  // El anfitrión que se pasó de otro juego con todos: la sala se crea sola.
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root tt-page">
        <JoinInvite
          gameId={GAME} code={code} name={name} onName={setName} avatar={avatar} onAvatar={setAvatar}
          busy={busy} error={error} onBack={onBack}
          onJoin={() => { save(); onJoin(code, name, avatar); }}
          onCancel={() => { setInvite(false); setCode(''); setUrlCode(''); }}
        />
      </div>
    );
  }
  return (
    <div className="cs-root tt-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="tt-card tt-entry">
        <label className="tf-field">
          <span>Tu nombre</span>
          <input className="tf-input" value={name} maxLength={20} placeholder="¿Cómo te llamás?" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="tf-field">
          <span>Avatar</span>
          <div className="tf-avatar-grid">
            {AVATARS.map((a) => <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        {error && <p className="tt-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="tt-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="tt-hint">Se juega con teclado y mouse.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const opts = room.options;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const enough = room.players.length >= MIN_PLAYERS;
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="A los Tiros · sala de espera" subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="tt-card">
        <div className="tt-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="tt-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="tt-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Puntos para ganar" hint="Cada ronda ganada da un punto.">
          <Segmented name="rounds" value={opts.rounds} disabled={!host} onChange={(v) => set({ rounds: v })} choices={[3, 5, 7].map((n) => ({ value: n, label: String(n) }))} />
        </OptionField>
        <OptionField title="Peleas para ganar una ronda" hint={opts.battles === 2 ? 'Como el original: al mejor de 3.' : opts.battles === 1 ? 'Cada pelea es una ronda: más cartas, más rápido.' : 'Al mejor de 5.'}>
          <Segmented name="battles" value={opts.battles} disabled={!host} onChange={(v) => set({ battles: v })} choices={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        </OptionField>
        <CardLimitField value={opts.cardLimit || 0} host={host} onChange={(v) => set({ cardLimit: v })} />
      </LobbyOptions>
      <div className="tt-card tt-controls">
        <h2>Controles</h2>
        <ul>
          <li><kbd>A</kbd> <kbd>D</kbd> moverse · <kbd>W</kbd> o <kbd>Espacio</kbd> saltar (también desde las paredes)</li>
          <li>Mouse para apuntar · <b>clic izquierdo</b> disparar · <b>clic derecho</b> o <kbd>Shift</kbd> escudo</li>
        </ul>
      </div>
      <div className="tt-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary tt-start-btn" disabled={!enough} onClick={() => onDispatch({ type: 'start' })}>🎯 ¡A los tiros!</button>
        ) : <p>Esperando que el anfitrión arranque…</p>}
        {!enough && <p className="tt-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
      </div>
    </LobbyLayout>
  );
}

// Modo «Fila de cartas»: apagado, o un tope de cartas por jugador que elige el anfitrión.
function CardLimitField({ value, host, onChange }) {
  const [draft, setDraft] = useState(String(value || 8));
  useEffect(() => { if (value) setDraft(String(value)); }, [value]);
  const on = value > 0;
  const commit = (text) => {
    setDraft(text);
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_CARD_LIMIT) onChange(n);
  };
  return (
    <OptionField title="Fila de cartas" hint={on ? `Cada uno tiene como mucho ${value} carta${value === 1 ? '' : 's'}: al elegir una más, se va la primera que eligió.` : 'Apagado: las cartas se juntan sin tope, como en el original.'}>
      <Segmented name="cardLimitOn" value={on} disabled={!host} onChange={(v) => onChange(v ? Math.max(1, Math.min(MAX_CARD_LIMIT, Number(draft) || 8)) : 0)} choices={[{ value: false, label: 'Apagada' }, { value: true, label: 'Encendida' }]} />
      {on && (
        <label className="tt-limit">
          <span>Máximo de cartas</span>
          <input
            className="tf-input" type="number" inputMode="numeric" min={1} max={MAX_CARD_LIMIT} value={host ? draft : value} disabled={!host} data-opt="cardLimit"
            onChange={(e) => commit(e.target.value)}
            onBlur={() => setDraft(String(value))}
          />
        </label>
      )}
    </OptionField>
  );
}

// ─── Marcador ────────────────────────────────────────────────────────────────
function Scoreboard({ room, me }) {
  return (
    <div className="tt-score" data-score>
      {room.players.filter((p) => p.inGame).map((p) => (
        <div key={p.id} className={`tt-score-player${p.id === me.id ? ' is-me' : ''}${room.battle?.dead?.[p.id] ? ' is-dead' : ''}${currentPicker(room) === p.id ? ' is-picking' : ''}`}>
          <span className="tt-dot" style={{ background: p.color }} />
          <strong>{p.name}</strong>
          <span className="tt-points" title="Puntos">
            {Array.from({ length: room.options.rounds }, (_, i) => <i key={i} className={i < p.points ? 'is-on' : ''} style={i < p.points ? { background: p.color } : undefined} />)}
          </span>
          {room.options.battles > 1 && (
            <span className="tt-wins" title="Peleas ganadas en esta ronda">
              {Array.from({ length: room.options.battles }, (_, i) => <i key={i} className={i < p.wins ? 'is-on' : ''} />)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function MyCards({ room }) {
  const players = room.players.filter((p) => p.inGame && p.cards.length);
  const limit = room.options.cardLimit || 0;
  if (!players.length) return null;
  return (
    <div className="tt-decks">
      {limit > 0 && <p className="tt-hint tt-limit-hint">Fila de cartas: hasta {limit} cada uno. La marcada con ⏏ es la próxima que se va.</p>}
      {players.map((p) => (
        <div key={p.id} className="tt-deck">
          <span className="tt-dot" style={{ background: p.color }} />
          <span className="tt-deck-name">{p.name}{limit > 0 && <small> {p.cards.length}/{limit}</small>}</span>
          {p.cards.map((c, i) => {
            const leaving = limit > 0 && i === 0 && p.cards.length >= limit;
            return <span key={`${c}-${i}`} className={`tt-chip is-${CARDS[c]?.rarity}${leaving ? ' is-leaving' : ''}`} title={CARDS[c]?.lines.map((l) => l.slice(2)).join(' · ')}>{leaving && '⏏ '}{CARDS[c]?.name}</span>;
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Elegir carta ────────────────────────────────────────────────────────────
function Picking({ room, me, code, now, onDispatch }) {
  return (
    <div className="cs-root tt-page">
      <Scoreboard room={room} me={me} />
      {Array.isArray(room.picking?.order)
        ? <PickStage room={room} me={me} code={code} now={now} onPick={(card, turn) => onDispatch({ type: 'pick', card, turn })} />
        : <p className="tt-hint tt-center">Preparando las cartas…</p>}
      <MyCards room={room} />
    </div>
  );
}

// ─── Final ───────────────────────────────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const rank = ranking(room);
  const champion = findPlayer(room, room.champion);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="cs-root tt-page">
      <div className="tt-card tt-final">
        <p className="tt-eyebrow">Fin de la partida</p>
        <h1>{champion ? (champion.id === me.id ? '¡Ganaste!' : `¡Ganó ${champion.name}!`) : 'Fin'}</h1>
        <ol className="tt-ranking">
          {rank.map((p, i) => <li key={p.id} className={p.id === me.id ? 'is-me' : ''}><span>{medals[i] || `${i + 1}.`} <span className="tt-dot" style={{ background: p.color }} /> {p.name}</span><strong>{p.points} pts</strong></li>)}
        </ol>
        <div className="tt-final-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })}>🎯 Otra partida</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="tt-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
      <MyCards room={room} />
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function TirosApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);
  const now = tick + offset;

  useRegisterRoom(GAME, code, () => handleLeave());
  // La pantalla completa del header agranda solo la ventana del juego (cartas, pelea y final).
  const screenRef = useRef(null);
  useFullscreenTarget(screenRef);
  useEffect(() => backend.subscribeServerOffset(setOffset), []);

  useEffect(() => {
    if (!code) return undefined;
    setRoom(null);
    return backend.subscribeRoom(code, (data) => {
      if (data && data.gameType === GAME_TYPE) { setRoom(data); return; }
      clearSession();
      setUrlCode('');
      setSession(null);
      setError('Esa sala ya no existe.');
    }, () => setError('No se pudo conectar con la sala.'));
  }, [code]);

  const timed = room && ['picking', 'battleEnd', 'fight'].includes(room.phase);
  useEffect(() => {
    if (!timed) return undefined;
    // Con el reloj del Worker: con la pestaña de fondo, setInterval se atrasa y el turno no se cerraba a tiempo.
    return backgroundInterval(() => setTick(Date.now()), 250);
  }, [timed]);

  // Cuando se termina un reloj, cualquiera avisa; la transacción deja pasar un solo aviso.
  const tickSent = useRef('');
  useEffect(() => {
    if (!timed || !me || !room.phaseEndsAt || now < room.phaseEndsAt) return;
    const key = `${room.phase}:${room.battle?.n}:${room.phaseEndsAt}`;
    if (tickSent.current === key) return;
    tickSent.current = key;
    dispatch({ type: 'tick', phase: room.phase, battle: room.battle?.n });
  });

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now() + offset, rand: Math.random }));
    } catch {
      setError('No se pudo guardar. Revisá tu conexión.');
      return null;
    }
  }

  async function handleCreate(name, avatar) {
    setBusy(true);
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, cleanName(name), avatar));
      enterRoom({ code: newCode, playerId, name: cleanName(name) });
    } catch {
      setError('No se pudo crear la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(target, name, avatar) {
    setBusy(true);
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: cleanName(name), avatar }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de A los Tiros.'); return; }
      if (!findPlayer(result.room, playerId)) { setError(`La sala está llena (son hasta ${MAX_PLAYERS}).`); return; }
      enterRoom({ code: target, playerId, name: cleanName(name) });
    } catch {
      setError('No se pudo conectar con la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    const leaving = session;
    clearSession();
    setUrlCode('');
    setSession(null);
    setRoom(null);
    if (leaving) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId }, { now: Date.now() + offset })).catch(() => {});
  }

  async function copyInvite() {
    const link = gameUrl(GAME, code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copiá este link:', link);
    }
  }

  const banner = error && <p className="tt-error tt-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root tt-page"><p className="tt-hint tt-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root tt-page">
        <div className="tt-card tt-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {room.phase === 'lobby' && !isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /><GameChat code={code} me={me} /></>;
  let content;
  if (room.phase === 'picking') content = <Picking room={room} me={me} code={code} now={now} onDispatch={dispatch} />;
  else if (room.phase === 'final') content = <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  else if (!me.inGame) content = <div className="cs-root tt-page"><Scoreboard room={room} me={me} /><p className="tt-hint tt-center">La partida ya empezó: vas a poder jugar en la próxima.</p></div>;
  else {
    content = (
      <div className="cs-root tt-page tt-fight">
        <TirosGame
          room={room}
          me={me}
          code={code}
          offset={offset}
          onDied={(battle, by) => dispatch({ type: 'died', battle, by })}
          onReportGone={(battle, target) => dispatch({ type: 'died', battle, target })}
        />
        <p className="tt-hint tt-keys"><kbd>A</kbd><kbd>D</kbd> moverse · <kbd>W</kbd> saltar · clic izquierdo disparar · clic derecho o <kbd>Shift</kbd> escudo</p>
        <MyCards room={room} />
      </div>
    );
  }
  // Un mismo contenedor para cartas, pelea y final: así la pantalla completa sigue entre una fase y otra.
  return (
    <div ref={screenRef} className="tt-screen">
      {banner}
      {content}
      <GameChat code={code} me={me} />
      <button type="button" className="tt-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}

