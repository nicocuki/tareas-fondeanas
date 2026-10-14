// Sala pública o privada: el interruptor de la sala de espera y la casilla de «crear como pública».
// Los usan LobbyLayout y GameHero, y Trazo Loco, que tiene su propio diseño.
import React, { useEffect, useRef } from 'react';
import { setRoomPublic, usePublicFlag } from '../ui/publicas.js';
import { setPrefs, usePrefs } from '../ui/store.js';

const SEEN_KEY = 'tf:salas-vistas';
// La primera vez que el anfitrión ve su sala recién creada, se aplica «Crear la sala como pública».
function firstLook(code) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
    if (seen.includes(code)) return false;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, code].slice(-20)));
  } catch {}
  return true;
}

// Pública (en la lista de la portada) o privada (solo con el código). La cambia el anfitrión.
export function PublicSwitch({ code, host, players, className = '' }) {
  const isPublic = usePublicFlag(code);
  const { publicRooms } = usePrefs();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !host || isPublic === undefined) return;
    checked.current = true;
    if (firstLook(code) && publicRooms && !isPublic && players === 1) setRoomPublic(code, true).catch(() => {});
  }, [code, host, isPublic, publicRooms, players]);
  if (isPublic === undefined || (!host && !isPublic)) return null;
  const text = isPublic ? 'Aparece en la portada: cualquiera puede entrar sin el código.' : 'Solo entra quien tenga el código o el link.';
  return (
    <div className={`tf-public-switch ${className}`}>
      {host ? (
        <button type="button" role="switch" aria-checked={isPublic} className={`tf-public-toggle${isPublic ? ' is-on' : ''}`} data-public-switch onClick={() => setRoomPublic(code, !isPublic).catch(() => {})}>
          <span className="tf-public-knob" aria-hidden="true" />
          {isPublic ? '🌐 Sala pública' : '🔒 Sala privada'}
        </button>
      ) : (
        <strong>🌐 Sala pública</strong>
      )}
      <small>{text}</small>
    </div>
  );
}

// Preferencia de quien crea la sala: que arranque pública.
export function PublicCheckbox() {
  const { publicRooms } = usePrefs();
  return (
    <label className="tf-public-check">
      <input type="checkbox" checked={publicRooms} onChange={(e) => setPrefs({ publicRooms: e.target.checked })} data-public-default />
      <span>
        <strong>Crear la sala como pública</strong>
        <small>Aparece en la portada y cualquiera entra sin el código. Se puede cambiar en la sala de espera.</small>
      </span>
    </label>
  );
}
