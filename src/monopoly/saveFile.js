// Archivo de partida: sirve para llevar una partida guardada a otra compu (o a otro navegador).
// Es JSON de texto, así que se puede abrir y leer. Se hacen dos controles al cargarlo:
//  - la firma: si alguien lo editó a mano sin recalcularla, avisa. Es un freno para curiosos, no seguridad:
//    todo corre en el navegador, así que quien lea este código puede recalcularla.
//  - la validación: rechaza archivos rotos o incoherentes (una propiedad con dos dueños, plata inventada, etc.).
import { SQUARES } from './board.js';
import { MAX_PLAYERS } from './game.js';
import { fileStamp, hash53 } from '../lobby/saveFiles.js';

export const FILE_KIND = 'tareas-fondeanas/monopoly';
export const FILE_VERSION = 1;
const MAX_FILE_CHARS = 200_000;
const SALT = 'tf-monopoly-guardado-1';

export const signature = (text) => hash53(SALT, text);

const body = (save) => JSON.stringify({ id: save.id, savedAt: save.savedAt, seat: save.seat, room: save.room });

// El texto del archivo para una partida guardada (`{ id, savedAt, seat, room }`).
export function exportSave(save) {
  const data = JSON.parse(body(save));
  return JSON.stringify({ kind: FILE_KIND, v: FILE_VERSION, sig: signature(JSON.stringify(data)), data }, null, 1);
}

// Nombre sugerido para el archivo: fecha y jugadores.
export const saveFileName = (save) => `monopoly-${fileStamp(save.savedAt, save.room.players.filter((p) => !p.out).map((p) => p.name))}.json`;

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
