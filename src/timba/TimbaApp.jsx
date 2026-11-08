// La Timba: entrada, sala de espera, la partida y el final.
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
import { GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, fmtMoney, makeId, newRoom, roomFromSave } from './game.js';
import { addSave, deleteSave, describeSave, listSaves, saveGame } from './saves.js';
import { exportSave, parseSaveFile, saveFileName } from './saveFile.js';
import { downloadText } from '../lobby/saveFiles.js';
import { backgroundInterval } from '../ticker.js';
import { TOTAL_DAYS } from './quota.js';
import TimbaGame from './TimbaGame.jsx';
import './timba.css';
import { isKicked } from '../lobby/kick.js';

const GAME = 'timba';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
const setUrlCode = (code) => window.history.replaceState(null, '', gameUrl(GAME, code));

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, onSpectate, onResume, busy, error, onBack }) {
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
      <div className="cs-root tb-page">
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
    <div className="cs-root tb-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="tb-card tb-entry">
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
        {error && <p className="tb-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="tb-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="tb-hint">Se juega con teclado y mouse, de {MIN_PLAYERS} a {MAX_PLAYERS}.</p>
      </div>
      <SavedGames onResume={onResume} busy={busy} />
    </div>
  );
}

// Las partidas de este dispositivo que se pueden retomar (ver saves.js).
function SavedGames({ onResume, busy }) {
  const [saves, setSaves] = useState(listSaves);
  const [asking, setAsking] = useState(null);
  const [fileMsg, setFileMsg] = useState(null);
  const when = (d) => d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = parseSaveFile(await file.text().catch(() => ''));
    if (result.error) { setFileMsg({ bad: true, text: result.error }); return; }
    addSave(result.save);
    setSaves(listSaves());
    setFileMsg({ bad: false, text: 'Partida cargada. Ya podés continuarla.' });
  }

  return (
    <div className="tb-card tb-entry tb-saves" data-saves>
      <div className="tb-card-head"><h2>💾 Partidas guardadas</h2></div>
      <p className="tb-hint">La partida se guarda sola en este dispositivo mientras jugás. Para seguirla se abre una sala nueva y los demás entran con el código. Para llevarla a otra compu, bajala como archivo y cargala allá.</p>
      <div className="tb-btn-row">
        <label className="tf-btn tf-btn-soft" style={{ cursor: 'pointer' }}>
          📂 Cargar desde archivo
          <input type="file" accept=".json,application/json" data-act="loadFile" style={{ display: 'none' }} onChange={upload} />
        </label>
      </div>
      {fileMsg && <p className="tb-hint" role="status" data-file-msg style={fileMsg.bad ? { color: 'var(--danger, #e5484d)' } : undefined}>{fileMsg.text}</p>}
      <ul>
        {saves.map((save) => {
          const info = describeSave(save);
          return (
            <li key={save.id} data-save={save.id}>
              <div>
                <strong>{info.names.join(' · ')}</strong>
                <small>Día {info.day} · {fmtMoney(info.money)} de {fmtMoney(info.quota)} · {when(info.when)}</small>
              </div>
              <div className="tb-btn-row">
                <button type="button" className="tf-btn tf-btn-primary" disabled={busy} data-act="resume" onClick={() => onResume(save)}>Continuar</button>
                <button type="button" className="tf-btn tf-btn-soft" data-act="downloadSave" onClick={() => downloadText(saveFileName(save), exportSave(save))}>⬇ Descargar</button>
                {asking !== save.id && <button type="button" className="tf-btn tf-btn-soft" onClick={() => setAsking(save.id)}>Borrar</button>}
                {asking === save.id && (
                  <>
                    <button type="button" className="tf-btn tf-btn-danger" data-act="deleteSave" onClick={() => { deleteSave(save.id); setSaves(listSaves()); setAsking(null); }}>Sí, borrar</button>
                    <button type="button" className="tf-btn tf-btn-soft" onClick={() => setAsking(null)}>No</button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="La Timba · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="tb-card">
        <div className="tb-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="tb-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="tb-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <div className="tb-card tb-controls">
        <h2>Cómo se juega</h2>
        <ul>
          <li>Todos juegan con la <b>misma plata</b>: arrancan con <b>$1K</b> y <b>15 tickets</b> dorados, y cada día tienen que llegar a una <b>cuota</b> (la primera es $1,2K). Si no la juntan, se termina.</li>
          <li>Empiezan en una <b>casita</b>. Caminá con <kbd>A</kbd> <kbd>D</kbd> (o las flechas) y tocá las cosas con <kbd>E</kbd>. La camioneta va a vender items (por ahora está vacía) y la <b>limusina</b> los lleva al casino: sale cuando <b>están todos adentro</b>.</li>
          <li>En el casino, entren al <b>ascensor</b>. Con el panel (<kbd>E</kbd>) eligen el piso, y el ascensor <b>solo viaja con todos a bordo</b>. Desde arriba se camina con <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.</li>
          <li>El piso 1 tiene 16 juegos de <b>una sola persona</b> cada uno: 4 de <b>blackjack</b>, 4 <b>tragamonedas</b>, 2 de <b>rueda de la fortuna</b>, 2 de <b>ruleta</b>, 2 <b>carreras de patos</b> y 2 de <b>craps</b> (con dados en 3D). Si alguien juega en una, está ocupada. Cada juego tiene su apuesta mínima y máxima, con botones rápidos y un teclado. Lo que ganan o pierden es de todos.</li>
          <li>El día dura <b>5 minutos</b> y arranca cuando el ascensor sube por primera vez al piso 1. Cuando se acaba, todos vuelven al ascensor y tienen que bajar al lobby. Después de entrar al casino se puede volver a casa en la <b>limusina</b> de la puerta (cuando están todos arriba, vuelven): con la cuota juntada sigue otro día, y si no, es <b>game over</b>.</li>
        </ul>
      </div>
      <div className="tb-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary tb-start-btn" disabled={room.players.length < MIN_PLAYERS} onClick={() => onDispatch({ type: 'start' })}>🎰 ¡A la timba!</button> : <p>Esperando que el anfitrión arranque…</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Retomar una partida guardada ────────────────────────────────────────────
// La sala nueva (fase `resume`) tiene a todos los jugadores de la partida guardada, pero nadie sentado: cada uno que
// entra elige quién era, y el anfitrión retoma cuando están los que van a jugar.
function Resume({ room, me, code, onDispatch, onLeave, onCopy, copied, onClaim }) {
  const host = room.hostId === me?.id;
  const seated = room.players.filter((p) => p.by);
  const free = room.players.length - seated.length;
  return (
    <LobbyLayout
      code={code} roster={seated} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} host={host} players={seated.length}
      gameTitle="La Timba · partida guardada"
      subtitle={me ? (host ? 'Cuando estén todos sentados, retomá la partida.' : 'Esperando que el anfitrión retome la partida.') : 'Elegí quién eras vos en esta partida.'}
      copied={copied} onCopyInvite={onCopy} onLeave={onLeave}
    >
      <div className="tb-card" data-seats>
        <div className="tb-card-head"><h2>Quién es quién</h2><span>{seated.length} / {room.players.length}</span></div>
        <p className="tb-hint">Día {room.day.n} de {TOTAL_DAYS} · caja {fmtMoney(room.money)} · cuota {fmtMoney(room.day.quota)}</p>
        <ul className="tb-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.by ? 'is-me' : ''} data-seat={p.name}>
              <span className="tb-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              {p.by
                ? <small>{p.id === me?.id ? '✓ vos' : '✓ sentado'}</small>
                : !me ? <button type="button" className="tf-btn tf-btn-primary" data-act="claim" onClick={() => onClaim(p.id)}>Soy {p.name}</button> : <small>libre</small>}
            </li>
          ))}
        </ul>
      </div>
      <div className="tb-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary tb-start-btn" disabled={!seated.length} data-act="resumeStart" onClick={() => onDispatch({ type: 'resumeStart' })}>▶️ Retomar la partida</button>
          : me ? <p>Esperando que el anfitrión retome la partida…</p> : null}
        {host && free > 0 && <p className="tb-hint">Los {free} lugar{free === 1 ? '' : 'es'} que nadie tome se van de la partida al retomar.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── El final: no llegaron a la cuota ────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const last = room.day.last || { n: room.day.n, money: room.money, quota: room.day.quota };
  const net = room.players.map((p) => ({ ...p, net: room.net[p.id] || 0 })).sort((a, b) => b.net - a.net);
  return (
    <div className="tb-final">
      <div className={`tb-wins${last.won ? '' : ' is-lost'}`}>{last.won ? '¡LO LOGRARON!' : 'GAME OVER'}</div>
      <p className="tb-eyebrow">{last.won ? `¡Superaron los ${TOTAL_DAYS} días y pagaron todas las cuotas!` :`Llegaron hasta el día ${last.n}, pero juntaron ${fmtMoney(last.money)} y la cuota era ${fmtMoney(last.quota)}.`}</p>
      <table className="tb-table">
        <thead><tr><th>#</th><th>Jugador</th><th>Ganó / perdió</th></tr></thead>
        <tbody>
          {net.map((p, i) => (
            <tr key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <td>{i + 1}</td>
              <td><span className="tb-dot" style={{ background: p.color }} /> {p.name}</td>
              <td><strong>{p.net < 0 ? '−' : '+'}{fmtMoney(Math.abs(p.net))}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tb-final-actions">
        {host ? (
          <>
            <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })}>🎰 Otra vez</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
          </>
        ) : <p className="tb-hint">El anfitrión puede arrancar otra.</p>}
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

  // La partida se guarda en este dispositivo en cada cambio (y cada tanto, por el reloj del día) y se borra cuando termina.
  const saveRef = useRef({});
  saveRef.current = { room, me, spectating, offset };
  useEffect(() => {
    const { room: r, me: m, spectating: sp, offset: off } = saveRef.current;
    if (!r?.saveId || !m || sp) return;
    if (r.phase === 'playing') saveGame(r, m.id, Date.now() + off);
    else if (r.phase === 'ended') deleteSave(r.saveId);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => backgroundInterval(() => {
    const { room: r, me: m, spectating: sp, offset: off } = saveRef.current;
    if (r?.phase === 'playing' && r.saveId && m && !sp) saveGame(r, m.id, Date.now() + off);
  }, 10000), []);

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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de La Timba.'); return; }
      if (result.room.phase === 'resume' && !findPlayer(result.room, playerId)) { // entra mirando y elige su lugar
        enterRoom({ code: target, playerId, name: cleanName(name) });
        return;
      }
      if (!findPlayer(result.room, playerId)) { setError(`La sala está llena (son hasta ${MAX_PLAYERS}).`); return; }
      enterRoom({ code: target, playerId, name: cleanName(name) });
    } catch {
      setError('No se pudo conectar con la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  // Abre una sala nueva con la partida guardada; este dispositivo retoma el lugar que tenía.
  async function handleResume(save) {
    setBusy(true);
    try {
      const { room: restored, seatId } = roomFromSave(save.room, save.seat, save.dayLeft, Date.now() + offset);
      const { code: newCode } = await backend.createRoom(() => restored);
      enterRoom({ code: newCode, playerId: seatId, name: findPlayer(restored, seatId).name });
    } catch {
      setError('No se pudo abrir la partida guardada. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  // Alguien que entró a una sala de partida guardada elige quién era: desde ahí usa el id de ese jugador.
  async function handleClaim(seatId) {
    try {
      const result = await backend.updateRoom(code, (current) => applyAction(current, { type: 'claim', seat: seatId, playerId: session.playerId }));
      const seat = result.room && findPlayer(result.room, seatId);
      if (seat?.by === session.playerId) enterRoom({ code, playerId: seatId, name: seat.name });
      else setError('Ese lugar ya lo tomó otro. Elegí otro.');
    } catch {
      setError('No se pudo tomar el lugar. Revisá tu conexión.');
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

  const banner = error && <p className="tb-error tb-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} onSpectate={handleSpectate} onResume={handleResume} busy={busy} error={error} onBack={onBackToMenu} />;
  if (spectating && !canSpectate(GAME)) return <WaitingRoom room={room} onLeave={handleLeave} />; // no se puede mirar: espera
  if (!room) return <div className="cs-root tb-page"><p className="tb-hint tb-center">Entrando a la sala…</p></div>;
  if (room.phase === 'resume') return <>{banner}<Resume room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} onClaim={handleClaim} /></>;
  if (!me) {
    return (
      <div className="cs-root tb-page">
        <div className="tb-card tb-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {room.phase === 'lobby' && !isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} />{spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}</>;

  let content;
  if (room.phase === 'ended') content = <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  else content = <div className="tb-play"><TimbaGame room={room} me={me} code={code} offset={offset} onDispatch={dispatch} /></div>;
  return (
    <div ref={screenRef} className="tb-screen">
      {banner}
      {content}
      {spectating ? <SpectatorBadge /> : <GameChat code={code} me={me} />}
      <button type="button" className="tb-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
