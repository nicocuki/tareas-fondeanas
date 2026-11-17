// Fondo Kart: entrada, sala de espera, votación de pista, carrera y resultados.
//   `?juego=kart`                       → esta compu crea o se une a una carrera.
//   `?juego=kart&sala=ABCD`             → link de invitación: esta compu se une (online).
//   `?juego=kart&volante=ABCD`          → este celular es un volante en el modo local (entra a la sala como jugador).
//   `?juego=kart&volante=ABCD&de=ID`    → este celular es el volante de la compu ID (online; no entra a la sala).
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { backgroundInterval } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import GameHero from '../ui/GameHero.jsx';
import { getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { isKicked } from '../lobby/kick.js';
import { PublicSwitch } from '../lobby/PublicRoom.jsx';
import SkinPicker, { SkinFace } from '../wii/SkinPicker.jsx';
import { skinById } from '../wii/skins.js';
import { GAME_TYPE, MAX_LOCAL, MAX_PLAYERS, applyAction, cleanName, findPlayer, makeId, newRoom, racersFor, startProblem } from './game.js';
import { TRACKS } from './tracks.js';
import KartRace, { MEDAL, fmtTime } from './KartRace.jsx';
import KartPad from './KartPad.jsx';
import './kart.css';

const GAME = 'kart';
const clean = (v) => (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const params = () => new URLSearchParams(window.location.search);
const urlPad = () => clean(params().get('volante'));
const urlFor = () => params().get('de') || '';
const urlRoom = () => clean(params().get('sala'));
function setUrl(code, role, de) {
  const url = new URL(window.location.origin + '/');
  url.searchParams.set('juego', GAME);
  if (code) url.searchParams.set(role === 'pad' ? 'volante' : 'sala', code);
  if (role === 'pad' && de) url.searchParams.set('de', de);
  window.history.replaceState(null, '', url.toString());
}
export const padUrl = (code, de) => `${window.location.origin}/?juego=kart&volante=${code}${de ? `&de=${de}` : ''}`;
const TRACK_BG = { pradera: '#5cb04a', playa: '#3fb4e0', desierto: '#e0a35a', nieve: '#9fc6ef', lava: '#b8401a', ciudad: '#3b2f8a', espacio: '#1a1240' };

// ─── Los celulares de esta compu ────────────────────────────────────────────
// Escucha a los volantes (kartpad/{sala}/{esta compu}) y les manda cómo van. `current`: id del jugador → lo que aprieta.
function usePadHub(code, screenId, active) {
  const hub = useRef(null);
  if (!hub.current) hub.current = { current: new Map(), out: {}, send(id, msg) { this.out[id] = { ...msg, to: id }; } };
  const [phones, setPhones] = useState([]);
  useEffect(() => {
    if (!active || !code || !screenId) return undefined;
    const h = hub.current;
    const chan = backend.kartPadChannel(code, screenId);
    const onMsg = (from, raw) => {
      if (from === screenId || !raw) return;
      let m = raw;
      if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
      if (!m.p) return;
      h.current.set(m.p, { s: Number(m.s) || 0, a: Boolean(m.a), b: Boolean(m.b), d: Boolean(m.d), r: Boolean(m.r), i: Number(m.i) || 0, at: performance.now() });
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: screenId, onMessage: onMsg });
    const off = chan.subscribe(onMsg);
    h.mesh = mesh;
    window.__kartPads = h; // para manejar los volantes desde un navegador automatizado
    let serverAt = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      for (const [id, msg] of Object.entries(h.out)) mesh?.broadcast(msg);
      if (now - serverAt > 400 && Object.keys(h.out).length) { serverAt = now; chan.publish(screenId, JSON.stringify({ all: h.out })).catch(() => {}); }
      setPhones((prev) => { const live = [...h.current].filter(([, v]) => now - v.at < 2500).map(([id]) => id).sort(); return live.join() === prev.join() ? prev : live; });
    }, 250);
    return () => { clearInterval(timer); off(); mesh?.close(); chan.remove(screenId).catch(() => {}); };
  }, [code, screenId, active]);
  return [hub.current, phones];
}

