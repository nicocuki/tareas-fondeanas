// Entre Nosotros: entrada, sala de espera, la partida (con sus pantallas encima) y el final.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval } from '../ticker.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import {
  COLORS, GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, colorOf, findPlayer, inGame, makeId, maxImpostors, newRoom,
} from './game.js';
import NaveGame from './NaveGame.jsx';
import { Ejection, Meeting, Roles } from './Meeting.jsx';
import Bean from './Bean.jsx';
import './nave.css';

const GAME = 'nave';

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
  const [invite, setInvite] = useState(() => codeFromUrl().length === 4);
  const save = () => setProfile({ name, avatar });
  // El anfitrión que se pasó de otro juego con todos: la sala se crea sola.
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root nv-page">
        <JoinInvite
          gameId={GAME} code={code} name={name} onName={setName} avatar={avatar} onAvatar={setAvatar} maxName={16}
          busy={busy} error={error} onBack={onBack}
          onJoin={() => { save(); onJoin(code, name, avatar); }}
          onCancel={() => { setInvite(false); setCode(''); setUrlCode(''); }}
        />
      </div>
    );
  }
  return (
    <div className="cs-root nv-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="nv-card nv-entry">
        <label className="tf-field">
          <span>Tu nombre</span>
          <input className="tf-input" value={name} maxLength={16} placeholder="¿Cómo te llamás?" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="tf-field">
          <span>Avatar</span>
          <div className="tf-avatar-grid">
            {AVATARS.map((a) => <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        {error && <p className="nv-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="nv-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="nv-hint">Se juega con teclado, de {MIN_PLAYERS} a {MAX_PLAYERS}.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
const OPTION_UI = [
  { key: 'impostors', title: 'Impostores', choices: [1, 2, 3], label: String, hint: (v, n) => `Con ${n} jugadores entra${maxImpostors(n) === 1 ? '' : 'n'} hasta ${maxImpostors(n)}${v > maxImpostors(n) ? `: se juega con ${maxImpostors(n)}` : ''}.` },
  { key: 'killCooldown', title: 'Espera para volver a matar', choices: [10, 15, 20, 25, 30, 45, 60], label: (v) => `${v} s` },
  { key: 'killDistance', title: 'Distancia para matar', choices: [0, 1, 2], label: (v) => ['Corta', 'Normal', 'Larga'][v] },
  { key: 'speed', title: 'Velocidad', choices: [0.75, 1, 1.25, 1.5, 2], label: (v) => `×${String(v).replace('.', ',')}` },
  { key: 'crewVision', title: 'Visión de los tripulantes', choices: [0.5, 0.75, 1, 1.25, 1.5, 2], label: (v) => `×${String(v).replace('.', ',')}` },
  { key: 'impostorVision', title: 'Visión de los impostores', choices: [1, 1.25, 1.5, 2, 3], label: (v) => `×${String(v).replace('.', ',')}` },
  { key: 'meetings', title: 'Reuniones de emergencia por jugador', choices: [0, 1, 2, 3, 5], label: String },
  { key: 'emergencyCooldown', title: 'Espera del botón de emergencia', choices: [0, 10, 15, 20, 30], label: (v) => `${v} s` },
  { key: 'discussion', title: 'Tiempo de discusión', choices: [0, 15, 30, 60], label: (v) => `${v} s` },
  { key: 'voting', title: 'Tiempo para votar', choices: [15, 30, 60, 90, 120], label: (v) => `${v} s` },
  { key: 'confirmEjects', title: 'Decir si el expulsado era impostor', choices: [true, false], label: (v) => (v ? 'Sí' : 'No') },
  { key: 'anonymousVotes', title: 'Votos anónimos', choices: [false, true], label: (v) => (v ? 'Sí' : 'No') },
  { key: 'commonTasks', title: 'Tareas comunes', choices: [0, 1, 2], label: String, hint: () => 'Las mismas para todos: sirven para pescar a un impostor que miente.' },
  { key: 'longTasks', title: 'Tareas largas', choices: [0, 1, 2, 3], label: String },
  { key: 'shortTasks', title: 'Tareas cortas', choices: [0, 1, 2, 3, 4, 5], label: String },
];

function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const enough = room.players.length >= MIN_PLAYERS;
  const taken = new Set(room.players.filter((p) => p.id !== me.id).map((p) => p.color));
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} gameTitle="Entre Nosotros · sala de espera" subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="nv-card">
        <div className="nv-card-head"><h2>Tripulación</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="nv-crew">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <Bean color={colorOf(p).body} size={40} />
              <strong>{p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <div className="nv-card">
        <h2>Tu color</h2>
        <div className="nv-colors">
          {COLORS.map((c, i) => (
            <button key={c.name} type="button" className={me.color === i ? 'is-selected' : ''} disabled={taken.has(i)} onClick={() => onDispatch({ type: 'color', color: i })} title={c.name} aria-label={c.name} data-color={i}>
              <Bean color={c.body} size={38} />
            </button>
          ))}
        </div>
      </div>
      <LobbyOptions canEdit={host}>
        <div className="nv-options">
          {OPTION_UI.map((opt) => (
            <OptionField key={opt.key} title={opt.title} hint={opt.hint?.(room.options[opt.key], room.players.length)}>
              <Segmented name={opt.key} value={room.options[opt.key]} disabled={!host} onChange={(v) => set({ [opt.key]: v })} choices={opt.choices.map((v) => ({ value: v, label: opt.label(v) }))} />
            </OptionField>
          ))}
        </div>
      </LobbyOptions>
      <div className="nv-card nv-controls">
        <h2>Controles</h2>
        <ul>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o las flechas para moverse · <kbd>E</kbd> o <kbd>Espacio</kbd> usar (tareas, botón, ventilaciones)</li>
          <li><kbd>R</kbd> reportar un cuerpo · <kbd>Q</kbd> matar (impostor) · <kbd>Tab</kbd> mapa y sabotajes · <kbd>Esc</kbd> cerrar</li>
        </ul>
      </div>
      <div className="nv-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary nv-start-btn" disabled={!enough} onClick={() => onDispatch({ type: 'start' })}>🚀 Empezar</button>
        ) : <p>Esperando que el anfitrión arranque…</p>}
        {!enough && <p className="nv-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Final ───────────────────────────────────────────────────────────────────
const REASONS = {
  votes: 'Expulsaron a todos los impostores.',
  kills: 'Los impostores son tantos como los tripulantes.',
  tasks: 'Los tripulantes terminaron todas sus tareas.',
  reactor: 'El reactor se fundió.',
};
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const crewWon = room.winner === 'crew';
  const won = me.inGame && crewWon !== me.impostor;
  const winners = inGame(room).filter((p) => p.impostor !== crewWon);
  return (
    <div className={`nv-screen nv-final${crewWon ? ' is-crew' : ' is-impostor'}`}>
      <h1>{me.inGame ? (won ? 'Victoria' : 'Derrota') : crewWon ? 'Ganaron los tripulantes' : 'Ganaron los impostores'}</h1>
      <p className="nv-final-reason">{REASONS[room.reason] || ''}</p>
      <div className="nv-roles-beans">
        {winners.map((p) => (
          <figure key={p.id}>
            <Bean color={colorOf(p).body} size={84} ghost={!p.alive} />
            <figcaption>{p.name}</figcaption>
          </figure>
        ))}
      </div>
      <p className="nv-final-imps">{inGame(room).filter((p) => p.impostor).map((p) => p.name).join(' y ')} {inGame(room).filter((p) => p.impostor).length > 1 ? 'eran los impostores' : 'era el impostor'}.</p>
      <div className="nv-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })}>🚀 Otra partida</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="nv-hint">El anfitrión puede arrancar otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function NaveApp({ onBackToMenu }) {
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
  const screenRef = useRef(null);
  useFullscreenTarget(screenRef);
  useEffect(() => backend.subscribeServerOffset(setOffset), []);

  useEffect(() => {
    if (!code) return undefined;
    return backend.subscribeRoom(code, (data) => {
      if (data && data.gameType === GAME_TYPE) { setRoom(data); return; }
      clearSession();
      setUrlCode('');
      setSession(null);
      setError('Esa sala ya no existe.');
    }, () => setError('No se pudo conectar con la sala.'));
  }, [code]);

  const timed = room && room.phase !== 'lobby' && room.phase !== 'final';
  useEffect(() => {
    if (!timed) return undefined;
    // Con el reloj del Worker: con la pestaña de fondo, setInterval se atrasa y las fases no avanzaban.
    return backgroundInterval(() => setTick(Date.now()), 250);
  }, [timed]);

  // Cuando se termina un reloj (roles, reunión, expulsión, reactor), cualquiera avisa; entra uno solo.
  const tickSent = useRef('');
  useEffect(() => {
    if (!timed || !me) return;
    let deadline = 0;
    if (room.phase === 'meeting') deadline = room.meeting.endsAt;
    else if (room.phase === 'playing') deadline = room.sabotage?.kind === 'reactor' ? room.sabotage.endsAt : 0;
    else deadline = room.phaseEndsAt;
    if (!deadline || now < deadline) return;
    const key = `${room.game}:${room.phase}:${room.meeting?.n}:${deadline}`;
    if (tickSent.current === key) return;
    tickSent.current = key;
    dispatch({ type: 'tick', phase: room.phase, meeting: room.meeting?.n });
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
      return await backend.updateRoom(session.code, (current) => applyAction(current, { game: current?.game, ...action, playerId: session.playerId }, { now: Date.now() + offset, rand: Math.random }));
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Entre Nosotros.'); return; }
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

  const banner = error && <p className="nv-error nv-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root nv-page"><p className="nv-hint nv-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root nv-page">
        <div className="nv-card nv-center">
          <p>Ya no estás en esta sala.</p>
          {room.phase === 'lobby' && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /></>;

  let content;
  if (room.phase === 'final') content = <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  else if (!me.inGame) {
    content = (
      <div className="nv-card nv-center">
        <Bean color={colorOf(me).body} size={70} />
        <p>La partida ya empezó: entrás en la próxima.</p>
        <p className="nv-hint">{inGame(room).length} jugando · {inGame(room).filter((p) => p.alive).length} vivos</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
      </div>
    );
  } else {
    content = (
      <div className="nv-play">
        <NaveGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} paused={room.phase !== 'playing'} />
        {room.phase === 'roles' && <Roles room={room} me={me} />}
        {room.phase === 'meeting' && <Meeting room={room} me={me} now={now} onDispatch={dispatch} />}
        {room.phase === 'ejection' && room.ejection && <Ejection room={room} me={me} now={now} />}
      </div>
    );
  }
  // Un mismo contenedor para toda la partida: la pantalla completa sigue entre una fase y otra.
  return (
    <div ref={screenRef} className="nv-screen-wrap">
      {banner}
      {content}
      <button type="button" className="nv-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
