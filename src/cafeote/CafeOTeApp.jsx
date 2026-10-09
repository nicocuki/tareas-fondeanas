import React, { useEffect, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadName, loadSession, saveSession } from '../session.js';
import { COLORS, panelStyle, inputStyle, ghostButton, labelStyle } from '../theme.js';
import { applyAction, cleanName, findPlayer, makeId, newRoom } from './game.js';
import CafeOTeLobby from './CafeOTeLobby.jsx';
import CafeOTeSecretWord from './CafeOTeSecretWord.jsx';
import CafeOTeBoard from './CafeOTeBoard.jsx';

function codeFromUrl() {
  const code = new URLSearchParams(window.location.search).get('sala') || '';
  return code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function setUrlCode(code) {
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set('sala', code);
    url.searchParams.set('juego', 'cafe-o-te');
  } else {
    url.searchParams.delete('sala');
  }
  window.history.replaceState(null, '', url);
}

function inviteLink(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('sala', code);
  url.searchParams.set('juego', 'cafe-o-te');
  return url.toString();
}

export default function CafeOTeApp({ onBackToMenu }) {
  const [name, setName] = useState(loadName);
  const [joinCode, setJoinCode] = useState(codeFromUrl);
  const [session, setSession] = useState(() => loadSession(codeFromUrl()));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const code = session?.code;

  useEffect(() => {
    if (!code) return undefined;
    setRoom(null);
    return backend.subscribeRoom(
      code,
      (data) => {
        if (data) { setRoom(data); return; }
        clearSession();
        setUrlCode('');
        setSession(null);
        setError('Esa sala ya no existe.');
      },
      () => setError('No se pudo conectar con la sala.'),
    );
  }, [code]);

  const me = findPlayer(room, session?.playerId);

  function enterRoom(next) {
    saveSession(next);
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    const { code: roomCode, playerId } = session;
    try {
      return await backend.updateRoom(roomCode, (current) => applyAction(current, { ...action, playerId }));
    } catch {
      setError('No se pudo actualizar la partida.');
      return null;
    }
  }

  async function handleCreate() {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    setError('');
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, clean));
      enterRoom({ code: newCode, playerId, name: clean });
    } catch {
      setError('No se pudo crear la sala.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    const target = joinCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(target)) { setError('El código de sala tiene 4 letras.'); return; }
    setBusy(true);
    setError('');
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: clean }));
      if (!result.room) { setError('No encontramos esa sala.'); return; }
      enterRoom({ code: target, playerId, name: clean });
    } catch {
      setError('No se pudo conectar con la sala.');
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
    setJoinCode('');
    setError('');
    if (leaving) {
      backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
    }
  }

  async function copyInvite() {
    if (!session?.code) return;
    const link = inviteLink(session.code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copiá este link:', link);
    }
  }

  // Home de Café o Té (sin sesión)
  if (!session) {
    return (
      <div className="cs-root" style={{ background: COLORS.bg, padding: '48px 16px 32px', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <button
              type="button"
              className="cs-btn"
              onClick={onBackToMenu}
              style={{ ...ghostButton, marginBottom: 16 }}
            >
              ← Volver a Tareas Veganas
            </button>
            <div className="cs-mono" style={{ fontSize: 13, color: COLORS.gold, marginBottom: 8, letterSpacing: 1 }}>
              ADIVINANZA POR ASOCIACIÓN (2v2)
            </div>
            <h1 className="cs-mono" style={{ fontSize: 38, margin: 0, color: COLORS.cream, lineHeight: 1.2 }}>
              ☕ Café o Té
            </h1>
            <p style={{ color: COLORS.muted, marginTop: 10, fontSize: 15, lineHeight: 1.45 }}>
              4 jugadores divididos en 2 equipos: 2 Pensadores y 2 Adivinadores compitiendo en simultáneo.
            </p>
          </div>

          <div style={{ ...panelStyle, padding: 24 }}>
            {/* Paso 1: Tu nombre */}
            <div style={{ marginBottom: 24 }}>
              <label htmlFor="cote-name" className="cs-mono" style={{ ...labelStyle, fontSize: 12, marginBottom: 8 }}>
                1. TU NOMBRE
              </label>
              <input
                id="cote-name"
                className="cs-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Escribí tu nombre..."
                maxLength={16}
                autoComplete="nickname"
                style={{ ...inputStyle }}
              />
            </div>

            <div className="cs-mono" style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
              2. ELEGÍ CÓMO JUGAR
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Crear sala */}
              <div style={{ background: COLORS.panelSoft, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 6, padding: 14 }}>
                <div style={{ fontWeight: 700, color: COLORS.cream, fontSize: 15, marginBottom: 6 }}>
                  🌐 Crear sala online (2v2)
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted }}>
                  Creá una sala y sumá 3 amigos para jugar 2 contra 2.
                </p>
                <button
                  type="button"
                  className="cs-btn"
                  disabled={busy}
                  onClick={handleCreate}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 4, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 14 }}
                >
                  Crear sala de Café o Té
                </button>
              </div>

              {/* Unirse a sala */}
              <div style={{ background: COLORS.panelSoft, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 6, padding: 14 }}>
                <div style={{ fontWeight: 700, color: COLORS.cream, fontSize: 15, marginBottom: 6 }}>
                  🔑 Unirse a una sala
                </div>
                <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="cote-code"
                    className="cs-input"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                    placeholder="ABCD"
                    maxLength={4}
                    autoCapitalize="characters"
                    autoComplete="off"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, letterSpacing: 3, textAlign: 'center', fontWeight: 700 }}
                  />
                  <button
                    type="submit"
                    className="cs-btn"
                    disabled={busy || !joinCode}
                    style={{ padding: '10px 18px', borderRadius: 4, background: COLORS.blue, color: COLORS.blueText, fontWeight: 700 }}
                  >
                    Unirme
                  </button>
                </form>
              </div>
            </div>

            {error && <div role="alert" style={{ color: COLORS.error, fontSize: 13, marginTop: 16, textAlign: 'center' }}>{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="cs-root" style={{ background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="cs-mono" style={{ color: COLORS.gold, marginBottom: 16 }}>Cargando sala de Café o Té...</div>
          <button type="button" className="cs-btn" onClick={handleLeave} style={ghostButton}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (room.phase === 'lobby') {
    return (
      <CafeOTeLobby
        room={room}
        code={session?.code}
        me={me}
        onDispatch={dispatch}
        onLeave={handleLeave}
        onCopyInvite={copyInvite}
        copied={copied}
      />
    );
  }

  if (room.phase === 'secret_word') {
    return (
      <CafeOTeSecretWord
        room={room}
        me={me}
        onDispatch={dispatch}
      />
    );
  }

  return (
    <CafeOTeBoard
      room={room}
      me={me}
      onDispatch={dispatch}
      onLeave={handleLeave}
    />
  );
}
