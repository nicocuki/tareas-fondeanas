// La sala de espera de quien entró a una partida en curso de un juego que no se puede mirar (ver `spectate.js`): los jugadores,
// «Jugando» y nada más. Cuando la sala vuelve a la sala de espera, `useSpectatorJoin` lo une como jugador.
import React from 'react';

export default function WaitingRoom({ room, onLeave }) {
  if (!room) return <div className="tf-waiting"><p>Entrando a la sala…</p></div>;
  return (
    <div className="tf-waiting" data-waiting>
      <p className="tf-invite-live">Jugando</p>
      <h1>Esperá a que termine la partida</h1>
      <ul className="tf-invite-people">
        {room.players.map((p) => <li key={p.id}><span>{p.avatar || '🙂'}</span> {p.name}</li>)}
      </ul>
      <p className="tf-invite-status">En este juego no se puede mirar. Cuando la partida termine y vuelvan a la sala de espera, entrás solo para jugar con los demás.</p>
      <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
    </div>
  );
}
