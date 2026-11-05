// Generala: entrada, sala de espera, la partida y el final.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, fullscreenElement, getProfile, setProfile, toggleFullscreen, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import { isKicked } from '../lobby/kick.js';
import {
  CATEGORIES, GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, makeId, newRoom, ranking,
} from './game.js';
import GeneralaGame, { ConfirmButton, Face, Sheet } from './GeneralaGame.jsx';
import './generala.css';

const GAME = 'generala';

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
      <div className="cs-root gn-page">
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
    <div className="cs-root gn-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="gn-card gn-entry">
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
        {error && <p className="gn-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="gn-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
        <p className="gn-muted">De {MIN_PLAYERS} a {MAX_PLAYERS} jugadores. Se puede jugar solo, para practicar.</p>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
const YES_NO = [{ value: true, label: 'Sí' }, { value: false, label: 'No' }];

function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const set = (options) => onDispatch({ type: 'setOptions', options });
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Generala · sala de espera" subtitle={host ? 'Arrancá cuando estén todos.' : 'El anfitrión arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="gn-card">
        <div className="gn-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="gn-players" data-players>
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="gn-dot" style={{ background: p.color }} />
              <strong>{p.avatar} {p.name}</strong>
              <small>{p.id === room.hostId ? '👑' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions title="reglas de la partida" canEdit={host}>
        <OptionField title="Generala servida gana la partida" hint="Si a alguien le salen los cinco iguales en la primera tirada y los anota, gana ahí mismo.">
          <Segmented name="servida" value={room.options.servida} choices={YES_NO} disabled={!host} onChange={(v) => set({ servida: v })} />
        </OptionField>
        <OptionField title="Generala doble" hint="Una casilla más, de 100 puntos, para una segunda generala." style={{ marginBottom: 0 }}>
          <Segmented name="doble" value={room.options.doble} choices={YES_NO} disabled={!host} onChange={(v) => set({ doble: v })} />
        </OptionField>
      </LobbyOptions>
      <div className="gn-card gn-rules">
        <h2>Cómo se juega</h2>
        <ul>
          <li>En tu turno tenés hasta <b>tres tiradas</b>. Mantené apretado sobre la mesa (o el botón, o <kbd>Espacio</kbd>) para <b>sacudir el cubilete</b> y soltá para tirar.</li>
          <li>Entre tirada y tirada tocá los dados que querés <b>guardar</b>: se apartan en el estante. Los demás vuelven al cubilete.</li>
          <li>Después anotá en una casilla libre. Si no te sirve nada, hay que <b>tachar</b> una (vale cero).</li>
          <li>Los dados son de verdad: ruedan, chocan y <b>quedan como caen</b>. Si uno queda <b>montado</b> (inclinado contra una pared o arriba de otro), la tirada no vale y se repite sin gastar intento.</li>
        </ul>
        <table className="gn-values">
          <tbody>
            <tr><th>1 al 6</th><td>lo que sumen los dados de ese número</td></tr>
            {CATEGORIES.filter((c) => c.points && (c.id !== 'doble' || room.options.doble)).map((c) => (
              <tr key={c.id}><th>{c.name}</th><td><b>{c.points}</b> · {c.hint}{['esc', 'full', 'poker'].includes(c.id) ? ' (servido, 5 más)' : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gn-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary gn-start-btn" data-act="start" disabled={room.players.length < MIN_PLAYERS} onClick={() => onDispatch({ type: 'start' })}>🎲 ¡A tirar!</button> : <p>Esperando que el anfitrión arranque…</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── El final: el podio, con suspenso ────────────────────────────────────────
// Durante la partida nadie ve los totales. Acá se destapan de a uno: tercero, segundo y primero.
const REVEAL_MS = [1500, 1700, 2100, 1300]; // cuánto dura cada paso antes de pasar al siguiente
const PODIUM_KEY = 'tf:generala:podio';

// Los puntos suben contando hasta su valor.
function CountUp({ to }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const list = ranking(room);
  const top = list.slice(0, 3);
  const winners = list.filter((p) => room.winners.includes(p.id));
  // Los pasos: 0 redoble, 1 se destapa el tercero, 2 el segundo, 3 el primero, 4 todo lo demás (planilla y botones).
  // Con menos de tres jugadores se saltean los que no hay.
  const first = top.length >= 3 ? 1 : top.length === 2 ? 2 : 3;
  const seen = () => { try { return sessionStorage.getItem(PODIUM_KEY) === String(room.endedAt); } catch { return false; } };
  const [step, setStep] = useState(() => (seen() ? 4 : 0));
  useEffect(() => {
    if (step >= 4) { try { sessionStorage.setItem(PODIUM_KEY, String(room.endedAt)); } catch { /* da igual */ } return undefined; }
    const t = setTimeout(() => setStep(step === 0 ? first : step + 1), REVEAL_MS[step]);
    return () => clearTimeout(t);
  }, [step, first, room.endedAt]);

  const shown = (index) => step >= 3 - index; // el primero (0) en el paso 3, el segundo en el 2, el tercero en el 1
  const dice = room.turn?.dice || [];
  const reason = room.reason === 'servida' ? '¡Generala servida!' : room.reason === 'cortada' ? 'Partida terminada' : 'Planillas completas';
  // En el podio el primero va al medio, el segundo a la izquierda y el tercero a la derecha.
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className="gn-final" data-final data-step={step}>
      <p className="gn-eyebrow">{reason}</p>
      <h1 className="gn-wins">
        {step < 3 ? <span className="gn-drum">Y el podio es<i>.</i><i>.</i><i>.</i></span>
          : winners.length ? <>🏆 {winners.map((w) => w.name).join(' y ')} {winners.length > 1 ? 'empatan' : 'gana'}</> : 'Se terminó la partida'}
      </h1>

      <div className="gn-podium" data-podium>
        {order.map((i) => {
          const p = top[i];
          const open = shown(i);
          return (
            <div key={p.id} className={`gn-step is-p${i + 1} ${open ? 'is-open' : ''} ${p.id === me.id ? 'is-me' : ''}`} style={{ '--c': p.color }} data-place={p.place} data-open={open ? 1 : 0}>
              <div className="gn-step-who">
                <span className="gn-step-avatar">{open ? p.avatar : '❔'}</span>
                <strong>{open ? p.name : '¿?'}</strong>
                <b>{open ? <CountUp to={p.total} /> : '···'}</b>
              </div>
              <div className="gn-step-block"><span>{p.place}°</span></div>
            </div>
          );
        })}
      </div>

      {step < 4 ? (
        <button type="button" className="gn-skip" data-act="skip" onClick={() => setStep(4)}>Saltar</button>
      ) : (
        <div className="gn-after">
          {room.reason === 'servida' && dice.every(Boolean) && (
            <div className="gn-final-dice">{dice.map((d, i) => <span key={i} className="gn-die is-static"><Face value={d} /></span>)}</div>
          )}
          {list.length > 3 && (
            <ol className="gn-ranking">
              {list.slice(3).map((p) => (
                <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
                  <span>{p.place}°</span>
                  <strong><span className="gn-dot" style={{ background: p.color }} /> {p.avatar} {p.name}{p.left ? ' (se fue)' : ''}</strong>
                  <b>{p.total}</b>
                </li>
              ))}
            </ol>
          )}
          <div className="gn-final-actions">
            {host ? (
              <>
                <button type="button" className="tf-btn tf-btn-primary" data-act="again" onClick={() => onDispatch({ type: 'start' })}>🎲 Otra partida</button>
                <button type="button" className="tf-btn tf-btn-soft" data-act="lobby" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>
              </>
            ) : <p className="gn-muted">El anfitrión puede arrancar otra.</p>}
            <ConfirmButton className="tf-btn tf-btn-soft" data-act="leave" ask="¿Salir de la sala?" onConfirm={onLeave}>Salir</ConfirmButton>
          </div>
          <div className="gn-final-sheet"><Sheet room={room} me={me} live={false} totals /></div>
        </div>
      )}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function GeneralaApp({ onBackToMenu }) {
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
      const result = await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now() + offset, rand: Math.random }));
      if (error) setError('');
      return result;
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Generala.'); return; }
      if (!findPlayer(result.room, playerId)) {
        setError(result.room.phase !== 'lobby' ? 'Esa partida ya empezó.' : `La sala está llena (son hasta ${MAX_PLAYERS}).`);
        return;
      }
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

  const banner = error && <p className="gn-error gn-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root gn-page"><p className="gn-muted gn-center">Entrando a la sala…</p></div>;
  if (!me || (me.left && room.phase !== 'ended')) {
    const kicked = isKicked(room, session.playerId);
    return (
      <div className="cs-root gn-page">
        <div className="gn-card gn-center">
          <p>{kicked ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta partida.'}</p>
          {room.phase === 'lobby' && !kicked && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /><GameChat code={code} me={me} /></>;

  return (
    <div ref={screenRef} className="gn-screen">
      {banner}
      {room.phase === 'ended'
        ? <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />
        : <GeneralaGame room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} />}
      <GameChat code={code} me={me} />
      <button type="button" className="gn-screen-exit" onClick={() => { if (fullscreenElement()) toggleFullscreen(); }}>Salir de pantalla completa <kbd>Esc</kbd></button>
    </div>
  );
}
