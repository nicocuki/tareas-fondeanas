// sessionStorage (por pestaña): recargar la página no te saca de la partida.
// localStorage (por dispositivo): si volvés a entrar a la misma sala con el mismo nombre, seguís siendo el mismo jugador.
const SESSION_KEY = 'codigo-secreto:sesion';
const NAME_KEY = 'codigo-secreto:nombre';

function parse(raw) {
  try {
    const s = JSON.parse(raw);
    return s && /^[A-Z]{4}$/.test(s.code) && s.playerId && s.name ? s : null;
  } catch {
    return null;
  }
}

export function loadSession(urlCode) {
  try {
    const tab = parse(sessionStorage.getItem(SESSION_KEY));
    return tab && (!urlCode || tab.code === urlCode) ? tab : null;
  } catch {
    return null;
  }
}

export function savedPlayerId(code, name) {
  try {
    const saved = parse(localStorage.getItem(SESSION_KEY));
    return saved && saved.code === code && saved.name === name ? saved.playerId : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    const raw = JSON.stringify(session);
    sessionStorage.setItem(SESSION_KEY, raw);
    localStorage.setItem(SESSION_KEY, raw);
    localStorage.setItem(NAME_KEY, session.name);
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}
