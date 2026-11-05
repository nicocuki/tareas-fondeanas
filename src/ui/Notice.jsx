// El aviso del admin: un cartel arriba en el medio, en todas las pantallas, por unos segundos. Cada pantalla escucha
// `/api/aviso` (un WebSocket que hiberna en el servidor: solo recibe algo cuando el admin manda un aviso, o al conectarse
// si todavía hay uno a la vista). Ver `avisar` en worker/directorio.js y el formulario del panel de admin.
import React, { useEffect, useState } from 'react';

const RECONNECT_MS = [1000, 3000, 8000, 15000];
const PING_MS = 45000;

export default function Notice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let ws = null, closed = false, attempt = 0, retry = null, ping = null, hide = null;
    function show(m) {
      clearTimeout(hide);
      if (!m || !m.text || !(m.left > 0)) { setNotice(null); return; }
      setNotice({ id: m.id, text: String(m.text) });
      hide = setTimeout(() => setNotice(null), m.left);
    }
    function connect() {
      try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/aviso`); } catch { schedule(); return; }
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        try {
          const msg = JSON.parse(e.data);
          if (msg?.t === 'aviso') show(msg.m);
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
  return <div key={notice.id} className="tf-notice" role="status" aria-live="polite" data-notice>{notice.text}</div>;
}
