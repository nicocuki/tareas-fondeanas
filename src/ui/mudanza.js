// Cambiar de juego desde la sala de espera, con los mismos jugadores.
//
// 1. El anfitrión elige otro juego (ChangeGame): se anota la mudanza en `sessionStorage` y la pestaña
//    va a la entrada de ese juego con `?mudanza=1`.
// 2. La entrada crea la sala sola (`useAutoCreate`) con el nombre y el avatar del perfil.
// 3. Cuando el juego registra su sala nueva (`useRegisterRoom` → `finishMove`), se escribe
//    `mudanza/{sala vieja}` = «juego/CÓDIGO» y la marca de pública pasa a la sala nueva.
// 4. Los que estaban en la sala de espera vieja lo ven (`useMoveWatch`) y van al link de la sala nueva con
//    `&auto=1`: la pantalla de invitación entra sola (`useAutoJoin`).
//
// Va aparte de las salas (como `publica/`), así ningún reducer tuvo que cambiar. La sala vieja queda sola
// y se cierra por inactividad.
import { useEffect, useRef } from 'react';
import { onValue, ref, set } from '../realtime.js';
import { gameUrl } from './games.js';
import { setRoomPublic } from './publicas.js';

const KEY = 'tf:mudanza';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (v) => { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch {} };
const param = (name) => new URLSearchParams(window.location.search).get(name);
// Saca la marca de la dirección, así recargar la página no la vuelve a usar.
function dropParam(name) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(null, '', url.toString());
}

// El anfitrión se muda: `from` es el código de la sala de espera actual y `pub`, si era pública.
export function startMove(from, game, pub) {
  write({ from, game, pub: Boolean(pub), at: Date.now() });
  window.location.assign(`${window.location.origin}/?juego=${encodeURIComponent(game)}&mudanza=1`);
}

// La entrada del juego al que se mudó el anfitrión: crea la sala sola, una vez. `ready` = ya se puede
// crear (por ejemplo, hay nombre).
export function useAutoCreate(create, ready = true) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready || param('mudanza') !== '1') return;
    const move = read();
    if (!move || Date.now() - move.at > 60000) return;
    done.current = true;
    dropParam('mudanza');
    create();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Lo llama useRegisterRoom: si esta pestaña venía mudándose a este juego, avisa en la sala vieja.
export function finishMove(game, code) {
  const move = read();
  if (!move || move.game !== game || move.from === code) return;
  write(null);
  set(ref(`mudanza/${move.from}`), `${game}/${code}`).catch(() => {});
  if (move.pub) {
    setRoomPublic(code, true).catch(() => {});
    setRoomPublic(move.from, false).catch(() => {});
  }
}

// En la sala de espera: si el anfitrión se mudó, ir atrás de él.
export function useMoveWatch(code) {
  useEffect(() => {
    if (!code) return undefined;
    return onValue(ref(`mudanza/${code}`), (snap) => {
      const m = /^([a-z-]+)\/([A-Z]{4})$/.exec(String(snap.val() || ''));
      if (m && m[2] !== code) window.location.assign(`${gameUrl(m[1], m[2])}&auto=1`);
    });
  }, [code]);
}

// La invitación de la sala nueva entra sola si se llegó siguiendo al anfitrión. `ready` = se puede entrar.
export function useAutoJoin(ready, join) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready || param('auto') !== '1') return;
    done.current = true;
    dropParam('auto');
    join();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
