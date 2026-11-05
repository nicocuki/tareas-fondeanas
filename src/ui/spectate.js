// Mirar una partida que ya empezó sin ser jugador. Quien entra a una sala pública «En curso» a un juego que no deja entrar en
// medio (`JOIN_IN_PROGRESS`) mira: su sesión lleva `spectator: true`, con un id que no es de ningún jugador. Cada juego
// muestra su partida con un jugador fantasma (`ghostMe`) y sin mandar jugadas (el espectador no escribe nada en la sala);
// cuando la sala vuelve a la sala de espera, entra solo como jugador (`useSpectatorJoin`).
import { useEffect, useRef } from 'react';
import { JOIN_IN_PROGRESS } from './roomSummary.js';

// Los juegos que ya saben mostrarse a un espectador (se van sumando).
export const SPECTATE_GAMES = ['monopoly', 'teg', 'generala'];

export const canSpectate = (game) => SPECTATE_GAMES.includes(game);
// ¿Quien entra a esta sala en curso solo puede mirar?
export const watchOnly = (game, info) => Boolean(info) && info.playing !== false && !JOIN_IN_PROGRESS.includes(game);

// El «jugador» de un espectador: no está en `room.players`. Lleva vacíos los campos que las pantallas leen de `me` (cartas, misión,
// fichas por poner…) para que no se rompan.
export const ghostMe = (session, extra = {}) => ({
  id: session.playerId, name: session.name || 'Espectador', avatar: '👀', color: '#8a8a9a', spectator: true,
  cards: [], hand: [], obj: '', pend: 0, out: false, left: false, by: -1, wins: 0, score: 0, ...extra,
});

// Cuando la sala vuelve a `lobby`, el espectador se une como jugador (`join(code)` es el `handleJoin` de cada juego).
export function useSpectatorJoin(session, room, join) {
  const done = useRef('');
  useEffect(() => {
    if (!session?.spectator || room?.phase !== 'lobby' || done.current === session.code) return;
    done.current = session.code;
    join(session.code, session.name || 'Espectador');
  }, [session, room?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
}
