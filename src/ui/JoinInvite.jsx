// Pantalla para cuando entrás con el link de una sala: «Te estás uniendo a la sala de X», el código,
// tu nombre (y avatar, si el juego lo usa) y un solo botón para entrar. Cada juego la muestra en vez de
// su pantalla de entrada mientras la dirección tenga `?sala=`; «crear mi propia sala» vuelve a la normal.
import React from 'react';
import { AVATARS } from './store.js';
import { gameById, gameUrl } from './games.js';
import { useRoomInfo } from './rooms.js';
import { isFull } from './roomSummary.js';
import { useAutoJoin } from './mudanza.js';

export default function JoinInvite({
  gameId, code, name, onName, avatar, onAvatar, maxName = 20, busy, error, onJoin, onCancel, onBack,
}) {
  const game = gameById(gameId);
  const info = useRoomInfo(code);
  const other = info && info.game !== gameId ? gameById(info.game) : null;
  const full = isFull(info);
  const started = info && info.phase !== 'lobby';
  const canJoin = Boolean(info) && !other && !full && name.trim().length > 0 && !busy;
  // Siguiendo al anfitrión que cambió de juego: se entra solo.
  useAutoJoin(canJoin, onJoin);

  let title;
  if (info === undefined) title = 'Buscando la sala…';
  else if (!info) title = 'No encontramos esa sala';
  else if (info.host) title = <>Te estás uniendo a la sala de <span className="tf-invite-host">{info.hostAvatar} {info.host}</span></>;
  else title = 'Te estás uniendo a una sala';

  return (
    <div className="tf-invite" style={{ '--chip-color': game?.color }} data-invite={code}>
      {onBack && (
        <button type="button" className="tf-link-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Todos los juegos
        </button>
      )}
      <div className="tf-invite-art" aria-hidden="true">{game?.emoji}</div>
      <p className="tf-eyebrow">{game?.title}</p>
      <h1 className="tf-invite-title">{title}</h1>
      <div className="tf-invite-code">
        <span>Código</span>
        <strong className="cs-mono">{code}</strong>
      </div>
      {info && !other && (
        <p className="tf-invite-status">
          {info.players === 1 ? '1 jugador en la sala' : `${info.players} jugadores en la sala`}
          {info.max ? ` · entran ${info.max}` : ''}
          {started && ' · la partida ya empezó'}
        </p>
      )}
      {info === null && <p className="tf-invite-status is-bad">Puede que se haya cerrado o que el link esté mal. Pedile el código de nuevo a quien te lo pasó.</p>}
      {other && <p className="tf-invite-status is-bad">Esta sala es de {other.emoji} {other.title}. <a href={gameUrl(info.game, code)}>Ir a esa sala</a></p>}
      {full && <p className="tf-invite-status is-bad">La sala está llena.</p>}

      <form className="tf-invite-card" onSubmit={(e) => { e.preventDefault(); if (canJoin) onJoin(); }}>
        <label className="tf-field">
          <span>Tu nombre</span>
          <input
            className="tf-input"
            value={name}
            maxLength={maxName}
            placeholder="¿Cómo te llamás?"
            autoComplete="nickname"
            autoFocus
            onChange={(e) => onName(e.target.value)}
          />
        </label>
        {onAvatar && (
          <div className="tf-field">
            <span>Avatar</span>
            <div className="tf-avatar-grid">
              {AVATARS.map((a) => (
                <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => onAvatar(a)}>{a}</button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="tf-invite-error" role="alert">{error}</p>}
        <button type="submit" className="tf-btn tf-btn-primary tf-btn-block tf-invite-join" disabled={!canJoin}>
          {busy ? 'Entrando…' : 'Unirme a la sala'}
        </button>
      </form>
      <button type="button" className="tf-invite-other" onClick={onCancel}>Prefiero crear mi propia sala</button>
    </div>
  );
}
