// Chat de la partida que se abre con T (T.E.G., Monopoly, Pixel Royale, Cohete Royale, A los Tiros
// y Fútbol). Va aparte de las salas, en `chat/{código}` (como `publica/` y `mudanza/`), así ningún
// reducer tuvo que cambiar.
//
// Igual que las salas, es un solo string JSON: `{ s, m }`, con `s` el número del último mensaje
// (sirve de clave estable) y `m` los mensajes `{ k, i, n, x, t }` (número, id del jugador, nombre,
// texto, hora). Se escribe con transacción, así dos mensajes al mismo tiempo no se pisan.

// El chat global del menú principal vive en la sala fija `MENU` (`chat/MENU`): solo lo ven los que están en
// la portada, porque se conecta únicamente mientras esa pantalla está abierta (ver `MenuChat` en Home.jsx).
export const MENU_CHAT_CODE = 'MENU';

export const CHAT_LEN = 140;
export const MAX_MESSAGES = 40;
export const MAX_NAME = 24;
// Tope del string entero en el servidor (`worker/rules.js`). El peor caso, 40 mensajes de 140
// comillas (que se escapan a dos caracteres), da ~14.000.
export const MAX_CHAT_STRING = 20000;

export function cleanChatText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN);
}

export function parseChat(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : null;
    if (value && Array.isArray(value.m)) return { s: Number(value.s) || 0, m: value.m };
  } catch {}
  return { s: 0, m: [] };
}

// Devuelve el string nuevo, o null si no hay nada que mandar (y la transacción no escribe).
export function addChatMessage(raw, { id, name, text, now }) {
  const x = cleanChatText(text);
  if (!x) return null;
  const chat = parseChat(raw);
  const k = chat.s + 1;
  const m = [...chat.m, { k, i: String(id ?? ''), n: String(name ?? '').slice(0, MAX_NAME), x, t: now }].slice(-MAX_MESSAGES);
  return JSON.stringify({ s: k, m });
}
