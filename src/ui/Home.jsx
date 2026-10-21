// Portada: saludo, unirse con código, las salas públicas, los juegos, cómo funciona y la última novedad.
import React from 'react';
import { GAMES, gameById } from './games.js';
import { useLastRoom, useProfile } from './store.js';
import { APP_VERSION, UPDATES } from './updates.js';
import JoinByCode from './JoinByCode.jsx';
import { usePublicRooms } from './publicas.js';

function GameCard({ game, onPlay }) {
  return (
    <article className="tf-game-card" style={{ '--chip-color': game.color, '--chip-on': game.onColor }}>
      <button type="button" className="tf-game-card-hit" onClick={onPlay} aria-label={`Jugar ${game.title}`} />
      <div className="tf-game-card-art" aria-hidden="true">
        <span className="tf-game-card-emoji">{game.emoji}</span>
        {game.badge && <em className="tf-badge tf-badge-float">{game.badge}</em>}
      </div>
      <div className="tf-game-card-body">
        <p className="tf-eyebrow">{game.tagline}</p>
        <h3>{game.title}</h3>
        <p className="tf-game-card-text">{game.description}</p>
        <ul className="tf-chips">
          <li>👥 {game.players}</li>
          <li>⏱ {game.duration}</li>
        </ul>
        <span className="tf-btn tf-btn-primary tf-game-card-cta" aria-hidden="true">
          Jugar
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </article>
  );
}

// Salas que alguien marcó como públicas: se entra con un clic, sin el código.
function PublicRooms({ onNavigate }) {
  const rooms = usePublicRooms();
  // Primero las que esperan jugadores; después las que ya están jugando.
  const listed = (rooms || []).filter((r) => gameById(r.game)).sort((a, b) => Number(Boolean(a.playing)) - Number(Boolean(b.playing)));
  const waiting = listed.filter((r) => !r.playing).length;
  return (
    <section className="tf-section" aria-labelledby="tf-salas">
      <div className="tf-section-head">
        <h2 id="tf-salas">Salas abiertas</h2>
        <p>{rooms === null ? 'Buscando salas…' : listed.length ? [waiting && `${waiting} esperando jugadores`, listed.length - waiting && `${listed.length - waiting} en curso`].filter(Boolean).join(' · ') : 'Ahora no hay ninguna.'}</p>
      </div>
      {listed.length ? (
        <ul className="tf-rooms" data-public-rooms>
          {listed.map((r) => {
            const game = gameById(r.game);
            return (
              <li key={r.code}>
                <button type="button" className={`tf-room${r.playing ? ' is-playing' : ''}`} style={{ '--chip-color': game.color }} data-room={r.code} onClick={() => onNavigate(r.game, r.code)}>
                  <span className="tf-room-emoji" aria-hidden="true">{game.emoji}</span>
                  <span className="tf-room-info">
                    <strong>{game.title}</strong>
                    <small>{r.host ? `Sala de ${r.host}` : 'Sala'} · {r.code}</small>
                    {r.playing && <span className="tf-room-live">En curso</span>}
                  </span>
                  <span className="tf-room-players">👥 {r.players}{r.max ? `/${r.max}` : ''}</span>
                  <em>Entrar</em>
                </button>
              </li>
            );
          })}
        </ul>
      ) : rooms !== null && (
        <p className="tf-rooms-empty">Creá una sala, marcala como <strong>pública</strong> y va a aparecer acá para que entre cualquiera.</p>
      )}
    </section>
  );
}

export default function Home({ onNavigate }) {
  const profile = useProfile();
  const room = useLastRoom();
  const latest = UPDATES.find((u) => u.latest) || UPDATES[0];
  const roomGame = room && gameById(room.game);
  const firstName = profile.name.split(' ')[0];

  return (
    <div className="tf-page tf-home">
      <section className="tf-hero">
        <div className="tf-hero-copy">
          <p className="tf-eyebrow">Juegos para jugar con los del fondo</p>
          <h1>
            {firstName ? <>Hola, {firstName}.<br /></> : null}
            <span className="tf-hero-highlight">¿A qué jugamos hoy?</span>
          </h1>
          <p className="tf-hero-text">
            Armá una sala, pasá el código y jueguen cada uno desde su pantalla. Gratis, sin cuentas y sin instalar nada.
          </p>
        </div>
        <div className="tf-hero-card">
          {room ? (
            <>
              <p className="tf-hero-card-label">Tenés una partida abierta</p>
              <button type="button" className="tf-resume" style={{ '--chip-color': roomGame?.color }} onClick={() => onNavigate(room.game, room.code)}>
                <span aria-hidden="true">{roomGame?.emoji}</span>
                <span><strong>{roomGame?.title}</strong><small>Sala {room.code}</small></span>
                <em>Volver</em>
              </button>
              <p className="tf-hero-card-label">¿O te pasaron otro código?</p>
            </>
          ) : (
            <p className="tf-hero-card-label">¿Te pasaron un código?</p>
          )}
          <JoinByCode onJoined={(game, code) => onNavigate(game, code)} />
          <p className="tf-hint">El código tiene 4 letras y aparece arriba en la pantalla de quien creó la sala.</p>
        </div>
      </section>

      <PublicRooms onNavigate={onNavigate} />

      <section className="tf-section" aria-labelledby="tf-juegos">
        <div className="tf-section-head">
          <h2 id="tf-juegos">Elegí un juego</h2>
          <p>{GAMES.length} juegos multijugador, todos online.</p>
        </div>
        <div className="tf-game-grid">
          {GAMES.map((g) => <GameCard key={g.id} game={g} onPlay={() => onNavigate(g.id)} />)}
        </div>
      </section>

      <section className="tf-section" aria-labelledby="tf-como">
        <div className="tf-section-head">
          <h2 id="tf-como">Cómo funciona</h2>
        </div>
        <ol className="tf-steps">
          <li><span className="tf-step-n">1</span><strong>Elegí un juego</strong><p>Y creá una sala con tu nombre.</p></li>
          <li><span className="tf-step-n">2</span><strong>Compartí el código</strong><p>Son 4 letras. También podés mandar el link.</p></li>
          <li><span className="tf-step-n">3</span><strong>Jueguen</strong><p>Cada uno desde su celu o compu, en tiempo real.</p></li>
        </ol>
      </section>

      {latest && (
        <section className="tf-section">
          <div className="tf-news-card">
            <div>
              <p className="tf-eyebrow">Última novedad · {APP_VERSION}</p>
              <h3>{latest.title}</h3>
              <ul>{latest.notes.slice(0, 3).map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      <footer className="tf-footer">
        <span>Tareas Fondeanas · {APP_VERSION}</span>
        <span>Hecho por Nicolas Cukier, Uriel Suti y Alan Vitas</span>
      </footer>
    </div>
  );
}
