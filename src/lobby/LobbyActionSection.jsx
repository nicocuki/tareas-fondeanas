import React from 'react';
import { COLORS } from '../theme.js';

export default function LobbyActionSection({
  buttonText,
  onClick,
  disabled = false,
  variant = 'gold', // 'gold' | 'green' | 'soft'
  counterText,
  counterColor = COLORS.cream,
  statusHint,
  problems = [],
  style,
}) {
  const isGreen = variant === 'green';
  const isSoft = variant === 'soft' || disabled;

  const bg = isSoft ? COLORS.panelSoft : isGreen ? COLORS.green : COLORS.gold;
  const fg = isSoft ? COLORS.dim : isGreen ? COLORS.greenText : COLORS.ink;
  const shadow = isSoft
    ? 'none'
    : isGreen
      ? '0 4px 16px rgba(79, 125, 70, 0.4)'
      : '0 4px 16px rgba(179, 137, 58, 0.35)';

  return (
    <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 20, ...style }}>
      {buttonText && (
        <button
          type="button"
          className="cs-btn"
          disabled={disabled}
          onClick={onClick}
          style={{
            padding: '14px 40px',
            borderRadius: 6,
            background: bg,
            color: fg,
            fontWeight: 700,
            fontSize: 16,
            boxShadow: shadow,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {buttonText}
        </button>
      )}

      {(counterText || statusHint) && (
        <div style={{ marginTop: 14 }}>
          {counterText && (
            <div
              className="cs-mono"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: counterColor,
              }}
            >
              {counterText}
            </div>
          )}
          {statusHint && (
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>
              {statusHint}
            </div>
          )}
        </div>
      )}

      {problems && problems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {problems.map((p, idx) => (
            <p key={idx} style={{ color: COLORS.error, fontSize: 12.5, margin: '6px 0 0' }}>
              ⚠️ {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
