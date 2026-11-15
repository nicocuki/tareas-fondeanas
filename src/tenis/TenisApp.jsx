// Tenis Movido (prototipo): la compu abre la cancha y los celulares se conectan como controles.
// `?juego=tenis` → abrir la cancha en esta compu. `?juego=tenis&control=ABCD` (lo que trae el QR) o `&sala=ABCD`
// (un link de invitación o una sala pública) → este aparato es un control de esa cancha.
import React, { useEffect, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import GameHero from '../ui/GameHero.jsx';
import { getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { GAME_TYPE, MAX_PLAYERS, applyAction, cleanName, findPlayer, makeId, newRoom } from './game.js';
import TenisScreen from './TenisScreen.jsx';
import TenisControl from './TenisControl.jsx';
import { isKicked } from '../lobby/kick.js';
import './tenis.css';

const GAME = 'tenis';
const clean = (v) => (v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const params = () => new URLSearchParams(window.location.search);
const urlCode = () => clean(params().get('control') || params().get('sala'));
const urlTeam = () => { const t = params().get('equipo'); return t === '0' ? 0 : t === '1' ? 1 : null; };
function setUrl(code, role) {
  const url = new URL(window.location.origin + '/');
  url.searchParams.set('juego', GAME);
  if (code) url.searchParams.set(role === 'control' ? 'control' : 'sala', code);
  window.history.replaceState(null, '', url.toString());
}

function Entry({ onOpen, onJoin, onScreenJoin, busy, error, onBack, initialCode }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [code, setCode] = useState(initialCode);
  const [screenCode, setScreenCode] = useState('');
  const phone = Boolean(initialCode);
  return (
    <div className="cs-root tn-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="tn-card">
        {!phone && (
          <>
            <h2>🖥️ En la compu (o la tele)</h2>
            <p>Abrí la cancha acá: aparece un QR para que se conecten los celulares.</p>
            <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy} onClick={onOpen} data-open>Abrir la cancha en esta pantalla</button>
            <p className="tn-small">¿Juegan online y la cancha ya la abrió el otro equipo? Uní esta compu con su código:</p>
            <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); onScreenJoin(screenCode); }}>
              <input className="tf-input tf-code-input" aria-label="Código de la cancha online" placeholder="ABCD" maxLength={4} value={screenCode} onChange={(e) => setScreenCode(clean(e.target.value))} data-screen-code />
              <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || screenCode.length !== 4} data-screen-join>Unirme con esta compu</button>
            </form>
            <div className="tn-or"><span>o, si estás en el celular</span></div>
          </>
        )}
        <h2>📱 Usar este celular como control</h2>
        <label className="tf-field"><span>Tu nombre</span><input className="tf-input" value={name} maxLength={16} placeholder="¿Cómo te llamás?" onChange={(e) => setName(e.target.value)} /></label>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); setProfile({ name }); onJoin(code, name); }}>
          <input className="tf-input tf-code-input" aria-label="Código de la cancha" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(clean(e.target.value))} />
          <button type="submit" className="tf-btn tf-btn-primary" disabled={busy || code.length !== 4 || !cleanName(name)} data-join>Conectar</button>
        </form>
        {error && <p className="tn-error" role="alert">{error}</p>}
        <p className="tn-small">Es un prototipo: la compu muestra el partido y cada celular es la raqueta (hasta {MAX_PLAYERS}; con uno solo, del otro lado juega la máquina). En iPhone hay que tocar «activar» para que el navegador deje usar los sensores.</p>
      </div>
    </div>
  );
}

export default function TenisApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(urlCode(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const code = session?.code;

  useRegisterRoom(GAME, code, () => handleLeave());

  useEffect(() => {
    if (!code) return undefined;
    return backend.subscribeRoom(code, (data) => {
      if (data && data.gameType === GAME_TYPE) { setRoom(data); return; }
      clearSession(); setUrl('', ''); setSession(null); setRoom(null);
      setError('Esa cancha ya no existe.');
    }, () => setError('No se pudo conectar con la cancha.'));
  }, [code]);

  function enter(next) {
    saveSession({ ...next, game: GAME });
    setUrl(next.code, next.role);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now() }));
    } catch {
      setError('No se pudo guardar. Revisá tu conexión.');
      return null;
    }
  }

  async function handleOpen() {
    setBusy(true);
    try {
      const playerId = makeId();
      const name = getProfile().name || 'Cancha';
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, name, '📺'));
      enter({ code: newCode, playerId, name, role: 'screen' });
    } catch {
      setError('No se pudo abrir la cancha. Probá de nuevo.');
    } finally { setBusy(false); }
  }

  async function handleJoin(target, name) {
    setBusy(true);
    try {
      const playerId = makeId();
      const res = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: cleanName(name), avatar: getProfile().avatar, team: urlTeam() }));
      if (!res.room || res.room.gameType !== GAME_TYPE) { setError('No encontramos esa cancha. Revisá el código que muestra la compu.'); return; }
      if (!findPlayer(res.room, playerId)) { setError(urlTeam() != null ? 'Los lugares de ese equipo ya están ocupados.' : `La cancha ya tiene todos los lugares ocupados (hasta ${MAX_PLAYERS}).`); return; }
      enter({ code: target, playerId, name: cleanName(name), role: 'control' });
    } catch {
      setError('No se pudo conectar. Probá de nuevo.');
    } finally { setBusy(false); }
  }

  async function handleScreenJoin(target) {
    setBusy(true);
    try {
      const playerId = makeId();
      const name = getProfile().name || 'Cancha 2';
      const res = await backend.updateRoom(target, (current) => applyAction(current, { type: 'screenJoin', playerId, name }));
      if (!res.room || res.room.gameType !== GAME_TYPE) { setError('No encontramos esa cancha.'); return; }
      if (!res.room.screens?.some((s) => s.id === playerId)) { setError(res.room.options?.mode !== 'online' ? 'Esa cancha está en modo local: el anfitrión tiene que elegir «Online».' : 'Esa cancha ya tiene las dos compus.'); return; }
      enter({ code: target, playerId, name, role: 'screen' });
    } catch {
      setError('No se pudo conectar. Probá de nuevo.');
    } finally { setBusy(false); }
  }

  function handleLeave() {
    const leaving = session;
    clearSession(); setUrl('', ''); setSession(null); setRoom(null);
    if (leaving && leaving.playerId !== room?.hostId) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
  }

  if (!session) return <Entry onOpen={handleOpen} onJoin={handleJoin} onScreenJoin={handleScreenJoin} busy={busy} error={error} onBack={onBackToMenu} initialCode={urlCode()} />;
  if (!room) return <div className="cs-root tn-page"><p className="tn-small">Conectando…</p></div>;
  const me = { id: session.playerId, name: session.name };
  if (session.role === 'screen') return <div className="tn-screen"><TenisScreen room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} />{error && <p className="tn-error tn-banner">{error}</p>}</div>;
  if (!findPlayer(room, me.id)) {
    return (
      <div className="cs-root tn-page"><div className="tn-card">
        <p>{isKicked(room, me.id) ? 'Te desconectaron de la cancha.' : 'Este control ya no está conectado.'}</p>
        {!isKicked(room, me.id) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => handleJoin(code, session.name)}>Volver a conectar</button>}
        <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
      </div></div>
    );
  }
  return <TenisControl room={room} me={me} code={code} onLeave={handleLeave} />;
}
