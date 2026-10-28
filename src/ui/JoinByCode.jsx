// Campo de 4 letras que te lleva a la sala, sea del juego que sea.
// Con el perfil de admin, «CUKI» lleva al panel de admin (ver admin.js).
import React, { useState } from 'react';
import { cleanCode, findRoomGame } from './rooms.js';
import { getProfile } from './store.js';
import { isAdminTrigger } from './admin.js';

export default function JoinByCode({ compact = false, onJoined }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (code.length !== 4) { setError('El código tiene 4 letras.'); return; }
    if (isAdminTrigger(getProfile(), code)) { setCode(''); onJoined('admin', ''); return; }
    setBusy(true);
    setError('');
    try {
      const game = await findRoomGame(code);
      if (!game) { setError('No encontramos esa sala. Revisá el código.'); return; }
      onJoined(game, code);
    } catch {
      setError('No se pudo buscar la sala. Revisá tu conexión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`tf-join${compact ? ' is-compact' : ''}`} onSubmit={submit}>
      <div className="tf-join-row">
        <input
          className="tf-input tf-code-input"
          aria-label="Código de sala"
          placeholder="ABCD"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => { setCode(cleanCode(e.target.value)); setError(''); }}
        />
        <button type="submit" className="tf-btn tf-btn-primary" disabled={busy || code.length !== 4}>
          {busy ? 'Buscando…' : 'Entrar'}
        </button>
      </div>
      {error && <p className="tf-join-error" role="alert">{error}</p>}
    </form>
  );
}
