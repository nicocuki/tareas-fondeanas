// El cartelito del que mira una partida (en lugar del chat, que solo es de los jugadores). Ver `spectate.js`.
import React from 'react';

export default function SpectatorBadge() {
  return <div className="tf-spectator" role="status" data-spectator>👀 Mirando · cuando termine, podés jugar con los demás</div>;
}
