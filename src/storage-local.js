// Backend de desarrollo cuando Firebase no está configurado: salas en localStorage, sincronizadas entre pestañas del mismo navegador.
import { ROOM_TTL_MS, makeCode, parseRoom, serializeRoom } from './codigo-secreto/game.js';

const PREFIX = 'codigo-secreto:sala:';
const listeners = new Map();

function read(code) {
  try {
    return parseRoom(localStorage.getItem(PREFIX + code));
  } catch {
    return null;
  }
}

function notify(code, room) {
  listeners.get(code)?.forEach((cb) => cb(room));
}

function write(code, room) {
  localStorage.setItem(PREFIX + code, serializeRoom(room));
  notify(code, room);
}

window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith(PREFIX)) notify(e.key.slice(PREFIX.length), parseRoom(e.newValue));
});

export const isLocal = true;

export function subscribeRoom(code, onRoom) {
  if (!listeners.has(code)) listeners.set(code, new Set());
  const set = listeners.get(code);
  set.add(onRoom);
  queueMicrotask(() => set.has(onRoom) && onRoom(read(code)));
  return () => set.delete(onRoom);
}

export async function updateRoom(code, updater) {
  const room = read(code);
  const next = room && updater(room);
  if (!next) return { committed: false, room };
  write(code, next);
  return { committed: true, room: next };
}

export async function createRoom(build) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    const existing = read(code);
    if (existing && Date.now() - (existing.updatedAt || 0) < ROOM_TTL_MS) continue;
    const room = build();
    write(code, room);
    return { code, room };
  }
  throw new Error('No se encontró un código libre.');
}

export function subscribeConnection(onChange) {
  onChange(true);
  return () => {};
}

// ─── Fútbol en tiempo real (local) ───────────────────────────────────────────
// Misma interfaz que en storage-firebase.js, sobre localStorage: sirve entre pestañas del navegador.
const FUTBOL_PREFIX = 'futbol:sync:';
const futbolListeners = new Map();

function readFutbol(code) {
  try {
    return JSON.parse(localStorage.getItem(FUTBOL_PREFIX + code)) || {};
  } catch {
    return {};
  }
}

function notifyFutbol(code, data = readFutbol(code)) {
  futbolListeners.get(code)?.forEach((cb) => cb(data));
}

function patchFutbol(code, change) {
  const data = readFutbol(code);
  change(data);
  localStorage.setItem(FUTBOL_PREFIX + code, JSON.stringify(data));
  notifyFutbol(code, data);
}

export function futbolChannel(code) {
  return {
    publishPlayer: async (id, snap) => patchFutbol(code, (d) => { d.players = { ...d.players, [id]: snap }; }),
    removePlayer: async (id) => patchFutbol(code, (d) => { if (d.players) delete d.players[id]; }),
    leaveOnDisconnect: async () => {},
    publishBall: async (ball) => patchFutbol(code, (d) => { d.ball = ball; }),
    publishPickup: async (index, pickup) => patchFutbol(code, (d) => { d.pickups = { ...d.pickups, [index]: pickup }; }),
    async updateMatch(update) {
      const data = readFutbol(code);
      const next = update(data.match ?? null);
      if (next === undefined) return { committed: false, match: data.match ?? null };
      patchFutbol(code, (d) => { d.match = next; });
      return { committed: true, match: next };
    },
    subscribe({ onPlayer, onPlayerGone, onBall, onMatch, onPickups }) {
      // Se avisa solo lo que cambió, igual que con los eventos de Firebase.
      const seen = { players: {}, ball: undefined, match: undefined, pickups: undefined };
      const dispatch = (data) => {
        const players = data.players || {};
        for (const [id, snap] of Object.entries(players)) {
          const json = JSON.stringify(snap);
          if (seen.players[id] !== json) { seen.players[id] = json; onPlayer(id, snap); }
        }
        for (const id of Object.keys(seen.players)) {
          if (!(id in players)) { delete seen.players[id]; onPlayerGone(id); }
        }
        const ball = JSON.stringify(data.ball ?? null);
        if (ball !== seen.ball) { seen.ball = ball; if (data.ball) onBall(data.ball); }
        const match = JSON.stringify(data.match ?? null);
        if (match !== seen.match) { seen.match = match; onMatch(data.match ?? null); }
        const pickups = JSON.stringify(data.pickups ?? null);
        if (pickups !== seen.pickups) { seen.pickups = pickups; onPickups(data.pickups || {}); }
      };
      if (!futbolListeners.has(code)) futbolListeners.set(code, new Set());
      const listeners = futbolListeners.get(code);
      listeners.add(dispatch);
      queueMicrotask(() => { if (listeners.has(dispatch)) dispatch(readFutbol(code)); });
      return () => listeners.delete(dispatch);
    },
  };
}

export function subscribeServerOffset(onOffset) {
  onOffset(0);
  return () => {};
}

window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith(FUTBOL_PREFIX)) notifyFutbol(e.key.slice(FUTBOL_PREFIX.length));
});
