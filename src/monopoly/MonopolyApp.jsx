// Monopoly: entrada, sala de espera, partida y final.
import React, { useEffect, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import { isKicked } from '../lobby/kick.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { gameUrl } from '../ui/games.js';
import {
  GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, cleanName, findPlayer, makeId, netWorth, newRoom,
} from './game.js';
import Board, { Token } from './Board.jsx';
import ActionPanel from './ActionPanel.jsx';
import { LogPanel, PlayersPanel, PropertiesPanel, RulesPanel } from './Panels.jsx';
import {
  AuctionModal, CardToast, DeedModal, TradeComposer, TradeIncoming,
} from './Modals.jsx';
import { describe } from './log.js';
import './monopoly.css';

const GAME = 'monopoly';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
function setUrlCode(code) {
  window.history.replaceState(null, '', gameUrl(GAME, code));
}

function useWide() {
  const query = '(min-width: 860px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
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
      <div className="cs-root mp-page">
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
    <div className="cs-root mp-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="mp-card mp-entry">
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
        {error && <p className="mp-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>
          Crear sala
        </button>
        <div className="mp-or"><span>o entrá con un código</span></div>
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
      roster={room.players}
      me={me?.id}
      onKick={(id) => onDispatch({ type: 'kick', target: id })}
      host={host}
      players={room.players.length}
      gameTitle="Monopoly · sala de espera"
      subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'}
      copied={copied}
      onCopyInvite={onCopy}
      onLeave={onLeave}
    >
      <div className="mp-card">
        <div className="mp-card-head">
          <h2>Jugadores</h2>
          <span>{room.players.length} / {MAX_PLAYERS}</span>
        </div>
        <ul className="mp-lobby-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}>
              <Token player={p} size={44} />
              <strong>{p.name}</strong>
              <small>{p.id === room.hostId ? '👑 anfitrión' : p.id === me?.id ? 'vos' : ''}{p.wins ? ` · 🏆 ${p.wins}` : ''}</small>
            </li>
          ))}
        </ul>
        <p className="mp-hint">Se juega de 2 a {MAX_PLAYERS}. El orden de los turnos se sortea al empezar.</p>
      </div>

      <LobbyOptions canEdit={host}>
        <OptionField title="Plata inicial" hint="Lo que recibe cada jugador al empezar. En el juego clásico son $1500.">
          <Segmented name="startCash" value={opts.startCash} disabled={!host} onChange={(v) => set({ startCash: v })} choices={[1000, 1500, 2000, 3000].map((n) => ({ value: n, label: `$${n}` }))} />
        </OptionField>
        <OptionField title="Subastas" hint={opts.auctions ? 'Si el que cae en una propiedad no la compra, se subasta entre todos (como en el juego clásico).' : 'Si el que cae en una propiedad no la compra, queda sin dueño hasta que otro caiga.'}>
          <Segmented name="auctions" value={opts.auctions} disabled={!host} onChange={(v) => set({ auctions: v })} choices={[{ value: true, label: 'Con subastas' }, { value: false, label: 'Sin subastas' }]} />
        </OptionField>
        <OptionField title="Pozo del Descanso" hint={opts.freeParking ? 'Los impuestos y las multas se juntan en el Descanso. Quien caiga ahí se lleva todo el pozo.' : 'Los impuestos y las multas van al banco y el Descanso no da nada (reglas oficiales).'}>
          <Segmented name="freeParking" value={opts.freeParking} disabled={!host} onChange={(v) => set({ freeParking: v })} choices={[{ value: false, label: 'Sin pozo (oficial)' }, { value: true, label: 'Con pozo' }]} />
        </OptionField>
      </LobbyOptions>

      <div className="mp-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary mp-start-btn" disabled={!enough} data-act="start" onClick={() => onDispatch({ type: 'start' })}>
            🎩 Empezar la partida
          </button>
        ) : (
          <p>Esperando que el anfitrión arranque…</p>
        )}
        {!enough && <p className="mp-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Partida ─────────────────────────────────────────────────────────────────
function Game({ room, me, onDispatch, onLeave }) {
  const wide = useWide();
  const [deed, setDeed] = useState(null);
  const [composer, setComposer] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const host = room.hostId === me?.id;
  const myTurn = Boolean(me) && room.current === me.id && !me.out;

  // El título de la pestaña avisa cuando te toca.
  useEffect(() => {
    if (!myTurn) return undefined;
    const before = document.title;
    document.title = `🎲 ¡Tu turno! · ${before}`;
    return () => { document.title = before; };
  }, [myTurn]);

  const recent = room.log.slice(-3).map((e) => describe(e, room)).filter((e) => e.text);
  const action = <ActionPanel room={room} me={me} dispatch={onDispatch} onTrade={() => setComposer({})} />;

  return (
    <div className="cs-root mp-page mp-playing">
      <div className="mp-layout">
        <div className="mp-board-col">
          <Board room={room} onPick={setDeed} selected={deed}>
            <div className="mp-center-inner">
              <h1 className="mp-logo" aria-hidden="true">MONOPOLY</h1>
              {room.options.freeParking && <p className="mp-pot">🅿️ Pozo del Descanso: <b>${room.pot}</b></p>}
              {wide && action}
              {wide && recent.length > 0 && (
                <ul className="mp-recent" aria-label="Lo último que pasó">
                  {recent.map((e, i) => <li key={i}><span aria-hidden="true">{e.icon}</span> {e.text}</li>)}
                </ul>
              )}
            </div>
          </Board>
          <CardToast room={room} />
          {!wide && <div className="mp-dock">{action}<p className="mp-hint">Tocá un casillero para ver su ficha: precio, alquileres y de quién es.</p>{recent.length > 0 && (
            <ul className="mp-recent" aria-label="Lo último que pasó">
              {recent.map((e, i) => <li key={i}><span aria-hidden="true">{e.icon}</span> {e.text}</li>)}
            </ul>
          )}</div>}
        </div>

        <div className="mp-side-col">
          <PlayersPanel room={room} me={me} onPick={setDeed} onTrade={(id) => setComposer({ to: id })} onKick={(id) => onDispatch({ type: 'kick', target: id })} />
          <PropertiesPanel room={room} me={me} dispatch={onDispatch} onPick={setDeed} />
          <LogPanel room={room} />
          <RulesPanel />
          <div className="mp-leave">
            {host && !confirmEnd && <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirmEnd(true)}>Terminar la partida</button>}
            {host && confirmEnd && (
              <>
                <button type="button" className="tf-btn tf-btn-danger" data-act="toLobby" onClick={() => onDispatch({ type: 'toLobby' })}>Sí, volver a la sala de espera</button>
                <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirmEnd(false)}>No</button>
              </>
            )}
            <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir de la partida</button>
          </div>
        </div>
      </div>

      {room.auction && me && <AuctionModal room={room} me={me} dispatch={onDispatch} />}
      {!room.auction && room.trade?.to === me?.id && !me.out && <TradeIncoming room={room} me={me} dispatch={onDispatch} />}
      {composer && me && !me.out && !room.auction && <TradeComposer room={room} me={me} initialTo={composer.to} onClose={() => setComposer(null)} dispatch={onDispatch} />}
      {deed !== null && !room.auction && <DeedModal room={room} me={me} pos={deed} onClose={() => setDeed(null)} dispatch={onDispatch} />}
    </div>
  );
}