function useQr(url) {
  const [qr, setQr] = useState('');
  useEffect(() => { if (url) QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr).catch(() => setQr('')); }, [url]);
  return qr;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack, initialCode }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [code, setCode] = useState(initialCode);
  return (
    <div className="cs-root kt-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="kt-card">
        <label className="tf-field"><span>Tu nombre</span><input className="tf-input" value={name} maxLength={16} placeholder="¿Cómo te llamás?" onChange={(e) => setName(e.target.value)} /></label>
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { setProfile({ name }); onCreate(name); }} data-create>🏁 Crear una carrera</button>
        <div className="kt-or"><span>o unite con el código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); setProfile({ name }); onJoin(code, name); }}>
          <input className="tf-input tf-code-input" aria-label="Código de la carrera" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(clean(e.target.value))} data-code-input />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)} data-join>Entrar</button>
        </form>
        {error && <p className="kt-error" role="alert">{error}</p>}
        <p className="kt-small">En el online cada uno juega en su compu, con el teclado o con el celular como volante. En el local se juega todo en una compu (o la tele) con la pantalla partida, y cada uno maneja con su celular.</p>
      </div>
    </div>
  );
}

// ─── Votación ────────────────────────────────────────────────────────────────
export function VoteGrid({ room, myVote, onVote, compact = false, serverNow }) {
  const left = Math.max(0, Math.ceil((room.vote.endsAt - serverNow) / 1000));
  const votesFor = (i) => Object.entries(room.vote.votes).filter(([, v]) => v === i).map(([id]) => findPlayer(room, id)).filter(Boolean);
  return (
    <div className={`kt-vote${compact ? ' is-compact' : ''}`} data-vote>
      <h2>¿En qué pista corremos? <span className="kt-timer" data-vote-left>{left}</span></h2>
      <div className="kt-tiles">
        {[...TRACKS, null].map((t, i) => (
          <button key={i} type="button" className={`kt-tile${myVote === i ? ' is-on' : ''}${t ? '' : ' is-random'}`} style={{ '--bg': t ? TRACK_BG[t.theme] : '#222' }} disabled={!onVote} onClick={() => onVote?.(i)} data-pick={i}>
            <span className="kt-tile-emoji">{t ? t.emoji : '❓'}</span>
            <b>{t ? t.name : 'Al azar'}</b>
            <span className="kt-tile-votes">{votesFor(i).map((p) => <SkinFace key={p.id} skin={skinById(p.skin)} size={compact ? 18 : 24} />)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Results({ room, me, onDispatch, onLeave }) {
  const res = room.results;
  const racers = room.race?.racers || [];
  const host = room.hostId === me.id;
  return (
    <div className="kt-results" data-results>
      <h2>🏁 Resultados · {TRACKS[res.track].name}</h2>
      <ol>
        {res.order.map((o, i) => {
          const r = racers.find((x) => x.id === o.id);
          if (!r) return null;
          return (
            <li key={o.id} className={r.screen === me.id && !r.bot ? 'is-me' : ''} data-place={i + 1}>
              <span className="kt-place">{MEDAL[i] || `${i + 1}°`}</span>
              <SkinFace skin={skinById(r.skin)} size={34} />
              <b>{r.name}{r.bot ? ' 🤖' : ''}</b>
              <em>{o.ms != null ? fmtTime(o.ms / 1000) : 'no llegó'}</em>
            </li>
          );
        })}
      </ol>
      <div className="kt-actions">
        {host && <button type="button" className="tf-btn tf-btn-primary" onClick={() => onDispatch({ type: 'start' })} data-again>🏎️ Otra carrera</button>}
        {host && <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Volver a la sala</button>}
        {!host && <p className="kt-small">El anfitrión elige si corren otra.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    </div>
  );
}

// ─── Sala de espera (en una compu) ──────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, phones }) {
  const host = room.hostId === me.id;
  const local = room.options.mode === 'local';
  const mine = findPlayer(room, me.id);
  const [copied, setCopied] = useState(false);
  const qr = useQr(local ? padUrl(code) : mine?.ctrl === 'phone' ? padUrl(code, me.id) : '');
  const problem = startProblem(room);
  const racers = racersFor(room);
  const opt = (key, value, label) => <button key={String(value)} type="button" className={room.options[key] === value ? 'is-on' : ''} disabled={!host} onClick={() => onDispatch({ type: 'setOptions', options: { [key]: value } })} data-opt={`${key}:${value}`}>{label}</button>;
  const link = `${window.location.origin}/?juego=kart&sala=${code}`;
  return (
    <div className="cs-root kt-page kt-lobby" data-lobby>
      <div className="kt-lobby-head">
        <h1>🏎️ Fondo Kart</h1>
        <div className="kt-code">Código <b data-code>{code}</b>
          {!local && <PublicSwitch code={code} host={host} players={room.players.length} />}
          {!local && <button type="button" className="tf-btn tf-btn-soft" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '¡Copiado!' : 'Copiar link'}</button>}
        </div>
      </div>
      <div className="kt-lobby-grid">
        <section className="kt-card">
          <h2>Carrera</h2>
          <div className="kt-seg" role="group" aria-label="Modo">{opt('mode', 'online', '🌐 Online (cada uno en su compu)')}{opt('mode', 'local', '📺 Local (una compu, celulares)')}</div>
          <div className="kt-seg" role="group" aria-label="Ítems">{opt('items', true, '🍄 Con ítems')}{opt('items', false, 'Sin ítems')}</div>
          <div className="kt-seg" role="group" aria-label="Bots">{opt('bots', true, `🤖 Rellenar con bots (${racers.length} corredores)`)}{opt('bots', false, 'Sin bots')}</div>
          <div className="kt-seg" role="group" aria-label="Cilindrada">{opt('cc', 50, '50cc')}{opt('cc', 100, '100cc')}{opt('cc', 150, '150cc')}</div>
          {!host && <p className="kt-small">El anfitrión elige las opciones.</p>}
          <h2>Corredores</h2>
          <ul className="kt-players" data-players>
            {room.players.map((p) => (
              <li key={p.id} data-player={p.id}>
                <SkinFace skin={skinById(p.skin)} size={30} />
                <b>{p.name}</b>
                <small>{p.ctrl === 'phone' ? (phones.includes(p.id) || p.screen !== me.id ? '📱 celular' : '📱 sin conectar') : '⌨️ teclado'}{p.id === room.hostId ? ' · anfitrión' : ''}{p.id === me.id ? ' · vos' : ''}</small>
                {host && p.id !== me.id && <button type="button" className="kt-kick" title="Sacar" onClick={() => onDispatch({ type: 'kick', target: p.id })}>🚫</button>}
              </li>
            ))}
            {racers.filter((r) => r.bot).map((r) => <li key={r.id} className="is-bot"><SkinFace skin={skinById(r.skin)} size={30} /><b>{r.name}</b><small>🤖 bot</small></li>)}
          </ul>
        </section>
        <section className="kt-card">
          {local ? (
            <>
              <h2>Conectá los celulares</h2>
              <div className="kt-connect">
                {qr ? <img src={qr} alt="QR para usar el celular de volante" className="kt-qr" data-qr /> : <div className="kt-qr" />}
                <div>
                  <p>Escaneá con la cámara del celular, o entrá a <b>{window.location.host}</b>, Fondo Kart, y escribí:</p>
                  <p className="kt-bigcode">{code}</p>
                  <p className="kt-small">Hasta {MAX_LOCAL} en la pantalla partida. Cada uno elige su personaje en el celular.</p>
                </div>
              </div>
              {host && <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'hostKeys', name: getProfile().name })} data-host-keys>{mine ? 'Dejar de jugar con el teclado' : '⌨️ Jugar yo también con el teclado'}</button>}
              {mine && <><h2>Tu personaje</h2><SkinPicker value={mine.skin} taken={room.players.map((p) => p.skin)} onPick={(skin) => onDispatch({ type: 'setSkin', skin })} /></>}
            </>
          ) : mine && (
            <>
              <h2>Tu personaje</h2>
              <SkinPicker value={mine.skin} taken={room.players.map((p) => p.skin)} onPick={(skin) => onDispatch({ type: 'setSkin', skin })} />
              <h2>¿Cómo manejás?</h2>
              <div className="kt-seg" role="group" aria-label="Control">
                <button type="button" className={mine.ctrl === 'keys' ? 'is-on' : ''} onClick={() => onDispatch({ type: 'setCtrl', ctrl: 'keys' })} data-ctrl="keys">⌨️ Teclado</button>
                <button type="button" className={mine.ctrl === 'phone' ? 'is-on' : ''} onClick={() => onDispatch({ type: 'setCtrl', ctrl: 'phone' })} data-ctrl="phone">📱 Celular de volante</button>
              </div>
              {mine.ctrl === 'phone' ? (
                <div className="kt-connect">
                  {qr ? <img src={qr} alt="QR para usar el celular de volante" className="kt-qr" data-qr /> : <div className="kt-qr" />}
                  <p>Escaneá el QR con tu celular. {phones.includes(me.id) ? <b>✅ Conectado.</b> : <b>Todavía no se conectó.</b>} El teclado sigue andando.</p>
                </div>
              ) : <Keys />}
            </>
          )}
        </section>
      </div>
      <div className="kt-actions">
        {host && <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })} data-start>🏁 ¡A correr! (votar la pista)</button>}
        {!host && <p className="kt-small">Esperando que el anfitrión arranque.</p>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>{host ? 'Cerrar la carrera' : 'Salir'}</button>
      </div>
      {host && problem && <p className="kt-small">{problem}</p>}
    </div>
  );
}

