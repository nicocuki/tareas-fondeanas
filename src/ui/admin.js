// Modo admin de la pantalla. Se entra con el perfil «cuki» y el avatar 🤖, escribiendo «CUKI» en el
// campo del código (`JoinByCode`). La primera vez el panel pide la clave del servidor (`ADMIN_CLAVE`,
// ver worker/admin.js) y la guarda en este dispositivo: sin ella el servidor no deja hacer nada.
import { useSyncExternalStore } from 'react';

export const ADMIN_NAME = 'cuki';
export const ADMIN_AVATAR = '🤖';
export const ADMIN_CODE = 'CUKI';
const KEY = 'tf:admin';

export const isAdminProfile = (profile) => String(profile?.name || '').trim().toLowerCase() === ADMIN_NAME && profile?.avatar === ADMIN_AVATAR;
export const isAdminTrigger = (profile, code) => code === ADMIN_CODE && isAdminProfile(profile);

let key = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();
const listeners = new Set();
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
// La clave guardada ('' si no hay): con ella el modo admin está prendido en este dispositivo.
export const useAdminKey = () => useSyncExternalStore(subscribe, () => key, () => key);

export function setAdminKey(next) {
  key = next || '';
  try { if (key) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY); } catch {}
  listeners.forEach((l) => l());
}

// Pedido al servidor con la clave. Tira un Error con el motivo si no sale.
export async function adminFetch(path, { body, clave = key } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-admin-clave': clave, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && path === '/estado') throw new Error('Esa clave no es.');
  if (!res.ok) throw new Error(data.error || 'No se pudo. Probá de nuevo.');
  return data;
}

export const closeRoom = (code) => adminFetch('/salas/cerrar', { body: { code } });
