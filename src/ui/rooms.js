// «Unirse con código» desde el menú o la portada: averigua de qué juego es la sala.
import { get, ref } from '../realtime.js';

export const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export async function findRoomGame(code) {
  if (!/^[A-Z]{4}$/.test(code)) return null;
  const [gartic, room] = await Promise.all([
    get(ref(`garticRooms/${code}`)),
    get(ref(`rooms/${code}`)),
  ]);
  if (gartic.exists()) return 'gartic';
  if (!room.exists()) return null;
  try {
    const data = JSON.parse(room.val());
    if (data?.gameType === 'cafe-o-te' || data?.gameType === 'futbol') return data.gameType;
  } catch {}
  return 'codigo-secreto';
}
