import React from 'react';

export const APP_VERSION = 'v0.11.0';

export default function Credits({ inline = false }) {
  if (inline) return <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 20px', background: '#f7f5fc', color: '#756d87', fontFamily: 'Arial, sans-serif', fontSize: 11 }}><span>Nicolas Cukier · Alan Vitas</span><span>{APP_VERSION}</span></footer>;
  return (
    <>
      {/* Créditos en la esquina inferior izquierda (Capa superior HUD) */}
      <div
        className="cs-credits-hud-left"
        style={{
          position: 'fixed',
          bottom: 12,
          left: 16,
          zIndex: 99999,
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: "'Special Elite', 'Courier New', monospace",
          lineHeight: 1.25,
          textShadow: '0 1px 4px rgba(0, 0, 0, 0.95), 0 0 3px rgba(0, 0, 0, 0.9)',
        }}
      >
        <div style={{ fontSize: 10, color: 'rgba(239, 230, 204, 0.65)', letterSpacing: 0.5 }}>
          un expediente de
        </div>
        <div style={{ fontSize: 12, color: 'rgba(239, 230, 204, 0.95)', fontWeight: 600 }}>
          Nicolas Cukier · Uriel Suti · Alan Vitas
        </div>
      </div>

      {/* Número de Versión en la esquina inferior derecha (Capa superior HUD) */}
      <div
        className="cs-credits-hud-right"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 16,
          zIndex: 99999,
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: "'Special Elite', 'Courier New', monospace",
          fontSize: 12,
          fontWeight: 700,
          color: '#d4af37',
          background: 'rgba(18, 16, 13, 0.75)',
          padding: '3px 10px',
          borderRadius: 4,
          border: '1px solid rgba(179, 137, 58, 0.4)',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.6)',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
        }}
      >
        {APP_VERSION}
      </div>
    </>
  );
}
