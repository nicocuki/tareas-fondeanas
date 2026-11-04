// Archivo de partida: sirve para llevar una partida guardada a otra compu (o a otro navegador).
// Es JSON de texto, así que se puede abrir y leer. Se hacen dos controles al cargarlo:
//  - la firma: si alguien lo editó a mano sin recalcularla, avisa. Es un freno para curiosos, no seguridad:
//    todo corre en el navegador, así que quien lea este código puede recalcularla.
//  - la validación: rechaza archivos rotos o incoherentes (una propiedad con dos dueños, plata inventada, etc.).
import { SQUARES } from './board.js';
import { MAX_PLAYERS } from './game.js';

export const FILE_KIND = 'tareas-fondeanas/monopoly';
export const FILE_VERSION = 1;
const MAX_FILE_CHARS = 200_000;
const SALT = 'tf-monopoly-guardado-1';

// Hash de 53 bits (cyrb53): alcanza para detectar ediciones, no para resistir a alguien que quiera falsificar.
export function signature(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = SALT + text;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const body = (save) => JSON.stringify({ id: save.id, savedAt: save.savedAt, seat: save.seat, room: save.room });

// El texto del archivo para una partida guardada (`{ id, savedAt, seat, room }`).
export function exportSave(save) {
  const data = JSON.parse(body(save));
  return JSON.stringify({ kind: FILE_KIND, v: FILE_VERSION, sig: signature(JSON.stringify(data)), data }, null, 1);
}

// Nombre sugerido para el archivo: fecha y jugadores.
export function saveFileName(save) {
  const d = new Date(save.savedAt);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const names = save.room.players.filter((p) => !p.out).map((p) => p.name).join('-').replace(/[^\p{L}\p{N}-]+/gu, '').slice(0, 40);
  return `monopoly-${stamp}${names ? `-${names}` : ''}.json`;
}

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Devuelve un texto con el problema, o null si la partida es coherente.
export function roomProblem(room) {
  if (!room || typeof room !== 'object') return 'no tiene una partida adentro';
  if (room.gameType !== 'monopoly') return 'no es una partida de Monopoly';
  if (room.phase !== 'playing') return 'la partida no estaba en juego';
  const players = room.players;
  if (!Array.isArray(players) || players.length < 2 || players.length > MAX_PLAYERS) return 'la cantidad de jugadores no es válida';
  const ids = new Set();
  for (const p of players) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) return 'hay jugadores repetidos o rotos';
    ids.add(p.id);
    if (typeof p.name !== 'string') return 'un jugador no tiene nombre';
    if (!isInt(p.cash, -1_000_000, 1_000_000_000)) return `la plata de ${p.name} no es válida`;
    if (!isInt(p.pos, 0, SQUARES.length - 1)) return `la posición de ${p.name} no es válida`;
  }
  if (!players.some((p) => !p.out)) return 'no queda nadie jugando';
  if (!room.props || typeof room.props !== 'object' || Array.isArray(room.props)) return 'faltan las propiedades';
  for (const [key, st] of Object.entries(room.props)) {
    const pos = Number(key);
    const sq = SQUARES[pos];
    if (!Number.isInteger(pos) || !sq || !['street', 'station', 'utility'].includes(sq.t)) return `la casilla ${key} no se puede comprar`;
    if (!st || !ids.has(st.o)) return `la casilla ${sq.name} tiene un dueño que no existe`;
    if (st.h !== undefined && !isInt(st.h, 0, sq.t === 'street' ? 5 : 0)) return `los edificios de ${sq.name} no son válidos`;
  }
  return null;
}

// Lee el texto de un archivo. Devuelve `{ save }` o `{ error }` (en castellano, para mostrarlo tal cual).
export function parseSaveFile(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'El archivo está vacío.' };
  if (text.length > MAX_FILE_CHARS) return { error: 'El archivo es demasiado grande para ser una partida.' };
  let file;
  try { file = JSON.parse(text); } catch { return { error: 'Ese archivo no es una partida: no se puede leer.' }; }
  if (!file || file.kind !== FILE_KIND || !file.data) return { error: 'Ese archivo no es una partida de Monopoly de Tareas Fondeanas.' };
  if (file.v !== FILE_VERSION) return { error: 'Ese archivo es de otra versión del juego y no se puede abrir.' };
  if (file.sig !== signature(JSON.stringify(file.data))) return { error: 'El archivo fue modificado a mano, así que no se puede abrir.' };
  const { data } = file;
  if (!data.id || !Number.isFinite(data.savedAt) || typeof data.seat !== 'string') return { error: 'Al archivo le faltan datos de la partida.' };
  const problem = roomProblem(data.room);
  if (problem) return { error: `El archivo no es válido: ${problem}.` };
  return { save: { id: String(data.id), savedAt: data.savedAt, seat: data.seat, room: data.room } };
}
