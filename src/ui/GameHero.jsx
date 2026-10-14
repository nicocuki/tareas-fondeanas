// Encabezado de la pantalla de entrada de cada juego: mismo formato para todos.
import React from 'react';
import { gameById } from './games.js';
import { setPrefs, usePrefs } from './store.js';

export default function GameHero({ gameId, onBack, children }) {
  const game = gameById(gameId);
  const { publicRooms } = usePrefs();
  if (!game) return null;
  return (
    <div className="tf-game-hero" style={{ '--chip-color': game.color }}>
      {onBack && (
        <button type="button" className="tf-link-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Todos los juegos
        </button>
      )}
      <div className="tf-game-hero-art" aria-hidden="true">{game.emoji}</div>
      <p className="tf-eyebrow">{game.tagline}</p>
      <h1 className="tf-game-hero-title">{game.title}</h1>
      <p className="tf-game-hero-text">{game.description}</p>
      <ul className="tf-chips">
        <li>👥 {game.players}</li>
        <li>⏱ {game.duration}</li>
        <li>🎮 {game.input}</li>
      </ul>
      <label className="tf-public-check">
        <input type="checkbox" checked={publicRooms} onChange={(e) => setPrefs({ publicRooms: e.target.checked })} data-public-default />
        <span>
          <strong>Crear la sala como pública</strong>
          <small>Aparece en la portada y cualquiera entra sin el código. Se puede cambiar en la sala de espera.</small>
        </span>
      </label>
      {children}
    </div>
  );
}
