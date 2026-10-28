// Buzón de sugerencias: un cuadro de texto que le llega al dueño (ver worker/sugerencias.js).
// Se abre en una ventana con el botón «?» del header (`SuggestionsDialog`).
import React, { useEffect, useRef, useState } from 'react';
import { useProfile } from './store.js';

const MAX_TEXT = 500;
const MAX_NAME = 30;

export default function Suggestions() {
  const profile = useProfile();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState({ phase: 'idle', error: '' }); // idle | sending | sent | error

  async function submit(e) {
    e.preventDefault();
    if (state.phase === 'sending') return;
    setState({ phase: 'sending', error: '' });
    try {
      const res = await fetch('/api/sugerencias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, name: name.trim() || profile.name || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ phase: 'error', error: data.error || 'No se pudo enviar. Probá de nuevo.' }); return; }
      setText('');
      setState({ phase: 'sent', error: '' });
    } catch {
      setState({ phase: 'error', error: 'No se pudo enviar. Revisá tu conexión.' });
    }
  }

  return (
    <section className="tf-suggest" aria-labelledby="tf-sugerencias" data-suggest>
      <p className="tf-eyebrow">Buzón</p>
      <h2 id="tf-sugerencias">¿Una idea o algo que arreglar?</h2>
      <p className="tf-suggest-text">Contanos qué juego, mecánica o cambio te gustaría. Nos llega directo.</p>
      <form onSubmit={submit}>
        <label className="tf-field">
          <span>Tu sugerencia</span>
          <textarea
            className="tf-input tf-suggest-area"
            value={text}
            maxLength={MAX_TEXT}
            rows={5}
            placeholder="Ej.: me gustaría poder elegir el color de mi personaje…"
            onChange={(e) => { setText(e.target.value); if (state.phase !== 'idle') setState({ phase: 'idle', error: '' }); }}
          />
          <small className="tf-suggest-count">{text.length} / {MAX_TEXT}</small>
        </label>
        <label className="tf-field">
          <span>Tu nombre (opcional)</span>
          <input className="tf-input" value={name} maxLength={MAX_NAME} placeholder={profile.name || 'Si querés firmarla'} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        {state.phase === 'error' && <p className="tf-suggest-msg is-error" role="alert">{state.error}</p>}
        {state.phase === 'sent' && <p className="tf-suggest-msg is-ok" role="status">¡Gracias! Ya la recibimos. 🙌</p>}
        <button type="submit" className="tf-btn tf-btn-primary tf-btn-block" disabled={state.phase === 'sending' || text.trim().length < 5}>
          {state.phase === 'sending' ? 'Enviando…' : 'Enviar sugerencia'}
        </button>
      </form>
    </section>
  );
}

// La ventana: Escape o un clic afuera la cierran.
export function SuggestionsDialog({ onClose }) {
  const box = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    box.current?.querySelector('textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="tf-suggest-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="tf-suggest-dialog" role="dialog" aria-modal="true" aria-labelledby="tf-sugerencias">
        <button type="button" className="tf-icon-btn tf-suggest-close" onClick={onClose} aria-label="Cerrar">✕</button>
        <Suggestions />
      </div>
    </div>
  );
}
