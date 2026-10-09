import React from 'react';
import { COLORS, panelStyle } from '../theme.js';

const GAMES = [
  { id: 'gartic', title: 'Trazo Loco', icon: '🎨', description: 'Teléfono descompuesto visual: escribí, dibujá y descubrí cómo cambió la idea. De 3 a 20 jugadores.', badge: 'Nuevo', available: true },
  {
    id: 'codigo-secreto',
    title: 'Código Secreto',
    icon: '🕵️',
    description: 'Juego de palabras y espías para jugar online con amigos.',
    badge: 'Disponible',
    available: true,
  },
  {
    id: 'cafe-o-te',
    title: 'Café o Té',
    icon: '☕',
    description: 'Juego de adivinanza por eliminación y asociación binaria (2v2: Pensadores y Adivinadores).',
    badge: 'Disponible',
    available: true,
  },
  {
    id: 'futbol',
    title: 'Fútbol',
    icon: '⚽',
    description: 'Juego de fútbol 2D con física real. Dos equipos, una pelota. Controlado con teclado (WASD y Flechas).',
    badge: 'BETA',
    available: true,
  },
];

export default function MainMenu({ onSelectGame }) {
  return (
    <div className="cs-root" style={{ background: COLORS.bg, padding: '48px 16px 32px', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="cs-mono" style={{ fontSize: 13, color: COLORS.gold, marginBottom: 8, letterSpacing: 1 }}>
            PLATAFORMA DE JUEGOS
          </div>
          <h1 className="cs-mono" style={{ fontSize: 42, margin: 0, color: COLORS.cream, lineHeight: 1.15 }}>
            Tareas Veganas
          </h1>
          <p style={{ color: COLORS.muted, marginTop: 12, fontSize: 15, lineHeight: 1.5 }}>
            Seleccioná un juego para empezar a jugar con tus amigos.
          </p>
        </div>

        {/* Lista de Juegos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              className="cs-btn"
              disabled={!game.available}
              onClick={() => onSelectGame(game.id)}
              style={{
                ...panelStyle,
                display: 'block',
                width: '100%',
                padding: 20,
                textAlign: 'left',
                cursor: game.available ? 'pointer' : 'default',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
                borderColor: COLORS.panelBorder,
              }}
              onMouseEnter={(e) => {
                if (game.available) {
                  e.currentTarget.style.borderColor = COLORS.gold;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (game.available) {
                  e.currentTarget.style.borderColor = COLORS.panelBorder;
                  e.currentTarget.style.transform = 'none';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{game.icon}</span>
                  <h2 className="cs-mono" style={{ fontSize: 22, margin: 0, color: COLORS.cream }}>
                    {game.title}
                  </h2>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: game.available ? 'rgba(179, 137, 58, 0.2)' : COLORS.panelSoft,
                    color: game.available ? COLORS.gold : COLORS.dim,
                    border: `1px solid ${game.available ? COLORS.gold : COLORS.panelBorder}`,
                  }}
                >
                  {game.badge}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: COLORS.muted, lineHeight: 1.45 }}>
                {game.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
