// Fuego Cruzado: entrada, sala de espera, la partida y el final.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import SpectatorBadge from '../ui/SpectatorBadge.jsx';
import WaitingRoom from '../ui/WaitingRoom.jsx';
import { canSpectate, ghostMe, useSpectatorJoin } from '../ui/spectate.js';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import { COLORS, COLOR_NAMES, GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, makeId, newRoom, ranking, startProblem } from './game.js';
import { MAPS, mapById } from './maps.js';
import FpsGame from './FpsGame.jsx';
import { isKicked } from '../lobby/kick.js';
import '../royale3d/royale3d.css';
import './fps.css';

const GAME = 'fps';

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
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root r3-page">
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
    <div className="cs-root r3-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="r3-card r3-entry">
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
        {error && <p className="r3-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="r3-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="r3-hint">Todos contra todos en primera persona, con teclado y mouse, de {MIN_PLAYERS} a {MAX_PLAYERS}. Es una beta: puede tener bugs.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const problem = startProblem(room);
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Fuego Cruzado · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="r3-card">
        <div className="r3-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="r3-roster">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="r3-chip" style={{ background: COLORS[p.color] }} title={COLOR_NAMES[p.color]} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Mapa" hint={room.options.map === 'random' ? 'Sale uno al azar cada partida.' : mapById(room.options.map).blurb}>
          <Segmented name="map" value={room.options.map} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { map: v } })}
            choices={[{ value: 'random', label: 'Al azar' }, ...MAPS.map((m) => ({ value: m.id, label: m.name }))]} />
        </OptionField>
        <OptionField title="Duración" hint="Cuando se acaba el tiempo gana el que tiene más bajas.">
          <Segmented name="minutes" value={room.options.minutes} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { minutes: v } })}
            choices={[3, 5, 8, 10].map((v) => ({ value: v, label: `${v} min` }))} />
        </OptionField>
        <OptionField title="Bajas para ganar" hint="El primero que llega gana, aunque quede tiempo.">
          <Segmented name="limit" value={room.options.limit} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { limit: v } })}
            choices={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))} />
        </OptionField>
      </LobbyOptions>
      <div className="r3-card r3-howto">
        <h2>Cómo se juega</h2>
        <ul>
          <li><b>Todos contra todos</b>, en primera persona. Arrancás con una pistola y un pico; las demás armas están <b>tiradas en el mapa</b> (agarralas con <kbd>E</kbd>) y vuelven a aparecer a los 20 segundos.</li>
          <li>Pistola, revólver, metralleta, escopeta, fusil de asalto, fusil de ráfaga y francotirador (clic derecho mira por la mira). Un tiro a la cabeza pega mucho más.</li>
          <li>Como en los shooters tácticos, <b>moviéndote o saltando las balas se desvían</b>: quieto y apuntando (clic derecho) van derecho.</li>
          <li>Al morir soltás las armas que levantaste y volvés a aparecer a los 3 segundos, lejos de los demás. <kbd>Tab</kbd> muestra la tabla.</li>
          <li>Gana el primero que llega a las bajas elegidas, o el que tiene más cuando se acaba el tiempo.</li>
        </ul>
      </div>
      <div className="r3-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary r3-start-btn" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })}>🔫 ¡A jugar!</button> : <p>Esperando que el anfitrión arranque…</p>}
        {problem && <p className="r3-hint">{problem}{room.players.length < MIN_PLAYERS ? ' Pasales el código.' : ''}</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Final ───────────────────────────────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const rank = ranking(room);
  const champ = findPlayer(room, room.match?.winner);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="r3-final" data-final>
      <div className="r3-wins">
        {champ ? <><span className="r3-chip" style={{ background: COLORS[champ.color] }} /> <b>{champ.name}</b> GANA</> : 'SE TERMINÓ'}
      </div>
      {champ?.id === me.id && <p className="r3-eyebrow">¡Ganaste! 🏆</p>}
      <table className="r3-table">
        <thead><tr><th>#</th><th>Jugador</th><th>🎯 Bajas</th><th>💀 Muertes</th><th>Cabezas</th></tr></thead>
        <tbody>
          {rank.map((p, i) => (
            <tr key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <td>{medals[i] || i + 1}</td>
              <td><span className="r3-chip" style={{ background: COLORS[p.color] }} /> {p.name}</td>
              <td><strong>{p.kills}</strong></td>
              <td>{p.deaths}</td>
              <td>{p.heads}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="r3-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(startProblem(room))} onClick={() => onDispatch({ type: 'start' })}>🔫 Otra partida</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="r3-hint">El anfitrión puede arrancar otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function FpsApp({ onBackToMenu }) {
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
    if (!session || session.spectator) return null;
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

  function handleSpectate(target) {
    enterRoom({ code: target, playerId: makeId(), name: getProfile().name || 'Espectador', spectator: true });
  }

  async function handleJoin(target, name, avatar) {
    setBusy(true);
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: cleanName(name), avatar }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Fuego Cruzado.'); return; }
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

  const banner = error && <p className="r3-error r3-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} onSpectate={handleSpectate} busy={busy} error={error} onBack={onBackToMenu} />;
  if (spectating && !canSpectate(GAME)) return <WaitingRoom room={room} onLeave={handleLeave} />;
  if (!room) return <div className="cs-root r3-page"><p className="r3-hint r3-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root r3-page">
        <div className="r3-card r3-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {room.phase === 'lobby' && !isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} />{spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}</>;

  const content = room.phase === 'final'
    ? <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />
    : <div className="r3-play"><FpsGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} /></div>;
  return (
    <div ref={screenRef} className="r3-screen">
      {banner}
      {content}
      {spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}
      <button type="button" className="r3-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
