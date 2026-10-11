// Armá el Meme: entrada, sala de espera, armado del meme, votación, resultados y final.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import GameHero from '../ui/GameHero.jsx';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import {
  GAME_TYPE, MAX_PLAYERS, MAX_TEXT, MIN_PLAYERS, STARS, applyAction, cleanName, findPlayer, makeId, newRoom, pointsFor, ranking,
} from './game.js';
import { defaultTexts } from './templates.js';
import MemeView from './MemeView.jsx';
import './meme.css';

const GAME = 'meme';
const STAR_LABELS = { 1: 'Meh', 2: 'Tiene algo', 3: 'Bueno', 4: 'Muy bueno', 5: '¡Me mató!' };

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
const setUrlCode = (code) => window.history.replaceState(null, '', gameUrl(GAME, code));

// Plantillas de /api/memes, una sola vez por pestaña.
let templatesPromise = null;
function loadTemplates() {
  templatesPromise ||= fetch('/api/memes')
    .then((r) => r.json())
    .then((d) => { if (!d.templates?.length) throw new Error(d.error || 'Sin memes'); return d.templates; })
    .catch((e) => { templatesPromise = null; throw e; });
  return templatesPromise;
}
function samplePool(templates, n = 40) {
  const a = [...templates];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

function Clock({ endsAt, now, total }) {
  const left = Math.max(0, endsAt - now);
  const pct = total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  return (
    <div className={`mm-clock${left < 10000 ? ' is-urgent' : ''}`}>
      <span>{Math.ceil(left / 1000)} s</span>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  const save = () => setProfile({ name, avatar });
  return (
    <div className="cs-root mm-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="mm-card mm-entry">
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
        {error && <p className="mm-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>Crear sala</button>
        <div className="mm-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, templates, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me.id;
  const opts = room.options;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const enough = room.players.length >= MIN_PLAYERS;
  return (
    <LobbyLayout code={code} gameTitle="Armá el Meme · sala de espera" subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'} copied={copied} onCopyInvite={onCopy} onLeave={onLeave}>
      <div className="mm-card">
        <div className="mm-card-head"><h2>Jugadores</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <ul className="mm-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me.id ? 'is-me' : ''}>
              <span className="mm-avatar">{p.avatar}</span>
              <strong>{p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me.id ? 'vos' : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <LobbyOptions canEdit={host}>
        <OptionField title="Modo" hint={opts.mode === 'same' ? 'Todos reciben la misma plantilla y gana el más creativo.' : 'A cada uno le toca un meme distinto (y lo puede cambiar una vez).'}>
          <Segmented name="mode" value={opts.mode} disabled={!host} onChange={(v) => set({ mode: v })} choices={[{ value: 'normal', label: '🎲 Normal' }, { value: 'same', label: '🪞 Todos el mismo meme' }]} />
        </OptionField>
        <OptionField title="Rondas">
          <Segmented name="rounds" value={opts.rounds} disabled={!host} onChange={(v) => set({ rounds: v })} choices={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </OptionField>
        <OptionField title="Tiempo para armar cada meme">
          <Segmented name="seconds" value={opts.seconds} disabled={!host} onChange={(v) => set({ seconds: v })} choices={[45, 60, 90, 120].map((n) => ({ value: n, label: `${n} s` }))} />
        </OptionField>
      </LobbyOptions>
      <div className="mm-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary mm-start-btn" disabled={!enough || !templates} onClick={() => onDispatch({ type: 'start', pool: samplePool(templates) })}>
            🖼️ ¡A memear!
          </button>
        ) : <p>Esperando que el anfitrión arranque…</p>}
        {!enough && <p className="mm-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
        {!templates && <p className="mm-hint">Cargando memes…</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Armado ──────────────────────────────────────────────────────────────────
function Making({ room, me, now, templates, onDispatch }) {
  const template = room.templates[me.id];
  const submitted = Boolean(room.memes[me.id]);
  const [texts, setTexts] = useState(() => defaultTexts(template?.boxes || 2));
  const [active, setActive] = useState(0);
  const sent = useRef(false);
  const tplKey = template ? `${template.id}:${room.round}` : '';
  useEffect(() => { setTexts(defaultTexts(template?.boxes || 2)); setActive(0); sent.current = false; }, [tplKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = room.phaseEndsAt - now;
  function submit() {
    if (sent.current || submitted) return;
    sent.current = true;
    onDispatch({ type: 'submit', round: room.round, texts });
  }
  // Si se termina el tiempo, se entrega lo que haya escrito.
  useEffect(() => { if (me.inGame && !submitted && left < 1500 && texts.some((t) => t.t.trim())) submit(); });

  const update = (i, patch) => setTexts((list) => list.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const waiting = room.players.filter((p) => p.inGame && !room.memes[p.id]);
  const header = (
    <div className="mm-bar">
      <span className="mm-round">Ronda {room.round} de {room.options.rounds}{room.options.mode === 'same' ? ' · todos el mismo meme' : ''}</span>
      <Clock endsAt={room.phaseEndsAt} now={now} total={room.options.seconds * 1000} />
    </div>
  );

  if (!me.inGame) return <div className="cs-root mm-page">{header}<div className="mm-card mm-center"><p>Entraste a mitad de ronda: en la próxima te toca. Mientras, los demás arman sus memes…</p></div></div>;
  if (submitted) {
    return (
      <div className="cs-root mm-page">
        {header}
        <div className="mm-done">
          <MemeView template={template} texts={room.memes[me.id]} />
          <p className="mm-hint">¡Listo! Esperando a {waiting.length === 1 ? waiting[0].name : `${waiting.length} jugadores`}…</p>
          <ul className="mm-waiting">{room.players.filter((p) => p.inGame).map((p) => <li key={p.id} className={room.memes[p.id] ? 'is-done' : ''} title={p.name}>{p.avatar}</li>)}</ul>
        </div>
      </div>
    );
  }
  const canReroll = room.options.mode === 'normal' && !room.rerolled[me.id] && templates;
  return (
    <div className="cs-root mm-page">
      {header}
      <div className="mm-editor">
        <div className="mm-editor-preview">
          <MemeView template={template} texts={texts} editable active={active} onSelect={setActive} onMove={(i, x, y) => update(i, { x: Math.round(x), y: Math.round(y) })} />
          <p className="mm-hint mm-tip">Arrastrá los textos para acomodarlos.</p>
        </div>
        <div className="mm-editor-side">
          {texts.map((t, i) => (
            <div key={i} className={`mm-field${active === i ? ' is-active' : ''}`}>
              <input
                className="tf-input"
                value={t.t}
                maxLength={MAX_TEXT}
                placeholder={`Texto ${i + 1}`}
                aria-label={`Texto ${i + 1}`}
                onFocus={() => setActive(i)}
                onChange={(e) => update(i, { t: e.target.value })}
              />
              <div className="mm-size">
                <button type="button" aria-label="Achicar texto" onClick={() => update(i, { s: Math.max(3, t.s - 1) })}>A−</button>
                <button type="button" aria-label="Agrandar texto" onClick={() => update(i, { s: Math.min(16, t.s + 1) })}>A+</button>
              </div>
            </div>
          ))}
          <div className="mm-editor-actions">
            {canReroll && (
              <button
                type="button"
                className="tf-btn tf-btn-soft"
                onClick={() => {
                  const used = new Set(Object.values(room.templates).map((x) => x.id));
                  const options = templates.filter((x) => !used.has(x.id));
                  const pick = options[Math.floor(Math.random() * options.length)] || templates[0];
                  onDispatch({ type: 'reroll', round: room.round, template: pick });
                }}
              >
                🔄 Cambiar meme (1 vez)
              </button>
            )}
            <button type="button" className="tf-btn tf-btn-primary" disabled={!texts.some((t) => t.t.trim())} onClick={submit}>¡Listo!</button>
          </div>
          <p className="mm-hint">{template?.name}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Votación ────────────────────────────────────────────────────────────────
function Voting({ room, me, now, onDispatch }) {
  const author = room.order[room.voteIndex];
  const mine = author === me.id;
  const myVote = room.votes[author]?.[me.id];
  const voters = room.players.filter((p) => p.id !== author);
  const voted = voters.filter((p) => room.votes[author]?.[p.id]).length;
  return (
    <div className="cs-root mm-page">
      <div className="mm-bar">
        <span className="mm-round">Votación · meme {room.voteIndex + 1} de {room.order.length}</span>
        <Clock endsAt={room.phaseEndsAt} now={now} total={12000} />
      </div>
      <div className="mm-vote" key={author}>
        <MemeView template={room.templates[author]} texts={room.memes[author]} className="mm-vote-meme" maxHeight="var(--page-h) - 250px" />
        {mine ? (
          <p className="mm-own">Este es el tuyo 🤫 Hacete el distraído.</p>
        ) : (
          <div className="mm-stars" role="radiogroup" aria-label="Tu voto">
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={myVote === n}
                className={myVote === n ? 'is-selected' : myVote && n < myVote ? 'is-below' : ''}
                disabled={Boolean(myVote)}
                onClick={() => onDispatch({ type: 'vote', round: room.round, index: room.voteIndex, stars: n })}
                data-stars={n}
              >
                <span aria-hidden="true">{'⭐'.repeat(n)}</span>
                <small>{STAR_LABELS[n]}</small>
              </button>
            ))}
          </div>
        )}
        <p className="mm-hint">{voted} de {voters.length} votaron</p>
      </div>
    </div>
  );
}

// ─── Resultados de la ronda ──────────────────────────────────────────────────
function Results({ room, now }) {
  const rows = room.order.map((id) => ({ id, points: pointsFor(room, id), player: findPlayer(room, id) })).sort((a, b) => b.points - a.points);
  const last = room.round >= room.options.rounds;
  return (
    <div className="cs-root mm-page">
      <div className="mm-bar">
        <span className="mm-round">Resultados de la ronda {room.round}</span>
        <span className="mm-next">{last ? 'Final' : 'Próxima ronda'} en {Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000))} s</span>
      </div>
      {rows.length === 0 && <div className="mm-card mm-center"><p>Nadie llegó a escribir nada esta ronda 😶</p></div>}
      <div className="mm-results">
        {rows.map((r, i) => (
          <figure key={r.id} className={`mm-result${i === 0 ? ' is-best' : ''}`}>
            <MemeView template={room.templates[r.id]} texts={room.memes[r.id]} />
            <figcaption>
              <span>{i === 0 ? '🏆 ' : ''}{r.player?.avatar} {r.player?.name || 'Alguien que se fue'}</span>
              <strong>⭐ {r.points}</strong>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ─── Final ───────────────────────────────────────────────────────────────────
function Final({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me.id;
  const rank = ranking(room);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="cs-root mm-page">
      <div className="mm-card mm-final">
        <p className="tf-eyebrow">Fin de la partida</p>
        <h1>{rank[0] ? (rank[0].id === me.id ? '¡Sos el rey del meme!' : `¡Ganó ${rank[0].name}!`) : 'Fin'}</h1>
        <ol className="mm-ranking">
          {rank.map((p, i) => <li key={p.id} className={p.id === me.id ? 'is-me' : ''}><span>{medals[i] || `${i + 1}.`} {p.avatar} {p.name}</span><strong>⭐ {p.score}</strong></li>)}
        </ol>
        <div className="mm-final-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start', withPool: true })}>🖼️ Otra partida</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="mm-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
      {room.history.length > 0 && (
        <>
          <h2 className="mm-section">Los mejores de cada ronda</h2>
          <div className="mm-results">
            {room.history.map((h) => (
              <figure key={h.round} className="mm-result">
                <MemeView template={h.template} texts={h.texts} />
                <figcaption><span>Ronda {h.round} · {findPlayer(room, h.author)?.name || 'Alguien'}</span><strong>⭐ {h.points}</strong></figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function MemeApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);
  const now = tick + offset;

  useRegisterRoom(GAME, code, () => handleLeave());

  useEffect(() => {
    loadTemplates().then(setTemplates).catch(() => setError('No se pudieron cargar los memes. Probá recargar en un rato.'));
    return backend.subscribeServerOffset(setOffset);
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

  const timed = room && ['making', 'voting', 'results'].includes(room.phase);
  useEffect(() => {
    if (!timed) return undefined;
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [timed]);

  // Cuando se termina un reloj, cualquiera avisa; la transacción deja pasar un solo aviso.
  const tickSent = useRef('');
  useEffect(() => {
    if (!timed || !me || now < room.phaseEndsAt) return;
    const key = `${room.round}:${room.phase}:${room.voteIndex}`;
    if (tickSent.current === key) return;
    tickSent.current = key;
    dispatch({ type: 'tick', round: room.round, phase: room.phase, index: room.voteIndex, pool: room.phase === 'results' && templates ? samplePool(templates) : undefined });
  });

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    const full = action.withPool ? { ...action, pool: templates ? samplePool(templates) : [] } : action;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...full, playerId: session.playerId }, { now: Date.now() + offset, rand: Math.random }));
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Armá el Meme.'); return; }
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

  const banner = error && <p className="mm-error mm-banner" role="alert">{error}</p>;
  if (!session) return <Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} />;
  if (!room) return <div className="cs-root mm-page"><p className="mm-hint mm-center">Entrando a la sala…</p></div>;
  if (!me) {
    return (
      <div className="cs-root mm-page">
        <div className="mm-card mm-center">
          <p>Ya no estás en esta sala.</p>
          <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  const view = {
    lobby: () => <Lobby room={room} me={me} code={code} templates={templates} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} />,
    making: () => <Making room={room} me={me} now={now} templates={templates} onDispatch={dispatch} />,
    voting: () => <Voting room={room} me={me} now={now} onDispatch={dispatch} />,
    results: () => <Results room={room} now={now} />,
    final: () => <Final room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />,
  }[room.phase];
  return <>{banner}{view ? view() : null}</>;
}
