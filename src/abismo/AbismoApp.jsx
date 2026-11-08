// Abismo: entrada, sala de espera, la inmersión (Dive.jsx), el final y el ranking global.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval } from '../ticker.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import GameChat from '../ui/GameChat.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, getProfile, setProfile, useFullscreenTarget, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import { isKicked } from '../lobby/kick.js';
import {
  GAME_TYPE, JUDGE_GRACE_MS, MAX_PLAYERS, OPTION_VALUES, allAnswers, applyAction, cleanName, findPlayer, makeId, newRoom, ranking, resultFor,
} from './game.js';
import { TIERS, depthOf, fmtDepth, tierById } from './tiers.js';
import Dive from './Dive.jsx';
import Ranking from './Ranking.jsx';
import { play } from './sfx.js';
import './abismo.css';

const GAME = 'abismo';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
const setUrlCode = (code) => window.history.replaceState(null, '', gameUrl(GAME, code));

// Le pide al juez del servidor que juzgue una respuesta. Nunca tira: devuelve { ok: false, reason } si algo falla.
async function judge(promptId, text) {
  try {
    const res = await fetch('/api/abismo/juzgar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promptId, text }) });
    const data = await res.json().catch(() => ({}));
    if (data && typeof data.ok === 'boolean') return data;
    return { ok: false, reason: data?.error || 'El juez no contestó. Probá de nuevo.' };
  } catch {
    return { ok: false, reason: 'No se pudo hablar con el juez. Revisá tu conexión.' };
  }
}

function TierLegend() {
  return (
    <ul className="ab-legend" data-legend>
      {TIERS.map((t) => (
        <li key={t.id} style={{ '--tc': t.color }}>
          <span className="ab-legend-icon" aria-hidden="true">{t.icon}</span>
          <b>{t.name}</b>
          <span className="ab-legend-pts">{t.pts} pts · {fmtDepth(depthOf(t.pts))}</span>
          <small>{t.blurb}</small>
        </li>
      ))}
    </ul>
  );
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onSolo, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  const [invite, setInvite] = useState(() => codeFromUrl().length === 4);
  const [showRank, setShowRank] = useState(false);
  const save = () => setProfile({ name, avatar });
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root ab-page">
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
    <div className="cs-root ab-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="ab-entry-grid">
        <div className="ab-card ab-entry">
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
          {error && <p className="ab-error" role="alert">{error}</p>}
          <button type="button" className="tf-btn tf-btn-primary tf-btn-block ab-solo-btn" data-act="solo" disabled={busy || !cleanName(name)} onClick={() => { save(); onSolo(name, avatar); }}>🤿 Sumergirme solo</button>
          <p className="ab-muted">Siete consignas contra el reloj. Tu partida se anota en el ranking global.</p>
          <button type="button" className="tf-btn tf-btn-soft tf-btn-block" data-act="create" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala para jugar con otros</button>
          <div className="ab-or"><span>o entrá con un código</span></div>
          <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
            <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
            <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
          </form>
        </div>
        <div className="ab-card ab-side">
          <div className="ab-card-head"><h2>Los niveles</h2><span>cuanto más nicho, más hondo</span></div>
          <TierLegend />
          <button type="button" className="tf-btn tf-btn-soft tf-btn-block" data-act="ranking" onClick={() => setShowRank((v) => !v)}>{showRank ? 'Ocultar el ranking' : '🏆 Ver el ranking global'}</button>
          {showRank && <Ranking highlight={name} />}
        </div>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const set = (options) => onDispatch({ type: 'setOptions', options });
  const solo = room.players.length === 1;
  return (
    <LobbyLayout code={code} host={host} players={room.players.length} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} gameTitle="Abismo · sala de espera" subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos. También podés jugar solo.' : 'El anfitrión elige las reglas y arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="ab-card">
        <div className="ab-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="ab-players" data-players>
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="ab-avatar">{p.avatar}</span>
              <strong>{p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Consignas por partida">
          <Segmented name="rounds" value={room.options.rounds} disabled={!host} onChange={(v) => set({ rounds: v })} choices={OPTION_VALUES.rounds.map((n) => ({ value: n, label: String(n) }))} />
        </OptionField>
        <OptionField title="Segundos por consigna" hint="Si una respuesta no vale, podés probar otra mientras quede tiempo.">
          <Segmented name="seconds" value={room.options.seconds} disabled={!host} onChange={(v) => set({ seconds: v })} choices={OPTION_VALUES.seconds.map((n) => ({ value: n, label: `${n} s` }))} />
        </OptionField>
      </LobbyOptions>
      <div className="ab-card">
        <div className="ab-card-head"><h2>Cómo se juega</h2></div>
        <ul className="ab-rules">
          <li>Aparece una consigna (<b>«Nombrá una fruta»</b>) y todos escriben <b>una sola respuesta</b> antes de que se acabe el tiempo.</li>
          <li>Un juez decide si la respuesta <b>entra en la categoría</b> y <b>qué tan nicho</b> es. Cuanto menos gente la conozca, más hondo te hundís.</li>
          <li>Una respuesta rarísima que no entra en la categoría vale <b>cero</b>. Y la «rara» que dicen todos es <b>Vivillo</b>: apenas más que la obvia.</li>
          <li>Al final gana el que llegó <b>más hondo</b>. Cada partida se anota en el ranking global.</li>
        </ul>
        <TierLegend />
      </div>
      <div className="ab-start">
        {host ? <button type="button" className="tf-btn tf-btn-primary ab-start-btn" data-act="start" onClick={() => onDispatch({ type: 'start' })}>🤿 {solo ? 'Sumergirme' : '¡A sumergirse!'}</button> : <p>Esperando que el anfitrión arranque…</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Final ───────────────────────────────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave, posted }) {
  const host = room.hostId === me.id;
  const rank = ranking(room);
  const medals = ['🥇', '🥈', '🥉'];
  const all = allAnswers(room);
  const mineRank = rank.find((p) => p.id === me.id);
  const solo = rank.length === 1;
  const [showRank, setShowRank] = useState(false);
  useEffect(() => { play('surface'); }, []);
  return (
    <div className="cs-root ab-page">
      <div className="ab-card ab-final" data-final>
        <p className="tf-eyebrow">Fin de la inmersión</p>
        {solo
          ? <h1>{mineRank ? `Llegaste a ${fmtDepth(depthOf(mineRank.score))}` : 'Fin'}</h1>
          : <h1>{rank[0] ? (rank[0].id === me.id ? '¡Llegaste más hondo que nadie!' : `¡${rank[0].name} llegó más hondo!`) : 'Fin'}</h1>}
        <ol className="ab-ranking" data-standings>
          {rank.map((p, i) => <li key={p.id} className={p.id === me.id ? 'is-me' : ''}><span>{medals[p.place - 1] || `${p.place}.`} {p.avatar} {p.name}</span><strong>{fmtDepth(depthOf(p.score))} <small>· {p.score} pts</small></strong></li>)}
        </ol>
        {me.inGame && <p className={`ab-posted${posted === 'error' ? ' is-bad' : ''}`} data-posted={posted}>{posted === 'ok' ? '🏆 Anotado en el ranking global.' : posted === 'error' ? 'No se pudo anotar en el ranking global.' : posted === 'skip' ? '' : 'Anotando en el ranking global…'}</p>}
        <div className="ab-final-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" data-act="again" onClick={() => onDispatch({ type: 'start' })}>🤿 Otra inmersión</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="ab-muted">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={() => setShowRank((v) => !v)}>🏆 Ranking global</button>
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
        {showRank && <Ranking highlight={me.name} />}
      </div>
      {all.length > 0 && (
        <div className="ab-card">
          <div className="ab-card-head"><h2>Todas las respuestas</h2><span>de la más nicho a la más obvia</span></div>
          <ul className="ab-all" data-all-answers>
            {all.map(({ round, prompt, player, answer }) => {
              const t = tierById(answer.k);
              return (
                <li key={`${round}-${player.id}`} style={{ '--tc': t?.color }} className={player.id === me.id ? 'is-me' : ''}>
                  <span className="ab-all-tier">{t?.icon} {t?.name}</span>
                  <b>«{answer.c}»</b>
                  <span className="ab-all-prompt">{prompt?.text}</span>
                  <span className="ab-all-who">{player.avatar} {player.name} · +{answer.p}</span>
                  {answer.n && <small>{answer.n}</small>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function AbismoApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [posted, setPosted] = useState('');
  const screenRef = useRef(null);
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);
  const now = tick + offset;

  useRegisterRoom(GAME, code, () => handleLeave());
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

  const timed = room && (room.phase === 'prompt' || room.phase === 'reveal');
  useEffect(() => {
    if (!timed) return undefined;
    setTick(Date.now()); // si no, el primer cuadro muestra el reloj con la hora de cuando se abrió la pantalla
    return backgroundInterval(() => setTick(Date.now()), 250);
  }, [timed]);

  // Cuando se termina un reloj, cualquiera avisa; la transacción deja pasar un solo aviso.
  const tickSent = useRef('');
  useEffect(() => {
    if (!timed || !me) return;
    const due = room.phase === 'prompt' ? room.phaseEndsAt + JUDGE_GRACE_MS : room.phaseEndsAt;
    if (!room.phaseEndsAt || now < due) return;
    const key = `${room.startedAt}:${room.round}:${room.phase}`;
    if (tickSent.current === key) return;
    tickSent.current = key;
    dispatch({ type: 'tick', round: room.round, phase: room.phase });
  });

  // Al final, cada pantalla anota su partida en el ranking global (una vez por partida).
  const postedFor = useRef('');
  useEffect(() => {
    if (room?.phase !== 'final' || !me?.inGame) return;
    const key = `${code}:${room.startedAt}`;
    if (postedFor.current === key) return;
    postedFor.current = key;
    const result = resultFor(room, me.id);
    if (!result.answers.length) { setPosted('skip'); return; }
    setPosted('');
    fetch('/api/abismo/partida', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: me.name, avatar: me.avatar, answers: result.answers }) })
      .then((r) => setPosted(r.ok ? 'ok' : 'error'))
      .catch(() => setPosted('error'));
  }, [room?.phase, room?.startedAt, me?.inGame]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleCreate(name, avatar, solo = false) {
    setBusy(true);
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => {
        const fresh = newRoom(playerId, cleanName(name), avatar);
        return solo ? applyAction(fresh, { type: 'start', playerId }, { now: Date.now() + offset, rand: Math.random }) : fresh;
      });
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Abismo.'); return; }
      if (!findPlayer(result.room, playerId)) { setError('La sala está llena.'); return; }
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

  const banner = error && <p className="ab-error ab-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onSolo={(n, a) => handleCreate(n, a, true)} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root ab-page"><p className="ab-muted ab-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root ab-page">
        <div className="ab-card ab-center">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {!isKicked(room, session.playerId) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  const multi = room.players.length > 1;
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} />{multi && <GameChat code={code} me={me} />}</>;
  if (room.phase === 'final') return <>{banner}<Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} posted={posted} />{multi && <GameChat code={code} me={me} />}</>;
  return (
    <>
      {banner}
      <Dive room={room} me={me} now={now} onDispatch={dispatch} judge={judge} screenRef={screenRef} />
      {multi && <GameChat code={code} me={me} />}
    </>
  );
}
