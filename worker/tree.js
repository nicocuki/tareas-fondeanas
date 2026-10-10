// Árbol de datos de una sala: lógica pura, compartida por el servidor (Durable Object) y el cliente.
//
// Imita lo que hacía Firebase Realtime Database: los datos son un árbol JSON, se escriben por ruta
// («rooms/ABCD», «futbol/ABCD/players/p1») y escribir `null` borra. Como en Firebase, los objetos y
// arrays vacíos no existen: se podan solos. Así el código de los juegos, escrito para Firebase,
// sigue viendo exactamente las mismas formas de datos.

export const SERVER_TIMESTAMP = Object.freeze({ '.sv': 'timestamp' });

const BAD_SEGMENT = /[.#$[\]]/;

// «a/b/c» → ['a', 'b', 'c']. Tira error si la ruta no es válida (igual que Firebase).
export function splitPath(path) {
  const segs = String(path ?? '').split('/').filter(Boolean);
  for (const seg of segs) {
    if (BAD_SEGMENT.test(seg) || seg.length > 200) throw new Error(`Ruta inválida: ${path}`);
  }
  return segs;
}

export const joinPath = (segs) => segs.join('/');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Borra nulls, objetos y arrays vacíos. Devuelve null si no queda nada.
export function normalize(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = value.map(normalize);
    return out.some((v) => v !== null) ? out : null;
  }
  let empty = true;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const n = normalize(v);
    if (n !== null) { out[k] = n; empty = false; }
  }
  return empty ? null : out;
}

// Reemplaza { '.sv': 'timestamp' } por la hora del servidor, en cualquier nivel.
export function resolveServerValues(value, now) {
  if (value === null || typeof value !== 'object') return value;
  if (value['.sv'] === 'timestamp' && Object.keys(value).length === 1) return now;
  if (Array.isArray(value)) return value.map((v) => resolveServerValues(v, now));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = resolveServerValues(v, now);
  return out;
}

export function getAt(root, segs) {
  let node = root;
  for (const seg of segs) {
    if (node === null || typeof node !== 'object') return null;
    node = node[seg];
    if (node === undefined) return null;
  }
  return node ?? null;
}

// Escribe `value` (ya normalizado) en la ruta y devuelve la raíz nueva. Muta la raíz que recibe.
export function setAt(root, segs, value) {
  if (segs.length === 0) return value;
  if (root === null || typeof root !== 'object') {
    if (value === null) return root;
    root = {};
  }
  const [head, ...rest] = segs;
  const next = setAt(root[head] ?? null, rest, value);
  if (next === null || next === undefined) {
    if (Array.isArray(root)) root[head] = null;
    else delete root[head];
  } else {
    root[head] = next;
  }
  // Poda: un contenedor vacío no existe.
  if (Array.isArray(root)) return root.some((v) => v !== null && v !== undefined) ? root : null;
  for (const _ in root) return root; // eslint-disable-line no-unreachable-loop
  return null;
}

// JSON con las claves ordenadas: dos valores iguales dan siempre el mismo texto.
export function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export const clone = (value) => (value === null || typeof value !== 'object' ? value : structuredClone(value));

// ¿`inner` está dentro de `outer` (o es la misma ruta)?
export function isWithin(inner, outer) {
  if (inner.length < outer.length) return false;
  for (let i = 0; i < outer.length; i++) if (inner[i] !== outer[i]) return false;
  return true;
}

// Orden de claves como Firebase: primero las numéricas (de menor a mayor), después el resto.
export function compareKeys(a, b) {
  const na = /^-?\d{1,15}$/.test(a), nb = /^-?\d{1,15}$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function childEntries(value) {
  if (value === null || typeof value !== 'object') return [];
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v]).filter(([, v]) => v !== null && v !== undefined)
    : Object.entries(value);
  return entries.sort(([a], [b]) => compareKeys(a, b));
}

// Claves para `push`: empiezan con la hora, así ordenadas quedan en el orden en que se crearon.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
let lastPushTime = 0;
let lastRandom = [];
export function pushKey(now = Date.now()) {
  const duplicate = now === lastPushTime;
  lastPushTime = now;
  let time = '';
  for (let i = 0, t = now; i < 8; i++) { time = PUSH_CHARS.charAt(t % 64) + time; t = Math.floor(t / 64); }
  if (!duplicate) {
    lastRandom = Array.from({ length: 12 }, () => Math.floor(Math.random() * 64));
  } else {
    let i = 11;
    while (i >= 0 && lastRandom[i] === 63) { lastRandom[i] = 0; i--; }
    if (i >= 0) lastRandom[i]++;
  }
  return time + lastRandom.map((n) => PUSH_CHARS.charAt(n)).join('');
}

export { isPlainObject };

// Identidad de una pestaña sin cuentas: el cliente guarda un secreto y su uid es el hash.
// El servidor recalcula el hash, así nadie puede hacerse pasar por otro sin conocer su secreto.
export async function uidFromSecret(secret) {
  const bytes = new TextEncoder().encode(String(secret));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash.slice(0, 14), (b) => b.toString(16).padStart(2, '0')).join('');
}
