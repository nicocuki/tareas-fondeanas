// Buscar una sala por su código: de qué juego es (para «Unirse con código» desde el menú o la portada)
// y quién la armó (para la pantalla de «te estás uniendo a la sala de…» cuando entrás con un link).
import { useEffect, useState } from 'react';
import { get, onValue, ref } from '../realtime.js';
import { summarizeRoom } from './roomSummary.js';

export const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export async function roomInfo(code) {
  if (!/^[A-Z]{4}$/.test(code)) return null;
  const [gartic, room] = await Promise.all([get(ref(`garticRooms/${code}`)), get(ref(`rooms/${code}`))]);
  return summarizeRoom(code, gartic.val(), room.val());
}

export async function findRoomGame(code) {
  return (await roomInfo(code))?.game ?? null;
}

// La sala en vivo (así se ve cuántos hay y si ya empezó): undefined mientras carga, null si no existe.
export function useRoomInfo(code) {
  const [info, setInfo] = useState(undefined);
  useEffect(() => {
    if (!/^[A-Z]{4}$/.test(code || '')) { setInfo(null); return undefined; }
    setInfo(undefined);
    // Se espera a tener las dos ramas antes de decir algo (si no, un «no existe» aparecería un instante).
    let gartic, raw, seen = 0;
    const update = () => { if (seen === 3) setInfo(summarizeRoom(code, gartic, raw)); };
    const offs = [
      onValue(ref(`garticRooms/${code}`), (snap) => { gartic = snap.val(); seen |= 1; update(); }),
      onValue(ref(`rooms/${code}`), (snap) => { raw = snap.val(); seen |= 2; update(); }),
    ];
    return () => offs.forEach((off) => off());
  }, [code]);
  return info;
}
