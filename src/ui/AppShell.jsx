// Marco de toda la página: header fijo, menú lateral y avisos. Los juegos van adentro.
import React, { useEffect, useRef, useState } from 'react';
import { GAMES, gameById } from './games.js';
import { copyInvite, syncProfileName, useCurrentRoom, useProfile, useToast } from './store.js';
import SideMenu from './SideMenu.jsx';

export function Logo({ size = 34 }) {
  // Un avioncito de papel: lo que se tira desde el fondo del aula.
  return (
    <svg className="tf-logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <path d="M9 20.5 30 11l-6.5 19-4.2-6.6L9 20.5Z" fill="var(--on-accent)" />
      <path d="m19.3 23.4 10.7-12.4-12.2 10.5" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function RoomChip({ room }) {
  const game = gameById(room.game);
  return (
    <button
      type="button"
      className="tf-room-chip"
      onClick={() => copyInvite(room.game, room.code)}
      title="Copiar link de invitación"
      style={{ '--chip-color': game?.color }}
    >
      <span className="tf-room-chip-game" aria-hidden="true">{game?.emoji}</span>
      <span className="tf-room-chip-label">Sala</span>
      <strong className="tf-room-chip-code">{room.code}</strong>
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" className="tf-room-chip-icon">
        <rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="tf-sr">Copiar link de invitación</span>
    </button>
  );
}

// Pantalla completa de toda la página (el header queda, para poder salir o cambiar de juego).
// Mario vs Luigi tiene la suya, que agranda solo el iframe de Unity.
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const canFullscreen = () => {
  const el = document.documentElement;
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled) && Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
};

function FullscreenButton() {
  const [on, setOn] = useState(() => Boolean(fullscreenElement()));

  useEffect(() => {
    const sync = () => setOn(Boolean(fullscreenElement()));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  if (!canFullscreen()) return null; // el iPhone no deja: mejor no mostrar un botón que no hace nada

  function toggle() {
    const el = document.documentElement;
    const result = fullscreenElement()
      ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    result?.catch?.(() => {});
  }

  const label = on ? 'Salir de pantalla completa' : 'Pantalla completa';
  return (
    <button type="button" className="tf-icon-btn" onClick={toggle} aria-label={label} title={label} data-fullscreen={on ? 'on' : 'off'}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {on
          ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </button>
  );
}

export default function AppShell({ activeGame, onNavigate, children }) {
  const [menu, setMenu] = useState(null); // null = cerrado; si no, la vista del menú
  const room = useCurrentRoom();
  const profile = useProfile();
  const toast = useToast();
  const burger = useRef(null);
  const game = gameById(activeGame);

  useEffect(() => {
    document.title = game ? `${game.title} · Tareas Fondeanas` : 'Tareas Fondeanas · juegos para jugar con amigos';
  }, [game]);

  function close() {
    setMenu(null);
    burger.current?.focus();
  }

  return (
    <div className="tf-app" style={{ '--game-color': game?.color || 'var(--accent)' }}>
      <header className="tf-header">
        <div className="tf-header-inner">
          <button
            ref={burger}
            type="button"
            className="tf-icon-btn"
            aria-label="Abrir menú"
            aria-expanded={Boolean(menu)}
            onClick={() => { syncProfileName(); setMenu('main'); }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>

          <button type="button" className="tf-brand" onClick={() => onNavigate('menu')} aria-label="Tareas Fondeanas: ir al inicio">
            <Logo />
            <span className="tf-brand-text">
              <span className="tf-brand-name">Tareas Fondeanas</span>
              {game && <span className="tf-brand-game">{game.emoji} {game.title}</span>}
            </span>
          </button>

          <div className="tf-header-right">
            {room && <RoomChip room={room} />}
            {game && game.id !== 'mvl' && <FullscreenButton />}
            <button type="button" className="tf-avatar-btn" onClick={() => { syncProfileName(); setMenu('perfil'); }} aria-label="Tu perfil">
              <span aria-hidden="true">{profile.avatar}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="tf-main" id="contenido">{children}</main>

      <SideMenu
        view={menu}
        onView={setMenu}
        onClose={close}
        activeGame={activeGame}
        onNavigate={(id, code) => { onNavigate(id, code); setMenu(null); }}
        games={GAMES}
      />

      <div className="tf-toast-wrap" aria-live="polite">
        {toast && <div key={toast.id} className="tf-toast">{toast.text}</div>}
      </div>
    </div>
  );
}
