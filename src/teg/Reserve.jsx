// La reserva: las fichas que te faltan poner, juntas al costado de la pantalla y vibrando un poco. Se arrastran con el mouse o el dedo
// hasta un país tuyo del mapa (o, más rápido, se toca el país: cada toque resta una de acá). Al soltar sobre un país que no vale,
// la ficha vuelve. Cuando queda en 0 se puede seguir.
import React, { useRef, useState } from 'react';

const SHOWN = 12; // fichas que se dibujan (el resto va en el número)

const countryAt = (x, y) => {
  for (const el of document.elementsFromPoint(x, y)) {
    const holder = el.closest?.('[data-i]');
    if (holder) return Number(holder.getAttribute('data-i'));
    const land = el.closest?.('[data-land]');
    if (land) return Number(land.getAttribute('data-land-i'));
  }
  return null;
};

export function Chipie({ color, ink, children, className = '', style }) {
  return (
    <span className={`tg-chipie ${className}`} style={{ '--tok': color, '--ink': ink, ...style }}>
      <i className="top" />
      <b>{children}</b>
    </span>
  );
}

export default function Reserve({ count, color, ink, title, hint, isValid, onHover, onDrop }) {
  const [drag, setDrag] = useState(null); // { x, y, over }
  const active = useRef(false);

  function start(e) {
    if (count < 1 || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    active.current = true;
    const at = (ev) => {
      const over = countryAt(ev.clientX, ev.clientY);
      const ok = over !== null && isValid(over);
      setDrag({ x: ev.clientX, y: ev.clientY, over: ok ? over : null });
      onHover?.(ok ? over : null);
      return ok ? over : null;
    };
    at(e);
    const move = (ev) => { if (active.current) at(ev); };
    const end = (ev) => {
      if (!active.current) return;
      active.current = false;
      const over = at(ev);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
      onHover?.(null);
      if (over !== null && ev.type === 'pointerup') onDrop(over);
    };
    const cancel = (ev) => end({ ...ev, type: 'pointercancel', clientX: -1, clientY: -1 });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  }

  const shown = Math.min(count, SHOWN);
  return (
    <aside className={`tg-reserve${count < 1 ? ' is-empty' : ''}`} data-reserve={count} aria-label="Reserva de ejércitos">
      <header>
        <strong>{title}</strong>
        <span className="tg-reserve-n">{count}</span>
      </header>
      {count < 1 ? <p className="tg-reserve-done">✓ Reserva vacía</p> : (
        <div className="tg-reserve-pile" onPointerDown={start} role="button" tabIndex={0} aria-label={`Arrastrá una ficha a un país tuyo. Te quedan ${count}.`} style={{ touchAction: 'none' }}>
          {Array.from({ length: shown }, (_, i) => (
            <Chipie key={i} color={color} ink={ink} className={drag && i === shown - 1 ? 'is-lifted' : ''} style={{ '--i': i, '--r': `${((i * 53) % 9) - 4}deg` }}>1</Chipie>
          ))}
          {count > SHOWN && <span className="tg-reserve-more">+{count - SHOWN}</span>}
        </div>
      )}
      <p className="tg-reserve-hint">{count < 1 ? 'Esperando a los demás…' : hint}</p>
      {drag && <Chipie color={color} ink={ink} className="tg-ghost" style={{ left: drag.x, top: drag.y }}>1</Chipie>}
    </aside>
  );
}
