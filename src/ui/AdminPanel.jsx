// Panel del modo admin (`?admin`): las salas activas (todas, públicas o no) para entrar o cerrarlas, y
// las sugerencias que llegaron, para leerlas y borrarlas. Ver admin.js y worker/admin.js.
import React, { useCallback, useEffect, useState } from 'react';
import { gameById } from './games.js';
import { showToast, useProfile } from './store.js';
import { adminFetch, closeRoom, isAdminProfile, setAdminKey, useAdminKey } from './admin.js';
import { cleanCode } from './rooms.js';

const REFRESH_MS = 10000;
const PHASES = { lobby: 'Sala de espera', ended: 'Terminada', final: 'Terminada' };
const when = (t) => new Date(t).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function KeyForm() {
  const [clave, setClave] = useState('');
  const [state, setState] = useState({ busy: false, error: '' });
  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: '' });
    try {
      await adminFetch('/estado', { clave });
      setAdminKey(clave);
      showToast('Modo admin activado 🤖');
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  }
  return (
    <form className="tf-admin-card tf-admin-key" onSubmit={submit}>
      <h2>Falta la clave</h2>
      <p className="tf-admin-hint">Es el secreto <code>ADMIN_CLAVE</code> del Worker en Cloudflare. Se pide una sola vez por dispositivo.</p>
      <input className="tf-input" type="password" value={clave} autoComplete="current-password" placeholder="Clave de admin" onChange={(e) => setClave(e.target.value)} />
      {state.error && <p className="tf-join-error" role="alert">{state.error}</p>}
      <button type="submit" className="tf-btn tf-btn-primary" disabled={state.busy || !clave}>{state.busy ? 'Probando…' : 'Entrar'}</button>
    </form>
  );
}

function Rooms({ rooms, onReload, onNavigate }) {
  const [code, setCode] = useState('');
  async function close(c, ask = true) {
    if (ask && !window.confirm(`¿Cerrar la sala ${c}? Se saca a todos y se borra todo lo que tenía.`)) return false;
    try { await closeRoom(c); return true; } catch (err) { showToast(err.message); return false; }
  }
  async function closeOne(c) {
    if (await close(c)) { showToast(`Sala ${c} cerrada`); onReload(); }
  }
  async function closeAll() {
    if (!rooms.length || !window.confirm(`¿Cerrar las ${rooms.length} salas activas?`)) return;
    await Promise.all(rooms.map((r) => close(r.code, false)));
    showToast('Salas cerradas');
    onReload();
  }
  return (
    <section className="tf-admin-card" aria-labelledby="tf-admin-salas">
      <div className="tf-admin-head">
        <h2 id="tf-admin-salas">Salas activas <small>{rooms.length}</small></h2>
        <div className="tf-admin-actions">
          <button type="button" className="tf-btn tf-btn-soft" onClick={onReload}>Actualizar</button>
          <button type="button" className="tf-btn tf-btn-danger-soft" onClick={closeAll} disabled={!rooms.length}>Cerrar todas</button>
        </div>
      </div>
      {rooms.length ? (
        <ul className="tf-admin-list" data-admin-rooms>
          {rooms.map((r) => {
            const game = gameById(r.game);
            return (
              <li key={r.code} data-room={r.code}>
                <span className="tf-admin-emoji" aria-hidden="true">{game?.emoji || '🎲'}</span>
                <span className="tf-admin-info">
                  <strong>{game?.title || r.game} · <span className="cs-mono">{r.code}</span></strong>
                  <small>
                    {r.host ? `De ${r.host}` : 'Sin anfitrión'} · 👥 {r.players}{r.max ? `/${r.max}` : ''} · {PHASES[r.phase] || 'Jugando'}
                    {' · '}{r.conns} {r.conns === 1 ? 'pantalla' : 'pantallas'}{r.pub ? ' · pública' : ''}
                  </small>
                </span>
                <button type="button" className="tf-btn tf-btn-soft" onClick={() => onNavigate(r.game, r.code)}>Entrar</button>
                <button type="button" className="tf-btn tf-btn-danger-soft" onClick={() => closeOne(r.code)}>Cerrar</button>
              </li>
            );
          })}
        </ul>
      ) : <p className="tf-admin-hint">No hay ninguna sala con gente conectada.</p>}
      <form className="tf-admin-inline" onSubmit={(e) => { e.preventDefault(); if (code.length === 4) closeOne(code).then(() => setCode('')); }}>
        <input className="tf-input tf-code-input" aria-label="Código de la sala a cerrar" placeholder="ABCD" value={code} maxLength={4} onChange={(e) => setCode(cleanCode(e.target.value))} />
        <button type="submit" className="tf-btn tf-btn-danger-soft" disabled={code.length !== 4}>Cerrar por código</button>
      </form>
    </section>
  );
}

