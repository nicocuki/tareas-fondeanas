// Monopoly: entrada, sala de espera, partida y final.
import React, { useEffect, useMemo, useState } from 'react';
import { backgroundTimeout } from '../ticker.js';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import { isKicked } from '../lobby/kick.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import {
  GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, auctionChance, cleanName, findPlayer, makeId, netWorth, newRoom, ownedBy, roomFromSave,
} from './game.js';
import Board, { Token } from './Board.jsx';
import ActionPanel from './ActionPanel.jsx';
import { LogPanel, PlayersPanel, PropertiesPanel, RulesPanel } from './Panels.jsx';
import {
  AuctionModal, CardToast, DeedModal, TradeComposer, TradeIncoming,
} from './Modals.jsx';
import { describe } from './log.js';
import { BOT_NAMES, botMove } from './bots.js';
import { Announcer, DiceRoll, useStagedRoom } from './Stage.jsx';
import { deleteSave, describeSave, listSaves, saveGame } from './saves.js';
import { setSound, soundOn } from './sfx.js';
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
function Entry({ onCreate, onJoin, onResume, busy, error, onBack }) {
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
      <SavedGames onResume={onResume} busy={busy} />
    </div>
  );
}

// Las partidas de este dispositivo que se pueden retomar (ver saves.js).
function SavedGames({ onResume, busy }) {
  const [saves, setSaves] = useState(listSaves);
  const [asking, setAsking] = useState(null);
  if (!saves.length) return null;
  const when = (d) => d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mp-card mp-saves" data-saves>
      <div className="mp-card-head"><h2>💾 Partidas guardadas</h2></div>
      <p className="mp-hint">La partida se guarda sola en este dispositivo mientras jugás. Para seguirla se abre una sala nueva y los demás entran con el código.</p>
      <ul>
        {saves.map((save) => {
          const info = describeSave(save);
          return (
            <li key={save.id} data-save={save.id}>
              <div>
                <strong>{info.names.join(' · ')}</strong>
                <small>Turno {info.turn} · {when(info.when)}</small>
              </div>
              <div className="mp-btn-row">
                <button type="button" className="tf-btn tf-btn-primary" disabled={busy} data-act="resume" onClick={() => onResume(save)}>Continuar</button>
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
  const host = room.hostId === me?.id;
  const opts = room.options;
  const set = (patch) => onDispatch({ type: 'setOptions', options: patch });
  const enough = room.players.length >= MIN_PLAYERS;
  const addBot = () => {
    const free = BOT_NAMES.filter((n) => !room.players.some((p) => p.name === n));
    onDispatch({ type: 'addBot', botId: `bot-${makeId().slice(0, 6)}`, name: free[0] || 'Bot' });
  };
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
              <small>{p.bot ? '🤖 bot' : p.id === room.hostId ? '👑 anfitrión' : p.id === me?.id ? 'vos' : ''}{p.wins ? ` · 🏆 ${p.wins}` : ''}</small>
            </li>
          ))}
        </ul>
        {host && (
          <div className="mp-btn-row mp-bots">
            <button type="button" className="tf-btn tf-btn-soft" disabled={room.players.length >= MAX_PLAYERS} data-act="addBot" onClick={addBot}>🤖 Agregar un bot</button>
            {room.players.some((p) => p.bot) && <small>Los bots juegan solos. Para sacar uno, usá «Sacar a alguien».</small>}
          </div>
        )}
        <p className="mp-hint">Se juega de 2 a {MAX_PLAYERS}. El orden de los turnos se sortea al empezar.</p>
      </div>

      <LobbyOptions canEdit={host}>
        <OptionField title="Plata inicial" hint="Lo que recibe cada jugador al empezar. En el juego clásico son $1500.">
          <Segmented name="startCash" value={opts.startCash} disabled={!host} onChange={(v) => set({ startCash: v })} choices={[1000, 1500, 2000, 3000].map((n) => ({ value: n, label: `$${n}` }))} />
        </OptionField>
        <OptionField title="Chances de subasta" hint={opts.auctionChance === 100 ? 'Si el que cae en una propiedad no la compra, siempre se subasta entre todos (como en el juego clásico).' : opts.auctionChance === 0 ? 'Si el que cae en una propiedad no la compra, queda sin dueño hasta que otro caiga.' : `Si el que cae en una propiedad no la compra, hay un ${opts.auctionChance} % de chances de que se subaste. Si no sale, queda sin dueño.`}>
          <Segmented name="auctionChance" value={auctionChance(room)} disabled={!host} onChange={(v) => set({ auctionChance: v })} choices={[0, 25, 50, 75, 100].map((n) => ({ value: n, label: n === 0 ? 'Nunca' : n === 100 ? 'Siempre' : `${n} %` }))} />
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

// ─── Retomar una partida guardada ────────────────────────────────────────────
// La sala nueva (fase `resume`) tiene a todos los jugadores de la partida guardada, pero nadie sentado: cada uno que
// entra elige quién era, y el anfitrión retoma cuando están los que van a jugar.
function Resume({ room, me, code, onDispatch, onLeave, onCopy, copied, onClaim }) {
  const host = room.hostId === me?.id;
  const seats = room.players.filter((p) => !p.out);
  const seated = seats.filter((p) => p.by);
  const gone = room.players.filter((p) => p.out);
  const free = seats.length - seated.length;
  return (
    <LobbyLayout
      code={code}
      roster={seated}
      me={me?.id}
      onKick={(id) => onDispatch({ type: 'kick', target: id })}
      host={host}
      players={seated.length}
      gameTitle="Monopoly · partida guardada"
      subtitle={me ? (host ? 'Cuando estén todos sentados, retomá la partida.' : 'Esperando que el anfitrión retome la partida.') : 'Elegí quién eras vos en esta partida.'}
      copied={copied}
      onCopyInvite={onCopy}
      onLeave={onLeave}
    >
      <div className="mp-card" data-seats>
        <div className="mp-card-head">
          <h2>Quién es quién</h2>
          <span>{seated.length} / {seats.length}</span>
        </div>
        <ul className="mp-seats">
          {seats.map((p) => (
            <li key={p.id} className={p.by ? 'is-taken' : ''} data-seat={p.name}>
              <Token player={p} size={40} />
              <div>
                <strong>{p.name}</strong>
                <small>{`$${p.cash} · ${ownedBy(room, p.id).length} propiedad${ownedBy(room, p.id).length === 1 ? '' : 'es'}`}</small>
              </div>
              {p.by
                ? <span className="mp-seat-state">{p.id === me?.id ? '✓ vos' : '✓ sentado'}</span>
                : !me && <button type="button" className="tf-btn tf-btn-primary" data-act="claim" onClick={() => onClaim(p.id)}>Soy {p.name}</button>}
              {!p.by && me && <span className="mp-seat-state">libre</span>}
            </li>
          ))}
        </ul>
        {gone.length > 0 && <p className="mp-hint">Ya no juegan (quebraron o se fueron): {gone.map((p) => p.name).join(', ')}.</p>}
      </div>
      <div className="mp-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary mp-start-btn" disabled={seated.length < MIN_PLAYERS} data-act="resumeStart" onClick={() => onDispatch({ type: 'resumeStart' })}>
            ▶️ Retomar la partida
          </button>
        ) : me ? <p>Esperando que el anfitrión retome la partida…</p> : null}
        {host && seated.length < MIN_PLAYERS && <p className="mp-hint">Hacen falta al menos {MIN_PLAYERS} jugadores sentados. Pasales el código.</p>}
        {host && free > 0 && seated.length >= MIN_PLAYERS && <p className="mp-hint">Los {free} lugar{free === 1 ? '' : 'es'} que nadie tome quiebran contra el banco al retomar.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Partida ─────────────────────────────────────────────────────────────────
function Game({ room: live, me: liveMe, onDispatch, onLeave }) {
  const wide = useWide();
  const { shown: room, stage } = useStagedRoom(live); // lo que se ve va un paso atrás de la sala mientras ruedan los dados
  const me = findPlayer(room, liveMe.id) || liveMe;
  const [deed, setDeed] = useState(null);
  const [composer, setComposer] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [flash, setFlash] = useState(null);
  const [sound, setSoundOn] = useState(soundOn);
  const host = room.hostId === me?.id;
  const myTurn = Boolean(me) && room.current === me.id && !me.out;

  // El título de la pestaña avisa cuando te toca.
  useEffect(() => {
    if (!myTurn) return undefined;
    const before = document.title;
    document.title = `🎲 ¡Tu turno! · ${before}`;
    return () => { document.title = before; };
  }, [myTurn]);

  // El anfitrión juega por los bots: cuando les toca, espera un momento (para que se vea) y manda la jugada.
  useEffect(() => {
    if (!host || stage) return undefined;
    const move = botMove(live);
    if (!move) return undefined;
    return backgroundTimeout(() => onDispatch(move.action, move.botId), 1100);
  }, [live, stage, host]); // eslint-disable-line react-hooks/exhaustive-deps

  // El casillero del último aviso se ilumina un momento.
  useEffect(() => {
    if (flash === null) return undefined;
    return backgroundTimeout(() => setFlash(null), 1800);
  }, [flash]);

  const recent = room.log.filter((e) => e.k !== 'at').slice(-3).map((e) => describe(e, room)).filter((e) => e.text);
  const action = <ActionPanel room={room} me={me} dispatch={onDispatch} onTrade={() => setComposer({})} busy={Boolean(stage)} />;

  return (
    <div className="cs-root mp-page mp-playing">
      <div className="mp-layout">
        <div className="mp-board-col">
          <Board room={room} onPick={setDeed} selected={deed} flash={flash}>
            <div className="mp-center-inner">
              <h1 className="mp-logo" aria-hidden="true">MONOPOLY</h1>
              <button type="button" className="mp-sound" aria-pressed={sound} data-act="sound" onClick={() => { setSound(!sound); setSoundOn(!sound); }}>
                {sound ? '🔊 Sonido' : '🔇 Sin sonido'}
              </button>
              {room.options.freeParking && <p className="mp-pot">🅿️ Pozo del Descanso: <b>${room.pot}</b></p>}
              {wide && action}
              {wide && recent.length > 0 && (
                <ul className="mp-recent" aria-label="Lo último que pasó">
                  {recent.map((e, i) => <li key={i}><span aria-hidden="true">{e.icon}</span> {e.text}</li>)}
                </ul>
              )}
            </div>
          </Board>
          {stage?.phase === 'dice' && <DiceRoll stage={stage} room={room} meId={me.id} />}
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
            <p className="mp-hint mp-saved-note">💾 La partida se guarda sola en este dispositivo: si se cierra la sala, la retomás desde la entrada.</p>
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

      <Announcer room={room} meId={me.id} onSquare={setFlash} />
      {room.auction && me && <AuctionModal room={room} me={me} dispatch={onDispatch} />}
      {!room.auction && room.trade?.to === me?.id && !me.out && <TradeIncoming room={room} me={me} dispatch={onDispatch} />}
      {composer && me && !me.out && !room.auction && <TradeComposer room={room} me={me} initialTo={composer.to} onClose={() => setComposer(null)} dispatch={onDispatch} />}
      {deed !== null && !room.auction && <DeedModal room={room} me={me} pos={deed} onClose={() => setDeed(null)} dispatch={onDispatch} />}
    </div>
  );
}

// Papelitos que caen al terminar la partida (solo dibujo).
const CONFETTI_COLORS = ['#e5484d', '#3b82f6', '#f5b82e', '#2fbf71', '#a855f7', '#f97316'];
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.6, dur: 2.6 + Math.random() * 2, size: 6 + Math.random() * 7, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], spin: Math.random() * 720 - 360,
  })), []);
  return (
    <div className="mp-confetti" aria-hidden="true">
      {pieces.map((c, i) => <i key={i} style={{ left: `${c.left}%`, width: c.size, height: c.size * 0.45, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, '--spin': `${c.spin}deg` }} />)}
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
      <Confetti />
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

  // La partida se guarda en este dispositivo en cada cambio y se borra cuando termina.
  useEffect(() => {
    if (!room?.saveId || !me) return;
    if (room.phase === 'playing') saveGame(room, me.id);
    else if (room.phase === 'ended') deleteSave(room.saveId);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  // `asId`: el anfitrión juega por un bot mandando la jugada con el id de ese bot.
  async function dispatch(action, asId) {
    if (!session) return null;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: asId ?? session.playerId }, { now: Date.now(), rand: Math.random }));
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
      if (result.room.phase === 'resume' && !findPlayer(result.room, playerId)) { // entra mirando y elige su lugar
        enterRoom({ code: target, playerId, name: clean });
        return;
      }
      if (!findPlayer(result.room, playerId)) { setError(result.room.phase === 'lobby' ? 'La sala está llena.' : 'La partida ya empezó: no se puede entrar a mitad de juego.'); return; }
      enterRoom({ code: target, playerId, name: clean });
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
      const { room: restored, seatId } = roomFromSave(save.room, save.seat);
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

  if (!session) return <>{banner}<Entry onCreate={handleCreate} onJoin={handleJoin} onResume={handleResume} busy={busy} error={error} onBack={onBackToMenu} /></>;
  if (!room) return <div className="cs-root mp-page"><p className="mp-hint mp-msg">Entrando a la sala…</p></div>;
  if (room.phase === 'resume') return <>{banner}<Resume room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} onClaim={handleClaim} /></>;
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
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /><GameChat code={code} me={me} /></>;
  if (room.phase === 'ended') return <><Ended room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /><GameChat code={code} me={me} /></>;
  return <>{banner}<Game room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /><GameChat code={code} me={me} /></>;
}
