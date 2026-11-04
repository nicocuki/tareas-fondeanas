// Arena Royale: entrada, sala de espera, partida y final.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { everyFrame } from '../ticker.js';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import { isKicked } from '../lobby/kick.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import GameChat from '../ui/GameChat.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import {
  CARDS, CARD_BY_ID, DECK_SIZE, DEFAULT_DECK, TICK_MS, averageCost, seconds, validDeck,
} from './cards.js';
import {
  GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, OPTION_VALUES, TEAM_SIZE, applyAction, cleanName, findPlayer, makeId, newRoom, teamName,
} from './game.js';
import {
  H, W, createRunner, inOvertime, isDouble, placeProblem, secondsLeft,
} from './sim.js';
import { CELL, TEAM_COLORS, draw, fromView } from './render.js';
import './arena.css';

const GAME = 'arena';
const DECK_KEY = 'tf:arena:mazo';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
function setUrlCode(code) {
  window.history.replaceState(null, '', gameUrl(GAME, code));
}

// El mazo se acuerda en este dispositivo.
function loadDeck() {
  try {
    const deck = JSON.parse(localStorage.getItem(DECK_KEY));
    if (validDeck(deck)) return deck;
  } catch { /* sin guardado */ }
  return [...DEFAULT_DECK];
}
function saveDeck(deck) {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)); } catch { /* sin guardado */ }
}

