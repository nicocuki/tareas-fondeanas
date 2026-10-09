import React from 'react';
import { COLORS, panelStyle } from '../theme.js';

export function Segmented({ name, value, choices, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {choices.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={String(c.value)}
            type="button"
            className="cs-btn"
            data-opt={name ? `${name}-${c.value}` : undefined}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(c.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              fontSize: 13,
              background: active ? COLORS.gold : COLORS.panelSoft,
              color: active ? COLORS.ink : COLORS.cream,
              border: `1px solid ${active ? COLORS.gold : COLORS.panelBorder}`,
              fontWeight: active ? 700 : 400,
              opacity: disabled && !active ? 0.4 : 1,
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function OptionField({ title, hint, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <div style={{ fontSize: 13, color: COLORS.cream, marginBottom: 6 }}>{title}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

export default function LobbyOptions({
  title = 'modificadores de la partida',
  canEdit = false,
  canEditHint = 'Solo vos, como anfitrión, podés cambiarlos.',
  readOnlyHint = 'Los cambia el anfitrión de la sala.',
  style,
  children,
}) {
  return (
    <div style={{ ...panelStyle, padding: 18, marginBottom: 24, ...style }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div className="cs-mono" style={{ fontSize: 13, color: COLORS.gold }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: COLORS.dim }}>
          {canEdit ? canEditHint : readOnlyHint}
        </div>
      </div>
      {children}
    </div>
  );
}
