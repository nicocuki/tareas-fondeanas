// Encabezado de la pantalla de entrada de cada juego: mismo formato para todos.
import React from 'react';
import { gameById } from './games.js';
import { PublicCheckbox } from '../lobby/PublicRoom.jsx';

export default function GameHero({ gameId, onBack, children }) {
  const game = gameById(gameId);
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
      <PublicCheckbox />
      {children}
    </div>
  );
}
