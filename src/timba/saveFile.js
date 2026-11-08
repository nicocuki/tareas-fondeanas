// Archivo de partida: sirve para llevar una partida guardada a otra compu (o a otro navegador).
// Es JSON de texto, así que se puede abrir y leer. Se hacen dos controles al cargarlo:
//  - la firma: si alguien lo editó a mano sin recalcularla, avisa. Es un freno para curiosos, no seguridad:
//    todo corre en el navegador, así que quien lea este código puede recalcularla.
//  - la validación: rechaza archivos rotos o incoherentes (plata inventada, un lugar que no existe, etc.).
import { fileStamp, hash53 } from '../lobby/saveFiles.js';
import { FLOOR_COUNT } from './casinos.js';
import { MAX_PLAYERS } from './game.js';
import { TOTAL_DAYS } from './quota.js';

export const FILE_KIND = 'tareas-fondeanas/timba';
export const FILE_VERSION = 1;
const MAX_FILE_CHARS = 200_000;
const SALT = 'tf-timba-guardado-1';
const LOCS = new Set(['wait', 'limo', 'outside', 'back', 'elevator', ...Array.from({ length: FLOOR_COUNT }, (_, i) => `f${i + 1}`)]);

export const signature = (text) => hash53(SALT, text);

const body = (save) => JSON.stringify({ id: save.id, savedAt: save.savedAt, seat: save.seat, dayLeft: save.dayLeft, room: save.room });

// El texto del archivo para una partida guardada (`{ id, savedAt, seat, dayLeft, room }`).
export function exportSave(save) {
  const data = JSON.parse(body(save));
  return JSON.stringify({ kind: FILE_KIND, v: FILE_VERSION, sig: signature(JSON.stringify(data)), data }, null, 1);
}

// Nombre sugerido para el archivo: fecha y jugadores.
export const saveFileName = (save) => `timba-${fileStamp(save.savedAt, save.room.players.map((p) => p.name))}.json`;

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Devuelve un texto con el problema, o null si la partida es coherente.
export function roomProblem(room) {
  if (!room || typeof room !== 'object') return 'no tiene una partida adentro';
  if (room.gameType !== 'timba') return 'no es una partida de La Timba';
  if (room.phase !== 'playing') return 'la partida no estaba en juego';
  const players = room.players;
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_PLAYERS) return 'la cantidad de jugadores no es válida';
  const ids = new Set();
  for (const p of players) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) return 'hay jugadores repetidos o rotos';
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name) return 'un jugador no tiene nombre';
    if (!LOCS.has(p.loc)) return `el lugar de ${p.name} no es válido`;
  }
  if (!ids.has(room.hostId)) return 'falta el anfitrión';
  if (!isInt(room.money, 0, 1e13)) return 'la plata de la caja no es válida';
  if (!isInt(room.tickets, 0, 1000)) return 'los tickets no son válidos';
  const { day } = room;
  if (!day || !isInt(day.n, 1, TOTAL_DAYS) || !isInt(day.quota, 0, 1e13)) return 'el día o la cuota no son válidos';
  if (!room.elev || !isInt(room.elev.floor, 0, FLOOR_COUNT)) return 'el ascensor no está en un piso válido';
  if (!room.tb || typeof room.tb !== 'object' || Array.isArray(room.tb)) return 'faltan las mesas';
  if (!room.net || typeof room.net !== 'object' || Array.isArray(room.net)) return 'falta lo ganado y perdido';
  return null;
}

// Lee el texto de un archivo. Devuelve `{ save }` o `{ error }` (en castellano, para mostrarlo tal cual).
export function parseSaveFile(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'El archivo está vacío.' };
  if (text.length > MAX_FILE_CHARS) return { error: 'El archivo es demasiado grande para ser una partida.' };
  let file;
  try { file = JSON.parse(text); } catch { return { error: 'Ese archivo no es una partida: no se puede leer.' }; }
  if (!file || file.kind !== FILE_KIND || !file.data) return { error: 'Ese archivo no es una partida de La Timba de Tareas Fondeanas.' };
  if (file.v !== FILE_VERSION) return { error: 'Ese archivo es de otra versión del juego y no se puede abrir.' };
  if (file.sig !== signature(JSON.stringify(file.data))) return { error: 'El archivo fue modificado a mano, así que no se puede abrir.' };
  const { data } = file;
  if (!data.id || !Number.isFinite(data.savedAt) || typeof data.seat !== 'string' || !isInt(data.dayLeft, 0, 24 * 3600 * 1000)) return { error: 'Al archivo le faltan datos de la partida.' };
  const problem = roomProblem(data.room);
  if (problem) return { error: `El archivo no es válido: ${problem}.` };
  return { save: { id: String(data.id), savedAt: data.savedAt, seat: data.seat, dayLeft: data.dayLeft, room: data.room } };
}
