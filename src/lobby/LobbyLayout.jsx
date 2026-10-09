import React from 'react';
import { COLORS, TEAM_BG, ghostButton } from '../theme.js';

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
  children,
}) {
  const displayCode =
    code ||
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      : '');

  return (
    <div className="cs-root" style={{ background: TEAM_BG.lobby, padding: '32px 16px 32px', minHeight: '100vh' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {banners}

        {/* Encabezado estándar del lobby */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div
            className="cs-mono"
            style={{
              fontSize: 12,
              color: COLORS.gold,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            {gameTitle}
          </div>

          <div
            className="cs-mono"
            style={{
              fontSize: 44,
              letterSpacing: 8,
              color: COLORS.cream,
              margin: '6px 0',
            }}
          >
            {displayCode}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {onCopyInvite && (
              <button type="button" className="cs-btn" onClick={onCopyInvite} style={ghostButton}>
                {copied ? '¡Link copiado!' : 'Copiar link de invitación'}
              </button>
            )}
            {onLeave && (
              <button
                type="button"
                className="cs-btn"
                onClick={onLeave}
                style={{ ...ghostButton, color: COLORS.muted }}
              >
                {leaveText}
              </button>
            )}
          </div>

          {subtitle && (
            <p style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Jugadores sin equipo asignado */}
        {unassignedPlayers && unassignedPlayers.length > 0 && (
          <div style={{ marginBottom: 16, fontSize: 13, color: COLORS.muted, textAlign: 'center' }}>
            Sin equipo: {unassignedPlayers.map((p) => p.name).join(', ')}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
