// Salas públicas: las que el anfitrión marcó para que aparezcan en la portada.
//
// Cada sala decide sola si se lista (`roomListing`, con lo que tiene guardado) y le avisa al
// Directorio (un Durable Object único) cuando eso cambia. La portada escucha al Directorio por un
// WebSocket. Sin nada de Cloudflare: se prueba con `node --test`.
import { getAt } from './tree.js';
import { MAX_PLAYERS as MAX_CODIGO } from '../src/codigo-secreto/game.js';
import { MAX_PLAYERS as MAX_MECHA } from '../src/mecha/game.js';
import { MAX_PLAYERS as MAX_MEME } from '../src/meme/game.js';
import { MAX_PLAYERS as MAX_TIROS } from '../src/tiros/game.js';

// Topes de cada juego, para no listar una sala llena. Fútbol no tiene tope.
const MAX = { 'codigo-secreto': MAX_CODIGO, 'cafe-o-te': 4, 'la-mecha': MAX_MECHA, meme: MAX_MEME, tiros: MAX_TIROS };

export const MAX_LISTED = 40;
// Una sala que no avisa nada en seis horas se deja de mostrar, por si se perdió el aviso de cierre.
export const LISTING_TTL_MS = 6 * 60 * 60 * 1000;

// Qué mostrar de la sala `code` en la portada, o null si no corresponde listarla:
// no es pública, no está en la sala de espera, está llena o no hay nadie conectado.
export function roomListing(tree, code, connections) {
  if (!code || connections < 1 || getAt(tree, ['publica', code]) !== true) return null;
  const gartic = getAt(tree, ['garticRooms', code]);
  if (gartic) {
    if (gartic.state?.phase !== 'lobby') return null;
    const players = Object.keys(gartic.players || {}).length;
    const max = Number(gartic.settings?.maxPlayers) || null;
    if (!players || (max && players >= max)) return null;
    return { code, game: 'gartic', host: gartic.players?.[gartic.hostId]?.name || '', players, max };
  }
  const raw = getAt(tree, ['rooms', code]);
  if (typeof raw !== 'string') return null;
  let room;
  try { room = JSON.parse(raw); } catch { return null; }
  if (!room || room.phase !== 'lobby' || room.isTrainingMode || room.isLocalGame) return null;
  const game = room.gameType || 'codigo-secreto';
  const list = Array.isArray(room.players) ? room.players : [];
  const max = MAX[game] || null;
  if (!list.length || (max && list.length >= max)) return null;
  const host = list.find((p) => p?.id === room.hostId)?.name || list[0]?.name || '';
  return { code, game, host: String(host).slice(0, 24), players: list.length, max };
}

// Las que se muestran: sin vencidas, las más nuevas primero, con tope.
export function visibleListings(entries, now) {
  return entries
    .filter((e) => e && now - e.at < LISTING_TTL_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LISTED);
}