function Keys() {
  return (
    <ul className="kt-keys">
      <li><kbd>W</kbd>/<kbd>↑</kbd> acelerar</li>
      <li><kbd>S</kbd>/<kbd>↓</kbd> frenar y marcha atrás</li>
      <li><kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> doblar</li>
      <li><kbd>Espacio</kbd> o <kbd>Shift</kbd> saltar y derrapar</li>
      <li><kbd>E</kbd> o <kbd>Ctrl</kbd> usar el ítem</li>
      <li><kbd>Q</kbd> mirar para atrás (y el ítem sale para atrás)</li>
    </ul>
  );
}

// ─── El celular (volante) ────────────────────────────────────────────────────
function PadScreen({ session, room, onDispatch, onLeave, serverNow }) {
  const local = !session.de;
  const me = local ? findPlayer(room, session.playerId) : null;
  const screenId = local ? room?.hostId : session.de;
  if (local && room && !me) {
    return (
      <div className="kp-root kp-setup"><p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la carrera.' : 'Este volante ya no está en la carrera.'}</p><button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button></div>
    );
  }
  if (!screenId) return <div className="kp-root kp-setup"><p>Conectando…</p></div>;
  const owner = !local && room ? findPlayer(room, session.de) : null;
  return (
    <>
      <KartPad code={session.code} screenId={screenId} playerId={local ? session.playerId : session.de} name={local ? me?.name : owner?.name || 'tu compu'} onLeave={onLeave}>
        {local && room?.phase === 'lobby' && me && <SkinPicker compact value={me.skin} taken={room.players.map((p) => p.skin)} onPick={(skin) => onDispatch({ type: 'setSkin', skin })} />}
        {room?.phase === 'results' && <p className="kp-result">Terminó la carrera: mirá la compu.</p>}
      </KartPad>
      {local && room?.phase === 'vote' && me && <div className="kp-vote-layer"><VoteGrid room={room} compact myVote={room.vote.votes[me.id]} onVote={(pick) => onDispatch({ type: 'vote', n: room.vote.n, pick })} serverNow={serverNow} /></div>}
    </>
  );
}

