import { initializeAuth, connectAuthEmulator, browserSessionPersistence, signInAnonymously } from 'firebase/auth';
import { ref, get, set, update, remove, onValue, onDisconnect, runTransaction, serverTimestamp } from 'firebase/database';
import { firebaseApp, database } from '../firebase.js';
import { cleanName, makeState, nextState, stepType, MAX_DRAWING, MAX_TEXT } from './game.js';

let auth;
let signingIn;
export function identity() {
  if (!signingIn) {
    if (!auth) { auth = initializeAuth(firebaseApp(), { persistence: browserSessionPersistence }); if (import.meta.env?.VITE_FIREBASE_EMULATORS === 'true') connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); }
    signingIn = auth.authStateReady().then(() => auth.currentUser || signInAnonymously(auth).then((r) => r.user));
    signingIn.catch(() => { signingIn = null; });
  }
  return signingIn;
}
const at = (path) => ref(database(), path);
const roomPath = (code) => 'garticRooms/' + code;
export const watch = (path, callback, onError) => onValue(at(path), (s) => callback(s.val()), onError);
export const watchRoom = (code, callback, onError) => watch(roomPath(code), callback, onError);
export const watchPresence = (code, callback) => watch('garticPresence/' + code, callback);
export function watchReady(code, state, callback, onError) {
  let active = true, errorTimer = null;
  const off = watch('garticReady/' + code + '/' + state.match + '/' + state.round, callback, (error) => {
    // Una revancha revoca esta lectura; la vista cancela la escucha al recibir el estado nuevo.
    errorTimer = setTimeout(() => { if (active) onError?.(error); }, 300);
  });
  return () => { active = false; clearTimeout(errorTimer); off(); };
}
export const watchOwnStep = (code, state, uid, callback, onError) => watch('garticSteps/' + code + '/' + state.match + '/' + state.round + '/' + uid, callback, onError);
export function watchPrevious(code, state, author, callback, onError) {
  return watch('garticSteps/' + code + '/' + state.match + '/' + (state.round - 1) + '/' + author, callback, onError);
}
export function watchResults(code, state, callback, onError) {
  let active = true, off = () => {}, retry = null, attempts = 0;
  function listen() {
    if (!active) return;
    off = watch('garticSteps/' + code + '/' + state.match, (value) => {
      if (active) callback(value);
    }, (error) => {
      // La autorización puede actualizarse antes que la suscripción al estado público.
      // Una revancha desmonta esta escucha; una revelación recién confirmada puede reintentar.
      if (!active) return;
      if (attempts++ < 3) retry = setTimeout(listen, 250);
      else onError?.(error);
    });
  }
  listen();
  return () => { active = false; clearTimeout(retry); off(); };
}

export async function createRoom(uid, name, avatar) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes, (b) => String.fromCharCode(65 + b % 26)).join('');
    const result = await runTransaction(at(roomPath(code)), (room) => room ? undefined : {
      hostId: uid, mode: 'normal', settings: { maxPlayers: 12, seconds: 90 },
      players: { [uid]: { name: cleanName(name), avatar, index: 0 } }, slots: { 0: uid },
      state: { phase: 'lobby', match: 'none', round: 0 },
    }, { applyLocally: false });
    if (result.committed) return code;
  }
  throw new Error('No encontramos un código libre. Intentá otra vez.');
}
export async function joinRoom(code, uid, name, avatar) {
  const snap = await get(at(roomPath(code)));
  const room = snap.val();
  if (!room) throw new Error('No encontramos esa sala.');
  if (room.players?.[uid]) return;
  if (room.state.phase !== 'lobby') throw new Error('La partida ya empezó. Podés entrar cuando vuelvan al lobby.');
  if (Object.keys(room.players || {}).length >= room.settings.maxPlayers) throw new Error('La sala está llena.');
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = (await get(at(roomPath(code)))).val();
    if (fresh.players?.[uid]) return;
    const index = Array.from({ length: fresh.settings.maxPlayers }, (_, i) => i).find((i) => !fresh.slots?.[i]);
    if (index === undefined) throw new Error('La sala está llena.');
    try {
      await update(at(roomPath(code)), { ['players/' + uid]: { name: cleanName(name), avatar, index }, ['slots/' + index]: uid });
      return;
    } catch (error) { if (attempt === 4) throw error; }
  }
}
export async function presence(code, uid) {
  // Conexiones por pestaña: una pestaña que sale no desconecta a las otras.
  const connection = crypto.randomUUID();
  const path = 'garticPresence/' + code + '/' + uid + '/' + connection;
  let active = true;
  const off = onValue(at('.info/connected'), async (snap) => {
    if (!snap.val() || !active) return;
    try {
      await onDisconnect(at(path)).remove();
      if (active) await set(at(path), true);
    } catch (error) { console.error('No se pudo publicar la conexión.', error); }
  });
  return async () => { active = false; off(); await remove(at(path)); };
}
export async function leaveRoom(code, uid, lobby) {
  if (lobby) {
    const snap = await get(at(roomPath(code) + '/players/' + uid));
    if (snap.exists() && Object.keys((await get(at(roomPath(code) + '/players'))).val() || {}).length > 1) await update(at(roomPath(code)), { ['players/' + uid]: null, ['slots/' + snap.val().index]: null });
  }
}
export async function configure(code, field, value) {
  await set(at(roomPath(code) + '/' + field), value);
}
export async function start(code, room, connected) {
  const players = Object.fromEntries(Object.entries(room.players).filter(([id]) => connected[id]));
  const match = crypto.randomUUID();
  await runTransaction(at(roomPath(code) + '/state'), (current) => {
    if (!current || current.phase !== 'lobby') return undefined;
    return makeState(players, room.mode, room.settings.seconds, match, serverTimestamp());
  }, { applyLocally: false });
}
export async function advance(code, state, readyCount, now) {
  return runTransaction(at(roomPath(code) + '/state'), (current) => {
    if (!current || current.match !== state.match || current.round !== state.round) return undefined;
    return nextState(current, readyCount, now, serverTimestamp()) || undefined;
  }, { applyLocally: false });
}
export async function saveStep(code, state, uid, content) {
  const type = stepType(state.mode, state.round, state.count);
  if (type === 'drawing' && content.length > MAX_DRAWING) throw new Error('El dibujo es demasiado grande para enviarlo.');
  if (type === 'text') content = content.slice(0, MAX_TEXT);
  await set(at('garticSteps/' + code + '/' + state.match + '/' + state.round + '/' + uid), { type, content, authorId: uid, order: state.round });
}
export async function submit(code, state, uid, content) {
  await saveStep(code, state, uid, content);
  await set(at('garticReady/' + code + '/' + state.match + '/' + state.round + '/' + uid), true);
}
export async function transferHost(code, room, connected) {
  if (connected[room.hostId]) return;
  const next = Object.keys(room.players || {}).sort().find((id) => connected[id]);
  if (!next) return;
  await runTransaction(at(roomPath(code) + '/hostId'), (host) => host === room.hostId ? next : undefined, { applyLocally: false });
}
export const rematch = (code) => set(at(roomPath(code) + '/state'), { phase: 'lobby', match: 'none', round: 0 });
