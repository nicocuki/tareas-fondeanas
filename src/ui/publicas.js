// Salas públicas: la lista en vivo de la portada y la marca de «pública» de cada sala.
// El servidor decide qué se lista (worker/publicas.js); acá solo se escucha y se marca.
import { useEffect, useState } from 'react';
import { onValue, ref, set } from '../realtime.js';

const RECONNECT_MS = [1000, 3000, 8000, 15000];
const PING_MS = 45000;

// Lista de salas públicas: { code, game, host, players, max, at }[]. null mientras carga.
export function usePublicRooms() {
  const [rooms, setRooms] = useState(null);
  useEffect(() => {
    let ws = null, closed = false, attempt = 0, retry = null, ping = null;
    function connect() {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/salas`;
      try { ws = new WebSocket(url); } catch { schedule(); return; }
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        try {
          const msg = JSON.parse(e.data);
          if (msg?.t === 'salas' && Array.isArray(msg.l)) setRooms(msg.l);
        } catch {}
      };
      ws.onclose = () => { ws = null; schedule(); };
      ping = setInterval(() => { try { ws?.readyState === 1 && ws.send('ping'); } catch {} }, PING_MS);
    }
    function schedule() {
      clearInterval(ping);
      if (closed) return;
      setRooms((r) => r ?? []);
      retry = setTimeout(connect, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
    }
    connect();
    return () => { closed = true; clearTimeout(retry); clearInterval(ping); try { ws?.close(); } catch {} };
  }, []);
  return rooms;
}

// ¿La sala está marcada como pública? (undefined mientras carga)
export function usePublicFlag(code) {
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    if (!code) return undefined;
    setValue(undefined);
    return onValue(ref(`publica/${code}`), (snap) => setValue(snap.val() === true));
  }, [code]);
  return value;
}

export const setRoomPublic = (code, isPublic) => set(ref(`publica/${code}`), isPublic ? true : null);
