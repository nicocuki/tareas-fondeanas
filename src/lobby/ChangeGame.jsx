// «Cambiar de juego» en la sala de espera: el anfitrión elige otro juego y se pasan todos juntos a una
// sala nueva (ver src/ui/mudanza.js). Los juegos donde no entran los que son quedan deshabilitados, con
// el porqué.
import React, { useState } from 'react';
import { GAMES, playersProblem } from '../ui/games.js';
import { startMove } from '../ui/mudanza.js';
import { usePublicFlag } from '../ui/publicas.js';
import { useCurrentRoom } from '../ui/store.js';

export default function ChangeGame({ code, host, players, className = '' }) {
  const current = useCurrentRoom();
  const isPublic = usePublicFlag(code);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(null);
  if (!host || !code || !current?.game) return null;
  const choices = GAMES.filter((g) => g.lobby !== false && g.id !== current.game);
  const chosen = choices.find((g) => g.id === pick);
  if (!open) {
    return (
      <button type="button" className={`tf-btn tf-btn-soft tf-change-game-open ${className}`} data-change-game onClick={() => setOpen(true)}>
        🔀 Cambiar de juego
      </button>
    );
  }
  return (
    <div className={`tf-change-game ${className}`}>
      <p className="tf-change-game-title">¿A qué juego se pasan? Van todos los que están acá.</p>
      <ul>
        {choices.map((g) => {
          const problem = playersProblem(g, players);
          return (
            <li key={g.id}>
              <button
                type="button" disabled={Boolean(problem)} aria-pressed={pick === g.id} data-game={g.id}
                className={pick === g.id ? 'is-on' : ''} style={{ '--chip-color': g.color }} onClick={() => setPick(g.id)}
              >
                <span className="tf-change-game-emoji" aria-hidden="true">{g.emoji}</span>
                <span className="tf-change-game-name">
                  <strong>{g.title}</strong>
                  <small>{problem || `👥 ${g.players}`}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="tf-change-game-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={!chosen} data-change-go onClick={() => startMove(code, chosen.id, isPublic)}>
          {chosen ? `Pasar a todos a ${chosen.title}` : 'Elegí un juego'}
        </button>
        <button type="button" className="tf-btn tf-btn-soft" onClick={() => { setOpen(false); setPick(null); }}>Cancelar</button>
      </div>
    </div>
  );
}