function Suggestions({ list, onReload }) {
  async function remove(item) {
    if (!window.confirm('¿Borrar esta sugerencia?')) return;
    try { await adminFetch('/sugerencias/borrar', { body: { id: item.id } }); onReload(); } catch (err) { showToast(err.message); }
  }
  async function copyAll() {
    const text = list.map((s) => `${when(s.at)} · ${s.name || 'Anónimo'}: ${s.text}`).join('\n');
    try { await navigator.clipboard.writeText(text); showToast('Copiadas'); } catch { window.prompt('Copialas de acá:', text); }
  }
  return (
    <section className="tf-admin-card" aria-labelledby="tf-admin-sug">
      <div className="tf-admin-head">
        <h2 id="tf-admin-sug">Sugerencias <small>{list.length}</small></h2>
        <div className="tf-admin-actions">
          <button type="button" className="tf-btn tf-btn-soft" onClick={copyAll} disabled={!list.length}>Copiar todas</button>
        </div>
      </div>
      {list.length ? (
        <ul className="tf-admin-list tf-admin-sug" data-admin-suggestions>
          {list.map((s) => (
            <li key={s.id}>
              <span className="tf-admin-info">
                <small>{when(s.at)} · {s.name || 'Anónimo'}</small>
                <p>{s.text}</p>
              </span>
              <button type="button" className="tf-btn tf-btn-danger-soft" onClick={() => remove(s)} aria-label="Borrar sugerencia">Borrar</button>
            </li>
          ))}
        </ul>
      ) : <p className="tf-admin-hint">Todavía no llegó ninguna.</p>}
    </section>
  );
}

export default function AdminPanel({ onNavigate }) {
  const profile = useProfile();
  const key = useAdminKey();
  const [data, setData] = useState({ rooms: [], suggestions: [], error: '' });

  const reload = useCallback(async () => {
    try {
      const [rooms, suggestions] = await Promise.all([adminFetch('/salas'), adminFetch('/sugerencias')]);
      setData({ rooms, suggestions, error: '' });
    } catch (err) {
      setData((d) => ({ ...d, error: err.message }));
    }
  }, []);

  useEffect(() => {
    if (!key) return undefined;
    reload();
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [key, reload]);

  function leave() {
    setAdminKey('');
    showToast('Saliste del modo admin');
    onNavigate('menu');
  }

  if (!key && !isAdminProfile(profile)) {
    return (
      <div className="tf-page tf-admin">
        <p className="tf-admin-hint">Esta página no existe.</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={() => onNavigate('menu')}>Volver al inicio</button>
      </div>
    );
  }

  const players = data.rooms.reduce((n, r) => n + (r.players || 0), 0);
  return (
    <div className="tf-page tf-admin" data-admin>
      <header className="tf-admin-top">
        <div>
          <p className="tf-eyebrow">🤖 Modo admin</p>
          <h1>Panel de control</h1>
        </div>
        <div className="tf-admin-actions">
          <button type="button" className="tf-btn tf-btn-soft" onClick={() => onNavigate('menu')}>Ir al inicio</button>
          {key && <button type="button" className="tf-btn tf-btn-soft" onClick={leave}>Salir del modo admin</button>}
        </div>
      </header>
      {!key ? <KeyForm /> : (
        <>
          <ul className="tf-admin-stats">
            <li><strong>{data.rooms.length}</strong> salas activas</li>
            <li><strong>{players}</strong> jugadores en salas</li>
            <li><strong>{data.suggestions.length}</strong> sugerencias</li>
          </ul>
          {data.error && <p className="tf-join-error" role="alert">{data.error}</p>}
          <Rooms rooms={data.rooms} onReload={reload} onNavigate={onNavigate} />
          <Suggestions list={data.suggestions} onReload={reload} />
        </>
      )}
    </div>
  );
}
