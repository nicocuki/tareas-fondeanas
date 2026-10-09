import React from 'react';
import { COLORS, TEAM_BUTTON, TEAM_TEXT, panelStyle } from '../theme.js';

export function TeamRoleSlot({
  icon,
  label,
  members = [],
  myPlayerId,
  hostId,
  canPick = true,
  isMine = false,
  isTaken = false,
  onPick,
  pickLabel = 'Elegir',
  pickedLabel = '✓ Elegido',
  takenLabel = 'Ocupado',
  buttonColors,
  dataPick,
  showReadyBadge = true,
}) {
  const [bg, fg] = buttonColors || [COLORS.panelSoft, COLORS.cream];

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>

      {members.map((p) => (
        <div
          key={p.id}
          style={{
            fontSize: 13.5,
            padding: '4px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: COLORS.cream, fontWeight: p.id === myPlayerId ? 700 : 500 }}>
            {p.name}
            {p.id === myPlayerId ? ' (vos)' : ''}
            {hostId === p.id ? ' ★' : ''}
          </span>
          {showReadyBadge && (
            p.ready ? (
              <span className="cs-badge-ready">✓ Listo</span>
            ) : (
              <span className="cs-badge-waiting">Esperando</span>
            )
          )}
        </div>
      ))}

      {onPick && (
        <button
          type="button"
          className="cs-btn"
          data-pick={dataPick}
          disabled={!canPick || isTaken}
          onClick={onPick}
          style={{
            marginTop: 6,
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 4,
            background: bg,
            color: fg,
            opacity: isMine ? 1 : 0.65,
            fontWeight: isMine ? 700 : 400,
          }}
        >
          {isMine ? pickedLabel : isTaken ? takenLabel : pickLabel}
        </button>
      )}
    </div>
  );
}

export function TeamRoster({
  players = [],
  myPlayerId,
  hostId,
  isMyTeam = false,
  isFull = false,
  canJoin = true,
  onJoin,
  joinLabel = 'Unirme a este equipo',
  joinedLabel = '✓ En este equipo',
  fullLabel = 'Equipo lleno',
  buttonColors,
  emptyText = 'Sin jugadores',
  showReadyBadge = false,
}) {
  const [bg, fg] = buttonColors || [COLORS.panelSoft, COLORS.cream];

  return (
    <div>
      <div style={{ minHeight: 60, marginBottom: 12 }}>
        {players.length === 0 ? (
          <div style={{ color: COLORS.dim, fontSize: 13, fontStyle: 'italic', padding: '6px 0' }}>
            {emptyText}
          </div>
        ) : (
          players.map((p) => (
            <div
              key={p.id}
              style={{
                fontSize: 13.5,
                padding: '5px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid rgba(255,255,255,0.04)`,
              }}
            >
              <span style={{ color: COLORS.cream, fontWeight: p.id === myPlayerId ? 700 : 500 }}>
                {p.name}
                {p.id === myPlayerId ? ' (vos)' : ''}
                {hostId === p.id ? ' ★' : ''}
              </span>
              {showReadyBadge && (
                p.ready ? (
                  <span className="cs-badge-ready">✓ Listo</span>
                ) : (
                  <span className="cs-badge-waiting">Esperando</span>
                )
              )}
            </div>
          ))
        )}
      </div>

      {!isMyTeam && !isFull && onJoin && (
        <button
          type="button"
          className="cs-btn"
          disabled={!canJoin}
          onClick={onJoin}
          style={{
            width: '100%',
            marginTop: 4,
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 4,
            background: bg,
            color: fg,
            fontWeight: 600,
          }}
        >
          {joinLabel}
        </button>
      )}

      {isMyTeam && (
        <div style={{ fontSize: 12.5, color: COLORS.gold, textAlign: 'center', padding: '6px 0', fontWeight: 600 }}>
          {joinedLabel}
        </div>
      )}

      {isFull && !isMyTeam && (
        <div style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center', padding: '6px 0' }}>
          {fullLabel}
        </div>
      )}
    </div>
  );
}

export default function LobbyTeamCard({
  team,
  title,
  icon,
  color,
  countBadge,
  style,
  children,
}) {
  const borderColor = color || TEAM_TEXT[team] || COLORS.gold;

  return (
    <div
      style={{
        ...panelStyle,
        flex: '1 1 230px',
        padding: 18,
        borderTop: `3px solid ${borderColor}`,
        ...style,
      }}
    >
      <div
        className="cs-mono"
        style={{
          color: borderColor,
          fontSize: 14.5,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon && <span>{icon}</span>}
          <span>{title}</span>
        </div>
        {countBadge && (
          <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 400 }}>
            {countBadge}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}
