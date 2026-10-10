// Salas y fútbol en tiempo real sobre el servidor de salas de Cloudflare (ver src/realtime.js).
import {
  onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, push, ref, remove, runTransaction, set,
} from './realtime.js';
import { ROOM_TTL_MS, makeCode, parseRoom, serializeRoom } from './codigo-secreto/game.js';

// Cada sala se guarda como un string JSON: así no se pierden arrays vacíos ni nulls
// (el servidor, igual que Firebase, borra los contenedores vacíos).
const roomRef = (code) => ref(`rooms/${code}`);

function subscribeRoom(code, onRoom, onError) {
  return onValue(roomRef(code), (snap) => onRoom(parseRoom(snap.val())), onError);
}

async function updateRoom(code, updater) {
  const result = await runTransaction(roomRef(code), (current) => {
    const room = parseRoom(current);
    const next = room && updater(room);
    return next ? serializeRoom(next) : undefined;
  });
  return { committed: result.committed, room: parseRoom(result.snapshot.val()) };
}

async function createRoom(build) {
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
function subscribeConnection(onChange) {
  let wasConnected = false;
  return onValue(ref('.info/connected'), (snap) => {
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
function futbolChannel(code) {
  const base = `futbol/${code}`;
  const at = (path) => ref(`${base}/${path}`);
  return {
    publishPlayer: (id, snap) => set(at(`players/${id}`), snap),
    removePlayer: (id) => remove(at(`players/${id}`)),
    // Si se cierra la pestaña o se corta la conexión, el servidor borra la foto solo.
    leaveOnDisconnect: (id) => onDisconnect(at(`players/${id}`)).remove(),
    publishBall: (ball) => set(at('ball'), ball),
    publishPickup: (index, pickup) => set(at(`pickups/${index}`), pickup),
    // Si dos pantallas declaran el mismo gol a la vez, la transacción deja pasar a una sola.
    async updateMatch(update) {
      const result = await runTransaction(at('match'), (current) => update(current));
      return { committed: result.committed, match: result.snapshot.val() };
    },
    // El servidor solo presenta a las pantallas entre sí; después las fotos van directo de una a otra.
    signaling: {
      async announce(id, sid) {
        await remove(at(`signal/${id}`)); // mensajes de una sesión anterior
        await onDisconnect(at(`peers/${id}`)).remove();
        await onDisconnect(at(`signal/${id}`)).remove();
        await set(at(`peers/${id}`), sid);
      },
      leave: (id) => Promise.all([remove(at(`peers/${id}`)), remove(at(`signal/${id}`))]),
      send: (to, msg) => push(at(`signal/${to}`), msg),
      onPeers: (cb) => onValue(at('peers'), (snap) => cb(snap.val() || {})),
      // Cada mensaje se borra apenas se lee: el buzón no crece.
      listen: (id, cb) => onChildAdded(at(`signal/${id}`), (snap) => {
        cb(snap.val());
        remove(snap.ref).catch(() => {});
      }),
    },
    subscribe({ onPlayer, onPlayerGone, onBall, onMatch, onPickups }) {
      const players = at('players');
      const offs = [
        onChildAdded(players, (snap) => onPlayer(snap.key, snap.val())),
        onChildChanged(players, (snap) => onPlayer(snap.key, snap.val())),
        onChildRemoved(players, (snap) => onPlayerGone(snap.key)),
        onValue(at('ball'), (snap) => { if (snap.exists()) onBall(snap.val()); }),
        onValue(at('match'), (snap) => onMatch(snap.val())),
        onValue(at('pickups'), (snap) => onPickups(snap.val() || {})),
      ];
      return () => offs.forEach((off) => off());
    },
  };
}

// Diferencia entre este reloj y el del servidor: con eso todas las pantallas comparten la misma hora.
function subscribeServerOffset(onOffset) {
  return onValue(ref('.info/serverTimeOffset'), (snap) => onOffset(Number(snap.val()) || 0));
}

export const backend = {
  subscribeRoom, updateRoom, createRoom, subscribeConnection, futbolChannel, subscribeServerOffset,
};
