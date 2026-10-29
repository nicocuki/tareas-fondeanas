// Partidas guardadas en este dispositivo. Las salas se cierran solas tras 15 minutos sin actividad, y una partida de
// Monopoly dura mucho más: cada pantalla guarda su copia de la sala mientras se juega y de ahí se retoma en una sala
// nueva (ver `roomFromSave` en game.js). Es local al navegador: no viaja por el servidor.
const KEY = 'tf:monopoly:guardadas';
export const MAX_SAVES = 5;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list.filter((s) => s && s.id && s.room?.players) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

// Las más nuevas primero.
export const listSaves = () => read().sort((a, b) => b.savedAt - a.savedAt);

// Guarda (o pisa) la partida `room.saveId`. `seat` es quién era este dispositivo.
export function saveGame(room, seat, now = Date.now()) {
  if (!room?.saveId || room.phase !== 'playing') return;
  const rest = read().filter((s) => s.id !== room.saveId);
  const entry = { id: room.saveId, savedAt: now, seat, room };
  write([entry, ...rest].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVES));
}

export function deleteSave(id) {
  write(read().filter((s) => s.id !== id));
}

// Qué mostrar de cada guardado: quiénes juegan y cuánto va.
export function describeSave(save) {
  const { room } = save;
  const alive = room.players.filter((p) => !p.out);
  return {
    names: alive.map((p) => p.name),
    turn: room.turnNo,
    when: new Date(save.savedAt),
  };
}
