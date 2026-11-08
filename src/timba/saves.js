// Partidas guardadas en este dispositivo. Las salas se cierran solas tras 15 minutos sin actividad, y una partida de
// La Timba (hasta 12 días de 5 minutos) dura más: cada pantalla guarda su copia de la sala mientras se juega y de ahí se
// retoma en una sala nueva (ver `roomFromSave` en game.js). Es local al navegador: no viaja por el servidor.
const KEY = 'tf:timba:guardadas';
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

// Lo que le queda al día, en milisegundos, a la hora `now` del servidor.
export const dayLeftAt = (room, now) => (room.day.endsAt && !room.day.over ? Math.max(0, room.day.endsAt - now) : 0);

// Guarda (o pisa) la partida `room.saveId`. `seat` es quién era este dispositivo y `now` la hora del servidor: el reloj del
// día es una hora del servidor, así que se guarda lo que quedaba (`dayLeft`) y no la hora.
export function saveGame(room, seat, now = Date.now()) {
  if (!room?.saveId || room.phase !== 'playing') return;
  const rest = read().filter((s) => s.id !== room.saveId);
  const entry = { id: room.saveId, savedAt: Date.now(), seat, dayLeft: dayLeftAt(room, now), room };
  write([entry, ...rest].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVES));
}

// Agrega una partida que vino de un archivo (ver saveFile.js), conservando su fecha. Pisa la que tenga el mismo id.
export function addSave(save) {
  const rest = read().filter((s) => s.id !== save.id);
  write([save, ...rest].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVES));
}

export function deleteSave(id) {
  write(read().filter((s) => s.id !== id));
}

// Qué mostrar de cada guardado: quiénes juegan y cuánto va.
export function describeSave(save) {
  const { room } = save;
  return {
    names: room.players.map((p) => p.name),
    day: room.day.n,
    money: room.money,
    quota: room.day.quota,
    when: new Date(save.savedAt),
  };
}
