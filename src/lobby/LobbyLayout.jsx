import React, { useEffect, useRef } from 'react';
import { setRoomPublic, usePublicFlag } from '../ui/publicas.js';
import { usePrefs } from '../ui/store.js';

const SEEN_KEY = 'tf:salas-vistas';
// La primera vez que el anfitrión ve su sala recién creada, se aplica «Crear la sala como pública».
function firstLook(code) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
    if (seen.includes(code)) return false;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, code].slice(-20)));
  } catch {}
  return true;
}

// Pública (en la lista de la portada) o privada (solo con el código). La cambia el anfitrión.
function PublicSwitch({ code, host, players }) {
  const isPublic = usePublicFlag(code);
  const { publicRooms } = usePrefs();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !host || isPublic === undefined) return;
    checked.current = true;
    if (firstLook(code) && publicRooms && !isPublic && players === 1) setRoomPublic(code, true).catch(() => {});
  }, [code, host, isPublic, publicRooms, players]);
  if (isPublic === undefined || (!host && !isPublic)) return null;
  const text = isPublic ? 'Aparece en la portada: cualquiera puede entrar sin el código.' : 'Solo entra quien tenga el código o el link.';
  return (
    <div className="tf-public-switch">
      {host ? (
        <button type="button" role="switch" aria-checked={isPublic} className={`tf-switch${isPublic ? ' is-on' : ''}`} data-public-switch onClick={() => setRoomPublic(code, !isPublic).catch(() => {})}>
          <span className="tf-switch-knob" aria-hidden="true" />
          {isPublic ? '🌐 Sala pública' : '🔒 Sala privada'}
        </button>
      ) : (
        <strong>🌐 Sala pública</strong>
      )}
      <small>{text}</small>
    </div>
  );
}

export default function LobbyLayout({
  code,
  gameTitle = 'sala de espera',
  subtitle,
  copied = false,
  onCopyInvite,
  onLeave,
  leaveText = 'Salir',
  banners,
  unassignedPlayers,
  host = false, // si es true, puede hacer la sala pública o privada
  players = 0, // cuántos hay en la sala
  children,
}) {
  const displayCode =
    code ||
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      : '');

  return (
    <div className="cs-root tf-lobby" style={{ padding: '28px 16px 40px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {banners}

        {/* Encabezado estándar del lobby: el código grande, para dictarlo o mostrarlo */}
        <div className="tf-lobby-head">
          <p className="tf-eyebrow">{gameTitle}</p>
          <div className="tf-code-tiles" aria-label={`Código de sala ${displayCode}`}>
            {displayCode.split('').map((letter, i) => <span key={i}>{letter}</span>)}
          </div>
          <div className="tf-lobby-actions">
            {onCopyInvite && (
              <button type="button" className="tf-btn tf-btn-primary" onClick={onCopyInvite}>
                {copied ? '¡Link copiado!' : 'Copiar link de invitación'}
              </button>
            )}
            {onLeave && (
              <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>
                {leaveText}
              </button>
            )}
          </div>
          {subtitle && <p className="tf-lobby-subtitle">{subtitle}</p>}
          {displayCode && (host || players > 0) && <PublicSwitch code={displayCode} host={host} players={players} />}
        </div>

        {/* Jugadores sin equipo asignado */}
        {unassignedPlayers && unassignedPlayers.length > 0 && (
          <div className="tf-lobby-unassigned">
            Sin equipo: {unassignedPlayers.map((p) => p.name).join(', ')}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
