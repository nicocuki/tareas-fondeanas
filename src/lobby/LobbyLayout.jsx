// La sala de espera de todos los juegos. Una sola pantalla, sin scroll: a la izquierda el panel del juego (su nombre,
// el código de sala y los botones de la sala) y a la derecha, en horizontal, los jugadores y las opciones, con el botón
// de empezar siempre abajo. Cada juego se pone su identidad con `game` (colores, dibujo, tipografía: `themes.js`).
//
// Lo que cada juego pasa de hijos se reparte solo en cuatro lugares, según un `data-lb` que le pone el juego:
//   players → jugadores o equipos · options → opciones (`LobbyOptions` ya cuenta) · help → «cómo se juega»
//   (va en una ventana que se abre con un botón, así no gasta lugar) · start → el botón de empezar y su estado
//   (`LobbyActionSection` ya cuenta). Sin `data-lb`, va con las opciones (y `LobbyOptions` también, salvo que le pongan otro).
import React, { Children, isValidElement, useEffect, useState } from 'react';
import { PublicSwitch } from './PublicRoom.jsx';
import ChangeGame from './ChangeGame.jsx';
import KickPlayers from './KickPlayers.jsx';
import LobbyOptions from './LobbyOptions.jsx';
import LobbyActionSection from './LobbyActionSection.jsx';
import { InLobby } from './context.js';
import { lobbyTheme } from './themes.js';
import { useMoveWatch } from '../ui/mudanza.js';
import './lobby.css';

function slotOf(child) {
  if (!isValidElement(child)) return 'options';
  if (child.props['data-lb']) return child.props['data-lb'];
  if (child.type === LobbyActionSection) return 'start';
  return 'options';
}

// Los hijos, repartidos por lugar (los fragmentos se abren).
function flatten(children) {
  const out = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === React.Fragment) out.push(...flatten(child.props.children));
    else if (child !== null && child !== undefined && child !== false) out.push(child);
  });
  return out;
}

function Help({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lb-help" role="dialog" aria-modal="true" aria-label="Cómo se juega" onClick={onClose}>
      <div className="lb-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="lb-help-body">{children}</div>
        <button type="button" className="tf-btn tf-btn-primary" onClick={onClose}>Entendido</button>
      </div>
    </div>
  );
}

export default function LobbyLayout({
  code,
  game,
  layout = 'split', // 'split': jugadores a la izquierda y opciones a la derecha · 'teams': los equipos arriba, a todo lo ancho
  gameTitle = 'sala de espera',
  subtitle,
  copied = false,
  onCopyInvite,
  onLeave,
  leaveText = 'Salir',
  banners,
  unassignedPlayers,
  host = false, // si es true, puede hacer la sala pública o privada
  players = 0, // cuántos hay en la sala
  roster, // los jugadores ({ id, name, avatar }), para que el anfitrión pueda sacar a alguien con onKick
  me,
  onKick,
  children,
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const displayCode =
    code ||
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
      : '');
  // Si el anfitrión se pasó a otro juego, todos atrás de él.
  useMoveWatch(displayCode);

  const theme = lobbyTheme(game);
  const slots = { players: [], options: [], help: [], start: [] };
  flatten(children).forEach((child, i) => {
    const key = slotOf(child);
    (slots[key] || slots.options).push(isValidElement(child) && child.key == null ? React.cloneElement(child, { key: `${key}${i}` }) : child);
  });
  const hasOptions = slots.options.length > 0;
  const title = theme.name || gameTitle;
  // «Armá el Meme · sala de espera» → «Sala de espera»; «modo entrenamiento» queda como viene.
  const eyebrow = gameTitle.split('·').pop().trim().replace(/^./, (c) => c.toUpperCase());

  return (
    <InLobby.Provider value>
    <div
      className="tf-lobby lb"
      data-game={game}
      data-tone={theme.tone}
      data-pattern={theme.pattern}
      data-font={theme.font}
      data-tile={theme.tile}
      data-motion={theme.motion}
      style={{ '--lb-a': theme.a, '--lb-b': theme.b, '--lb-ink': theme.ink, '--lb-accent': theme.accent }}
    >
      <aside className="lb-rail">
        <div className="lb-art" aria-hidden="true">
          <span className="lb-emoji">{theme.emoji}</span>
          {theme.deco.map((d, i) => <span key={i} className={`lb-deco lb-deco-${i}`}>{d}</span>)}
        </div>
        <div className="lb-title">
          <p className="lb-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {theme.tagline && <p className="lb-tag">{theme.tagline}</p>}
        </div>
        <div className="lb-code" aria-label={`Código de sala ${displayCode}`}>
          {displayCode.split('').map((letter, i) => <span key={i}>{letter}</span>)}
        </div>
        <div className="lb-actions">
          {onCopyInvite && (
            <button type="button" className="tf-btn tf-btn-primary" onClick={onCopyInvite}>
              {copied ? '¡Link copiado!' : 'Copiar link'}
            </button>
          )}
          {onLeave && (
            <button type="button" className="tf-btn lb-leave" onClick={onLeave}>
              {leaveText}
            </button>
          )}
        </div>
        {subtitle && <p className="lb-sub">{subtitle}</p>}
        <div className="lb-tools">
          {displayCode && (host || players > 0) && <PublicSwitch code={displayCode} host={host} players={players} />}
          <div className="lb-tools-row">
            <ChangeGame code={displayCode} host={host} players={players} />
            <KickPlayers roster={roster} me={me} host={host} onKick={onKick} />
            {slots.help.length > 0 && (
              <button type="button" className="tf-btn lb-help-open" data-lb-help onClick={() => setHelpOpen(true)}>📖 Cómo se juega</button>
            )}
          </div>
        </div>
      </aside>

      <section className="lb-stage">
        {banners && <div className="lb-banners">{banners}</div>}
        {unassignedPlayers && unassignedPlayers.length > 0 && (
          <div className="tf-lobby-unassigned">
            Sin equipo: {unassignedPlayers.map((p) => p.name).join(', ')}
          </div>
        )}
        <div className={`lb-main${hasOptions ? '' : ' is-solo'}${layout === 'teams' ? ' is-teams' : ''}`}>
          <div className="lb-col lb-col-players">{slots.players}</div>
          {hasOptions && <div className="lb-col lb-col-options">{slots.options}</div>}
        </div>
        {slots.start.length > 0 && <div className="lb-foot">{slots.start}</div>}
      </section>

      {helpOpen && <Help onClose={() => setHelpOpen(false)}>{slots.help}</Help>}
    </div>
    </InLobby.Provider>
  );
}
