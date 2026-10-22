import { ref, get, set, update, remove, onValue, onDisconnect, runTransaction, serverTimestamp } from '../realtime.js';
import { cleanName, makeState, nextState, roomSettings, showPosition, stepType, DEFAULT_SETTINGS, MAX_DRAWING, MAX_STROKES, MAX_TEXT } from './game.js';

// Cada pestaña tiene su identidad (sin cuentas): el servidor la verifica con un secreto propio.
export { identity } from '../realtime.js';
const at = (path) => ref(path);
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
      hostId: uid, mode: 'normal', settings: { ...DEFAULT_SETTINGS },
      players: { [uid]: { name: cleanName(name), avatar, index: 0 } }, slots: { 0: uid },
      state: { phase: 'lobby', match: 'none', round: 0 },
    });
    if (result.committed) return code;
  }
  throw new Error('No encontramos un código libre. Intentá otra vez.');
}
export async function joinRoom(code, uid, name, avatar) {
  const snap = await get(at(roomPath(code)));
  const room = snap.val();
  if (!room) throw new Error('No encontramos esa sala.');
  if (room.players?.[uid]) return;
  if (room.kicked?.[uid]) throw new Error('El anfitrión te sacó de esta sala.');
  if (Object.keys(room.players || {}).length >= roomSettings(room.settings).maxPlayers) throw new Error('La sala está llena.');
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = (await get(at(roomPath(code)))).val();
    if (fresh.players?.[uid]) return;
    const index = Array.from({ length: roomSettings(fresh.settings).maxPlayers }, (_, i) => i).find((i) => !fresh.slots?.[i]);
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
// El anfitrión saca a alguien de la sala de espera; con esa pantalla no puede volver a entrar.
export async function kickPlayer(code, uid) {
  const snap = await get(at(roomPath(code) + '/players/' + uid));
  if (!snap.exists()) return;
  await update(at(roomPath(code)), { ['players/' + uid]: null, ['slots/' + snap.val().index]: null, ['kicked/' + uid]: true });
}
export async function configure(code, field, value) {
  await set(at(roomPath(code) + '/' + field), value);
}
export async function start(code, room, connected) {
  const players = Object.fromEntries(Object.entries(room.players).filter(([id]) => connected[id]));
  const match = crypto.randomUUID();
  await runTransaction(at(roomPath(code) + '/state'), (current) => {
    if (!current || current.phase !== 'lobby') return undefined;
    const settings = roomSettings(room.settings);
    return makeState(players, room.mode, { draw: settings.seconds, write: settings.writeSeconds }, match, serverTimestamp(), settings.autoShow);
  });
}
export async function advance(code, state, readyCount, now) {
  return runTransaction(at(roomPath(code) + '/state'), (current) => {
    if (!current || current.match !== state.match || current.round !== state.round) return undefined;
    return nextState(current, readyCount, now, serverTimestamp()) || undefined;
  });
}
export async function saveStep(code, state, uid, content, strokes = '') {
  const type = stepType(state.mode, state.round, state.count);
  if (type === 'drawing' && content.length > MAX_DRAWING) throw new Error('El dibujo es demasiado grande para enviarlo.');
  if (type === 'text') content = content.slice(0, MAX_TEXT);
  const step = { type, content, authorId: uid, order: state.round };
  // Los trazos sirven para ver el dibujo haciéndose en el álbum; si pesan demasiado, se mandan sin ellos.
  if (type === 'drawing' && strokes && strokes.length <= MAX_STROKES) step.strokes = strokes;
  await set(at('garticSteps/' + code + '/' + state.match + '/' + state.round + '/' + uid), step);
}
export async function submit(code, state, uid, content, strokes) {
  await saveStep(code, state, uid, content, strokes);
  await set(at('garticReady/' + code + '/' + state.match + '/' + state.round + '/' + uid), true);
}
export async function transferHost(code, room, connected) {
  if (connected[room.hostId]) return;
  const next = Object.keys(room.players || {}).sort().find((id) => connected[id]);
  if (!next) return;
  await runTransaction(at(roomPath(code) + '/hostId'), (host) => host === room.hostId ? next : undefined);
}
// Presentación del final: solo el anfitrión la mueve. `now` es la hora del servidor estimada.
export function showControl(code, state, durations, now, command) {
  const { index } = showPosition(state.show, now, durations);
  const last = durations.length - 1;
  const perAlbum = state.count;
  let next;
  if (command === 'play') next = { index: index >= last ? 0 : index, playing: true };
  else if (command === 'pause') next = { index, playing: false };
  else if (command === 'next') next = { index: Math.min(last, index + 1), playing: state.show?.playing === true };
  else if (command === 'prev') next = { index: Math.max(0, index - 1), playing: false };
  else if (command === 'nextAlbum') next = { index: Math.min(last, (Math.floor(index / perAlbum) + 1) * perAlbum), playing: state.show?.playing === true };
  else if (command === 'prevAlbum') next = { index: Math.max(0, (Math.floor(index / perAlbum) - 1) * perAlbum), playing: false };
  else if (command === 'end') next = { index: last, playing: false };
  else return Promise.resolve();
  return set(at(roomPath(code) + '/state/show'), { ...next, at: serverTimestamp() });
}
export const rematch = (code) => set(at(roomPath(code) + '/state'), { phase: 'lobby', match: 'none', round: 0 });
