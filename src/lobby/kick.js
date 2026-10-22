// Sacar a alguien de la sala (lo hace el anfitrión, desde la sala de espera). Lógica pura: cada reducer la
// atiende igual, aplicando el `leave` de ese jugador y anotándolo en `kicked`, así desde esa pantalla no
// puede volver a entrar a esta sala.
export const MAX_KICKED = 10;

// A quién saca la acción `kick` (o null si no vale): solo el anfitrión, a otro que esté en la sala, y en
// una de las fases de sala de espera del juego.
export function kickTarget(room, action, phases = ['lobby']) {
  if (!room || room.hostId !== action.playerId || action.target === action.playerId) return null;
  if (!phases.includes(room.phase)) return null;
  return room.players?.some((p) => p.id === action.target) ? action.target : null;
}

export function markKicked(room, id) {
  room.kicked = [...(room.kicked || []).filter((x) => x !== id), id].slice(-MAX_KICKED);
  return room;
}

export const isKicked = (room, id) => Boolean(room?.kicked?.includes(id));