// ─── La app ──────────────────────────────────────────────────────────────────
export default function KartApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => {
    const pad = urlPad();
    if (pad) {
      const de = urlFor();
      if (de) return { code: pad, playerId: `${de}-v`, de, name: '', role: 'pad', game: GAME };
      const s = loadSession(pad, GAME); return s?.role === 'pad' ? s : null;
    }
    return loadSession(urlRoom(), GAME);
  });
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [, force] = useState(0);
  const code = session?.code;
  const screen = session && session.role !== 'pad';
  const [hub, phones] = usePadHub(code, session?.playerId, Boolean(screen && room));

  useRegisterRoom(GAME, screen ? code : null, () => handleLeave());
  useEffect(() => backend.subscribeServerOffset(setOffset), []);

  useEffect(() => {
    if (!code) return undefined;
    return backend.subscribeRoom(code, (data) => {
      if (data && data.gameType === GAME_TYPE) { setRoom(data); return; }
      clearSession(); setUrl('', ''); setSession(null); setRoom(null);
      setError('Esa carrera ya no existe.');
    }, () => setError('No se pudo conectar con la carrera.'));
  }, [code]);

  // Cierra la votación cuando se acaba el tiempo (cualquier compu; entra una sola).
  const roomRef = useRef(room); roomRef.current = room;
  useEffect(() => {
    if (!screen) return undefined;
    return backgroundInterval(() => {
      const r = roomRef.current; if (!r) return;
      const now = Date.now() + offset;
      if (r.phase === 'vote' && now >= r.vote.endsAt) dispatch({ type: 'tick', n: r.vote.n });
      force((x) => x + 1);
    }, 1000);
  }, [screen, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session?.role === 'pad') { const id = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(id); } return undefined; }, [session?.role]);

  function enter(next) {
    saveSession({ ...next, game: GAME });
    setUrl(next.code, next.role, next.de);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    const pid = session.role === 'pad' && session.de ? session.de : session.playerId;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: pid }, { now: Date.now() + offset, rand: Math.random }));
    } catch {
      setError('No se pudo guardar. Revisá tu conexión.');
      return null;
    }
  }

  async function handleCreate(name) {
    setBusy(true);
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, cleanName(name), getProfile().avatar));
      enter({ code: newCode, playerId, name: cleanName(name), role: 'screen' });
    } catch { setError('No se pudo crear la carrera. Probá de nuevo.'); } finally { setBusy(false); }
  }

  async function join(target, name, role) {
    setBusy(true);
    try {
      const playerId = makeId();
      const res = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: cleanName(name), avatar: getProfile().avatar }, { now: Date.now() + offset }));
      const r = res.room;
      if (!r || r.gameType !== GAME_TYPE) { setError('No encontramos esa carrera. Revisá el código.'); return; }
      if (!findPlayer(r, playerId)) {
        if (isKicked(r, playerId)) setError('El anfitrión te sacó.');
        else if (r.phase !== 'lobby') setError('Esa carrera ya empezó: esperá a que vuelvan a la sala.');
        else if (role === 'screen' && r.options.mode === 'local') setError('Esa carrera es local: se juega en una sola compu, con celulares. Entrá desde el celular.');
        else setError(`La carrera está llena (hasta ${r.options.mode === 'local' ? MAX_LOCAL : MAX_PLAYERS}).`);
        return;
      }
      if (role === 'screen' && r.options.mode === 'local') { setError('Esa carrera es local: entrá desde el celular.'); return; }
      enter({ code: target, playerId, name: cleanName(name), role });
    } catch { setError('No se pudo entrar. Probá de nuevo.'); } finally { setBusy(false); }
  }

  function handleLeave() {
    const leaving = session;
    clearSession(); setUrl('', ''); setSession(null); setRoom(null);
    if (leaving && !(leaving.role === 'pad' && leaving.de)) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
  }

  const serverNow = Date.now() + offset;

  // El celular.
  const padCode = urlPad();
  if (!session && padCode) {
    return <PadJoin code={padCode} busy={busy} error={error} onJoin={(name) => join(padCode, name, 'pad')} onBack={onBackToMenu} />;
  }
  if (!session) return <Entry onCreate={handleCreate} onJoin={(c, n) => join(c, n, 'screen')} busy={busy} error={error} onBack={onBackToMenu} initialCode={urlRoom()} />;
  if (session.role === 'pad') return <PadScreen session={session} room={room} onDispatch={dispatch} onLeave={handleLeave} serverNow={serverNow} />;
  if (!room) return <div className="cs-root kt-page"><p className="kt-small">Conectando…</p></div>;
  const me = { id: session.playerId, name: session.name };
  if (!findPlayer(room, me.id) && room.hostId !== me.id) {
    return <div className="cs-root kt-page"><div className="kt-card"><p>{isKicked(room, me.id) ? 'El anfitrión te sacó de la carrera.' : 'Ya no estás en esta carrera.'}</p><button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button></div></div>;
  }
  if (room.phase === 'vote') {
    const voter = findPlayer(room, me.id);
    return (
      <div className="cs-root kt-page">
        <VoteGrid room={room} myVote={room.vote.votes[me.id]} onVote={voter ? (pick) => dispatch({ type: 'vote', n: room.vote.n, pick }) : null} serverNow={serverNow} />
        {room.options.mode === 'local' && <p className="kt-small kt-center">Voten desde los celulares.</p>}
      </div>
    );
  }
  if (room.phase === 'race' && room.race) return <div className="kt-screen"><KartRace room={room} me={me} code={code} offset={offset} onDispatch={dispatch} pads={hub} />{error && <p className="kt-error kt-banner">{error}</p>}</div>;
  if (room.phase === 'results' && room.results) return <div className="cs-root kt-page"><Results room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /></div>;
  return <Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} phones={phones} />;
}

// Un celular que entra a una carrera local: nombre y listo (el personaje se elige después).
function PadJoin({ code, busy, error, onJoin, onBack }) {
  const [name, setName] = useState(getProfile().name);
  return (
    <div className="kp-root kp-setup" data-pad-join>
      <p className="kp-title">🏎️ Fondo Kart · carrera <b>{code}</b></p>
      <label className="tf-field"><span>Tu nombre</span><input className="tf-input" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="¿Cómo te llamás?" /></label>
      <button type="button" className="kp-arm" disabled={busy || !cleanName(name)} onClick={() => { setProfile({ name }); onJoin(name); }} data-pad-join-btn>Usar este celular de volante</button>
      {error && <p className="kt-error" role="alert">{error}</p>}
      <button type="button" className="tf-btn tf-btn-soft" onClick={onBack}>Volver</button>
    </div>
  );
}
