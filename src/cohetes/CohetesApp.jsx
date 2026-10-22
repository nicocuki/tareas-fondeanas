// Cohete Royale: entrada, sala de espera, la partida y el ranking.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import { GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, inGame, makeId, newRoom, ranking, score } from './game.js';
import { ITEMS, ITEM_LIST } from './sim.js';
import CohetesGame, { ItemIcon } from './CohetesGame.jsx';
import './cohetes.css';
import { isKicked } from '../lobby/kick.js';

const GAME = 'cohetes';

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
      <div className="cs-root ck-page">
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
    <div className="cs-root ck-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="ck-card ck-entry">
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
        {error && <p className="ck-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="ck-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="ck-hint">Se juega con teclado y mouse, de {MIN_PLAYERS} a {MAX_PLAYERS}.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const enough = room.players.length >= MIN_PLAYERS;
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Cohete Royale · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="ck-card">
        <div className="ck-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="ck-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="ck-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Velocidad del agua" hint="Qué tan rápido sube el agua: con más rápida, las partidas son más cortas.">
          <Segmented name="water" value={room.options.water} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { water: v } })}
            choices={[{ value: 0.6, label: 'Lenta' }, { value: 1, label: 'Normal' }, { value: 1.6, label: 'Rápida' }]} />
        </OptionField>
      </LobbyOptions>
      <div className="ck-card ck-controls">
        <h2>Cómo se juega</h2>
        <ul>
          <li>Arrancan en <b>dos helicópteros</b>, uno de cada lado: <b>disparás para saltar</b> y bajás en paracaídas donde quieras.</li>
          <li><kbd>A</kbd> <kbd>D</kbd> (o las flechas) para manejar: el tanque <b>se pega a las paredes y los techos</b>, y cada tecla lo lleva siempre para el mismo lado del tanque. Apuntás con el mouse y disparás con el <b>clic</b> (o <kbd>Espacio</kbd>). Tenés 3 cohetes que se recargan solos.</li>
          <li>Cada tiro te empuja para atrás: <b>disparando para el lado contrario te despegás y salís volando</b>.</li>
          <li>Los cohetes rompen el terreno. El agua sube: el que se hunde, queda afuera. Gana el último que queda.</li>
          <li>Juntá monedas 🪙 y agarrá las cajas (hay por el mapa y caen más en paracaídas). Lo que traen se suma a tu inventario: <kbd>1</kbd> es el cohete, que nunca se acaba, y <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> lo que juntaste.</li>
          <li className="ck-items">{ITEM_LIST.map((w) => <span key={w} title={ITEMS[w].name}><ItemIcon w={w} /> {ITEMS[w].name}</span>)}</li>
        </ul>
      </div>
      <div className="ck-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary ck-start-btn" disabled={!enough} onClick={() => onDispatch({ type: 'start' })}>🚀 ¡A jugar!</button> : <p>Esperando que el anfitrión arranque…</p>}
        {!enough && <p className="ck-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
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
    <div className="ck-final">
      <div className="ck-wins">
        {winner ? <><span className="ck-dot" style={{ background: winner.color }} /> <b>{winner.name}</b> GANA</> : 'SE HUNDIERON TODOS'}
      </div>
      {winner?.id === me.id && <p className="ck-eyebrow">¡Ganaste! 🏆</p>}
      <table className="ck-table">
        <thead><tr><th>#</th><th>Jugador</th><th>💥 Bajas</th><th>🪙 Monedas</th><th>Puntos</th></tr></thead>
        <tbody>
          {rank.map((p, i) => (
            <tr key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <td>{medals[i] || p.place || i + 1}</td>
              <td><span className="ck-dot" style={{ background: p.color }} /> {p.name}</td>
              <td>{p.kills}</td>
              <td>{p.coins}</td>
              <td><strong>{score(p, total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ck-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })}>🚀 Otra partida</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="ck-hint">El anfitrión puede arrancar otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function CohetesApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offset, setOffset] = useState(0);
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);

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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Cohete Royale.'); return; }
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

  const banner = error && <p className="ck-error ck-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root ck-page"><p className="ck-hint ck-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root ck-page">
        <div className="ck-card ck-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {room.phase === 'lobby' && !isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
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
      <div className="ck-card ck-center">
        <p>La partida ya empezó: entrás en la próxima.</p>
        <p className="ck-hint">Quedan {inGame(room).filter((p) => p.alive).length} de {inGame(room).length}.</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
      </div>
    );
  } else content = <div className="ck-play"><CohetesGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} /></div>;
  return (
    <div ref={screenRef} className="ck-screen">
      {banner}
      {content}
      <button type="button" className="ck-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
