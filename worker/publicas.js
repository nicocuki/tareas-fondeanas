// Salas públicas: las que el anfitrión marcó para que aparezcan en la portada.
//
// Cada sala decide sola si se lista (`roomListing`, con lo que tiene guardado) y le avisa al
// Directorio (un Durable Object único) cuando eso cambia. La portada escucha al Directorio por un
// WebSocket. Sin nada de Cloudflare: se prueba con `node --test`.
import { getAt } from './tree.js';
import { isFull, summarizeRoom } from '../src/ui/roomSummary.js';

export const MAX_LISTED = 40;
// Una sala que no avisa nada en seis horas se deja de mostrar, por si se perdió el aviso de cierre.
export const LISTING_TTL_MS = 6 * 60 * 60 * 1000;

// Qué mostrar de la sala `code` en la portada, o null si no corresponde listarla:
// no es pública, no está en la sala de espera, está llena o no hay nadie conectado.
export function roomListing(tree, code, connections) {
  if (!code || connections < 1 || getAt(tree, ['publica', code]) !== true) return null;
  const sum = summarizeRoom(code, getAt(tree, ['garticRooms', code]), getAt(tree, ['rooms', code]));
  if (!sum || sum.phase !== 'lobby' || sum.local || !sum.players || isFull(sum)) return null;
  return { code, game: sum.game, host: sum.host, players: sum.players, max: sum.max };
}

// Las que se muestran: sin vencidas, las más nuevas primero, con tope.
export function visibleListings(entries, now) {
  return entries
    .filter((e) => e && now - e.at < LISTING_TTL_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_LISTED);
}
