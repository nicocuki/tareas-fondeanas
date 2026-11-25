// El aviso del admin: un cartel arriba en el medio, en todas las pantallas, por unos segundos. Cada pantalla escucha
// `/api/aviso` (un WebSocket que hiberna en el servidor: solo recibe algo cuando el admin manda un aviso, o al conectarse
// si todavía hay alguno a la vista). Un aviso puede ir a todos, a una sala o a un jugador: acá se descartan los que no son para esta pantalla. Ver `avisar` en worker/directorio.js y el formulario del panel de admin.
import React, { useEffect, useState } from 'react';
import { getCurrentRoom, getProfile } from './store.js';
import { noticeIsForMe } from './admin.js';
import { gameById, gameUrl } from './games.js';

const RECONNECT_MS = [1000, 3000, 8000, 15000];
const PING_MS = 45000;

export default function Notice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let ws = null, closed = false, attempt = 0, retry = null, ping = null, hide = null;
    function show(m) {
      clearTimeout(hide);
      if (!m || !(m.text || m.image || m.invite) || !(m.left > 0)) { setNotice(null); return; }
      if (!noticeIsForMe(m.to, { room: getCurrentRoom()?.code, name: getProfile().name })) return; // es de otra sala u otro jugador
      setNotice({ id: m.id, text: String(m.text || ''), image: typeof m.image === 'string' ? m.image : '', invite: m.invite && gameById(m.invite.game) ? m.invite : null });
      hide = setTimeout(() => setNotice(null), m.left);
    }
    function connect() {
      try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/aviso`); } catch { schedule(); return; }
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        try {
          const msg = JSON.parse(e.data);
          if (msg?.t !== 'aviso') return;
          if (Array.isArray(msg.l)) msg.l.forEach(show); // al conectarse: los que siguen a la vista
          else show(msg.m);
        } catch {}
      };
      ws.onclose = () => { ws = null; schedule(); };
      ping = setInterval(() => { try { ws?.readyState === 1 && ws.send('ping'); } catch {} }, PING_MS);
    }
    function schedule() {
      clearInterval(ping);
      if (closed) return;
      retry = setTimeout(connect, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
    }
    connect();
    return () => { closed = true; clearTimeout(retry); clearTimeout(hide); clearInterval(ping); try { ws?.close(); } catch {} };
  }, []);
  if (!notice) return null;
  const game = notice.invite ? gameById(notice.invite.game) : null;
  // Una invitación se puede tocar: lleva a la sala y entra sola (como al seguir al anfitrión que cambia de juego).
  const join = () => window.location.assign(`${gameUrl(notice.invite.game, notice.invite.code)}&auto=1`);
  return (
    <div key={notice.id} className={`tf-notice${notice.invite ? ' has-invite' : ''}`} role="status" aria-live="polite" data-notice>
      {notice.image && <img className="tf-notice-img" src={notice.image} alt="" data-notice-image />}
      {notice.text && <div className="tf-notice-text">{notice.text}</div>}
      {game && (
        <div className="tf-notice-invite" data-notice-invite={notice.invite.code}>
          <span className="tf-notice-game">{game.emoji} {game.title}</span>
          <span className="tf-notice-code">Sala {notice.invite.code}</span>
          <button type="button" className="tf-notice-join" onClick={join} data-act="notice-join">Unirse</button>
        </div>
      )}
    </div>
  );
}
