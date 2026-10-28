// Aviso de arriba de todo en la portada: la página puede estar en una de dos direcciones. Se cierra con la X
// y no vuelve a salir en ese navegador (`tf:aviso-dominio`); si cambia el aviso, se sube `NOTICE_ID`.
import React, { useState } from 'react';

const NOTICE_ID = 'dominio-1';
const KEY = 'tf:aviso-dominio';
const LINKS = ['tareas-fondeanas.nicocukier.workers.dev', 'tareas-fondeanas.donsatur.workers.dev'];

const wasClosed = () => { try { return localStorage.getItem(KEY) === NOTICE_ID; } catch { return false; } };

export default function DomainNotice() {
  const [open, setOpen] = useState(() => !wasClosed());
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try { localStorage.setItem(KEY, NOTICE_ID); } catch {}
  };
  return (
    <div className="tf-notice" role="status" data-notice>
      <span className="tf-notice-icon" aria-hidden="true">⚠️</span>
      <p>
        <strong>Aviso:</strong> según el momento, la página puede estar en{' '}
        <a href={`https://${LINKS[0]}`}>{LINKS[0]}</a> o en <a href={`https://${LINKS[1]}`}>{LINKS[1]}</a>.
        Si una no abre, probá con la otra. Las salas son de cada dirección: para jugar juntos, entren todos por el mismo link.
      </p>
      <span className="tf-notice-icon" aria-hidden="true">⚠️</span>
      <button type="button" className="tf-notice-close" aria-label="Cerrar el aviso" data-notice-close onClick={close}>✕</button>
    </div>
  );
}
