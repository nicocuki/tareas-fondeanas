// La Mecha: entrada, sala de espera, ronda con la bomba y fin de partida.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { onValue, ref, set } from '../realtime.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import {
  GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, makeId, newRoom, wordProblem,
} from './game.js';
import { BONUS_LETTERS } from './words.js';
import { loadDictionary } from './dictionary.js';
import './mecha.css';

const GAME = 'la-mecha';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
function setUrlCode(code) {
  window.history.replaceState(null, '', gameUrl(GAME, code));
}

// La sílaba resaltada dentro de la palabra.
function Highlight({ word, syllable, mode }) {
  if (!word) return null;
  const i = mode === 'start' ? (word.startsWith(syllable) ? 0 : -1) : word.indexOf(syllable);
  if (!syllable || i < 0) return <>{word}</>;
  return <>{word.slice(0, i)}<mark>{word.slice(i, i + syllable.length)}</mark>{word.slice(i + syllable.length)}</>;
}

function Hearts({ lives }) {
  return <span className="lm-hearts" aria-label={`${lives} ${lives === 1 ? 'vida' : 'vidas'}`}>{Array.from({ length: lives }, (_, i) => <span key={i}>❤️</span>)}</span>;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  const save = () => setProfile({ name, avatar });
  return (
    <div className="cs-root lm-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="lm-card lm-entry">
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
        {error && <p className="lm-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>
          Crear sala
        </button>
        <div className="lm-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me?.id;
  const opts = room.options;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const enough = room.players.length >= MIN_PLAYERS;
  return (
    <LobbyLayout
      code={code}
      gameTitle="La Mecha · sala de espera"
      subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'}
      copied={copied}
      onCopyInvite={onCopy}
      onLeave={onLeave}
    >
      <div className="lm-card">
        <div className="lm-card-head">
          <h2>Jugadores</h2>
          <span>{room.players.length} / {MAX_PLAYERS}</span>
        </div>
        <ul className="lm-lobby-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}>
              <span className="lm-avatar">{p.avatar}</span>
              <strong>{p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me?.id ? 'vos' : ''}{p.wins ? ` · 🏆 ${p.wins}` : ''}</small>
            </li>
          ))}
        </ul>
      </div>

      <LobbyOptions canEdit={host}>
        <OptionField title="Dónde van las letras" hint={opts.mode === 'start' ? 'Con «CAR» vale carpeta, pero no escarcha.' : 'Con «CAR» valen carpeta y escarcha.'}>
          <Segmented name="mode" value={opts.mode} disabled={!host} onChange={(v) => set({ mode: v })} choices={[{ value: 'anywhere', label: 'En cualquier parte' }, { value: 'start', label: 'Al principio' }]} />
        </OptionField>
        <OptionField title="Dificultad" hint="Cuántas letras muestra la bomba, y qué tan comunes son.">
          <Segmented name="difficulty" value={opts.difficulty} disabled={!host} onChange={(v) => set({ difficulty: v })} choices={[{ value: 'facil', label: 'Fácil · 2' }, { value: 'normal', label: 'Normal · 2 o 3' }, { value: 'dificil', label: 'Difícil · 3 o 4' }]} />
        </OptionField>
        <OptionField title="Vidas">
          <Segmented name="lives" value={opts.lives} disabled={!host} onChange={(v) => set({ lives: v })} choices={[1, 2, 3, 4].map((n) => ({ value: n, label: `${'❤️'.repeat(n)}` }))} />
        </OptionField>
        <OptionField title="Mecha" hint="Cada bomba explota en un momento al azar: nadie sabe cuándo.">
          <Segmented name="fuse" value={opts.fuse} disabled={!host} onChange={(v) => set({ fuse: v })} choices={[{ value: 'corta', label: 'Corta (6–14 s)' }, { value: 'normal', label: 'Normal (10–25 s)' }, { value: 'larga', label: 'Larga (15–40 s)' }]} />
        </OptionField>
      </LobbyOptions>

      <div className="lm-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary lm-start-btn" disabled={!enough} onClick={() => onDispatch({ type: 'start' })}>
            💣 Encender la mecha
          </button>
        ) : (
          <p>Esperando que el anfitrión arranque…</p>
        )}
        {!enough && <p className="lm-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Ronda ───────────────────────────────────────────────────────────────────
function Arena({ room, me, code, now, dict, onDispatch, onLeave }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [shake, setShake] = useState(0);
  const [typing, setTyping] = useState(null);
  const input = useRef(null);
  const sendTimer = useRef(null);
  const myTurn = room.phase === 'playing' && room.current === me?.id;
  const players = room.players;
  const current = findPlayer(room, room.current);
  const boomRecent = room.lastBoom && now - room.lastBoom.at < 1200;

  // Lo que escribe el que tiene la bomba, en vivo.
  useEffect(() => onValue(ref(`mecha/${code}/typing`), (snap) => setTyping(snap.val())), [code]);
  useEffect(() => { setText(''); setProblem(''); if (myTurn) setTimeout(() => input.current?.focus(), 30); }, [room.turn, myTurn]);

  function publish(value) {
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      set(ref(`mecha/${code}/typing`), { id: me.id, t: value.slice(0, 30), turn: room.turn }).catch(() => {});
    }, 60);
  }

  async function submit(e) {
    e.preventDefault();
    if (!myTurn) return;
    const issue = wordProblem(room, text, dict);
    if (issue) { setProblem(issue); setShake((n) => n + 1); return; }
    const sent = text;
    setText('');
    const result = await onDispatch({ type: 'submit', word: sent, turn: room.turn });
    if (!result?.committed) { setProblem('Llegaste tarde: la bomba ya explotó o pasó.'); }
  }

  const live = typing && typing.turn === room.turn && typing.id === room.current ? typing.t : '';
  const radius = players.length <= 4 ? 38 : 42;
  const currentIndex = players.findIndex((p) => p.id === room.current);
  const angle = currentIndex >= 0 ? (360 / players.length) * currentIndex : 0;
  const myLetters = new Set(me?.letters || '');

  return (
    <div className={`cs-root lm-page lm-playing${boomRecent ? ' is-boom' : ''}`}>
      <div className="lm-arena-wrap">
        <div className="lm-arena">
          {players.map((p, i) => {
            const a = ((360 / players.length) * i - 90) * (Math.PI / 180);
            const isCurrent = p.id === room.current;
            const exploded = room.lastBoom?.id === p.id && boomRecent;
            return (
              <div
                key={p.id}
                className={`lm-seat${isCurrent ? ' is-current' : ''}${p.alive ? '' : ' is-out'}${p.id === me?.id ? ' is-me' : ''}${exploded ? ' is-exploded' : ''}`}
                style={{ left: `${50 + radius * Math.cos(a)}%`, top: `${50 + radius * Math.sin(a)}%` }}
                data-player={p.name}
              >
                <span className="lm-seat-avatar">{exploded ? '💥' : p.out ? '💀' : p.avatar}</span>
                <span className="lm-seat-name">{p.name}</span>
                {p.alive ? <Hearts lives={p.lives} /> : <span className="lm-seat-out">{p.out ? 'afuera' : 'mirando'}</span>}
                <span className="lm-seat-word">
                  {isCurrent ? <span className="lm-live">{live || '…'}</span> : <Highlight word={p.last} syllable={room.log.findLast?.((l) => l.id === p.id && l.w === p.last)?.s || ''} mode={room.options.mode} />}
                </span>
              </div>
            );
          })}

          <div className="lm-bomb" aria-live="polite">
            <span
              className="lm-bomb-arrow"
              aria-hidden="true"
              style={{
                left: `${50 + 66 * Math.sin((angle * Math.PI) / 180)}%`,
                top: `${50 - 66 * Math.cos((angle * Math.PI) / 180)}%`,
                transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              }}
            />
            <div className="lm-bomb-body">
              <span className="lm-bomb-spark" aria-hidden="true" />
              <strong className="lm-syllable" key={room.syllable + room.turn}>{room.syllable.toUpperCase()}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="lm-dock">
        {myTurn ? (
          <form className={`lm-answer${problem ? ' has-problem' : ''}`} onSubmit={submit} key={shake}>
            <p className="lm-prompt">¡Te toca! {room.options.mode === 'start' ? 'Empezá con' : 'Que tenga'} <mark>{room.syllable.toUpperCase()}</mark></p>
            <div className="tf-join-row">
              <input
                ref={input}
                className="tf-input lm-input"
                value={text}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                maxLength={30}
                aria-label="Tu palabra"
                placeholder="Escribí una palabra…"
                onChange={(e) => { setText(e.target.value); setProblem(''); publish(e.target.value); }}
              />
              <button type="submit" className="tf-btn tf-btn-primary" disabled={!text.trim()}>Mandar</button>
            </div>
            {problem && <p className="lm-error" role="alert">{problem}</p>}
          </form>
        ) : (
          <p className="lm-waiting">
            {me?.alive
              ? <>Tiene la bomba <strong>{current?.name}</strong>. Pensá la tuya por las dudas…</>
              : me ? <>Estás mirando. Entrás en la próxima partida.</> : null}
          </p>
        )}
        {me?.alive && (
          <div className="lm-letters" aria-label="Letras para la vida extra">
            {BONUS_LETTERS.map((ch) => <span key={ch} className={myLetters.has(ch) ? 'is-used' : ''}>{ch}</span>)}
            <small>¡Usalas todas y ganás una vida!</small>
          </div>
        )}
        <div className="lm-dock-foot">
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Fin ─────────────────────────────────────────────────────────────────────
function Ended({ room, me, onDispatch, onLeave }) {
  const winner = findPlayer(room, room.winner);
  const host = room.hostId === me?.id;
  const ranking = [...room.players].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  return (
    <div className="cs-root lm-page">
      <div className="lm-card lm-ended">
        <div className="lm-winner-avatar">{winner?.avatar || '💥'}</div>
        <p className="tf-eyebrow">Fin de la partida</p>
        <h1>{winner ? (winner.id === me?.id ? '¡Ganaste!' : `¡Ganó ${winner.name}!`) : 'Explotaron todos'}</h1>
        <p className="lm-hint">Se usaron {room.used.length} palabras.</p>
        <ul className="lm-ranking">
          {ranking.map((p) => <li key={p.id}><span>{p.avatar} {p.name}</span><strong>🏆 {p.wins || 0}</strong></li>)}
        </ul>
        <div className="lm-ended-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })}>💣 Otra partida</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="lm-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function MechaApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dict, setDict] = useState(null);
  const [dictError, setDictError] = useState('');
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);
  const now = tick + offset;

  useRegisterRoom(GAME, code, () => handleLeave());

  useEffect(() => {
    loadDictionary().then(setDict).catch(() => setDictError('No se pudo cargar el diccionario. Recargá la página.'));
    const off = backend.subscribeServerOffset(setOffset);
    return off;
  }, []);

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

  // El reloj corre solo mientras hay partida.
  const playing = room?.phase === 'playing';
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setTick(Date.now()), 100);
    return () => clearInterval(id);
  }, [playing]);

  // Cuando se termina la mecha, cualquiera avisa: la transacción deja pasar un solo aviso por turno.
  const boomSent = useRef(-1);
  useEffect(() => {
    if (!playing || !room.fuse || !me) return;
    if (now < room.fuse.deadline || boomSent.current === room.turn) return;
    boomSent.current = room.turn;
    dispatch({ type: 'explode', turn: room.turn });
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
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now() + offset, rand: Math.random, dict }));
    } catch {
      setError('No se pudo guardar la jugada. Revisá tu conexión.');
      return null;
    }
  }

  async function handleCreate(name, avatar) {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, clean, avatar));
      enterRoom({ code: newCode, playerId, name: clean });
    } catch {
      setError('No se pudo crear la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(target, name, avatar) {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: clean, avatar }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de La Mecha.'); return; }
      if (!findPlayer(result.room, playerId)) { setError('La sala está llena.'); return; }
      enterRoom({ code: target, playerId, name: clean });
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

  const banner = (error || dictError) && <p className="lm-error lm-banner" role="alert">{error || dictError}</p>;

  if (!session) return <>{banner}<Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} /></>;
  if (!room) return <div className="cs-root lm-page"><p className="lm-hint lm-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root lm-page">
        <div className="lm-card lm-center">
          <p>Ya no estás en esta sala.</p>
          <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /></>;
  if (room.phase === 'ended') return <Ended room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  if (!dict) return <div className="cs-root lm-page"><p className="lm-hint lm-center">{dictError || 'Cargando el diccionario…'}</p></div>;
  return <Arena room={room} me={me} code={code} now={now} dict={dict} onDispatch={dispatch} onLeave={handleLeave} />;
}
