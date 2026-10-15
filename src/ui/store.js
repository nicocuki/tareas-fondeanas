// Estado de la interfaz compartido entre el header, el menú y los juegos: preferencias, perfil,
// la sala en la que estás y los avisos cortos. Cada pieza es un store chiquito con
// useSyncExternalStore, sin librerías.
import { useEffect, useSyncExternalStore } from 'react';
import { gameUrl } from './games.js';

function createStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? next(value) : next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
const useStore = (store) => useSyncExternalStore(store.subscribe, store.get, store.get);

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Preferencias ────────────────────────────────────────────────────────────
const PREFS_KEY = 'tf:preferencias';
// publicRooms: las salas que creás arrancan públicas (aparecen en la portada).
const prefs = createStore({ theme: 'system', reducedMotion: false, publicRooms: false, ...read(PREFS_KEY, {}) });

function applyPrefs({ theme, reducedMotion }) {
  const dark = theme === 'dark' || (theme === 'system' && !window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0f13' : '#f6f3ec');
}
applyPrefs(prefs.get());
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyPrefs(prefs.get()));

export const usePrefs = () => useStore(prefs);
export function setPrefs(patch) {
  prefs.set((p) => ({ ...p, ...patch }));
  write(PREFS_KEY, prefs.get());
  applyPrefs(prefs.get());
}

// ─── Perfil ──────────────────────────────────────────────────────────────────
// El nombre usa la misma clave que session.js, así todos los juegos lo encuentran ya escrito.
const NAME_KEY = 'codigo-secreto:nombre';
const AVATAR_KEY = 'tf:avatar';
export const AVATARS = ['🐸', '🦊', '🐼', '🐙', '🐨', '🦄', '🐱', '🐧', '🦖', '🐝', '🦉', '🐵', '🐯', '🐢', '👾', '🤖'];

function readName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
const profile = createStore({ name: readName(), avatar: read(AVATAR_KEY, AVATARS[0]) });

export const useProfile = () => useStore(profile);
export const getProfile = () => profile.get();
export function setProfile({ name, avatar }) {
  const next = { ...profile.get() };
  if (name !== undefined) {
    next.name = String(name).trim().slice(0, 24);
    try { localStorage.setItem(NAME_KEY, next.name); } catch {}
  }
  if (avatar !== undefined && AVATARS.includes(avatar)) {
    next.avatar = avatar;
    write(AVATAR_KEY, avatar);
  }
  profile.set(next);
}
// Si un juego guarda el nombre por su cuenta (al crear o unirse a una sala), el perfil se entera.
window.addEventListener('storage', (e) => { if (e.key === NAME_KEY) profile.set((p) => ({ ...p, name: readName() })); });
export function syncProfileName() {
  const name = readName();
  if (name !== profile.get().name) profile.set((p) => ({ ...p, name }));
}

// ─── La sala en la que estás ─────────────────────────────────────────────────
const room = createStore(null); // { game, code, onLeave }: la del juego que está en pantalla
const lastRoom = createStore(null); // { game, code }: la última abierta, para «Volver» desde el inicio
export const useCurrentRoom = () => useStore(room);
export const useLastRoom = () => useStore(lastRoom);

// Cada juego llama a esto con su sala actual (o '' si no está en ninguna). El header muestra el
// código y el menú ofrece salir con `onLeave`.
export function useRegisterRoom(game, code, onLeave) {
  useEffect(() => {
    if (!code) {
      if (lastRoom.get()?.game === game) lastRoom.set(null);
      return undefined;
    }
    syncProfileName();
    const entry = { game, code, onLeave };
    room.set(entry);
    lastRoom.set({ game, code });
    return () => { if (room.get() === entry) room.set(null); };
  }, [game, code]); // eslint-disable-line react-hooks/exhaustive-deps
  // El handler cierra sobre el estado del juego, así que se actualiza en cada render.
  const current = room.get();
  if (current && current.game === game && current.code === code) current.onLeave = onLeave;
}

// ─── Pantalla completa ───────────────────────────────────────────────────────
// Un juego puede marcar cuál es «la ventana del juego» (un ref): el botón del header pone en pantalla
// completa ese elemento en vez de toda la página. Si el ref está vacío (por ejemplo en la sala de
// espera), va la página entera.
let fullscreenTarget = null;
export function useFullscreenTarget(ref) {
  useEffect(() => {
    fullscreenTarget = ref;
    return () => { if (fullscreenTarget === ref) fullscreenTarget = null; };
  }, [ref]);
}
export const getFullscreenTarget = () => fullscreenTarget?.current || null;
export const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
export function toggleFullscreen(el = getFullscreenTarget() || document.documentElement) {
  const result = fullscreenElement()
    ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  result?.catch?.(() => {});
}

// ─── Avisos cortos ───────────────────────────────────────────────────────────
const toast = createStore(null);
let toastTimer;
export const useToast = () => useStore(toast);
export function showToast(text) {
  clearTimeout(toastTimer);
  toast.set({ text, id: Date.now() });
  toastTimer = setTimeout(() => toast.set(null), 2200);
}

export async function copyInvite(game, code) {
  const link = gameUrl(game, code);
  try {
    await navigator.clipboard.writeText(link);
    showToast('Link de invitación copiado');
  } catch {
    window.prompt('Copiá este link:', link);
  }
}