// ─── Fin ─────────────────────────────────────────────────────────────────────
function Ended({ room, me, onDispatch, onLeave }) {
  const winner = findPlayer(room, room.winner);
  const host = room.hostId === me?.id;
  const order = [room.winner, ...[...room.eliminated].reverse()].filter(Boolean);
  const ranking = order.map((id) => findPlayer(room, id)).filter(Boolean);
  return (
    <div className="cs-root mp-page">
      <div className="mp-card mp-ended">
        <div className="mp-winner-token">{winner ? <Token player={winner} size={84} /> : '🏳️'}</div>
        <p className="tf-eyebrow">Fin de la partida</p>
        <h1>{winner ? (winner.id === me?.id ? '¡Ganaste!' : `¡Ganó ${winner.name}!`) : 'Nadie ganó'}</h1>
        <p className="mp-hint">Se quedó con todo el tablero: los demás quebraron o se fueron.</p>
        <ol className="mp-ranking">
          {ranking.map((p, i) => (
            <li key={p.id}>
              <span>{i + 1}.º <Token player={p} size={24} /> {p.name}</span>
              <strong>{p.out ? (p.left ? 'se fue' : 'quebró') : `patrimonio $${netWorth(room, p.id)}`}</strong>
            </li>
          ))}
        </ol>
        <div className="mp-ended-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" data-act="start" onClick={() => onDispatch({ type: 'start' })}>🎩 Otra partida</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="mp-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function MonopolyApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);

  useRegisterRoom(GAME, code, () => handleLeave());

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
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now(), rand: Math.random }));
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
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de Monopoly.'); return; }
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

  const banner = error && <p className="mp-error mp-banner" role="alert">{error}</p>;

  if (!session) return <>{banner}<Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} /></>;
  if (!room) return <div className="cs-root mp-page"><p className="mp-hint mp-msg">Entrando a la sala…</p></div>;
  if (!me || me.left) {
    return (
      <div className="cs-root mp-page">
        <div className="mp-card mp-msg">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {!isKicked(room, session.playerId) && room.phase === 'lobby' && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /></>;
  if (room.phase === 'ended') return <Ended room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} />;
  return <>{banner}<Game room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /></>;
}
