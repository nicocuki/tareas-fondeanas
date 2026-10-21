// Quién puede leer y escribir cada rama. Reemplaza a database.rules.json de Firebase.
//
// Cada sala (código de 4 letras) vive en su propio Durable Object, así que una pantalla solo
// puede tocar las ramas de la sala a la que se conectó. Las ramas de Trazo Loco conservan la
// privacidad que tenían en Firebase: durante la partida nadie lee las entregas de los demás,
// salvo la que le toca continuar.
import { previousAuthor } from '../src/gartic/game.js';
import { MAX_DRAWING, MAX_STROKES, MAX_TEXT } from '../src/gartic/game.js';
import { getAt } from './tree.js';

export const ROOTS = ['rooms', 'futbol', 'garticRooms', 'garticPresence', 'garticReady', 'garticSteps', 'mecha', 'tiros', 'nave', 'cohetes', 'publica'];
// `publica/{sala}`: true si el anfitrión la quiere en la lista de la portada (ver publicas.js).

// Fotos del fútbol: cambian muchas veces por segundo y no hace falta guardarlas en disco.
// Si la sala se duerme (nadie conectado) se pierden, y está bien.
const EPHEMERAL_FUTBOL = new Set(['players', 'ball', 'signal', 'peers']);
// Lo mismo con lo que se va escribiendo en La Mecha (`mecha/{sala}/typing`).
// Y todo lo de A los Tiros (`tiros/{sala}`), Entre Nosotros (`nave/{sala}`) y Cohete Royale
// (`cohetes/{sala}`): fotos y señalización.
export const isEphemeral = (segs) => (segs[0] === 'futbol' && EPHEMERAL_FUTBOL.has(segs[2])) || segs[0] === 'mecha' || segs[0] === 'tiros' || segs[0] === 'nave' || segs[0] === 'cohetes';

// Cada cuánto se parte el árbol para guardarlo: cada dibujo de Trazo Loco va aparte, porque
// pueden pesar cientos de KB y un solo valor guardado no puede pasar de 2 MB.
export const unitDepth = (root) => (root === 'garticSteps' ? 5 : root === 'futbol' || root === 'tiros' || root === 'nave' || root === 'cohetes' ? 3 : 2);

export const MAX_ROOM_STRING = 30000;

export function checkPath(segs, code) {
  return segs.length >= 2 && ROOTS.includes(segs[0]) && segs[1] === code;
}

export function canRead(segs, uid, tree) {
  if (segs[0] !== 'garticSteps') return true;
  if (segs.length < 3) return false;
  const state = getAt(tree, ['garticRooms', segs[1], 'state']);
  const match = segs[2];
  // En la revelación de esa partida se ve todo.
  if (state?.match === match && state.phase === 'reveal') return true;
  if (segs.length < 5 || !uid) return false;
  const round = Number(segs[3]);
  const author = segs[4];
  if (author === uid) return true;
  return Boolean(
    state?.match === match && state.phase === 'playing' && state.round === round + 1
      && state.positions?.[uid] !== undefined && previousAuthor(state, uid) === author,
  );
}

// `value` ya viene normalizado. Devuelve un texto con el motivo si no se permite, o null si sí.
export function writeError(segs, uid, value, tree) {
  const [root] = segs;
  if (root === 'rooms') {
    if (segs.length !== 2) return 'Las salas se escriben enteras.';
    if (value !== null && (typeof value !== 'string' || value.length >= MAX_ROOM_STRING)) return 'La sala es demasiado grande.';
    return null;
  }
  if (root === 'publica') {
    if (segs.length !== 2 || (value !== true && value !== null)) return 'La sala es pública (true) o no (null).';
    return null;
  }
  if (root === 'garticPresence') {
    if (segs.length < 3 || segs[2] !== uid) return 'Solo podés marcar tu propia conexión.';
    return null;
  }
  if (root === 'garticReady') {
    if (segs.length < 5 || segs[4] !== uid) return 'Solo podés confirmar tu propia entrega.';
    return null;
  }
  if (root === 'garticSteps') {
    if (segs.length < 5 || segs[4] !== uid) return 'Solo podés escribir tu propia entrega.';
    if (getAt(tree, ['garticReady', ...segs.slice(1, 5)]) !== null) return 'Esa entrega ya se confirmó.';
    const content = segs.length === 5 ? value?.content : null;
    if (typeof content === 'string' && content.length > MAX_DRAWING + MAX_TEXT) return 'La entrega es demasiado grande.';
    const strokes = segs.length === 5 ? value?.strokes : null;
    if (typeof strokes === 'string' && strokes.length > MAX_STROKES) return 'Los trazos del dibujo pesan demasiado.';
    return null;
  }
  return null;
}