// Lo que dice la carta, en una línea.
function statLine(c) {
  if (c.kind === 'spell') return `💥 ${c.dmg} de daño · radio ${c.radius}${c.stun ? ` · aturde ${seconds(c.stun)} s` : ''}`;
  const aim = c.targets === 'buildings' ? 'solo edificios' : c.targets === 'ground' ? 'solo suelo' : 'suelo y aire';
  const parts = [`❤️ ${c.hp}`, `💥 ${c.dmg}`, `⏱ ${seconds(c.hit)} s`];
  if (c.speed) parts.push(`👟 ${c.speed}`);
  parts.push(`🎯 ${c.range}`, aim);
  if (c.count) parts.push(`×${c.count}`);
  return parts.join(' · ');
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  const [invite, setInvite] = useState(() => codeFromUrl().length === 4);
  const save = () => setProfile({ name, avatar });
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root ar-page">
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
    <div className="cs-root ar-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="ar-card ar-entry">
        <label className="tf-field">
          <span>Tu nombre</span>
          <input className="tf-input" value={name} maxLength={20} placeholder="¿Cómo te llamás?" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="tf-field">
          <span>Tu ficha</span>
          <div className="tf-avatar-grid">
            {AVATARS.map((a) => <button key={a} type="button" aria-label={`Ficha ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        {error && <p className="ar-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>
          Crear sala
        </button>
        <div className="ar-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
      </div>
    </div>
  );
}

// ─── Mazo ────────────────────────────────────────────────────────────────────
function DeckBuilder({ deck, onSave }) {
  const [draft, setDraft] = useState(deck);
  const [info, setInfo] = useState(null);
  useEffect(() => setDraft(deck), [deck]);
  const toggle = (id) => {
    let next;
    if (draft.includes(id)) next = draft.filter((x) => x !== id);
    else if (draft.length < DECK_SIZE) next = [...draft, id];
    else return;
    setDraft(next);
    if (next.length === DECK_SIZE) onSave(next);
  };
  const shown = CARD_BY_ID[info] || null;
  return (
    <div className="ar-card" data-deck>
      <div className="ar-card-head">
        <h2>Tu mazo</h2>
        <span>{draft.length} / {DECK_SIZE}{draft.length === DECK_SIZE ? ` · elixir ${averageCost(draft).toFixed(1)}` : ''}</span>
      </div>
      <div className="ar-deck">
        {CARDS.map((c) => (
          <button
            key={c.id} type="button" data-pick={c.id} aria-pressed={draft.includes(c.id)} className={`ar-mini ${draft.includes(c.id) ? 'is-on' : ''}`}
            onClick={() => toggle(c.id)} onMouseEnter={() => setInfo(c.id)} onFocus={() => setInfo(c.id)}
          >
            <i className="ar-cost">{c.cost}</i>
            <span className="ar-emoji">{c.emoji}</span>
            <small>{c.name}</small>
          </button>
        ))}
      </div>
      <p className="ar-hint">
        {shown ? <><b>{shown.name}</b> ({shown.kind === 'spell' ? 'hechizo' : shown.kind === 'building' ? 'edificio' : 'tropa'}): {shown.desc} <span className="ar-stats">{statLine(shown)}</span></> : 'Elegí 8 cartas. Pasá el mouse por una para ver qué hace.'}
      </p>
      {draft.length < DECK_SIZE && <p className="ar-hint ar-warn">Faltan {DECK_SIZE - draft.length} para completar el mazo (se guarda solo al llegar a 8).</p>}
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me?.id;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const count = (team) => room.players.filter((p) => p.team === team).length;
  const ready = count(0) > 0 && count(1) > 0 && room.players.length >= MIN_PLAYERS;
  const saveMyDeck = (deck) => { saveDeck(deck); onDispatch({ type: 'setDeck', deck }); };
  return (
    <LobbyLayout
      code={code} roster={room.players} me={me?.id} onKick={(id) => onDispatch({ type: 'kick', target: id })} host={host} players={room.players.length}
      gameTitle="Arena Royale · sala de espera"
      subtitle={host ? 'Armá los equipos, elegí tu mazo y arrancá.' : 'El anfitrión arranca la partida cuando estén los equipos.'}
      copied={copied} onCopyInvite={onCopy} onLeave={onLeave}
    >
      <div className="ar-card" data-teams>
        <div className="ar-card-head"><h2>Equipos</h2><span>{room.players.length} / {MAX_PLAYERS}</span></div>
        <div className="ar-teams">
          {[0, 1].map((team) => (
            <div key={team} className="ar-team" style={{ '--tc': TEAM_COLORS[team] }}>
              <h3>Equipo {teamName(team)}</h3>
              <ul>
                {room.players.filter((p) => p.team === team).map((p) => (
                  <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}><span>{p.avatar}</span><strong>{p.name}</strong><small>{p.id === room.hostId ? '👑' : ''}{p.wins ? ` 🏆${p.wins}` : ''}</small></li>
                ))}
                {Array.from({ length: Math.max(0, TEAM_SIZE - count(team)) }).map((_, i) => <li key={`e${i}`} className="is-empty">libre</li>)}
              </ul>
              {me?.team !== team && count(team) < TEAM_SIZE && <button type="button" className="tf-btn tf-btn-soft" data-act="setTeam" onClick={() => onDispatch({ type: 'setTeam', team })}>Pasarme acá</button>}
            </div>
          ))}
        </div>
        <p className="ar-hint">1 contra 1 o 2 contra 2. Cada uno juega con su mazo y su elixir; las torres son del equipo.</p>
      </div>

      <DeckBuilder deck={me?.deck || DEFAULT_DECK} onSave={saveMyDeck} />

      <LobbyOptions canEdit={host}>
        <OptionField title="Duración" hint="Si hay empate al final hay un minuto extra: gana quien tire la primera torre.">
          <Segmented name="minutes" value={room.options.minutes} disabled={!host} onChange={(v) => set({ minutes: v })} choices={OPTION_VALUES.minutes.map((n) => ({ value: n, label: `${n} min` }))} />
        </OptionField>
      </LobbyOptions>

      <div className="ar-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary ar-start-btn" disabled={!ready} data-act="start" onClick={() => onDispatch({ type: 'start' })}>⚔️ Empezar la partida</button>
        ) : <p>Esperando que el anfitrión arranque…</p>}
        {!ready && <p className="ar-hint">Hace falta al menos uno en cada equipo. Pasale el código a tu rival.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Partida ─────────────────────────────────────────────────────────────────
function Game({ room, me, onDispatch, onLeave, clock }) {
  const match = room.match;
  const seat = match.seats.findIndex((s) => s.id === me.id);
  const team = match.seats[seat]?.team ?? 0;
  const flip = team === 1;
  const canvasRef = useRef(null);
  const runner = useMemo(() => createRunner({ seed: match.seed, minutes: match.minutes, players: match.seats }), [match.seed, room.matchN]); // eslint-disable-line react-hooks/exhaustive-deps
  const [slot, setSlot] = useState(null);
  const [hud, setHud] = useState(null);
  const [msg, setMsg] = useState('');
  const live = useRef({ slot: null, hover: null, pending: [], sent: false });
  live.current.slot = slot;

  useEffect(() => { runner.addCmds(match.cmds); }, [runner, match.cmds]);

  // El bucle: avanza la simulación hasta el paso que corresponde a la hora del servidor y dibuja.
  useEffect(() => {
    live.current.sent = false;
    let lastHud = 0;
    return everyFrame(({ hidden }) => {
      const now = Date.now() + clock.current;
      const exact = (now - match.startsAt) / TICK_MS;
      const target = Math.max(0, Math.floor(exact));
      runner.advanceTo(target);
      const st = runner.state;
      const L = live.current;
      if (!hidden && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        const card = L.slot !== null ? CARD_BY_ID[st.players[seat]?.hand[L.slot]] : null;
        const valid = card && L.hover ? !placeProblem(st, seat, L.slot, L.hover.x, L.hover.y) : false;
        draw(ctx, st, { flip, team, time: now / 1000, frac: Math.min(1, Math.max(0, exact - target)), hover: L.hover, card, valid });
      }
      if (st.over && room.phase === 'playing' && !L.sent) { L.sent = true; onDispatch({ type: 'finish', winner: st.over.winner }); }
      if (Date.now() - lastHud > 120 || st.over) {
        lastHud = Date.now();
        const p = st.players[seat];
        setHud({
          started: exact >= 0, count: Math.max(0, Math.ceil(-exact / 20)), elixir: p.elixir, hand: [...p.hand], next: p.queue[0], played: p.played,
          secs: secondsLeft(st), ot: inOvertime(st), dbl: isDouble(st), crowns: st.crowns, over: st.over,
        });
        L.pending = L.pending.filter((q) => p.played <= q.played && Date.now() <= q.until);
      }
    });
  }, [runner, flip, team, seat]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1 a 4 eligen carta y Escape la suelta.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (['1', '2', '3', '4'].includes(e.key)) setSlot((s) => (s === Number(e.key) - 1 ? null : Number(e.key) - 1));
      if (e.key === 'Escape') setSlot(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const id = setTimeout(() => setMsg(''), 1800);
    return () => clearTimeout(id);
  }, [msg]);

  function worldAt(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const [x, y] = fromView(flip, ((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H);
    return { x, y };
  }

  function onMove(e) { live.current.hover = worldAt(e); }
  function onPlace(e) {
    const L = live.current;
    if (L.slot === null || L.pending.some((q) => q.slot === L.slot)) return;
    const pos = worldAt(e);
    L.hover = pos;
    const st = runner.state;
    const problem = placeProblem(st, seat, L.slot, pos.x, pos.y);
    if (problem) { setMsg(problem); return; }
    L.pending = [...L.pending, { slot: L.slot, played: st.players[seat].played + L.pending.length, until: Date.now() + 1500 }];
    onDispatch({ type: 'play', slot: L.slot, x: pos.x, y: pos.y });
    setSlot(null);
  }

  const crowns = hud?.crowns || [0, 0];
  const mm = String(Math.floor((hud?.secs || 0) / 60));
  const ss = String((hud?.secs || 0) % 60).padStart(2, '0');
  const handCards = hud ? hud.hand.map((id) => CARD_BY_ID[id]) : [];
  const nextCard = hud ? CARD_BY_ID[hud.next] : null;
  const pending = live.current.pending;
  return (
    <div className="cs-root ar-page ar-playing">
      <div className="ar-hud" data-hud>
        <div className="ar-score" style={{ '--tc': TEAM_COLORS[1 - team] }}><b>{crowns[1 - team]}</b> 👑 <small>{teamName(1 - team)}</small></div>
        <div className="ar-clock" data-clock>
          {hud?.started ? (hud.ot ? <span className="ar-ot">¡Tiempo extra!</span> : <span>{mm}:{ss}</span>) : <span>¡Preparate!</span>}
          {hud?.started && hud.dbl && <small>elixir ×2</small>}
        </div>
        <div className="ar-score" style={{ '--tc': TEAM_COLORS[team] }}><small>{teamName(team)} (vos)</small> 👑 <b>{crowns[team]}</b></div>
      </div>

      <div className="ar-stage">
        <canvas
          ref={canvasRef} className="ar-canvas" data-arena-canvas width={W * CELL} height={H * CELL}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => { live.current.hover = null; }} onClick={onPlace}
        />
        {hud && !hud.started && <div className="ar-count" aria-live="polite">{hud.count || 1}</div>}
        {msg && <div className="ar-toast" role="status">{msg}</div>}
        {hud?.over && <div className="ar-toast ar-toast-big">{hud.over.winner === -1 ? 'Empate' : hud.over.winner === team ? '¡Ganaste!' : 'Perdiste'}</div>}
      </div>

      <div className="ar-bottom">
        <div className="ar-elixir" data-elixir={hud ? Math.floor(hud.elixir) : 0} aria-label={`Elixir ${hud ? Math.floor(hud.elixir) : 0}`}>
          <div className="ar-elixir-fill" style={{ width: `${hud ? (hud.elixir / 10) * 100 : 50}%` }} />
          <span>💧 {hud ? Math.floor(hud.elixir) : 5}</span>
        </div>
        <div className="ar-hand" data-hand>
          <div className="ar-next" title="La que sigue">
            <small>sigue</small>
            <span>{nextCard?.emoji}</span>
          </div>
          {handCards.map((c, i) => {
            const poor = (hud?.elixir || 0) < c.cost;
            const busy = pending.some((q) => q.slot === i);
            return (
              <button
                key={`${i}-${c.id}`} type="button" data-card={c.id} data-slot={i} aria-pressed={slot === i}
                className={`ar-card-btn ${slot === i ? 'is-sel' : ''} ${poor ? 'is-poor' : ''}`} disabled={Boolean(busy) || Boolean(hud?.over)}
                title={`${c.name}: ${c.desc}`} onClick={() => setSlot(slot === i ? null : i)}
              >
                <i className="ar-cost">{c.cost}</i>
                <span className="ar-emoji">{c.emoji}</span>
                <small>{c.name}</small>
                <kbd>{i + 1}</kbd>
              </button>
            );
          })}
        </div>
      </div>
      <p className="ar-hint ar-tip">Elegí una carta (o 1 a 4) y tocá la arena para ponerla. Las tropas van en tu mitad; los hechizos, donde quieras.</p>
      <div className="ar-leave"><button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir de la partida</button></div>
    </div>
  );
}

// ─── Fin ─────────────────────────────────────────────────────────────────────
function Ended({ room, me, onDispatch, onLeave }) {
  const host = room.hostId === me?.id;
  const winner = room.winnerTeam;
  const mine = me?.team;
  const title = winner === -1 || winner === null ? 'Empate' : winner === mine ? '¡Ganaste!' : `Ganó el equipo ${teamName(winner)}`;
  return (
    <div className="cs-root ar-page">
      <div className="ar-card ar-ended">
        <p className="tf-eyebrow">Fin de la partida</p>
        <h1 data-result>{title}</h1>
        <ul className="ar-ranking">
          {[...room.players].sort((a, b) => b.wins - a.wins).map((p) => (
            <li key={p.id} style={{ '--tc': TEAM_COLORS[p.team] }}><span>{p.avatar} {p.name}</span><strong>🏆 {p.wins}</strong></li>
          ))}
        </ul>
        <div className="ar-ended-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" data-act="start" onClick={() => onDispatch({ type: 'start' })}>⚔️ Revancha</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar mazo o equipos</button>
            </>
          ) : <p className="ar-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function ArenaApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const clock = useRef(0); // lo que hay que sumarle a Date.now() para tener la hora del servidor
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);

  useRegisterRoom(GAME, code, () => handleLeave());

  useEffect(() => backend.subscribeServerOffset((offset) => { clock.current = offset; }), []);

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

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now() + clock.current, rand: Math.random }));
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
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, clean, avatar, Date.now(), loadDeck()));
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
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: clean, avatar, deck: loadDeck() }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Arena Royale.'); return; }
      if (!findPlayer(result.room, playerId)) { setError(result.room.phase === 'lobby' ? 'La sala está llena.' : 'La partida ya empezó: no se puede entrar a mitad de juego.'); return; }
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
    if (leaving) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
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

  const banner = error && <p className="ar-error ar-banner" role="alert">{error}</p>;

  if (!session) return <>{banner}<Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} /></>;
  if (!room) return <div className="cs-root ar-page"><p className="ar-hint ar-msg">Entrando a la sala…</p></div>;
  if (!me || me.left) {
    return (
      <div className="cs-root ar-page">
        <div className="ar-card ar-msg">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {!isKicked(room, session.playerId) && room.phase === 'lobby' && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /><GameChat code={code} me={me} /></>;
  if (room.phase === 'ended') return <><Ended room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /><GameChat code={code} me={me} /></>;
  return <>{banner}<Game key={room.matchN} room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} clock={clock} /><GameChat code={code} me={me} /></>;
}
