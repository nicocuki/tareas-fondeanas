// Pixel Royale: entrada, sala de espera, la partida y el ranking.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import { GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, inGame, makeId, newRoom, ranking, score, startProblem } from './game.js';
import { MAPS } from './map.js';
import { ITEMS, ITEM_LIST, WEAPONS, WEAPON_LIST } from './sim.js';
import PixelGame, { LootIcon } from './PixelGame.jsx';
import './pixel.css';
import { isKicked } from '../lobby/kick.js';

const GAME = 'pixel';

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
      <div className="cs-root px-page">
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
    <div className="cs-root px-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="px-card px-entry">
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
        {error && <p className="px-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="px-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="px-hint">Se juega con teclado y mouse, de {MIN_PLAYERS} a {MAX_PLAYERS}.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const problem = startProblem(room);
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Pixel Royale · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="px-card">
        <div className="px-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="px-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="px-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Mapa" hint={`${MAPS.grande.name}: para hasta ${MAPS.grande.players}, con más casas y bosques. ${MAPS.chica.name}: para hasta ${MAPS.chica.players}, partidas más cortas y con más acción.`}>
          <Segmented name="map" value={room.options.map} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { map: v } })}
            choices={Object.values(MAPS).map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }))} />
        </OptionField>
        <OptionField title="Velocidad de la tormenta" hint="Qué tan rápido se achica la zona: con más rápida, las partidas son más cortas.">
          <Segmented name="zone" value={room.options.zone} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { zone: v } })}
            choices={[{ value: 0.7, label: 'Lenta' }, { value: 1, label: 'Normal' }, { value: 1.5, label: 'Rápida' }]} />
        </OptionField>
      </LobbyOptions>
      <div className="px-card px-controls">
        <h2>Cómo se juega</h2>
        <ul>
          <li>Arrancás solo con un <b>pico</b> (slot <kbd>1</kbd>): rompé árboles, cajas y paredes para juntar <b>madera</b>. Con <kbd>Z</kbd> armás una <b>pared</b> y con <kbd>X</kbd> un <b>piso</b> (también sobre el agua: puentes), todo de madera. Las armas están en los cofres.</li>
          <li>Antes de arrancar esperás en una <b>isla de espera</b> (podés probar el pico). Después sube el <b>bus de batalla</b>: mirá el mapa, elegí un lugar con nombre y saltá con <kbd>Espacio</kbd>. Caés rápido y a mitad de camino se abre el planeador.</li>
          <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> para moverte, <b>mouse</b> para apuntar y <b>clic</b> para disparar. <kbd>R</kbd> recarga, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> o la rueda cambian de slot, <kbd>M</kbd> abre el mapa grande con los nombres.</li>
          <li><kbd>Q</kbd> vendas, <kbd>E</kbd> botiquín, <kbd>F</kbd> escudo y <kbd>G</kbd> tira una granada. Si te pegan mientras te curás, se corta.</li>
          <li><b>No hay nada tirado en el piso: solo cofres.</b> Mantené <kbd>Espacio</kbd> cerca de uno para abrirlo y lo que trae va directo a tu inventario. Los hay en casas, torres, búnkeres y campos.</li>
          <li><b>Los árboles, las cajas y las paredes se rompen a tiros</b>: no te escondas siempre detrás de lo mismo.</li>
          <li>La <b>tormenta violeta</b> se achica por fases y lastima a los que quedan afuera. Cada tanto cae del cielo un cofre dorado con lo mejor: mirá el mapa. Gana el último en pie.</li>
          <li className="px-items">{WEAPON_LIST.map((w) => <span key={w} title={WEAPONS[w].name}><LootIcon kind={w} scale={2} /> {WEAPONS[w].name}</span>)}{ITEM_LIST.map((k) => <span key={k} title={ITEMS[k].name}><LootIcon kind={k} scale={2} /> {ITEMS[k].name}</span>)}</li>
        </ul>
      </div>
      <div className="px-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary px-start-btn" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })}>🪂 ¡A jugar!</button> : <p>Esperando que el anfitrión arranque…</p>}
        {problem && <p className="px-hint">{problem}{room.players.length < MIN_PLAYERS ? ' Pasales el código.' : ''}</p>}
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
    <div className="px-final">
      <div className="px-wins">
        {winner ? <><span className="px-dot" style={{ background: winner.color }} /> <b>{winner.name}</b> GANA</> : 'NO QUEDÓ NADIE'}
      </div>
      {winner?.id === me.id && <p className="px-eyebrow">¡Ganaste! 🏆</p>}
      <table className="px-table">
        <thead><tr><th>#</th><th>Jugador</th><th>☠ Bajas</th><th>📦 Cofres</th><th>Puntos</th></tr></thead>
        <tbody>
          {rank.map((p, i) => (
            <tr key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <td>{medals[i] || p.place || i + 1}</td>
              <td><span className="px-dot" style={{ background: p.color }} /> {p.name}</td>
              <td>{p.kills}</td>
              <td>{p.loot}</td>
              <td><strong>{score(p, total)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(startProblem(room))} onClick={() => onDispatch({ type: 'start' })}>🪂 Otra partida</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="px-hint">El anfitrión puede arrancar otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function PixelApp({ onBackToMenu }) {
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Pixel Royale.'); return; }
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

  const banner = error && <p className="px-error px-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root px-page"><p className="px-hint px-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root px-page">
        <div className="px-card px-center">
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
      <div className="px-card px-center">
        <p>La partida ya empezó: entrás en la próxima.</p>
        <p className="px-hint">Quedan {inGame(room).filter((p) => p.alive).length} de {inGame(room).length}.</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
      </div>
    );
  } else content = <div className="px-play"><PixelGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} /></div>;
  return (
    <div ref={screenRef} className="px-screen">
      {banner}
      {content}
      <button type="button" className="px-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
