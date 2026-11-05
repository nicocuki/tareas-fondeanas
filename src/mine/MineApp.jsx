// Cubolandia: entrada, sala de espera, la partida y el ranking.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import SpectatorBadge from '../ui/SpectatorBadge.jsx';
import { ghostMe, useSpectatorJoin } from '../ui/spectate.js';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import { GAME_TYPE, GRACE_MINUTES, MAX_PLAYERS, MIN_PLAYERS, MODES, applyAction, cleanName, findPlayer, inGame, makeId, newRoom, ranking, score, startProblem } from './game.js';
import MineGame from './MineGame.jsx';
import './mine.css';
import { isKicked } from '../lobby/kick.js';

const GAME = 'mine';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
const setUrlCode = (code) => window.history.replaceState(null, '', gameUrl(GAME, code));

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, onSpectate, busy, error, onBack }) {
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
      <div className="cs-root mc-page">
        <JoinInvite
          gameId={GAME} code={code} name={name} onName={setName} avatar={avatar} onAvatar={setAvatar} maxName={16}
          busy={busy} error={error} onBack={onBack}
          onJoin={() => { save(); onJoin(code, name, avatar); }}
          onSpectate={() => onSpectate(code)}
          onCancel={() => { setInvite(false); setCode(''); setUrlCode(''); }}
        />
      </div>
    );
  }
  return (
    <div className="cs-root mc-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="mc-card mc-entry">
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
        {error && <p className="mc-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="mc-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="mc-hint">Se juega con teclado y mouse, de {MIN_PLAYERS} a {MAX_PLAYERS}.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const problem = startProblem(room);
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Cubolandia · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="mc-card">
        <div className="mc-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="mc-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="mc-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Modo de juego" hint={MODES[room.options.mode].hint}>
          <div className="mc-modes">
            {Object.values(MODES).map((m) => (
              <button key={m.id} type="button" data-opt={`mode-${m.id}`} className={`mc-mode${room.options.mode === m.id ? ' is-on' : ''}`} disabled={!host || !m.available} aria-pressed={room.options.mode === m.id}
                onClick={() => onDispatch({ type: 'setOptions', options: { mode: m.id } })}>
                <span>{m.emoji}</span><strong>{m.name}</strong>{!m.available && <small>Próximamente</small>}
              </button>
            ))}
          </div>
        </OptionField>
        <OptionField title="Tregua sin PVP" hint="Los primeros minutos nadie se puede lastimar: es para juntar recursos y armarse. Cuando termina aparece la barra localizadora con los jugadores cercanos y empieza el PVP.">
          <Segmented name="grace" value={room.options.grace} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { grace: v } })}
            choices={GRACE_MINUTES.map((v) => ({ value: v, label: `${v} min` }))} />
        </OptionField>
      </LobbyOptions>
      <div className="mc-card mc-controls">
        <h2>Cómo se juega</h2>
        <ul>
          <li>Es un mundo 2D visto de costado, hecho al azar: <b>biomas</b> (llanura, bosque, desierto, tundra y montañas), <b>cuevas</b>, océanos, lava y <b>minerales</b> (carbón, hierro, oro y diamante) cada vez más hondo.</li>
          <li><kbd>A</kbd> <kbd>D</kbd> mueven, <kbd>W</kbd> o <kbd>Espacio</kbd> salta y nada, <kbd>Shift</kbd> te agacha (no te caés de los bordes y desaparecés de la barra de los demás), <kbd>Ctrl</kbd> corre.</li>
          <li><b>Clic izquierdo mantenido</b> pica el bloque; <b>clic derecho</b> pone bloques, come, usa el balde y abre la mesa y el horno. <kbd>1</kbd>-<kbd>9</kbd> o la rueda eligen el ítem, <kbd>E</kbd> abre el inventario y las recetas, <kbd>Q</kbd> tira.</li>
          <li>Empezás con las manos vacías: <b>troncos → tablones → mesa de crafteo → herramientas</b>. Pico de madera para la piedra, de piedra para el hierro, de hierro para el oro y el diamante. Fundí las menas en un horno.</li>
          <li>Armate con <b>espadas</b>, <b>hachas</b> y <b>armaduras</b> de cuero, oro, hierro o diamante. La <b>manzana dorada</b> cura mucho. Comé: la vida solo se regenera con el hambre llena.</li>
          <li><b>UHC:</b> durante la tregua nadie se hace daño. Después, una <b>barra localizadora</b> muestra dónde están los jugadores cercanos (si te agachás, no te ve). Al morir soltás todo. Gana el último en pie.</li>
          <li>De noche salen zombis; las vacas y los cerdos dan comida.</li>
        </ul>
      </div>
      <div className="mc-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary mc-start-btn" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })}>⛏ ¡A jugar!</button> : <p>Esperando que el anfitrión arranque…</p>}
        {problem && <p className="mc-hint">{problem}{room.players.length < MIN_PLAYERS ? ' Pasales el código.' : ''}</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Ranking ─────────────────────────────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const rank = ranking(room);
  const total = rank.length;
  const winner = findPlayer(room, room.match?.winner);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="mc-final">
      <div className="mc-wins">
        {winner ? <><span className="mc-dot" style={{ background: winner.color }} /> <b>{winner.name}</b> GANA</> : 'NO QUEDÓ NADIE'}
      </div>
      {winner?.id === me.id && <p className="mc-eyebrow">¡Ganaste! 🏆</p>}
      <table className="mc-table">
        <thead><tr><th>#</th><th>Jugador</th><th>☠ Bajas</th><th>Puntos</th></tr></thead>
        <tbody>
          {rank.map((p, i) => (
            <tr key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <td>{medals[i] || p.place || i + 1}</td>
              <td><span className="mc-dot" style={{ background: p.color }} /> {p.name}</td>
              <td>{p.kills}</td>
              <td><strong>{score(p, total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mc-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(startProblem(room))} onClick={() => onDispatch({ type: 'start' })}>⛏ Otra partida</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="mc-hint">El anfitrión puede arrancar otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function MineApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offset, setOffset] = useState(0);
  const code = session?.code;
  const spectating = Boolean(session?.spectator);
  const me = spectating ? ghostMe(session) : findPlayer(room, session?.playerId);

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

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session || session.spectator) return null; // el que mira no manda jugadas
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

  // Entra a mirar una partida en curso: no es jugador, no escribe nada en la sala.
  function handleSpectate(target) {
    enterRoom({ code: target, playerId: makeId(), name: getProfile().name || 'Espectador', spectator: true });
  }

  async function handleJoin(target, name, avatar) {
    setBusy(true);
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: cleanName(name), avatar }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Cubolandia.'); return; }
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
    if (leaving && !leaving.spectator) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId }, { now: Date.now() + offset })).catch(() => {});
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

  useSpectatorJoin(session, room, (target, name) => handleJoin(target, name, getProfile().avatar));

  const banner = error && <p className="mc-error mc-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} onSpectate={handleSpectate} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root mc-page"><p className="mc-hint mc-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root mc-page">
        <div className="mc-card mc-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {room.phase === 'lobby' && !isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} />{spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}</>;

  let content;
  if (room.phase === 'final') content = <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  else if (!me.inGame) {
    content = (
      <div className="mc-card mc-center">
        <p>La partida ya empezó: entrás en la próxima.</p>
        <p className="mc-hint">Quedan {inGame(room).filter((p) => p.alive).length} de {inGame(room).length}.</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
      </div>
    );
  } else content = <div className="mc-play"><MineGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} /></div>;
  return (
    <div ref={screenRef} className="mc-screen">
      {banner}
      {content}
      {spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}
      <button type="button" className="mc-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
