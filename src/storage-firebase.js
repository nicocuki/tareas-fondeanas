import { database } from './firebase.js';
import {
  onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, push, ref, remove, runTransaction, set,
} from 'firebase/database';
import { ROOM_TTL_MS, makeCode, parseRoom, serializeRoom } from './codigo-secreto/game.js';


// Cada sala se guarda como un string JSON: así Firebase no convierte arrays vacíos ni nulls en campos faltantes.
const roomRef = (code) => ref(database(), `rooms/${code}`);

export const isLocal = false;

export function subscribeRoom(code, onRoom, onError) {
  return onValue(roomRef(code), (snap) => onRoom(parseRoom(snap.val())), onError);
}

export async function updateRoom(code, updater) {
  const result = await runTransaction(roomRef(code), (current) => {
    // Sin caché local, Firebase pasa null aunque la sala exista; devolver null hace que reintente con el valor del servidor.
    if (current === null) return null;
    const room = parseRoom(current);
    const next = room && updater(room);
    return next ? serializeRoom(next) : undefined;
  });
  return { committed: result.committed, room: parseRoom(result.snapshot.val()) };
}

export async function createRoom(build) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    let room = null;
    const result = await runTransaction(roomRef(code), (current) => {
      const existing = parseRoom(current);
      if (existing && Date.now() - (existing.updatedAt || 0) < ROOM_TTL_MS) return undefined;
      room = build();
      return serializeRoom(room);
    });
    if (result.committed) return { code, room };
  }
  throw new Error('No se encontró un código libre.');
}

// Solo avisa de desconexión después de haber estado conectado, para no mostrar el aviso al cargar.
export function subscribeConnection(onChange) {
  let wasConnected = false;
  return onValue(ref(database(), '.info/connected'), (snap) => {
    const connected = snap.val() === true;
    if (connected) wasConnected = true;
    onChange(connected || !wasConnected);
  });
}

// ─── Fútbol en tiempo real ───────────────────────────────────────────────────
// Fuera del reducer de salas: son fotos que se pisan muchas veces por segundo. Cada rama se escucha
// por separado, así la foto de un jugador no obliga a volver a bajar y armar todo lo demás.
//   futbol/{sala}/players/{id}  foto de cada jugador (la escribe solo su dueño)
//   futbol/{sala}/ball          la pelota (la escribe quien la tocó último)
//   futbol/{sala}/match         saque, reloj y marcador (con transacción)
//   futbol/{sala}/pickups/{i}   turbos agarrados (modo coches)
//   futbol/{sala}/peers/{id}    sesión de cada pantalla, para armar la conexión directa (WebRTC)
//   futbol/{sala}/signal/{id}   buzón de ofertas, respuestas y candidatos WebRTC para ese jugador
export function futbolChannel(code) {
  const db = database();
  const base = `futbol/${code}`;
  return {
    publishPlayer: (id, snap) => set(ref(db, `${base}/players/${id}`), snap),
    removePlayer: (id) => remove(ref(db, `${base}/players/${id}`)),
    // Si se cierra la pestaña o se corta la conexión, el servidor borra la foto solo.
    leaveOnDisconnect: (id) => onDisconnect(ref(db, `${base}/players/${id}`)).remove(),
    publishBall: (ball) => set(ref(db, `${base}/ball`), ball),
    publishPickup: (index, pickup) => set(ref(db, `${base}/pickups/${index}`), pickup),
    // Si dos pantallas declaran el mismo gol a la vez, la transacción deja pasar a una sola.
    async updateMatch(update) {
      const result = await runTransaction(ref(db, `${base}/match`), (current) => {
        const next = update(current);
        return next === undefined ? undefined : next;
      });
      return { committed: result.committed, match: result.snapshot.val() };
    },
    // Firebase solo presenta a las pantallas entre sí; después las fotos van directo de una a otra.
    signaling: {
      async announce(id, sid) {
        await remove(ref(db, `${base}/signal/${id}`)); // mensajes de una sesión anterior
        await onDisconnect(ref(db, `${base}/peers/${id}`)).remove();
        await onDisconnect(ref(db, `${base}/signal/${id}`)).remove();
        await set(ref(db, `${base}/peers/${id}`), sid);
      },
      leave: (id) => Promise.all([remove(ref(db, `${base}/peers/${id}`)), remove(ref(db, `${base}/signal/${id}`))]),
      send: (to, msg) => push(ref(db, `${base}/signal/${to}`), msg),
      onPeers: (cb) => onValue(ref(db, `${base}/peers`), (snap) => cb(snap.val() || {})),
      // Cada mensaje se borra apenas se lee: el buzón no crece.
      listen: (id, cb) => onChildAdded(ref(db, `${base}/signal/${id}`), (snap) => {
        cb(snap.val());
        remove(snap.ref).catch(() => {});
      }),
    },
    subscribe({ onPlayer, onPlayerGone, onBall, onMatch, onPickups }) {
      const players = ref(db, `${base}/players`);
      const offs = [
        onChildAdded(players, (snap) => onPlayer(snap.key, snap.val())),
        onChildChanged(players, (snap) => onPlayer(snap.key, snap.val())),
        onChildRemoved(players, (snap) => onPlayerGone(snap.key)),
        onValue(ref(db, `${base}/ball`), (snap) => { if (snap.exists()) onBall(snap.val()); }),
        onValue(ref(db, `${base}/match`), (snap) => onMatch(snap.val())),
        onValue(ref(db, `${base}/pickups`), (snap) => onPickups(snap.val() || {})),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}

// Diferencia entre este reloj y el del servidor: con eso todas las pantallas comparten la misma hora.
export function subscribeServerOffset(onOffset) {
  return onValue(ref(database(), '.info/serverTimeOffset'), (snap) => onOffset(Number(snap.val()) || 0));
}
