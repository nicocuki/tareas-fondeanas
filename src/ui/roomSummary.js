// Qué se sabe de una sala a partir de lo guardado: de qué juego es, quién es el anfitrión, cuántos hay
// y en qué fase está. Sin red ni React: lo usan la pantalla de «te estás uniendo» (`rooms.js`) y el
// servidor, para decidir qué sala pública mostrar en la portada (`worker/publicas.js`).
import { MAX_PLAYERS as MAX_CODIGO } from '../codigo-secreto/game.js';
import { MAX_PLAYERS as MAX_MECHA } from '../mecha/game.js';
import { MAX_PLAYERS as MAX_MEME } from '../meme/game.js';
import { MAX_PLAYERS as MAX_TIROS } from '../tiros/game.js';
import { roomSettings } from '../gartic/game.js';

// Topes de cada juego. Fútbol no tiene tope.
const MAX = { 'codigo-secreto': MAX_CODIGO, 'cafe-o-te': 4, 'la-mecha': MAX_MECHA, meme: MAX_MEME, tiros: MAX_TIROS };
const GAMES = ['cafe-o-te', 'futbol', 'la-mecha', 'meme', 'tiros'];

// `gartic`: lo que hay en garticRooms/{código} (objeto); `raw`: lo que hay en rooms/{código} (texto JSON).
// Devuelve { code, game, host, hostAvatar, players, max, phase, local } o null si no existe.
export function summarizeRoom(code, gartic, raw) {
  if (gartic && typeof gartic === 'object') {
    const players = Object.keys(gartic.players || {}).length;
    const host = gartic.players?.[gartic.hostId];
    return {
      code, game: 'gartic', host: String(host?.name || '').slice(0, 24), hostAvatar: host?.avatar || '',
      players, max: Number(roomSettings(gartic.settings).maxPlayers) || null, phase: gartic.state?.phase || 'lobby', local: false,
    };
  }
  if (typeof raw !== 'string') return null;
  let room;
  try { room = JSON.parse(raw); } catch { return null; }
  if (!room || typeof room !== 'object') return null;
  const game = GAMES.includes(room.gameType) ? room.gameType : 'codigo-secreto';
  const list = Array.isArray(room.players) ? room.players : [];
  const host = list.find((p) => p?.id === room.hostId) || list[0];
  return {
    code, game, host: String(host?.name || '').slice(0, 24), hostAvatar: typeof host?.avatar === 'string' ? host.avatar : '',
    players: list.length, max: MAX[game] || null, phase: room.phase || 'lobby', local: Boolean(room.isTrainingMode || room.isLocalGame),
  };
}

// Juegos en los que se puede entrar con la partida empezada: entrás mirando y jugás en la próxima.
// Fútbol y Café o Té no (sus reducers rechazan el `join` fuera de la sala de espera).
export const JOIN_IN_PROGRESS = ['codigo-secreto', 'gartic', 'la-mecha', 'meme', 'tiros'];

export const isFull = (s) => Boolean(s?.max && s.players >= s.max);
