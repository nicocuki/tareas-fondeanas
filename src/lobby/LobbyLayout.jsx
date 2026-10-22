import React from 'react';
import { PublicSwitch } from './PublicRoom.jsx';
import ChangeGame from './ChangeGame.jsx';
import KickPlayers from './KickPlayers.jsx';
import { useMoveWatch } from '../ui/mudanza.js';

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
  roster, // los jugadores ({ id, name, avatar }), para que el anfitrión pueda sacar a alguien con onKick
  me,
  onKick,
  children,
}) {
  const displayCode =
    code ||
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      : '');
  // Si el anfitrión se pasó a otro juego, todos atrás de él.
  useMoveWatch(displayCode);

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
          <ChangeGame code={displayCode} host={host} players={players} />
          <KickPlayers roster={roster} me={me} host={host} onKick={onKick} />
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
