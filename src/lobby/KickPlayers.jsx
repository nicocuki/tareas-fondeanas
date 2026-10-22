// «Sacar a alguien» en la sala de espera: solo el anfitrión. Cada juego atiende la acción `kick` en su
// reducer (ver kick.js); Trazo Loco, que no tiene reducer, saca desde su propia lista.
import React, { useState } from 'react';

export default function KickPlayers({ roster = [], me, host, onKick, className = '' }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const others = roster.filter((p) => p.id !== me);
  if (!host || !onKick || !others.length) return null;
  if (!open) {
    return (
      <button type="button" className={`tf-btn tf-btn-soft tf-kick-open ${className}`} data-kick-open onClick={() => setOpen(true)}>
        🚫 Sacar a alguien
      </button>
    );
  }
  return (
    <div className={`tf-kick ${className}`}>
      <p className="tf-kick-title">¿A quién sacás de la sala? No va a poder volver a entrar desde esa pantalla.</p>
      <ul>
        {others.map((p) => (
          <li key={p.id}>
            <span>{p.avatar ? `${p.avatar} ` : ''}{p.name}</span>
            {confirm === p.id ? (
              <span className="tf-kick-confirm">
                <button type="button" className="tf-btn tf-btn-danger" data-kick={p.id} onClick={() => { onKick(p.id); setConfirm(null); }}>Sí, sacarlo</button>
                <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirm(null)}>No</button>
              </span>
            ) : (
              <button type="button" className="tf-btn tf-btn-soft" data-kick-ask={p.id} onClick={() => setConfirm(p.id)}>Sacar</button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="tf-btn tf-btn-soft" onClick={() => { setOpen(false); setConfirm(null); }}>Listo</button>
    </div>
  );
}
